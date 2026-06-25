"""Cliente Google Calendar compartilhado — importável por Python (não-MCP).

Propósito
---------
O servidor MCP em `mcp_servers/calendar/server.py` roda como processo filho do ADK
(protocolo stdio) e **não pode ser importado** diretamente pelo webapp ou por outros
módulos Python — o protocolo MCP é inter-processos, não uma API Python.

Este módulo resolve esse problema expondo as mesmas operações de calendário como
funções Python puras, importáveis de qualquer lugar no projeto:

- `webapp/` (backend FastAPI) — para exibir e criar eventos via API REST
- `agents/kaguya/gcal_sync.py` — para espelhar tarefas no calendário "Kaguya — Tarefas"

Thread-safety
-------------
`_get_service()` é **thread-safe**:

- As credenciais OAuth2 (`_cached_creds`) são compartilhadas entre threads e acessadas
  somente sob `_auth_lock` quando há mutação (inicialização ou refresh).
- O cliente da API (`Resource`) é armazenado em `_local` (threading.local) — um por thread —
  porque `httplib2.Http` não é thread-safe. Cada thread constrói o seu de forma lazy.

Isso permite que `gcal_sync.py` dispare o push em um worker thread sem corrida de dados,
e que `list_events()` faça fan-out paralelo em múltiplas threads.

Usage:
    >>> from agents.kaguya.gcal import list_events, create_event
    >>> eventos = list_events("2026-06-13", "2026-06-13")
    >>> print(eventos)
"""

import os
import threading
import time as _time             # aliasado para evitar colisão com variáveis locais chamadas 'time'
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from typing import Optional

# Fuso horário de Brasília (UTC-3). Usado para normalizar todos os datetimes
# retornados pela Google Calendar API antes de enviá-los ao frontend.
_BRT = timezone(timedelta(hours=-3))

# Biblioteca oficial do Google para autenticação OAuth2
from google.oauth2.credentials import Credentials
# Necessário para renovar o access token usando o refresh token
from google.auth.transport.requests import Request
# Constrói o cliente da Google Calendar API v3
from googleapiclient.discovery import build


# ---------------------------------------------------------------------------
# Cache em nível de módulo — persiste enquanto o processo estiver ativo.
# Isso evita chamar a API de autenticação desnecessariamente a cada requisição.
# ---------------------------------------------------------------------------

# Escopo OAuth: leitura + escrita (necessário para criar o calendário Kaguya)
_SCOPES = ["https://www.googleapis.com/auth/calendar"]

# Thread-local: armazena um cliente Resource por thread.
# httplib2.Http (usado internamente pelo googleapiclient) não é thread-safe;
# um cliente por thread evita corridas de dados quando list_events() faz
# fan-out paralelo ou quando gcal_sync dispara push em background.
_local = threading.local()

# Lock que protege a inicialização e o refresh das credenciais OAuth2.
# O refresh modifica _cached_creds — o lock impede que duas threads refrequem
# simultaneamente e corrompam o objeto de credenciais.
_auth_lock = threading.Lock()

# Cache das credenciais OAuth2 (token de acesso + refresh token).
# Compartilhado entre threads; acessado somente sob _auth_lock quando há mutação.
_cached_creds: Optional[Credentials] = None

# Cache do ID do calendário "Kaguya — Tarefas" — evita buscar na API toda vez
_kaguya_calendar_id: Optional[str] = None

# Nome fixo do calendário dedicado ao espelho de tarefas do Kaguya
_KAGUYA_CALENDAR_NAME = "Kaguya — Tarefas"


# ---------------------------------------------------------------------------
# Cache de listagem de calendários e eventos
# ---------------------------------------------------------------------------
# Estratégia: armazenamos os resultados em variáveis de módulo com TTL (tempo de vida).
# Enquanto o cache for válido, as funções devolvem os dados sem bater na API do Google.
# Quando expira, buscamos dados frescos e atualizamos o cache.
#
# Por que aqui (módulo) e não no Redis/banco?
# Porque o processo do webapp já fica em memória — é o lugar mais rápido e sem dependência
# de infra extra. O cache é local ao processo; um restart do container limpa tudo (aceitável).
# ---------------------------------------------------------------------------

# Guarda a lista de calendários retornada pela última chamada bem-sucedida à API.
# Reutilizada enquanto não expirar — ou se a API falhar (serve-stale-on-error, veja abaixo).
_calendars_cache: list[dict] = []
_calendars_cache_ts: float = 0.0      # timestamp monotônico da última atualização
_CALENDARS_TTL: float = 300.0         # 5 minutos — calendários mudam raramente

# Cache de eventos por janela de datas.
# Chave: tupla (date_from, date_to) → valor: (lista_de_eventos, timestamp)
# TTL de 60s: defasagem máxima de ~1 minuto para mudanças feitas FORA do app.
# Mudanças feitas DENTRO do app chamam invalidate_events_cache() para zerar o cache na hora.
_events_cache: dict[tuple[str, str], tuple[list[dict], float]] = {}
_EVENTS_TTL: float = 60.0


# ---------------------------------------------------------------------------
# Autenticação
# ---------------------------------------------------------------------------

def _get_service():
    """Retorna o cliente da Google Calendar API, renovando o token se necessário.

    Thread-safe: credenciais são compartilhadas e protegidas por ``_auth_lock``;
    o cliente (Resource) é armazenado em ``_local`` (threading.local) — um por thread.
    Isso permite chamadas concorrentes a partir de worker threads sem corrida de dados.

    Returns:
        O cliente (Resource) da Google Calendar API v3 pronto para uso.
    """
    global _cached_creds

    # Seção crítica: inicialização e refresh das credenciais compartilhadas.
    # Duas threads nunca entram aqui ao mesmo tempo, evitando double-refresh.
    with _auth_lock:
        if _cached_creds is None:
            # Lê todas as variáveis de ambiente necessárias para autenticação OAuth2
            access_token = os.environ.get("GOOGLE_CALENDAR_ACCESS_TOKEN", "")
            refresh_token = os.environ.get("GOOGLE_CALENDAR_REFRESH_TOKEN", "")
            client_id = os.environ.get("GOOGLE_CALENDAR_CLIENT_ID", "")
            client_secret = os.environ.get("GOOGLE_CALENDAR_CLIENT_SECRET", "")
            token_expiry_str = os.environ.get("GOOGLE_CALENDAR_TOKEN_EXPIRY", "")

            # Converte a string de expiração para datetime naive UTC.
            # google-auth compara internamente com datetime.utcnow() (offset-naive),
            # então passar um datetime aware causaria "can't compare offset-naive and
            # offset-aware datetimes". Por isso convertemos para UTC e removemos o tzinfo.
            token_expiry = None
            if token_expiry_str:
                try:
                    token_expiry = datetime.fromisoformat(token_expiry_str)
                    if token_expiry.tzinfo is not None:
                        # Converte para UTC e remove o timezone (torna naive)
                        token_expiry = token_expiry.astimezone(timezone.utc).replace(tzinfo=None)
                except ValueError:
                    # Ignora string de expiração inválida — o token será renovado naturalmente
                    pass

            # Monta o objeto de credenciais com todos os campos necessários para o refresh
            _cached_creds = Credentials(
                token=access_token,
                refresh_token=refresh_token,
                client_id=client_id,
                client_secret=client_secret,
                token_uri="https://oauth2.googleapis.com/token",
                scopes=_SCOPES,
                expiry=token_expiry,
            )

        # Renova o access token se estiver expirado ou inválido.
        # A renovação modifica _cached_creds — feita sob o lock para evitar corridas.
        # Após o refresh, os clientes de outras threads que já existem referenciam o mesmo
        # _cached_creds e usarão o token novo automaticamente na próxima requisição HTTP.
        if not _cached_creds.valid:
            _cached_creds.refresh(Request())
            # Invalida o cliente desta thread para forçar rebuild com token fresco.
            _local.service = None

    # Constrói o cliente desta thread se ainda não existe ou foi invalidado.
    # build() com cache_discovery=False não faz chamada de rede — custo desprezível.
    if not getattr(_local, "service", None):
        _local.service = build("calendar", "v3", credentials=_cached_creds, cache_discovery=False)

    return _local.service


# ---------------------------------------------------------------------------
# Calendário dedicado do Kaguya
# ---------------------------------------------------------------------------

def ensure_kaguya_calendar() -> str:
    """Garante que o calendário "Kaguya — Tarefas" existe e retorna seu ID.

    Busca o calendário na lista do usuário. Se não existir, cria um novo.
    O resultado é cacheado em `_kaguya_calendar_id` para evitar chamadas
    repetidas à API durante a mesma execução do processo.

    Esta função é idempotente: chamadas repetidas nunca criam duplicatas —
    se o cache for limpo, a função re-busca na API antes de criar.

    Returns:
        O ID do calendário "Kaguya — Tarefas" (string opaca do Google).

    Example:
        >>> cal_id = ensure_kaguya_calendar()
        >>> print(cal_id)  # ex: "abc123...@group.calendar.google.com"
    """
    global _kaguya_calendar_id

    # Retorna o ID cacheado se já foi resolvido nesta sessão
    if _kaguya_calendar_id is not None:
        return _kaguya_calendar_id

    service = _get_service()

    # Percorre a lista de calendários do usuário para encontrar o Kaguya
    result = service.calendarList().list().execute()
    calendars = result.get("items", [])

    for cal in calendars:
        # Compara pelo nome exato — case-sensitive, conforme o nome canônico definido
        if cal.get("summary", "") == _KAGUYA_CALENDAR_NAME:
            # Calendário encontrado — cacheia e retorna
            _kaguya_calendar_id = cal["id"]
            return _kaguya_calendar_id

    # Calendário não encontrado — cria um novo.
    # Isso acontece apenas na primeira execução após o deploy ou se o calendário
    # foi apagado manualmente pelo usuário.
    new_calendar = service.calendars().insert(body={
        "summary": _KAGUYA_CALENDAR_NAME,
        # description aparece nos detalhes do calendário no Google Calendar
        "description": "Espelho automático das tarefas gerenciadas pelo agente Kaguya.",
        # Fuso horário do usuário — garante que eventos "sem hora" apareçam corretamente
        "timeZone": "America/Sao_Paulo",
    }).execute()

    _kaguya_calendar_id = new_calendar["id"]
    return _kaguya_calendar_id


# ---------------------------------------------------------------------------
# Listagem de calendários
# ---------------------------------------------------------------------------

def list_calendars() -> list[dict]:
    """Lista todos os calendários disponíveis na conta Google do usuário.

    Resultados são cacheados por 5 minutos (TTL 300s) — calendários mudam raramente,
    então ir à API do Google a cada requisição seria desperdício. O cache persiste
    na memória do processo enquanto o container estiver ativo.

    Serve-stale-on-error: se a chamada ao Google falhar (hiccup temporário, expiração
    de token, etc.) mas houver um cache anterior (mesmo expirado), devolve os dados
    antigos em vez de propagar o erro. Isso evita que a sidebar do calendário fique
    em branco por uma falha transitória da API.

    Enriquece cada entrada com flags `is_main` e `is_kaguya` para facilitar
    a identificação no webapp e no gcal_sync.

    Returns:
        Lista de dicts com os campos:
            - id (str): ID opaco do calendário no Google.
            - name (str): Nome visível do calendário.
            - role (str): Papel do usuário (ex: "owner", "reader").
            - is_main (bool): True se for o calendário principal configurado
              em GOOGLE_CALENDAR_MAIN_CALENDAR_ID.
            - is_kaguya (bool): True se for o calendário "Kaguya — Tarefas".
            - bg_color (str | None): Cor de fundo no Google Calendar (hex).
            - writable (bool): True se o usuário tem permissão de escrita.

    Example:
        >>> cals = list_calendars()
        >>> [c["name"] for c in cals]
        ['Gustavo', 'Kaguya — Tarefas', 'Feriados no Brasil']
    """
    global _calendars_cache, _calendars_cache_ts

    # Verifica se o cache ainda está dentro do TTL (5 minutos)
    agora = _time.monotonic()
    if _calendars_cache and (agora - _calendars_cache_ts) < _CALENDARS_TTL:
        # Cache válido — retorna sem chamar a API do Google
        return _calendars_cache

    # ID do calendário principal — definido via env var no deploy
    main_id = os.environ.get("GOOGLE_CALENDAR_MAIN_CALENDAR_ID", "")

    try:
        service = _get_service()
        result = service.calendarList().list().execute()
        calendars = result.get("items", [])

        # Monta a lista normalizada com os campos que o webapp e o gcal_sync consomem
        fresh = [
            {
                "id": cal["id"],
                "name": cal.get("summary", ""),
                "role": cal.get("accessRole", ""),
                # True se este for o calendário marcado como "principal" nas env vars
                "is_main": cal["id"] == main_id,
                # True se este for o espelho de tarefas do Kaguya
                "is_kaguya": cal.get("summary", "") == _KAGUYA_CALENDAR_NAME,
                # Cor de fundo nativa do Google Calendar (hex, ex.: "#4285F4")
                "bg_color": cal.get("backgroundColor"),
                # True se o usuário tem permissão de escrita (owner ou writer)
                "writable": cal.get("accessRole") in ("owner", "writer"),
            }
            for cal in calendars
        ]

        # Atualiza o cache somente em caso de sucesso (dados frescos)
        _calendars_cache = fresh
        _calendars_cache_ts = agora
        return _calendars_cache

    except Exception:
        # Serve-stale-on-error: se houver cache anterior (mesmo expirado), devolve
        # em vez de propagar o erro. Evita que a sidebar esvazie num hiccup do Google.
        if _calendars_cache:
            return _calendars_cache
        # Sem nenhum cache — propaga o erro para que o chamador possa tratá-lo
        raise


# ---------------------------------------------------------------------------
# Listagem de eventos (fan-out paralelo em todos os calendários)
# ---------------------------------------------------------------------------

def _fetch_cal_events(cal: dict, time_min: str, time_max: str) -> list[dict]:
    """Busca eventos de um calendário individual (executado em worker thread).

    Cada worker chama `_get_service()` para obter o cliente thread-local, evitando
    corrida de dados no httplib2.Http subjacente.

    Args:
        cal: Dict normalizado retornado por `list_calendars()` (campos "id" e "name").
        time_min: Limite inferior da janela em RFC3339 com offset de fuso.
        time_max: Limite superior da janela em RFC3339 com offset de fuso.

    Returns:
        Lista de eventos normalizados (via `_format_event`) com campos adicionais
        calendar_id e calendar_name. Lista vazia em caso de erro (ex.: sem permissão).
    """
    try:
        svc = _get_service()  # thread-local — seguro chamar concorrentemente
        result = svc.events().list(
            calendarId=cal["id"],
            timeMin=time_min,
            timeMax=time_max,
            maxResults=250,      # valor alto para não perder eventos em dias cheios
            singleEvents=True,   # expande eventos recorrentes em instâncias individuais
            orderBy="startTime",
        ).execute()
        items = result.get("items", [])
        out = []
        for event in items:
            formatted = _format_event(event)
            formatted["calendar_id"] = cal["id"]
            formatted["calendar_name"] = cal["name"]
            out.append(formatted)
        return out
    except Exception:
        # Calendário sem permissão de leitura ou com erro temporário —
        # ignora silenciosamente para não quebrar os demais resultados
        return []


def list_events(
    date_from: str,
    date_to: str,
    exclude: tuple[str, ...] = ("Kaguya — Tarefas", "TickTick"),
) -> list[dict]:
    """Lista eventos de TODOS os calendários do usuário num intervalo de datas.

    Resultados são cacheados por 60s (TTL 60s): mudanças feitas FORA do app levam
    no máximo ~1 minuto para aparecer; mudanças feitas DENTRO do app invalidam o
    cache imediatamente via ``invalidate_events_cache()``.

    Fan-out paralelo: em vez de chamar a API de cada calendário em série, dispara
    todas as requisições ao mesmo tempo usando ``ThreadPoolExecutor``. Isso reduz o
    tempo de carregamento de O(N × latência_Google) para ~O(latência_Google) quando o
    cache expira. A ordem dos calendários é preservada (``pool.map`` mantém a ordem).

    Reutiliza ``list_calendars()`` (que também tem cache próprio de 5 min) em vez
    de chamar ``calendarList().list()`` separadamente — elimina a chamada duplicada
    que existia na implementação anterior.

    Calendários listados em `exclude` são pulados para evitar duplicatas:
    - "Kaguya — Tarefas": já está representado nas tarefas do sistema
    - "TickTick": sincronização externa que duplicaria eventos do usuário

    Args:
        date_from: Data de início no formato YYYY-MM-DD.
        date_to: Data de fim no formato YYYY-MM-DD (inclusive).
        exclude: Tuple com nomes de calendários a ignorar. Padrão exclui o
            espelho do Kaguya e o TickTick para evitar duplicatas na view.

    Returns:
        Lista de dicts normalizados (via `_format_event`) com campos adicionais:
            - calendar_id (str): ID do calendário de origem.
            - calendar_name (str): Nome do calendário de origem.
        Ordenada por calendário (ordem retornada por list_calendars).

    Example:
        >>> eventos = list_events("2026-06-13", "2026-06-13")
        >>> [e["summary"] for e in eventos]
        ['Reunião de equipe', 'Almoço com João']
    """
    global _events_cache

    # Verifica se há resultado cacheado dentro do TTL (60s)
    cache_key = (date_from, date_to)
    agora = _time.monotonic()
    cached = _events_cache.get(cache_key)
    if cached is not None:
        eventos_cache, ts = cached
        if (agora - ts) < _EVENTS_TTL:
            # Cache válido — retorna sem chamar a API do Google
            return eventos_cache

    # Delimita o intervalo em horário local de São Paulo (UTC-3)
    # A API aceita RFC3339 com offset de fuso horário
    time_min = f"{date_from}T00:00:00-03:00"
    time_max = f"{date_to}T23:59:59-03:00"

    # Reutiliza list_calendars() em vez de chamar calendarList().list() de novo.
    # Isso aproveita o cache de calendários (TTL 300s).
    calendarios = list_calendars()

    # Filtra os calendários excluídos antecipadamente (antes do fan-out)
    active_cals = [c for c in calendarios if c["name"] not in exclude]

    if not active_cals:
        _events_cache[cache_key] = ([], agora)
        return []

    # Fan-out paralelo: dispara todas as leituras simultaneamente.
    # pool.map preserva a ordem dos calendários nos resultados.
    # max_workers=min(N, 8) evita saturar a API em contas com muitos calendários.
    with ThreadPoolExecutor(max_workers=min(len(active_cals), 8)) as pool:
        per_cal: list[list[dict]] = list(
            pool.map(lambda cal: _fetch_cal_events(cal, time_min, time_max), active_cals)
        )

    # Achata a lista de listas preservando a ordem dos calendários
    all_events: list[dict] = [ev for group in per_cal for ev in group]

    # Armazena no cache — somente em caso de sucesso (mesmo lista vazia é armazenada)
    _events_cache[cache_key] = (all_events, agora)
    return all_events


def invalidate_events_cache() -> None:
    """Limpa o cache de eventos, forçando dados frescos na próxima chamada.

    Deve ser chamada sempre que um evento for criado, editado ou excluído DENTRO
    do app, para que a mudança apareça imediatamente no próximo carregamento.
    Não afeta o cache de calendários (list_calendars), que tem TTL próprio.

    Example:
        >>> invalidate_events_cache()  # chamado pelas rotas POST/PATCH/DELETE de eventos
    """
    global _events_cache
    # Apaga todas as entradas — a próxima chamada a list_events() buscará dados frescos
    _events_cache.clear()


# ---------------------------------------------------------------------------
# Criação de evento
# ---------------------------------------------------------------------------

def create_event(
    calendar_id: str,
    summary: str,
    start: str,
    end: str,
    all_day: bool = False,
    description: str = "",
    location: str = "",
) -> dict:
    """Cria um novo evento num calendário específico.

    Suporta eventos com hora definida (dateTime) e eventos de dia inteiro (date).
    Para o espelho de tarefas do Kaguya, usar `calendar_id = ensure_kaguya_calendar()`.

    Args:
        calendar_id: ID do calendário onde o evento será criado.
        summary: Título do evento.
        start: Data/hora de início em ISO 8601 (ex: "2026-06-13T10:00:00").
            Para eventos de dia inteiro, pode ser só a data ("2026-06-13").
        end: Data/hora de fim em ISO 8601.
        all_day: Se True, cria evento de dia inteiro (ignora a hora, usa só a data).
        description: Descrição opcional do evento.
        location: Local opcional do evento.

    Returns:
        Dict com:
            - id (str): ID do evento criado.
            - summary (str): Título confirmado pelo Google.
            - link (str): URL para abrir o evento no Google Calendar.

    Example:
        >>> ev = create_event(
        ...     calendar_id="primary",
        ...     summary="Reunião de planejamento",
        ...     start="2026-06-13T14:00:00",
        ...     end="2026-06-13T15:00:00",
        ... )
        >>> print(ev["link"])
    """
    service = _get_service()

    # Monta os campos de data/hora conforme o tipo de evento:
    # - Evento com hora: usa "dateTime" + fuso horário explícito
    # - Evento de dia inteiro: usa "date" com apenas a data (sem hora)
    if all_day:
        # A API exige apenas a data no formato YYYY-MM-DD para eventos de dia inteiro
        start_field = {"date": start[:10]}
        end_field = {"date": end[:10]}
    else:
        # Inclui o fuso horário para que o Google não interprete como UTC
        start_field = {"dateTime": start, "timeZone": "America/Sao_Paulo"}
        end_field = {"dateTime": end, "timeZone": "America/Sao_Paulo"}

    # Monta o corpo da requisição — campos opcionais só são incluídos se informados
    event_body: dict = {
        "summary": summary,
        "start": start_field,
        "end": end_field,
    }
    if description:
        event_body["description"] = description
    if location:
        event_body["location"] = location

    created = service.events().insert(calendarId=calendar_id, body=event_body).execute()

    return {
        "id": created["id"],
        "summary": created.get("summary", summary),
        "link": created.get("htmlLink", ""),
    }


# ---------------------------------------------------------------------------
# Atualização de evento
# ---------------------------------------------------------------------------

def update_event(
    calendar_id: str,
    event_id: str,
    **fields,
) -> dict:
    """Atualiza campos de um evento existente num calendário específico.

    Fast-path (sem GET): quando `all_day` é passado explicitamente em `fields`,
    o tipo do evento é conhecido e usamos ``events().patch()`` direto — metade dos
    round-trips em relação ao ``update()`` completo anterior. O `gcal_sync` sempre
    passa `all_day`, então o push de tarefa nunca faz o GET desnecessário.

    Fallback (com GET): quando `all_day` não é passado (ex.: webapp edita só o
    título sem saber o tipo), buscamos o evento atual para descobrir o tipo correto,
    depois aplicamos ``patch()``. Ainda um round-trip a menos que o ``update()``
    completo anterior (que fazia GET + update do corpo inteiro).

    Args:
        calendar_id: ID do calendário que contém o evento.
        event_id: ID do evento a atualizar (obtido via list_events ou create_event).
        **fields: Campos a atualizar. Campos aceitos:
            - summary (str): Novo título.
            - start (str): Nova data/hora de início em ISO 8601.
            - end (str): Nova data/hora de fim em ISO 8601.
            - all_day (bool): Se True, converte para evento de dia inteiro.
            - description (str): Nova descrição.
            - location (str): Novo local.

    Returns:
        Dict normalizado do evento atualizado (via `_format_event`).

    Example:
        >>> ev = update_event(
        ...     calendar_id="primary",
        ...     event_id="abc123",
        ...     summary="Reunião remarcada",
        ...     start="2026-06-14T10:00:00",
        ...     end="2026-06-14T11:00:00",
        ...     all_day=False,
        ... )
    """
    service = _get_service()

    # Determina o tipo do evento (com ou sem hora).
    # Fast-path: all_day passado explicitamente → sem GET extra.
    # Fallback: all_day ausente → GET para descobrir o tipo atual do evento.
    if "all_day" in fields:
        all_day = fields["all_day"]
    else:
        existing = service.events().get(calendarId=calendar_id, eventId=event_id).execute()
        all_day = "date" in existing.get("start", {})

    # Monta o body de patch apenas com os campos informados.
    # events().patch() aceita body parcial — só os campos presentes são alterados.
    patch_body: dict = {}

    if "summary" in fields and fields["summary"] is not None:
        patch_body["summary"] = fields["summary"]

    if "description" in fields and fields["description"] is not None:
        patch_body["description"] = fields["description"]

    if "location" in fields and fields["location"] is not None:
        patch_body["location"] = fields["location"]

    if "start" in fields and fields["start"] is not None:
        if all_day:
            patch_body["start"] = {"date": fields["start"][:10]}
        else:
            patch_body["start"] = {"dateTime": fields["start"], "timeZone": "America/Sao_Paulo"}

    if "end" in fields and fields["end"] is not None:
        if all_day:
            patch_body["end"] = {"date": fields["end"][:10]}
        else:
            patch_body["end"] = {"dateTime": fields["end"], "timeZone": "America/Sao_Paulo"}

    updated = service.events().patch(
        calendarId=calendar_id,
        eventId=event_id,
        body=patch_body,
    ).execute()

    return _format_event(updated)


# ---------------------------------------------------------------------------
# Exclusão de evento
# ---------------------------------------------------------------------------

def delete_event(calendar_id: str, event_id: str) -> dict:
    """Remove um evento de um calendário. Esta ação é irreversível.

    Args:
        calendar_id: ID do calendário que contém o evento.
        event_id: ID do evento a remover.

    Returns:
        Dict com:
            - status (str): Sempre "deleted" em caso de sucesso.
            - event_id (str): ID do evento removido (para confirmação).

    Example:
        >>> delete_event("primary", "abc123")
        {'status': 'deleted', 'event_id': 'abc123'}
    """
    service = _get_service()
    # A API retorna 204 No Content em caso de sucesso — nenhum body para processar
    service.events().delete(calendarId=calendar_id, eventId=event_id).execute()
    return {"status": "deleted", "event_id": event_id}


# ---------------------------------------------------------------------------
# Função auxiliar privada
# ---------------------------------------------------------------------------

def _to_brt(dt_str: str) -> str:
    """Converte uma string ISO 8601 dateTime para UTC-3 (horário de Brasília).

    O Google Calendar pode retornar datetimes em vários formatos:
    - "2026-06-15T13:00:00Z"          → UTC (sufixo "Z")
    - "2026-06-15T10:00:00-03:00"     → já em BRT
    - "2026-06-15T12:00:00+00:00"     → UTC com offset explícito

    O frontend extrai hora:minuto diretamente da string (split por ":"),
    então é essencial que todos os datetimes cheguem normalizados para UTC-3.

    Args:
        dt_str: String ISO 8601 com hora e offset. Strings sem "T" (datas de
                dia inteiro no formato YYYY-MM-DD) são devolvidas sem modificação.

    Returns:
        String ISO 8601 com offset "-03:00", ou a string original se for
        uma data sem hora ou se houver erro de parse.
    """
    # Datas de dia inteiro (formato "YYYY-MM-DD") não têm fuso — não converter
    if not dt_str or "T" not in dt_str:
        return dt_str
    try:
        # O sufixo "Z" é UTC puro; fromisoformat aceita "+00:00" mas não "Z" no Python 3.10-
        s = dt_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        # Se por algum motivo o datetime vier sem fuso, assume UTC
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        # Converte para BRT (UTC-3) e retorna como string ISO com offset
        return dt.astimezone(_BRT).isoformat()
    except ValueError:
        # Em caso de formato inesperado, devolve original sem quebrar
        return dt_str


def _format_event(event: dict) -> dict:
    """Normaliza um evento bruto da Google Calendar API para o formato padrão do projeto.

    Extrai apenas os campos relevantes e padroniza os campos de data/hora:
    - Eventos com hora: start/end são strings ISO 8601 com offset
    - Eventos de dia inteiro: start/end são strings no formato YYYY-MM-DD

    Args:
        event: Dict bruto retornado pela Google Calendar API v3.

    Returns:
        Dict normalizado com os campos: id, summary, start, end,
        description, location, attendees, link.
        Os campos calendar_id e calendar_name são adicionados pelo chamador
        (list_events / _fetch_cal_events) porque o evento em si não carrega
        essa informação de forma confiável.
    """
    # Os campos start/end podem ter "dateTime" (evento com hora) ou "date" (dia inteiro)
    start = event.get("start", {})
    end = event.get("end", {})

    return {
        "id": event.get("id", ""),
        "summary": event.get("summary", "(sem título)"),
        # Prefere dateTime (com hora) sobre date (dia inteiro); normaliza para UTC-3
        "start": _to_brt(start.get("dateTime", start.get("date", ""))),
        "end": _to_brt(end.get("dateTime", end.get("date", ""))),
        "description": event.get("description", ""),
        "location": event.get("location", ""),
        # Lista de e-mails dos convidados (pode ser vazia)
        "attendees": [a.get("email", "") for a in event.get("attendees", [])],
        "link": event.get("htmlLink", ""),
    }
