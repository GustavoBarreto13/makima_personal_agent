"""Spec 075 fase 4 — montagem do ``StatsPayload`` de tarefas (banco simulado, sem Postgres).

Garante o formato do contrato do Design System (``design/core/stats.ts``) e que o bloco ``planning``
sai coerente. A aritmética em si é testada em ``test_kaguya_planning_stats.py``.
"""

import json
from datetime import date, datetime, timezone

import pytest

from agents.kaguya import tools_stats as TS

HOJE = date(2026, 6, 10)


def _ts(day, hour=15):
    """timestamptz às ``hour`` UTC (= hour-3 em São Paulo)."""
    return datetime(2026, 6, day, hour, 0, tzinfo=timezone.utc)


@pytest.fixture()
def fake_db(monkeypatch):
    def run_select(sql, params=None):
        params = params or {}
        if "FROM tasks t JOIN task_projects p" in sql and "t.completed_at IS NOT NULL" in sql and "COUNT(*)" in sql:
            return [{"n": 2}]
        if "t.completed_at IS NOT NULL" in sql and "p.id AS project_id" in sql:
            return [
                {"id": 1, "title": "Relatório", "priority": 3, "due_date": date(2026, 6, 8), "duration_min": 60,
                 "created_at": _ts(1), "completed_at": _ts(9), "project_id": 7, "project_name": "Trabalho", "context": "work"},
                {"id": 2, "title": "Mercado", "priority": 0, "due_date": None, "duration_min": None,
                 "created_at": _ts(8), "completed_at": _ts(9, 2), "project_id": 8, "project_name": "Casa", "context": "personal"},
            ]
        if "FROM task_tag_links l JOIN task_tags g" in sql:
            return [{"task_id": 1, "name": "foco"}]
        if "FROM task_activity a" in sql:
            kinds = params["kinds"]
            if kinds == ["my_day_in"]:
                return [{"task_id": 1, "kind": "my_day_in", "from_value": None, "to_value": "2026-06-09",
                         "title": "Relatório", "duration_min": 60}]
            return [{"task_id": 1, "kind": "rescheduled", "from_value": "2026-06-01", "to_value": "2026-06-05",
                     "title": "Relatório", "duration_min": 60}]
        if "FROM habits h LEFT JOIN" in sql:
            return [{"id": 1, "freq_num": 1, "freq_den": 1, "since": date(2026, 1, 1), "done": 5}]
        if "t.id = ANY(%(ids)s)" in sql and "AS d" in sql:
            return [{"id": 1, "d": date(2026, 6, 9)}]
        if "FROM focus_sessions" in sql:
            return [{"task_id": 1, "m": 90}]
        if "MIN(at)" in sql:
            return [{"first": _ts(1)}]
        if "FROM tasks t" in sql and "p.is_inbox" in sql:
            return [{"id": 3, "created_at": _ts(1), "gtd_status": "waiting", "follow_up_date": None, "is_inbox": True}]
        pytest.fail(f"SQL inesperado: {sql[:120]}")

    monkeypatch.setattr(TS, "run_select", run_select)
    monkeypatch.setattr(TS, "today_sp", lambda: HOJE)
    monkeypatch.setattr(TS, "_focus_block", lambda a, b: {"minutes": 120, "sessions": 4, "by_day": [], "outcome": {}})
    monkeypatch.setattr(TS, "_free_minutes", lambda days: {d: 300 for d in days})
    import agents.kaguya.tools_goals as G
    import agents.kaguya.tools_experiments as E
    monkeypatch.setattr(G, "list_goals", lambda: [{"progress_pct": 40}, {"progress_pct": 60}])
    monkeypatch.setattr(E, "list_experiments", lambda: [{"adherence_pct": 80}])


def test_payload_segue_o_contrato_do_ds(fake_db):
    p = TS.get_stats_payload(2026, 6)
    for key in ("period", "previous", "kpis", "daily", "monthly", "monthlyUnit", "distribution",
                "rankings", "records", "moments"):
        assert key in p, key
    assert p["period"] == {"year": 2026, "month": 6, "label": "junho de 2026"}
    assert p["previous"]["label"] == "junho de 2025"
    assert len(p["monthly"]) == 12 and p["monthlyUnit"] == "tarefas"
    assert {k["key"] for k in p["kpis"]} >= {"completed", "on_time_pct", "late", "focus_min", "habits_pct"}
    json.dumps(p)   # tudo serializável (sem date/datetime soltos)


def test_kpis_e_rankings_refletem_as_conclusoes(fake_db):
    p = TS.get_stats_payload(2026, 6)
    k = {x["key"]: x for x in p["kpis"]}
    assert k["completed"]["value"] == 2 and k["completed"]["prev"] == 2
    assert k["late"]["value"] == 1                                   # prazo dia 8, concluída dia 9
    assert k["habits_pct"]["value"] == 50.0                            # 5 check-ins em 10 dias de junho
    assert k["goals_pct"]["value"] == 50 and k["experiments_pct"]["value"] == 80
    assert p["rankings"]["tags"]["items"] == [{"label": "foco", "count": 1}]
    assert {i["label"] for i in p["rankings"]["lists"]["items"]} == {"Trabalho", "Casa"}
    assert p["rankings"]["late_lists"]["items"] == [{"label": "Trabalho", "count": 1}]


def test_bloco_de_planejamento(fake_db):
    plan = TS.get_stats_payload(2026, 6)["planning"]
    assert plan["plan"]["planned"] == 1 and plan["plan"]["done"] == 1 and plan["plan"]["rate"] == 100.0
    assert plan["pushed"]["top"][0]["title"] == "Relatório"
    assert plan["estimates"]["bias_pct"] == 50                       # estimou 60, focou 90
    assert plan["overload"]["days_over"] == 0                        # 60 min planejados < 300 livres
    assert plan["inbox_old"] == 1 and plan["waiting_no_followup"] == 1
    assert plan["data_since"] == "2026-06-01" and isinstance(plan["insights"], list)
    json.dumps(plan)


def test_mes_invalido(fake_db):
    with pytest.raises(ValueError):
        TS.get_stats_payload(2026, 13)


def test_padrao_e_ano_atual_e_espaco_invalido_vira_tudo(fake_db):
    p = TS.get_stats_payload()
    assert p["period"]["year"] == 2026 and p["period"]["month"] is None and p["period"]["label"] == "2026"
    assert TS.get_stats_payload(2026, space="qualquer")["space"] is None
    assert TS.get_stats_payload(2026, space="work")["space"] == "work"
