import pytest
from unittest.mock import patch, MagicMock


# --- Write tools ---

@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_create_transaction_success(mock_project, mock_dml):
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1

    from agents.nami.tools import create_transaction
    result = create_transaction("Almoço iFood", 45.0, "Despesa", "Alimentacao")

    assert result["status"] == "ok"
    assert "id" in result
    mock_dml.assert_called_once()


@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_create_transaction_invalid_categoria(mock_project, mock_dml):
    mock_project.return_value = "test-project"

    from agents.nami.tools import create_transaction
    result = create_transaction("Algo", 10.0, "Despesa", "CategoriaInexistente")

    assert result["status"] == "error"
    assert "categoria" in result["message"].lower()
    mock_dml.assert_not_called()


@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_update_transaction_partial(mock_project, mock_dml):
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1

    from agents.nami.tools import update_transaction
    result = update_transaction("some-uuid", valor=55.0)

    assert result["status"] == "ok"
    mock_dml.assert_called_once()


@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_delete_transaction_uses_soft_delete(mock_project, mock_dml):
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1

    from agents.nami.tools import delete_transaction
    result = delete_transaction("some-uuid")

    assert result["status"] == "ok"
    call_sql = mock_dml.call_args[0][0]
    assert "deleted" in call_sql.lower()
    assert "delete from" not in call_sql.lower()


# --- Read tools ---

@patch("agents.nami.tools._run_select")
@patch("agents.nami.tools._project")
def test_query_expenses_returns_list_with_total(mock_project, mock_select):
    mock_project.return_value = "test-project"
    mock_select.return_value = [
        {"id": "abc", "name": "Almoço", "valor": 45.0, "tipo": "Despesa",
         "categoria": "Alimentacao", "conta": "Generico", "data": "2026-05-30",
         "source": "telegram", "notes": None, "subscription_id": None},
        {"id": "def", "name": "Salário", "valor": 5000.0, "tipo": "Receita",
         "categoria": "Receita", "conta": "Itau", "data": "2026-05-05",
         "source": "telegram", "notes": None, "subscription_id": None},
    ]

    from agents.nami.tools import query_expenses
    result = query_expenses()

    assert result["status"] == "ok"
    assert result["count"] == 2
    assert result["total"] == pytest.approx(5045.0)
    mock_select.assert_called_once()


@patch("agents.nami.tools._run_select")
@patch("agents.nami.tools._project")
def test_get_spending_summary_by_categoria(mock_project, mock_select):
    mock_project.return_value = "test-project"
    mock_select.return_value = [
        {"categoria": "Alimentacao", "total": 200.0},
        {"categoria": "Comer Fora", "total": 150.0},
    ]

    from agents.nami.tools import get_spending_summary
    result = get_spending_summary(period="month", group_by="categoria")

    assert result["status"] == "ok"
    assert result["summary"]["Alimentacao"] == 200.0
    assert result["total"] == pytest.approx(350.0)


@patch("agents.nami.tools._run_select")
@patch("agents.nami.tools._project")
def test_get_spending_trend_includes_projection(mock_project, mock_select):
    mock_project.return_value = "test-project"
    mock_select.return_value = [
        {"month": "2026-03", "total": 2100.0},
        {"month": "2026-04", "total": 1950.0},
        {"month": "2026-05", "total": 1200.0},
    ]

    from agents.nami.tools import get_spending_trend
    result = get_spending_trend(months=3)

    assert result["status"] == "ok"
    assert result["trend"]["2026-03"] == 2100.0
    assert "current_month_projected" in result
    assert result["current_month_projected"] > 0


# --- Subscription tools ---

@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_create_subscription_success(mock_project, mock_dml):
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1

    from agents.nami.tools import create_subscription
    result = create_subscription(
        name="Netflix", valor=55.0, ciclo="mensal",
        next_billing="2026-06-15", conta="Cartao Nu", categoria="Assinaturas",
    )

    assert result["status"] == "ok"
    assert "id" in result
    mock_dml.assert_called_once()


@patch("agents.nami.tools._run_select")
@patch("agents.nami.tools._project")
def test_list_subscriptions_calculates_monthly_total(mock_project, mock_select):
    mock_project.return_value = "test-project"
    mock_select.return_value = [
        {"id": "a", "name": "Netflix", "valor": 55.0, "ciclo": "mensal",
         "next_billing": "2026-06-15", "conta": "Cartao Nu",
         "categoria": "Assinaturas", "status": "ativa", "notes": None},
        {"id": "b", "name": "Spotify", "valor": 21.9, "ciclo": "mensal",
         "next_billing": "2026-06-20", "conta": "Cartao Nu",
         "categoria": "Assinaturas", "status": "ativa", "notes": None},
    ]

    from agents.nami.tools import list_subscriptions
    result = list_subscriptions()

    assert result["status"] == "ok"
    assert result["total_mensal"] == pytest.approx(76.9)
    assert len(result["subscriptions"]) == 2


@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_update_subscription_cancel(mock_project, mock_dml):
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1

    from agents.nami.tools import update_subscription
    result = update_subscription("some-uuid", status="cancelada")

    assert result["status"] == "ok"
    call_sql = mock_dml.call_args[0][0]
    assert "status" in call_sql
