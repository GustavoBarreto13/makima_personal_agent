"""Agregador de calendários — Calendar Hub (fatia 019).

Coleta eventos de múltiplos provedores (Nami, Frieren, Violet, Akane, Google Calendar)
e os unifica em um único feed. Cada provedor é registrado uma vez na inicialização do
módulo. O Google Calendar **não** é registrado aqui para evitar duplicação — os eventos
do GCal são injetados separadamente pelos endpoints do webapp via `gcal.list_events()`.

Usage:
    >>> from agents.kaguya.calendar_hub import aggregate, list_sources
    >>> fontes = list_sources()          # lista todas as fontes registradas (com prefs)
    >>> resultado = aggregate("2026-06-01", "2026-06-30")  # agrega todos os provedores
    >>> resultado["items"]               # lista unificada de CalendarItem
"""

import importlib
import logging
from typing import Optional

# Logger para registrar erros de provedores sem quebrar o hub
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tipagem
# ---------------------------------------------------------------------------

# TypedDict não está disponível em runtime sem importar — importamos do typing
from typing import TypedDict


class CalendarItem(TypedDict, total=False):
    """Representa um item de calendário de qualquer provedor.

    O campo `total=False` significa que todos os campos são opcionais no TypedDict,
    pois provedores diferentes podem omitir campos que não fazem sentido para eles
    (ex.: um lançamento financeiro não tem `loc`).

    Attributes:
        cal: ID da fonte, ex.: "nami", "frieren", "violet", "akane", "gcal".
        date: Data no formato YYYY-MM-DD.
        start: ISO datetime se o evento tem horário específico; None se dia inteiro.
        end: ISO datetime de término; None se dia inteiro.
        all_day: True se o evento ocupa o dia inteiro sem horário específico.
        title: Texto de exibição do item.
        kind: Tipo semântico, ex.: "expense", "book-session", "journal-entry", "task".
        ref_id: ID do registro na fonte, para deep linking.
        deep_link: Caminho URL para a fonte (ex.: "/nami/...", "/books/...").
        color: Cor de exibição — string OKLCH ou hex — sobrepõe a cor padrão da fonte.
        loc: Localização, se aplicável (ex.: eventos de calendário com endereço).
    """

    cal: str
    date: str
    start: Optional[str]
    end: Optional[str]
    all_day: bool
    title: str
    kind: str
    ref_id: Optional[str]
    deep_link: Optional[str]
    color: Optional[str]
    loc: Optional[str]


# ---------------------------------------------------------------------------
# Registros internos do hub
# ---------------------------------------------------------------------------

# Mapa de source_id → dicionário SOURCE com metadados da fonte
_SOURCES: dict[str, dict] = {}

# Mapa de source_id → função provedora (start_date, end_date) -> list[CalendarItem]
_PROVIDERS: dict[str, callable] = {}


# ---------------------------------------------------------------------------
# Funções de registro
# ---------------------------------------------------------------------------


def register(source: dict, fn: callable) -> None:
    """Registra uma fonte de calendário e seu provedor de eventos.

    Usa `source["id"]` como chave nos dicionários internos. Chamadas duplicadas
    com o mesmo `id` sobrescrevem o registro anterior (útil para testes).

    Args:
        source: Dicionário com metadados da fonte. Campos esperados:
            - id: str — identificador único (ex.: "nami")
            - account: str — conta à qual pertence (ex.: "makima")
            - kind: str — "base" para fontes internas ou "integration" para externas
            - name: str — nome de exibição (ex.: "Nami · Finanças")
            - color: str — cor padrão em OKLCH (ex.: "oklch(0.70 0.17 52)")
        fn: Função callable com assinatura `(start_date: str, end_date: str) -> list[CalendarItem]`.
            Receberá datas no formato YYYY-MM-DD. Deve retornar lista vazia se não houver itens.

    Example:
        >>> register(
        ...     {"id": "minha_fonte", "account": "makima", "kind": "base",
        ...      "name": "Minha Fonte", "color": "oklch(0.70 0.17 52)"},
        ...     lambda start, end: []
        ... )
    """
    source_id = source["id"]
    # Armazena uma cópia para evitar mutação externa acidental
    _SOURCES[source_id] = dict(source)
    _PROVIDERS[source_id] = fn


# ---------------------------------------------------------------------------
# Helper de importação segura
# ---------------------------------------------------------------------------


def _try_import_provider(module_path: str, fn_name: str) -> callable:
    """Tenta importar um provedor de calendário; retorna provedor vazio se o módulo não existir.

    Usa `importlib` para importação dinâmica segura. Se o módulo ainda não existir
    (ex.: provider da Nami pendente de implementação em T017), degrada graciosamente
    retornando um lambda que sempre devolve lista vazia — o hub continua funcionando
    sem quebrar.

    Args:
        module_path: Caminho Python do módulo, ex.: "agents.nami.calendar_provider".
        fn_name: Nome da função a importar dentro do módulo, ex.: "get_calendar_items".

    Returns:
        A função importada, ou `lambda start_date, end_date: []` se o módulo/função
        não existir.

    Example:
        >>> fn = _try_import_provider("agents.nami.calendar_provider", "get_calendar_items")
        >>> fn("2026-06-01", "2026-06-30")  # retorna [] se módulo não existe
        []
    """
    try:
        # Tenta importar o módulo dinamicamente — não falha em ImportError aqui
        mod = importlib.import_module(module_path)
        # Busca a função pelo nome dentro do módulo importado
        return getattr(mod, fn_name)
    except (ImportError, AttributeError):
        # Módulo ainda não existe (fase de implementação em andamento) ou a função
        # tem nome diferente — degrada para provedor vazio sem travar o hub
        return lambda start_date, end_date: []


# ---------------------------------------------------------------------------
# Registro das 5 fontes no carregamento do módulo
# (executado uma vez quando calendar_hub é importado pela primeira vez)
# ---------------------------------------------------------------------------

# 1. Kaguya — Tarefas
# O provedor retorna [] porque as tarefas chegam via list_tasks_in_range() (endpoint
# separado). Registramos a fonte para que ela apareça em list_sources() e na sidebar.
register(
    {
        "id": "kaguya",
        "account": "makima",
        "kind": "base",
        "name": "Kaguya · Tarefas",
        # Azul médio — associado ao domínio de organização e agenda
        "color": "oklch(0.65 0.20 250)",
    },
    lambda start_date, end_date: [],  # tarefas chegam pelo endpoint /api/tasks/range
)

# 2. Nami — Finanças
# Importa o provedor real de agents/nami/calendar_provider.py (criado na fatia T017).
_nami_provider = _try_import_provider("agents.nami.calendar_provider", "list_calendar_events")
register(
    {
        "id": "nami",
        "account": "makima",
        "kind": "base",
        "name": "Nami · Finanças",
        # Laranja dourado — associado a dinheiro e finanças
        "color": "oklch(0.70 0.17 52)",
    },
    _nami_provider,
)

# 3. Frieren — Livros
# Importa o provedor real de agents/frieren/calendar_provider.py (criado na fatia T018).
_frieren_provider = _try_import_provider(
    "agents.frieren.calendar_provider", "list_calendar_events"
)
register(
    {
        "id": "frieren",
        "account": "makima",
        "kind": "base",
        "name": "Frieren · Livros",
        # Verde-azulado suave — associado a leitura e conhecimento
        "color": "oklch(0.72 0.10 184)",
    },
    _frieren_provider,
)

# 4. Violet — Diário
# Importa o provedor real de agents/journal/calendar_provider.py (criado na fatia T019).
_violet_provider = _try_import_provider(
    "agents.journal.calendar_provider", "list_calendar_events"
)
register(
    {
        "id": "violet",
        "account": "makima",
        "kind": "base",
        "name": "Violet · Diário",
        # Roxo-magenta — associado a reflexão e escrita pessoal
        "color": "oklch(0.58 0.16 300)",
    },
    _violet_provider,
)

# 5. Akane — Filmes (stub)
# agents/media/ está fora do escopo desta fatia. O provedor sempre retorna [].
# Registrado para aparecer na sidebar e ser configurável via prefs.
register(
    {
        "id": "akane",
        "account": "makima",
        "kind": "base",
        "name": "Akane · Filmes",
        # Vermelho-rosado — associado a entretenimento e cinema
        "color": "oklch(0.68 0.18 15)",
    },
    lambda start_date, end_date: [],  # stub: agents/media/ ainda não implementado
)


# ---------------------------------------------------------------------------
# Consultas públicas
# ---------------------------------------------------------------------------


def list_sources(with_prefs: bool = True) -> list[dict]:
    """Retorna todas as fontes registradas, opcionalmente com preferências do usuário.

    Quando `with_prefs=True`, carrega as preferências salvas na tabela `calendar_prefs`
    e mescla os campos `visible` e `color` sobre cada fonte. A cor das prefs sobrepõe
    a cor padrão da fonte. A ordenação segue a posição (`position`) das prefs quando
    disponível; fontes sem pref aparecem ao final na ordem de registro.

    Args:
        with_prefs: Se True (padrão), mescla preferências do banco. Se False, retorna
            os metadados brutos das fontes na ordem de registro.

    Returns:
        Lista de dicionários SOURCE com campos: id, account, kind, name, color, e
        (quando with_prefs=True) também: visible, position.

    Example:
        >>> list_sources(with_prefs=False)
        [{"id": "kaguya", "account": "makima", "kind": "base", ...}, ...]
    """
    if not with_prefs:
        # Retorna cópias para evitar que o chamador mute o estado interno do hub
        return [dict(s) for s in _SOURCES.values()]

    # Carrega as preferências salvas (ex.: visibilidade, cor customizada, posição)
    try:
        from agents.kaguya.calendar_prefs import get_calendar_prefs
        prefs_list = get_calendar_prefs()
    except Exception:
        # Se o banco não estiver disponível ou a tabela ainda não existir,
        # retorna as fontes sem prefs (comportamento gracioso)
        prefs_list = []

    # Indexa as prefs por calendar_id para acesso O(1) na mesclagem
    prefs_by_id: dict[str, dict] = {p["calendar_id"]: p for p in prefs_list}

    # Monta a lista final mesclando metadados da fonte com prefs do usuário
    result = []
    for source_id, source in _SOURCES.items():
        # Começa com uma cópia dos metadados base da fonte
        merged = dict(source)
        pref = prefs_by_id.get(source_id)

        if pref:
            # A preferência de cor do usuário sobrepõe a cor padrão da fonte
            if pref.get("color") is not None:
                merged["color"] = pref["color"]
            # Herda visible e position das prefs
            merged["visible"] = pref.get("visible", True)
            merged["position"] = pref.get("position", 0)
        else:
            # Sem pref salva: visível por padrão, posição 0 (sem preferência)
            merged["visible"] = True
            merged["position"] = 0

        result.append(merged)

    # Ordena: fontes com pref primeiro (por position), fontes sem pref ao final
    # Fontes sem pref têm position=0, então a ordem de inserção no dict é preservada
    # via estabilidade da sort do Python.
    result.sort(key=lambda s: (s["position"], list(_SOURCES.keys()).index(s["id"])))

    return result


def aggregate(
    start_date: str,
    end_date: str,
    sources: list[str] | None = None,
) -> dict:
    """Agrega eventos de múltiplos provedores em um único feed.

    Faz um fan-out (chamada paralela conceitualmente, mas sequencial aqui — sem async)
    para cada provedor visível, coleta os resultados e os concatena. Se um provedor
    falhar, registra o source_id em `errors` e continua com os demais (best-effort).

    Args:
        start_date: Data inicial no formato YYYY-MM-DD (inclusivo).
        end_date: Data final no formato YYYY-MM-DD (inclusivo).
        sources: Lista de source_ids a consultar. Se None, usa todas as fontes
            visíveis (visible=True nas prefs, padrão True se sem pref).

    Returns:
        Dicionário com três chaves:
            - "sources": lista de SOURCE dicts com prefs aplicadas (fontes consultadas).
            - "items": lista concatenada de CalendarItem de todos os provedores.
            - "errors": lista de source_ids que falharam durante a coleta.

    Example:
        >>> resultado = aggregate("2026-06-01", "2026-06-30")
        >>> len(resultado["items"])  # total de itens de todas as fontes
        42
        >>> resultado["errors"]      # provedores que falharam (espera-se vazio)
        []
    """
    # Carrega fontes com prefs para saber quais são visíveis e seus metadados
    all_sources = list_sources(with_prefs=True)

    # Determina quais fontes serão consultadas:
    # - Se `sources` foi passado: filtra só as fontes listadas (independente de visible)
    # - Se `sources=None`: usa todas as fontes marcadas como visíveis
    if sources is not None:
        sources_set = set(sources)
        selected = [s for s in all_sources if s["id"] in sources_set]
    else:
        # Filtra apenas as fontes visíveis (visible=True é o padrão quando sem pref)
        selected = [s for s in all_sources if s.get("visible", True)]

    # Coleta de resultados: lista unificada e lista de erros
    all_items: list[CalendarItem] = []
    errors: list[str] = []

    for source in selected:
        source_id = source["id"]
        provider_fn = _PROVIDERS.get(source_id)

        if provider_fn is None:
            # Fonte registrada sem provedor — situação anômala, registra como erro
            logger.warning(
                "calendar_hub: fonte '%s' registrada sem provedor — pulando.", source_id
            )
            errors.append(source_id)
            continue

        try:
            # Chama o provedor com o intervalo de datas
            items = provider_fn(start_date, end_date)

            # Garante que o campo `cal` está preenchido com o source_id correto.
            # Provedores podem omitir esse campo — o hub preenche como fallback.
            for item in items:
                if not item.get("cal"):
                    item["cal"] = source_id  # type: ignore[assignment]

            all_items.extend(items)

        except Exception as exc:
            # Provedor falhou (banco fora do ar, bug, etc.) — registra e continua
            # para não bloquear os demais provedores (resiliência best-effort)
            logger.error(
                "calendar_hub: erro no provedor '%s': %s", source_id, exc, exc_info=True
            )
            errors.append(source_id)

    return {
        "sources": selected,
        "items": all_items,
        "errors": errors,
    }
