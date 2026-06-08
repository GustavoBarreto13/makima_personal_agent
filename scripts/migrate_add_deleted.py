"""Migração: adiciona coluna deleted nas tabelas subscriptions e loans.

Executa ALTER TABLE idempotente (IF NOT EXISTS) — seguro de rodar múltiplas vezes.

Usage:
    python scripts/migrate_add_deleted.py
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

# Lê a URL do banco das variáveis de ambiente (mesma do coordinator)
DATABASE_URL = os.environ["DATABASE_URL"]

# Lista de ALTER TABLE a executar — todos idempotentes
MIGRATIONS = [
    # Adiciona deleted em subscriptions (necessário para delete_subscription funcionar)
    "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE",
    # Adiciona deleted em loans (necessário para delete_loan funcionar)
    "ALTER TABLE loans ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE",
]


def run() -> None:
    """Executa as migrações e imprime o resultado de cada uma."""
    # Conecta diretamente com psycopg2 (síncrono) — não usa asyncpg
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    cur = conn.cursor()

    for sql in MIGRATIONS:
        print(f"Executando: {sql}")
        cur.execute(sql)
        print("  ✅ OK")

    cur.close()
    conn.close()
    print("\nMigração concluída.")


if __name__ == "__main__":
    run()
