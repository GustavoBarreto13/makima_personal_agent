"""Testes do motor de recorrência da Kaguya (Fase 2 / fatia 012).

Duas camadas:

1. **Motor puro** (``agents.kaguya.recurrence``) — testes rápidos e determinísticos, sem banco,
   um por linha da tabela-verdade dos 9 edge cases (``specs/012-tasks-recurrence/research.md`` §3).
   Estes são o **gate da fatia** (SC-001 ≡ SC-004 da master) e rodam sempre.

2. **Integração** (geração ao concluir/excluir via ``tools_tasks``) — contra um PostgreSQL real;
   pulada com ``skipif`` quando ``DATABASE_URL`` não está definida (mesma convenção de
   ``test_kaguya_tasks.py``). Os testes puros continuam rodando mesmo sem banco.

Como rodar só o gate (sem banco):
    pytest tests/agents/test_kaguya_recurrence.py -v -k "not integration"
"""

import os
from datetime import date

import pytest

from agents.kaguya import recurrence as R

# ──────────────────────────────────────────────────────────────────────────────
# Regras de exemplo (as mesmas da tabela-verdade do research.md)
# ──────────────────────────────────────────────────────────────────────────────
# "todo dia 5" — mensal no dia 5.
RR_DIA5 = "FREQ=MONTHLY;BYMONTHDAY=5"
# "toda segunda" — semanal na segunda-feira.
RR_SEGUNDA = "FREQ=WEEKLY;BYDAY=MO"
# "todo dia" — diária.
RR_DIARIA = "FREQ=DAILY"
# "a cada 3 dias" — diária com intervalo 3 (usada em after_completion).
RR_CADA3 = "FREQ=DAILY;INTERVAL=3"
# "todo ano" — aniversário.
RR_ANUAL = "FREQ=YEARLY"

# 2026-06-01 é uma segunda-feira (verificado) — âncora segura para a regra semanal.
ANCORA_SEGUNDA = date(2026, 6, 1)
ANCORA_DIA5 = date(2026, 6, 5)


# ──────────────────────────────────────────────────────────────────────────────
# Camada 1 — motor puro (os 9 edge cases)
# ──────────────────────────────────────────────────────────────────────────────
def test_edge1_reagendar_e_completar_mantem_ancora():
    """Edge 1: reagendar pontualmente para terça e completar não move a âncora (fixed)."""
    # "toda segunda" reagendada para terça (02/06) e concluída na terça → próxima é a segunda seguinte.
    proxima = R.next_occurrence(
        RR_SEGUNDA, ANCORA_SEGUNDA, R.MODE_FIXED,
        current_due=date(2026, 6, 2),   # terça (reagendada)
        completed_on=date(2026, 6, 2),
    )
    assert proxima == date(2026, 6, 8)  # a segunda seguinte


def test_edge2_completar_adiantado_consome_a_ocorrencia():
    """Edge 2: completar "todo dia 5" no dia 3 consome a do dia 5 → próxima é o dia 5 seguinte."""
    proxima = R.next_occurrence(
        RR_DIA5, ANCORA_DIA5, R.MODE_FIXED,
        current_due=date(2026, 6, 5),
        completed_on=date(2026, 6, 3),  # adiantado
    )
    assert proxima == date(2026, 7, 5)


def test_edge3_completar_atrasado_nao_acumula():
    """Edge 3: completar "todo dia 5" no dia 20 consome UMA ocorrência (puladas não acumulam)."""
    proxima = R.next_occurrence(
        RR_DIA5, ANCORA_DIA5, R.MODE_FIXED,
        current_due=date(2026, 6, 5),
        completed_on=date(2026, 6, 20),  # atrasado
    )
    assert proxima == date(2026, 7, 5)  # uma só, não acumulou junho


def test_edge3b_diaria_atrasada_pula_para_o_dia_seguinte():
    """Edge 3 (variante diária): "todo dia" concluído atrasado não gera backlog — só o dia seguinte."""
    proxima = R.next_occurrence(
        RR_DIARIA, date(2026, 6, 1), R.MODE_FIXED,
        current_due=date(2026, 6, 1),
        completed_on=date(2026, 6, 20),
    )
    assert proxima == date(2026, 6, 21)


def test_edge4_after_completion_conta_da_conclusao():
    """Edge 4: modo after_completion calcula a próxima a partir da conclusão real, não da âncora."""
    proxima = R.next_occurrence(
        RR_CADA3, date(2026, 1, 1), R.MODE_AFTER_COMPLETION,  # âncora antiga é irrelevante
        current_due=date(2026, 1, 1),
        completed_on=date(2026, 6, 10),
    )
    assert proxima == date(2026, 6, 13)  # 10 + 3 dias


def test_serie_esgotada_retorna_none():
    """Série finita (COUNT) que terminou → next_occurrence retorna None (chamador desativa a regra)."""
    # FREQ=DAILY;COUNT=1 = só a âncora existe; após ela, não há próxima.
    proxima = R.next_occurrence(
        "FREQ=DAILY;COUNT=1", date(2026, 6, 1), R.MODE_FIXED,
        current_due=date(2026, 6, 1),
        completed_on=date(2026, 6, 1),
    )
    assert proxima is None


def test_aniversario_anual_proximo_ano():
    """Aniversário (FREQ=YEARLY) regenera no mesmo dia do ano seguinte."""
    proxima = R.next_occurrence(
        RR_ANUAL, date(2026, 9, 16), R.MODE_FIXED,
        current_due=date(2026, 9, 16),
        completed_on=date(2026, 9, 16),
    )
    assert proxima == date(2027, 9, 16)


def test_current_due_none_usa_ancora():
    """Defensivo: sem due_date na linha, o cálculo cai na âncora (fixed)."""
    proxima = R.next_occurrence(
        RR_DIA5, ANCORA_DIA5, R.MODE_FIXED,
        current_due=None,
        completed_on=date(2026, 6, 3),
    )
    assert proxima == date(2026, 7, 5)


def test_modo_invalido_levanta():
    """Modo desconhecido levanta ValueError com mensagem clara."""
    with pytest.raises(ValueError):
        R.next_occurrence(RR_DIA5, ANCORA_DIA5, "outro", current_due=ANCORA_DIA5, completed_on=ANCORA_DIA5)


# ──────────────────────────────────────────────────────────────────────────────
# build_rrule / describe_rrule
# ──────────────────────────────────────────────────────────────────────────────
def test_build_rrule_variantes():
    """build_rrule produz as strings RRULE esperadas para o subconjunto da UI."""
    assert R.build_rrule("MONTHLY", monthday=5) == "FREQ=MONTHLY;BYMONTHDAY=5"
    assert R.build_rrule("WEEKLY", weekday="MO") == "FREQ=WEEKLY;BYDAY=MO"
    assert R.build_rrule("DAILY", interval=3) == "FREQ=DAILY;INTERVAL=3"
    assert R.build_rrule("YEARLY") == "FREQ=YEARLY"


def test_build_rrule_validacoes():
    """build_rrule rejeita frequência/intervalo/dia inválidos."""
    with pytest.raises(ValueError):
        R.build_rrule("MINUTELY")
    with pytest.raises(ValueError):
        R.build_rrule("DAILY", interval=0)
    with pytest.raises(ValueError):
        R.build_rrule("WEEKLY", weekday="XX")


def test_describe_rrule_pt_br():
    """describe_rrule verbaliza as regras comuns em português e cai num fallback seguro."""
    assert R.describe_rrule("FREQ=WEEKLY;BYDAY=MO") == "toda segunda"
    assert R.describe_rrule("FREQ=MONTHLY;BYMONTHDAY=5") == "todo dia 5"
    assert R.describe_rrule("FREQ=DAILY;INTERVAL=3") == "a cada 3 dias"
    assert R.describe_rrule("FREQ=DAILY") == "todo dia"
    assert R.describe_rrule("FREQ=YEARLY") == "todo ano"
    assert R.describe_rrule("FREQ=MONTHLY") == "todo mês"
    # Regra exótica → rótulo genérico, nunca quebra.
    assert R.describe_rrule("FREQ=HOURLY;INTERVAL=2") == "recorrente"


# ──────────────────────────────────────────────────────────────────────────────
# Camada 2 — integração com o banco (geração ao concluir/excluir)
# Pulada (skipif) sem DATABASE_URL; os testes puros acima continuam rodando.
# ──────────────────────────────────────────────────────────────────────────────
from datetime import timedelta  # noqa: E402

from agents.db import get_conn, run_select  # noqa: E402
from agents.kaguya import tools_projects as P  # noqa: E402
from agents.kaguya import tools_tasks as T  # noqa: E402

# Decorador que pula os testes de integração quando não há banco configurado.
integration = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL não definida — testes de integração de recorrência pulados.",
)

# Caminho do schema (a partir deste arquivo: tests/agents/ → raiz do repo).
_SCHEMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "agents", "kaguya", "schema_tasks_pg.sql",
)
# Tabelas do domínio (ordem de drop: dependentes primeiro).
_TASK_TABLES = (
    "habit_checkins, habits, task_filters, task_tag_links, task_tags, "
    "task_recurrences, tasks, task_columns, task_projects, task_project_groups"
)


@pytest.fixture()
def inbox_id() -> int:
    """Reseta as tabelas de tarefas e reaplica o schema antes de cada teste de integração.

    Returns:
        O id do Inbox recém-semeado.
    """
    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        schema_sql = f.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DROP TABLE IF EXISTS {_TASK_TABLES} CASCADE")
            cur.execute(schema_sql)
            cur.execute("SELECT id FROM task_projects WHERE is_inbox")
            return cur.fetchone()[0]


def _series_counts(title: str) -> tuple[int, int]:
    """Conta (linhas concluídas, linhas vivas abertas) de uma série pelo título.

    Args:
        title: Título compartilhado pelas ocorrências da série.

    Returns:
        Tupla (concluídas, abertas) — abertas = vivas não-concluídas.
    """
    done = run_select(
        "SELECT COUNT(*) AS n FROM tasks WHERE title = %(t)s AND completed_at IS NOT NULL AND deleted_at IS NULL",
        {"t": title},
    )[0]["n"]
    open_ = run_select(
        "SELECT COUNT(*) AS n FROM tasks WHERE title = %(t)s AND completed_at IS NULL AND deleted_at IS NULL",
        {"t": title},
    )[0]["n"]
    return int(done), int(open_)


@integration
def test_int_complete_generates_next(inbox_id):
    """V2: concluir uma recorrente 'todo dia 5' gera UMA próxima ocorrência (dia 5)."""
    rule = R.build_rrule("MONTHLY", monthday=5)
    created = T.create_task("aluguel", project_id=inbox_id, due_date="2026-06-05",
                            recurrence={"rrule": rule, "mode": "fixed"})
    assert created["status"] == "ok"
    tid = created["id"]

    # A listagem traz a recorrência anexada (glyph/eco).
    row = next(t for t in T.list_tasks(inbox_id) if t["id"] == tid)
    assert row["recurrence"] is not None and row["recurrence"]["mode"] == "fixed"
    assert row["recurrence_text"] == "todo dia 5"

    res = T.complete_task(tid)
    assert res["status"] == "ok"
    assert res["generated_task_id"] is not None
    # A próxima cai sempre num dia 5 (estrutural — independe do relógio).
    assert date.fromisoformat(res["next_due_date"]).day == 5
    # A regra mudou de dono para a nova linha viva.
    owner = run_select("SELECT task_id FROM task_recurrences", {})[0]["task_id"]
    assert owner == res["generated_task_id"]
    # Uma consumida + uma viva.
    done, open_ = _series_counts("aluguel")
    assert (done, open_) == (1, 1)


@integration
def test_int_history_preserved_three_completions(inbox_id):
    """V3 / SC-004: três conclusões → três linhas consumidas + uma viva."""
    rule = R.build_rrule("DAILY")
    tid = T.create_task("beber água", project_id=inbox_id, due_date="2026-06-05",
                        recurrence={"rrule": rule, "mode": "fixed"})["id"]
    for _ in range(3):
        # Sempre conclui a ocorrência viva atual da série.
        live = run_select(
            "SELECT id FROM tasks WHERE title = 'beber água' AND completed_at IS NULL AND deleted_at IS NULL",
            {},
        )[0]["id"]
        T.complete_task(live)
    done, open_ = _series_counts("beber água")
    assert (done, open_) == (3, 1)


@integration
def test_int_subtasks_reset_on_regenerate(inbox_id):
    """Edge 6: a nova ocorrência nasce com as subtarefas reabertas (reset)."""
    tid = T.create_task("rotina", project_id=inbox_id, due_date="2026-06-05",
                        recurrence={"rrule": R.build_rrule("DAILY"), "mode": "fixed"})["id"]
    T.create_task("passo 1", parent_id=tid)
    T.create_task("passo 2", parent_id=tid)
    res = T.complete_task(tid, cascade=True)  # conclui pai + subtarefas
    new_id = res["generated_task_id"]
    new_row = next(t for t in T.list_tasks(inbox_id) if t["id"] == new_id)
    assert len(new_row["subtasks"]) == 2
    assert all(s["completed_at"] is None for s in new_row["subtasks"])  # renasceram abertas


@integration
def test_int_after_completion_mode(inbox_id):
    """Edge 4: after_completion gera a próxima a partir de hoje (não da âncora)."""
    rule = R.build_rrule("DAILY", interval=3)
    tid = T.create_task("trocar filtro", project_id=inbox_id, due_date="2026-01-01",
                        recurrence={"rrule": rule, "mode": "after_completion"})["id"]
    res = T.complete_task(tid)
    esperado = (date.today() + timedelta(days=3)).isoformat()
    assert res["next_due_date"] == esperado


@integration
def test_int_end_series_no_generation(inbox_id):
    """Edge 5: concluir a série (end_series) não gera próxima e desativa a regra."""
    tid = T.create_task("plano antigo", project_id=inbox_id, due_date="2026-06-05",
                        recurrence={"rrule": R.build_rrule("MONTHLY", monthday=5), "mode": "fixed"})["id"]
    res = T.complete_task(tid, end_series=True)
    assert res["status"] == "ok" and res["generated_task_id"] is None
    # Regra preservada porém inativa (histórico).
    rule = run_select("SELECT active FROM task_recurrences WHERE task_id = %(t)s", {"t": tid})[0]
    assert rule["active"] is False
    done, open_ = _series_counts("plano antigo")
    assert (done, open_) == (1, 0)


@integration
def test_int_delete_scope_this_and_series(inbox_id):
    """Edge 9: excluir 'só esta' gera a próxima; 'a série inteira' desativa a regra."""
    # scope=this
    a = T.create_task("recorrente A", project_id=inbox_id, due_date="2026-06-05",
                      recurrence={"rrule": R.build_rrule("MONTHLY", monthday=5), "mode": "fixed"})["id"]
    res = T.delete_task(a, scope="this")
    assert res["status"] == "ok" and res.get("generated_task_id") is not None
    _, open_a = _series_counts("recorrente A")
    assert open_a == 1  # a próxima nasceu

    # scope=series
    b = T.create_task("recorrente B", project_id=inbox_id, due_date="2026-06-05",
                      recurrence={"rrule": R.build_rrule("MONTHLY", monthday=5), "mode": "fixed"})["id"]
    res = T.delete_task(b, scope="series")
    assert res["status"] == "ok" and "generated_task_id" not in res
    _, open_b = _series_counts("recorrente B")
    assert open_b == 0  # nada nasceu
    assert run_select("SELECT active FROM task_recurrences WHERE task_id = %(t)s", {"t": b})[0]["active"] is False


@integration
def test_int_edit_rule_keeps_open_due_date(inbox_id):
    """Edge 8: editar a regra com ocorrência aberta NÃO muda o due_date da linha viva."""
    tid = T.create_task("revisão", project_id=inbox_id, due_date="2026-06-20",
                        recurrence={"rrule": R.build_rrule("WEEKLY", weekday="MO"), "mode": "fixed"})["id"]
    T.update_task(tid, recurrence={"rrule": R.build_rrule("MONTHLY", monthday=5), "mode": "fixed"})
    row = next(t for t in T.list_tasks(inbox_id) if t["id"] == tid)
    assert row["due_date"] == "2026-06-20"           # a data aberta ficou
    assert row["recurrence_text"] == "todo dia 5"    # a regra nova vale da próxima geração


@integration
def test_int_birthday_yearly(inbox_id):
    """US3: type=birthday cria recorrência anual; concluir gera a do ano seguinte."""
    created = T.create_task("aniversário da mãe", project_id=inbox_id, type="birthday", due_date="2026-09-16")
    tid = created["id"]
    row = next(t for t in T.list_tasks(inbox_id) if t["id"] == tid)
    assert row["recurrence"] is not None and row["recurrence_text"] == "todo ano"
    res = T.complete_task(tid)
    nxt = date.fromisoformat(res["next_due_date"])
    assert (nxt.month, nxt.day) == (9, 16) and nxt.year >= 2027


@integration
def test_int_recurrence_requires_due_date(inbox_id):
    """FR-008: tentar tornar recorrente uma tarefa sem data é rejeitado."""
    r = T.create_task("sem data", project_id=inbox_id,
                      recurrence={"rrule": R.build_rrule("DAILY"), "mode": "fixed"})
    assert r["status"] == "error"


@integration
def test_int_clear_recurrence(inbox_id):
    """clear_recurrence remove a regra (tarefa volta a ser simples)."""
    tid = T.create_task("temporária", project_id=inbox_id, due_date="2026-06-05",
                        recurrence={"rrule": R.build_rrule("DAILY"), "mode": "fixed"})["id"]
    assert T.clear_recurrence(tid)["status"] == "ok"
    row = next(t for t in T.list_tasks(inbox_id) if t["id"] == tid)
    assert row["recurrence"] is None
