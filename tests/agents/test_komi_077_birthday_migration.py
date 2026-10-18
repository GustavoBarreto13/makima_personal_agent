"""Spec 077 · Fase 3 — etapa de aniversários do scripts/migrate_komi_ds.py (tabelas reais da Kaguya).

Confere: o aniversário de ``person_dates`` vira o campo da pessoa; a data de ano 2000 vira "sem
ano"; duplicata é removida; data diferente para a mesma pessoa vira CONFLITO e não é mexida;
"aniversário de namoro" segue como data comum; as tarefas do sync antigo vão para a lixeira
(as soltas, sem pessoa, não); e rodar de novo não faz nada.

Como rodar:
    export DATABASE_URL="postgresql://postgres:test@127.0.0.1:55432/makima_test"
    pytest tests/agents/test_komi_077_birthday_migration.py -v
"""

import os

import pytest

from scripts.migrate_komi_ds import planejar_aniversarios


# ── planejador puro ──────────────────────────────────────────────────────────

def _d(date_id, pid, data, task=None, name="X"):
    return {"date_id": date_id, "person_id": pid, "name": name, "date": data, "task_id": task}


def test_planejador_migra_a_primeira_remove_duplicata_e_aponta_conflito():
    r = planejar_aniversarios([
        _d(1, "a", "2000-05-15", task=9),            # sem ano (âncora 2000) → ano None
        _d(2, "b", "1992-08-03"),                    # com ano
        _d(3, "c", "2000-05-10"), _d(4, "c", "2000-06-12"),    # duas datas diferentes → conflito na 2ª
        _d(5, "d", "2000-09-03", task=7),            # d já tem 3/9 → duplicata
        _d(6, "e", "2000-01-01"), _d(7, "e", "2001-01-01"),    # mesmo dia/mês → duplicata da 1ª
    ], {"d": (3, 9)})
    assert [(i["person_id"], i["day"], i["month"], i["year"], i["task_ids"]) for i in r["migrar"]] == [
        ("a", 15, 5, None, [9]), ("b", 3, 8, 1992, []), ("c", 10, 5, None, []), ("e", 1, 1, None, [])]
    assert [(i["date_id"], i["task_ids"]) for i in r["duplicadas"]] == [(5, [7]), (7, [])]
    assert [(i["date_id"], i["day"], i["month"]) for i in r["conflitos"]] == [(4, 12, 6)]


# ── com tabelas reais ────────────────────────────────────────────────────────

pytestmark_db = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="DATABASE_URL não definida")


@pytest.fixture(scope="module")
def banco():
    from tests.agents.komi_testing import banco_completo
    with banco_completo("komi_bday_pytest") as dsn:
        yield dsn


def _sql(sql, params=None, um=False, todas=False):
    from agents.db import get_conn
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        if um:
            return cur.fetchone()
        if todas:
            return cur.fetchall()


@pytestmark_db
def test_migra_aniversarios_trata_conflitos_e_manda_tarefas_para_a_lixeira(banco, monkeypatch, capsys):
    from agents.komi import tools as K
    from scripts import migrate_komi_ds as M

    monkeypatch.setenv("GCAL_SYNC_ENABLED", "false")               # a lixeira não pode falar com o Google no teste
    ids = {n: K.create_person(n)["id"] for n in ("Bia", "Caio", "Duda", "Edu", "Fabi")}
    K.update_person(ids["Edu"], birth_day=3, birth_month=9)        # Edu já tem o campo

    def data(pessoa, label, dia):
        return _sql("INSERT INTO person_dates (person_id, label, date, recurring) VALUES (%s,%s,%s,TRUE) RETURNING id",
                    (ids[pessoa], label, dia), um=True)[0]

    inbox = _sql("SELECT id FROM task_projects WHERE is_inbox LIMIT 1", um=True)[0]

    def tarefa(titulo):
        return _sql("INSERT INTO tasks (project_id, title, type, due_date) VALUES (%s,%s,'birthday','2026-05-15') RETURNING id",
                    (inbox, titulo), um=True)[0]

    bia_data = data("Bia", "aniversário", "2000-05-15")
    bia_task = tarefa("Aniversário de Bia")
    _sql("INSERT INTO birthday_sync_links (person_date_id, task_id, komi_label) VALUES (%s,%s,'aniversário')", (bia_data, bia_task))
    data("Caio", "Aniversário", "1992-08-03")
    data("Duda", "aniversario", "2000-05-10")
    conflito = data("Duda", "aniversário", "2000-06-12")
    edu_data = data("Edu", "aniversário", "2000-09-03")
    edu_task = tarefa("Aniversário de Edu")
    _sql("INSERT INTO birthday_sync_links (person_date_id, task_id, komi_label) VALUES (%s,%s,'aniversário')", (edu_data, edu_task))
    namoro = data("Fabi", "aniversário de namoro", "2020-03-10")
    solta = tarefa("Aniversário do vizinho")                       # sem pessoa na Komi: fica como tarefa comum

    # dry-run: planeja e avisa, mas NÃO grava
    rel = M.main(apply=False)
    saida = capsys.readouterr().out
    assert rel["birthday_from_dates"]["planejadas"] == 4          # 3 a migrar (Bia, Caio, Duda) + 1 duplicata (Edu)
    assert "Duda: já tem outro aniversário" in saida and "06" in saida
    assert "1 tarefa(s) de aniversário sem pessoa" in saida
    assert _sql("SELECT count(*) FROM people WHERE birth_day IS NOT NULL", um=True)[0] == 1     # só o Edu, que já tinha
    assert _sql("SELECT count(*) FROM tasks WHERE deleted_at IS NOT NULL", um=True)[0] == 0

    # apply
    rel = M.main(apply=True)
    assert rel["birthday_from_dates"]["aplicadas"] == 3
    campos = {n: _sql("SELECT birth_day, birth_month, birth_year FROM people WHERE id=%s", (pid,), um=True) for n, pid in ids.items()}
    assert campos == {"Bia": (15, 5, None), "Caio": (3, 8, 1992), "Duda": (10, 5, None), "Edu": (3, 9, None), "Fabi": (None, None, None)}
    restantes = {r[0] for r in _sql("SELECT id FROM person_dates", todas=True)}
    assert restantes == {conflito, namoro}                          # conflito e "namoro" ficam; o resto saiu
    apagadas = {r[0] for r in _sql("SELECT id FROM tasks WHERE deleted_at IS NOT NULL", todas=True)}
    assert apagadas == {bia_task, edu_task}                         # as do sync antigo foram para a lixeira
    assert _sql("SELECT deleted_at FROM tasks WHERE id=%s", (solta,), um=True)[0] is None

    # o calendário agora mostra o aniversário vindo do campo (e não duplica com tarefa nem data)
    from agents.komi.calendar_provider import list_calendar_events
    titulos = sorted(e["title"] for e in list_calendar_events("2026-05-01", "2026-05-31"))
    assert titulos == ["🎂 aniversário — Bia", "🎂 aniversário — Duda"]

    # segunda rodada: nada a fazer (e a escolha do dono não é desfeita)
    rel = M.main(apply=True)
    assert all(v["ja_feita"] for v in rel.values())
