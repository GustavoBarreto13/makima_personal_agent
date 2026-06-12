"""Testes da camada de lógica de smart-lists (filtros salvos) da Kaguya — ``tools_filters``.

São testes de **integração** contra um PostgreSQL real (mesmo padrão de
``test_kaguya_tags.py``): o valor está nos comportamentos que só o banco verdadeiro
exercita — a tradução da DSL de regras em ``WHERE`` **parametrizado** (SC-003), a
detecção de referência órfã (SC-006) e a built-in "Hoje + Vencidas".

Como rodar:
    export DATABASE_URL="postgresql://postgres:test@127.0.0.1:55432/makima_test"
    pytest tests/agents/test_kaguya_filters.py -v

Sem ``DATABASE_URL`` o módulo inteiro é **pulado** (skip).
"""

import os
from datetime import timedelta

import pytest

# Sem banco configurado, não há o que testar de integração: pula o módulo inteiro.
if not os.environ.get("DATABASE_URL"):
    pytest.skip("DATABASE_URL não definida — testes de integração da Kaguya pulados.", allow_module_level=True)

from agents.db import get_conn, run_select  # noqa: E402
from agents.kaguya import tools_tasks as T  # noqa: E402
from agents.kaguya import tools_projects as P  # noqa: E402
from agents.kaguya import tools_filters as F  # noqa: E402

# Caminho absoluto do schema (a partir deste arquivo: tests/agents/ → raiz do repo).
_SCHEMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "agents", "kaguya", "schema_tasks_pg.sql",
)

# Tabelas do domínio, na ordem de drop (dependentes primeiro) — igual a test_kaguya_tags.
_TASK_TABLES = (
    "habit_checkins habits task_filters task_tag_links task_tags "
    "task_recurrences tasks task_columns task_projects task_project_groups"
)


@pytest.fixture()
def inbox_id() -> int:
    """Reseta as tabelas de tarefas e reaplica o schema antes de cada teste.

    Returns:
        O id do Inbox recém-semeado (cada teste começa do zero, isolado).
    """
    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        schema_sql = f.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DROP TABLE IF EXISTS {_TASK_TABLES.replace(' ', ', ')} CASCADE")
            cur.execute(schema_sql)
            cur.execute("SELECT id FROM task_projects WHERE is_inbox")
            return cur.fetchone()[0]


def _date(offset_days: int) -> str:
    """Devolve uma data ISO ``offset_days`` a partir de hoje (mesmo "hoje" do módulo).

    Args:
        offset_days: Quantos dias somar a hoje (negativo = passado).

    Returns:
        A data no formato "AAAA-MM-DD" que ``create_task`` aceita.
    """
    return (F._today() + timedelta(days=offset_days)).isoformat()


# ─────────────────────────────────────────────────────────────────────────────
# Tradução da DSL → WHERE parametrizado (o coração — SC-003)
# ─────────────────────────────────────────────────────────────────────────────
def test_combined_rules_tag_priority_date(inbox_id):
    """Regra (tag + prioridade + data) retorna exatamente o conjunto esperado (SC-003)."""
    # A única que casa as TRÊS condições: prioridade alta, vence em 2 dias, tem #mercado.
    T.create_task("urgente", priority=3, due_date=_date(2), tags=["mercado"])
    T.create_task("prio baixa", priority=1, due_date=_date(2), tags=["mercado"])   # falha prioridade
    T.create_task("muito longe", priority=3, due_date=_date(30), tags=["mercado"])  # falha "em 7 dias"
    T.create_task("sem etiqueta", priority=3, due_date=_date(2))                     # falha tag

    rules = {"combinator": "and", "conditions": [
        {"field": "priority", "op": "gte", "value": 2},
        {"field": "due_date", "op": "within", "value": "7d"},
        {"field": "tag", "op": "has", "value": "mercado"},
    ]}
    out = F._run_filter_rules(rules)
    titulos = {t["title"] for t in out["tasks"]}
    assert titulos == {"urgente"}
    assert out["orphans"] == []


def test_combinator_or(inbox_id):
    """Combinador ``or`` casa tarefas que satisfazem QUALQUER condição."""
    T.create_task("tem a", tags=["a"])
    T.create_task("tem b", tags=["b"])
    T.create_task("tem c", tags=["c"])
    rules = {"combinator": "or", "conditions": [
        {"field": "tag", "op": "has", "value": "a"},
        {"field": "tag", "op": "has", "value": "b"},
    ]}
    titulos = {t["title"] for t in F._run_filter_rules(rules)["tasks"]}
    assert titulos == {"tem a", "tem b"}


def test_due_date_overdue(inbox_id):
    """``due_date overdue`` traz só as tarefas com vencimento no passado."""
    T.create_task("atrasada", due_date=_date(-3))
    T.create_task("futura", due_date=_date(3))
    rules = {"combinator": "and", "conditions": [{"field": "due_date", "op": "overdue", "value": None}]}
    titulos = {t["title"] for t in F._run_filter_rules(rules)["tasks"]}
    assert titulos == {"atrasada"}


def test_state_completed_overrides_default_open(inbox_id):
    """``state eq completed`` retorna concluídas (o default 'só abertas' é desligado)."""
    done = T.create_task("feita")["id"]
    T.complete_task(done)
    T.create_task("aberta")
    rules = {"combinator": "and", "conditions": [{"field": "state", "op": "eq", "value": "completed"}]}
    titulos = {t["title"] for t in F._run_filter_rules(rules)["tasks"]}
    assert titulos == {"feita"}


# ─────────────────────────────────────────────────────────────────────────────
# Segurança: valores nunca interpolados no SQL (SC-003) + referência órfã (SC-006)
# ─────────────────────────────────────────────────────────────────────────────
def test_hostile_value_is_parameterized_not_injected(inbox_id):
    """Valor hostil na DSL não vira injeção: roda sem erro, casa nada, banco intacto."""
    T.create_task("inocente", tags=["mercado"])
    rules = {"combinator": "and", "conditions": [
        {"field": "tag", "op": "has", "value": "x'; DROP TABLE tasks; --"},
    ]}
    out = F._run_filter_rules(rules)           # não pode lançar
    assert out["tasks"] == []                   # nenhuma tag com esse nome
    # A tabela continua de pé (a "injeção" foi tratada como dado parametrizado).
    assert run_select("SELECT COUNT(*) AS n FROM tasks")[0]["n"] == 1


def test_orphan_tag_reference_matches_nothing(inbox_id):
    """Regra que referencia tag inexistente não quebra: casa nada e sinaliza órfã (SC-006)."""
    T.create_task("qualquer", tags=["existe"])
    rules = {"combinator": "and", "conditions": [{"field": "tag", "op": "has", "value": "fantasma"}]}
    out = F._run_filter_rules(rules)
    assert out["tasks"] == []
    assert any(o["field"] == "tag" and o["value"] == "fantasma" for o in out["orphans"])


# ─────────────────────────────────────────────────────────────────────────────
# Built-in "Hoje + Vencidas" (não persistida — FR-010)
# ─────────────────────────────────────────────────────────────────────────────
def test_builtin_today_overdue(inbox_id):
    """``list_today_overdue`` traz abertas com due_date <= hoje, sem linha em task_filters."""
    T.create_task("hoje", due_date=_date(0))
    T.create_task("ontem", due_date=_date(-1))
    T.create_task("amanha", due_date=_date(1))
    titulos = {t["title"] for t in F.list_today_overdue()}
    assert titulos == {"hoje", "ontem"}
    # Built-in não cria linha em task_filters.
    assert run_select("SELECT COUNT(*) AS n FROM task_filters")[0]["n"] == 0


# ─────────────────────────────────────────────────────────────────────────────
# CRUD de smart-lists + regra vazia rejeitada
# ─────────────────────────────────────────────────────────────────────────────
def test_create_requires_at_least_one_condition(inbox_id):
    """Smart-list sem condição é rejeitada com mensagem clara (Assumption da spec)."""
    r = F.create_filter("vazia", {"combinator": "and", "conditions": []})
    assert r["status"] == "error"
    assert run_select("SELECT COUNT(*) AS n FROM task_filters")[0]["n"] == 0


def test_crud_create_list_update_delete(inbox_id):
    """Criar, listar, editar e excluir uma smart-list; excluir não toca nas tarefas."""
    tid = T.create_task("alvo", priority=3)["id"]
    rules = {"combinator": "and", "conditions": [{"field": "priority", "op": "gte", "value": 2}]}
    created = F.create_filter("Importantes", rules, icon="⭐")
    assert created["status"] == "ok"
    fid = created["id"]
    # Listagem mostra a smart-list recém-criada.
    assert any(f["id"] == fid and f["name"] == "Importantes" for f in F.list_filters())
    # Editar o nome persiste.
    assert F.update_filter(fid, name="Prioritárias")["status"] == "ok"
    assert next(f for f in F.list_filters() if f["id"] == fid)["name"] == "Prioritárias"
    # Excluir some da listagem e não apaga a tarefa.
    assert F.delete_filter(fid)["status"] == "ok"
    assert all(f["id"] != fid for f in F.list_filters())
    assert run_select("SELECT COUNT(*) AS n FROM tasks WHERE id = %(id)s", {"id": tid})[0]["n"] == 1


def test_sidebar_includes_saved_filters(inbox_id):
    """get_sidebar() expõe as smart-lists salvas em ``filters`` (a sidebar do webapp lê daqui)."""
    rules = {"combinator": "and", "conditions": [{"field": "priority", "op": "gte", "value": 2}]}
    fid = F.create_filter("Importantes", rules)["id"]
    sidebar = P.get_sidebar()
    assert any(f["id"] == fid and f["name"] == "Importantes" for f in sidebar["filters"])


def test_parity_by_id_equals_by_name(inbox_id):
    """Abrir a smart-list por id (webapp) e por nome (Telegram) dá o mesmo conjunto (FR-012)."""
    T.create_task("casa", priority=3, tags=["mercado"])
    T.create_task("ignora", priority=0)
    rules = {"combinator": "and", "conditions": [{"field": "tag", "op": "has", "value": "mercado"}]}
    fid = F.create_filter("Compras", rules)["id"]
    por_id = {t["title"] for t in F.list_tasks_by_filter(fid)["tasks"]}
    por_nome = {t["title"] for t in F.list_tasks_by_filter_name("compras")["tasks"]}  # caixa diferente
    assert por_id == por_nome == {"casa"}
