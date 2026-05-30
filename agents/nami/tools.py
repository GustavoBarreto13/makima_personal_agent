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
    return f"`{_project()}.nami_finance_agent.{name}`"


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


def query_expenses(start_date: str = "", end_date: str = "") -> dict:
    start = start_date or _month_start()
    end = end_date or _today()

    sql = f"""
        SELECT id, name, valor, tipo, categoria, conta,
               CAST(data AS STRING) AS data, source, notes, subscription_id
        FROM {_table()}
        WHERE data BETWEEN @start AND @end
          AND deleted = FALSE
        ORDER BY data DESC
    """
    params = [
        bigquery.ScalarQueryParameter("start", "DATE", start),
        bigquery.ScalarQueryParameter("end", "DATE", end),
    ]

    try:
        rows = _run_select(sql, params)
        total = sum(r["valor"] for r in rows)
        return {"status": "ok", "transactions": rows, "count": len(rows), "total": total}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def get_spending_summary(period: str = "month", group_by: str = "categoria") -> dict:
    import calendar
    from datetime import timedelta

    if group_by not in ("categoria", "conta", "tipo"):
        return {"status": "error", "message": "group_by deve ser 'categoria', 'conta' ou 'tipo'"}

    today = date.today()
    if period == "month":
        start = today.replace(day=1).strftime("%Y-%m-%d")
        end = today.strftime("%Y-%m-%d")
    elif period == "week":
        start = (today - timedelta(days=today.weekday())).strftime("%Y-%m-%d")
        end = today.strftime("%Y-%m-%d")
    elif period == "year":
        start = today.replace(month=1, day=1).strftime("%Y-%m-%d")
        end = today.strftime("%Y-%m-%d")
    elif len(period) == 7 and period[4] == "-":
        year, month = int(period[:4]), int(period[5:])
        last_day = calendar.monthrange(year, month)[1]
        start = f"{period}-01"
        end = f"{period}-{last_day:02d}"
    else:
        return {"status": "error", "message": "period inválido. Use 'month', 'week', 'year' ou 'YYYY-MM'"}

    sql = f"""
        SELECT {group_by}, SUM(valor) AS total
        FROM {_table()}
        WHERE data BETWEEN @start AND @end
          AND deleted = FALSE
        GROUP BY {group_by}
        ORDER BY total DESC
    """
    params = [
        bigquery.ScalarQueryParameter("start", "DATE", start),
        bigquery.ScalarQueryParameter("end", "DATE", end),
    ]

    try:
        rows = _run_select(sql, params)
        summary = {r[group_by]: r["total"] for r in rows}
        return {
            "status": "ok",
            "summary": summary,
            "total": sum(summary.values()),
            "period": period,
            "group_by": group_by,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def get_spending_trend(months: int = 3) -> dict:
    import calendar
    from datetime import timedelta

    today = date.today()
    start = today.replace(day=1)
    for _ in range(months):
        start = (start - timedelta(days=1)).replace(day=1)

    sql = f"""
        SELECT FORMAT_DATE('%Y-%m', data) AS month, SUM(valor) AS total
        FROM {_table()}
        WHERE data BETWEEN @start AND @end
          AND deleted = FALSE
        GROUP BY month
        ORDER BY month
    """
    params = [
        bigquery.ScalarQueryParameter("start", "DATE", start.strftime("%Y-%m-%d")),
        bigquery.ScalarQueryParameter("end", "DATE", today.strftime("%Y-%m-%d")),
    ]

    try:
        rows = _run_select(sql, params)
        trend = {r["month"]: r["total"] for r in rows}

        current_month = today.strftime("%Y-%m")
        current_spend = trend.get(current_month, 0.0)
        days_in_month = calendar.monthrange(today.year, today.month)[1]
        projected = round(current_spend / today.day * days_in_month, 2) if today.day > 0 else 0.0

        return {"status": "ok", "trend": trend, "current_month_projected": projected}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def create_subscription(
    name: str,
    valor: float,
    ciclo: str,
    next_billing: str,
    conta: str,
    categoria: str,
    notes: str = "",
) -> dict:
    if ciclo not in ("mensal", "anual"):
        return {"status": "error", "message": "ciclo deve ser 'mensal' ou 'anual'"}
    acc = _match_account(conta)
    if acc is None:
        return {"status": "error", "message": f"Conta inválida: '{conta}'. Opções: {', '.join(ACCOUNTS)}"}
    cat = _match_category(categoria)
    if cat is None:
        return {"status": "error", "message": f"Categoria inválida: '{categoria}'"}

    sub_id = str(uuid.uuid4())
    sql = f"""
        INSERT INTO {_table("subscriptions")} (id, name, valor, ciclo, next_billing, conta, categoria, status, notes, created_at)
        VALUES (@id, @name, @valor, @ciclo, @next_billing, @conta, @categoria, 'ativa', @notes, CURRENT_TIMESTAMP())
    """
    params = [
        bigquery.ScalarQueryParameter("id", "STRING", sub_id),
        bigquery.ScalarQueryParameter("name", "STRING", name),
        bigquery.ScalarQueryParameter("valor", "FLOAT64", float(valor)),
        bigquery.ScalarQueryParameter("ciclo", "STRING", ciclo),
        bigquery.ScalarQueryParameter("next_billing", "DATE", next_billing),
        bigquery.ScalarQueryParameter("conta", "STRING", acc),
        bigquery.ScalarQueryParameter("categoria", "STRING", cat),
        bigquery.ScalarQueryParameter("notes", "STRING", notes or None),
    ]

    try:
        _run_dml(sql, params)
        return {"status": "ok", "id": sub_id, "message": f"Assinatura criada: {name} R${float(valor):.2f}/{ciclo}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def list_subscriptions(status: str = "ativa") -> dict:
    sql = f"""
        SELECT id, name, valor, ciclo, CAST(next_billing AS STRING) AS next_billing,
               conta, categoria, status, notes
        FROM {_table("subscriptions")}
        WHERE status = @status
        ORDER BY next_billing
    """
    params = [bigquery.ScalarQueryParameter("status", "STRING", status)]

    try:
        rows = _run_select(sql, params)
        total_mensal = sum(
            r["valor"] if r["ciclo"] == "mensal" else r["valor"] / 12
            for r in rows
        )
        return {"status": "ok", "subscriptions": rows, "total_mensal": round(total_mensal, 2)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def update_subscription(
    id: str,
    name: str = "",
    valor: float = None,
    ciclo: str = "",
    next_billing: str = "",
    conta: str = "",
    status: str = "",
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
    if ciclo:
        if ciclo not in ("mensal", "anual"):
            return {"status": "error", "message": "ciclo deve ser 'mensal' ou 'anual'"}
        sets.append("ciclo = @ciclo")
        params.append(bigquery.ScalarQueryParameter("ciclo", "STRING", ciclo))
    if next_billing:
        sets.append("next_billing = @next_billing")
        params.append(bigquery.ScalarQueryParameter("next_billing", "DATE", next_billing))
    if conta:
        acc = _match_account(conta)
        if acc is None:
            return {"status": "error", "message": f"Conta inválida: '{conta}'"}
        sets.append("conta = @conta")
        params.append(bigquery.ScalarQueryParameter("conta", "STRING", acc))
    if status:
        if status not in ("ativa", "pausada", "cancelada"):
            return {"status": "error", "message": "status deve ser 'ativa', 'pausada' ou 'cancelada'"}
        sets.append("status = @status")
        params.append(bigquery.ScalarQueryParameter("status", "STRING", status))
    if notes:
        sets.append("notes = @notes")
        params.append(bigquery.ScalarQueryParameter("notes", "STRING", notes))

    if len(sets) == 1:
        return {"status": "error", "message": "Nenhum campo para atualizar"}

    sql = f"UPDATE {_table('subscriptions')} SET {', '.join(sets)} WHERE id = @id"

    try:
        affected = _run_dml(sql, params)
        if affected == 0:
            return {"status": "error", "message": f"Assinatura não encontrada: {id}"}
        return {"status": "ok", "message": "Assinatura atualizada"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
