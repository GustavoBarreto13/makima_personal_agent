"""Testes do estado de fluxo das tarefas — o que cobra e o que só espera (`task_state`).

Dois blocos:

1. **Puro** (sempre roda): inferência do tipo da coluna pelo nome, `flow_state`, `is_chargeable`.
2. **Integração** (pula sem ``DATABASE_URL``): tarefas em Homolog/Blocked/Backlog e com GTD
   aguardando/algum dia não aparecem em `list_tasks_today(only_chargeable=True)`, no alarme
   pontual nem no digest; To Do/Doing continuam cobradas.

Como rodar (bloco de integração):
    export DATABASE_URL="postgresql://postgres:test@127.0.0.1:55432/makima_test"
    pytest tests/agents/test_kaguya_task_state.py -v
"""

import os
from datetime import timedelta

import pytest

from agents.kaguya import task_state as S

HAS_DB = bool(os.environ.get("DATABASE_URL"))
requires_db = pytest.mark.skipif(not HAS_DB, reason="DATABASE_URL não definida — integração pulada.")


# ─────────────────────────────────────────────────────────────────────────────
# Bloco 1 — puro
# ─────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("nome,esperado", [
    ("Homolog", "review"), ("HOMOLOGAÇÃO", "review"), ("Em revisão", "review"),
    ("Blocked", "blocked"), ("Bloqueado", "blocked"),
    ("Backlog", "backlog"), ("Ideia", "backlog"),
    ("To Do", "todo"), ("A fazer", "todo"),
    ("Doing", "doing"), ("em andamento", "doing"),
    ("Done", "done"), ("Concluído", "done"),
    ("Qualquer outra coisa", None), ("", None),
])
def test_infer_column_kind(nome, esperado):
    """O nome da coluna vira o tipo certo (sem acento/caixa); desconhecido vira None."""
    assert S.infer_column_kind(nome) == esperado


def test_infer_column_kind_done_flag_vence_o_nome():
    """A coluna marcada como 'concluído' é sempre `done`, qualquer que seja o nome."""
    assert S.infer_column_kind("Pronto pra ir", is_done=True) == "done"


@pytest.mark.parametrize("task,estado,cobra", [
    ({"column_kind": "review"}, "review", False),
    ({"column_kind": "blocked"}, "blocked", False),
    ({"column_kind": "backlog"}, "backlog", False),
    ({"gtd_status": "waiting"}, "waiting", False),
    ({"gtd_status": "someday"}, "someday", False),
    ({"column_kind": "doing", "gtd_status": "waiting"}, "waiting", False),
    ({"column_kind": "review", "gtd_status": "next_action"}, "review", False),
    ({"column_kind": "todo"}, "todo", True),
    ({"column_kind": "doing"}, "doing", True),
    ({"gtd_status": "next_action"}, "open", True),
    ({}, "open", True),
])
def test_flow_state_e_is_chargeable(task, estado, cobra):
    """flow_state e is_chargeable concordam com a regra de negócio."""
    assert S.flow_state(task) == estado
    assert S.is_chargeable(task) is cobra


def test_chargeable_sql_cobre_todos_os_tipos_e_status():
    """O fragmento SQL lista exatamente os tipos e status que não cobram."""
    sql = S.chargeable_sql()
    for k in S.NON_CHARGEABLE_KINDS + S.NON_CHARGEABLE_GTD:
        assert f"'{k}'" in sql
    assert "%" not in sql  # não pode colidir com os parâmetros do psycopg


# ─────────────────────────────────────────────────────────────────────────────
# Bloco 2 — integração (PostgreSQL real)
# ─────────────────────────────────────────────────────────────────────────────
if HAS_DB:
    from agents.db import get_conn  # noqa: E402
    from agents.kaguya import tools_projects as P  # noqa: E402
    from agents.kaguya import tools_tasks as T  # noqa: E402
    from agents.kaguya.tz import today_sp  # noqa: E402

    _SCHEMA_PATH = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "agents", "kaguya", "schema_tasks_pg.sql",
    )
    _TASK_TABLES = (
        "habit_checkins habits task_filters task_tag_links task_tags task_contexts "
        "task_recurrences tasks task_columns task_projects task_project_groups"
    )


@pytest.fixture()
def board() -> dict:
    """Reseta o schema e monta uma lista com o board Backlog/Blocked/To Do/Doing/Homolog/Done."""
    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        schema_sql = f.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DROP TABLE IF EXISTS {_TASK_TABLES.replace(' ', ', ')} CASCADE")
            cur.execute(schema_sql)
    proj = P.create_project("Sprint")
    pid = proj["id"]
    cols = {}
    for nome in ("Backlog", "Blocked", "To Do", "Doing", "Homolog"):
        cols[nome] = P.create_column(pid, nome)["id"]
    cols["Done"] = P.create_column(pid, "Done", is_done_column=True)["id"]
    return {"pid": pid, "cols": cols}


def _vencida(board, titulo, coluna, **extra):
    """Cria uma tarefa vencida ontem na coluna indicada."""
    ontem = (today_sp() - timedelta(days=1)).isoformat()
    r = T.create_task(titulo, project_id=board["pid"], column_id=board["cols"][coluna], due_date=ontem, **extra)
    return r["id"]


@requires_db
def test_kind_das_colunas_e_inferido_pelo_nome(board):
    """create_column preenche o tipo pelo nome; a coluna done recebe `done`."""
    kinds = {c["name"]: c["kind"] for c in P.list_columns(board["pid"])}
    assert kinds == {"Backlog": "backlog", "Blocked": "blocked", "To Do": "todo",
                     "Doing": "doing", "Homolog": "review", "Done": "done"}


@requires_db
def test_renomear_coluna_reclassifica_so_se_reconhecer(board):
    """Renomear para um nome conhecido muda o tipo; um nome livre mantém o atual."""
    P.update_column(board["cols"]["Homolog"], name="QA do cliente")
    P.update_column(board["cols"]["Blocked"], name="Revisão")
    kinds = {c["name"]: c["kind"] for c in P.list_columns(board["pid"])}
    assert kinds["QA do cliente"] == "review"   # nome livre → mantém review
    assert kinds["Revisão"] == "review"         # nome conhecido → reclassifica


@requires_db
def test_vencidas_em_espera_nao_cobram(board):
    """Homolog/Blocked/Backlog e GTD waiting/someday saem; To Do/Doing ficam."""
    for col in ("Homolog", "Blocked", "Backlog"):
        _vencida(board, f"em {col}", col)
    a = _vencida(board, "delegada", "Doing")
    T.update_task(a, gtd_status="waiting")
    # "algum dia" com data não existe (update_task limpa o status — FR-012 da spec 034); o
    # someday sem data é coberto pelo filtro de GTD no SQL e por is_chargeable (teste puro).
    _vencida(board, "fazer agora", "To Do")
    _vencida(board, "em andamento", "Doing")

    todas = {t["title"] for t in T.list_tasks_today()["overdue"]}
    cobraveis = {t["title"] for t in T.list_tasks_today(only_chargeable=True)["overdue"]}
    assert len(todas) == 6
    assert cobraveis == {"fazer agora", "em andamento"}


@requires_db
def test_flow_state_nos_itens(board):
    """Sem filtro, cada item traz o estado de fluxo para a UI/IA rotular."""
    _vencida(board, "validar", "Homolog")
    item = T.list_tasks_today()["overdue"][0]
    assert item["column_kind"] == "review" and item["flow_state"] == "review"


@requires_db
def test_alarme_pontual_ignora_o_que_espera(board):
    """O lembrete 'vence agora' só dispara para tarefas cobráveis."""
    _vencida(board, "em homolog", "Homolog")
    _vencida(board, "bloqueada", "Blocked")
    _vencida(board, "fazer", "To Do")
    assert {t["title"] for t in T.list_tasks_due_for_reminder()} == {"fazer"}


@requires_db
def test_aguardando_lista_homolog_e_blocked(board):
    """list_tasks_awaiting devolve só homologação/bloqueadas (contexto das IAs)."""
    _vencida(board, "em homolog", "Homolog")
    _vencida(board, "bloqueada", "Blocked")
    _vencida(board, "backlog", "Backlog")
    _vencida(board, "fazer", "To Do")
    assert {t["title"] for t in T.list_tasks_awaiting()} == {"em homolog", "bloqueada"}


@requires_db
def test_annotate_flow_state_em_lote(board):
    """annotate_flow_state anexa tipo e estado a listas vindas de outras queries."""
    tid = _vencida(board, "validar", "Homolog")
    itens = T.annotate_flow_state([{"id": tid, "gtd_status": None}])
    assert itens[0]["column_kind"] == "review" and itens[0]["flow_state"] == "review"


@requires_db
def test_kind_explicito_vence_o_nome_e_auto_reinfere(board):
    """O seletor da UI: tipo escolhido vence o nome; 'auto' volta a deduzir; inválido é recusado."""
    col = board["cols"]["To Do"]
    assert P.update_column(col, kind="review")["status"] == "ok"
    kinds = {c["id"]: c["kind"] for c in P.list_columns(board["pid"])}
    assert kinds[col] == "review"
    assert P.update_column(col, kind="auto")["status"] == "ok"
    assert {c["id"]: c["kind"] for c in P.list_columns(board["pid"])}[col] == "todo"
    assert P.update_column(col, kind="banana")["status"] == "error"
    assert P.update_column(col, kind="done")["status"] == "error"  # done só pelo interruptor
    novo = P.create_column(board["pid"], "Coluna livre", kind="blocked")["id"]
    assert {c["id"]: c["kind"] for c in P.list_columns(board["pid"])}[novo] == "blocked"
