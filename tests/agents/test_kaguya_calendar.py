"""Testes da camada de lógica do calendário da Kaguya — ``tools_calendar`` (fatia 013 / P3).

Testes de **integração** contra um PostgreSQL real. O valor está no comportamento que só
o banco verdadeiro exercita: posicionar tarefas datadas numa janela **e** projetar as
ocorrências virtuais das recorrentes **sem materializar** linhas futuras (SC-005).

A aritmética pura da projeção (``recurrence.project_occurrences``) é testada à parte, sem
banco, em ``test_kaguya_recurrence.py``.

Como rodar:
    export DATABASE_URL="postgresql://postgres:test@127.0.0.1:55432/makima_test"
    pytest tests/agents/test_kaguya_calendar.py -v
"""

import os
from datetime import date

import pytest

# Sem banco configurado, não há o que testar de integração: pula o módulo inteiro.
if not os.environ.get("DATABASE_URL"):
    pytest.skip("DATABASE_URL não definida — testes de integração da Kaguya pulados.", allow_module_level=True)

from agents.db import get_conn, run_select  # noqa: E402
from agents.kaguya import tools_tasks as T  # noqa: E402
from agents.kaguya import tools_calendar as C  # noqa: E402

_SCHEMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "agents", "kaguya", "schema_tasks_pg.sql",
)
_TASK_TABLES = (
    "habit_checkins habits task_filters task_tag_links task_tags "
    "task_recurrences tasks task_columns task_projects task_project_groups"
)

# Janela fixa de junho/2026 (segundas em 1, 8, 15, 22, 29 — 01/06 é segunda).
JUN_START = date(2026, 6, 1)
JUN_END = date(2026, 6, 30)


@pytest.fixture()
def inbox_id() -> int:
    """Reseta as tabelas e reaplica o schema antes de cada teste (isolamento)."""
    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        schema_sql = f.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DROP TABLE IF EXISTS {_TASK_TABLES.replace(' ', ', ')} CASCADE")
            cur.execute(schema_sql)
            cur.execute("SELECT id FROM task_projects WHERE is_inbox")
            return cur.fetchone()[0]


def _live_task_count() -> int:
    """Conta as linhas vivas em ``tasks`` (para provar que nada foi materializado)."""
    return run_select("SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL")[0]["n"]


# ─────────────────────────────────────────────────────────────────────────────
# Tarefas datadas na janela (+ exclusão das sem data)
# ─────────────────────────────────────────────────────────────────────────────
def test_dated_tasks_in_range_only(inbox_id):
    """Só as tarefas com due_date DENTRO da janela aparecem; sem data fica de fora."""
    T.create_task("dentro", due_date="2026-06-10")
    T.create_task("fora (julho)", due_date="2026-07-10")
    T.create_task("sem data")  # não entra no grid do calendário
    itens = C.list_tasks_in_range(JUN_START.isoformat(), JUN_END.isoformat())
    titulos = {t["title"] for t in itens}
    assert titulos == {"dentro"}
    assert all(t["is_virtual"] is False for t in itens)


# ─────────────────────────────────────────────────────────────────────────────
# Subtarefas datadas entram no calendário com o título da mãe (spec 028)
# ─────────────────────────────────────────────────────────────────────────────
def test_dated_subtask_appears_with_parent_title(inbox_id):
    """Subtarefa com due_date própria aparece no grid junto da mãe, com parent_title."""
    pai = T.create_task("projeto", due_date="2026-06-10")["id"]
    T.create_task("etapa", parent_id=pai, due_date="2026-06-12")
    itens = C.list_tasks_in_range(JUN_START.isoformat(), JUN_END.isoformat())
    por_titulo = {t["title"]: t for t in itens}
    # Pai e subtarefa datada estão ambos no calendário.
    assert {"projeto", "etapa"} <= set(por_titulo)
    # A mãe não tem parent_title; a subtarefa carrega o título da mãe para o badge ↳.
    assert por_titulo["projeto"]["parent_title"] is None
    assert por_titulo["etapa"]["parent_title"] == "projeto"


# ─────────────────────────────────────────────────────────────────────────────
# Projeção virtual das recorrentes SEM materializar (SC-005)
# ─────────────────────────────────────────────────────────────────────────────
def test_recurring_projects_virtual_without_materializing(inbox_id):
    """Uma "toda segunda" projeta as segundas futuras como virtuais, sem criar linhas (SC-005)."""
    tid = T.create_task("reunião", due_date="2026-06-01")["id"]
    T.set_recurrence(tid, "FREQ=WEEKLY;BYDAY=MO", "fixed")
    antes = _live_task_count()  # 1 linha viva (a ocorrência atual)

    itens = C.list_tasks_in_range(JUN_START.isoformat(), JUN_END.isoformat())

    # A linha real de 01/06 + as virtuais 08, 15, 22, 29.
    reais = [t for t in itens if not t["is_virtual"]]
    virtuais = [t for t in itens if t["is_virtual"]]
    assert {t["due_date"] for t in reais} == {"2026-06-01"}
    assert {t["due_date"] for t in virtuais} == {"2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29"}
    # Toda virtual aponta para a série da tarefa viva e não tem id próprio.
    assert all(v["series_task_id"] == tid and v.get("id") is None for v in virtuais)
    # NADA foi materializado: a contagem de linhas vivas não mudou (invariante da 012).
    assert _live_task_count() == antes


def test_virtual_projection_bounded_by_window(inbox_id):
    """A projeção respeita a janela: navegar para julho recalcula só as segundas de julho."""
    tid = T.create_task("reunião", due_date="2026-06-01")["id"]
    T.set_recurrence(tid, "FREQ=WEEKLY;BYDAY=MO", "fixed")
    itens = C.list_tasks_in_range("2026-07-01", "2026-07-31")
    virtuais = {t["due_date"] for t in itens if t["is_virtual"]}
    assert virtuais == {"2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27"}


def test_range_filters_by_project(inbox_id):
    """Filtrar por lista restringe as tarefas datadas àquela lista."""
    from agents.kaguya import tools_projects as P
    casa = P.create_project("Casa")["id"]
    T.create_task("em casa", project_id=casa, due_date="2026-06-12")
    T.create_task("no inbox", due_date="2026-06-12")
    itens = C.list_tasks_in_range(JUN_START.isoformat(), JUN_END.isoformat(), project_id=casa)
    assert {t["title"] for t in itens} == {"em casa"}
