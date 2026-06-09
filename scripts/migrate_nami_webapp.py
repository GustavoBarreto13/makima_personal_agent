"""Script de migração do banco para a feature 002-nami-financas.

Adiciona colunas novas às tabelas existentes e cria as tabelas personal_loans
e financings. Idempotente: usa IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

Usage:
    # Rodar dentro do container makima-web (hostname PostgreSQL é resolvível lá):
    docker exec makima-web sh -c "cd /app && python -m scripts.migrate_nami_webapp"

    # Ou localmente se DATABASE_URL apontar para o servidor correto:
    python -m scripts.migrate_nami_webapp
"""

import os
import sys

import psycopg2  # Driver síncrono de PostgreSQL

# Lê a URL de conexão do PostgreSQL do ambiente (mesma usada pelas tools do agente)
DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    print("ERRO: variável DATABASE_URL não encontrada no ambiente.", file=sys.stderr)
    sys.exit(1)


# Lista de migrações a executar em ordem.
# Cada item é uma tupla (descrição, SQL). Todos os SQLs são idempotentes.
MIGRATIONS = [
    # ── accounts: novos campos para cor de acento, sigla e ícone personalizado ──
    (
        "accounts: adicionar coluna 'color'",
        "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS color TEXT;",
    ),
    (
        "accounts: adicionar coluna 'short'",
        "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS short VARCHAR(2);",
    ),
    (
        "accounts: adicionar coluna 'icon_url'",
        "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS icon_url TEXT;",
    ),

    # ── credit_cards: bandeira, últimos 4 dígitos e gradiente do plástico ──────
    (
        "credit_cards: adicionar coluna 'brand'",
        "ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS brand TEXT;",
    ),
    (
        "credit_cards: adicionar coluna 'last4'",
        "ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS last4 VARCHAR(4);",
    ),
    (
        "credit_cards: adicionar coluna 'grad'",
        "ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS grad TEXT;",
    ),

    # ── subscriptions: cor, ícone e dia de cobrança como inteiro (1–28) ────────
    (
        "subscriptions: adicionar coluna 'color'",
        "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS color TEXT;",
    ),
    (
        "subscriptions: adicionar coluna 'icon_url'",
        "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS icon_url TEXT;",
    ),
    (
        "subscriptions: adicionar coluna 'next_billing_day'",
        "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_billing_day INTEGER;",
    ),

    # ── personal_loans: empréstimos pessoa-a-pessoa (entidade nova) ─────────────
    # Completamente separado da tabela `loans` (modelo PRICE/SAC usado pelo bot Telegram).
    (
        "criar tabela personal_loans",
        """
        CREATE TABLE IF NOT EXISTS personal_loans (
            id               TEXT PRIMARY KEY,
            direction        TEXT NOT NULL CHECK (direction IN ('lent', 'borrowed')),
            person_name      TEXT NOT NULL,
            total_amount     NUMERIC(12, 2) NOT NULL,
            installments     INTEGER NOT NULL DEFAULT 1,
            paid_installments INTEGER NOT NULL DEFAULT 0,
            next_due_day     INTEGER CHECK (next_due_day BETWEEN 1 AND 28),
            note             TEXT,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted          BOOLEAN NOT NULL DEFAULT FALSE
        );
        """,
    ),

    # ── financings: financiamentos estruturados (entidade nova) ─────────────────
    # Semanticamente distinto dos empréstimos informais — credor, taxa descritiva.
    (
        "criar tabela financings",
        """
        CREATE TABLE IF NOT EXISTS financings (
            id                TEXT PRIMARY KEY,
            description       TEXT NOT NULL,
            lender            TEXT,
            total_amount      NUMERIC(12, 2) NOT NULL,
            installments      INTEGER NOT NULL DEFAULT 1,
            paid_installments INTEGER NOT NULL DEFAULT 0,
            next_due_day      INTEGER CHECK (next_due_day BETWEEN 1 AND 28),
            interest_rate     TEXT,
            note              TEXT,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted           BOOLEAN NOT NULL DEFAULT FALSE
        );
        """,
    ),
]


def run() -> None:
    """Executar todas as migrações pendentes."""
    print(f"Conectando ao banco de dados...")

    # Abre uma única conexão para executar todas as migrações em sequência
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False  # Transação explícita: ou tudo passa ou tudo falha

    try:
        with conn.cursor() as cur:
            for descricao, sql in MIGRATIONS:
                print(f"  → {descricao}...")
                cur.execute(sql)

        # Confirma todas as alterações juntas — se qualquer uma falhou, o bloco
        # except abaixo faz rollback e nada muda no banco
        conn.commit()
        print(f"\nMigração concluída com sucesso. {len(MIGRATIONS)} operações aplicadas.")

    except Exception as exc:
        # Reverte tudo em caso de erro para não deixar o banco em estado parcial
        conn.rollback()
        print(f"\nERRO durante a migração: {exc}", file=sys.stderr)
        print("Rollback realizado — nenhuma alteração foi persistida.", file=sys.stderr)
        sys.exit(1)

    finally:
        # Fecha a conexão independentemente do resultado
        conn.close()


if __name__ == "__main__":
    run()
