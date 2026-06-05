"""Testes unitários para as tools do agente Nami (agents/nami/tools.py).

Todos os testes fazem mock do BigQuery (_run_dml e _run_select) e do _project()
para não precisar de credenciais reais nem de conexão com a nuvem.
O objetivo é testar a lógica de negócio (validações, cálculos, queries SQL geradas),
não a integração real com o BigQuery.

Execute com:
    pytest tests/agents/nami/test_tools.py -v
"""

import pytest
from unittest.mock import patch, MagicMock


# ─────────────────────────────────────────────────────────────────────────────
# Testes de escrita (operações que modificam dados no banco)
# ─────────────────────────────────────────────────────────────────────────────

@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_create_transaction_success(mock_project, mock_dml):
    """Verifica que create_transaction insere uma transação válida e retorna status ok."""
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1

    # Pré-popula cache de contas para evitar query ao BQ em testes unitários
    import agents.nami.tools as t
    t._accounts_cache = [{"id": "acc-generico", "name": "Generico"}]

    from agents.nami.tools import create_transaction
    result = create_transaction("Almoço iFood", 45.0, "Despesa", "Alimentacao")

    assert result["status"] == "ok"
    assert "id" in result
    mock_dml.assert_called_once()

    t._accounts_cache = None  # limpa após o teste


@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_create_transaction_invalid_categoria(mock_project, mock_dml):
    """Verifica que create_transaction rejeita categorias inválidas sem chamar o banco."""
    mock_project.return_value = "test-project"

    from agents.nami.tools import create_transaction
    result = create_transaction("Algo", 10.0, "Despesa", "CategoriaInexistente")

    # Deve retornar erro com menção à categoria na mensagem
    assert result["status"] == "error"
    assert "categoria" in result["message"].lower()

    # O banco NÃO deve ser acessado quando a validação falha
    mock_dml.assert_not_called()


@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_update_transaction_partial(mock_project, mock_dml):
    """Verifica que update_transaction atualiza apenas os campos informados."""
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1  # 1 linha afetada = UPDATE bem-sucedido

    from agents.nami.tools import update_transaction

    # Atualiza apenas o valor — os outros campos devem ser mantidos intactos
    result = update_transaction("some-uuid", valor=55.0)

    assert result["status"] == "ok"
    mock_dml.assert_called_once()


@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_delete_transaction_uses_soft_delete(mock_project, mock_dml):
    """Verifica que delete_transaction usa soft delete (UPDATE deleted=TRUE) e não DELETE FROM."""
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1

    from agents.nami.tools import delete_transaction
    result = delete_transaction("some-uuid")

    assert result["status"] == "ok"

    # Garante que o SQL gerado é um UPDATE com 'deleted', não um DELETE FROM
    call_sql = mock_dml.call_args[0][0]
    assert "deleted" in call_sql.lower()          # deve setar o flag deleted
    assert "delete from" not in call_sql.lower()  # não deve apagar fisicamente


# ─────────────────────────────────────────────────────────────────────────────
# Testes de leitura e análise
# ─────────────────────────────────────────────────────────────────────────────

@patch("agents.nami.tools._run_select")
@patch("agents.nami.tools._project")
def test_query_expenses_returns_list_with_total(mock_project, mock_select):
    """Verifica que query_expenses retorna a lista de transações e o total somado."""
    mock_project.return_value = "test-project"

    # Simula duas transações: uma despesa e uma receita
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
    # O total deve ser a soma de TODOS os valores (despesas + receitas)
    assert result["total"] == pytest.approx(5045.0)
    mock_select.assert_called_once()


@patch("agents.nami.tools._run_select")
@patch("agents.nami.tools._project")
def test_get_spending_summary_by_categoria(mock_project, mock_select):
    """Verifica que get_spending_summary agrupa corretamente por categoria."""
    mock_project.return_value = "test-project"
    mock_select.return_value = [
        {"categoria": "Alimentacao", "total": 200.0},
        {"categoria": "Comer Fora", "total": 150.0},
    ]

    from agents.nami.tools import get_spending_summary
    result = get_spending_summary(period="month", group_by="categoria")

    assert result["status"] == "ok"
    assert result["summary"]["Alimentacao"] == 200.0
    # Total deve ser a soma de todas as categorias
    assert result["total"] == pytest.approx(350.0)


@patch("agents.nami.tools._run_select")
@patch("agents.nami.tools._project")
def test_get_spending_trend_includes_projection(mock_project, mock_select):
    """Verifica que get_spending_trend retorna o histórico mensal e inclui projeção."""
    mock_project.return_value = "test-project"
    from datetime import date
    cur = date.today().strftime("%Y-%m")
    mock_select.return_value = [
        {"month": "2026-03", "total": 2100.0},
        {"month": "2026-04", "total": 1950.0},
        {"month": cur, "total": 1200.0},
    ]

    from agents.nami.tools import get_spending_trend
    result = get_spending_trend(months=3)

    assert result["status"] == "ok"
    assert result["trend"]["2026-03"] == 2100.0

    # A projeção do mês atual deve sempre estar presente e ser positiva
    assert "current_month_projected" in result
    assert result["current_month_projected"] > 0


# ─────────────────────────────────────────────────────────────────────────────
# Testes de assinaturas
# ─────────────────────────────────────────────────────────────────────────────

@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_create_subscription_success(mock_project, mock_dml):
    """Verifica que create_subscription cria uma assinatura válida e retorna o ID."""
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1

    import agents.nami.tools as t
    t._accounts_cache = [{"id": "acc-cartao-nu", "name": "Cartao Nu"}]

    from agents.nami.tools import create_subscription
    result = create_subscription(
        name="Netflix", valor=55.0, ciclo="mensal",
        next_billing="2026-06-15", conta="Cartao Nu", categoria="Assinaturas",
    )

    assert result["status"] == "ok"
    assert "id" in result
    mock_dml.assert_called_once()

    t._accounts_cache = None


@patch("agents.nami.tools._run_select")
@patch("agents.nami.tools._project")
def test_list_subscriptions_calculates_monthly_total(mock_project, mock_select):
    """Verifica que list_subscriptions calcula corretamente o total mensal equivalente."""
    mock_project.return_value = "test-project"

    # Simula duas assinaturas mensais
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
    # Total mensal = 55.0 + 21.9 = 76.9
    assert result["total_mensal"] == pytest.approx(76.9)
    assert len(result["subscriptions"]) == 2


@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_update_subscription_cancel(mock_project, mock_dml):
    """Verifica que update_subscription gera SQL com campo 'status' ao cancelar."""
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1

    from agents.nami.tools import update_subscription
    result = update_subscription("some-uuid", status="cancelada")

    assert result["status"] == "ok"

    # Verifica que o SQL gerado inclui atualização do campo status
    call_sql = mock_dml.call_args[0][0]
    assert "status" in call_sql
