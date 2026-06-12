"""Testes da camada de lógica de tags (etiquetas) da Kaguya — ``tools_tags``.

São testes de **integração** contra um PostgreSQL real (mesmo padrão de
``test_kaguya_tasks.py``): o valor está em comportamentos que só o banco verdadeiro
exercita — o índice único ``LOWER(name)`` (reuso case-insensitive, SC-002), a relação
N:N de ``task_tag_links`` e o cascade ao excluir uma tag.

Como rodar:
    export DATABASE_URL="postgresql://postgres:test@localhost:55432/makima_test"
    pytest tests/agents/test_kaguya_tags.py -v

Sem ``DATABASE_URL`` o módulo inteiro é **pulado** (skip).
"""

import os

import pytest

# Sem banco configurado, não há o que testar de integração: pula o módulo inteiro.
if not os.environ.get("DATABASE_URL"):
    pytest.skip("DATABASE_URL não definida — testes de integração da Kaguya pulados.", allow_module_level=True)

from agents.db import get_conn, run_select  # noqa: E402
from agents.kaguya import tools_tasks as T  # noqa: E402
from agents.kaguya import tools_tags as G  # noqa: E402

# Caminho absoluto do schema (a partir deste arquivo: tests/agents/ → raiz do repo).
_SCHEMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "agents", "kaguya", "schema_tasks_pg.sql",
)

# Tabelas do domínio, na ordem de drop (dependentes primeiro) — igual a test_kaguya_tasks.
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


def _tag_count() -> int:
    """Conta quantas tags existem no vocabulário (para checar não-duplicação)."""
    return run_select("SELECT COUNT(*) AS n FROM task_tags")[0]["n"]


# ─────────────────────────────────────────────────────────────────────────────
# Criação de tarefa com tags + anexação nas listagens
# ─────────────────────────────────────────────────────────────────────────────
def test_create_task_with_tags_links_them(inbox_id):
    """create_task(tags=[...]) cria os vínculos e a listagem anexa os chips."""
    r = T.create_task("comprar pão", tags=["mercado", "5min"])
    assert r["status"] == "ok"
    # A listagem da lista traz a tarefa com as duas tags anexadas.
    tasks = T.list_tasks(inbox_id)
    nomes = {t["name"] for t in tasks[0]["tags"]}
    assert nomes == {"mercado", "5min"}


def test_tag_name_case_insensitive_reuse(inbox_id):
    """`Mercado` e `mercado` são a MESMA tag — nunca duplica (SC-002)."""
    T.create_task("tarefa A", tags=["Mercado"])
    T.create_task("tarefa B", tags=["mercado"])
    # Só uma linha em task_tags, apesar das duas caixas diferentes.
    assert _tag_count() == 1


def test_hash_prefix_is_normalized(inbox_id):
    """O `#` colado no nome é removido — vira a tag "mercado", não "#mercado"."""
    T.create_task("x", tags=["#mercado"])
    nomes = {t["name"] for t in G.list_tags()}
    assert nomes == {"mercado"}


# ─────────────────────────────────────────────────────────────────────────────
# Substituição de conjunto (update_task) e remoção total
# ─────────────────────────────────────────────────────────────────────────────
def test_update_task_replaces_tag_set(inbox_id):
    """update_task(tags=[...]) substitui o conjunto inteiro; lista vazia remove tudo."""
    r = T.create_task("t", tags=["a", "b"])
    tid = r["id"]
    # Substitui {a,b} por {c}.
    T.update_task(tid, tags=["c"])
    nomes = {t["name"] for t in T.list_tasks(inbox_id)[0]["tags"]}
    assert nomes == {"c"}
    # Lista vazia remove todas as tags da tarefa.
    T.update_task(tid, tags=[])
    assert T.list_tasks(inbox_id)[0]["tags"] == []


# ─────────────────────────────────────────────────────────────────────────────
# CRUD de tags + cascade ao excluir
# ─────────────────────────────────────────────────────────────────────────────
def test_delete_tag_removes_links_keeps_task(inbox_id):
    """Excluir uma tag apaga os vínculos (cascade) mas preserva as tarefas."""
    r = T.create_task("t", tags=["mercado"])
    tag_id = G.list_tags()[0]["id"]
    out = G.delete_tag(tag_id)
    assert out["status"] == "ok"
    # A tarefa continua viva, agora sem tags.
    tasks = T.list_tasks(inbox_id)
    assert tasks[0]["id"] == r["id"]
    assert tasks[0]["tags"] == []


def test_create_tag_duplicate_is_rejected(inbox_id):
    """create_tag com nome já existente (ignorando caixa) retorna erro amigável."""
    assert G.create_tag("Foco")["status"] == "ok"
    dup = G.create_tag("foco")
    assert dup["status"] == "error"
    assert _tag_count() == 1


# ─────────────────────────────────────────────────────────────────────────────
# Add/remove incremental (uso do agente) + listar por tag
# ─────────────────────────────────────────────────────────────────────────────
def test_add_and_remove_task_tag(inbox_id):
    """add_task_tag soma sem mexer no resto; remove_task_tag tira só aquela."""
    tid = T.create_task("t", tags=["a"])["id"]
    G.add_task_tag(tid, "b")
    nomes = {t["name"] for t in T.list_tasks(inbox_id)[0]["tags"]}
    assert nomes == {"a", "b"}
    G.remove_task_tag(tid, "a")
    nomes = {t["name"] for t in T.list_tasks(inbox_id)[0]["tags"]}
    assert nomes == {"b"}


def test_list_tasks_by_tag(inbox_id):
    """list_tasks_by_tag traz só as tarefas abertas com aquela tag (case-insensitive)."""
    T.create_task("com tag", tags=["mercado"])
    T.create_task("sem tag")
    achadas = G.list_tasks_by_tag("MERCADO")  # caixa diferente de propósito
    titulos = {t["title"] for t in achadas}
    assert titulos == {"com tag"}
