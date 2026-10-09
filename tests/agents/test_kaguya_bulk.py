"""Spec 075 — edição em massa: validações puras + integração (pulada sem banco)."""

import os

import pytest

from agents.kaguya import tools_bulk as B


def test_sem_ids_ou_acao_invalida_nao_toca_o_banco(monkeypatch):
    monkeypatch.setattr(B, "get_conn", lambda: pytest.fail("não deveria abrir conexão"))
    assert B.bulk_update_tasks([], "complete")["status"] == "error"
    assert B.bulk_update_tasks([1], "explodir")["status"] == "error"


def test_acoes_documentadas_e_snapshot_so_com_campos_permitidos():
    assert "complete" in B.ACTIONS and "add_tag" in B.ACTIONS and len(B.ACTIONS) == len(set(B.ACTIONS))
    with pytest.raises(AssertionError):
        B._snapshot(None, [1], ("title; DROP TABLE tasks",))   # allowlist: nada de nome livre


# ── integração ────────────────────────────────────────────────────────────────
pytestmark_db = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="DATABASE_URL não definida")


@pytestmark_db
def test_int_bulk_priority_e_undo():
    from agents.kaguya import tools_projects as P, tools_tasks as T
    from agents.db import run_select
    inbox = run_select("SELECT id FROM task_projects WHERE is_inbox")[0]["id"]
    a = T.create_task("a", project_id=inbox, priority=1)["id"]
    b = T.create_task("b", project_id=inbox, priority=2)["id"]
    r = B.bulk_update_tasks([a, b], "set_priority", 3)
    assert r["status"] == "ok" and r["affected"] == 2
    assert {x["priority"] for x in run_select("SELECT priority FROM tasks WHERE id IN (%(a)s, %(b)s)", {"a": a, "b": b})} == {3}
    assert B.undo_bulk_update(r["undo"])["status"] == "ok"
    got = {x["id"]: x["priority"] for x in run_select("SELECT id, priority FROM tasks WHERE id IN (%(a)s, %(b)s)", {"a": a, "b": b})}
    assert got == {a: 1, b: 2}


@pytestmark_db
def test_int_bulk_complete_recorrente_e_undo_nao_duplica():
    from agents.kaguya import recurrence as R, tools_tasks as T
    from agents.db import run_select
    inbox = run_select("SELECT id FROM task_projects WHERE is_inbox")[0]["id"]
    rec = T.create_task("rec", project_id=inbox, due_date="2026-06-05",
                        recurrence={"rrule": R.build_rrule("DAILY"), "mode": "fixed"})["id"]
    simple = T.create_task("simples", project_id=inbox)["id"]
    r = B.bulk_update_tasks([rec, simple], "complete")
    assert r["status"] == "ok" and len(r["undo"]["pairs"]) == 1
    assert B.undo_bulk_update(r["undo"])["status"] == "ok"
    open_rec = run_select("SELECT COUNT(*) AS n FROM tasks WHERE title = 'rec' AND completed_at IS NULL AND deleted_at IS NULL")[0]["n"]
    assert open_rec == 1
    owner = run_select("SELECT task_id FROM task_recurrences")[0]["task_id"]
    assert owner == rec
