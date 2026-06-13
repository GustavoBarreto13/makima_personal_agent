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

O padrão de autenticação (`_get_service`) é idêntico ao do servidor MCP,
reaproveitando as mesmas variáveis de ambiente.

Usage:
    >>> from agents.kaguya.gcal import list_events, create_event
    >>> eventos = list_events("2026-06-13", "2026-06-13")
    >>> print(eventos)
"""

import os
from datetime import datetime, timezone
from typing import Optional

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

# Cache do cliente da Google Calendar API (objeto de sessão HTTP reutilizável)
_service = None

# Cache das credenciais OAuth2 (token de acesso + refresh token)
_cached_creds: Optional[Credentials] = None

# Cache do ID do calendário "Kaguya — Tarefas" — evita buscar na API toda vez
_kaguya_calendar_id: Optional[str] = None

# Nome fixo do calendário dedicado ao espelho de tarefas do Kaguya
_KAGUYA_CALENDAR_NAME = "Kaguya — Tarefas"


# ---------------------------------------------------------------------------
# Autenticação
# ---------------------------------------------------------------------------

def _get_service():
    """Retorna o cliente da Google Calendar API, renovando o token se necessário.

    Usa o padrão de credenciais via variáveis de ambiente (sem arquivo JSON),
    idêntico ao servidor MCP em `mcp_servers/calendar/server.py`.

    Returns:
        O cliente (Resource) da Google Calendar API v3 pronto para uso.
    """
    global _service, _cached_creds

    # Inicializa as credenciais apenas na primeira chamada (lazy init)
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

    # Renova o access token se estiver expirado ou inválido
    # (google-auth verifica a expiração automaticamente em _cached_creds.valid)
    if not _cached_creds.valid:
        _cached_creds.refresh(Request())
        # Invalida o cliente atual — ele foi construído com o token antigo
        _service = None

    # Constrói o cliente da API apenas se ainda não existe ou foi invalidado
    if _service is None:
        # cache_discovery=False evita warning de arquivo deprecado em versões recentes
        _service = build("calendar", "v3", credentials=_cached_creds, cache_discovery=False)

    return _service


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

    Example:
        >>> cals = list_calendars()
        >>> [c["name"] for c in cals]
        ['Gustavo', 'Kaguya — Tarefas', 'Feriados no Brasil']
    """
    service = _get_service()

    # ID do calendário principal — definido via env var no deploy
    main_id = os.environ.get("GOOGLE_CALENDAR_MAIN_CALENDAR_ID", "")

    result = service.calendarList().list().execute()
    calendars = result.get("items", [])

    return [
        {
            "id": cal["id"],
            "name": cal.get("summary", ""),
            "role": cal.get("accessRole", ""),
            # True se este for o calendário marcado como "principal" nas env vars
            "is_main": cal["id"] == main_id,
            # True se este for o espelho de tarefas do Kaguya
            "is_kaguya": cal.get("summary", "") == _KAGUYA_CALENDAR_NAME,
        }
        for cal in calendars
    ]


# ---------------------------------------------------------------------------
# Listagem de eventos (fan-out em todos os calendários)
# ---------------------------------------------------------------------------

def list_events(
    date_from: str,
    date_to: str,
    exclude: tuple[str, ...] = ("Kaguya — Tarefas", "TickTick"),
) -> list[dict]:
    """Lista eventos de TODOS os calendários do usuário num intervalo de datas.

    Faz um fan-out paralelo-sequencial: busca em cada calendário individualmente
    e agrega os resultados. Calendários com erro são ignorados silenciosamente
    (best-effort) — um calendário sem permissão não deve quebrar os demais.

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
        Ordenada por calendário (ordem retornada pela API).

    Example:
        >>> eventos = list_events("2026-06-13", "2026-06-13")
        >>> [e["summary"] for e in eventos]
        ['Reunião de equipe', 'Almoço com João']
    """
    service = _get_service()

    # Delimita o intervalo em horário local de São Paulo (UTC-3)
    # A API aceita RFC3339 com offset de fuso horário
    time_min = f"{date_from}T00:00:00-03:00"
    time_max = f"{date_to}T23:59:59-03:00"

    # Busca a lista completa de calendários do usuário
    cal_result = service.calendarList().list().execute()
    calendars = cal_result.get("items", [])

    all_events: list[dict] = []

    for cal in calendars:
        cal_id = cal["id"]
        cal_name = cal.get("summary", cal_id)

        # Pula calendários na lista de exclusão — anti-duplicação
        if cal_name in exclude:
            continue

        try:
            result = service.events().list(
                calendarId=cal_id,
                timeMin=time_min,
                timeMax=time_max,
                maxResults=250,      # valor alto para não perder eventos em dias cheios
                singleEvents=True,   # expande eventos recorrentes em instâncias individuais
                orderBy="startTime",
            ).execute()

            events = result.get("items", [])
            for event in events:
                # Normaliza o evento e adiciona identificação do calendário de origem
                formatted = _format_event(event)
                formatted["calendar_id"] = cal_id
                formatted["calendar_name"] = cal_name
                all_events.append(formatted)

        except Exception:
            # Calendário sem permissão de leitura ou com erro temporário —
            # ignora silenciosamente para não quebrar os demais resultados
            pass

    return all_events


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

    Busca o evento atual, aplica apenas os campos fornecidos e envia de volta
    (update completo, não patch — garante consistência com campos derivados).

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
        ... )
    """
    service = _get_service()

    # Busca o estado atual do evento antes de aplicar as mudanças.
    # Isso é necessário porque a API update() exige o corpo completo do evento
    # (diferente do patch() que aceita apenas os campos alterados).
    existing = service.events().get(calendarId=calendar_id, eventId=event_id).execute()

    # Determina se o evento resultante será de dia inteiro
    # (pode vir de `fields` ou do estado atual do evento)
    all_day = fields.get("all_day", "date" in existing.get("start", {}))

    # Aplica os campos informados — campos ausentes mantêm o valor atual
    if "summary" in fields and fields["summary"] is not None:
        existing["summary"] = fields["summary"]

    if "description" in fields and fields["description"] is not None:
        existing["description"] = fields["description"]

    if "location" in fields and fields["location"] is not None:
        existing["location"] = fields["location"]

    # Atualiza start se informado, respeitando o tipo de evento (com/sem hora)
    if "start" in fields and fields["start"] is not None:
        if all_day:
            existing["start"] = {"date": fields["start"][:10]}
        else:
            existing["start"] = {"dateTime": fields["start"], "timeZone": "America/Sao_Paulo"}

    # Atualiza end se informado, respeitando o tipo de evento
    if "end" in fields and fields["end"] is not None:
        if all_day:
            existing["end"] = {"date": fields["end"][:10]}
        else:
            existing["end"] = {"dateTime": fields["end"], "timeZone": "America/Sao_Paulo"}

    updated = service.events().update(
        calendarId=calendar_id,
        eventId=event_id,
        body=existing,
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
        (list_events) porque o evento em si não carrega essa informação de forma confiável.
    """
    # Os campos start/end podem ter "dateTime" (evento com hora) ou "date" (dia inteiro)
    start = event.get("start", {})
    end = event.get("end", {})

    return {
        "id": event.get("id", ""),
        "summary": event.get("summary", "(sem título)"),
        # Prefere dateTime (com hora) sobre date (dia inteiro)
        "start": start.get("dateTime", start.get("date", "")),
        "end": end.get("dateTime", end.get("date", "")),
        "description": event.get("description", ""),
        "location": event.get("location", ""),
        # Lista de e-mails dos convidados (pode ser vazia)
        "attendees": [a.get("email", "") for a in event.get("attendees", [])],
        "link": event.get("htmlLink", ""),
    }
