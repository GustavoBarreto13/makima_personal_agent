"""Testes unitários para tools de empréstimos e financiamentos.

Testa a lógica matemática dos sistemas PRICE e SAC, cadastro de empréstimos
e as simulações de quitação e amortização.

Execute com:
    pytest tests/agents/nami/test_loans.py -v
"""

import pytest
from unittest.mock import patch


def test_price_pmt_formula_correta():
    """Verifica cálculo da parcela PRICE para um empréstimo conhecido."""
    from agents.nami.tools_loans import _price_pmt
    # Empréstimo R$10.000, 1% a.m., 12 parcelas
    # PMT = 10000 * 0.01 * 1.01^12 / (1.01^12 - 1) ≈ 888.49
    pmt = _price_pmt(10000.0, 0.01, 12)
    assert pmt == pytest.approx(888.49, rel=0.001)


def test_price_balance_diminui_apos_pagamentos():
    """Verifica que saldo devedor PRICE decresce a cada parcela paga."""
    from agents.nami.tools_loans import _price_balance
    pv, i, n = 10000.0, 0.01, 12
    saldo_inicial = _price_balance(pv, i, n, 0)
    saldo_apos_6 = _price_balance(pv, i, n, 6)
    saldo_final = _price_balance(pv, i, n, 12)
    assert saldo_inicial == pytest.approx(pv, rel=0.001)
    assert saldo_apos_6 < saldo_inicial
    assert saldo_final == pytest.approx(0.0, abs=0.01)


def test_sac_balance_decrescimento_linear():
    """Verifica que saldo devedor SAC decresce linearmente."""
    from agents.nami.tools_loans import _sac_balance
    pv, n = 12000.0, 12
    assert _sac_balance(pv, n, 0) == pytest.approx(12000.0)
    assert _sac_balance(pv, n, 6) == pytest.approx(6000.0)
    assert _sac_balance(pv, n, 12) == pytest.approx(0.0, abs=0.01)


@patch("agents.nami.tools_loans._run_dml")
@patch("agents.nami.tools._project")
def test_register_loan_price_success(mock_project, mock_dml):
    """Verifica cadastro bem-sucedido de empréstimo PRICE."""
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1

    from agents.nami.tools_loans import register_loan
    result = register_loan(
        name="Carro Onix", tipo="veiculo", sistema_amortizacao="PRICE",
        valor_original=45000.0, taxa_juros_mensal=0.0099,
        num_parcelas=48, parcelas_pagas=12, valor_parcela=1250.0,
        primeiro_vencimento="2025-06-01", conta="Itau",
    )

    assert result["status"] == "ok"
    assert "id" in result
    mock_dml.assert_called_once()


@patch("agents.nami.tools_loans._run_dml")
@patch("agents.nami.tools._project")
def test_register_loan_tipo_invalido(mock_project, mock_dml):
    """Verifica que tipo de empréstimo inválido retorna erro sem acessar o banco."""
    mock_project.return_value = "test-project"

    from agents.nami.tools_loans import register_loan
    result = register_loan(
        name="Algo", tipo="hipoteca", sistema_amortizacao="PRICE",
        valor_original=1000.0, taxa_juros_mensal=0.01,
        num_parcelas=12, parcelas_pagas=0, valor_parcela=90.0,
        primeiro_vencimento="2026-01-01", conta="Itau",
    )

    assert result["status"] == "error"
    assert "tipo" in result["message"].lower()
    mock_dml.assert_not_called()


@patch("agents.nami.tools_loans._run_select")
@patch("agents.nami.tools._project")
def test_get_loan_balance_price(mock_project, mock_select):
    """Verifica cálculo de saldo devedor PRICE via get_loan_balance."""
    mock_project.return_value = "test-project"
    mock_select.return_value = [{
        "id": "loan-1", "name": "Carro", "sistema_amortizacao": "PRICE",
        "valor_original": 10000.0, "taxa_juros_mensal": 0.01,
        "num_parcelas_total": 12, "parcelas_pagas": 6, "valor_parcela": 888.49,
        "desconto_folha": False,
    }]

    from agents.nami.tools_loans import get_loan_balance
    result = get_loan_balance("loan-1")

    assert result["status"] == "ok"
    # Saldo após 6 parcelas PRICE de R$10k/1%/12x deve ser ~R$5135
    assert 5000 < result["saldo_devedor"] < 5500
    assert result["parcelas_restantes"] == 6


@patch("agents.nami.tools_loans._run_select")
@patch("agents.nami.tools._project")
def test_simulate_amortization_elimina_parcelas(mock_project, mock_select):
    """Verifica que amortização extra reduz o número de parcelas restantes."""
    mock_project.return_value = "test-project"
    mock_select.return_value = [{
        "id": "loan-1", "name": "Carro", "sistema_amortizacao": "PRICE",
        "valor_original": 10000.0, "taxa_juros_mensal": 0.01,
        "num_parcelas_total": 12, "parcelas_pagas": 6, "valor_parcela": 888.49,
    }]

    from agents.nami.tools_loans import simulate_amortization
    result = simulate_amortization("loan-1", extra_value=1000.0)

    assert result["status"] == "ok"
    assert result["parcelas_eliminadas"] > 0
    assert result["economia_juros"] > 0


@patch("agents.nami.tools_loans._run_select")
@patch("agents.nami.tools._project")
def test_compare_payoff_priority_ordena_por_taxa(mock_project, mock_select):
    """Verifica que compare_payoff_priority ordena por taxa de juros DESC."""
    mock_project.return_value = "test-project"
    mock_select.return_value = [
        {"id": "l1", "name": "Pessoal", "taxa_juros_mensal": 0.08,
         "valor_original": 5000.0, "num_parcelas_total": 24, "parcelas_pagas": 6,
         "sistema_amortizacao": "PRICE", "valor_parcela": 300.0},
        {"id": "l2", "name": "Carro", "taxa_juros_mensal": 0.0099,
         "valor_original": 40000.0, "num_parcelas_total": 48, "parcelas_pagas": 12,
         "sistema_amortizacao": "PRICE", "valor_parcela": 1100.0},
    ]

    from agents.nami.tools_loans import compare_payoff_priority
    with patch("agents.nami.tools_loans.get_card_debt_summary") as mock_cards:
        mock_cards.return_value = {"status": "ok", "cards": [], "total_divida": 0.0}
        result = compare_payoff_priority()

    assert result["status"] == "ok"
    # Pessoal (8% a.m.) deve vir antes do Carro (0.99% a.m.)
    assert result["priority"][0]["name"] == "Pessoal"
    assert result["priority"][1]["name"] == "Carro"


@patch("agents.nami.tools_loans._run_dml")
@patch("agents.nami.tools_loans._run_select")
@patch("agents.nami.tools._project")
def test_register_loan_payment_cria_transacao_e_incrementa_parcela(mock_project, mock_select, mock_dml):
    """Verifica que register_loan_payment cria transação Despesa e incrementa parcelas_pagas."""
    mock_project.return_value = "test-project"
    mock_select.return_value = [{
        "id": "loan-1", "name": "Carro", "tipo": "veiculo",
        "sistema_amortizacao": "PRICE", "valor_original": 12000.0,
        "taxa_juros_mensal": 0.015, "num_parcelas_total": 48,
        "parcelas_pagas": 10, "valor_parcela": 333.60,
        "conta": "Itau", "desconto_folha": False, "status": "ativo",
    }]
    mock_dml.return_value = 1

    with patch("agents.nami.tools_loans.create_transaction") as mock_ct:
        mock_ct.return_value = {"status": "ok", "id": "tx-parcela"}

        from agents.nami.tools_loans import register_loan_payment
        result = register_loan_payment("loan-1")

    assert result["status"] == "ok"
    assert result["parcelas_pagas"] == 11
    assert result["parcelas_restantes"] == 37
    # Transação criada como Despesa
    mock_ct.assert_called_once()
    call_kwargs = mock_ct.call_args[1]
    assert call_kwargs.get("tipo") == "Despesa"
    # Categoria de veículo = Transporte
    assert call_kwargs.get("categoria") == "Transporte"
    # UPDATE de parcelas_pagas foi executado
    assert mock_dml.call_count == 1
    update_sql = mock_dml.call_args[0][0].lower()
    assert "parcelas_pagas" in update_sql
