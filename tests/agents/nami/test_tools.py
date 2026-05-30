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
