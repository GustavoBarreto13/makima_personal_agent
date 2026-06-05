"""Testes do router de finanças (webapp/backend/routers/finances.py).

Usa TestClient do FastAPI para simular requisições HTTP reais à aplicação.
Todas as tools da Nami são mockadas com unittest.mock.patch para evitar
qualquer acesso real ao BigQuery (sem credenciais necessárias).

Execute com:
    pytest tests/test_finances_router.py -v
"""

import pytest  # Framework de testes
from unittest.mock import patch  # patch permite substituir funções por objetos simulados (mocks)
from fastapi.testclient import TestClient  # Simula requisições HTTP à aplicação FastAPI

# Importa a aplicação e a dependência de autenticação para sobrescrever em testes
from webapp.backend.main import app
from webapp.backend.deps import require_user


# ─── Substituição (override) da autenticação para testes ─────────────────────
# Em produção, require_user valida o cookie de sessão (itsdangerous).
# Nos testes, substituímos por uma função que retorna um usuário fixo,
# evitando a necessidade de um cookie real assinado.
def _mock_user():
    """Retornar um usuário de teste simulado (sem cookie real)."""
    return {"email": "test@example.com", "name": "Test User"}


# FastAPI permite sobrescrever dependências globalmente para testes.
# Qualquer rota que usa Depends(require_user) receberá _mock_user() em vez disso.
app.dependency_overrides[require_user] = _mock_user


# ─── Cliente de teste ─────────────────────────────────────────────────────────
# O TestClient envia requisições HTTP diretamente à aplicação ASGI sem precisar
# de um servidor real rodando. É síncrono e ideal para testes unitários de API.
client = TestClient(app, raise_server_exceptions=True)


# ─── Fixture de autenticação ──────────────────────────────────────────────────
# Esta fixture remove o override de autenticação para testar o comportamento
# real de rotas protegidas (sem usuário autenticado = 401).
@pytest.fixture
def unauthenticated_client():
    """Retornar um TestClient sem a sobrescrição de autenticação.

    Usado para testar que rotas protegidas retornam 401 quando não autenticadas.
    Restaura o override original após o teste.
    """
    # Remove a sobrescrição de autenticação temporariamente
    del app.dependency_overrides[require_user]

    # Cria um novo cliente sem override
    unauth_client = TestClient(app, raise_server_exceptions=False)

    # yield devolve o cliente para o teste e continua após o teste terminar
    yield unauth_client

    # Restaura a sobrescrição original para os testes seguintes
    app.dependency_overrides[require_user] = _mock_user


# ═════════════════════════════════════════════════════════════════════════════
# TESTES — TRANSAÇÕES
# ═════════════════════════════════════════════════════════════════════════════

class TestTransactions:
    """Testes dos endpoints de transações (/api/finances/transactions)."""

    @patch("webapp.backend.routers.finances.query_expenses")
    def test_get_transactions_returns_200(self, mock_query):
        """GET /transactions deve retornar 200 com a lista de transações."""
        # Configura o mock para simular retorno bem-sucedido da tool da Nami
        mock_query.return_value = {
            "status": "ok",
            "transactions": [
                {
                    "id": "tx-001",
                    "name": "Almoço",
                    "valor": 25.0,
                    "tipo": "Despesa",
                    "categoria": "Alimentacao",
                    "data": "2026-06-01",
                }
            ],
            "total": 25.0,
        }

        # Faz a requisição GET para o endpoint
        response = client.get("/api/finances/transactions")

        # Verifica que retornou 200 OK
        assert response.status_code == 200

        # Verifica que a tool foi chamada (sem importar os argumentos exatos)
        mock_query.assert_called_once()

        # Verifica que a resposta contém a lista de transações
        data = response.json()
        assert data["status"] == "ok"
        assert len(data["transactions"]) == 1

    @patch("webapp.backend.routers.finances.query_expenses")
    def test_get_transactions_with_filters(self, mock_query):
        """GET /transactions?start_date=...&end_date=... deve repassar os filtros para a tool."""
        # Configura retorno vazio mas válido
        mock_query.return_value = {"status": "ok", "transactions": [], "total": 0.0}

        # Chama o endpoint com parâmetros de filtro de data
        response = client.get(
            "/api/finances/transactions",
            params={"start_date": "2026-06-01", "end_date": "2026-06-30"},
        )

        # Deve retornar 200 mesmo sem transações
        assert response.status_code == 200

        # Verifica que a tool foi chamada com os filtros corretos
        mock_query.assert_called_once_with(
            start_date="2026-06-01",
            end_date="2026-06-30",
        )

    @patch("webapp.backend.routers.finances.create_transaction")
    def test_post_transaction_success_returns_201(self, mock_create):
        """POST /transactions com dados válidos deve retornar 201 Created."""
        # Configura o mock para simular criação bem-sucedida
        mock_create.return_value = {
            "status": "ok",
            "id": "new-tx-uuid",
            "message": "Transação criada: Almoço R$25.00 (Alimentacao)",
        }

        # Envia o corpo da requisição com os dados da transação
        response = client.post(
            "/api/finances/transactions",
            json={
                "name": "Almoço",
                "valor": 25.0,
                "tipo": "Despesa",
                "categoria": "Alimentacao",
            },
        )

        # O status code de criação bem-sucedida é 201 Created
        assert response.status_code == 201

        data = response.json()
        assert data["status"] == "ok"
        assert data["id"] == "new-tx-uuid"

    @patch("webapp.backend.routers.finances.create_transaction")
    def test_post_transaction_tool_error_returns_400(self, mock_create):
        """POST /transactions quando a tool retorna status:error deve retornar 400."""
        # Simula erro da tool (categoria inválida, conta não encontrada, etc.)
        mock_create.return_value = {
            "status": "error",
            "message": "Categoria inválida: 'CategoriaInexistente'. Opções: ...",
        }

        # Envia dados com categoria inválida
        response = client.post(
            "/api/finances/transactions",
            json={
                "name": "Teste",
                "valor": 10.0,
                "tipo": "Despesa",
                "categoria": "CategoriaInexistente",
            },
        )

        # O router deve converter o erro da tool em HTTP 400
        assert response.status_code == 400

        # A mensagem de erro da tool deve estar no detalhe do erro HTTP
        data = response.json()
        assert "Categoria inválida" in data["detail"]

    @patch("webapp.backend.routers.finances.delete_transaction")
    def test_delete_transaction_returns_200(self, mock_delete):
        """DELETE /transactions/{id} deve retornar 200 e confirmar o soft delete."""
        # Simula deleção bem-sucedida
        mock_delete.return_value = {
            "status": "ok",
            "message": "Transação deletada com sucesso.",
        }

        # Chama o endpoint de deleção com um ID qualquer
        response = client.delete("/api/finances/transactions/tx-to-delete")

        # Deve retornar 200 OK (não 204, pois retornamos JSON)
        assert response.status_code == 200

        data = response.json()
        assert data["status"] == "ok"

        # Verifica que a tool foi chamada com o ID correto
        mock_delete.assert_called_once_with(id="tx-to-delete")

    @patch("webapp.backend.routers.finances.update_transaction")
    def test_patch_transaction_returns_200(self, mock_update):
        """PATCH /transactions/{id} deve atualizar os campos e retornar 200."""
        # Simula atualização bem-sucedida
        mock_update.return_value = {
            "status": "ok",
            "message": "Transação atualizada com sucesso.",
        }

        # Envia body com campo a atualizar
        response = client.patch(
            "/api/finances/transactions/tx-123",
            json={"valor": 30.0},
        )

        assert response.status_code == 200

        # Verifica que o ID da URL foi passado para a tool
        mock_update.assert_called_once()
        call_kwargs = mock_update.call_args.kwargs
        assert call_kwargs["id"] == "tx-123"
        assert call_kwargs["valor"] == 30.0


# ═════════════════════════════════════════════════════════════════════════════
# TESTES — CONTAS
# ═════════════════════════════════════════════════════════════════════════════

class TestAccounts:
    """Testes dos endpoints de contas financeiras (/api/finances/accounts)."""

    @patch("webapp.backend.routers.finances.list_accounts")
    def test_get_accounts_returns_200(self, mock_list):
        """GET /accounts deve retornar 200 com a lista de contas."""
        # Simula resposta com duas contas ativas
        mock_list.return_value = {
            "status": "ok",
            "accounts": [
                {"id": "acc-001", "name": "NuConta", "type": "corrente"},
                {"id": "acc-002", "name": "Poupança", "type": "poupanca"},
            ],
        }

        response = client.get("/api/finances/accounts")

        assert response.status_code == 200

        data = response.json()
        assert data["status"] == "ok"
        assert len(data["accounts"]) == 2

        # Verifica que o status padrão "ativo" foi usado
        mock_list.assert_called_once_with(status="ativo")

    @patch("webapp.backend.routers.finances.list_accounts")
    def test_get_accounts_with_status_filter(self, mock_list):
        """GET /accounts?status=encerrado deve repassar o filtro para a tool."""
        mock_list.return_value = {"status": "ok", "accounts": []}

        response = client.get("/api/finances/accounts", params={"status": "encerrado"})

        assert response.status_code == 200
        # Verifica que o status correto foi passado
        mock_list.assert_called_once_with(status="encerrado")


# ═════════════════════════════════════════════════════════════════════════════
# TESTES — SCORE DE SAÚDE FINANCEIRA
# ═════════════════════════════════════════════════════════════════════════════

class TestHealthScore:
    """Testes do endpoint de score de saúde financeira (/api/finances/health)."""

    @patch("webapp.backend.routers.finances.get_financial_health_score")
    def test_get_health_score_with_month_returns_200(self, mock_health):
        """GET /health?month=2026-06 deve retornar 200 com o score calculado."""
        # Simula retorno do score de saúde financeira
        mock_health.return_value = {
            "status": "ok",
            "score": 72,
            "breakdown": {
                "taxa_gasto": 20,
                "taxa_poupanca": 18,
                "comprometimento_futuro": 22,
                "divida_cartao": 12,
            },
            "message": "Saúde financeira em 2026-06: 72/100.",
        }

        # Chama o endpoint com o mês especificado
        response = client.get("/api/finances/health", params={"month": "2026-06"})

        assert response.status_code == 200

        data = response.json()
        assert data["status"] == "ok"
        assert data["score"] == 72

        # Verifica que o mês correto foi passado para a tool
        mock_health.assert_called_once_with(month="2026-06")

    @patch("webapp.backend.routers.finances.get_financial_health_score")
    def test_get_health_score_without_month_uses_current(self, mock_health):
        """GET /health sem month deve usar o mês atual no formato YYYY-MM."""
        mock_health.return_value = {
            "status": "ok",
            "score": 85,
            "breakdown": {},
            "message": "Ok",
        }

        # Chama o endpoint SEM o parâmetro de mês
        response = client.get("/api/finances/health")

        assert response.status_code == 200

        # Verifica que a tool foi chamada com algum mês no formato correto
        mock_health.assert_called_once()
        call_kwargs = mock_health.call_args.kwargs
        # O mês deve estar no formato YYYY-MM (4 dígitos + hífen + 2 dígitos)
        assert len(call_kwargs["month"]) == 7
        assert call_kwargs["month"][4] == "-"

    @patch("webapp.backend.routers.finances.get_financial_health_score")
    def test_get_health_score_tool_error_returns_400(self, mock_health):
        """GET /health quando a tool retorna error deve retornar 400."""
        # Simula erro da tool (ex.: formato de mês inválido)
        mock_health.return_value = {
            "status": "error",
            "message": "Formato de mês inválido. Use YYYY-MM.",
        }

        response = client.get("/api/finances/health", params={"month": "06-2026"})

        assert response.status_code == 400
        assert "Formato de mês inválido" in response.json()["detail"]


# ═════════════════════════════════════════════════════════════════════════════
# TESTES — AUTENTICAÇÃO
# ═════════════════════════════════════════════════════════════════════════════

class TestAuthentication:
    """Testes de proteção por autenticação em rotas do router de finanças."""

    def test_unauthenticated_request_to_transactions_returns_401(
        self, unauthenticated_client
    ):
        """GET /transactions sem cookie de sessão deve retornar 401 Unauthorized.

        Este teste usa o `unauthenticated_client` que não tem a sobrescrição de
        autenticação — portanto, a dependência real `require_user` é executada
        e rejeita a requisição sem cookie válido.
        """
        # Faz a requisição sem nenhum cookie
        response = unauthenticated_client.get("/api/finances/transactions")

        # Deve retornar 401 (não autenticado)
        assert response.status_code == 401

    def test_unauthenticated_request_to_accounts_returns_401(
        self, unauthenticated_client
    ):
        """GET /accounts sem cookie de sessão deve retornar 401 Unauthorized."""
        response = unauthenticated_client.get("/api/finances/accounts")
        assert response.status_code == 401

    def test_unauthenticated_post_to_transactions_returns_401(
        self, unauthenticated_client
    ):
        """POST /transactions sem cookie de sessão deve retornar 401 Unauthorized."""
        response = unauthenticated_client.post(
            "/api/finances/transactions",
            json={"name": "Teste", "valor": 10.0, "tipo": "Despesa"},
        )
        assert response.status_code == 401


# ═════════════════════════════════════════════════════════════════════════════
# TESTES — RESUMOS E ANÁLISES
# ═════════════════════════════════════════════════════════════════════════════

class TestSummaries:
    """Testes dos endpoints de análise financeira."""

    @patch("webapp.backend.routers.finances.get_spending_summary")
    def test_get_summary_returns_200(self, mock_summary):
        """GET /summary deve retornar 200 com o resumo de gastos."""
        mock_summary.return_value = {
            "status": "ok",
            "summary": [
                {"categoria": "Alimentacao", "total": 350.0},
                {"categoria": "Lazer", "total": 120.0},
            ],
            "period": "month",
            "group_by": "categoria",
        }

        response = client.get("/api/finances/summary")

        assert response.status_code == 200

        data = response.json()
        assert data["status"] == "ok"

        # Verifica que os defaults foram usados (period="month", group_by="categoria")
        mock_summary.assert_called_once_with(period="month", group_by="categoria")

    @patch("webapp.backend.routers.finances.get_spending_trend")
    def test_get_trend_returns_200(self, mock_trend):
        """GET /trend deve retornar 200 com a evolução mensal."""
        mock_trend.return_value = {
            "status": "ok",
            "months": [
                {"month": "2026-04", "total": 2100.0},
                {"month": "2026-05", "total": 1950.0},
                {"month": "2026-06", "total": 800.0},
            ],
            "projection": 1600.0,
        }

        response = client.get("/api/finances/trend")

        assert response.status_code == 200

        # Verifica que o default de 3 meses foi usado
        mock_trend.assert_called_once_with(months=3)

    @patch("webapp.backend.routers.finances.get_future_commitments")
    def test_get_commitments_returns_200(self, mock_commits):
        """GET /commitments/{month} deve retornar 200 com os comprometimentos."""
        mock_commits.return_value = {
            "status": "ok",
            "month": "2026-08",
            "total": 1250.0,
            "installments": 800.0,
            "subscriptions": 450.0,
        }

        response = client.get("/api/finances/commitments/2026-08")

        assert response.status_code == 200
        # Verifica que o mês da URL foi passado para a tool
        mock_commits.assert_called_once_with(month="2026-08")


# ═════════════════════════════════════════════════════════════════════════════
# TESTES — CARTÕES
# ═════════════════════════════════════════════════════════════════════════════

class TestCards:
    """Testes dos endpoints de cartões de crédito (/api/finances/cards)."""

    @patch("webapp.backend.routers.finances.get_card_debt_summary")
    def test_get_cards_summary_returns_200(self, mock_summary):
        """GET /cards deve retornar 200 com o resumo de dívidas."""
        mock_summary.return_value = {
            "status": "ok",
            "cards": [
                {
                    "id": "card-001",
                    "name": "Nubank",
                    "divida": 450.0,
                    "limite": 5000.0,
                    "percentual_usado": 9.0,
                }
            ],
            "total_divida": 450.0,
            "total_limite": 5000.0,
        }

        response = client.get("/api/finances/cards")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["total_divida"] == 450.0

    @patch("webapp.backend.routers.finances.register_card_payment")
    def test_post_card_payment_returns_201(self, mock_payment):
        """POST /cards/{id}/payment deve registrar pagamento e retornar 201."""
        mock_payment.return_value = {
            "status": "ok",
            "message": "Pagamento de R$200.00 registrado para o cartão Nubank.",
        }

        response = client.post(
            "/api/finances/cards/card-001/payment",
            json={"valor": 200.0},
        )

        assert response.status_code == 201

        # Verifica que o ID do cartão da URL foi passado para a tool
        mock_payment.assert_called_once_with(
            card_id="card-001",
            valor=200.0,
            data="",
        )
