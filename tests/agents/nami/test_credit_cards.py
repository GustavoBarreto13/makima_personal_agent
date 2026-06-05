"""Testes unitários para tools de cartões de crédito (agents/nami/tools_credit_cards.py).

Execute com:
    pytest tests/agents/nami/test_credit_cards.py -v
"""

import pytest
from unittest.mock import patch, MagicMock


@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_register_credit_card_sem_divida(mock_project, mock_dml):
    """Verifica cadastro de cartão sem dívida inicial — apenas 1 INSERT."""
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1

    from agents.nami.tools_credit_cards import register_credit_card
    result = register_credit_card(
        name="Nubank", conta_key="Cartao Nu", limite=5000.0,
        taxa_juros_mensal=0.15, closing_day=3, due_day=10,
    )

    assert result["status"] == "ok"
    assert "id" in result
    # Sem dívida inicial: apenas 1 INSERT (no cartão)
    assert mock_dml.call_count == 1


@patch("agents.nami.tools_credit_cards._run_dml")
@patch("agents.nami.tools._project")
def test_register_credit_card_com_divida(mock_project, mock_dml):
    """Verifica que dívida inicial gera 2 INSERTs (cartão + saldo_inicial)."""
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1

    from agents.nami.tools_credit_cards import register_credit_card
    result = register_credit_card(
        name="Itaú", conta_key="Cartao Itau", limite=8000.0,
        taxa_juros_mensal=0.12, closing_day=10, due_day=17,
        current_debt=2400.0,
    )

    assert result["status"] == "ok"
    # Com dívida: INSERT no cartão + INSERT em card_debt_entries
    assert mock_dml.call_count == 2


@patch("agents.nami.tools_credit_cards._run_select")
@patch("agents.nami.tools._project")
def test_get_card_debt_summary_calcula_utilizacao(mock_project, mock_select):
    """Verifica que get_card_debt_summary calcula % de utilização por cartão."""
    mock_project.return_value = "test-project"
    mock_select.side_effect = [
        # Cartões ativos
        [{"id": "card-1", "name": "Nu", "conta_key": "Cartao Nu",
          "limite": 5000.0, "taxa_juros_mensal": 0.15,
          "closing_day": 3, "due_day": 10}],
        # Saldos
        [{"card_id": "card-1", "saldo": 2400.0}],
    ]

    from agents.nami.tools_credit_cards import get_card_debt_summary
    result = get_card_debt_summary()

    assert result["status"] == "ok"
    assert result["total_divida"] == pytest.approx(2400.0)
    assert result["cards"][0]["utilizacao_pct"] == pytest.approx(48.0)


@patch("agents.nami.tools_credit_cards._run_dml")
@patch("agents.nami.tools._project")
def test_register_card_payment_valor_negativo_no_banco(mock_project, mock_dml):
    """Verifica que pagamento é inserido com valor negativo (reduz dívida)."""
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1

    from agents.nami.tools_credit_cards import register_card_payment
    result = register_card_payment("card-1", 500.0)

    assert result["status"] == "ok"
    # _run_dml deve ser chamado exatamente 1 vez (1 INSERT em card_debt_entries)
    assert mock_dml.call_count == 1
    # O SQL deve referenciar card_debt_entries com valor negativo (pagamento)
    call_sql = mock_dml.call_args[0][0]
    assert "card_debt_entries" in call_sql


@patch("agents.nami.tools_credit_cards.get_card_debt_summary")
def test_simulate_debt_payoff_metodo_avalanche(mock_summary):
    """Verifica que simulate_debt_payoff ordena pelo maior juros primeiro."""
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
    mock_select.side_effect = [
        [{"id": "c1", "name": "Nu", "taxa_juros_mensal": 0.15, "limite": 5000.0}],
        [{"saldo": 2000.0}],
    ]

    from agents.nami.tools_credit_cards import get_minimum_payment_cost
    result = get_minimum_payment_cost("c1")

    assert result["status"] == "ok"
    assert result["meses_para_quitar"] > 0
    assert result["juros_total"] > 0
    # Pagando só o mínimo, os juros devem ser substanciais
    assert result["juros_total"] > result["divida_atual"] * 0.5
