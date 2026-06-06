"""Tools de gerenciamento de contas financeiras da Nami.

Gerencia a tabela `accounts` no PostgreSQL — fonte canônica de contas
que substituiu a lista ACCOUNTS hardcoded em tools.py.

Usage:
    from agents.nami.tools_accounts import create_account, list_accounts, get_account_balance
"""
import uuid
from datetime import datetime

# Importa os helpers PostgreSQL compartilhados
from agents.db import run_select, run_dml
from agents.nami.tools import _invalidate_accounts_cache

# Tipos de conta bancária aceitos. Cartões de crédito são gerenciados
# separadamente em credit_cards e NÃO são contas — não estão aqui.
ACCOUNT_TYPES = ["corrente", "poupanca", "dinheiro", "investimento"]


def create_account(
    name: str,
    type: str,
    data_inicio: str,
    institution: str = "",
    balance_inicial: float = 0.0,
    notes: str = "",
) -> dict:
    """Cadastra uma nova conta financeira.

    Args:
        name: Nome da conta (ex.: "NuConta", "Cartao Nu", "Itau").
        type: Tipo da conta. Valores válidos: "corrente", "poupanca",
            "dinheiro", "investimento".
        data_inicio: Data de início do rastreamento no formato YYYY-MM-DD.
        institution: Instituição financeira (ex.: "Nubank", "Itaú").
        balance_inicial: Saldo em reais na data de início do rastreamento.
        notes: Observações opcionais.

    Returns:
        Dicionário com "status": "ok" e "id" da conta, ou "status": "error".

    Example:
        >>> create_account("NuConta", "corrente", "2026-01-01", "Nubank", 1500.0)
        {"status": "ok", "id": "...", "name": "NuConta"}
    """
    if type not in ACCOUNT_TYPES:
        return {
            "status": "error",
            "message": f"Tipo inválido: '{type}'. Opções: {', '.join(ACCOUNT_TYPES)}",
        }

    account_id = str(uuid.uuid4())
    # Timestamp atual para o campo created_at — registra quando a conta foi criada
    now = datetime.utcnow().isoformat()

    sql = """
        INSERT INTO accounts
        (id, name, institution, type, balance_inicial, data_inicio, status, notes, created_at)
        VALUES
        (%(id)s, %(name)s, %(institution)s, %(type)s, %(balance_inicial)s, %(data_inicio)s, 'ativo', %(notes)s, %(created_at)s)
    """
    params = {
        "id":              account_id,
        "name":            name,
        "institution":     institution or "",
        "type":            type,
        "balance_inicial": float(balance_inicial),
        "data_inicio":     data_inicio,
        "notes":           notes or "",
        "created_at":      now,
    }
    try:
        run_dml(sql, params)
        # Força recarga do cache de contas na próxima chamada a _resolve_account
        _invalidate_accounts_cache()
        return {"status": "ok", "id": account_id, "name": name}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def list_accounts(status: str = "ativo") -> dict:
    """Lista as contas financeiras cadastradas.

    Args:
        status: Filtro de status. Use "ativo" (padrão), "encerrado" ou "todos".

    Returns:
        Dicionário com "status": "ok" e lista "accounts" com todas as colunas.

    Example:
        >>> list_accounts()
        {"status": "ok", "accounts": [{"id": "...", "name": "NuConta", ...}]}
    """
    if status == "todos":
        # Sem filtro de status — retorna todas as contas independente do estado
        sql = "SELECT * FROM accounts ORDER BY type, name"
        params = None
    else:
        sql = "SELECT * FROM accounts WHERE status = %(status)s ORDER BY type, name"
        params = {"status": status}

    try:
        rows = run_select(sql, params)
        return {"status": "ok", "accounts": rows}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def get_account_balance(account_id: str) -> dict:
    """Calcula o saldo atual de uma conta a partir das transações registradas.

    Saldo atual = balance_inicial + SUM(Receitas) − SUM(Despesas) das
    transactions com account_id correspondente e deleted = FALSE.

    Args:
        account_id: ID (UUID) da conta na tabela accounts.

    Returns:
        Dicionário com saldo_inicial, total_receitas, total_despesas e saldo_atual.

    Example:
        >>> get_account_balance("uuid-abc")
        {"status": "ok", "account": "NuConta", "saldo_atual": 1300.0, ...}
    """
    # Busca metadados da conta pelo ID
    acc_rows = run_select(
        "SELECT id, name, type, balance_inicial, data_inicio FROM accounts WHERE id = %(id)s LIMIT 1",
        {"id": account_id},
    )
    if not acc_rows:
        return {"status": "error", "message": f"Conta não encontrada: {account_id}"}

    acc = acc_rows[0]

    # Soma receitas e despesas de todas as transações não deletadas desta conta
    # COALESCE garante que retorne 0 mesmo quando não há transações
    totals = run_select(
        """
        SELECT
          COALESCE(SUM(CASE WHEN tipo = 'Receita' THEN valor ELSE 0 END), 0) AS receitas,
          COALESCE(SUM(CASE WHEN tipo = 'Despesa' THEN valor ELSE 0 END), 0) AS despesas
        FROM transactions
        WHERE account_id = %(account_id)s AND deleted = FALSE
        """,
        {"account_id": account_id},
    )

    receitas = float(totals[0]["receitas"]) if totals else 0.0
    despesas = float(totals[0]["despesas"]) if totals else 0.0
    saldo = float(acc["balance_inicial"]) + receitas - despesas

    return {
        "status": "ok",
        "account": acc["name"],
        "type": acc["type"],
        "saldo_inicial": float(acc["balance_inicial"]),
        "total_receitas": receitas,
        "total_despesas": despesas,
        "saldo_atual": round(saldo, 2),
    }
