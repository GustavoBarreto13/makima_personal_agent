"""Testes para tools_accounts.py — create_account, list_accounts, get_account_balance."""
from unittest.mock import patch


@patch("agents.nami.tools_accounts._run_dml")
@patch("agents.nami.tools_accounts._project")
def test_create_account_success(mock_project, mock_dml):
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1
    from agents.nami.tools_accounts import create_account
    result = create_account(
        name="NuConta",
        type="corrente",
        data_inicio="2026-01-01",
        institution="Nubank",
        balance_inicial=1500.0,
    )
    assert result["status"] == "ok"
    assert "id" in result
    assert result["name"] == "NuConta"


@patch("agents.nami.tools_accounts._run_dml")
@patch("agents.nami.tools_accounts._project")
def test_create_account_invalid_type(mock_project, mock_dml):
    mock_project.return_value = "test-project"
    from agents.nami.tools_accounts import create_account
    result = create_account(name="X", type="invalido", data_inicio="2026-01-01")
    assert result["status"] == "error"
    assert "Tipo inválido" in result["message"]
    mock_dml.assert_not_called()


@patch("agents.nami.tools_accounts._run_select")
@patch("agents.nami.tools_accounts._project")
def test_list_accounts(mock_project, mock_select):
    mock_project.return_value = "test-project"
    mock_select.return_value = [
        {
            "id": "abc",
            "name": "NuConta",
            "institution": "Nubank",
            "type": "corrente",
            "balance_inicial": 1500.0,
            "data_inicio": "2026-01-01",
            "status": "ativo",
            "notes": None,
        }
    ]
    from agents.nami.tools_accounts import list_accounts
    result = list_accounts()
    assert result["status"] == "ok"
    assert len(result["accounts"]) == 1
    assert result["accounts"][0]["name"] == "NuConta"


@patch("agents.nami.tools_accounts._run_select")
@patch("agents.nami.tools_accounts._project")
def test_list_accounts_todos(mock_project, mock_select):
    mock_project.return_value = "test-project"
    mock_select.return_value = []
    from agents.nami.tools_accounts import list_accounts
    result = list_accounts(status="todos")
    assert result["status"] == "ok"
    # Sem filtro de status → sem parâmetro @status na query
    call_args = mock_select.call_args
    params = call_args[0][1]
    assert params == []


@patch("agents.nami.tools_accounts._run_select")
@patch("agents.nami.tools_accounts._project")
def test_get_account_balance(mock_project, mock_select):
    mock_project.return_value = "test-project"
    mock_select.side_effect = [
        [
            {
                "id": "abc",
                "name": "NuConta",
                "type": "corrente",
                "balance_inicial": 1000.0,
                "data_inicio": "2026-01-01",
            }
        ],
        [{"receitas": 500.0, "despesas": 200.0}],
    ]
    from agents.nami.tools_accounts import get_account_balance
    result = get_account_balance("abc")
    assert result["status"] == "ok"
    assert result["saldo_atual"] == 1300.0  # 1000 + 500 - 200
    assert result["total_receitas"] == 500.0
    assert result["total_despesas"] == 200.0


@patch("agents.nami.tools_accounts._run_select")
@patch("agents.nami.tools_accounts._project")
def test_get_account_balance_not_found(mock_project, mock_select):
    mock_project.return_value = "test-project"
    mock_select.return_value = []
    from agents.nami.tools_accounts import get_account_balance
    result = get_account_balance("nao-existe")
    assert result["status"] == "error"
    assert "não encontrada" in result["message"]
