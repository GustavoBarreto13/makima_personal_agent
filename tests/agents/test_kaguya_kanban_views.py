"""Testes da camada de lógica de views de Kanban da Kaguya — ``tools_kanban_views`` (spec 024).

Testes de **integração** contra um PostgreSQL real (mesmo padrão de ``test_kaguya_filters``):
o valor está nos comportamentos que só o banco verdadeiro exercita — o seed idempotente
da built-in "Completa", a proteção contra editar/deletar a built-in, a validação do
``display`` e o reuso da validação de ``FilterRules`` das smart-lists.

Como rodar:
    export DATABASE_URL="postgresql://postgres:test@127.0.0.1:55432/makima_test"
    pytest tests/agents/test_kaguya_kanban_views.py -v

Sem ``DATABASE_URL`` o módulo inteiro é **pulado** (skip).
"""

import os

import pytest

# Sem banco configurado, não há o que testar de integração: pula o módulo inteiro.
if not os.environ.get("DATABASE_URL"):
    pytest.skip("DATABASE_URL não definida — testes de integração da Kaguya pulados.", allow_module_level=True)

from agents.db import get_conn, run_select  # noqa: E402
from agents.kaguya import tools_kanban_views as KV  # noqa: E402
from agents.kaguya import tools_tasks as T  # noqa: E402

# Caminho absoluto do schema (a partir deste arquivo: tests/agents/ → raiz do repo).
_SCHEMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "agents", "kaguya", "schema_tasks_pg.sql",
)

# Tabelas do domínio, na ordem de drop (dependentes primeiro) — inclui kanban_views.
_TASK_TABLES = (
    "habit_checkins habits kanban_views task_filters task_tag_links task_tags "
    "task_recurrences tasks task_columns task_projects task_project_groups"
)

# display válido mínimo para os testes (todos os adornos ligados + 3 slots válidos).
_DISPLAY = {
    "adornos": {"capacity_meter": True, "subtask_ring": True, "summary_footer": True, "card_chips": True},
    "slots": ["abertas", "tempo_estimado", "em_andamento"],
}


@pytest.fixture()
def builtin_id() -> int:
    """Reseta as tabelas e reaplica o schema antes de cada teste.

    Returns:
        O id da view built-in "Completa" recém-semeada pelo schema (teste isolado).
    """
    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        schema_sql = f.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DROP TABLE IF EXISTS {_TASK_TABLES.replace(' ', ', ')} CASCADE")
            cur.execute(schema_sql)
            cur.execute("SELECT id FROM kanban_views WHERE is_builtin")
            return cur.fetchone()[0]


# ─────────────────────────────────────────────────────────────────────────────
# Seed idempotente da built-in "Completa"
# ─────────────────────────────────────────────────────────────────────────────
def test_seed_builtin_completa_exists(builtin_id):
    """O schema semeia exatamente uma view built-in "Completa" com tudo ligado."""
    views = KV.list_views()
    builtins = [v for v in views if v["is_builtin"]]
    assert len(builtins) == 1
    completa = builtins[0]
    assert completa["name"] == "Completa"
    assert completa["display"]["adornos"]["capacity_meter"] is True
    assert completa["display"]["slots"] == ["abertas", "tempo_estimado", "em_andamento"]
    assert completa["filter"] is None


def test_seed_is_idempotent(builtin_id):
    """Reaplicar o seed não cria uma segunda built-in (índice parcial uq_kanban_views_builtin)."""
    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        schema_sql = f.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(schema_sql)  # roda o schema de novo (inclui o INSERT ... ON CONFLICT)
    assert run_select("SELECT COUNT(*) AS n FROM kanban_views WHERE is_builtin")[0]["n"] == 1


# ─────────────────────────────────────────────────────────────────────────────
# CRUD de views customizadas
# ─────────────────────────────────────────────────────────────────────────────
def test_crud_create_list_update_delete(builtin_id):
    """Criar, listar, editar e excluir uma view customizada."""
    created = KV.create_view("Foco", {
        "adornos": {"capacity_meter": False, "subtask_ring": True, "summary_footer": True, "card_chips": True},
        "slots": ["abertas", "tempo_estimado", "concluidas"],
    })
    assert created["status"] == "ok"
    vid = created["id"]
    assert any(v["id"] == vid and v["name"] == "Foco" for v in KV.list_views())
    # Editar o nome persiste.
    assert KV.update_view(vid, name="Foco Profundo")["status"] == "ok"
    assert next(v for v in KV.list_views() if v["id"] == vid)["name"] == "Foco Profundo"
    # Excluir some da listagem.
    assert KV.delete_view(vid)["status"] == "ok"
    assert all(v["id"] != vid for v in KV.list_views())


# ─────────────────────────────────────────────────────────────────────────────
# Proteção da built-in (R8/R22)
# ─────────────────────────────────────────────────────────────────────────────
def test_builtin_cannot_be_updated(builtin_id):
    """A view built-in "Completa" não pode ser editada (erro, sem mudar nada)."""
    r = KV.update_view(builtin_id, name="Renomeada")
    assert r["status"] == "error"
    assert next(v for v in KV.list_views() if v["id"] == builtin_id)["name"] == "Completa"


def test_builtin_cannot_be_deleted(builtin_id):
    """A view built-in "Completa" não pode ser excluída (erro, continua presente)."""
    r = KV.delete_view(builtin_id)
    assert r["status"] == "error"
    assert any(v["id"] == builtin_id for v in KV.list_views())


# ─────────────────────────────────────────────────────────────────────────────
# Validação de display + filtro opcional
# ─────────────────────────────────────────────────────────────────────────────
def test_invalid_display_rejected(builtin_id):
    """display com nº de slots ≠ 3 ou métrica/adorno desconhecido é rejeitado."""
    poucos_slots = {"adornos": _DISPLAY["adornos"], "slots": ["abertas"]}
    assert KV.create_view("X", poucos_slots)["status"] == "error"
    metrica_ruim = {"adornos": _DISPLAY["adornos"], "slots": ["abertas", "tempo_estimado", "inexistente"]}
    assert KV.create_view("Y", metrica_ruim)["status"] == "error"
    adorno_ruim = {"adornos": {"capacity_meter": True, "desconhecido": True}, "slots": _DISPLAY["slots"]}
    assert KV.create_view("Z", adorno_ruim)["status"] == "error"
    # Nenhuma das tentativas inválidas persistiu (só a built-in continua).
    assert run_select("SELECT COUNT(*) AS n FROM kanban_views")[0]["n"] == 1


def test_filter_optional_and_validated(builtin_id):
    """Filtro é opcional; se enviado, reusa a validação das smart-lists (≥1 condição)."""
    # Filtro válido (≥1 condição) → cria ok e persiste como dict.
    rules = {"combinator": "and", "conditions": [{"field": "priority", "op": "gte", "value": 2}]}
    ok = KV.create_view("Prioritárias", _DISPLAY, filter=rules)
    assert ok["status"] == "ok"
    salvo = next(v for v in KV.list_views() if v["id"] == ok["id"])
    assert salvo["filter"]["conditions"][0]["field"] == "priority"
    # Filtro com lista de condições vazia → rejeitado pela mesma regra das smart-lists.
    vazio = KV.create_view("Vazia", _DISPLAY, filter={"combinator": "and", "conditions": []})
    assert vazio["status"] == "error"


# ─────────────────────────────────────────────────────────────────────────────
# Carga do board com filtro da view (US3) — reuso do DSL
# ─────────────────────────────────────────────────────────────────────────────
def _inbox_id() -> int:
    """Id do Inbox (lista default onde caem as tarefas criadas sem project_id)."""
    return run_select("SELECT id FROM task_projects WHERE is_inbox")[0]["id"]


def test_board_tasks_unfiltered_returns_open_parents(builtin_id):
    """Sem filtro, list_board_tasks devolve as tarefas-pai abertas da lista."""
    T.create_task("a", priority=3)
    T.create_task("b", priority=1)
    titulos = {t["title"] for t in KV.list_board_tasks(_inbox_id())}
    assert titulos == {"a", "b"}


def test_board_tasks_filtered_by_rules(builtin_id):
    """Com filtro (prioridade ≥ 2), o board mostra só as tarefas que casam."""
    T.create_task("alta", priority=3)
    T.create_task("baixa", priority=1)
    rules = {"combinator": "and", "conditions": [{"field": "priority", "op": "gte", "value": 2}]}
    titulos = {t["title"] for t in KV.list_board_tasks(_inbox_id(), rules)}
    assert titulos == {"alta"}


def test_board_for_view_applies_view_filter(builtin_id):
    """list_board_for_view aplica o filtro salvo na view (semântica igual às smart-lists)."""
    T.create_task("tem-tag", tags=["foco"])
    T.create_task("sem-tag")
    rules = {"combinator": "and", "conditions": [{"field": "tag", "op": "has", "value": "foco"}]}
    vid = KV.create_view("Foco", _DISPLAY, filter=rules)["id"]
    titulos = {t["title"] for t in KV.list_board_for_view(vid, _inbox_id())}
    assert titulos == {"tem-tag"}


def test_board_tasks_include_subtasks(builtin_id):
    """As tarefas do board mantêm as subtarefas aninhadas (insumo do anel de progresso)."""
    parent = T.create_task("pai", priority=2)["id"]
    T.create_task("filha", parent_id=parent)
    board = KV.list_board_tasks(_inbox_id())
    pai = next(t for t in board if t["title"] == "pai")
    assert any(s["title"] == "filha" for s in pai["subtasks"])
