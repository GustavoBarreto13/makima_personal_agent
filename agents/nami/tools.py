import os
import uuid
from datetime import date
from zoneinfo import ZoneInfo

from google.cloud import bigquery

_TZ = ZoneInfo("America/Sao_Paulo")

CATEGORIES = [
    "Alimentacao", "Comer Fora", "Saude", "Lazer", "Transporte",
    "Moradia", "Roupas", "Educacao", "Assinaturas", "Viagem",
    "Presente", "Beleza", "Academia", "Farmacia", "Supermercado",
    "Eletronicos", "Pet", "Investimento", "Receita", "Inbox",
]

ACCOUNTS = ["Cartao Nu", "Cartao Itau", "Itau", "Mercado Pago", "Generico", "Dinheiro"]

_bq_client = None


def _client() -> bigquery.Client:
    global _bq_client
    if _bq_client is None:
        _bq_client = bigquery.Client(project=_project())
    return _bq_client


def _project() -> str:
    p = os.environ.get("GCP_PROJECT_ID", "")
    if not p:
        raise EnvironmentError("GCP_PROJECT_ID not set")
    return p


def _table(name: str = "transactions") -> str:
    return f"`{_project()}.nami.{name}`"


def _norm(s: str) -> str:
    import unicodedata
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()


def _run_select(sql: str, params: list = None) -> list[dict]:
    job_config = bigquery.QueryJobConfig(query_parameters=params or [])
    result = _client().query(sql, job_config=job_config).result()
    return [dict(row) for row in result]


def _run_dml(sql: str, params: list = None) -> int:
    job_config = bigquery.QueryJobConfig(query_parameters=params or [])
    job = _client().query(sql, job_config=job_config)
    job.result()
    return job.num_dml_affected_rows or 0


def _today() -> str:
    return date.today().strftime("%Y-%m-%d")


def _month_start() -> str:
    return date.today().replace(day=1).strftime("%Y-%m-%d")


def _match_category(name: str) -> str | None:
    norm = _norm(name)
    matches = [c for c in CATEGORIES if _norm(c) == norm or _norm(c).startswith(norm)]
    return matches[0] if len(matches) == 1 else None


def _match_account(name: str) -> str | None:
    norm = _norm(name)
    matches = [a for a in ACCOUNTS if _norm(a) == norm or _norm(a).startswith(norm)]
    return matches[0] if len(matches) == 1 else None


def create_transaction(
    name: str,
    valor: float,
    tipo: str,
    categoria: str,
    conta: str = "Generico",
    data: str = "",
    notes: str = "",
    subscription_id: str = "",
) -> dict:
    cat = _match_category(categoria)
    if cat is None:
        return {"status": "error", "message": f"Categoria inválida: '{categoria}'. Opções: {', '.join(CATEGORIES)}"}
    acc = _match_account(conta)
    if acc is None:
        return {"status": "error", "message": f"Conta inválida: '{conta}'. Opções: {', '.join(ACCOUNTS)}"}
    if tipo not in ("Despesa", "Receita"):
        return {"status": "error", "message": "tipo deve ser 'Despesa' ou 'Receita'"}

    tx_id = str(uuid.uuid4())
    tx_date = data or _today()

    sql = f"""
        INSERT INTO {_table()} (id, name, valor, tipo, categoria, conta, data, source, notes, subscription_id, created_at, deleted)
        VALUES (@id, @name, @valor, @tipo, @categoria, @conta, @data, @source, @notes, @subscription_id, CURRENT_TIMESTAMP(), FALSE)
    """
    params = [
        bigquery.ScalarQueryParameter("id", "STRING", tx_id),
        bigquery.ScalarQueryParameter("name", "STRING", name),
        bigquery.ScalarQueryParameter("valor", "FLOAT64", float(valor)),
        bigquery.ScalarQueryParameter("tipo", "STRING", tipo),
        bigquery.ScalarQueryParameter("categoria", "STRING", cat),
        bigquery.ScalarQueryParameter("conta", "STRING", acc),
        bigquery.ScalarQueryParameter("data", "DATE", tx_date),
        bigquery.ScalarQueryParameter("source", "STRING", "telegram"),
        bigquery.ScalarQueryParameter("notes", "STRING", notes or None),
        bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id or None),
    ]

    try:
        _run_dml(sql, params)
        return {"status": "ok", "id": tx_id, "message": f"Transação criada: {name} R${float(valor):.2f} ({cat})"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def update_transaction(
    id: str,
    name: str = "",
    valor: float = None,
    tipo: str = "",
    categoria: str = "",
    conta: str = "",
    data: str = "",
    notes: str = "",
) -> dict:
    sets = ["updated_at = CURRENT_TIMESTAMP()"]
    params = [bigquery.ScalarQueryParameter("id", "STRING", id)]

    if name:
        sets.append("name = @name")
        params.append(bigquery.ScalarQueryParameter("name", "STRING", name))
    if valor is not None:
        sets.append("valor = @valor")
        params.append(bigquery.ScalarQueryParameter("valor", "FLOAT64", float(valor)))
    if tipo:
        if tipo not in ("Despesa", "Receita"):
            return {"status": "error", "message": "tipo deve ser 'Despesa' ou 'Receita'"}
        sets.append("tipo = @tipo")
        params.append(bigquery.ScalarQueryParameter("tipo", "STRING", tipo))
    if categoria:
        cat = _match_category(categoria)
        if cat is None:
            return {"status": "error", "message": f"Categoria inválida: '{categoria}'"}
        sets.append("categoria = @categoria")
        params.append(bigquery.ScalarQueryParameter("categoria", "STRING", cat))
    if conta:
        acc = _match_account(conta)
        if acc is None:
            return {"status": "error", "message": f"Conta inválida: '{conta}'"}
        sets.append("conta = @conta")
        params.append(bigquery.ScalarQueryParameter("conta", "STRING", acc))
    if data:
        sets.append("data = @data")
        params.append(bigquery.ScalarQueryParameter("data", "DATE", data))
    if notes:
        sets.append("notes = @notes")
        params.append(bigquery.ScalarQueryParameter("notes", "STRING", notes))

    if len(sets) == 1:
        return {"status": "error", "message": "Nenhum campo para atualizar"}

    sql = f"UPDATE {_table()} SET {', '.join(sets)} WHERE id = @id AND deleted = FALSE"

    try:
        affected = _run_dml(sql, params)
        if affected == 0:
            return {"status": "error", "message": f"Transação não encontrada: {id}"}
        return {"status": "ok", "message": "Transação atualizada"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def delete_transaction(id: str) -> dict:
    sql = f"UPDATE {_table()} SET deleted = TRUE, updated_at = CURRENT_TIMESTAMP() WHERE id = @id AND deleted = FALSE"
    params = [bigquery.ScalarQueryParameter("id", "STRING", id)]

    try:
        affected = _run_dml(sql, params)
        if affected == 0:
            return {"status": "error", "message": f"Transação não encontrada: {id}"}
        return {"status": "ok", "message": "Transação removida"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
