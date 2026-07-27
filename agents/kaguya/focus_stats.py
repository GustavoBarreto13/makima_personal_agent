"""Motor de estatísticas de foco — função pura, sem banco (spec 037).

Agrega sessões de foco já carregadas em totais por dia (tempo focado + contagem de
sessões). Não acessa banco nem calcula fuso horário — recebe `date_local` já resolvido
pelo chamador (sempre America/Sao_Paulo, nunca UTC puro) e `duration_focused_min` já
derivado (nunca mais que o planejado — ver tools_focus.py).

Puro significa: recebe listas de dicts prontos, não acessa banco nem rede. Facilita
testes e garante que o cálculo nunca quebra por falha externa.

Usage:
    >>> aggregate_by_day([
    ...     {"date_local": "2026-07-27", "duration_focused_min": 25},
    ...     {"date_local": "2026-07-27", "duration_focused_min": 10},
    ...     {"date_local": "2026-07-26", "duration_focused_min": 50},
    ... ])
    {'2026-07-27': {'total_min': 35, 'sessoes': 2}, '2026-07-26': {'total_min': 50, 'sessoes': 1}}
"""

from typing import TypedDict


class DayStats(TypedDict):
    """Totais de um único dia local."""

    total_min: int
    sessoes: int


def aggregate_by_day(sessions: list[dict]) -> dict[str, DayStats]:
    """Agrega sessões de foco em totais por dia local.

    Args:
        sessions: Lista de dicts com `date_local` (str "AAAA-MM-DD") e
            `duration_focused_min` (int, tempo efetivamente focado).

    Returns:
        Dict esparso `{date_local: {total_min, sessoes}}` — só dias com pelo menos
        uma sessão aparecem (nenhum dia "zerado" é inventado).

    Example:
        >>> aggregate_by_day([{"date_local": "2026-07-27", "duration_focused_min": 25}])
        {'2026-07-27': {'total_min': 25, 'sessoes': 1}}
    """
    result: dict[str, DayStats] = {}
    for s in sessions:
        day = s["date_local"]
        minutes = s.get("duration_focused_min") or 0
        if day not in result:
            result[day] = {"total_min": 0, "sessoes": 0}
        result[day]["total_min"] += minutes
        result[day]["sessoes"] += 1
    return result
