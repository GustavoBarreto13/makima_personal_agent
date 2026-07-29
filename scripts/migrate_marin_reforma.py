"""Script de migração do banco para a reforma da Marin (specs 052–054).

Adiciona colunas novas a tabelas já existentes da Marin. Idempotente:
usa ADD COLUMN IF NOT EXISTS — seguro para re-executar.

Tabelas inteiramente novas (anime_lists/anime_list_items, spec 054) NÃO entram
aqui — já usam CREATE TABLE IF NOT EXISTS em agents/marin/schema_pg.sql e são
aplicadas por `scripts/setup_schemas.py` (mesmo padrão já usado para
shopping_lists/shopping_list_items da Nami, spec 045).

Usage:
    # Rodar dentro do container makima-web (hostname PostgreSQL é resolvível lá):
    docker cp scripts/migrate_marin_reforma.py makima-web:/app/scripts/migrate_marin_reforma.py
    docker exec makima-web sh -c "cd /app && python -m scripts.migrate_marin_reforma"

    # Ou localmente se DATABASE_URL apontar para o servidor correto:
    python -m scripts.migrate_marin_reforma
"""

import os
import sys

import psycopg2  # Driver síncrono de PostgreSQL

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    print("ERRO: variável DATABASE_URL não encontrada no ambiente.", file=sys.stderr)
    sys.exit(1)


# Lista de migrações a executar em ordem. Cada item é (descrição, SQL idempotente).
MIGRATIONS = [
    # ── Spec 053 (sync bidirecional MAL): carimbo da última mutação local ──────
    # Usado pelo pull para decidir quem venceu um conflito de status/nota entre
    # a última mudança local conhecida e o updated_at do list_status no MAL.
    (
        "anime: adicionar coluna 'local_updated_at' (convergência de conflito do sync MAL)",
        "ALTER TABLE anime ADD COLUMN IF NOT EXISTS local_updated_at TIMESTAMPTZ;",
    ),
]


def run() -> None:
    """Executar todas as migrações pendentes."""
    print("Conectando ao banco de dados...")

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False

    try:
        with conn.cursor() as cur:
            for descricao, sql in MIGRATIONS:
                print(f"  → {descricao}...")
                cur.execute(sql)

        conn.commit()
        print(f"\nMigração concluída com sucesso. {len(MIGRATIONS)} operações aplicadas.")

    except Exception as exc:
        conn.rollback()
        print(f"\nERRO durante a migração: {exc}", file=sys.stderr)
        print("Rollback realizado — nenhuma alteração foi persistida.", file=sys.stderr)
        sys.exit(1)

    finally:
        conn.close()


if __name__ == "__main__":
    run()
