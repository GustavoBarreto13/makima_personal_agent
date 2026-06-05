"""Tools de gerenciamento de contas financeiras da Nami.

Gerencia a tabela `accounts` no BigQuery — fonte canônica de contas
que substituiu a lista ACCOUNTS hardcoded em tools.py.

Usage:
    from agents.nami.tools_accounts import create_account, list_accounts, get_account_balance
"""
import uuid
from datetime import datetime

from google.cloud import bigquery

from agents.nami.tools import _project, _run_select, _run_dml, _invalidate_accounts_cache

# Tipos de conta aceitos
# Tipos de conta bancária aceitos. Cartões de crédito são gerenciados
# separadamente em credit_cards e NÃO são contas — não estão aqui.
ACCOUNT_TYPES = ["corrente", "poupanca", "dinheiro", "investimento"]


def _table(name: str = "accounts") -> str:
    """Retorna o caminho completo da tabela no BigQuery."""
    return f"`{_project()}.nami_finance_agent.{name}`"


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
            "cartao_credito", "dinheiro", "investimento".
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
    now = datetime.utcnow().isoformat()

    sql = f"""
        INSERT INTO {_table()}
        (id, name, institution, type, balance_inicial, data_inicio, status, notes, created_at)
        VALUES
        (@id, @name, @institution, @type, @balance_inicial, @data_inicio, 'ativo', @notes, @created_at)
    """
    params = [
        bigquery.ScalarQueryParameter("id", "STRING", account_id),
        bigquery.ScalarQueryParameter("name", "STRING", name),
        bigquery.ScalarQueryParameter("institution", "STRING", institution or ""),
        bigquery.ScalarQueryParameter("type", "STRING", type),
        bigquery.ScalarQueryParameter("balance_inicial", "FLOAT64", float(balance_inicial)),
        bigquery.ScalarQueryParameter("data_inicio", "DATE", data_inicio),
        bigquery.ScalarQueryParameter("notes", "STRING", notes or ""),
        bigquery.ScalarQueryParameter("created_at", "TIMESTAMP", now),
    ]
    try:
        _run_dml(sql, params)
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
        sql = f"SELECT * FROM {_table()} ORDER BY type, name"
        params = []
    else:
        sql = f"SELECT * FROM {_table()} WHERE status = @status ORDER BY type, name"
        params = [bigquery.ScalarQueryParameter("status", "STRING", status)]

    try:
        rows = _run_select(sql, params)
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
    # Busca metadados da conta
    acc_rows = _run_select(
        f"SELECT id, name, type, balance_inicial, data_inicio FROM {_table()} WHERE id = @id LIMIT 1",
        [bigquery.ScalarQueryParameter("id", "STRING", account_id)],
    )
    if not acc_rows:
        return {"status": "error", "message": f"Conta não encontrada: {account_id}"}

    acc = acc_rows[0]

    # Soma receitas e despesas de todas as transações não deletadas desta conta
    totals = _run_select(
        f"""
        SELECT
          COALESCE(SUM(CASE WHEN tipo = 'Receita' THEN valor ELSE 0 END), 0) AS receitas,
          COALESCE(SUM(CASE WHEN tipo = 'Despesa' THEN valor ELSE 0 END), 0) AS despesas
        FROM {_table("transactions")}
        WHERE account_id = @account_id AND deleted = FALSE
        """,
        [bigquery.ScalarQueryParameter("account_id", "STRING", account_id)],
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
