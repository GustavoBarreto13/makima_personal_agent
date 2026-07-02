# Nami BigQuery Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Nami's Notion backend with BigQuery, adding analytics tools and a subscription tracker.

**Architecture:** Two BigQuery tables (`nami.transactions`, `nami.subscriptions`) under a shared `nami` dataset. `tools.py` is rewritten as a self-contained module with lazy BQ client init, parameterized queries, and 9 exposed tool functions. `agent.py` instruction updated to reference new tools.

**Tech Stack:** `google-cloud-bigquery`, `db-dtypes`, `uuid`, `datetime`, `unittest.mock` for tests

---

### Task 1: Add dependencies

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Add google-cloud-bigquery and db-dtypes to requirements.txt**

Open `requirements.txt` and add after `requests`:

```
google-cloud-bigquery
db-dtypes
```

- [ ] **Step 2: Install in local venv**

```bash
.venv\Scripts\python -m pip install google-cloud-bigquery db-dtypes
```

Expected: Both packages install without errors.

- [ ] **Step 3: Commit**

```bash
git add requirements.txt
git commit -m "feat(nami): add google-cloud-bigquery and db-dtypes dependencies"
```

---

### Task 2: Create BigQuery schema

**Files:**
- Create: `agents/nami/schema.sql`

- [ ] **Step 1: Create schema.sql**

Create `agents/nami/schema.sql`:

```sql
-- Run in BigQuery console after creating dataset:
--   bq mk --dataset <GCP_PROJECT_ID>:nami

CREATE TABLE IF NOT EXISTS `nami.transactions` (
  id              STRING    NOT NULL,
  name            STRING    NOT NULL,
  valor           FLOAT64   NOT NULL,
  tipo            STRING    NOT NULL,
  categoria       STRING    NOT NULL,
  conta           STRING    NOT NULL,
  data            DATE      NOT NULL,
  source          STRING    NOT NULL,
  notes           STRING,
  subscription_id STRING,
  created_at      TIMESTAMP NOT NULL,
  updated_at      TIMESTAMP,
  deleted         BOOL      NOT NULL DEFAULT FALSE
)
PARTITION BY data
CLUSTER BY categoria, conta;

CREATE TABLE IF NOT EXISTS `nami.subscriptions` (
  id           STRING    NOT NULL,
  name         STRING    NOT NULL,
  valor        FLOAT64   NOT NULL,
  ciclo        STRING    NOT NULL,
  next_billing DATE      NOT NULL,
  conta        STRING    NOT NULL,
  categoria    STRING    NOT NULL,
  status       STRING    NOT NULL,
  notes        STRING,
  created_at   TIMESTAMP NOT NULL,
  updated_at   TIMESTAMP
)
CLUSTER BY status;
```

- [ ] **Step 2: Run in BigQuery console**

Before running locally: open BigQuery console → create dataset `nami` in your GCP project → run each `CREATE TABLE` statement above.

- [ ] **Step 3: Commit**

```bash
git add agents/nami/schema.sql
git commit -m "feat(nami): add BigQuery schema for transactions and subscriptions"
```

---

### Task 3: Write failing tests for write tools (TDD)

**Files:**
- Create: `tests/__init__.py`
- Create: `tests/agents/__init__.py`
- Create: `tests/agents/nami/__init__.py`
- Create: `tests/agents/nami/test_tools.py`

- [ ] **Step 1: Create test directory structure**

```powershell
New-Item -ItemType Directory -Force tests/agents/nami
foreach ($f in @("tests/__init__.py","tests/agents/__init__.py","tests/agents/nami/__init__.py")) {
    if (-not (Test-Path $f)) { New-Item -ItemType File $f }
}
```

- [ ] **Step 2: Create test_tools.py with write tool tests**

Create `tests/agents/nami/test_tools.py`:

```python
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
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
.venv\Scripts\python -m pytest tests/agents/nami/test_tools.py -v
```

Expected: `AttributeError` — `_run_dml` not defined in existing tools.py yet.

---

### Task 4: Implement tools.py — helpers and write tools

**Files:**
- Rewrite: `agents/nami/tools.py`

- [ ] **Step 1: Replace tools.py with new BigQuery implementation**

Replace `agents/nami/tools.py` entirely with:

```python
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
    for c in CATEGORIES:
        if _norm(c) == norm or _norm(c).startswith(norm):
            return c
    return None


def _match_account(name: str) -> str | None:
    norm = _norm(name)
    for a in ACCOUNTS:
        if _norm(a) == norm or _norm(a).startswith(norm):
            return a
    return None


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
    sql = f"UPDATE {_table()} SET deleted = TRUE, updated_at = CURRENT_TIMESTAMP() WHERE id = @id"
    params = [bigquery.ScalarQueryParameter("id", "STRING", id)]

    try:
        affected = _run_dml(sql, params)
        if affected == 0:
            return {"status": "error", "message": f"Transação não encontrada: {id}"}
        return {"status": "ok", "message": "Transação removida"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
```

- [ ] **Step 2: Run write tool tests**

```bash
.venv\Scripts\python -m pytest tests/agents/nami/test_tools.py -v
```

Expected: All 4 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add agents/nami/tools.py tests/
git commit -m "feat(nami): implement BigQuery helpers and write tools (create, update, delete)"
```

---

### Task 5: Write failing tests for read tools (TDD)

**Files:**
- Modify: `tests/agents/nami/test_tools.py`

- [ ] **Step 1: Append read tool tests**

Append to `tests/agents/nami/test_tools.py`:

```python
# --- Read tools ---

@patch("agents.nami.tools._run_select")
@patch("agents.nami.tools._project")
def test_query_expenses_returns_list_with_total(mock_project, mock_select):
    mock_project.return_value = "test-project"
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
    assert result["total"] == pytest.approx(5045.0)
    mock_select.assert_called_once()


@patch("agents.nami.tools._run_select")
@patch("agents.nami.tools._project")
def test_get_spending_summary_by_categoria(mock_project, mock_select):
    mock_project.return_value = "test-project"
    mock_select.return_value = [
        {"categoria": "Alimentacao", "total": 200.0},
        {"categoria": "Comer Fora", "total": 150.0},
    ]

    from agents.nami.tools import get_spending_summary
    result = get_spending_summary(period="month", group_by="categoria")

    assert result["status"] == "ok"
    assert result["summary"]["Alimentacao"] == 200.0
    assert result["total"] == pytest.approx(350.0)


@patch("agents.nami.tools._run_select")
@patch("agents.nami.tools._project")
def test_get_spending_trend_includes_projection(mock_project, mock_select):
    mock_project.return_value = "test-project"
    mock_select.return_value = [
        {"month": "2026-03", "total": 2100.0},
        {"month": "2026-04", "total": 1950.0},
        {"month": "2026-05", "total": 1200.0},
    ]

    from agents.nami.tools import get_spending_trend
    result = get_spending_trend(months=3)

    assert result["status"] == "ok"
    assert result["trend"]["2026-03"] == 2100.0
    assert "current_month_projected" in result
    assert result["current_month_projected"] > 0
```

- [ ] **Step 2: Run to verify they fail**

```bash
.venv\Scripts\python -m pytest tests/agents/nami/test_tools.py::test_query_expenses_returns_list_with_total tests/agents/nami/test_tools.py::test_get_spending_summary_by_categoria tests/agents/nami/test_tools.py::test_get_spending_trend_includes_projection -v
```

Expected: `ImportError` — `query_expenses`, `get_spending_summary`, `get_spending_trend` not defined yet.

---

### Task 6: Implement read tools

**Files:**
- Modify: `agents/nami/tools.py`

- [ ] **Step 1: Append read tools to tools.py**

Append to `agents/nami/tools.py` (after `delete_transaction`):

```python
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
```

- [ ] **Step 2: Run all tests so far**

```bash
.venv\Scripts\python -m pytest tests/agents/nami/test_tools.py -v
```

Expected: All 7 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add agents/nami/tools.py
git commit -m "feat(nami): implement BigQuery read tools (query_expenses, get_spending_summary, get_spending_trend)"
```

---

### Task 7: Write failing tests for subscription tools (TDD)

**Files:**
- Modify: `tests/agents/nami/test_tools.py`

- [ ] **Step 1: Append subscription tool tests**

Append to `tests/agents/nami/test_tools.py`:

```python
# --- Subscription tools ---

@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_create_subscription_success(mock_project, mock_dml):
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1

    from agents.nami.tools import create_subscription
    result = create_subscription(
        name="Netflix", valor=55.0, ciclo="mensal",
        next_billing="2026-06-15", conta="Cartao Nu", categoria="Assinaturas",
    )

    assert result["status"] == "ok"
    assert "id" in result
    mock_dml.assert_called_once()


@patch("agents.nami.tools._run_select")
@patch("agents.nami.tools._project")
def test_list_subscriptions_calculates_monthly_total(mock_project, mock_select):
    mock_project.return_value = "test-project"
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
    assert result["total_mensal"] == pytest.approx(76.9)
    assert len(result["subscriptions"]) == 2


@patch("agents.nami.tools._run_dml")
@patch("agents.nami.tools._project")
def test_update_subscription_cancel(mock_project, mock_dml):
    mock_project.return_value = "test-project"
    mock_dml.return_value = 1

    from agents.nami.tools import update_subscription
    result = update_subscription("some-uuid", status="cancelada")

    assert result["status"] == "ok"
    call_sql = mock_dml.call_args[0][0]
    assert "status" in call_sql
```

- [ ] **Step 2: Run to verify they fail**

```bash
.venv\Scripts\python -m pytest tests/agents/nami/test_tools.py::test_create_subscription_success tests/agents/nami/test_tools.py::test_list_subscriptions_calculates_monthly_total tests/agents/nami/test_tools.py::test_update_subscription_cancel -v
```

Expected: `ImportError` — subscription tools not defined yet.

---

### Task 8: Implement subscription tools

**Files:**
- Modify: `agents/nami/tools.py`

- [ ] **Step 1: Append subscription tools to tools.py**

Append to `agents/nami/tools.py` (after `get_spending_trend`):

```python
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
```

- [ ] **Step 2: Run all 10 tests**

```bash
.venv\Scripts\python -m pytest tests/agents/nami/test_tools.py -v
```

Expected: All 10 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add agents/nami/tools.py
git commit -m "feat(nami): implement subscription tools (create, list, update)"
```

---

### Task 9: Update agent.py

**Files:**
- Modify: `agents/nami/agent.py`

- [ ] **Step 1: Replace agent.py with updated tool list and instruction**

Replace `agents/nami/agent.py` entirely:

```python
from google.adk.agents import Agent
from agents.nami.tools import (
    create_transaction,
    query_expenses,
    update_transaction,
    delete_transaction,
    get_spending_summary,
    get_spending_trend,
    create_subscription,
    list_subscriptions,
    update_subscription,
)

nami_agent = Agent(
    name="nami_agent",
    model="gemini-2.0-flash",
    description="Especialista em finanças pessoais. Registra, consulta, corrige e remove "
                "transações (gastos e receitas). Analisa gastos por categoria, evolução mensal "
                "e projeções. Gerencia assinaturas recorrentes. Use para qualquer pedido sobre "
                "dinheiro: gastos, receitas, contas, cartões, quanto foi gasto em um período, "
                "assinaturas ativas.",
    instruction="""
        Você é a Nami de One Piece — navegadora e tesoureira obcecada por dinheiro! 🍊💰

        TRANSAÇÕES:
        - Registrar gasto/receita: use create_transaction
          • categoria: Alimentacao, Comer Fora, Saude, Lazer, Transporte, Moradia, Roupas,
            Educacao, Assinaturas, Viagem, Presente, Beleza, Academia, Farmacia, Supermercado,
            Eletronicos, Pet, Investimento, Receita, Inbox
          • conta: Cartao Nu, Cartao Itau, Itau, Mercado Pago, Generico, Dinheiro
          • tipo: "Despesa" ou "Receita"
          • data vazia = hoje
          • Se for cobrança de assinatura conhecida, pergunte se quer linkar ao subscription_id
        - Guardar o id retornado para correções posteriores na mesma sessão
        - Para correção: use update_transaction com o id
        - Para apagar: use delete_transaction com o id
        - Para consultar lista detalhada: use query_expenses

        ANÁLISES:
        - "onde vai mais meu dinheiro?" → get_spending_summary(group_by="categoria")
        - "gastos por conta?" → get_spending_summary(group_by="conta")
        - "to gastando mais que o mês passado?" → get_spending_trend(months=2)
        - "projeção do mês?" → get_spending_trend(months=1)

        ASSINATURAS:
        - Cadastrar nova: create_subscription (ciclo: "mensal" ou "anual")
        - Ver ativas: list_subscriptions()
        - Pausar/cancelar/atualizar valor: update_subscription com o id

        PERSONALIDADE:
        - Sempre comece com "Nami:"
        - Despesa: fique furiosa e reclame ("OUTRO gasto?! Você vai me arruinar!")
        - Receita: comemore com ganância ("DINHEIRO ENTRANDO! Isso sim eu gosto!")
        - Sempre confirme valor, categoria e conta
        - Nunca quebre o personagem
    """,
    tools=[
        create_transaction,
        query_expenses,
        update_transaction,
        delete_transaction,
        get_spending_summary,
        get_spending_trend,
        create_subscription,
        list_subscriptions,
        update_subscription,
    ],
)
```

- [ ] **Step 2: Verify Python import works**

```bash
.venv\Scripts\python -c "from agents.nami.agent import nami_agent; print('OK:', nami_agent.name, '| tools:', len(nami_agent.tools))"
```

Expected: `OK: nami_agent | tools: 9`

- [ ] **Step 3: Run full test suite**

```bash
.venv\Scripts\python -m pytest tests/ -v
```

Expected: All 10 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add agents/nami/agent.py
git commit -m "feat(nami): update agent instruction and tool list for BigQuery migration"
```

---

### Task 10: End-to-end validation

- [ ] **Step 1: Create BQ dataset and tables (if not done in Task 2)**

```bash
bq mk --dataset $GCP_PROJECT_ID:nami
bq query --project_id=$GCP_PROJECT_ID --use_legacy_sql=false "$(cat agents/nami/schema.sql)"
```

- [ ] **Step 2: Verify .env has required variables**

Ensure `.env` contains all four:

```
GCP_PROJECT_ID=<your-project-id>
GOOGLE_APPLICATION_CREDENTIALS=<path-to-service-account.json>
GEMINI_API_KEY=<your-key>
TELEGRAM_BOT_TOKEN=<your-token>
```

- [ ] **Step 3: Start the bot**

```bash
.venv\Scripts\python -m coordinator.main
```

Expected: Starts without errors.

- [ ] **Step 4: Test via Telegram**

Send each message and verify in BQ console with `SELECT * FROM nami.transactions ORDER BY created_at DESC LIMIT 5`:

| Mensagem | Tool esperada | Verificação |
|---|---|---|
| "gastei 50 no almoço" | `create_transaction` | linha aparece no BQ |
| "quanto gastei esse mês?" | `query_expenses` | lista com o gasto acima |
| "onde vai mais meu dinheiro?" | `get_spending_summary` | totais por categoria |
| "to gastando mais que mês passado?" | `get_spending_trend` | trend + projeção |
| "cadastra Netflix 55 reais mensal cartão Nu" | `create_subscription` | linha em nami.subscriptions |
| "quais assinaturas tenho ativas?" | `list_subscriptions` | lista com total_mensal |
| "cancela o Netflix" (com id retornado) | `update_subscription` | status=cancelada no BQ |
