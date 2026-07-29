"""Motor de conquistas de foco — função pura, sem banco (spec 062).

Deriva um catálogo fixo de conquistas ("badges") a partir do histórico bruto de
sessões — nenhuma conquista é persistida (mesmo princípio de "nada persistido
derivado" de `habit_strength.py`/`goal_progress.py`/`experiment_adherence.py`/
`focus_stats.py`). Toda vez que o usuário abre a tela de Foco, o catálogo inteiro é
recalculado do zero a partir de `focus_sessions` — não existe "desbloqueei" gravado
em lugar nenhum, então não há risco de o dado divergir do histórico real.

Não há meta diária (decisão de produto da spec 062) — nenhuma conquista depende dela;
todos os eixos usam contagens/durações/sequências que já existem em `focus_stats.py`.

Puro significa: recebe a lista de sessões já carregada (mesmo contrato de
`focus_stats.py`) e a data de hoje, não acessa banco nem rede.

Usage:
    >>> from datetime import date
    >>> sessions = [
    ...     {"date_local": "2026-07-29", "hour_local": 9, "duration_focused_min": 25,
    ...      "outcome": "completed", "task_id": None, "task_title": None,
    ...      "project_id": None, "project_title": None},
    ... ]
    >>> badges = evaluate(sessions, date(2026, 7, 29))
    >>> next(b for b in badges if b["id"] == "sessions_1")["unlocked"]
    True
"""

from datetime import date, timedelta
from typing import Optional, TypedDict

from agents.kaguya import focus_stats as FS


class Achievement(TypedDict):
    """Uma conquista já avaliada contra o histórico."""

    id: str
    name: str
    description: str
    icon: str
    axis: str
    unlocked: bool
    unlocked_at: Optional[str]  # "AAAA-MM-DD", None se ainda bloqueada
    progress: int
    target: int


# ---------------------------------------------------------------------------
# Catálogo fixo — eixo -> lista de (id, name, description, icon, threshold)
# ---------------------------------------------------------------------------
_SESSION_MILESTONES = [1, 10, 50, 100, 250, 500]
_HOUR_MILESTONES = [10, 50, 100]  # em horas
_STREAK_MILESTONES = [3, 7, 30, 100]  # em dias
_LONG_SESSION_MILESTONES = [60, 90]  # minutos numa única sessão
_INTENSE_DAY_SESSIONS = 4
_INTENSE_DAY_MINUTES = 4 * 60
_FIDELITY_MINUTES = 10 * 60  # 10h numa mesma lista


def _completed(sessions: list[dict]) -> list[dict]:
    """Sessões concluídas, ordenadas por `date_local` (ordem de conquista)."""
    return sorted(
        (s for s in sessions if s.get("outcome") == "completed"),
        key=lambda s: s["date_local"],
    )


def _mk(id_, name, description, icon, axis, unlocked, unlocked_at, progress, target) -> Achievement:
    return {
        "id": id_,
        "name": name,
        "description": description,
        "icon": icon,
        "axis": axis,
        "unlocked": unlocked,
        "unlocked_at": unlocked_at,
        "progress": min(progress, target),
        "target": target,
    }


def _session_count_badges(completed: list[dict]) -> list[Achievement]:
    """1 badge por marco de NÚMERO de sessões concluídas (histórico inteiro)."""
    total = len(completed)
    out = []
    for threshold in _SESSION_MILESTONES:
        unlocked = total >= threshold
        unlocked_at = completed[threshold - 1]["date_local"] if unlocked else None
        out.append(_mk(
            f"sessions_{threshold}", f"{threshold} sessões",
            f"Concluir {threshold} sessões de foco.", "🎯", "sessions",
            unlocked, unlocked_at, total, threshold,
        ))
    return out


def _hour_badges(completed: list[dict]) -> list[Achievement]:
    """1 badge por marco de HORAS totais focadas (soma corrida)."""
    total_min = sum(s.get("duration_focused_min") or 0 for s in completed)
    out = []
    for hours in _HOUR_MILESTONES:
        target_min = hours * 60
        unlocked = total_min >= target_min
        unlocked_at = None
        if unlocked:
            running = 0
            for s in completed:
                running += s.get("duration_focused_min") or 0
                if running >= target_min:
                    unlocked_at = s["date_local"]
                    break
        out.append(_mk(
            f"hours_{hours}", f"{hours}h de foco",
            f"Acumular {hours} horas de foco (histórico inteiro).", "⏱️", "hours",
            unlocked, unlocked_at, total_min, target_min,
        ))
    return out


def _streak_badges(day_totals: dict[str, FS.DayStats]) -> list[Achievement]:
    """1 badge por marco de SEQUÊNCIA de dias consecutivos (recorde histórico,
    não o streak atual — uma conquista já desbloqueada não deveria "sumir" se o
    streak de hoje zerar).
    """
    best = FS.longest_streak(day_totals)
    days_sorted = sorted(day_totals)
    out = []
    for threshold in _STREAK_MILESTONES:
        unlocked = best >= threshold
        unlocked_at = None
        if unlocked:
            run_start = None
            prev_day = None
            for d_str in days_sorted:
                d = date.fromisoformat(d_str)
                if prev_day is not None and (d - prev_day).days == 1:
                    pass
                else:
                    run_start = d
                if (d - run_start).days + 1 >= threshold:
                    unlocked_at = d_str
                    break
                prev_day = d
        out.append(_mk(
            f"streak_{threshold}", f"{threshold} dias seguidos",
            f"Focar em {threshold} dias consecutivos.", "🔥", "streak",
            unlocked, unlocked_at, best, threshold,
        ))
    return out


def _long_session_badges(completed: list[dict]) -> list[Achievement]:
    """1 badge por marco de DURAÇÃO de uma única sessão."""
    best = max((s.get("duration_focused_min") or 0 for s in completed), default=0)
    out = []
    for threshold in _LONG_SESSION_MILESTONES:
        unlocked = best >= threshold
        unlocked_at = None
        if unlocked:
            unlocked_at = next(
                s["date_local"] for s in completed if (s.get("duration_focused_min") or 0) >= threshold
            )
        out.append(_mk(
            f"long_session_{threshold}", f"Sessão de {threshold}min",
            f"Concluir uma única sessão de {threshold} minutos.", "🌳", "long_session",
            unlocked, unlocked_at, best, threshold,
        ))
    return out


def _intense_day_badges(day_totals: dict[str, FS.DayStats]) -> list[Achievement]:
    """Dia com 4+ sessões e dia com 4h+ — dois badges independentes."""
    days_sorted = sorted(day_totals)

    sessions_unlocked_at = next(
        (d for d in days_sorted if day_totals[d]["sessoes"] >= _INTENSE_DAY_SESSIONS), None
    )
    best_sessions = max((v["sessoes"] for v in day_totals.values()), default=0)

    minutes_unlocked_at = next(
        (d for d in days_sorted if day_totals[d]["total_min"] >= _INTENSE_DAY_MINUTES), None
    )
    best_minutes = max((v["total_min"] for v in day_totals.values()), default=0)

    return [
        _mk(
            "intense_day_sessions", "Dia intenso — sessões",
            f"Concluir {_INTENSE_DAY_SESSIONS} sessões no mesmo dia.", "⚡", "intense_day",
            sessions_unlocked_at is not None, sessions_unlocked_at, best_sessions, _INTENSE_DAY_SESSIONS,
        ),
        _mk(
            "intense_day_minutes", "Dia intenso — horas",
            f"Acumular {_INTENSE_DAY_MINUTES // 60}h de foco no mesmo dia.", "⚡", "intense_day",
            minutes_unlocked_at is not None, minutes_unlocked_at, best_minutes, _INTENSE_DAY_MINUTES,
        ),
    ]


def _hour_of_day_badges(completed: list[dict]) -> list[Achievement]:
    """Concluir uma sessão bem cedo (<6h) ou bem tarde (>=23h)."""
    early = next((s for s in completed if s.get("hour_local", 12) < 6), None)
    late = next((s for s in completed if s.get("hour_local", 12) >= 23), None)
    return [
        _mk(
            "early_bird", "Madrugador",
            "Concluir uma sessão de foco antes das 6h.", "🌅", "hour_of_day",
            early is not None, early["date_local"] if early else None, 1 if early else 0, 1,
        ),
        _mk(
            "night_owl", "Coruja",
            "Concluir uma sessão de foco depois das 23h.", "🦉", "hour_of_day",
            late is not None, late["date_local"] if late else None, 1 if late else 0, 1,
        ),
    ]


def _resilience_badge(sessions: list[dict]) -> Achievement:
    """Concluir uma sessão no MESMO DIA em que uma outra foi cancelada/abandonada —
    reconhece voltar ao foco depois de falhar, não só nunca falhar.
    """
    by_day: dict[str, dict] = {}
    for s in sessions:
        day = s["date_local"]
        entry = by_day.setdefault(day, {"completed": False, "failed": False})
        if s.get("outcome") == "completed":
            entry["completed"] = True
        elif s.get("outcome") in ("cancelled", "abandoned"):
            entry["failed"] = True

    qualifying_days = sorted(d for d, v in by_day.items() if v["completed"] and v["failed"])
    unlocked = bool(qualifying_days)
    return _mk(
        "resilience", "Resiliência",
        "Concluir uma sessão no mesmo dia em que outra foi cancelada ou abandonada.",
        "🛡️", "resilience", unlocked, qualifying_days[0] if unlocked else None,
        1 if unlocked else 0, 1,
    )


def _fidelity_badge(completed: list[dict]) -> Achievement:
    """10h acumuladas numa MESMA lista (`project_id`) — fidelidade a um projeto."""
    running: dict = {}
    unlocked_at = None
    best_total = 0
    for s in completed:
        project_id = s.get("project_id")
        if project_id is None:
            continue
        running[project_id] = running.get(project_id, 0) + (s.get("duration_focused_min") or 0)
        best_total = max(best_total, running[project_id])
        if unlocked_at is None and running[project_id] >= _FIDELITY_MINUTES:
            unlocked_at = s["date_local"]

    return _mk(
        "fidelity", "Fidelidade",
        f"Acumular {_FIDELITY_MINUTES // 60}h de foco numa mesma lista.", "📌", "fidelity",
        unlocked_at is not None, unlocked_at, best_total, _FIDELITY_MINUTES,
    )


def evaluate(sessions: list[dict], today: date) -> list[Achievement]:
    """Avalia o catálogo inteiro de conquistas contra o histórico de sessões.

    Args:
        sessions: Sessões cruas no mesmo contrato de `focus_stats.py` (precisa de
            `date_local`, `hour_local`, `outcome`, `duration_focused_min`,
            `project_id`).
        today: Data de hoje em America/Sao_Paulo (não usada diretamente hoje, mas
            mantida na assinatura para futuros eixos "esta semana"/"este mês").

    Returns:
        Lista de `Achievement`, na ordem do catálogo (não ordenada por desbloqueio).
    """
    completed = _completed(sessions)
    day_totals = FS.aggregate_by_day(sessions)

    badges: list[Achievement] = []
    badges += _session_count_badges(completed)
    badges += _hour_badges(completed)
    badges += _streak_badges(day_totals)
    badges += _long_session_badges(completed)
    badges += _intense_day_badges(day_totals)
    badges += _hour_of_day_badges(completed)
    badges.append(_resilience_badge(sessions))
    badges.append(_fidelity_badge(completed))
    return badges
