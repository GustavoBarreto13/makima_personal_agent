"""Cria as tabelas shelves e book_shelves no PostgreSQL.

Rodar uma vez no VPS após o deploy:
    python -m scripts.migrate_frieren_shelves

Requer DATABASE_URL no ambiente.
"""
import os
import psycopg2


def run() -> None:
    """Executa a migração de criação das tabelas de estantes.

    Cria as tabelas shelves (estantes de livros) e book_shelves
    (relacionamento N:N entre livros e estantes) de forma idempotente
    usando CREATE TABLE IF NOT EXISTS.

    Raises:
        KeyError: Se DATABASE_URL não estiver definida no ambiente.
    """
    # Conecta ao banco usando a variável de ambiente DATABASE_URL
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = True
    cur = conn.cursor()

    # Tabela de estantes — cada estante tem nome, descrição e cor accent
    cur.execute("""
        CREATE TABLE IF NOT EXISTS shelves (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name        TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            accent      TEXT NOT NULL DEFAULT 'oklch(0.58 0.085 195)',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    # Tabela de relacionamento livro ↔ estante (N:N)
    # ON DELETE CASCADE garante que remover um livro ou estante limpa os vínculos
    cur.execute("""
        CREATE TABLE IF NOT EXISTS book_shelves (
            book_id    UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
            shelf_id   UUID NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
            PRIMARY KEY (book_id, shelf_id)
        )
    """)

    # Índice para buscar livros de uma estante eficientemente
    cur.execute("CREATE INDEX IF NOT EXISTS idx_book_shelves_shelf ON book_shelves(shelf_id)")

    cur.close()
    conn.close()
    print("Migração concluída: tabelas shelves e book_shelves criadas.")


if __name__ == "__main__":
    run()
