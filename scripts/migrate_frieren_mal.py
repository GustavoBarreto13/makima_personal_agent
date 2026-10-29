"""Migrar o banco da Frieren para a sincronização de mangás com o MyAnimeList.

O que faz (tudo idempotente — rodar duas vezes não muda nada):
  1. Cria `books.mal_manga_id` (id da série no MyAnimeList), `books.mal_updated_at` e
     `books.local_updated_at` (carimbos que decidem quem vence um conflito).
  2. Cria o índice único parcial `idx_books_mal_manga` (um mangá do MAL = no máximo um livro).
  3. Cria `reading_logs.source` ('manual' ou 'mal_sync').
  4. Cria a tabela `frieren_mal_state` (último sync delta do mangá).

Nenhum dado existente é alterado: livros atuais continuam sem vínculo com o MAL.
Dry-run por padrão: só relata o que seria criado.

Usage:
    python -m scripts.migrate_frieren_mal            # dry-run
    python -m scripts.migrate_frieren_mal --apply    # grava

No VPS, rodar de dentro do container (o host do banco não resolve fora do Swarm):
    docker exec makima-web sh -c "cd /app && python -m scripts.migrate_frieren_mal --apply"
"""

import argparse

from agents.db import get_conn, run_select

# (tabela, coluna) que a migração cria — usado para descobrir o que ainda falta.
_COLUMNS = (
    ("books", "mal_manga_id"),
    ("books", "mal_updated_at"),
    ("books", "local_updated_at"),
    ("reading_logs", "source"),
)


def _missing() -> list[str]:
    """Listar o que ainda não existe no banco.

    Returns:
        Nomes (``tabela.coluna``, ``idx_books_mal_manga`` ou ``frieren_mal_state``) ainda ausentes.
    """
    faltando: list[str] = []
    for tabela, coluna in _COLUMNS:
        # information_schema é o "catálogo" do PostgreSQL: diz quais colunas cada tabela tem.
        achou = run_select(
            "SELECT 1 FROM information_schema.columns WHERE table_name = %(t)s AND column_name = %(c)s",
            {"t": tabela, "c": coluna},
        )
        if not achou:
            faltando.append(f"{tabela}.{coluna}")
    if not run_select("SELECT 1 FROM pg_indexes WHERE indexname = 'idx_books_mal_manga'"):
        faltando.append("idx_books_mal_manga")
    if not run_select("SELECT 1 FROM information_schema.tables WHERE table_name = 'frieren_mal_state'"):
        faltando.append("frieren_mal_state")
    return faltando


def _apply() -> None:
    """Criar tudo numa única transação (tudo ou nada)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("ALTER TABLE books ADD COLUMN IF NOT EXISTS mal_manga_id INTEGER")
            cur.execute("ALTER TABLE books ADD COLUMN IF NOT EXISTS mal_updated_at TIMESTAMPTZ")
            cur.execute("ALTER TABLE books ADD COLUMN IF NOT EXISTS local_updated_at TIMESTAMPTZ")
            cur.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_books_mal_manga "
                "ON books(mal_manga_id) WHERE mal_manga_id IS NOT NULL"
            )
            cur.execute("ALTER TABLE reading_logs ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'")
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS frieren_mal_state (
                    id           INTEGER PRIMARY KEY CHECK (id = 1),
                    last_sync_at TIMESTAMPTZ,
                    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )


def main(apply: bool = False) -> dict:
    """Rodar a migração.

    Args:
        apply: False = dry-run (só relata); True = grava.

    Returns:
        Relatório com o que faltava criar (``a_criar``) e o que sobrou depois (``faltando_depois``).
    """
    faltando = _missing()
    resultado: dict = {"apply": apply, "a_criar": faltando}
    if apply and faltando:
        _apply()
        resultado["faltando_depois"] = _missing()
    return resultado


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--apply", action="store_true", help="grava no banco (padrão: dry-run)")
    args = parser.parse_args()
    for chave, valor in main(apply=args.apply).items():
        print(f"{chave}: {valor}")
    if not args.apply:
        print("Dry-run: nada foi alterado. Rode com --apply para gravar.")
