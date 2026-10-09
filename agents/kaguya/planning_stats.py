"""Motor PURO das estatísticas de planejamento da Kaguya (spec 075) — sem banco, sem relógio.

Recebe listas de dicionários já carregadas e devolve números e *insights* que mostram **onde o
planejamento falha**: planejado × feito no Meu Dia, tarefas empurradas, estimativas que não batem
com o tempo real, dias sobrecarregados, idade das pendências e horas mais produtivas.

Datas são ``datetime.date`` no fuso do usuário (quem chama converte); horas são inteiras 0–23.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, timedelta
from statistics import median
from typing import Iterable, Optional, Sequence

WEEKDAY_NAMES = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


# ── período ──────────────────────────────────────────────────────────────────

def period_bounds(year: int, month: Optional[int] = None) -> tuple[date, date]:
    """Primeiro e último dia (inclusive) do ano ou do mês pedido."""
    if month:
        start = date(year, month, 1)
        end = (date(year + (month == 12), (month % 12) + 1, 1)) - timedelta(days=1)
        return start, end
    return date(year, 1, 1), date(year, 12, 31)


def daterange(start: date, end: date) -> Iterable[date]:
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


# ── conclusões ───────────────────────────────────────────────────────────────

def on_time_split(completions: Sequence[dict]) -> dict:
    """Separa as conclusões com prazo em *no prazo* (concluída até o dia do vencimento) e *atrasadas*.

    Args:
        completions: Itens com ``due_date`` (date|None) e ``completed_day`` (date).

    Returns:
        ``{"on_time", "late", "no_due", "on_time_pct"}`` — ``on_time_pct`` é ``None`` sem nenhuma
        conclusão com prazo.
    """
    on_time = late = no_due = 0
    for c in completions:
        if c.get("due_date") is None:
            no_due += 1
        elif c["completed_day"] <= c["due_date"]:
            on_time += 1
        else:
            late += 1
    with_due = on_time + late
    return {
        "on_time": on_time, "late": late, "no_due": no_due,
        "on_time_pct": round(100 * on_time / with_due, 1) if with_due else None,
    }


def daily_counts(completions: Sequence[dict]) -> dict[date, int]:
    return dict(Counter(c["completed_day"] for c in completions))


def monthly_counts(completions: Sequence[dict], year: int) -> list[dict]:
    """12 pontos ``{"month": 1..12, "value": n}`` (zero-fill) do ano pedido."""
    counts = Counter(c["completed_day"].month for c in completions if c["completed_day"].year == year)
    return [{"month": m, "value": counts.get(m, 0)} for m in range(1, 13)]


def best_streak(days: Iterable[date], today: date) -> tuple[int, int]:
    """(maior sequência, sequência atual) de dias corridos com atividade; a atual vale até ontem."""
    ordered = sorted(set(days))
    best = run = 0
    prev = None
    for d in ordered:
        run = run + 1 if prev is not None and (d - prev).days == 1 else 1
        best = max(best, run)
        prev = d
    have = set(ordered)
    cursor = today if today in have else today - timedelta(days=1)
    current = 0
    while cursor in have:
        current += 1
        cursor -= timedelta(days=1)
    return best, current


def ranking(items: Iterable[Optional[str]], top: int = 8) -> list[dict]:
    """Top-N por frequência: ``[{"label", "count"}]`` (ignora vazios; desempate alfabético)."""
    c = Counter(i for i in items if i)
    return [{"label": k, "count": n} for k, n in sorted(c.items(), key=lambda kv: (-kv[1], kv[0].lower()))[:top]]


def weekday_distribution(days: Iterable[date]) -> list[dict]:
    """Conclusões por dia da semana (segunda…domingo), zero-fill."""
    c = Counter(d.weekday() for d in days)
    return [{"bucket": WEEKDAY_NAMES[i], "count": c.get(i, 0)} for i in range(7)]


def hour_distribution(hours: Iterable[int]) -> list[dict]:
    """Conclusões por hora do dia (0–23), zero-fill."""
    c = Counter(hours)
    return [{"bucket": f"{h:02d}h", "count": c.get(h, 0)} for h in range(24)]


def lead_time_days(completions: Sequence[dict]) -> Optional[float]:
    """Mediana de dias entre criar e concluir (``created_day`` → ``completed_day``)."""
    gaps = [(c["completed_day"] - c["created_day"]).days for c in completions if c.get("created_day")]
    return float(median(gaps)) if gaps else None


# ── planejamento ─────────────────────────────────────────────────────────────

def plan_vs_done(plans: Sequence[dict], completed_on: dict[int, date]) -> dict:
    """Planejado × feito no Meu Dia.

    Args:
        plans: ``{"task_id", "day"}`` — a tarefa foi colocada no Meu Dia desse dia (um por par).
        completed_on: ``task_id`` → dia local em que foi concluída.

    Returns:
        ``{"planned", "done", "rate", "by_weekday": [{"bucket","planned","done","rate"}], "by_day": {...}}``
        — ``done`` conta o que foi concluído **no dia planejado** (ou antes dele).
    """
    seen = set()
    planned = done = 0
    by_wd: dict[int, list[int]] = defaultdict(lambda: [0, 0])
    by_day: dict[date, list[int]] = defaultdict(lambda: [0, 0])
    for p in plans:
        key = (p["task_id"], p["day"])
        if key in seen:
            continue
        seen.add(key)
        ok = p["task_id"] in completed_on and completed_on[p["task_id"]] <= p["day"]
        planned += 1
        done += ok
        by_wd[p["day"].weekday()][0] += 1
        by_wd[p["day"].weekday()][1] += ok
        by_day[p["day"]][0] += 1
        by_day[p["day"]][1] += ok

    def rate(a: int, b: int) -> Optional[float]:
        return round(100 * b / a, 1) if a else None

    return {
        "planned": planned, "done": done, "rate": rate(planned, done),
        "by_weekday": [
            {"bucket": WEEKDAY_NAMES[i], "planned": by_wd[i][0], "done": by_wd[i][1], "rate": rate(*by_wd[i])}
            for i in range(7)
        ],
        "by_day": {d: v for d, v in by_day.items()},
    }


def pushed_tasks(events: Sequence[dict], titles: dict[int, str], top: int = 8) -> dict:
    """Tarefas mais empurradas: conta reagendamentos de vencimento e trocas de dia no Meu Dia.

    Args:
        events: ``{"task_id", "kind", "from_value"}`` com ``kind`` em ``rescheduled`` | ``my_day_in``.
            Um ``my_day_in`` só conta como "empurrada" quando já havia um dia anterior (``from_value``).
        titles: ``task_id`` → título.

    Returns:
        ``{"top": [{"task_id","title","count"}], "total_pushes", "tasks_pushed"}``.
    """
    c: Counter = Counter()
    for e in events:
        if e["kind"] == "rescheduled" and e.get("from_value"):
            c[e["task_id"]] += 1
        elif e["kind"] == "my_day_in" and e.get("from_value"):
            c[e["task_id"]] += 1
    ordered = sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))[:top]
    return {
        "top": [{"task_id": tid, "title": titles.get(tid, f"#{tid}"), "count": n} for tid, n in ordered],
        "total_pushes": sum(c.values()),
        "tasks_pushed": len(c),
    }


def estimate_accuracy(rows: Sequence[dict]) -> dict:
    """Estimado × tempo real de foco, em tarefas concluídas que tinham os dois.

    Args:
        rows: ``{"estimated_min", "focused_min"}`` por tarefa (só entra quem tem estimativa > 0 e foco > 0).

    Returns:
        ``{"n", "estimated_min", "focused_min", "ratio", "bias_pct"}`` — ``ratio`` = real ÷ estimado
        (``1.4`` = leva 40% mais do que se estima); ``bias_pct`` é esse desvio em porcentagem.
    """
    pairs = [(r["estimated_min"], r["focused_min"]) for r in rows
             if (r.get("estimated_min") or 0) > 0 and (r.get("focused_min") or 0) > 0]
    if not pairs:
        return {"n": 0, "estimated_min": 0, "focused_min": 0, "ratio": None, "bias_pct": None}
    est = sum(p[0] for p in pairs)
    real = sum(p[1] for p in pairs)
    ratio = real / est
    return {"n": len(pairs), "estimated_min": est, "focused_min": real,
            "ratio": round(ratio, 2), "bias_pct": round((ratio - 1) * 100)}


def overload_days(planned_min: dict[date, int], free_min: dict[date, int]) -> dict:
    """Dias em que o plano passou do tempo livre.

    Args:
        planned_min: dia → minutos estimados planejados no Meu Dia.
        free_min: dia → tempo livre (trabalho + geral) segundo a agenda.

    Returns:
        ``{"days_planned", "days_over", "worst": [{"day","planned_min","free_min","over_min"}]}``.
    """
    over = []
    for d, planned in planned_min.items():
        free = free_min.get(d)
        if free is not None and planned > free:
            over.append({"day": d, "planned_min": planned, "free_min": free, "over_min": planned - free})
    over.sort(key=lambda x: -x["over_min"])
    return {"days_planned": len(planned_min), "days_over": len(over), "worst": over[:5]}


def age_buckets(open_tasks: Sequence[dict], today: date) -> list[dict]:
    """Idade das pendências abertas (dias desde a criação): 0–7, 8–30, 31–90, 90+."""
    edges = [(7, "até 1 semana"), (30, "1 semana a 1 mês"), (90, "1 a 3 meses"), (10**9, "mais de 3 meses")]
    counts = [0] * len(edges)
    for t in open_tasks:
        age = (today - t["created_day"]).days
        for i, (limit, _) in enumerate(edges):
            if age <= limit:
                counts[i] += 1
                break
    return [{"bucket": label, "count": counts[i]} for i, (_, label) in enumerate(edges)]


# ── insights ─────────────────────────────────────────────────────────────────

def build_insights(planning: dict) -> list[dict]:
    """Traduz os números em achados acionáveis (os "gaps" de planejamento).

    Args:
        planning: o dicionário ``planning`` montado por ``get_stats_payload`` (chaves ``plan``,
            ``pushed``, ``estimates``, ``overload``, ``age``, ``on_time``, ``waiting_no_followup``,
            ``inbox_old``).

    Returns:
        Lista ordenada por gravidade de ``{"key","severity","text","action"}``; ``severity`` em
        ``info`` | ``warn`` | ``alert``. Só inclui o que tem base de dados suficiente.
    """
    out: list[dict] = []

    def add(key, severity, text, action):
        out.append({"key": key, "severity": severity, "text": text, "action": action})

    plan = planning.get("plan") or {}
    if plan.get("planned", 0) >= 10 and plan.get("rate") is not None:
        if plan["rate"] < 50:
            add("plan_low", "alert",
                f"Você conclui só {plan['rate']:.0f}% do que coloca no Meu Dia — o plano é maior do que o dia.",
                "Planeje menos por dia ou revise as estimativas.")
        elif plan["rate"] < 70:
            add("plan_mid", "warn", f"{plan['rate']:.0f}% do plano do Meu Dia é concluído no dia.",
                "Deixe uma folga: planeje ~20% abaixo do tempo livre.")
        wd = [d for d in plan.get("by_weekday", []) if d["planned"] >= 3 and d["rate"] is not None]
        if len(wd) >= 3:
            worst = min(wd, key=lambda d: d["rate"])
            if worst["rate"] < 50:
                add("plan_weekday", "info", f"{worst['bucket'].capitalize()} é o dia em que o plano mais falha ({worst['rate']:.0f}% concluído).",
                    "Planeje menos nesse dia da semana.")

    pushed = planning.get("pushed") or {}
    if pushed.get("top") and pushed["top"][0]["count"] >= 3:
        t = pushed["top"][0]
        add("pushed", "warn", f"“{t['title']}” já foi empurrada {t['count']} vezes.",
            "Quebre em passos menores, delegue ou apague.")

    est = planning.get("estimates") or {}
    if est.get("n", 0) >= 5 and est.get("bias_pct") is not None and abs(est["bias_pct"]) >= 25:
        if est["bias_pct"] > 0:
            add("estimates_low", "warn", f"Suas tarefas levam {est['bias_pct']}% mais do que você estima.",
                "Aumente as estimativas nessa proporção.")
        else:
            add("estimates_high", "info", f"Você termina em {abs(est['bias_pct'])}% menos tempo do que estima.",
                "Estimativas folgadas: dá para encaixar mais.")

    over = planning.get("overload") or {}
    if over.get("days_planned", 0) >= 5 and over.get("days_over", 0) / over["days_planned"] >= 0.3:
        add("overload", "alert", f"Em {over['days_over']} de {over['days_planned']} dias o plano passou do tempo livre.",
            "Ajuste a agenda (expediente/almoço) ou planeje menos.")

    on_time = planning.get("on_time") or {}
    if on_time.get("on_time_pct") is not None and on_time["on_time"] + on_time["late"] >= 10 and on_time["on_time_pct"] < 70:
        add("late", "warn", f"Só {on_time['on_time_pct']:.0f}% das tarefas com prazo são concluídas no prazo.",
            "Coloque prazos mais realistas ou comece antes.")

    age = planning.get("age") or []
    old = next((b["count"] for b in age if b["bucket"] == "mais de 3 meses"), 0)
    if old >= 5:
        add("aging", "info", f"{old} tarefas abertas têm mais de 3 meses.", "Faça uma faxina: conclua, adie ou apague.")

    if planning.get("inbox_old", 0) >= 5:
        add("inbox", "warn", f"{planning['inbox_old']} itens parados no Inbox há mais de uma semana.",
            "Processe a Inbox (revisão semanal).")
    if planning.get("waiting_no_followup", 0) >= 1:
        add("waiting", "info", f"{planning['waiting_no_followup']} tarefa(s) aguardando sem data de cobrança.",
            "Defina um follow-up para cada uma.")

    order = {"alert": 0, "warn": 1, "info": 2}
    out.sort(key=lambda i: order[i["severity"]])
    return out
