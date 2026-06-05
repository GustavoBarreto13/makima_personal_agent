"""Testes unitários para tools de controle de parcelas (agents/nami/tools_installments.py).

Todos os testes mockam _run_dml, _run_select e _project para não precisar
de credenciais reais. Testa lógica de negócio: geração das parcelas,
cálculo das datas mensais e queries de compromissos futuros.

Execute com:
    pytest tests/agents/nami/test_installments.py -v
"""

import pytest
from unittest.mock import patch, MagicMock, call


@patch("agents.nami.tools_installments._run_dml")
@patch("agents.nami.tools._project")
def test_create_installment_gera_n_transacoes(mock_project, mock_dml):
    """Verifica que create_installment faz 1 INSERT no grupo + N INSERTs de parcelas."""
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1

    import agents.nami.tools as t
    t._accounts_cache = [{"id": "acc-nu", "name": "Cartao Nu"}]

    from agents.nami.tools_installments import create_installment
    result = create_installment(
        name="Notebook Dell",
        total_valor=3600.0,
        num_parcelas=12,
        conta="Cartao Nu",
        categoria="Eletronicos",
        first_due="2026-06-10",
    )

    assert result["status"] == "ok"
    assert "group_id" in result
    assert len(result["transaction_ids"]) == 12
    # 1 INSERT no grupo + 12 INSERTs de parcelas = 13 chamadas
    assert mock_dml.call_count == 13
    t._accounts_cache = None


@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_create_installment_valor_parcela_correto(mock_project, mock_dml):
    """Verifica que o valor de cada parcela é total / num_parcelas arredondado."""
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1

    import agents.nami.tools as t
    t._accounts_cache = [{"id": "acc-itau", "name": "Cartao Itau"}]

    from agents.nami.tools_installments import create_installment
    result = create_installment("Geladeira", 1200.0, 4, "Cartao Itau", "Eletronicos", "2026-07-01")

    assert result["status"] == "ok"
    # 1200 / 4 = 300.00 por parcela
    assert "300,00" in result["message"] or "300.00" in result["message"]
    t._accounts_cache = None


@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_create_installment_conta_invalida(mock_project, mock_dml):
    """Verifica que conta inválida retorna erro sem chamar o banco."""
    mock_project.return_value = "test-project"

    from agents.nami.tools_installments import create_installment
    result = create_installment("Algo", 500.0, 3, "ContaInexistente", "Lazer", "2026-07-01")

    assert result["status"] == "error"
    assert "conta" in result["message"].lower()
    mock_dml.assert_not_called()


@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_create_installment_num_parcelas_minimo(mock_project, mock_dml):
    """Verifica que num_parcelas < 2 retorna erro."""
    mock_project.return_value = "test-project"

    from agents.nami.tools_installments import create_installment
    result = create_installment("Algo", 100.0, 1, "Cartao Nu", "Lazer", "2026-07-01")

    assert result["status"] == "error"
    mock_dml.assert_not_called()


@patch("agents.nami.tools_installments._run_select")
@patch("agents.nami.tools._project")
def test_get_future_commitments_soma_parcelas_e_assinaturas(mock_project, mock_select):
    """Verifica que get_future_commitments soma parcelas + assinaturas do mês."""
    mock_project.return_value = "test-project"
    # Primeira chamada = parcelas, segunda = assinaturas
    mock_select.side_effect = [
        [{"total": 900.0}],   # R$900 em parcelas em agosto
        [{"total": 150.0}],   # R$150 em assinaturas em agosto
    ]

    from agents.nami.tools_installments import get_future_commitments
    result = get_future_commitments("2026-08")

    assert result["status"] == "ok"
    assert result["total_parcelas"] == pytest.approx(900.0)
    assert result["total_assinaturas"] == pytest.approx(150.0)
    assert result["total"] == pytest.approx(1050.0)


@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_cancel_installment_group_soft_delete(mock_project, mock_dml):
    """Verifica que cancel_installment_group usa UPDATE (soft delete), não DELETE."""
    mock_project.return_value = "test-project"
    mock_dml.return_value = 5  # 5 parcelas futuras canceladas

    from agents.nami.tools_installments import cancel_installment_group
    result = cancel_installment_group("some-group-uuid")

    assert result["status"] == "ok"
    # Verifica que nenhuma call usa DELETE FROM
    for call_args in mock_dml.call_args_list:
        sql = call_args[0][0]
        assert "delete from" not in sql.lower()
        assert "deleted" in sql.lower()
