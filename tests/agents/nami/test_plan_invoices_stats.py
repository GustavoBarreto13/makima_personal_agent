"""Testes da spec 070 — fase 2: plano do mês, faturas derivadas, parcelamento atômico,
renda recorrente, busca e estatísticas no contrato do Design System.

Sem banco (cursor gravador / run_select simulado) — mesma abordagem de test_signed_transfers.py.

Execute com:
    pytest tests/agents/nami/test_plan_invoices_stats.py -v
"""

from datetime import date
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import agents.nami.tools as t
import agents.nami.tools_credit_cards as cc
import agents.nami.tools_installments as inst
import agents.nami.tools_plan as plan
import agents.nami.tools_stats as stats
from agents.nami.toolset import TOOLS
from tests.agents.nami.test_signed_transfers import RecordingCursor, fake_get_conn
from webapp.backend.deps import require_user
from webapp.backend.main import app

HOJE = date(2026, 10, 2)


# ─── Plano do mês (aritmética pura) ───────────────────────────────────────────

def test_plan_cenario_do_plano_renda_5000_conta_300_compra_200_livre_4500():
    p = plan.compute_plan(
        renda_recebida=5000, renda_pendente=0, gasto=200, agendado=0, pendente=300, dias_restantes=30,
    )
    assert p["livre"] == 4500.0
    assert p["livre_por_dia"] == 150.0
    assert p["barra"] == {"gasto": 200.0, "a_sair": 300.0, "livre": 4500.0}
    assert p["estourou"] is False


def test_plan_renda_pendente_e_parcelas_agendadas_entram_na_conta():
    p = plan.compute_plan(2000, 3000, 1500, 400, 250, 10)
    assert p["renda_total"] == 5000.0
    assert p["a_sair"] == 650.0
    assert p["livre"] == 5000 - 1500 - 650


def test_plan_estourou_nao_gera_gasto_diario_negativo():
    p = plan.compute_plan(1000, 0, 1200, 0, 0, 5)
    assert p["livre"] == -200.0 and p["estourou"] is True
    assert p["livre_por_dia"] == 0.0
    assert p["barra"]["livre"] == 0.0


def test_plan_fora_do_mes_corrente_nao_tem_gasto_por_dia():
    assert plan.compute_plan(1000, 0, 100, 0, 0, 0)["livre_por_dia"] is None


def test_expected_recurring_mensal_sempre_anual_so_no_mes_de_cobranca():
    items = [
        {"ciclo": "mensal", "valor": 100.0, "kind": "conta_fixa"},
        {"ciclo": "anual", "valor": 600.0, "kind": "assinatura", "next_billing": "2027-03-10"},
        {"ciclo": "mensal", "valor": 5000.0, "kind": "renda"},
    ]
    assert plan._expected_recurring(items, 2026, 11) == (100.0, 5000.0)
    assert plan._expected_recurring(items, 2027, 3) == (700.0, 5000.0)


def _fake_select(tot, cats=None, cards=None):
    def _sel(sql, params=None):
        if "FROM credit_cards" in sql:
            return cards or []
        if "GROUP BY categoria" in sql:
            return cats or []
        return [tot]
    return _sel


TOT = {"renda_recebida": 5000.0, "renda_agendada": 0.0, "gasto": 200.0, "agendado": 0.0}


def test_get_month_plan_mes_corrente_integra_recorrentes_e_a_pagar():
    status = {
        "status": "ok", "renda_pendente": 0.0,
        "items": [
            {"id": "s1", "name": "Luz", "valor": 300.0, "kind": "conta_fixa", "ciclo": "mensal",
             "next_billing": "2026-10-05", "cycle_status": "pendente"},
            {"id": "s2", "name": "Netflix", "valor": 55.9, "kind": "assinatura", "ciclo": "mensal",
             "next_billing": "2026-10-20", "cycle_status": "paga"},        # já paga: não pesa
        ],
    }
    with patch.object(plan, "_today_date", return_value=HOJE), \
         patch.object(plan, "run_select", side_effect=_fake_select(TOT, cats=[{"categoria": "Lazer", "total": 200.0}])), \
         patch.object(plan, "get_recurring_status", return_value=status), \
         patch("agents.nami.tools_accounts.get_accounts_overview", return_value={"status": "ok", "saldo_total": 1234.5}):
        r = plan.get_month_plan()

    assert r["status"] == "ok" and r["month"] == "2026-10" and r["is_current"] is True
    assert r["pendente"] == 300.0 and r["livre"] == 4500.0       # o cenário do plano, ponta a ponta
    assert r["dias_restantes"] == 30 and r["livre_por_dia"] == 150.0
    assert r["saldo_contas"] == 1234.5
    assert [a["name"] for a in r["a_pagar"]] == ["Luz"]
    assert r["a_pagar"][0]["due"] == "2026-10-05" and r["a_pagar"][0]["kind"] == "conta"
    assert r["top_categorias"] == [{"categoria": "Lazer", "total": 200.0, "pct": 100.0}]


def test_get_month_plan_a_pagar_so_traz_o_que_vence_na_janela_mas_sempre_as_atrasadas():
    def item(i, due, st):
        return {"id": i, "name": i, "valor": 10.0, "kind": "conta_fixa", "ciclo": "mensal",
                "next_billing": due, "cycle_status": st}
    items = [item("longe", "2026-10-28", "pendente"), item("atrasada", "2026-10-01", "atrasada"),
             item("perto", "2026-10-09", "pendente")]
    with patch.object(plan, "run_select", return_value=[]):
        out = plan._a_pagar(items, HOJE)
    assert [a["name"] for a in out] == ["atrasada", "perto"]


def test_get_month_plan_inclui_fatura_fechada_nao_paga_mas_nao_a_aberta():
    invoices = {"status": "ok", "invoices": [
        {"id": "2026-10", "status": "fechada", "restante": 800.0, "due": "2026-10-08"},
        {"id": "2026-11", "status": "aberta", "restante": 120.0, "due": "2026-11-08"},
    ]}
    with patch.object(plan, "run_select", return_value=[{"id": "c1", "name": "Nubank"}]), \
         patch("agents.nami.tools_credit_cards.get_card_invoices", return_value=invoices):
        out = plan._a_pagar([], HOJE)
    assert [(a["name"], a["valor"], a["kind"]) for a in out] == [("Fatura Nubank", 800.0, "fatura")]


def test_get_month_plan_mes_invalido():
    assert plan.get_month_plan("2026-xx")["status"] == "error"


# ─── Faturas ──────────────────────────────────────────────────────────────────

def _buy(day, valor, name="compra", **extra):
    return {"id": f"{name}-{day}", "name": name, "valor": valor, "data": day, **extra}


def test_invoice_key_fecha_dia_6():
    from agents.nami.tools_credit_cards import _invoice_key
    assert _invoice_key(date(2026, 10, 6), 6) == (2026, 10)    # no dia do fechamento ainda é a fatura que fecha
    assert _invoice_key(date(2026, 10, 7), 6) == (2026, 11)    # depois cai na seguinte
    assert _invoice_key(date(2026, 12, 28), 25) == (2027, 1)   # virada de ano


def test_invoice_dates_vencimento_no_mes_seguinte_quando_due_menor_que_closing():
    from agents.nami.tools_credit_cards import _invoice_dates
    assert _invoice_dates((2026, 10), 6, 13) == (date(2026, 9, 7), date(2026, 10, 6), date(2026, 10, 13))
    assert _invoice_dates((2026, 10), 25, 5) == (date(2026, 9, 26), date(2026, 10, 25), date(2026, 11, 5))


def test_invoice_dates_fevereiro_curto_ajusta_o_dia():
    from agents.nami.tools_credit_cards import _invoice_dates
    _, closing, due = _invoice_dates((2026, 2), 31, 10)
    assert closing == date(2026, 2, 28) and due == date(2026, 3, 10)


def test_build_invoices_atribui_compras_e_calcula_status():
    # fecha dia 6 / vence dia 13; hoje = 02/10
    purchases = [
        _buy(date(2026, 9, 10), 500.0),    # fatura 2026-10 (fecha 06/10, ainda aberta hoje)
        _buy(date(2026, 9, 20), 300.0),    # idem
        _buy(date(2026, 10, 7), 100.0),    # fatura 2026-11 (futura em relação ao fechamento? não: já começou)
        _buy(date(2026, 8, 15), 200.0),    # fatura 2026-09 (fechou 06/09, venceu 13/09)
    ]
    inv = {i["id"]: i for i in cc.build_invoices(purchases, 0.0, 6, 13, HOJE)}
    assert inv["2026-09"]["status"] == "atrasada" and inv["2026-09"]["restante"] == 200.0
    assert inv["2026-10"]["status"] == "aberta" and inv["2026-10"]["total"] == 800.0
    assert inv["2026-11"]["status"] == "futura" and inv["2026-11"]["total"] == 100.0


def test_build_invoices_pagamento_abate_da_fatura_mais_antiga_primeiro():
    purchases = [_buy(date(2026, 8, 15), 200.0), _buy(date(2026, 9, 10), 500.0)]
    inv = {i["id"]: i for i in cc.build_invoices(purchases, 300.0, 6, 13, HOJE)}
    assert inv["2026-09"]["status"] == "paga" and inv["2026-09"]["pago"] == 200.0
    assert inv["2026-10"]["pago"] == 100.0 and inv["2026-10"]["restante"] == 400.0
    # o que sobra em aberto soma exatamente a dívida (700 − 300)
    assert sum(i["restante"] for i in inv.values()) == pytest.approx(400.0)


def test_build_invoices_fechada_ainda_no_prazo_vira_fechada_e_depois_atrasada():
    purchases = [_buy(date(2026, 9, 10), 500.0)]    # fatura 2026-10: fecha 06/10, vence 13/10
    fechada = cc.build_invoices(purchases, 0.0, 6, 13, date(2026, 10, 8))
    atrasada = cc.build_invoices(purchases, 0.0, 6, 13, date(2026, 10, 14))
    assert [i["status"] for i in fechada if i["id"] == "2026-10"] == ["fechada"]
    assert [i["status"] for i in atrasada if i["id"] == "2026-10"] == ["atrasada"]


def test_build_invoices_compra_parcelada_cai_numa_fatura_por_mes():
    """1.200 em 10x comprado dia 10 (fecha dia 6): 10 parcelas de 120 em 10 faturas consecutivas."""
    parcelas = []
    for i in range(10):
        y, m = divmod(9 + i, 12)           # out/2026 em diante
        parcelas.append(_buy(date(2026 + y, m + 1, 10), 120.0, name=f"TV ({i + 1}/10)", installment_group_id="g1"))
    invs = cc.build_invoices(parcelas, 0.0, 6, 13, HOJE, months_ahead=12)
    com_tv = [i for i in invs if i["total"] == 120.0]
    assert len(com_tv) == 10
    assert [i["id"] for i in com_tv] == [f"{2026 + (10 + k) // 12}-{(10 + k) % 12 + 1:02d}" for k in range(10)]
    assert all(it["parcelada"] for i in com_tv for it in i["items"])


def test_build_invoices_sempre_inclui_a_atual_mesmo_vazia():
    invs = cc.build_invoices([], 0.0, 6, 13, HOJE)
    assert [(i["id"], i["total"], i["status"]) for i in invs] == [("2026-10", 0.0, "aberta")]


def test_get_card_invoices_monta_resposta_e_desconta_pagamentos_futuros():
    card = {"id": "c1", "name": "Nubank", "limite": 5000.0, "closing_day": 6, "due_day": 13}
    rows = [
        {"id": "a", "name": "mercado", "valor": 400.0, "tipo": "Despesa", "data": date(2026, 9, 10), "installment_group_id": None},
        {"id": "p", "name": "pagto", "valor": 100.0, "tipo": "Transferencia", "data": date(2026, 9, 30), "installment_group_id": None},
        {"id": "f", "name": "pagto futuro", "valor": 999.0, "tipo": "Transferencia", "data": date(2026, 12, 1), "installment_group_id": None},
    ]
    with patch.object(cc, "_today_date", return_value=HOJE), \
         patch.object(cc, "_card_debt", return_value=300.0), \
         patch.object(cc, "run_select", side_effect=[[card], rows]):
        r = cc.get_card_invoices("c1")
    assert r["status"] == "ok"
    assert r["card"]["divida_atual"] == 300.0 and r["card"]["limite_disponivel"] == 4700.0
    atual = next(i for i in r["invoices"] if i["id"] == "2026-10")
    assert atual["total"] == 400.0 and atual["pago"] == 100.0       # o pagamento futuro não conta ainda


def test_get_card_invoices_cartao_inexistente():
    with patch.object(cc, "run_select", return_value=[]):
        assert cc.get_card_invoices("x")["status"] == "error"


# ─── Parcelamento: atômico e sem perder centavos ──────────────────────────────

def _env_installment(cur):
    return (
        patch.object(inst, "get_conn", fake_get_conn(cur)),
        patch.object(inst, "_resolve_account", return_value={"id": "acc-1", "name": "Itau"}),
        patch.object(inst, "_match_category", return_value="Eletronicos"),
    )


@pytest.mark.parametrize("total, n", [(100.0, 3), (3600.0, 12), (99.99, 7), (0.10, 3)])
def test_split_installments_soma_sempre_o_total(total, n):
    base, primeira = inst.split_installments(total, n)
    assert round(primeira + base * (n - 1), 2) == round(total, 2)


def test_create_installment_grava_grupo_e_parcelas_numa_transacao_so():
    cur = RecordingCursor()
    p1, p2, p3 = _env_installment(cur)
    with p1, p2, p3:
        r = inst.create_installment("TV", 100.0, 3, "Itau", "Eletronicos", "2026-10-10")
    assert r["status"] == "ok" and len(r["transaction_ids"]) == 3
    assert len(cur.calls) == 4                                         # 1 grupo + 3 parcelas
    valores = [c[1]["valor"] for c in cur.calls[1:]]
    assert valores == [33.34, 33.33, 33.33] and round(sum(valores), 2) == 100.0   # antes dava 99,99
    assert [c[1]["data"] for c in cur.calls[1:]] == ["2026-10-10", "2026-11-10", "2026-12-10"]


def test_create_installment_falha_no_meio_devolve_erro_e_propaga_para_rollback():
    class Boom(RecordingCursor):
        def execute(self, sql, params=None):
            super().execute(sql, params)
            if len(self.calls) == 3:
                raise RuntimeError("falhou a parcela 2")

    cur = Boom()
    p1, p2, p3 = _env_installment(cur)
    with p1, p2, p3:
        r = inst.create_installment("TV", 100.0, 3, "Itau", "Eletronicos", "2026-10-10")
    assert r["status"] == "error" and "parcela 2" in r["message"]


def test_create_installment_cartao_espelha_card_id_e_zera_account_id():
    cur = RecordingCursor()
    p1, _, p3 = _env_installment(cur)
    with p1, p3, patch.object(inst, "_load_cards", return_value=[{"id": "card-1", "name": "Nubank"}]):
        r = inst.create_installment("TV", 200.0, 2, "", "Eletronicos", "2026-10-10", card_id="card-1")
    assert r["status"] == "ok"
    assert all(c[1]["account_id"] is None and c[1]["card_id"] == "card-1" for c in cur.calls[1:])


# ─── Renda recorrente ─────────────────────────────────────────────────────────

SUB = {"id": "r1", "name": "Salário", "ciclo": "mensal", "next_billing": date(2026, 10, 5),
       "conta": "Itau", "categoria": "Receita", "card_id": None, "next_billing_day": 5, "kind": "renda"}


def _pay(sub):
    cur = RecordingCursor()
    captured = {}

    def fake_create(cur_, **kw):
        captured.update(kw)
        return {"status": "ok", "id": "tx1"}

    with patch.object(t, "run_select", return_value=[sub]), \
         patch.object(t, "get_conn", fake_get_conn(cur)), \
         patch.object(t, "create_transaction_on_cursor", side_effect=fake_create), \
         patch.object(t, "_touch_calendar"):
        res = t.mark_subscription_paid("r1", 5200.0, data="2026-10-05")
    return res, captured, cur


def test_confirmar_renda_grava_receita_e_rola_o_vencimento():
    res, tx, cur = _pay(SUB)
    assert res["status"] == "ok" and "Recebimento" in res["message"]
    assert tx["tipo"] == "Receita" and tx["name"] == "Salário (recebido)"
    assert cur.calls[0][1]["next_billing"] == "2026-11-05"


def test_pagar_conta_fixa_continua_gravando_despesa():
    res, tx, _ = _pay({**SUB, "kind": "conta_fixa", "name": "Luz"})
    assert tx["tipo"] == "Despesa" and tx["name"] == "Luz (pago)" and "Pagamento" in res["message"]


def test_kind_renda_e_aceito_e_default_nao_lanca_automatico():
    with patch.object(t, "run_dml") as dml, patch.object(t, "_resolve_account", return_value={"id": "a", "name": "Itau"}), \
         patch.object(t, "_touch_calendar"):
        r = t.create_subscription("Salário", 5000.0, "mensal", "2026-11-05", "Itau", "Receita", kind="renda")
    assert r["status"] == "ok" and r["message"].startswith("Renda criada")
    assert dml.call_args.args[1]["kind"] == "renda" and dml.call_args.args[1]["auto_lancar"] is False


def test_kind_invalido_continua_sendo_rejeitado():
    assert t.create_subscription("x", 1.0, "mensal", "2026-11-05", "Itau", "Lazer", kind="outro")["status"] == "error"


def test_list_subscriptions_custo_mensal_exclui_renda():
    rows = [
        {"valor": 100.0, "ciclo": "mensal", "kind": "conta_fixa"},
        {"valor": 120.0, "ciclo": "anual", "kind": "assinatura"},
        {"valor": 5000.0, "ciclo": "mensal", "kind": "renda"},
    ]
    with patch.object(t, "run_select", return_value=rows):
        r = t.list_subscriptions()
    assert r["total_mensal"] == 110.0 and r["renda_mensal"] == 5000.0


def test_recurring_status_separa_renda_pendente_do_custo_e_das_pendencias():
    subs = {"status": "ok", "subscriptions": [
        {"id": "a", "valor": 300.0, "ciclo": "mensal", "kind": "conta_fixa", "next_billing": "2026-10-20"},
        {"id": "b", "valor": 5000.0, "ciclo": "mensal", "kind": "renda", "next_billing": "2026-10-20"},
    ]}
    with patch.object(t, "list_subscriptions", return_value=subs), \
         patch.object(t, "run_select", return_value=[]), \
         patch.object(t, "_today_date", return_value=HOJE):
        r = t.get_recurring_status()
    assert r["custo_fixo_mensal"] == 300.0 and r["pendentes_count"] == 1 and r["renda_pendente"] == 5000.0


# ─── Busca ────────────────────────────────────────────────────────────────────

def test_like_pattern_neutraliza_curingas_digitados():
    assert t._like_pattern("50%_x!y") == "%50!%!_x!!y%"


def test_query_expenses_busca_e_filtra_por_conta_e_cartao():
    with patch.object(t, "run_select", return_value=[]) as sel:
        t.query_expenses(start_date="2020-01-01", end_date="2026-12-31", q=" 100% ", account_id="a1", card_id="c1")
    sql, params = sel.call_args.args
    assert "ESCAPE '!'" in sql and "account_id = %(account_id)s" in sql and "card_id = %(card_id)s" in sql
    assert params["q"] == "%100!%%" and params["account_id"] == "a1"


def test_suggest_entry_curto_nao_consulta_o_banco():
    with patch.object(t, "run_select") as sel:
        assert t.suggest_entry("a") == {"status": "ok", "suggestions": []}
    sel.assert_not_called()


def test_suggest_entry_devolve_mais_recentes_primeiro_com_limite():
    rows = [
        {"name": "iFood", "tipo": "Despesa", "categoria": "Comer Fora", "valor": 45.0, "conta": "Nubank",
         "account_id": None, "card_id": "c1", "data": date(2026, 9, 1)},
        {"name": "iFood Mercado", "tipo": "Despesa", "categoria": "Supermercado", "valor": 90.0, "conta": "Nubank",
         "account_id": None, "card_id": "c1", "data": date(2026, 9, 28)},
    ]
    with patch.object(t, "run_select", return_value=rows):
        r = t.suggest_entry("ifood", limit=1)
    assert [s["name"] for s in r["suggestions"]] == ["iFood Mercado"]
    assert "data" not in r["suggestions"][0]


# ─── Estatísticas (StatsPayload) ──────────────────────────────────────────────

def test_period_bounds_ano_corrente_compara_com_o_mesmo_trecho_do_anterior():
    assert stats.period_bounds(2026, None, HOJE) == (date(2026, 1, 1), HOJE, date(2025, 1, 1), date(2025, 10, 2))


def test_period_bounds_29_de_fevereiro_vira_28_no_ano_nao_bissexto():
    s, e, ps, pe = stats.period_bounds(2028, None, date(2028, 2, 29))
    assert pe == date(2027, 2, 28)


def test_period_bounds_ano_passado_e_mes():
    assert stats.period_bounds(2025, None, HOJE) == (date(2025, 1, 1), date(2025, 12, 31), date(2024, 1, 1), date(2024, 12, 31))
    assert stats.period_bounds(2026, 2, HOJE) == (date(2026, 2, 1), date(2026, 2, 28), date(2025, 2, 1), date(2025, 2, 28))


def test_savings_rate():
    assert stats.savings_rate(5000, 3500) == 30.0
    assert stats.savings_rate(0, 100) == 0.0                 # sem renda: 0, não divisão por zero
    assert stats.savings_rate(1000, 1500) == -50.0


def _payload(**over):
    base = dict(
        year=2026, month=None,
        totals={"income": 10000.0, "expense": 7000.0}, prev_totals={"income": 8000.0, "expense": 7500.0},
        monthly=[{"month": 1, "income": 5000.0, "expense": 2000.0}, {"month": 2, "income": 5000.0, "expense": 5000.0}],
        daily=[{"date": "2026-01-10", "value": 300.0}, {"date": "2026-02-03", "value": 900.0}],
        categories=[{"categoria": "Moradia", "total": 3000.0, "count": 3}, {"categoria": "Lazer", "total": 500.0, "count": 9}],
        biggest_expense={"name": "Aluguel", "valor": 3000.0, "data": "2026-02-05"},
        biggest_income={"name": "Salário", "valor": 5000.0, "data": "2026-01-05"},
        net_worth={"saldo_contas": 6000.0, "divida_cartoes": 1500.0, "patrimonio_liquido": 4500.0},
    )
    base.update(over)
    return stats.build_stats_payload(**base)


def test_payload_cobre_as_4_metricas_obrigatorias_do_manifesto():
    pl = _payload()
    keys = {k["key"] for k in pl["kpis"]}
    assert {"income", "expense", "savings_rate", "net_worth"} <= keys          # savings_rate + net_worth_real
    assert len(pl["monthly"]) == 12 and len(pl["monthly_income"]) == 12        # income_expense_by_month
    assert "top_categories" in pl["rankings"]                                  # top_categories


def test_payload_kpis_com_delta_contra_o_ano_anterior():
    k = {x["key"]: x for x in _payload()["kpis"]}
    assert k["income"]["value"] == 10000.0 and k["income"]["prev"] == 8000.0
    assert k["savings_rate"]["value"] == 30.0 and k["savings_rate"]["absoluteDelta"] is True
    assert k["savings_rate"]["prev"] == pytest.approx(6.2)                     # (8000-7500)/8000
    assert k["net_worth"]["value"] == 4500.0 and k["net_worth"]["prev"] is None


def test_payload_sem_historico_no_ano_anterior_nao_inventa_delta():
    pl = _payload(prev_totals={"income": 0.0, "expense": 0.0})
    assert pl["previous"] is None and all(k["prev"] is None for k in pl["kpis"])


def test_payload_series_mensais_preenchem_meses_sem_movimento_com_zero():
    pl = _payload()
    assert [m["value"] for m in pl["monthly"][:3]] == [2000.0, 5000.0, 0.0]
    assert pl["monthly"][0]["month"] == 1 and pl["monthly"][-1]["month"] == 12


def test_payload_ranking_de_categorias_traz_total_e_contagem_de_lancamentos():
    items = _payload()["rankings"]["top_categories"]["items"]
    assert items[0] == {"label": "Moradia", "count": 3, "total": 3000.0}


def test_payload_recordes_e_rotulos():
    pl = _payload()
    labels = {r["label"]: r for r in pl["records"]}
    assert labels["Maior gasto"]["value"] == "R$ 3.000,00" and labels["Maior gasto"]["detail"] == "Aluguel · 05/02"
    assert labels["Dia mais caro"]["detail"] == "03/02/2026"
    assert labels["Mês que mais sobrou"]["detail"] == "Janeiro"                # jan: 5000-2000; fev: 0
    assert pl["period"]["label"] == "2026" and pl["previous"]["label"] == "2025"


def test_payload_foco_em_um_mes():
    pl = _payload(month=2)
    assert pl["period"] == {"year": 2026, "month": 2, "label": "Fevereiro de 2026"}
    assert pl["previous"]["label"] == "Fevereiro de 2025"
    assert next(r for r in pl["records"] if r["label"] == "Dia mais caro")["detail"] == "03/02/2026"


def test_get_stats_payload_valida_o_mes():
    assert stats.get_stats_payload(2026, 13)["status"] == "error"


# ─── Registro das tools e rotas ───────────────────────────────────────────────

def test_toolset_expoe_as_tools_novas_sem_duplicar_nomes():
    names = [f.__name__ for f in TOOLS]
    assert len(names) == len(set(names))
    assert {"create_transfer", "get_month_plan", "get_card_invoices", "get_accounts_overview"} <= set(names)


app.dependency_overrides[require_user] = lambda: {"email": "t@example.com", "name": "T"}
client = TestClient(app)
R = "webapp.backend.routers.finances."


def test_rota_plan():
    with patch(R + "get_month_plan", return_value={"status": "ok", "livre": 1.0}) as m:
        r = client.get("/api/finances/plan?month=2026-10")
    assert r.status_code == 200 and r.json()["livre"] == 1.0
    m.assert_called_once_with("2026-10")


def test_rota_plan_erro_vira_400():
    with patch(R + "get_month_plan", return_value={"status": "error", "message": "month deve ser AAAA-MM"}):
        assert client.get("/api/finances/plan?month=zzz").status_code == 400


def test_rota_faturas_do_cartao():
    with patch(R + "get_card_invoices", return_value={"status": "ok", "invoices": []}) as m:
        r = client.get("/api/finances/cards/c1/invoices?months=5")
    assert r.status_code == 200
    m.assert_called_once_with("c1", 5)


def test_rota_suggest_e_overview():
    with patch(R + "suggest_entry", return_value={"status": "ok", "suggestions": []}) as m:
        assert client.get("/api/finances/suggest?q=ifood").status_code == 200
    m.assert_called_once_with("ifood")
    with patch(R + "get_accounts_overview", return_value={"status": "ok", "accounts": [], "saldo_total": 0.0}):
        assert client.get("/api/finances/accounts/overview").status_code == 200


def test_rota_transactions_repassa_busca_e_filtros():
    with patch(R + "query_expenses", return_value={"status": "ok", "transactions": []}) as m:
        client.get("/api/finances/transactions?q=ifood&account_id=a1&card_id=c1&limit=10")
    kw = m.call_args.kwargs
    assert kw["q"] == "ifood" and kw["account_id"] == "a1" and kw["card_id"] == "c1" and kw["limit"] == 10


def test_stats_com_year_usa_o_contrato_novo_e_sem_year_o_legado():
    with patch(R + "get_stats_payload", return_value={"status": "ok", "kpis": []}) as m:
        assert client.get("/api/finances/stats?year=2026&month=3").status_code == 200
        m.assert_called_once_with(2026, 3)
        client.get("/api/finances/stats?year=2026")
        assert m.call_args.args == (2026, None)
    assert client.get("/api/finances/stats?year=2026&month=2026-03").status_code == 400
    assert client.get("/api/finances/stats").status_code == 400     # legado exige month=YYYY-MM


def test_rota_pagar_fatura_repassa_a_conta_de_origem():
    with patch(R + "register_card_payment", return_value={"status": "ok", "transfer_id": "t1"}) as m:
        r = client.post("/api/finances/cards/c1/payment", json={"valor": 250.0, "data": "2026-10-05", "from_account": "NuConta"})
    assert r.status_code == 201
    m.assert_called_once_with(card_id="c1", valor=250.0, data="2026-10-05", from_account="NuConta")
    with patch(R + "register_card_payment", return_value={"status": "ok", "transfer_id": "t2"}) as m:
        client.post("/api/finances/cards/c1/payment", json={"valor": 10.0})
    assert m.call_args.kwargs["from_account"] == ""      # sem conta: a vinculada ao cartão


# ─── Transferência: apagar o par e pagar fatura pela rota de transferência ────

def test_delete_transfer_apaga_as_duas_pontas_de_uma_vez():
    with patch.object(t, "run_dml", return_value=2) as dml, patch.object(t, "_touch_calendar"):
        r = t.delete_transfer("t-1")
    assert r == {"status": "ok", "deleted": 2}
    sql, params = dml.call_args.args
    assert "WHERE transfer_id = %(id)s" in sql and "deleted = FALSE" in sql and params == {"id": "t-1"}


def test_delete_transfer_inexistente_e_erro():
    with patch.object(t, "run_dml", return_value=0):
        assert t.delete_transfer("nao-existe")["status"] == "error"


def test_query_expenses_devolve_transfer_id_para_a_ui_tratar_o_par_como_um():
    with patch.object(t, "run_select", return_value=[]) as sel:
        t.query_expenses()
    assert "transfer_id" in sel.call_args.args[0]


def test_rota_delete_transfer_e_transfer_para_cartao():
    with patch(R + "delete_transfer", return_value={"status": "ok", "deleted": 2}) as m:
        assert client.delete("/api/finances/transfers/t-1").status_code == 200
    m.assert_called_once_with("t-1")
    with patch(R + "create_transfer", return_value={"status": "ok", "transfer_id": "x"}) as m:
        r = client.post("/api/finances/transfers", json={"from_account": "Itau", "to_card": "Nubank", "valor": 100.0})
    assert r.status_code == 201
    assert m.call_args.kwargs["to_card"] == "Nubank" and m.call_args.kwargs["to_account"] == ""
