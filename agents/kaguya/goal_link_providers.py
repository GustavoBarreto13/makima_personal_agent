"""Registry de **vínculo de meta com outro agente** — Metas cross-agent (spec 036).

Irmão do ``calendar_hub.py`` (fatia 019): mesmo padrão de registro por ``id`` + importação
dinâmica com fallback gracioso, mas para um contrato diferente — aqui não é uma linha de
tempo, é "buscar itens para vincular" + "resolver o estado atual dos já vinculados".

Cada provedor vive no pacote do agente dono (ex.: ``agents/frieren/goal_provider.py``) e
publica duas funções:

    search_items(query: str) -> list[dict]
        # [{"id": str, "label": str, "sublabel": str|None, "cover_url": str|None}]
    resolve_items(ids: list[str]) -> list[dict]
        # [{"id": str, "label": str, "sublabel": str|None, "cover_url": str|None,
        #   "done": bool, "deep_link": str|None}]

``resolve_items`` é chamado só com os ids já vinculados (``goal_external_links``) e devolve o
estado ATUAL — nunca cacheado (Metas em modo automático recalculam a cada consulta). Ids que
não existem mais são simplesmente omitidos da resposta (FR-009) — não é erro.

Usage:
    >>> from agents.kaguya.goal_link_providers import list_providers, search, resolve
    >>> list_providers()
    [{'id': 'frieren_books', 'name': 'Livros (Frieren)'}]
    >>> search("frieren_books", "duna")
    [...]
"""

import importlib
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Mapa provider_id -> {"id", "name"} (metadados de exibição)
_SOURCES: dict[str, dict] = {}
# Mapa provider_id -> {"search": callable, "resolve": callable}
_PROVIDERS: dict[str, dict] = {}


def register(provider_id: str, name: str, search_fn: callable, resolve_fn: callable) -> None:
    """Registra um provedor de vínculo de meta.

    Chamadas duplicadas com o mesmo ``provider_id`` sobrescrevem o registro anterior (útil
    para testes).

    Args:
        provider_id: Identificador único (ex.: ``"frieren_books"``).
        name: Nome de exibição (ex.: ``"Livros (Frieren)"``).
        search_fn: ``(query: str) -> list[dict]``.
        resolve_fn: ``(ids: list[str]) -> list[dict]``.
    """
    _SOURCES[provider_id] = {"id": provider_id, "name": name}
    _PROVIDERS[provider_id] = {"search": search_fn, "resolve": resolve_fn}


def _try_import_provider(module_path: str, search_name: str, resolve_name: str) -> tuple[callable, callable]:
    """Importa um provedor dinamicamente; degrada para funções vazias se o módulo não existir.

    Mesma ideia do ``_try_import_provider`` do ``calendar_hub.py`` — nunca derruba o registry
    porque um pacote específico ainda não implementou o módulo.

    Args:
        module_path: Caminho Python do módulo (ex.: ``"agents.frieren.goal_provider"``).
        search_name: Nome da função de busca dentro do módulo.
        resolve_name: Nome da função de resolução dentro do módulo.

    Returns:
        Tupla ``(search_fn, resolve_fn)`` — vazias (``lambda: []``) se o módulo/função faltar.
    """
    try:
        mod = importlib.import_module(module_path)
        return getattr(mod, search_name), getattr(mod, resolve_name)
    except (ImportError, AttributeError):
        return (lambda query: [], lambda ids: [])


def list_providers() -> list[dict]:
    """Lista os provedores registrados.

    Returns:
        Lista ``[{"id": str, "name": str}, ...]``, na ordem de registro.
    """
    return list(_SOURCES.values())


def search(provider_id: str, query: str) -> Optional[list[dict]]:
    """Busca itens vinculáveis num provedor (best-effort).

    Args:
        provider_id: Chave do provedor.
        query: Texto de busca.

    Returns:
        Lista de itens, ou ``None`` se o provedor não existe ou falhou (FR-008) — o chamador
        distingue "provedor inválido/indisponível" de "lista vazia de resultados".
    """
    provider = _PROVIDERS.get(provider_id)
    if provider is None:
        return None
    try:
        return provider["search"](query)
    except Exception as exc:
        logger.error("goal_link_providers: erro ao buscar em '%s': %s", provider_id, exc, exc_info=True)
        return None


def resolve(provider_id: str, ids: list[str]) -> Optional[list[dict]]:
    """Resolve o estado atual de itens já vinculados (best-effort).

    Args:
        provider_id: Chave do provedor.
        ids: Ids das entidades já vinculadas àquele provedor.

    Returns:
        Lista de itens resolvidos (pode ser menor que ``ids`` — itens removidos somem, FR-009),
        ou ``None`` se o provedor não existe ou falhou (FR-008).
    """
    if not ids:
        return []
    provider = _PROVIDERS.get(provider_id)
    if provider is None:
        return None
    try:
        return provider["resolve"](ids)
    except Exception as exc:
        logger.error("goal_link_providers: erro ao resolver em '%s': %s", provider_id, exc, exc_info=True)
        return None


# ---------------------------------------------------------------------------
# Registro dos provedores da fase 1 (spec 036)
# ---------------------------------------------------------------------------
_frieren_search, _frieren_resolve = _try_import_provider(
    "agents.frieren.goal_provider", "search_items", "resolve_items"
)
register("frieren_books", "Livros (Frieren)", _frieren_search, _frieren_resolve)
