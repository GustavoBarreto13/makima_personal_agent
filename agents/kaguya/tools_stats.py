"""Estatísticas da Kaguya no contrato ``StatsPayload`` do Design System (spec 075).

``get_stats_payload(year, month, space)`` alimenta a tela de Estatísticas (``GET /api/tasks/stats``) com
as 6 métricas mínimas do domínio — concluídas por semana/dia, no prazo × atrasadas, por lista/tag,
% de hábitos, metas/experimentos e foco — mais o bloco ``planning``: onde o planejamento falha.

Toda a aritmética vive no motor puro :mod:`agents.kaguya.planning_stats`; aqui só há SQL e montagem.
Regras do contrato: datas em America/Sao_Paulo, soft delete fora da conta, tarefa-pai como unidade
(subtarefas não inflam a contagem), métrica "do período" filtra pelo período.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

from agents.db import run_select
from agents.kaguya import capacity as CAP
from agents.kaguya import planning_stats as PS
from agents.kaguya.tz import SP_TZ, today_sp

_MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro",
           "outubro", "novembro", "dezembro"]
_LOCAL_DAY = "(t.completed_at AT TIME ZONE 'America/Sao_Paulo')::date"


def _label(year: int, month: Optional[int]) -> str:
    return f"{_MONTHS[month - 1]} de {year}" if month else str(year)


def _space_clause(space: Optional[str], params: dict) -> str:
    if space in ("work", "personal"):
        params["space"] = space
        return " AND p.context = %(space)s"
    return ""


def _local(ts: datetime) -> datetime:
    return ts.astimezone(SP_TZ)


def _completions(start: date, end: date, space: Optional[str]) -> list[dict]:
    """Tarefas-pai concluídas no período (dia LOCAL), com lista, espaço, prazo e etiquetas."""
    params: dict = {"a": start, "b": end}
    clause = _space_clause(space, params)
    rows = run_select(
        f"""
        SELECT t.id, t.title, t.priority, t.due_date, t.duration_min, t.created_at, t.completed_at,
               p.id AS project_id, p.name AS project_name, p.context
          FROM tasks t JOIN task_projects p ON p.id = t.project_id
         WHERE t.deleted_at IS NULL AND t.parent_id IS NULL AND t.completed_at IS NOT NULL
           AND {_LOCAL_DAY} BETWEEN %(a)s AND %(b)s {clause}
        """,
        params,
    )
    tags_by_task: dict[int, list[str]] = {}
    if rows:
        for r in run_select(
            "SELECT l.task_id, g.name FROM task_tag_links l JOIN task_tags g ON g.id = l.tag_id WHERE l.task_id = ANY(%(ids)s)",
            {"ids": [r["id"] for r in rows]},
        ):
            tags_by_task.setdefault(r["task_id"], []).append(r["name"])
    out = []
    for r in rows:
        done_local = _local(r["completed_at"])
        out.append({
            "id": r["id"], "title": r["title"], "priority": r["priority"], "due_date": r["due_date"],
            "duration_min": r["duration_min"], "project_id": r["project_id"], "project_name": r["project_name"],
            "context": r["context"], "tags": tags_by_task.get(r["id"], []),
            "completed_day": done_local.date(), "completed_hour": done_local.hour,
            "created_day": _local(r["created_at"]).date(),
        })
    return out


def _count_completed(start: date, end: date, space: Optional[str]) -> int:
    params: dict = {"a": start, "b": end}
    clause = _space_clause(space, params)
    return int(run_select(
        f"SELECT COUNT(*) AS n FROM tasks t JOIN task_projects p ON p.id = t.project_id "
        f"WHERE t.deleted_at IS NULL AND t.parent_id IS NULL AND t.completed_at IS NOT NULL "
        f"AND {_LOCAL_DAY} BETWEEN %(a)s AND %(b)s {clause}", params)[0]["n"])


def _activity(start: date, end: date, kinds: tuple[str, ...], space: Optional[str]) -> list[dict]:
    params: dict = {"a": start, "b": end, "kinds": list(kinds)}
    clause = _space_clause(space, params)
    rows = run_select(
        f"""
        SELECT a.task_id, a.kind, a.from_value, a.to_value, t.title, t.duration_min
          FROM task_activity a
          JOIN tasks t ON t.id = a.task_id
          JOIN task_projects p ON p.id = t.project_id
         WHERE a.kind = ANY(%(kinds)s) AND t.deleted_at IS NULL
           AND (a.at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN %(a)s AND %(b)s {clause}
        """,
        params,
    )
    return rows


def _habits_pct(start: date, end: date) -> Optional[float]:
    """% médio de cumprimento dos hábitos ativos: check-ins ÷ esperado (freq_num/freq_den por dia)."""
    habits = run_select(
        "SELECT h.id, h.freq_num, h.freq_den, (h.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS since, "
        "COUNT(c.id) FILTER (WHERE c.date BETWEEN %(a)s AND %(b)s) AS done "
        "FROM habits h LEFT JOIN habit_checkins c ON c.habit_id = h.id "
        "WHERE h.archived_at IS NULL GROUP BY h.id",
        {"a": start, "b": end},
    )
    pcts = []
    for h in habits:
        first = max(start, h["since"])
        days = (end - first).days + 1
        if days <= 0:
            continue
        expected = days * h["freq_num"] / h["freq_den"]
        pcts.append(min(100.0, 100 * h["done"] / expected) if expected else 0.0)
    return round(sum(pcts) / len(pcts), 1) if pcts else None


def _focus_block(start: date, end: date) -> dict:
    from agents.kaguya.tools_focus import get_focus_stats
    s = get_focus_stats(start.isoformat(), end.isoformat())
    return {"minutes": s["totals"]["total_min"], "sessions": s["totals"]["sessoes"], "by_day": s["by_day"],
            "outcome": s["outcome"]}


def _free_minutes(days: list[date]) -> dict[date, int]:
    """Tempo livre (trabalho + geral) de cada dia segundo a agenda — sem compromissos do calendário."""
    from agents.kaguya.tools_schedule import _load_prefs_row
    prefs = _load_prefs_row()
    overrides = {r["day"]: r for r in run_select(
        "SELECT * FROM kaguya_schedule_overrides WHERE day BETWEEN %(a)s AND %(b)s", {"a": min(days), "b": max(days)}
    )} if days else {}
    return {d: CAP.compute_free_time(CAP.resolve_day_schedule(prefs, d, overrides.get(d)), [])["total"]["livre_min"]
            for d in days}


def get_stats_payload(year: Optional[int] = None, month: Optional[int] = None, space: Optional[str] = None) -> dict:
    """Monta o ``StatsPayload`` de tarefas + o bloco ``planning``.

    Args:
        year: Ano (padrão: o ano atual em São Paulo).
        month: Mês 1–12 (padrão: o ano todo).
        space: ``work`` | ``personal`` restringe às listas do espaço; ``None`` = tudo.

    Returns:
        ``{period, previous, kpis, daily, monthly, monthlyUnit, distribution, rankings, records,
        moments, planning}``. ``planning`` traz ``plan``, ``pushed``, ``estimates``, ``overload``,
        ``age``, ``weekday``, ``hours``, ``lead_time_days``, ``insights``, ``data_since`` (início do
        histórico de eventos — antes dele não há "planejado × feito").
    """
    today = today_sp()
    year = year or today.year
    if month is not None and not 1 <= month <= 12:
        raise ValueError("month deve estar entre 1 e 12")
    space = space if space in ("work", "personal") else None
    start, end = PS.period_bounds(year, month)
    pstart, pend = PS.period_bounds(year - 1, month)

    done = _completions(start, end, space)
    on_time = PS.on_time_split(done)
    days = [c["completed_day"] for c in done]
    best, current = PS.best_streak(days, today)
    prev_done = _count_completed(pstart, pend, space)

    focus = _focus_block(start, end)
    prev_focus = _focus_block(pstart, pend)["minutes"]
    habits = _habits_pct(start, min(end, today))

    from agents.kaguya.tools_experiments import list_experiments
    from agents.kaguya.tools_goals import list_goals
    goals = list_goals()
    experiments = list_experiments()
    goal_pcts = [g["progress_pct"] for g in goals if g.get("progress_pct") is not None]
    exp_pcts = [e["adherence_pct"] for e in experiments if e.get("adherence_pct") is not None]

    kpis = [
        {"key": "completed", "label": "Concluídas", "value": len(done), "prev": prev_done or None},
        {"key": "on_time_pct", "label": "No prazo", "value": on_time["on_time_pct"] or 0, "unit": "%", "decimals": 0,
         "prev": None},
        {"key": "late", "label": "Atrasadas", "value": on_time["late"], "prev": None},
        {"key": "focus_min", "label": "Foco", "value": focus["minutes"], "unit": "min", "prev": prev_focus or None},
        {"key": "habits_pct", "label": "Hábitos", "value": habits or 0, "unit": "%", "decimals": 0, "prev": None},
        {"key": "goals_pct", "label": "Metas", "value": round(sum(goal_pcts) / len(goal_pcts)) if goal_pcts else 0,
         "unit": "%", "decimals": 0, "prev": None},
        {"key": "experiments_pct", "label": "Experimentos",
         "value": round(sum(exp_pcts) / len(exp_pcts)) if exp_pcts else 0, "unit": "%", "decimals": 0, "prev": None},
    ]

    # ── planejamento ──────────────────────────────────────────────────────────
    plan_events = _activity(start, end, ("my_day_in",), space)
    plans = [{"task_id": e["task_id"], "day": date.fromisoformat(e["to_value"])}
             for e in plan_events if e.get("to_value")]
    completed_on_rows = run_select(
        f"SELECT t.id, {_LOCAL_DAY} AS d FROM tasks t WHERE t.completed_at IS NOT NULL AND t.deleted_at IS NULL "
        f"AND t.id = ANY(%(ids)s)", {"ids": sorted({p["task_id"] for p in plans}) or [0]})
    completed_on = {r["id"]: r["d"] for r in completed_on_rows}
    plan = PS.plan_vs_done(plans, completed_on)

    push_events = _activity(start, end, ("rescheduled", "my_day_in"), space)
    pushed = PS.pushed_tasks(push_events, {e["task_id"]: e["title"] for e in push_events})

    est_rows = []
    est_ids = [c["id"] for c in done if (c["duration_min"] or 0) > 0]
    if est_ids:
        focused = {r["task_id"]: int(r["m"]) for r in run_select(
            "SELECT task_id, SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60) AS m FROM focus_sessions "
            "WHERE task_id = ANY(%(ids)s) AND outcome = 'completed' GROUP BY task_id", {"ids": est_ids})}
        est_rows = [{"estimated_min": c["duration_min"], "focused_min": focused.get(c["id"], 0)} for c in done
                    if c["id"] in est_ids]
    estimates = PS.estimate_accuracy(est_rows)

    planned_min: dict[date, int] = {}
    for e in plan_events:
        if e.get("to_value"):
            d = date.fromisoformat(e["to_value"])
            planned_min[d] = planned_min.get(d, 0) + (e["duration_min"] or 0)
    overload = PS.overload_days(planned_min, _free_minutes(list(planned_min)))

    open_params: dict = {}
    open_clause = _space_clause(space, open_params)
    open_rows = run_select(
        f"SELECT t.id, t.created_at, t.gtd_status, t.follow_up_date, p.is_inbox FROM tasks t "
        f"JOIN task_projects p ON p.id = t.project_id WHERE t.deleted_at IS NULL AND t.completed_at IS NULL "
        f"AND t.parent_id IS NULL AND p.archived_at IS NULL {open_clause}",
        open_params,
    )
    open_tasks = [{"created_day": _local(r["created_at"]).date(), **r} for r in open_rows]
    age = PS.age_buckets(open_tasks, today)
    inbox_old = sum(1 for t in open_tasks if t["is_inbox"] and (today - t["created_day"]).days > 7)
    waiting_no_followup = sum(1 for t in open_tasks if t["gtd_status"] == "waiting" and t["follow_up_date"] is None)

    first_event = run_select("SELECT MIN(at) AS first FROM task_activity")
    data_since = _local(first_event[0]["first"]).date().isoformat() if first_event and first_event[0]["first"] else None

    plan_by_day = {d.isoformat(): v for d, v in plan["by_day"].items()}
    planning = {
        "plan": {**plan, "by_day": plan_by_day},
        "pushed": pushed, "estimates": estimates, "overload": {
            **overload, "worst": [{**w, "day": w["day"].isoformat()} for w in overload["worst"]]},
        "age": age, "on_time": on_time, "inbox_old": inbox_old, "waiting_no_followup": waiting_no_followup,
        "weekday": PS.weekday_distribution(days), "hours": PS.hour_distribution([c["completed_hour"] for c in done]),
        "lead_time_days": PS.lead_time_days(done), "data_since": data_since,
    }
    planning["insights"] = PS.build_insights(planning)

    by_priority = {3: "Alta", 2: "Média", 1: "Baixa", 0: "Sem prioridade"}
    return {
        "period": {"year": year, "month": month, "label": _label(year, month)},
        "previous": {"label": _label(year - 1, month)},
        "kpis": kpis,
        "daily": [{"date": d.isoformat(), "value": n} for d, n in sorted(PS.daily_counts(done).items())],
        "monthly": PS.monthly_counts(done, year),
        "monthlyUnit": "tarefas",
        "distribution": [{"bucket": by_priority[p], "count": sum(1 for c in done if c["priority"] == p)} for p in (3, 2, 1, 0)],
        "rankings": {
            "lists": {"title": "Concluídas por lista", "items": PS.ranking(c["project_name"] for c in done)},
            "tags": {"title": "Concluídas por etiqueta", "items": PS.ranking(t for c in done for t in c["tags"])},
            "late_lists": {"title": "Atrasos por lista", "items": PS.ranking(
                c["project_name"] for c in done if c["due_date"] and c["completed_day"] > c["due_date"])},
        },
        "records": [
            {"label": "Maior sequência de dias com conclusões", "value": f"{best} dias"},
            {"label": "Sequência atual", "value": f"{current} dias"},
            *([{"label": "Dia mais produtivo", "value": f"{max(PS.daily_counts(done).values())} tarefas",
                "detail": max(PS.daily_counts(done).items(), key=lambda kv: (kv[1], kv[0]))[0].isoformat()}] if done else []),
            *([{"label": "Tempo mediano até concluir", "value": f"{planning['lead_time_days']:.0f} dias"}]
              if planning["lead_time_days"] is not None else []),
        ],
        "moments": [{"id": c["id"], "title": c["title"], "subtitle": c["project_name"]}
                    for c in sorted(done, key=lambda c: (-c["priority"], -(c["duration_min"] or 0)))[:5]],
        "planning": planning,
        "habits": {"pct": habits},
        "goals": {"count": len(goals), "avg_progress_pct": round(sum(goal_pcts) / len(goal_pcts)) if goal_pcts else None},
        "experiments": {"count": len(experiments), "avg_adherence_pct": round(sum(exp_pcts) / len(exp_pcts)) if exp_pcts else None},
        "focus": {"minutes": focus["minutes"], "sessions": focus["sessions"]},
        "space": space,
        "generated_for": today.isoformat(),
    }
