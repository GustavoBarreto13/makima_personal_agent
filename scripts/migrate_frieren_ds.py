"""Migrar o banco da Frieren para a spec 073 (Design System): coração, abandono e vitrine.

O que faz:
  1. Cria as colunas `books.liked` (coração "Curti") e `books.date_abandoned` (dia em que o livro
     foi abandonado) e a tabela `book_favorites` (vitrine de até 4 livros na tela Início).
     Tudo idempotente: rodar duas vezes não muda nada.
  2. Preenche `date_abandoned` dos livros que JÁ estão abandonados. Não existe registro de quando
     isso aconteceu, então usamos a data da última alteração do livro (`updated_at`, convertida
     para o fuso de São Paulo) — é a melhor estimativa disponível.

Dry-run por padrão: só conta o que seria feito, sem tocar no banco.

Usage:
    python -m scripts.migrate_frieren_ds            # dry-run
    python -m scripts.migrate_frieren_ds --apply    # grava

No VPS, rodar de dentro do container (o host do banco não resolve fora do Swarm):
    docker exec makima-web sh -c "cd /app && python -m scripts.migrate_frieren_ds --apply"
"""

import argparse

from agents.db import get_conn, run_dml, run_select

# Colunas novas em `books` — usadas para descobrir o que ainda falta criar.
_COLUMNS = ("liked", "date_abandoned")


def _missing_columns() -> list[str]:
    """Listar quais colunas novas ainda não existem em `books`.

    Returns:
        Nomes das colunas de `_COLUMNS` ausentes no banco (lista vazia = já migrado).
    """
    # information_schema é o "catálogo" do PostgreSQL: diz quais colunas cada tabela tem.
    rows = run_select(
        """
        SELECT column_name FROM information_schema.columns
         WHERE table_name = 'books' AND column_name = ANY(%(cols)s)
        """,
        {"cols": list(_COLUMNS)},
    )
    present = {r["column_name"] for r in rows}
    return [c for c in _COLUMNS if c not in present]


def _favorites_table_exists() -> bool:
    """Dizer se a tabela `book_favorites` já existe.

    Returns:
        True se a tabela existe no banco.
    """
    # to_regclass devolve NULL quando o nome não corresponde a nenhuma tabela.
    row = run_select("SELECT to_regclass('public.book_favorites') IS NOT NULL AS ok")[0]
    return bool(row["ok"])


def _create_schema() -> None:
    """Criar colunas e tabela novas numa única transação (tudo ou nada)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("ALTER TABLE books ADD COLUMN IF NOT EXISTS liked BOOLEAN NOT NULL DEFAULT FALSE")
            cur.execute("ALTER TABLE books ADD COLUMN IF NOT EXISTS date_abandoned DATE")
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS book_favorites (
                    book_id  TEXT    PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
                    position INTEGER NOT NULL DEFAULT 0
                )
                """
            )


def main(apply: bool = False) -> dict:
    """Rodar a migração.

    Args:
        apply: False = dry-run (só relata); True = grava.

    Returns:
        Contadores: colunas a criar, se a tabela de favoritos falta e quantos abandonos
        recebem data.
    """
    missing = _missing_columns()
    table_missing = not _favorites_table_exists()
    result = {"apply": apply, "colunas_a_criar": missing, "criar_book_favorites": table_missing,
              "abandonos_datados": 0}

    # Só cria o schema de verdade com --apply; depois disso não falta mais nada.
    if apply and (missing or table_missing):
        _create_schema()
        missing = []

    # Sem a coluna (dry-run antes da 1ª aplicação) não dá para filtrar por ela: todo abandonado
    # conta como "a datar".
    if "date_abandoned" in missing:
        result["abandonos_datados"] = run_select(
            "SELECT COUNT(*) AS n FROM books WHERE status = 'abandonado' AND deleted = FALSE"
        )[0]["n"]
        return result

    pending = run_select(
        """
        SELECT COUNT(*) AS n FROM books
         WHERE status = 'abandonado' AND deleted = FALSE AND date_abandoned IS NULL
        """
    )[0]["n"]
    result["abandonos_datados"] = pending

    if apply and pending:
        # `updated_at` é TIMESTAMPTZ (instante absoluto); converter para o fuso local antes de
        # virar data evita cair no dia seguinte quando a alteração foi depois das 21h.
        run_dml(
            """
            UPDATE books
               SET date_abandoned = (updated_at AT TIME ZONE 'America/Sao_Paulo')::date
             WHERE status = 'abandonado' AND deleted = FALSE AND date_abandoned IS NULL
            """
        )

    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--apply", action="store_true", help="grava no banco (padrão: dry-run)")
    args = parser.parse_args()
    summary = main(apply=args.apply)
    print(summary)
    if not args.apply:
        print("Dry-run: nada foi alterado. Rode com --apply para gravar.")
