"""Testes da spec 070 — fase 1: transferência com sinal, pagamento de fatura como transferência,
saldo/dívida corretos e vencimento sem deriva para o dia 28.

Sem banco: o cursor é substituído por um gravador, e `run_select` devolve linhas fixas.
(Os outros testes de tests/agents/nami/ patcham nomes da era BigQuery e já falham antes
desta fase — estes aqui usam os nomes atuais.)

Execute com:
    pytest tests/agents/nami/test_signed_transfers.py -v
"""

from contextlib import contextmanager
from datetime import date
from unittest.mock import patch

import pytest

import agents.nami.tools as t
import agents.nami.tools_accounts as acc
import agents.nami.tools_credit_cards as cc
from scripts.migrate_nami_signed_transfers import plan_payment_conversions, plan_transfer_fixes


class RecordingCursor:
    """Guarda cada execute(sql, params) para o teste inspecionar o que seria gravado."""

    def __init__(self):
        self.calls: list[tuple[str, dict]] = []

    def execute(self, sql, params=None):
        self.calls.append((sql, params or {}))

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def fake_get_conn(cursor: RecordingCursor):
    """Substitui get_conn(): entrega uma conexão cujo cursor() é o gravador."""

    class _Conn:
        def cursor(self, *a, **k):
            return cursor

    @contextmanager
    def _ctx():
        yield _Conn()

    return _ctx


# ─── Vencimento: sem deriva para o dia 28 ─────────────────────────────────────

@pytest.mark.parametrize(
    "current, ciclo, anchor, esperado",
    [
        (date(2026, 1, 31), "mensal", None, date(2026, 2, 28)),    # fevereiro curto
        (date(2028, 1, 31), "mensal", None, date(2028, 2, 29)),    # ano bissexto
        (date(2026, 2, 28), "mensal", 31, date(2026, 3, 31)),      # âncora 31 volta ao 31 (antes ficava no 28)
        (date(2026, 3, 31), "mensal", 31, date(2026, 4, 30)),      # abril tem 30
        (date(2026, 12, 15), "mensal", None, date(2027, 1, 15)),   # virada de ano
        (date(2026, 5, 10), "anual", None, date(2027, 5, 10)),
        (date(2024, 2, 29), "anual", 29, date(2025, 2, 28)),       # 29/fev em ano não bissexto
    ],
)
def test_roll_billing_date(current, ciclo, anchor, esperado):
    assert t._roll_billing_date(current, ciclo, anchor) == esperado


def test_roll_billing_date_dia_31_nunca_deriva_em_um_ano():
    """Simula 12 pagamentos seguidos de uma conta do dia 31: sempre o último dia possível, nunca 28 fixo."""
    d = date(2026, 1, 31)
    vistos = []
    for _ in range(12):
        d = t._roll_billing_date(d, "mensal", 31)
        vistos.append(d.day)
    assert vistos == [28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31, 31]


# ─── Transferência com sinal ──────────────────────────────────────────────────

ORIGEM = {"id": "acc-itau", "name": "Itau"}
DESTINO_CONTA = {"id": "acc-nu", "name": "NuConta"}
CARTAO = {"id": "card-nu", "name": "Nubank"}


def test_insert_transfer_pair_origem_negativa_destino_positivo():
    cur = RecordingCursor()
    tid = t._insert_transfer_pair(
        cur, origin=ORIGEM, dest=DESTINO_CONTA, dest_is_card=False,
        valor=150.0, data="2026-10-02", notes="aluguel", names=("para", "de"),
    )
    (_, origem), (_, destino) = cur.calls
    assert origem["valor"] == -150.0 and origem["account_id"] == "acc-itau" and origem["card_id"] is None
    assert destino["valor"] == 150.0 and destino["account_id"] == "acc-nu" and destino["card_id"] is None
    assert origem["transfer_id"] == destino["transfer_id"] == tid
    assert origem["id"] != destino["id"]


def test_insert_transfer_pair_destino_cartao_usa_card_id_e_zera_account_id():
    cur = RecordingCursor()
    t._insert_transfer_pair(
        cur, origin=ORIGEM, dest=CARTAO, dest_is_card=True,
        valor=500.0, data="2026-10-02", notes="", names=("a", "b"),
    )
    (_, origem), (_, destino) = cur.calls
    assert origem["account_id"] == "acc-itau" and origem["card_id"] is None
    assert destino["account_id"] is None and destino["card_id"] == "card-nu"  # mutuamente exclusivos


def test_insert_transfer_pair_valor_sempre_normalizado_pelo_sinal():
    """Mesmo que o chamador passe um valor negativo, origem fica negativa e destino positivo."""
    cur = RecordingCursor()
    t._insert_transfer_pair(
        cur, origin=ORIGEM, dest=DESTINO_CONTA, dest_is_card=False,
        valor=-80.0, data="2026-10-02", notes="", names=("a", "b"),
    )
    assert cur.calls[0][1]["valor"] == -80.0
    assert cur.calls[1][1]["valor"] == 80.0


def _patch_transfer_env(cur, accounts=None, cards=None):
    accounts = accounts or {"itau": ORIGEM, "nuconta": DESTINO_CONTA}
    cards = cards or {"nubank": CARTAO}
    return (
        patch.object(t, "get_conn", fake_get_conn(cur)),
        patch.object(t, "_resolve_account", side_effect=lambda n: accounts.get(t._norm(n))),
        patch.object(t, "_resolve_credit_card", side_effect=lambda n: cards.get(t._norm(n))),
        patch.object(t, "_touch_calendar"),
    )


def test_create_transfer_entre_contas_ok():
    cur = RecordingCursor()
    p1, p2, p3, p4 = _patch_transfer_env(cur)
    with p1, p2, p3, p4:
        r = t.create_transfer("Itau", "NuConta", 100.0, data="2026-10-02")
    assert r["status"] == "ok" and r["transfer_id"]
    assert [c[1]["valor"] for c in cur.calls] == [-100.0, 100.0]


def test_create_transfer_para_cartao_ok():
    cur = RecordingCursor()
    p1, p2, p3, p4 = _patch_transfer_env(cur)
    with p1, p2, p3, p4:
        r = t.create_transfer("Itau", valor=300.0, to_card="Nubank")
    assert r["status"] == "ok"
    assert cur.calls[1][1]["card_id"] == "card-nu"


@pytest.mark.parametrize(
    "kwargs, trecho",
    [
        (dict(from_account="Itau", to_account="Itau", valor=10.0), "diferentes"),
        (dict(from_account="Itau", to_account="NuConta", valor=0.0), "positivo"),
        (dict(from_account="Itau", to_account="NuConta", valor=-5.0), "positivo"),
        (dict(from_account="Fantasma", to_account="NuConta", valor=10.0), "origem não encontrada"),
        (dict(from_account="Itau", to_account="Fantasma", valor=10.0), "destino não encontrada"),
        (dict(from_account="Itau", valor=10.0, to_card="Fantasma"), "Cartão de destino"),
    ],
)
def test_create_transfer_validacoes_nao_gravam_nada(kwargs, trecho):
    cur = RecordingCursor()
    p1, p2, p3, p4 = _patch_transfer_env(cur)
    with p1, p2, p3, p4:
        r = t.create_transfer(**kwargs)
    assert r["status"] == "error" and trecho in r["message"]
    assert cur.calls == []


# ─── Pagamento de fatura = transferência ──────────────────────────────────────

CARD_ROW = {"id": "card-nu", "name": "Nubank", "account_id": "acc-itau", "conta": "Itau"}


def test_register_card_payment_debita_conta_vinculada_e_abate_cartao():
    cur = RecordingCursor()
    with patch.object(cc, "run_select", return_value=[CARD_ROW]), \
         patch.object(cc, "get_conn", fake_get_conn(cur)), \
         patch.object(cc, "_touch_calendar"):
        r = cc.register_card_payment("card-nu", 500.0, data="2026-10-02")

    assert r["status"] == "ok" and r["transfer_id"]
    (_, saida), (_, entrada) = cur.calls
    assert saida["valor"] == -500.0 and saida["account_id"] == "acc-itau"      # sai da conta que paga o cartão
    assert entrada["valor"] == 500.0 and entrada["card_id"] == "card-nu"       # abate a dívida do cartão
    assert saida["name"].startswith("Pagamento fatura")
    # Nunca mais uma Receita: é movimentação, não renda
    assert all("'Transferencia'" in sql and "'Receita'" not in sql for sql, _ in cur.calls)


def test_register_card_payment_from_account_sobrescreve_a_conta_vinculada():
    cur = RecordingCursor()
    with patch.object(cc, "run_select", return_value=[CARD_ROW]), \
         patch.object(cc, "_resolve_account", return_value={"id": "acc-nu", "name": "NuConta"}), \
         patch.object(cc, "get_conn", fake_get_conn(cur)), \
         patch.object(cc, "_touch_calendar"):
        r = cc.register_card_payment("card-nu", 50.0, from_account="NuConta")
    assert r["status"] == "ok"
    assert cur.calls[0][1]["account_id"] == "acc-nu"


def test_register_card_payment_valor_invalido_e_cartao_inexistente():
    assert cc.register_card_payment("card-nu", 0.0)["status"] == "error"
    assert cc.register_card_payment("card-nu", -10.0)["status"] == "error"
    with patch.object(cc, "run_select", return_value=[]):
        r = cc.register_card_payment("nao-existe", 10.0)
    assert r["status"] == "error" and "não encontrado" in r["message"]


# ─── Dívida do cartão (acumulada) ─────────────────────────────────────────────

def test_card_debt_nunca_negativa_e_consulta_acumulada_ate_hoje():
    with patch.object(cc, "run_select", return_value=[{"saldo": -120.0}]) as sel:
        assert cc._card_debt("card-nu") == 0.0  # pagou a mais → sem dívida, não dívida negativa
    sql, params = sel.call_args.args
    assert "'Transferencia'" in sql and "'Despesa'" in sql and "'Receita'" in sql
    assert "data <= %(today)s" in sql and "BETWEEN" not in sql   # acumulada, não só o ciclo
    assert params["card_id"] == "card-nu" and params["today"]


def test_card_debt_valor_positivo():
    with patch.object(cc, "run_select", return_value=[{"saldo": 2400.0}]):
        assert cc._card_debt("card-nu") == pytest.approx(2400.0)


# ─── Saldo de conta ───────────────────────────────────────────────────────────

def test_get_account_balance_soma_transferencias_com_sinal():
    respostas = [
        [{"id": "a", "name": "Itau", "type": "corrente", "balance_inicial": 1000.0, "data_inicio": None}],
        [{"receitas": 500.0, "despesas": 200.0, "transferencias": -300.0}],  # saiu mais do que entrou
    ]
    with patch.object(acc, "run_select", side_effect=respostas):
        r = acc.get_account_balance("a")
    assert r["saldo_atual"] == pytest.approx(1000 + 500 - 200 - 300)
    assert r["total_transferencias"] == -300.0


def test_get_account_balance_ignora_lancamento_futuro_na_consulta():
    respostas = [
        [{"id": "a", "name": "Itau", "type": "corrente", "balance_inicial": 0.0, "data_inicio": None}],
        [{"receitas": 0.0, "despesas": 0.0, "transferencias": 0.0}],
    ]
    with patch.object(acc, "run_select", side_effect=respostas) as sel:
        acc.get_account_balance("a")
    sql, params = sel.call_args_list[1].args
    assert "data <= %(today)s" in sql and params["today"]


def test_get_accounts_overview_total_real():
    rows = [
        {"id": "a", "name": "Itau", "type": "corrente", "balance_inicial": 1000.0, "movimento": -250.5},
        {"id": "b", "name": "Nu", "type": "corrente", "balance_inicial": 0.0, "movimento": 400.0},
    ]
    with patch.object(acc, "run_select", return_value=rows):
        r = acc.get_accounts_overview()
    assert [a["saldo_atual"] for a in r["accounts"]] == [749.5, 400.0]
    assert r["saldo_total"] == pytest.approx(1149.5)


# ─── Resumo/tendência de gastos só contam despesa ─────────────────────────────

def test_spending_summary_so_conta_despesa_por_categoria():
    with patch.object(t, "run_select", return_value=[]) as sel:
        t.get_spending_summary("month", "categoria")
    assert "tipo = 'Despesa'" in sel.call_args.args[0]


def test_spending_summary_por_tipo_mantem_receita_mas_exclui_transferencia():
    with patch.object(t, "run_select", return_value=[]) as sel:
        t.get_spending_summary("month", "tipo")
    sql = sel.call_args.args[0]
    assert "tipo <> 'Transferencia'" in sql and "tipo = 'Despesa'" not in sql


def test_spending_trend_so_conta_despesa():
    with patch.object(t, "run_select", return_value=[]) as sel:
        t.get_spending_trend(2)
    assert "tipo = 'Despesa'" in sel.call_args.args[0]


# ─── Migração: planejamento puro ──────────────────────────────────────────────

def _tx(i, tid, name, valor):
    return {"id": i, "transfer_id": tid, "name": name, "valor": valor}


def test_plan_transfer_fixes_negativa_so_a_origem_de_pares_integros():
    rows = [
        _tx("o1", "T1", "Transferência para NuConta", 100.0),
        _tx("d1", "T1", "Transferência de Itau", 100.0),
    ]
    fix, avisos = plan_transfer_fixes(rows)
    assert fix == ["o1"] and avisos == []


def test_plan_transfer_fixes_idempotente_depois_de_aplicado():
    rows = [
        _tx("o1", "T1", "Transferência para NuConta", -100.0),   # já migrada
        _tx("d1", "T1", "Transferência de Itau", 100.0),
    ]
    assert plan_transfer_fixes(rows) == ([], [])


def test_plan_transfer_fixes_ignora_e_avisa_pares_estranhos():
    rows = [
        _tx("o1", "T1", "Transferência para X", 100.0),          # par incompleto (1 linha)
        _tx("o2", "T2", "Transferência para Y", 100.0),
        _tx("d2", "T2", "Transferência de Z", 90.0),             # valores diferentes
        _tx("a3", "T3", "Qualquer coisa", 10.0),
        _tx("b3", "T3", "Outra coisa", 10.0),                    # nenhum nome de origem
    ]
    fix, avisos = plan_transfer_fixes(rows)
    assert fix == [] and len(avisos) == 3


def _pay(data, inicio, account_id="acc-itau"):
    return {"id": "p", "name": "Pagamento fatura — Nubank", "valor": 100.0, "data": data,
            "card_name": "Nubank", "account_id": account_id, "account_name": "Itau", "data_inicio": inicio}


def test_plan_payment_conversions_cria_origem_quando_a_conta_ja_rastreava():
    (p,) = plan_payment_conversions([_pay(date(2026, 6, 1), date(2026, 1, 1))])
    assert p["create_origin"] is True


def test_plan_payment_conversions_pula_origem_anterior_a_data_inicio_ou_sem_conta():
    antigo, sem_conta = plan_payment_conversions([
        _pay(date(2025, 12, 1), date(2026, 1, 1)),
        _pay(date(2026, 6, 1), None, account_id=None),
    ])
    assert antigo["create_origin"] is False and "data_inicio" in antigo["reason"]
    assert sem_conta["create_origin"] is False and "sem conta" in sem_conta["reason"]
