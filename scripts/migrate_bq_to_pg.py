# scripts/migrate_bq_to_pg.py
"""Script one-time para migrar dados do BigQuery para o PostgreSQL.

Lê cada tabela do BigQuery (datasets nami_finance_agent e frieren_books_agent)
e insere no PostgreSQL usando INSERT ON CONFLICT DO NOTHING para ser idempotente
(pode ser rodado mais de uma vez sem duplicar dados).

PRÉ-REQUISITO: Rodar setup_schemas.py antes para criar as tabelas.

Usage:
    DATABASE_URL=... GCP_PROJECT_ID=... GCP_CREDENTIALS_JSON=... python scripts/migrate_bq_to_pg.py
"""

import json
import os
import sys

import psycopg2
import psycopg2.extras
from google.cloud import bigquery
from google.oauth2 import service_account

# Adiciona o root do projeto ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from agents.db import get_conn  # noqa: E402


# ── Configuração ────────────────────────────────────────────────────────────

GCP_PROJECT = os.environ["GCP_PROJECT_ID"]

# Dataset IDs no BigQuery
NAMI_DATASET = "nami_finance_agent"
FRIEREN_DATASET = "frieren_books_agent"

# Tabelas a migrar: (dataset_bq, tabela_bq, tabela_pg)
# IMPORTANTE: a ordem importa por causa de FKs:
# - accounts deve vir antes de credit_cards (FK account_id)
# - books deve vir antes de reading_logs (FK book_id)
TABLES = [
    (NAMI_DATASET,    "accounts",           "accounts"),
    (NAMI_DATASET,    "credit_cards",       "credit_cards"),
    (NAMI_DATASET,    "transactions",       "transactions"),
    (NAMI_DATASET,    "subscriptions",      "subscriptions"),
    (NAMI_DATASET,    "installment_groups", "installment_groups"),
    (NAMI_DATASET,    "loans",              "loans"),
    (NAMI_DATASET,    "budgets",            "budgets"),
    (FRIEREN_DATASET, "books",              "books"),
    (FRIEREN_DATASET, "reading_logs",       "reading_logs"),
]


# ── Cliente BigQuery ─────────────────────────────────────────────────────────

def _bq_client() -> bigquery.Client:
    """Cria cliente BigQuery usando credenciais da env var GCP_CREDENTIALS_JSON.

    Returns:
        Cliente BigQuery autenticado.
    """
    creds_json = os.environ.get("GCP_CREDENTIALS_JSON", "")
    if creds_json:
        info = json.loads(creds_json)
        creds = service_account.Credentials.from_service_account_info(
            info,
            # bigquery.readonly não permite criar jobs de query — precisa do escopo completo
            scopes=["https://www.googleapis.com/auth/bigquery"],
        )
        return bigquery.Client(project=GCP_PROJECT, credentials=creds)
    # Fallback para Application Default Credentials (gcloud auth)
    return bigquery.Client(project=GCP_PROJECT)


# ── Migração ─────────────────────────────────────────────────────────────────

def migrate_table(
    bq: bigquery.Client,
    dataset: str,
    bq_table: str,
    pg_table: str,
) -> None:
    """Migra uma tabela do BigQuery para o PostgreSQL.

    Usa INSERT ON CONFLICT DO NOTHING para ser idempotente — pode ser rodado
    mais de uma vez sem duplicar dados. A idempotência depende da coluna 'id'
    existir como PRIMARY KEY no PostgreSQL.

    Args:
        bq: Cliente BigQuery autenticado.
        dataset: Nome do dataset no BigQuery (ex: 'nami_finance_agent').
        bq_table: Nome da tabela no BigQuery (ex: 'transactions').
        pg_table: Nome da tabela no PostgreSQL (ex: 'transactions').
    """
    print(f"\n→ Migrando {dataset}.{bq_table} → pg:{pg_table}")

    # Lê todos os registros do BigQuery
    sql = f"SELECT * FROM `{GCP_PROJECT}.{dataset}.{bq_table}`"
    rows = list(bq.query(sql).result())

    if not rows:
        print("  ⚠ Tabela vazia, pulando.")
        return

    # Descobre as colunas a partir do primeiro resultado
    columns = list(rows[0].keys())
    print(f"  {len(rows)} linhas | colunas: {columns}")

    # Monta o INSERT com ON CONFLICT DO NOTHING (idempotente)
    col_list = ", ".join(columns)
    placeholders = ", ".join(f"%({c})s" for c in columns)
    insert_sql = (
        f"INSERT INTO {pg_table} ({col_list}) "
        f"VALUES ({placeholders}) "
        f"ON CONFLICT (id) DO NOTHING"
    )

    # Converte cada Row BigQuery em dict Python
    # psycopg2 sabe converter: date, datetime, Decimal, bool, None automaticamente
    data = [dict(row) for row in rows]

    # Insere em lotes de 500 para não explodir memória em tabelas grandes
    batch_size = 500
    inserted = 0
    with get_conn() as conn:
        with conn.cursor() as cur:
            for i in range(0, len(data), batch_size):
                batch = data[i : i + batch_size]
                psycopg2.extras.execute_batch(cur, insert_sql, batch)
                inserted += len(batch)
                print(f"  Lote {i // batch_size + 1}: {inserted}/{len(data)} inseridos")

    print(f"  ✓ {pg_table}: {inserted} linhas processadas")


def main() -> None:
    """Executa a migração completa de todas as tabelas."""
    bq = _bq_client()
    print("Cliente BigQuery conectado.")
    print(f"Projeto: {GCP_PROJECT}\n")

    for dataset, bq_table, pg_table in TABLES:
        migrate_table(bq, dataset, bq_table, pg_table)

    print("\n✅ Migração concluída!")


if __name__ == "__main__":
    main()
