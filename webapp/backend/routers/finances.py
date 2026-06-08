"""Router de finanças — expõe as tools da Nami como endpoints REST.

Cada endpoint embrulha diretamente uma função de tool da Nami.
As tools retornam dicts com "status": "ok"/"error" — o router
converte "error" em HTTP 400 e "ok" em HTTP 200/201.

Usage:
    # Em main.py:
    from webapp.backend.routers import finances as finances_router
    app.include_router(finances_router.router, prefix="/api/finances", tags=["finances"])
"""

# Imports do FastAPI: APIRouter (agrupa rotas), Depends (injeção de dependências),
# HTTPException (lança erros HTTP), Query (extrai query params tipados)
from fastapi import APIRouter, Depends, HTTPException, Query

# BaseModel é a base para todos os modelos Pydantic (validação de body da requisição)
from pydantic import BaseModel

# Optional permite que campos sejam None além do tipo normal (ex.: Optional[float] = None)
from typing import Optional

# date e timedelta são usados para calcular datas padrão (hoje, primeiro do mês seguinte, etc.)
from datetime import date, timedelta

# require_user é a dependência de autenticação — bloqueia rotas não autenticadas
from webapp.backend.deps import require_user

# ─── Tools da Nami — importadas diretamente (sem instanciar agente) ──────────
# Cada grupo de tools vive em um arquivo separado por domínio

# Transações, assinaturas e helpers gerais
from agents.nami.tools import (
    create_transaction,   # Registra nova transação (despesa ou receita)
    update_transaction,   # Atualiza campos de uma transação existente
    delete_transaction,   # Soft delete — marca deleted=TRUE
    query_expenses,       # Consulta transações com filtros
    get_spending_summary, # Agrupa gastos por categoria/conta/tipo
    get_spending_trend,   # Evolução mensal de gastos
    create_subscription,  # Cadastra assinatura recorrente
    list_subscriptions,   # Lista assinaturas (ativa/encerrada/todas)
    update_subscription,  # Pausa, cancela ou atualiza assinatura
    delete_subscription,  # Soft delete de assinatura — marca deleted=TRUE
)

# Contas financeiras (corrente, poupança, dinheiro, investimento)
from agents.nami.tools_accounts import (
    create_account,       # Cadastra nova conta financeira
    list_accounts,        # Lista contas por status
    get_account_balance,  # Saldo atual de uma conta específica
    delete_account,       # Encerra conta — status → 'encerrado'
)

# Cartões de crédito
from agents.nami.tools_credit_cards import (
    register_credit_card,   # Cadastra cartão vinculado a uma conta
    get_card_debt_summary,  # Resumo de dívidas em todos os cartões
    register_card_payment,  # Registra pagamento de fatura
    delete_credit_card,     # Encerra cartão — status → 'encerrado'
)

# Empréstimos e financiamentos
from agents.nami.tools_loans import (
    register_loan,    # Cadastra empréstimo PRICE ou SAC
    list_loans,       # Lista empréstimos por status
    get_loan_balance, # Saldo devedor atual de um empréstimo
    delete_loan,      # Soft delete de empréstimo — marca deleted=TRUE
)

# Orçamento por categoria
from agents.nami.tools_budgets import (
    set_budget,        # Define limite mensal para uma categoria
    get_budget_status, # Status de todas as categorias com orçamento no mês
    delete_budget,     # Hard delete de envelope de orçamento
)

# Score de saúde financeira
from agents.nami.tools_health import (
    get_financial_health_score, # Calcula score 0-100 em 4 dimensões
)

# Compras parceladas e comprometimentos futuros
from agents.nami.tools_installments import (
    create_installment,           # Cria grupo + N transações parceladas
    list_installments,            # Lista grupos de parcelamentos
    get_future_commitments,       # Soma parcelas + assinaturas de um mês futuro
    delete_installment_group_full, # Soft delete completo do grupo (passadas + futuras)
)


# ─── Helper interno ───────────────────────────────────────────────────────────

def _check_result(result: dict) -> dict:
    """Verificar o resultado de uma tool da Nami e lançar exceção se houve erro.

    As tools da Nami sempre retornam um dict com "status": "ok" ou "status": "error".
    Esta função centraliza a conversão para exceções HTTP, evitando repetição em
    cada endpoint.

    O código HTTP de sucesso (200 ou 201) é controlado pelo decorador da rota
    (`status_code=201`), não por esta função.

    Args:
        result: Dicionário retornado pela tool da Nami.

    Returns:
        O próprio `result` se status == "ok".

    Raises:
        HTTPException: 400 se a tool retornou "status": "error".

    Example:
        >>> _check_result({"status": "ok", "id": "abc"})
        {"status": "ok", "id": "abc"}
    """
    # Se a tool sinalizou erro, converte para HTTP 400 Bad Request
    if result.get("status") == "error":
        raise HTTPException(
            status_code=400,
            detail=result.get("message", "Erro desconhecido"),
        )
    # Retorna o resultado sem modificação para o cliente
    return result


# ─── Criação do router ────────────────────────────────────────────────────────

# O prefixo "/api/finances" é adicionado em main.py quando este router é incluído
router = APIRouter()


# ═════════════════════════════════════════════════════════════════════════════
# MODELOS PYDANTIC — Validação dos corpos das requisições POST/PATCH
# ═════════════════════════════════════════════════════════════════════════════

class CreateTransactionBody(BaseModel):
    """Corpo da requisição para criar uma transação financeira."""
    name: str                   # Descrição da transação (obrigatório)
    valor: float                # Valor em reais (obrigatório)
    tipo: str                   # "Despesa" ou "Receita" (obrigatório)
    categoria: str = "Inbox"    # Categoria (padrão: Inbox = sem categoria definida)
    conta: str = ""             # Conta de origem/destino (vazio = resolução automática)
    data: str = ""              # Data no formato YYYY-MM-DD (vazio = hoje)
    notes: str = ""             # Observações opcionais
    card_id: str = ""           # ID do cartão (quando a transação é de cartão de crédito)


class UpdateTransactionBody(BaseModel):
    """Corpo da requisição para atualizar campos de uma transação.

    Todos os campos são opcionais — só os enviados serão alterados.
    """
    name: str = ""              # Novo nome (vazio = não altera)
    valor: Optional[float] = None  # Novo valor (None = não altera)
    tipo: str = ""              # Novo tipo (vazio = não altera)
    categoria: str = ""         # Nova categoria (vazio = não altera)
    conta: str = ""             # Nova conta (vazio = não altera)
    data: str = ""              # Nova data (vazio = não altera)
    notes: str = ""             # Novas observações (vazio = não altera)


class CreateAccountBody(BaseModel):
    """Corpo da requisição para cadastrar uma conta financeira."""
    name: str                       # Nome da conta (ex.: "NuConta", "Itaú")
    type: str                       # Tipo: "corrente" | "poupanca" | "dinheiro" | "investimento"
    data_inicio: str = ""           # Data de início no formato YYYY-MM-DD (vazio = hoje)
    balance_inicial: float = 0.0   # Saldo inicial em reais


class RegisterCreditCardBody(BaseModel):
    """Corpo da requisição para cadastrar um cartão de crédito."""
    name: str                          # Nome do cartão (ex.: "Nubank", "Itaú Platinum")
    account_name: str                  # Conta corrente/poupança vinculada
    limite: float = 0.0               # Limite total do cartão
    taxa_juros_mensal: float = 0.0    # Taxa de juros mensal decimal (ex.: 0.15 = 15%)
    closing_day: int = 1              # Dia do fechamento da fatura (1-31)
    due_day: int = 10                 # Dia do vencimento da fatura (1-31)
    divida_inicial: float = 0.0      # Dívida atual em reais (padrão: 0)


class CardPaymentBody(BaseModel):
    """Corpo da requisição para registrar pagamento de fatura de cartão."""
    valor: float    # Valor pago em reais (obrigatório)
    data: str = ""  # Data do pagamento (vazio = hoje)


class RegisterLoanBody(BaseModel):
    """Corpo da requisição para cadastrar um empréstimo ou financiamento."""
    nome: str                    # Nome do empréstimo (ex.: "Carro Onix")
    tipo: str                    # "veiculo" | "consignado" | "pessoal" | "imobiliario" | "outro"
    sistema: str = "PRICE"       # Sistema de amortização: "PRICE" (parcela fixa) ou "SAC"
    valor_original: float = 0.0  # Valor total financiado em reais
    taxa_juros_mensal: float = 0.0  # Taxa mensal decimal (ex.: 0.0099 = 0.99%)
    prazo_meses: int = 0         # Total de parcelas do contrato
    parcelas_pagas: int = 0      # Quantas parcelas já foram pagas
    valor_parcela: float = 0.0   # Valor da parcela atual
    data_inicio: str = ""        # Data da 1ª parcela (vazio = hoje)
    conta: str = ""              # Conta de débito das parcelas


class SetBudgetBody(BaseModel):
    """Corpo da requisição para definir orçamento mensal de uma categoria."""
    month: str        # Mês no formato YYYY-MM (ex.: "2026-06")
    categoria: str    # Nome da categoria (deve estar em CATEGORIES)
    limite: float     # Limite máximo de gastos em reais


class CreateSubscriptionBody(BaseModel):
    """Corpo da requisição para cadastrar uma assinatura recorrente."""
    name: str                         # Nome da assinatura (ex.: "Netflix", "Spotify")
    valor: float                      # Valor mensal ou anual em reais
    conta: str = ""                   # Conta de débito (vazio = resolução automática)
    ciclo: str = "mensal"             # "mensal" ou "anual"
    next_billing: str = ""            # Data da próxima cobrança no formato YYYY-MM-DD (vazio = 1º do mês seguinte)
    categoria: str = "Assinaturas"   # Categoria (padrão: Assinaturas)


class UpdateSubscriptionBody(BaseModel):
    """Campos opcionais para atualizar uma assinatura existente.

    Todos os campos são opcionais — só os enviados (não-vazios/não-None) serão alterados.
    """
    name: str = ""               # Novo nome do serviço (vazio = não altera)
    valor: Optional[float] = None  # Novo valor em reais (None = não altera)
    ciclo: str = ""              # Novo ciclo: "mensal" ou "anual" (vazio = não altera)
    next_billing: str = ""       # Nova data de cobrança YYYY-MM-DD (vazio = não altera)
    conta: str = ""              # Nova conta de débito (vazio = não altera)
    status: str = ""             # Novo status: "ativa" | "pausada" | "cancelada" (vazio = não altera)
    notes: str = ""              # Novas observações (vazio = não altera)


class CreateInstallmentBody(BaseModel):
    """Corpo da requisição para registrar uma compra parcelada."""
    name: str                   # Nome da compra (ex.: "Notebook Dell")
    valor_total: float          # Valor total em reais
    num_parcelas: int           # Número de parcelas (mínimo 2)
    conta: str = ""             # Conta usada (vazio = resolução automática)
    categoria: str = "Inbox"   # Categoria da compra
    data_inicio: str = ""       # Data da 1ª parcela (vazio = hoje)
    # card_id não suportado ainda: create_installment() não aceita este parâmetro.
    # Compras parceladas de cartão de crédito precisam ser registradas manualmente
    # via create_transaction com card_id para cada parcela individualmente.


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS — TRANSAÇÕES (/transactions)
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/transactions")
def list_transactions(
    # Parâmetros opcionais de filtro via query string (ex.: ?start_date=2026-06-01)
    start_date: str = Query(default="", description="Data inicial no formato YYYY-MM-DD"),
    end_date: str = Query(default="", description="Data final no formato YYYY-MM-DD"),
    # Dependência de autenticação — retorna 401 se o cookie de sessão for inválido
    user: dict = Depends(require_user),
) -> dict:
    """Consultar transações financeiras com filtros opcionais de período.

    Retorna a lista de transações não deletadas no período informado.
    Sem filtros, retorna as transações do mês atual (comportamento padrão da tool).

    Nota: a tool `query_expenses` filtra apenas por período. Filtros por categoria
    e conta não são suportados pela tool atual.

    Args:
        start_date: Data inicial (YYYY-MM-DD). Vazio = 1º dia do mês atual.
        end_date: Data final (YYYY-MM-DD). Vazio = hoje.
        user: Dados do usuário autenticado (injetado automaticamente pelo Depends).

    Returns:
        Dicionário com "status": "ok" e a lista de transações.

    Raises:
        HTTPException: 400 se os filtros forem inválidos.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Chama a tool da Nami passando os filtros de período recebidos
    result = query_expenses(
        start_date=start_date,
        end_date=end_date,
    )
    return _check_result(result)


@router.post("/transactions", status_code=201)
def create_transaction_endpoint(
    body: CreateTransactionBody,
    user: dict = Depends(require_user),
) -> dict:
    """Criar uma nova transação financeira (despesa ou receita).

    Args:
        body: Dados da transação (nome, valor, tipo são obrigatórios).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e o ID da transação criada.

    Raises:
        HTTPException: 400 se os dados forem inválidos (categoria inexistente, etc.).
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Repassa todos os campos do body para a tool da Nami
    result = create_transaction(
        name=body.name,
        valor=body.valor,
        tipo=body.tipo,
        categoria=body.categoria,
        conta=body.conta,
        data=body.data,
        notes=body.notes,
        card_id=body.card_id,
    )
    return _check_result(result)


@router.patch("/transactions/{tx_id}")
def update_transaction_endpoint(
    tx_id: str,                         # ID da transação, vem na URL (ex.: /transactions/abc-123)
    body: UpdateTransactionBody,
    user: dict = Depends(require_user),
) -> dict:
    """Atualizar campos de uma transação existente.

    Só altera os campos informados no body — os demais permanecem inalterados.

    Args:
        tx_id: ID único da transação a ser atualizada.
        body: Campos a atualizar (todos opcionais).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e mensagem de confirmação.

    Raises:
        HTTPException: 400 se a transação não for encontrada ou os dados forem inválidos.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Passa o ID da URL e os campos do body para a tool da Nami
    result = update_transaction(
        id=tx_id,
        name=body.name,
        valor=body.valor,
        tipo=body.tipo,
        categoria=body.categoria,
        conta=body.conta,
        data=body.data,
        notes=body.notes,
    )
    return _check_result(result)


@router.delete("/transactions/{tx_id}")
def delete_transaction_endpoint(
    tx_id: str,                         # ID da transação a ser deletada
    user: dict = Depends(require_user),
) -> dict:
    """Soft delete de uma transação (marca deleted=TRUE, não apaga do banco).

    Os dados são preservados no BigQuery para auditoria — só o campo `deleted`
    é marcado como TRUE, o que a exclui de todas as consultas normais.

    Args:
        tx_id: ID único da transação a ser deletada.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e mensagem de confirmação.

    Raises:
        HTTPException: 400 se a transação não for encontrada.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Chama delete_transaction com o ID da URL
    result = delete_transaction(id=tx_id)
    return _check_result(result)


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS — RESUMOS (/summary, /trend, /health, /commitments)
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/summary")
def summary(
    period: str = Query(default="month", description="Período: 'month', 'week', 'year'"),
    group_by: str = Query(default="categoria", description="Agrupar por: 'categoria', 'conta', 'tipo'"),
    user: dict = Depends(require_user),
) -> dict:
    """Obter resumo de gastos agrupados por categoria, conta ou tipo.

    Args:
        period: Período de análise ("month" = mês atual, "week" = semana, "year" = ano).
        group_by: Campo de agrupamento ("categoria", "conta" ou "tipo").
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e a lista de grupos com totais.

    Raises:
        HTTPException: 400 se os parâmetros forem inválidos.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Chama a tool de resumo com os parâmetros de agrupamento
    result = get_spending_summary(period=period, group_by=group_by)
    return _check_result(result)


@router.get("/trend")
def trend(
    months: int = Query(default=3, description="Número de meses de histórico"),
    user: dict = Depends(require_user),
) -> dict:
    """Obter evolução mensal de gastos com projeção do mês atual.

    Args:
        months: Quantos meses de histórico retornar (padrão: 3).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok", histórico mensal e projeção.

    Raises:
        HTTPException: 400 se os parâmetros forem inválidos.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Retorna os últimos N meses + projeção do mês corrente
    result = get_spending_trend(months=months)
    return _check_result(result)


@router.get("/health")
def health_score(
    month: str = Query(
        default="",
        description="Mês no formato YYYY-MM (padrão: mês atual)"
    ),
    user: dict = Depends(require_user),
) -> dict:
    """Calcular o score de saúde financeira do mês (0-100).

    O score é composto por 4 dimensões (25 pts cada):
    1. Taxa de gasto (despesas / receita)
    2. Taxa de poupança (receita - despesas) / receita
    3. Comprometimento futuro (parcelas + assinaturas / receita)
    4. Dívida de cartão (dívida / limite)

    Args:
        month: Mês a analisar no formato YYYY-MM. Vazio = usa mês atual.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com score total, breakdown por dimensão e mensagem interpretativa.

    Raises:
        HTTPException: 400 se o formato do mês for inválido.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Se o mês não foi informado, usa o mês atual no formato YYYY-MM
    if not month:
        month = date.today().strftime("%Y-%m")

    result = get_financial_health_score(month=month)
    return _check_result(result)


@router.get("/commitments/{month}")
def future_commitments(
    month: str,                         # Mês no formato YYYY-MM (vem na URL)
    user: dict = Depends(require_user),
) -> dict:
    """Obter compromissos financeiros futuros de um mês específico.

    Soma parcelas de compras parceladas + assinaturas que vencem no mês informado.
    Usado para planejar o fluxo de caixa dos próximos meses.

    Args:
        month: Mês no formato YYYY-MM (ex.: "2026-08").
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok", total de comprometimentos e detalhes.

    Raises:
        HTTPException: 400 se o mês estiver em formato inválido.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Consulta parcelas + assinaturas do mês especificado
    result = get_future_commitments(month=month)
    return _check_result(result)


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS — CONTAS (/accounts)
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/accounts")
def list_accounts_endpoint(
    status: str = Query(default="ativo", description="Status: 'ativo', 'encerrado', 'todos'"),
    user: dict = Depends(require_user),
) -> dict:
    """Listar contas financeiras cadastradas.

    Args:
        status: Filtrar por status da conta ("ativo", "encerrado" ou "todos").
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e lista de contas.

    Raises:
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Chama a tool de listagem com o filtro de status
    result = list_accounts(status=status)
    return _check_result(result)


@router.post("/accounts", status_code=201)
def create_account_endpoint(
    body: CreateAccountBody,
    user: dict = Depends(require_user),
) -> dict:
    """Cadastrar uma nova conta financeira.

    Contas são entidades separadas de cartões de crédito. Tipos válidos:
    "corrente", "poupanca", "dinheiro", "investimento".

    Args:
        body: Dados da conta (name e type são obrigatórios).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e o ID da conta criada.

    Raises:
        HTTPException: 400 se o tipo for inválido ou o nome já existir.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Cadastra a conta com os dados do body.
    # data_inicio é obrigatório no BigQuery (campo DATE) — usa hoje como fallback
    # para evitar 500 quando o campo não é enviado pelo cliente.
    result = create_account(
        name=body.name,
        type=body.type,
        data_inicio=body.data_inicio or date.today().strftime("%Y-%m-%d"),
        balance_inicial=body.balance_inicial,
    )
    return _check_result(result)


@router.get("/accounts/{account_id}/balance")
def account_balance(
    account_id: str,                    # ID da conta, vem na URL
    user: dict = Depends(require_user),
) -> dict:
    """Obter o saldo atual de uma conta financeira.

    Saldo = balance_inicial + receitas - despesas desde data_inicio.

    Args:
        account_id: ID único da conta.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e o saldo calculado.

    Raises:
        HTTPException: 400 se a conta não for encontrada.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Calcula e retorna o saldo da conta especificada
    result = get_account_balance(account_id=account_id)
    return _check_result(result)


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS — CARTÕES (/cards)
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/cards")
def cards_summary(
    user: dict = Depends(require_user),
) -> dict:
    """Obter resumo de dívidas de todos os cartões de crédito cadastrados.

    Retorna, para cada cartão: dívida atual, limite, percentual utilizado
    e status (dentro/acima do limite).

    Args:
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok", lista de cartões e totais.

    Raises:
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Consulta a dívida de todos os cartões no BigQuery
    result = get_card_debt_summary()
    return _check_result(result)


@router.post("/cards", status_code=201)
def register_card_endpoint(
    body: RegisterCreditCardBody,
    user: dict = Depends(require_user),
) -> dict:
    """Cadastrar um novo cartão de crédito.

    O cartão é vinculado a uma conta corrente ou poupança existente.
    Se houver dívida inicial, ela é registrada como transação de despesa.

    Args:
        body: Dados do cartão (name e account_name são obrigatórios).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e o ID do cartão criado.

    Raises:
        HTTPException: 400 se a conta vinculada não existir.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Cadastra o cartão com os dados do body
    result = register_credit_card(
        name=body.name,
        account_name=body.account_name,
        limite=body.limite,
        taxa_juros_mensal=body.taxa_juros_mensal,
        closing_day=body.closing_day,
        due_day=body.due_day,
        current_debt=body.divida_inicial,
    )
    return _check_result(result)


@router.post("/cards/{card_id}/payment", status_code=201)
def card_payment_endpoint(
    card_id: str,                       # ID do cartão, vem na URL
    body: CardPaymentBody,
    user: dict = Depends(require_user),
) -> dict:
    """Registrar pagamento de fatura de um cartão de crédito.

    O pagamento é registrado como uma transação Receita vinculada ao cartão,
    reduzindo o saldo devedor calculado pela tool `get_card_debt_summary`.

    Args:
        card_id: ID único do cartão.
        body: Valor pago e data opcional.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e a transação criada.

    Raises:
        HTTPException: 400 se o cartão não for encontrado.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Registra o pagamento no BigQuery
    result = register_card_payment(
        card_id=card_id,
        valor=body.valor,
        data=body.data,
    )
    return _check_result(result)


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS — EMPRÉSTIMOS (/loans)
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/loans")
def list_loans_endpoint(
    status: str = Query(default="ativo", description="Status: 'ativo', 'quitado', 'todos'"),
    user: dict = Depends(require_user),
) -> dict:
    """Listar empréstimos e financiamentos cadastrados.

    Args:
        status: Filtrar por status do empréstimo ("ativo", "quitado" ou "todos").
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e lista de empréstimos.

    Raises:
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Chama a tool com o filtro de status
    result = list_loans(status=status)
    return _check_result(result)


@router.post("/loans", status_code=201)
def register_loan_endpoint(
    body: RegisterLoanBody,
    user: dict = Depends(require_user),
) -> dict:
    """Registrar um empréstimo ou financiamento.

    Suporta os sistemas PRICE (parcela fixa) e SAC (amortização constante).

    Args:
        body: Dados do empréstimo (nome, tipo, valor são obrigatórios).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e o ID do empréstimo criado.

    Raises:
        HTTPException: 400 se os dados forem inválidos (conta não encontrada, etc.).
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Cadastra o empréstimo com os dados do body
    result = register_loan(
        name=body.nome,
        tipo=body.tipo,
        sistema_amortizacao=body.sistema,
        valor_original=body.valor_original,
        taxa_juros_mensal=body.taxa_juros_mensal,
        num_parcelas=body.prazo_meses,
        parcelas_pagas=body.parcelas_pagas,
        valor_parcela=body.valor_parcela,
        primeiro_vencimento=body.data_inicio,
        conta=body.conta,
    )
    return _check_result(result)


@router.get("/loans/{loan_id}/balance")
def loan_balance(
    loan_id: str,                       # ID do empréstimo, vem na URL
    user: dict = Depends(require_user),
) -> dict:
    """Obter o saldo devedor atual de um empréstimo.

    Calcula o saldo devedor com base no sistema de amortização (PRICE ou SAC)
    e no número de parcelas já pagas.

    Args:
        loan_id: ID único do empréstimo.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e o saldo devedor calculado.

    Raises:
        HTTPException: 400 se o empréstimo não for encontrado.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Calcula e retorna o saldo devedor do empréstimo especificado
    result = get_loan_balance(loan_id=loan_id)
    return _check_result(result)


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS — ORÇAMENTOS (/budgets)
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/budgets")
def budget_status(
    month: str = Query(
        default="",
        description="Mês no formato YYYY-MM (padrão: mês atual)"
    ),
    user: dict = Depends(require_user),
) -> dict:
    """Obter status de orçamento de todas as categorias no mês.

    Retorna, para cada categoria com orçamento definido: limite, gasto atual
    e percentual utilizado.

    Args:
        month: Mês no formato YYYY-MM. Vazio = usa mês atual.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e o status de cada categoria.

    Raises:
        HTTPException: 400 se o mês estiver em formato inválido.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Se o mês não foi informado, usa o mês atual
    if not month:
        month = date.today().strftime("%Y-%m")

    result = get_budget_status(month=month)
    return _check_result(result)


@router.post("/budgets", status_code=201)
def set_budget_endpoint(
    body: SetBudgetBody,
    user: dict = Depends(require_user),
) -> dict:
    """Definir ou atualizar o limite de orçamento para uma categoria em um mês.

    Args:
        body: Mês, categoria e limite são todos obrigatórios.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e confirmação.

    Raises:
        HTTPException: 400 se a categoria for inválida.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Define o orçamento para a categoria e mês informados
    result = set_budget(
        month=body.month,
        categoria=body.categoria,
        limite=body.limite,
    )
    return _check_result(result)


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS — ASSINATURAS (/subscriptions)
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/subscriptions")
def list_subscriptions_endpoint(
    status: str = Query(default="ativa", description="Status: 'ativa', 'pausada', 'encerrada', 'todas'"),
    user: dict = Depends(require_user),
) -> dict:
    """Listar assinaturas recorrentes cadastradas.

    Args:
        status: Filtrar por status da assinatura.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e lista de assinaturas com próxima cobrança.

    Raises:
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Chama a tool de listagem com o filtro de status
    result = list_subscriptions(status=status)
    return _check_result(result)


@router.post("/subscriptions", status_code=201)
def create_subscription_endpoint(
    body: CreateSubscriptionBody,
    user: dict = Depends(require_user),
) -> dict:
    """Cadastrar uma nova assinatura recorrente.

    Args:
        body: Dados da assinatura (name e valor são obrigatórios).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e o ID da assinatura criada.

    Raises:
        HTTPException: 400 se os dados forem inválidos.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Se next_billing não foi informado, usa o 1º dia do mês seguinte como padrão.
    # A tool create_subscription exige esse campo no formato YYYY-MM-DD.
    if body.next_billing:
        next_billing = body.next_billing
    else:
        # Avança para o primeiro dia do mês seguinte somando dias suficientes
        today = date.today()
        # replace(day=1) vai ao início do mês atual; + timedelta(days=31) pula para o mês seguinte
        next_month_first = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
        next_billing = next_month_first.strftime("%Y-%m-%d")

    # Cadastra a assinatura com os dados do body
    result = create_subscription(
        name=body.name,
        valor=body.valor,
        ciclo=body.ciclo,
        next_billing=next_billing,
        conta=body.conta,
        categoria=body.categoria,
    )
    return _check_result(result)


@router.patch("/subscriptions/{sub_id}", status_code=200)
def update_subscription_endpoint(
    sub_id: str,                        # ID da assinatura, vem na URL (ex.: /subscriptions/abc-123)
    body: UpdateSubscriptionBody,
    user: dict = Depends(require_user),
) -> dict:
    """Atualizar status, valor ou outros campos de uma assinatura existente.

    Só altera os campos fornecidos no body — os demais permanecem inalterados.
    Permite pausar ("pausada"), cancelar ("cancelada") ou reativar ("ativa") uma assinatura.

    Args:
        sub_id: ID único da assinatura a ser atualizada.
        body: Campos a atualizar (todos opcionais).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e mensagem de confirmação.

    Raises:
        HTTPException: 400 se a assinatura não for encontrada ou os dados forem inválidos.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Monta o dicionário de argumentos para a tool, incluindo apenas os campos
    # que foram preenchidos (não-vazios / não-None) — a tool update_subscription
    # só altera o que for informado, ignorando strings vazias e None.
    kwargs: dict = {"id": sub_id}  # O parâmetro da tool se chama "id", não "sub_id"

    if body.name:
        kwargs["name"] = body.name
    if body.valor is not None:
        kwargs["valor"] = body.valor
    if body.ciclo:
        kwargs["ciclo"] = body.ciclo
    if body.next_billing:
        kwargs["next_billing"] = body.next_billing
    if body.conta:
        kwargs["conta"] = body.conta
    if body.status:
        kwargs["status"] = body.status
    if body.notes:
        kwargs["notes"] = body.notes

    # Chama a tool de atualização com os kwargs montados acima
    result = update_subscription(**kwargs)
    return _check_result(result)


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS — PARCELAS (/installments)
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/installments")
def list_installments_endpoint(
    status: str = Query(default="ativo", description="Status: 'ativo', 'quitado', 'todos'"),
    user: dict = Depends(require_user),
) -> dict:
    """Listar grupos de compras parceladas.

    Args:
        status: Filtrar por status do grupo de parcelas.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e lista de grupos com progresso das parcelas.

    Raises:
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Chama a tool de listagem com o filtro de status
    result = list_installments(status=status)
    return _check_result(result)


@router.post("/installments", status_code=201)
def create_installment_endpoint(
    body: CreateInstallmentBody,
    user: dict = Depends(require_user),
) -> dict:
    """Registrar uma compra parcelada, criando todas as parcelas automaticamente.

    Cria um grupo de parcelamento + N transações com datas mensais consecutivas
    a partir da data informada.

    Args:
        body: Dados da compra parcelada (name, valor_total e num_parcelas são obrigatórios).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok", group_id e lista de transaction_ids.

    Raises:
        HTTPException: 400 se a conta não existir ou o número de parcelas for < 2.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Cria o grupo de parcelamento com os dados do body
    # Nota: a tool usa "total_valor" e "first_due" — adaptamos os nomes do body
    result = create_installment(
        name=body.name,
        total_valor=body.valor_total,
        num_parcelas=body.num_parcelas,
        conta=body.conta,
        categoria=body.categoria,
        first_due=body.data_inicio,
    )
    return _check_result(result)


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS DELETE — encerramento/remoção de entidades
# ═════════════════════════════════════════════════════════════════════════════

@router.delete("/accounts/{account_id}", status_code=200)
def delete_account_endpoint(
    account_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Encerrar uma conta financeira (status → 'encerrado').

    Args:
        account_id: ID único da conta.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e mensagem de confirmação.

    Raises:
        HTTPException: 400 se a conta não for encontrada.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    return _check_result(delete_account(account_id=account_id))


@router.delete("/cards/{card_id}", status_code=200)
def delete_card_endpoint(
    card_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Encerrar um cartão de crédito (status → 'encerrado').

    Args:
        card_id: ID único do cartão.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e mensagem de confirmação.

    Raises:
        HTTPException: 400 se o cartão não for encontrado.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    return _check_result(delete_credit_card(card_id=card_id))


@router.delete("/loans/{loan_id}", status_code=200)
def delete_loan_endpoint(
    loan_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Remover um empréstimo (soft delete — marca deleted=TRUE).

    Args:
        loan_id: ID único do empréstimo.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e mensagem de confirmação.

    Raises:
        HTTPException: 400 se o empréstimo não for encontrado.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    return _check_result(delete_loan(loan_id=loan_id))


@router.delete("/subscriptions/{sub_id}", status_code=200)
def delete_subscription_endpoint(
    sub_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Remover uma assinatura (soft delete — marca deleted=TRUE).

    Args:
        sub_id: ID único da assinatura.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e mensagem de confirmação.

    Raises:
        HTTPException: 400 se a assinatura não for encontrada.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    return _check_result(delete_subscription(id=sub_id))


@router.delete("/budgets/{month}/{categoria}", status_code=200)
def delete_budget_endpoint(
    month: str,
    categoria: str,
    user: dict = Depends(require_user),
) -> dict:
    """Remover o envelope de orçamento de uma categoria em um mês (hard delete).

    Args:
        month: Mês no formato "YYYY-MM".
        categoria: Categoria do envelope (ex.: "Lazer", "Alimentacao").
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e mensagem de confirmação.

    Raises:
        HTTPException: 400 se o envelope não for encontrado.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    return _check_result(delete_budget(month=month, categoria=categoria))


@router.delete("/installments/{group_id}", status_code=200)
def delete_installment_endpoint(
    group_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Remover um parcelamento completo — todas as parcelas (passadas + futuras).

    Diferente do cancelamento (que preserva parcelas já pagas), esta rota apaga
    o grupo inteiro. Use apenas quando o parcelamento foi cadastrado por engano.

    Args:
        group_id: ID único do grupo de parcelas.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e quantidade de parcelas removidas.

    Raises:
        HTTPException: 400 se o grupo não for encontrado.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    return _check_result(delete_installment_group_full(id=group_id))
