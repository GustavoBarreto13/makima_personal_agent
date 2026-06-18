"""Testes da camada de lógica de tarefas da Kaguya (tools_tasks + tools_projects).

São testes de **integração** contra um PostgreSQL real — diferente dos testes da Nami
(que mockam o BigQuery) porque o valor aqui está em comportamentos que só um banco
verdadeiro exercita: posições esparsas com renormalização (SC-006), cascata de
conclusão, atomicidade e regras de FK.

Como rodar:
    # Aponte para um Postgres de teste (ex.: container makima-web no VPS, ou um
    # Postgres descartável local):
    export DATABASE_URL="postgresql://postgres:test@localhost:55432/makima_test"
    pytest tests/agents/test_kaguya_tasks.py -v

Sem ``DATABASE_URL`` o módulo inteiro é **pulado** (skip) — assim a suíte não quebra
em ambientes sem banco.
"""

import os
import random
from datetime import date, timedelta

import pytest

# Sem banco configurado, não há o que testar de integração: pula o módulo inteiro.
if not os.environ.get("DATABASE_URL"):
    pytest.skip("DATABASE_URL não definida — testes de integração da Kaguya pulados.", allow_module_level=True)

from agents.db import get_conn  # noqa: E402
from agents.kaguya import tools_projects as P  # noqa: E402
from agents.kaguya import tools_tasks as T  # noqa: E402

# Caminho absoluto do schema (a partir deste arquivo: tests/agents/ → raiz do repo).
_SCHEMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "agents", "kaguya", "schema_tasks_pg.sql",
)

# Tabelas do domínio de tarefas, na ordem de drop (dependentes primeiro).
_TASK_TABLES = (
    "habit_checkins habits task_filters task_tag_links task_tags "
    "task_recurrences tasks task_columns task_projects task_project_groups"
)


@pytest.fixture()
def inbox_id() -> int:
    """Reseta as tabelas de tarefas e reaplica o schema antes de cada teste.

    Garante isolamento total entre testes (cada um começa com só o Inbox).

    Returns:
        O id do Inbox recém-semeado.
    """
    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        schema_sql = f.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Dropa tudo do domínio e recria do zero (schema é idempotente + traz o seed).
            cur.execute(f"DROP TABLE IF EXISTS {_TASK_TABLES.replace(' ', ', ')} CASCADE")
            cur.execute(schema_sql)
            cur.execute("SELECT id FROM task_projects WHERE is_inbox")
            return cur.fetchone()[0]


# ─────────────────────────────────────────────────────────────────────────────
# CRUD básico e captura órfã
# ─────────────────────────────────────────────────────────────────────────────
def test_orphan_task_goes_to_inbox(inbox_id):
    """Tarefa criada sem lista cai no Inbox (captura órfã)."""
    r = T.create_task("sem lista")
    assert r["status"] == "ok"
    assert r["project_id"] == inbox_id


def test_create_resolves_project_by_name(inbox_id):
    """O agente pode criar passando o nome da lista (resolvido por prefixo)."""
    casa = P.create_project("Casa")["id"]
    r = T.create_task("comprar pão", project_name="cas")
    assert r["status"] == "ok" and r["project_id"] == casa


def test_invalid_priority_and_type_and_time(inbox_id):
    """Validações de entrada barram prioridade/tipo inválidos e hora sem data."""
    assert T.create_task("x", priority=9)["status"] == "error"
    assert T.create_task("x", type="foo")["status"] == "error"
    assert T.create_task("x", due_time="10:00")["status"] == "error"


# ─────────────────────────────────────────────────────────────────────────────
# Subtarefas (1 nível, ricas)
# ─────────────────────────────────────────────────────────────────────────────
def test_subtasks_one_level_and_nesting(inbox_id):
    """Subtarefas têm prioridade própria, aparecem aninhadas e não aceitam neta."""
    parent = T.create_task("pai", project_id=inbox_id)["id"]
    s1 = T.create_task("sub 1", parent_id=parent, priority=2)
    assert s1["status"] == "ok"
    # Subtarefa de subtarefa é barrada (só 1 nível).
    assert T.create_task("neta", parent_id=s1["id"])["status"] == "error"
    # A subtarefa aparece aninhada e carrega a própria prioridade.
    parent_row = next(t for t in T.list_tasks(inbox_id) if t["id"] == parent)
    assert len(parent_row["subtasks"]) == 1
    assert parent_row["subtasks"][0]["priority"] == 2


def test_complete_parent_needs_cascade(inbox_id):
    """Concluir pai com subtarefas abertas exige cascade; com cascade conclui tudo."""
    parent = T.create_task("pai", project_id=inbox_id)["id"]
    T.create_task("sub", parent_id=parent)
    r = T.complete_task(parent)
    assert r["status"] == "error" and r.get("needs_cascade")
    r2 = T.complete_task(parent, cascade=True)
    assert r2["status"] == "ok"
    prow = next(t for t in T.list_tasks(inbox_id, include_completed=True) if t["id"] == parent)
    assert prow["completed_at"] is not None
    assert all(s["completed_at"] is not None for s in prow["subtasks"])


def test_reopen_blocked_when_parent_completed(inbox_id):
    """Reabrir subtarefa de pai concluído é bloqueado; reabrir o pai destrava."""
    parent = T.create_task("pai", project_id=inbox_id)["id"]
    sub = T.create_task("sub", parent_id=parent)["id"]
    T.complete_task(parent, cascade=True)
    assert T.reopen_task(sub)["status"] == "error"
    assert T.reopen_task(parent)["status"] == "ok"
    assert T.reopen_task(sub)["status"] == "ok"


def test_subtask_on_completed_parent_blocked(inbox_id):
    """Criar subtarefa em pai concluído é bloqueado (sugere reabrir o pai)."""
    parent = T.create_task("pai", project_id=inbox_id)["id"]
    T.complete_task(parent)
    assert T.create_task("nova", parent_id=parent)["status"] == "error"


# ─────────────────────────────────────────────────────────────────────────────
# Posições esparsas (SC-006)
# ─────────────────────────────────────────────────────────────────────────────
def test_sparse_positions_survive_many_reorders(inbox_id):
    """100+ reordenações mantêm posições únicas e ordenadas (sem corrupção) — SC-006."""
    ids = [T.create_task(f"t{i}", project_id=inbox_id)["id"] for i in range(6)]
    for _ in range(150):
        a, b = random.sample(ids, 2)
        assert T.reorder_task(a, after_id=b)["status"] == "ok"
    positions = [t["position"] for t in T.list_tasks(inbox_id)]
    assert len(positions) == len(set(positions)), "posições colidiram"
    assert positions == sorted(positions), "ordem corrompida"


def test_reorder_places_after_neighbor(inbox_id):
    """Reordenar com after_id coloca a tarefa logo depois do vizinho indicado."""
    a = T.create_task("A", project_id=inbox_id)["id"]
    b = T.create_task("B", project_id=inbox_id)["id"]
    c = T.create_task("C", project_id=inbox_id)["id"]
    # Move C para logo depois de A → ordem esperada: A, C, B
    T.reorder_task(c, after_id=a)
    order = [t["id"] for t in T.list_tasks(inbox_id)]
    assert order == [a, c, b]


# ─────────────────────────────────────────────────────────────────────────────
# Listas, grupos, colunas
# ─────────────────────────────────────────────────────────────────────────────
def test_inbox_is_indestructible(inbox_id):
    """O Inbox não pode ser excluído por nenhum modo."""
    assert P.delete_project(inbox_id, "move_to_inbox")["status"] == "error"
    assert P.delete_project(inbox_id, "delete_tasks")["status"] == "error"


def test_delete_project_move_to_inbox(inbox_id):
    """Excluir lista com move_to_inbox reaponta as tarefas para o Inbox e some da sidebar."""
    tmp = P.create_project("Temp")["id"]
    T.create_task("órfã futura", project_id=tmp)
    assert P.delete_project(tmp, "move_to_inbox")["status"] == "ok"
    assert all(p["id"] != tmp for p in P.get_sidebar()["projects"])
    assert any(t["title"] == "órfã futura" for t in T.list_tasks(inbox_id))


def test_delete_project_delete_tasks_sends_to_trash(inbox_id):
    """Excluir lista com delete_tasks manda as tarefas para a lixeira (soft delete)."""
    tmp = P.create_project("Temp")["id"]
    t = T.create_task("some junto", project_id=tmp)["id"]
    assert P.delete_project(tmp, "delete_tasks")["status"] == "ok"
    assert any(row["id"] == t for row in T.list_trash())


def test_single_done_column_per_project(inbox_id):
    """Só pode haver uma coluna 'concluído' por lista."""
    proj = P.create_project("Board")["id"]
    assert P.create_column(proj, "Feito", is_done_column=True)["status"] == "ok"
    assert P.create_column(proj, "Feito2", is_done_column=True)["status"] == "error"


def test_move_between_projects_applies_column_rule(inbox_id):
    """Mover tarefa para lista com board a coloca na 1ª coluna; sem board, sem coluna."""
    board = P.create_project("Board")["id"]
    P.create_column(board, "A fazer")
    first_col = sorted(P.list_columns(board), key=lambda c: c["position"])[0]["id"]
    t = T.create_task("mover", project_id=inbox_id)["id"]
    T.update_task(t, project_id=board)
    moved = next(x for x in T.list_tasks(board) if x["id"] == t)
    assert moved["column_id"] == first_col


def test_update_same_project_preserves_column(inbox_id):
    """Editar campo (ex.: prioridade) com project_id IGUAL ao atual NÃO reseta a coluna.

    Regressão: o TaskModal sempre manda project_id; antes, qualquer edição jogava o card
    de volta para a 1ª coluna. Mover de lista de verdade ainda deve resetar.
    """
    board = P.create_project("Board")["id"]
    P.create_column(board, "A fazer")
    P.create_column(board, "Fazendo")
    cols = sorted(P.list_columns(board), key=lambda c: c["position"])
    first_col, second_col = cols[0]["id"], cols[1]["id"]

    t = T.create_task("card", project_id=board, column_id=second_col)["id"]
    # Edita a prioridade mandando o MESMO project_id (como o TaskModal faz), sem column_id.
    T.update_task(t, priority=3, project_id=board)
    row = next(x for x in T.list_tasks(board) if x["id"] == t)
    assert row["column_id"] == second_col   # permaneceu na coluna — não voltou pra 1ª
    assert row["priority"] == 3

    # Mover para OUTRA lista (project_id diferente) ainda aplica a regra da 1ª coluna.
    other = P.create_project("Outra")["id"]
    P.create_column(other, "Inicial")
    other_first = sorted(P.list_columns(other), key=lambda c: c["position"])[0]["id"]
    T.update_task(t, project_id=other)
    moved = next(x for x in T.list_tasks(other) if x["id"] == t)
    assert moved["column_id"] == other_first


def test_create_lands_in_first_column_when_board_exists(inbox_id):
    """Criar tarefa numa lista com board cai na 1ª coluna (sem isso, o Kanban fica vazio)."""
    board = P.create_project("Board")["id"]
    P.create_column(board, "A fazer")
    P.create_column(board, "Fazendo")
    cols = sorted(P.list_columns(board), key=lambda c: c["position"])
    first_col, second_col = cols[0]["id"], cols[1]["id"]

    # Sem column_id explícito → primeira coluna (aparece no Kanban; Lista⇄Kanban em sincronia).
    auto = T.create_task("auto", project_id=board)["id"]
    auto_row = next(x for x in T.list_tasks(board) if x["id"] == auto)
    assert auto_row["column_id"] == first_col

    # column_id explícito → honrado.
    pinned = T.create_task("fixa", project_id=board, column_id=second_col)["id"]
    pinned_row = next(x for x in T.list_tasks(board) if x["id"] == pinned)
    assert pinned_row["column_id"] == second_col

    # column_id de outra lista → erro (não pertence à lista resolvida).
    other = P.create_project("Outra")["id"]
    P.create_column(other, "X")
    other_col = P.list_columns(other)[0]["id"]
    assert T.create_task("errada", project_id=board, column_id=other_col)["status"] == "error"

    # Lista sem board (Inbox recém-semeado) → tarefa fica sem coluna (Kanban é opcional).
    no_board = T.create_task("sem board", project_id=inbox_id)["id"]
    nb_row = next(x for x in T.list_tasks(inbox_id) if x["id"] == no_board)
    assert nb_row["column_id"] is None


def test_delete_column_clears_tasks_column(inbox_id):
    """Excluir coluna deixa as tarefas sem coluna (não as apaga)."""
    board = P.create_project("Board")["id"]
    P.create_column(board, "A fazer")
    col = P.list_columns(board)[0]["id"]
    t = T.create_task("na coluna", project_id=board)["id"]
    T.update_task(t, column_id=col)
    assert P.delete_column(col)["status"] == "ok"
    row = next(x for x in T.list_tasks(board) if x["id"] == t)
    assert row["column_id"] is None


# ─────────────────────────────────────────────────────────────────────────────
# Soft delete / lixeira / tela Hoje
# ─────────────────────────────────────────────────────────────────────────────
def test_soft_delete_and_restore(inbox_id):
    """Excluir manda para a lixeira (com subtarefas) e restaurar traz de volta."""
    parent = T.create_task("pai", project_id=inbox_id)["id"]
    T.create_task("sub", parent_id=parent)
    T.delete_task(parent)
    assert all(t["id"] != parent for t in T.list_tasks(inbox_id))
    assert any(t["id"] == parent for t in T.list_trash(inbox_id))
    assert T.restore_task(parent)["status"] == "ok"
    restored = next(t for t in T.list_tasks(inbox_id) if t["id"] == parent)
    assert len(restored["subtasks"]) == 1  # a subtarefa voltou junto


def test_today_lists_overdue_and_today_only(inbox_id):
    """A tela Hoje traz hoje + vencidas; nunca as futuras."""
    T.create_task("hoje", project_id=inbox_id, due_date=date.today().isoformat())
    T.create_task("ontem", project_id=inbox_id, due_date=(date.today() - timedelta(days=1)).isoformat())
    T.create_task("amanhã", project_id=inbox_id, due_date=(date.today() + timedelta(days=1)).isoformat())
    today = T.list_tasks_today()
    assert any(t["title"] == "hoje" for t in today["today"])
    assert any(t["title"] == "ontem" for t in today["overdue"])
    everything = today["today"] + today["overdue"]
    assert not any(t["title"] == "amanhã" for t in everything)


# ─────────────────────────────────────────────────────────────────────────────
# Pagamento atômico — Kaguya + Nami (SC-005)
# ─────────────────────────────────────────────────────────────────────────────
from agents.db import run_select  # noqa: E402
import agents.nami.tools as nami  # noqa: E402

_NAMI_SCHEMA = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "agents", "nami", "schema_pg.sql",
)


@pytest.fixture()
def payment_inbox(inbox_id):
    """Prepara o ambiente do pagamento: tabela transactions da Nami + cache de contas.

    Depende de ``inbox_id`` (que já recriou as tabelas de tarefas). Aplica o schema da
    Nami (idempotente), limpa as transações e popula o cache de contas em memória para
    ``_resolve_account`` funcionar sem depender de leitura ao banco.
    """
    with open(_NAMI_SCHEMA, encoding="utf-8") as f:
        nami_sql = f.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(nami_sql)
            cur.execute("TRUNCATE transactions")
    # Conta de teste (account_id é TEXT sem FK — qualquer id serve).
    nami._accounts_cache = [{"id": "acc-test", "name": "Nubank"}]
    yield inbox_id
    nami._accounts_cache = None


def test_payment_happy_path_completes_and_books_expense(payment_inbox):
    """Caminho feliz: tarefa concluída E despesa lançada (ambas persistem)."""
    from agents.kaguya.tools import complete_payment_task
    tid = T.create_task("pagar conta de luz", project_id=payment_inbox)["id"]
    r = complete_payment_task(tid, 180.0, "Moradia", "Nubank")
    assert r["status"] == "ok"
    # tarefa concluída
    task = next(t for t in T.list_tasks(payment_inbox, include_completed=True) if t["id"] == tid)
    assert task["completed_at"] is not None
    # despesa lançada
    rows = run_select("SELECT name, valor, tipo FROM transactions WHERE deleted = FALSE")
    assert len(rows) == 1 and rows[0]["valor"] == 180.0 and rows[0]["tipo"] == "Despesa"


def test_payment_invalid_category_rolls_back_everything(payment_inbox):
    """Falha na despesa (categoria inválida) → tarefa segue aberta e zero despesa (SC-005)."""
    from agents.kaguya.tools import complete_payment_task
    tid = T.create_task("pagar x", project_id=payment_inbox)["id"]
    r = complete_payment_task(tid, 50.0, "CategoriaInexistente", "Nubank")
    assert r["status"] == "error"
    # a conclusão da tarefa foi desfeita (atomicidade)
    task = next(t for t in T.list_tasks(payment_inbox, include_completed=True) if t["id"] == tid)
    assert task["completed_at"] is None
    assert run_select("SELECT count(*) AS c FROM transactions")[0]["c"] == 0


def test_payment_invalid_account_rolls_back_everything(payment_inbox):
    """Falha na despesa (conta inexistente) → tarefa segue aberta e zero despesa (SC-005)."""
    from agents.kaguya.tools import complete_payment_task
    nami._accounts_cache = []  # nenhuma conta resolve
    tid = T.create_task("pagar y", project_id=payment_inbox)["id"]
    r = complete_payment_task(tid, 50.0, "Moradia", "Conta Fantasma")
    assert r["status"] == "error"
    task = next(t for t in T.list_tasks(payment_inbox, include_completed=True) if t["id"] == tid)
    assert task["completed_at"] is None
    assert run_select("SELECT count(*) AS c FROM transactions")[0]["c"] == 0
