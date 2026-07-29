"""Motor de estatísticas de foco — funções puras, sem banco (spec 037 + spec 062).

Agrega sessões de foco já carregadas (dicts prontos, vindos de
``tools_focus.list_sessions_for_range``) em totais por dia, por hora, por desfecho,
streaks e rankings — a base do overview "quanto foquei, quando consegui e onde falhei".
Não acessa banco nem calcula fuso horário: recebe `date_local`/`hour_local` já resolvidos
pelo chamador (sempre America/Sao_Paulo, nunca UTC puro) e `duration_focused_min` já
derivado (nunca mais que o planejado — ver `tools_focus._duration_focused_min`).

Puro significa: recebe listas de dicts prontos, não acessa banco nem rede. Facilita
testes e garante que o cálculo nunca quebra por falha externa (mesmo princípio de
`habit_strength.py`/`goal_progress.py`/`experiment_adherence.py`/`capacity.py`).

Contrato do dict de sessão esperado por estas funções (ver `tools_focus.py`):
    ``date_local`` (str "AAAA-MM-DD"), ``hour_local`` (int 0-23, hora de início),
    ``duration_focused_min`` (int), ``outcome`` (``"completed"``|``"cancelled"``|
    ``"abandoned"``|``None`` — ``None`` = sessão ainda ativa, conta parcialmente),
    ``task_id``/``task_title``, ``habit_id``/``habit_name``,
    ``project_id``/``project_title``/``project_color``, ``context``.

Usage:
    >>> aggregate_by_day([
    ...     {"date_local": "2026-07-27", "duration_focused_min": 25, "outcome": "completed"},
    ...     {"date_local": "2026-07-27", "duration_focused_min": 10, "outcome": "completed"},
    ...     {"date_local": "2026-07-26", "duration_focused_min": 50, "outcome": "completed"},
    ... ])
    {'2026-07-27': {'total_min': 35, 'sessoes': 2}, '2026-07-26': {'total_min': 50, 'sessoes': 1}}
"""

from datetime import date, timedelta
from typing import Optional, TypedDict


class DayStats(TypedDict):
    """Totais de um único dia local (só tempo efetivamente focado)."""

    total_min: int
    sessoes: int


class HourStats(TypedDict):
    """Totais de uma hora do dia (0-23), agregados através de todos os dias."""

    completed_min: int
    completed_n: int
    failed_n: int


class OutcomeStats(TypedDict):
    """Distribuição de desfechos + taxa de conclusão + fuga média."""

    completed: int
    cancelled: int
    abandoned: int
    completion_pct: int
    avg_min_before_quit: Optional[float]


def _is_productive(session: dict) -> bool:
    """Uma sessão conta para "tempo focado" se foi concluída, ou ainda está ativa
    (``outcome is None`` — a ativa entra parcialmente, mesmo padrão desde a spec 037).
    Cancelada/abandonada NUNCA soma minutos — só entram nas estatísticas de falha.
    """
    return session.get("outcome") in (None, "completed")


def aggregate_by_day(sessions: list[dict]) -> dict[str, DayStats]:
    """Agrega sessões de foco em totais por dia local (só tempo produtivo).

    Args:
        sessions: Lista de dicts com `date_local` (str "AAAA-MM-DD"),
            `duration_focused_min` (int) e `outcome` (ver contrato do módulo).

    Returns:
        Dict esparso `{date_local: {total_min, sessoes}}` — só dias com pelo menos
        uma sessão produtiva aparecem (canceladas/abandonadas não contam aqui; para
        elas ver `outcome_stats`).

    Example:
        >>> aggregate_by_day([{"date_local": "2026-07-27", "duration_focused_min": 25, "outcome": "completed"}])
        {'2026-07-27': {'total_min': 25, 'sessoes': 1}}
    """
    result: dict[str, DayStats] = {}
    for s in sessions:
        if not _is_productive(s):
            continue
        day = s["date_local"]
        minutes = s.get("duration_focused_min") or 0
        if day not in result:
            result[day] = {"total_min": 0, "sessoes": 0}
        result[day]["total_min"] += minutes
        result[day]["sessoes"] += 1
    return result


def aggregate_by_hour(sessions: list[dict]) -> dict[int, HourStats]:
    """Agrega sessões pela hora local de início — "quando eu consigo focar".

    Args:
        sessions: Lista de dicts com `hour_local` (int 0-23), `duration_focused_min`
            e `outcome`.

    Returns:
        Dict esparso `{hour: {completed_min, completed_n, failed_n}}` — só horas com
        pelo menos uma sessão (produtiva ou falhada) aparecem.

    Example:
        >>> aggregate_by_hour([
        ...     {"hour_local": 9, "duration_focused_min": 25, "outcome": "completed"},
        ...     {"hour_local": 22, "duration_focused_min": 5, "outcome": "abandoned"},
        ... ])
        {9: {'completed_min': 25, 'completed_n': 1, 'failed_n': 0}, 22: {'completed_min': 0, 'completed_n': 0, 'failed_n': 1}}
    """
    result: dict[int, HourStats] = {}
    for s in sessions:
        hour = s["hour_local"]
        if hour not in result:
            result[hour] = {"completed_min": 0, "completed_n": 0, "failed_n": 0}
        if _is_productive(s):
            result[hour]["completed_min"] += s.get("duration_focused_min") or 0
            result[hour]["completed_n"] += 1
        elif s.get("outcome") in ("cancelled", "abandoned"):
            result[hour]["failed_n"] += 1
    return result


def outcome_stats(sessions: list[dict]) -> OutcomeStats:
    """Distribuição de desfechos + taxa de conclusão + tempo médio até desistir.

    Considera apenas sessões já encerradas (``outcome`` presente) — a ativa
    (``outcome is None``) não participa, pois ainda não tem desfecho.

    Args:
        sessions: Lista de dicts com `outcome` e `duration_focused_min`.

    Returns:
        `{completed, cancelled, abandoned, completion_pct, avg_min_before_quit}`.
        `completion_pct` é 0 quando não há nenhuma sessão encerrada.
        `avg_min_before_quit` é `None` quando não há nenhuma cancelada/abandonada
        (não há "fuga" nenhuma para medir).

    Example:
        >>> outcome_stats([
        ...     {"outcome": "completed", "duration_focused_min": 25},
        ...     {"outcome": "cancelled", "duration_focused_min": 5},
        ...     {"outcome": "abandoned", "duration_focused_min": 20},
        ... ])
        {'completed': 1, 'cancelled': 1, 'abandoned': 1, 'completion_pct': 33, 'avg_min_before_quit': 12.5}
    """
    completed = cancelled = abandoned = 0
    quit_minutes: list[int] = []
    for s in sessions:
        outcome = s.get("outcome")
        if outcome == "completed":
            completed += 1
        elif outcome == "cancelled":
            cancelled += 1
            quit_minutes.append(s.get("duration_focused_min") or 0)
        elif outcome == "abandoned":
            abandoned += 1
            quit_minutes.append(s.get("duration_focused_min") or 0)

    total_finished = completed + cancelled + abandoned
    completion_pct = round(100 * completed / total_finished) if total_finished else 0
    avg_min_before_quit = round(sum(quit_minutes) / len(quit_minutes), 1) if quit_minutes else None

    return {
        "completed": completed,
        "cancelled": cancelled,
        "abandoned": abandoned,
        "completion_pct": completion_pct,
        "avg_min_before_quit": avg_min_before_quit,
    }


def current_streak(day_totals: dict[str, DayStats], today: date) -> int:
    """Dias consecutivos com pelo menos uma sessão concluída, contando de trás pra frente.

    Sem meta diária (decisão de produto) — "consegui" = qualquer minuto focado no dia.
    Se hoje ainda não tem sessão nenhuma, o streak conta a partir de ONTEM (o dia só
    "quebra" quando vira sem ter tido sessão — não no meio do dia atual, senão o streak
    piscaria pra zero toda manhã antes do usuário focar pela primeira vez).

    Args:
        day_totals: Saída de `aggregate_by_day` (dict esparso por dia local).
        today: Data de hoje já resolvida em America/Sao_Paulo (nunca UTC puro).

    Returns:
        Contagem de dias consecutivos (0 se nem ontem nem hoje têm sessão).

    Example:
        >>> from datetime import date
        >>> current_streak({"2026-07-29": {"total_min": 25, "sessoes": 1},
        ...                  "2026-07-28": {"total_min": 30, "sessoes": 1}}, date(2026, 7, 29))
        2
        >>> current_streak({"2026-07-28": {"total_min": 30, "sessoes": 1}}, date(2026, 7, 29))
        1
        >>> current_streak({}, date(2026, 7, 29))
        0
    """
    cursor = today
    if cursor.isoformat() not in day_totals:
        cursor -= timedelta(days=1)

    streak = 0
    while cursor.isoformat() in day_totals:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def longest_streak(day_totals: dict[str, DayStats]) -> int:
    """Maior sequência histórica de dias consecutivos com sessão concluída (recorde).

    Args:
        day_totals: Saída de `aggregate_by_day` (dict esparso por dia local).

    Returns:
        Tamanho da maior sequência (0 se `day_totals` está vazio).

    Example:
        >>> longest_streak({"2026-07-01": {"total_min": 25, "sessoes": 1},
        ...                  "2026-07-02": {"total_min": 25, "sessoes": 1},
        ...                  "2026-07-05": {"total_min": 25, "sessoes": 1}})
        2
    """
    if not day_totals:
        return 0

    days = sorted(date.fromisoformat(d) for d in day_totals)
    best = current = 1
    for prev, curr in zip(days, days[1:]):
        if (curr - prev).days == 1:
            current += 1
            best = max(best, current)
        else:
            current = 1
    return best


def top_by(sessions: list[dict], key: str) -> list[dict]:
    """Ranking de tempo focado por uma dimensão (tarefa/lista/hábito/contexto).

    Só conta minutos produtivos (concluídas + a ativa parcial) — mesmo critério de
    `aggregate_by_day`. Ordena por `total_min` decrescente.

    Args:
        sessions: Lista de dicts de sessão.
        key: Nome do campo a agrupar (ex.: `"task_id"`, `"project_id"`, `"habit_id"`,
            `"context"`). O rótulo de exibição é lido do campo `f"{key.removesuffix('_id')}_title"`
            se existir (ex.: `task_id` -> `task_title`), senão do próprio valor.

    Returns:
        `[{key: valor, label: str, total_min: int, sessoes: int}, ...]`, maior primeiro.
        Sessões sem valor no campo (`None`) são ignoradas — não existe "sem tarefa" no
        ranking, isso já é o caso "avulsa" e não interessa aqui.

    Example:
        >>> top_by([
        ...     {"task_id": 1, "task_title": "Escrever", "duration_focused_min": 25, "outcome": "completed"},
        ...     {"task_id": 1, "task_title": "Escrever", "duration_focused_min": 10, "outcome": "completed"},
        ...     {"task_id": 2, "task_title": "Revisar", "duration_focused_min": 50, "outcome": "completed"},
        ... ], "task_id")
        [{'task_id': 2, 'label': 'Revisar', 'total_min': 50, 'sessoes': 1}, {'task_id': 1, 'label': 'Escrever', 'total_min': 35, 'sessoes': 2}]
    """
    label_field = f"{key.removesuffix('_id')}_title" if key.endswith("_id") else key
    grouped: dict = {}
    for s in sessions:
        value = s.get(key)
        if value is None or not _is_productive(s):
            continue
        if value not in grouped:
            grouped[value] = {
                key: value,
                "label": s.get(label_field) or str(value),
                "total_min": 0,
                "sessoes": 0,
            }
        grouped[value]["total_min"] += s.get("duration_focused_min") or 0
        grouped[value]["sessoes"] += 1
    return sorted(grouped.values(), key=lambda g: g["total_min"], reverse=True)
