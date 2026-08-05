"""Migrar o contexto de sessões da Akane para locais e acompanhantes.

Usage:
    python -m scripts.migrate_akane_watch_context
"""

from agents.db import get_conn


def main() -> None:
    """Aplicar a migração idempotente exigida pela fase 063.

    A operação pode ser repetida com segurança: cria a tabela de locais, adiciona
    a FK opcional à sessão e amplia a lista de tipos aceitos pela Komi.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS movie_watch_locations (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, normalizado TEXT NOT NULL UNIQUE,
                kind TEXT NOT NULL CHECK (kind IN ('cinema','streaming')),
                created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())""")
            cur.execute(
                "ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS watch_location_id "
                "TEXT REFERENCES movie_watch_locations(id) ON DELETE SET NULL"
            )
            cur.execute("ALTER TABLE person_links DROP CONSTRAINT IF EXISTS person_links_entity_type_check")
            cur.execute("""ALTER TABLE person_links ADD CONSTRAINT person_links_entity_type_check
                CHECK (entity_type IN ('transaction','task','book','journal_bullet','journal_letter','movie_diary_entry'))""")


if __name__ == "__main__":
    main()
