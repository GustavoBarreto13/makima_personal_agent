"""Testes unitários para o score de saúde financeira.

Execute com:
    pytest tests/agents/nami/test_health.py -v
"""

import pytest
from unittest.mock import patch


@patch("agents.nami.tools_health._run_select")
@patch("agents.nami.tools_health.get_card_debt_summary")
@patch("agents.nami.tools_health.get_future_commitments")
@patch("agents.nami.tools._project")
def test_score_maximo_sem_dividas(mock_project, mock_commits, mock_cards, mock_select):
    """Verifica que score = 100 para situação financeira ideal (sem dívidas, alta poupança)."""
    mock_project.return_value = "test-project"
    mock_commits.return_value = {"status": "ok", "total": 0.0, "total_parcelas": 0.0, "total_assinaturas": 0.0}
    mock_cards.return_value = {"status": "ok", "cards": [], "total_divida": 0.0, "total_limite": 10000.0}
    # Receita de 5000, despesas de 2000 (taxa 40% — ótima)
    mock_select.return_value = [
        {"tipo": "Receita", "total": 5000.0},
        {"tipo": "Despesa", "total": 2000.0},
    ]

    from agents.nami.tools_health import get_financial_health_score
    result = get_financial_health_score("2026-06")

    assert result["status"] == "ok"
    assert result["score"] == 100
    assert result["breakdown"]["taxa_gasto"] == 25
    assert result["breakdown"]["taxa_poupanca"] == 25
    assert result["breakdown"]["comprometimento_futuro"] == 25
    assert result["breakdown"]["divida_cartao"] == 25


@patch("agents.nami.tools_health._run_select")
@patch("agents.nami.tools_health.get_card_debt_summary")
@patch("agents.nami.tools_health.get_future_commitments")
@patch("agents.nami.tools._project")
def test_score_baixo_com_divida_alta(mock_project, mock_commits, mock_cards, mock_select):
    """Verifica que dívida alta no cartão penaliza o score na dimensão divida_cartao."""
    mock_project.return_value = "test-project"
    mock_commits.return_value = {"status": "ok", "total": 0.0, "total_parcelas": 0.0, "total_assinaturas": 0.0}
    # Cartão com 90% de utilização
    mock_cards.return_value = {
        "status": "ok",
        "cards": [{"divida_atual": 4500.0, "limite": 5000.0}],
        "total_divida": 4500.0,
        "total_limite": 5000.0,
    }
    mock_select.return_value = [
        {"tipo": "Receita", "total": 5000.0},
        {"tipo": "Despesa", "total": 3000.0},
    ]

    from agents.nami.tools_health import get_financial_health_score
    result = get_financial_health_score("2026-06")

    assert result["status"] == "ok"
    # Com 90% de utilização, dimensão divida_cartao deve ser baixa (< 5 pontos)
    assert result["breakdown"]["divida_cartao"] < 5
    assert result["score"] < 80


@patch("agents.nami.tools_health._run_select")
@patch("agents.nami.tools_health.get_card_debt_summary")
@patch("agents.nami.tools_health.get_future_commitments")
@patch("agents.nami.tools._project")
def test_score_sem_receita_retorna_zero(mock_project, mock_commits, mock_cards, mock_select):
    """Verifica que score = 0 quando não há receita registrada no mês."""
    mock_project.return_value = "test-project"
    mock_commits.return_value = {"status": "ok", "total": 0.0, "total_parcelas": 0.0, "total_assinaturas": 0.0}
    mock_cards.return_value = {"status": "ok", "cards": [], "total_divida": 0.0, "total_limite": 0.0}
    # Apenas despesas, sem receita
    mock_select.return_value = [{"tipo": "Despesa", "total": 500.0}]

    from agents.nami.tools_health import get_financial_health_score
    result = get_financial_health_score("2026-06")

    assert result["status"] == "ok"
    assert result["score"] == 0
    assert "receita" in result["message"].lower()
