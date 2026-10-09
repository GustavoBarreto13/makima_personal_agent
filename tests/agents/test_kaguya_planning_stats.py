"""Spec 075 fase 4 — motor puro das estatísticas de planejamento (sem banco)."""

from datetime import date, timedelta

from agents.kaguya import planning_stats as PS

D = date(2026, 6, 10)   # quarta


def test_period_bounds_ano_mes_e_dezembro():
    assert PS.period_bounds(2026) == (date(2026, 1, 1), date(2026, 12, 31))
    assert PS.period_bounds(2026, 2) == (date(2026, 2, 1), date(2026, 2, 28))
    assert PS.period_bounds(2026, 12) == (date(2026, 12, 1), date(2026, 12, 31))
    assert PS.period_bounds(2028, 2)[1] == date(2028, 2, 29)


def test_on_time_split():
    r = PS.on_time_split([
        {"due_date": D, "completed_day": D},                       # no prazo
        {"due_date": D, "completed_day": D - timedelta(days=2)},   # adiantada = no prazo
        {"due_date": D, "completed_day": D + timedelta(days=1)},   # atrasada
        {"due_date": None, "completed_day": D},
    ])
    assert (r["on_time"], r["late"], r["no_due"]) == (2, 1, 1) and r["on_time_pct"] == 66.7
    assert PS.on_time_split([{"due_date": None, "completed_day": D}])["on_time_pct"] is None


def test_monthly_counts_zero_fill_e_ignora_outro_ano():
    rows = [{"completed_day": date(2026, 3, 1)}, {"completed_day": date(2026, 3, 9)}, {"completed_day": date(2025, 3, 1)}]
    m = PS.monthly_counts(rows, 2026)
    assert len(m) == 12 and m[2] == {"month": 3, "value": 2} and m[0]["value"] == 0


def test_best_streak_atual_vale_ate_ontem():
    days = [D - timedelta(days=i) for i in (1, 2, 3, 6, 7)]        # ontem, -2, -3 ; e outra sequência de 2
    assert PS.best_streak(days, D) == (3, 3)                       # hoje sem registro não quebra
    assert PS.best_streak(days, D + timedelta(days=2)) == (3, 0)   # anteontem sem registro quebra
    assert PS.best_streak([], D) == (0, 0)


def test_ranking_desempate_e_ignora_vazios():
    assert PS.ranking(["b", "a", "b", None, "", "a", "c"]) == [
        {"label": "a", "count": 2}, {"label": "b", "count": 2}, {"label": "c", "count": 1}]


def test_distribuicoes_com_zero_fill():
    wd = PS.weekday_distribution([date(2026, 6, 8), date(2026, 6, 8), date(2026, 6, 14)])   # seg, seg, dom
    assert [w["count"] for w in wd] == [2, 0, 0, 0, 0, 0, 1] and wd[0]["bucket"] == "segunda"
    hrs = PS.hour_distribution([9, 9, 23])
    assert len(hrs) == 24 and hrs[9]["count"] == 2 and hrs[23]["bucket"] == "23h"


def test_lead_time_mediana():
    rows = [{"created_day": D - timedelta(days=n), "completed_day": D} for n in (1, 3, 100)]
    assert PS.lead_time_days(rows) == 3.0
    assert PS.lead_time_days([]) is None


def test_plan_vs_done_conta_no_dia_planejado_ou_antes():
    plans = [
        {"task_id": 1, "day": D},                                  # feita no dia
        {"task_id": 2, "day": D},                                  # feita depois → falhou
        {"task_id": 3, "day": D},                                  # nunca feita
        {"task_id": 4, "day": D},                                  # feita antes do dia
        {"task_id": 1, "day": D},                                  # duplicata ignorada
    ]
    done = {1: D, 2: D + timedelta(days=2), 4: D - timedelta(days=1)}
    r = PS.plan_vs_done(plans, done)
    assert (r["planned"], r["done"], r["rate"]) == (4, 2, 50.0)
    wed = next(w for w in r["by_weekday"] if w["bucket"] == "quarta")
    assert wed["planned"] == 4 and wed["done"] == 2


def test_pushed_tasks_so_conta_quando_havia_dia_anterior():
    events = [
        {"task_id": 1, "kind": "rescheduled", "from_value": "2026-06-01"},
        {"task_id": 1, "kind": "my_day_in", "from_value": "2026-06-02"},
        {"task_id": 1, "kind": "my_day_in", "from_value": None},        # 1ª vez no Meu Dia: não é empurrão
        {"task_id": 2, "kind": "rescheduled", "from_value": None},      # 1ª data: não é empurrão
    ]
    r = PS.pushed_tasks(events, {1: "Declarar IR"})
    assert r["top"] == [{"task_id": 1, "title": "Declarar IR", "count": 2}]
    assert r["total_pushes"] == 2 and r["tasks_pushed"] == 1


def test_estimate_accuracy():
    r = PS.estimate_accuracy([
        {"estimated_min": 30, "focused_min": 45}, {"estimated_min": 60, "focused_min": 90},
        {"estimated_min": 0, "focused_min": 20}, {"estimated_min": 20, "focused_min": 0},   # ignoradas
    ])
    assert r["n"] == 2 and r["ratio"] == 1.5 and r["bias_pct"] == 50
    assert PS.estimate_accuracy([])["ratio"] is None


def test_overload_days():
    r = PS.overload_days({D: 600, D + timedelta(days=1): 100}, {D: 480, D + timedelta(days=1): 480})
    assert r["days_planned"] == 2 and r["days_over"] == 1 and r["worst"][0]["over_min"] == 120


def test_age_buckets():
    tasks = [{"created_day": D - timedelta(days=n)} for n in (0, 7, 8, 30, 31, 90, 91, 400)]
    assert [b["count"] for b in PS.age_buckets(tasks, D)] == [2, 2, 2, 2]


def test_insights_so_aparecem_com_base_suficiente():
    assert PS.build_insights({}) == []
    assert PS.build_insights({"plan": {"planned": 3, "rate": 10.0, "by_weekday": []}}) == []   # poucos dados


def test_insights_ordenados_por_gravidade_e_com_acao():
    ins = PS.build_insights({
        "plan": {"planned": 40, "done": 12, "rate": 30.0, "by_weekday": [
            {"bucket": "segunda", "planned": 10, "done": 2, "rate": 20.0},
            {"bucket": "terça", "planned": 10, "done": 8, "rate": 80.0},
            {"bucket": "quarta", "planned": 10, "done": 9, "rate": 90.0}]},
        "pushed": {"top": [{"task_id": 1, "title": "IR", "count": 4}]},
        "estimates": {"n": 8, "bias_pct": 40},
        "overload": {"days_planned": 10, "days_over": 5},
        "on_time": {"on_time": 4, "late": 8, "on_time_pct": 33.3},
        "age": [{"bucket": "mais de 3 meses", "count": 7}],
        "inbox_old": 6, "waiting_no_followup": 2,
    })
    keys = [i["key"] for i in ins]
    assert keys[:2] == ["plan_low", "overload"]                 # alertas primeiro
    assert {"pushed", "estimates_low", "late", "aging", "inbox", "waiting", "plan_weekday"} <= set(keys)
    assert all(i["action"] and i["text"] for i in ins)
    sev = [i["severity"] for i in ins]
    assert sev == sorted(sev, key={"alert": 0, "warn": 1, "info": 2}.get)
