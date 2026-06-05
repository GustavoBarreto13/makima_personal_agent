"""Testes unitários para tools de cartões de crédito (agents/nami/tools_credit_cards.py).

Após refatoração: saldo dos cartões é derivado de `transactions` — a tabela
`card_debt_entries` foi removida. Pagamento de fatura e dívida inicial agora
geram transações em `transactions`.

Execute com:
    pytest tests/agents/nami/test_credit_cards.py -v
"""

import pytest
from unittest.mock import patch, MagicMock, call


@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_register_credit_card_sem_divida(mock_project, mock_dml):
    """Verifica cadastro de cartão sem dívida inicial — apenas 1 INSERT no cartão."""
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1

    from agents.nami.tools_credit_cards import register_credit_card
    result = register_credit_card(
        name="Nubank", conta_key="Cartao Nu", limite=5000.0,
        taxa_juros_mensal=0.15, closing_day=3, due_day=10,
    )

    assert result["status"] == "ok"
    assert "id" in result
    # Sem dívida inicial: apenas 1 INSERT (na tabela credit_cards)
    assert mock_dml.call_count == 1


@patch("agents.nami.tools_credit_cards.create_transaction")
@patch("agents.nami.tools_credit_cards._run_dml")
@patch("agents.nami.tools._project")
def test_register_credit_card_com_divida_gera_transacao(mock_project, mock_dml, mock_ct):
    """Verifica que dívida inicial gera 1 INSERT no cartão + 1 transação tipo Despesa."""
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1
    mock_ct.return_value = {"status": "ok", "id": "tx-inicial"}

    from agents.nami.tools_credit_cards import register_credit_card
    result = register_credit_card(
        name="Itaú", conta_key="Cartao Itau", limite=8000.0,
        taxa_juros_mensal=0.12, closing_day=10, due_day=17,
        current_debt=2400.0,
    )

    assert result["status"] == "ok"
    # 1 INSERT no cartão via _run_dml
    assert mock_dml.call_count == 1
    # Dívida inicial vira transação tipo Despesa
    mock_ct.assert_called_once()
    args, kwargs = mock_ct.call_args
    # Aceita tanto args posicionais quanto kwargs
    tipo = kwargs.get("tipo") or (args[2] if len(args) > 2 else None)
    assert tipo == "Despesa"


@patch("agents.nami.tools_credit_cards._run_select")
@patch("agents.nami.tools._project")
def test_get_card_debt_summary_calcula_utilizacao(mock_project, mock_select):
    """Verifica que get_card_debt_summary calcula % de utilização via transactions."""
    mock_project.return_value = "test-project"
    mock_select.side_effect = [
        # Cartões ativos
        [{"id": "card-1", "name": "Nu", "conta_key": "Cartao Nu",
          "limite": 5000.0, "taxa_juros_mensal": 0.15,
          "closing_day": 3, "due_day": 10}],
        # Saldo calculado a partir de transactions (Despesas - Receitas)
        [{"saldo": 2400.0}],
    ]

    from agents.nami.tools_credit_cards import get_card_debt_summary
    result = get_card_debt_summary()

    assert result["status"] == "ok"
    assert result["total_divida"] == pytest.approx(2400.0)
    assert result["cards"][0]["utilizacao_pct"] == pytest.approx(48.0)


@patch("agents.nami.tools_credit_cards.create_transaction")
@patch("agents.nami.tools_credit_cards._run_select")
@patch("agents.nami.tools._project")
def test_register_card_payment_gera_transacao_receita(mock_project, mock_select, mock_ct):
    """Verifica que pagamento de fatura cria transação tipo Receita na conta do cartão."""
    mock_project.return_value = "test-project"
    # Busca do cartão pelo id
    mock_select.return_value = [{
        "id": "card-1", "name": "Nu", "conta_key": "Cartao Nu",
        "limite": 5000.0, "taxa_juros_mensal": 0.15,
        "closing_day": 3, "due_day": 10,
    }]
    mock_ct.return_value = {"status": "ok", "id": "tx-pagamento"}

    from agents.nami.tools_credit_cards import register_card_payment
    result = register_card_payment("card-1", 500.0)

    assert result["status"] == "ok"
    # Pagamento vira transação tipo Receita (zera o saldo no ciclo)
    mock_ct.assert_called_once()
    args, kwargs = mock_ct.call_args
    tipo = kwargs.get("tipo") or (args[2] if len(args) > 2 else None)
    assert tipo == "Receita"


@patch("agents.nami.tools_credit_cards.get_card_debt_summary")
def test_simulate_debt_payoff_metodo_avalanche(mock_summary):
    """Verifica que simulate_debt_payoff ordena pelo maior juros primeiro (Avalanche)."""
    mock_summary.return_value = {
        "status": "ok",
        "cards": [
            {"id": "c1", "name": "Nu", "divida_atual": 1000.0, "taxa_juros_mensal": 0.15},
            {"id": "c2", "name": "Itaú", "divida_atual": 800.0, "taxa_juros_mensal": 0.12},
        ],
        "total_divida": 1800.0,
        "total_limite": 10000.0,
        "utilizacao_total_pct": 18.0,
    }

    from agents.nami.tools_credit_cards import simulate_debt_payoff
    result = simulate_debt_payoff(monthly_payment=600.0)

    assert result["status"] == "ok"
    assert result["meses"] > 0
    # Avalanche: Nu (15%) deve aparecer primeiro na ordem de ataque
    assert result["ordem_pagamento"][0] == "Nu"


@patch("agents.nami.tools_credit_cards._run_select")
@patch("agents.nami.tools._project")
def test_get_minimum_payment_cost_retorna_custo_total(mock_project, mock_select):
    """Verifica que get_minimum_payment_cost calcula meses e juros totais."""
    mock_project.return_value = "test-project"
    # 1ª chamada: dados do cartão; 2ª chamada: saldo via transactions
    mock_select.side_effect = [
        [{"id": "c1", "name": "Nu", "taxa_juros_mensal": 0.15,
          "limite": 5000.0, "conta_key": "Cartao Nu",
          "closing_day": 3, "due_day": 10}],
        [{"saldo": 2000.0}],
    ]

    from agents.nami.tools_credit_cards import get_minimum_payment_cost
    result = get_minimum_payment_cost("c1")

    assert result["status"] == "ok"
    assert result["meses_para_quitar"] > 0
    assert result["juros_total"] > 0
    # Pagando só o mínimo, os juros devem ser substanciais
    assert result["juros_total"] > result["divida_atual"] * 0.5
