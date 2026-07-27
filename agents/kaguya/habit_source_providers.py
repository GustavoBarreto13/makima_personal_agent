"""Registry de **fonte automática de hábito** — Hábitos cross-agent (spec 036).

Irmão do ``calendar_hub.py``/``goal_link_providers.py``: registro por ``id`` + importação
dinâmica com fallback gracioso. Aqui o contrato é uma série temporal esparsa de atividade:

    get_activity(start_date: str, end_date: str) -> dict[str, float]
        # {"2026-07-05": 1.0, "2026-07-06": 25.0, ...}  (dias sem atividade: ausentes)

Para hábito **binário** (ex.: "escrever no diário"), qualquer dia presente no dict conta como
cumprido — o valor em si é irrelevante (convenção: ``1.0``). Para hábito **mensurável** (ex.:
"ler 20 páginas"), o valor é comparado com ``target_value`` pela mesma regra de
``habit_strength.met_target``.

Nada aqui é persistido: ``tools_habits`` mescla o resultado em memória com os check-ins
manuais a cada consulta (R4 do research.md) — não há job de sincronização.

Usage:
    >>> from agents.kaguya.habit_source_providers import list_providers, get_activity
    >>> list_providers()
    [{'id': 'violet_diary', 'name': 'Diário (Violet)'}, {'id': 'frieren_reading', 'name': 'Leitura (Frieren)'}]
    >>> get_activity("violet_diary", "2026-07-01", "2026-07-31")
    {'2026-07-05': 1.0}
"""

import importlib
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Mapa provider_id -> {"id", "name"}
_SOURCES: dict[str, dict] = {}
# Mapa provider_id -> callable (start_date, end_date) -> dict[str, float]
_PROVIDERS: dict[str, callable] = {}


def register(provider_id: str, name: str, fn: callable) -> None:
    """Registra uma fonte automática de hábito.

    Args:
        provider_id: Identificador único (ex.: ``"violet_diary"``).
        name: Nome de exibição (ex.: ``"Diário (Violet)"``).
        fn: ``(start_date: str, end_date: str) -> dict[str, float]``.
    """
    _SOURCES[provider_id] = {"id": provider_id, "name": name}
    _PROVIDERS[provider_id] = fn


def _try_import_provider(module_path: str, fn_name: str) -> callable:
    """Importa um provedor dinamicamente; degrada para "sem atividade" se o módulo não existir.

    Args:
        module_path: Caminho Python do módulo (ex.: ``"agents.journal.habit_provider"``).
        fn_name: Nome da função dentro do módulo.

    Returns:
        A função importada, ou ``lambda start, end: {}`` se módulo/função faltarem.
    """
    try:
        mod = importlib.import_module(module_path)
        return getattr(mod, fn_name)
    except (ImportError, AttributeError):
        return lambda start_date, end_date: {}


def list_providers() -> list[dict]:
    """Lista os provedores registrados.

    Returns:
        Lista ``[{"id": str, "name": str}, ...]``, na ordem de registro.
    """
    return list(_SOURCES.values())


def get_activity(provider_id: str, start_date: str, end_date: str) -> dict[str, float]:
    """Consulta a atividade diária de um provedor num intervalo (best-effort).

    Args:
        provider_id: Chave do provedor (ex.: ``"violet_diary"``). ``None``/desconhecido
            devolve ``{}`` (hábito sem fonte ou fonte não registrada — degrada sem erro).
        start_date: Início do intervalo, ``"AAAA-MM-DD"``.
        end_date: Fim do intervalo, ``"AAAA-MM-DD"``.

    Returns:
        Mapa esparso ``{"AAAA-MM-DD": valor}``. ``{}`` se o provedor não existir ou falhar
        (FR-008) — equivalente a "nenhuma atividade detectada".
    """
    if not provider_id:
        return {}
    fn = _PROVIDERS.get(provider_id)
    if fn is None:
        return {}
    try:
        return fn(start_date, end_date) or {}
    except Exception as exc:
        logger.error("habit_source_providers: erro no provedor '%s': %s", provider_id, exc, exc_info=True)
        return {}


# ---------------------------------------------------------------------------
# Registro dos provedores da fase 1 (spec 036)
# ---------------------------------------------------------------------------
register(
    "violet_diary", "Diário (Violet)",
    _try_import_provider("agents.journal.habit_provider", "get_activity"),
)
register(
    "frieren_reading", "Leitura (Frieren)",
    _try_import_provider("agents.frieren.habit_provider", "get_activity"),
)
