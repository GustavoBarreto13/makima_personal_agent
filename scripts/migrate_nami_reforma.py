"""Script de migração do banco para a reforma da Nami (spec 040).

Adiciona colunas novas às tabelas existentes da Nami. Idempotente:
usa ADD COLUMN IF NOT EXISTS — seguro para re-executar.

As migrações são acumuladas aqui conforme as fases da reforma avançam
(Fase A: account_id/card_id em subscriptions; Fases G/H adicionam as suas).

Usage:
    # Rodar dentro do container makima-web (hostname PostgreSQL é resolvível lá):
    docker cp scripts/migrate_nami_reforma.py makima-web:/app/scripts/migrate_nami_reforma.py
    docker exec makima-web sh -c "cd /app && python -m scripts.migrate_nami_reforma"

    # Ou localmente se DATABASE_URL apontar para o servidor correto:
    python -m scripts.migrate_nami_reforma
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
    # ── Fase A (A6): assinaturas passam a gravar o pagador com FK real ─────────
    # Mesma regra de transactions: account_id e card_id mutuamente exclusivos.
    (
        "subscriptions: adicionar coluna 'account_id'",
        "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS account_id TEXT;",
    ),
    (
        "subscriptions: adicionar coluna 'card_id'",
        "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS card_id TEXT;",
    ),
]


def run() -> None:
    """Executar todas as migrações pendentes."""
    print("Conectando ao banco de dados...")

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
