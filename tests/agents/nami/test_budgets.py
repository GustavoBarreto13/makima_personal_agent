"""Testes unitários para tools de orçamento por categoria.

Execute com:
    pytest tests/agents/nami/test_budgets.py -v
"""

import pytest
from unittest.mock import patch


@patch("agents.nami.tools_budgets._run_dml")
@patch("agents.nami.tools_budgets._run_select")
@patch("agents.nami.tools._project")
def test_set_budget_cria_novo_envelope(mock_project, mock_select, mock_dml):
    """Verifica que set_budget cria envelope quando não existe."""
    mock_project.return_value = "test-project"
    mock_select.return_value = []  # nenhum envelope existente
    mock_dml.return_value = 1

    from agents.nami.tools_budgets import set_budget
    result = set_budget(month="2026-06", categoria="Alimentacao", limite=600.0)

    assert result["status"] == "ok"
    assert mock_dml.called


@patch("agents.nami.tools_budgets._run_dml")
@patch("agents.nami.tools_budgets._run_select")
@patch("agents.nami.tools._project")
def test_set_budget_atualiza_existente(mock_project, mock_select, mock_dml):
    """Verifica que set_budget atualiza um envelope já existente (upsert)."""
    mock_project.return_value = "test-project"
    mock_select.return_value = [{"id": "budget-1"}]  # já existe
    mock_dml.return_value = 1

    from agents.nami.tools_budgets import set_budget
    result = set_budget(month="2026-06", categoria="Alimentacao", limite=700.0)

    assert result["status"] == "ok"
    # Deve usar UPDATE, não INSERT
    call_sql = mock_dml.call_args[0][0].lower()
    assert "update" in call_sql


@patch("agents.nami.tools_budgets._run_select")
@patch("agents.nami.tools._project")
def test_get_budget_status_mostra_gasto_vs_limite(mock_project, mock_select):
    """Verifica que get_budget_status retorna gasto atual vs limite por categoria."""
    mock_project.return_value = "test-project"
    mock_select.side_effect = [
        # Envelopes do mês
        [
            {"id": "b1", "categoria": "Alimentacao", "limite": 600.0},
            {"id": "b2", "categoria": "Lazer", "limite": 300.0},
        ],
        # Gastos reais do mês por categoria
        [
            {"categoria": "Alimentacao", "total": 420.0},
            {"categoria": "Lazer", "total": 345.0},  # estourou!
        ],
    ]

    from agents.nami.tools_budgets import get_budget_status
    result = get_budget_status("2026-06")

    assert result["status"] == "ok"
    ali = next(e for e in result["envelopes"] if e["categoria"] == "Alimentacao")
    laz = next(e for e in result["envelopes"] if e["categoria"] == "Lazer")
    assert ali["gasto"] == pytest.approx(420.0)
    assert ali["restante"] == pytest.approx(180.0)
    assert ali["estourado"] is False
    assert laz["estourado"] is True


@patch("agents.nami.tools_budgets._run_select")
@patch("agents.nami.tools._project")
def test_check_category_budget_sem_envelope(mock_project, mock_select):
    """Verifica que check sem envelope retorna status 'sem_envelope'."""
    mock_project.return_value = "test-project"
    # get_budget_status faz 2 selects: envelopes + gastos
    mock_select.side_effect = [
        [],   # sem envelopes
        [],   # sem gastos
    ]

    from agents.nami.tools_budgets import check_category_budget
    result = check_category_budget("Alimentacao", 50.0)

    assert result["status"] == "ok"
    assert result["envelope_status"] == "sem_envelope"
