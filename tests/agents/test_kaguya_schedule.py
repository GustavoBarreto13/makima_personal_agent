"""Spec 075 — agenda do usuário (expediente, almoço, acordar/dormir, exceções).

Sem banco: ``run_select``/``run_dml`` de ``tools_schedule`` são substituídos por um dicionário
em memória, o suficiente para validar regras, ISO weekday e a resolução do dia.
"""

from datetime import date, time

import pytest

from agents.kaguya import tools_schedule as S

DEFAULT = {
    "work_days": [1, 2, 3, 4, 5],
    "work_start": time(9), "work_end": time(18),
    "lunch_start": time(12), "lunch_end": time(13), "lunch_is_free": False,
    "wake_time": time(7), "sleep_time": time(23),
}


@pytest.fixture()
def db(monkeypatch):
    """Banco em memória: uma linha de prefs e um dict de exceções por dia."""
    state = {"prefs": dict(DEFAULT), "overrides": {}, "last_update": None}

    def run_select(sql, params=None):
        if "FROM kaguya_schedule_prefs" in sql:
            return [dict(state["prefs"])]
        if "FROM kaguya_schedule_overrides WHERE day = " in sql:
            row = state["overrides"].get(params["d"])
            return [row] if row else []
        if "FROM kaguya_schedule_overrides" in sql:
            return [state["overrides"][k] for k in sorted(state["overrides"]) if k >= date.fromisoformat(params["a"])]
        raise AssertionError(sql)

    def run_dml(sql, params=None):
        if sql.startswith("UPDATE kaguya_schedule_prefs"):
            state["last_update"] = dict(params)
            state["prefs"].update(params)
            return 1
        if sql.lstrip().startswith("INSERT INTO kaguya_schedule_overrides"):
            state["overrides"][params["d"]] = {
                "day": params["d"], "works": params["w"], "work_start": params["i"],
                "work_end": params["f"], "note": params["n"],
            }
            return 1
        if sql.startswith("DELETE FROM kaguya_schedule_overrides"):
            return 1 if state["overrides"].pop(params["d"], None) else 0
        raise AssertionError(sql)

    monkeypatch.setattr(S, "run_select", run_select)
    monkeypatch.setattr(S, "run_dml", run_dml)
    return state


def test_get_prefs_formata_horarios_e_ordena_dias(db):
    db["prefs"]["work_days"] = [5, 1, 3]
    p = S.get_schedule_prefs()
    assert p["work_days"] == [1, 3, 5] and p["work_start"] == "09:00" and p["wake_time"] == "07:00"


def test_set_prefs_patch_parcial_e_validacoes(db):
    assert S.set_schedule_prefs(work_start="08:30", work_end="17:30")["status"] == "ok"
    assert db["prefs"]["work_start"] == time(8, 30)
    assert S.set_schedule_prefs()["status"] == "error"                                   # nada informado
    assert S.set_schedule_prefs(work_days=[0, 8])["status"] == "error"                   # fora de 1..7
    assert S.set_schedule_prefs(work_start="19:00")["status"] == "error"                 # fim antes do início
    assert S.set_schedule_prefs(work_start="9h")["status"] == "error"                    # formato
    assert S.set_schedule_prefs(lunch_start="14:00", lunch_end="13:00")["status"] == "error"


def test_set_prefs_limpar_almoco(db):
    assert S.set_schedule_prefs(clear_lunch=True)["status"] == "ok"
    assert db["prefs"]["lunch_start"] is None and db["prefs"]["lunch_end"] is None


def test_override_sabado_trabalhado_e_folga(db):
    sab = date(2026, 6, 6)
    assert S.is_work_day(sab) is False
    assert S.set_schedule_override("2026-06-06", True, "08:00", "12:00", "plantão")["status"] == "ok"
    sched = S.get_day_schedule(sab)
    assert sched["works"] is True and sched["work"] == (480, 720)
    assert S.set_schedule_override("2026-06-01", False)["override"]["work_start"] is None   # folga sem horário
    assert S.is_work_day(date(2026, 6, 1)) is False
    assert S.clear_schedule_override("2026-06-01")["status"] == "ok"
    assert S.is_work_day(date(2026, 6, 1)) is True
    assert S.clear_schedule_override("2026-06-01")["status"] == "error"


def test_override_valida_entrada(db):
    assert S.set_schedule_override("06/06", True)["status"] == "error"
    assert S.set_schedule_override("2026-06-06", True, "08:00")["status"] == "error"          # só o início
    assert S.set_schedule_override("2026-06-06", True, "12:00", "08:00")["status"] == "error"


def test_list_overrides_ordenado(db):
    S.set_schedule_override("2026-06-20", True)
    S.set_schedule_override("2026-06-10", False)
    assert [o["day"] for o in S.list_schedule_overrides("2026-06-01")] == ["2026-06-10", "2026-06-20"]
