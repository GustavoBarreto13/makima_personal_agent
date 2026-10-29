"""Migrar o banco da Frieren para formatos e unidades de progresso (páginas, capítulos, volumes).

O que faz:
  1. Cria as colunas `books.format` (físico/ebook/audiobook/quadrinho), `books.progress_unit`
     (pages/chapters/volumes) e `books.first_unit` (capítulo/volume inicial) com suas restrições (CHECK). Tudo idempotente: rodar duas vezes
     não muda nada.
  2. Marca como `format = 'quadrinho'` os livros do gênero "Comics & Graphic Novels" — antes
     as estatísticas adivinhavam quadrinho por esse gênero.
  3. Desses quadrinhos, passa para `progress_unit = 'chapters'` SÓ os que ainda não têm sessões
     de leitura. Quem já tem sessões continua em páginas (trocar a unidade faria os números
     antigos mudarem de sentido) e aparece listado no relatório para você decidir caso a caso.

Atenção: quadrinhos que continuarem em páginas voltam a somar páginas nas estatísticas, porque a
regra antiga por gênero foi removida — o relatório mostra quantos são.

Dry-run por padrão: só relata o que seria feito, sem tocar no banco.

Usage:
    python -m scripts.migrate_frieren_units            # dry-run
    python -m scripts.migrate_frieren_units --apply    # grava

No VPS, rodar de dentro do container (o host do banco não resolve fora do Swarm):
    docker exec makima-web sh -c "cd /app && python -m scripts.migrate_frieren_units --apply"
"""

import argparse

from agents.db import get_conn, run_select

# Colunas novas em `books` — usadas para descobrir o que ainda falta criar.
_COLUMNS = ("format", "progress_unit", "first_unit")

# Critério antigo de "quadrinho" das estatísticas. O `%%` é obrigatório: `run_select` sempre entrega um
# dict de parâmetros (mesmo vazio) ao psycopg2, que então trata `%` como marcador e exige escapá-lo.
_COMIC_FILTER = "COALESCE(b.genre, '') ILIKE '%%Comics & Graphic Novels%%'"


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


def _create_schema() -> None:
    """Criar as colunas e as restrições numa única transação (tudo ou nada)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("ALTER TABLE books ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'fisico'")
            cur.execute("ALTER TABLE books ADD COLUMN IF NOT EXISTS progress_unit TEXT NOT NULL DEFAULT 'pages'")
            # Capítulo/volume inicial (mangás de numeração contínua entre volumes); 1 = começa do começo.
            cur.execute("ALTER TABLE books ADD COLUMN IF NOT EXISTS first_unit INTEGER NOT NULL DEFAULT 1")
            # ADD CONSTRAINT não tem IF NOT EXISTS: só cria a restrição se ela ainda não existe.
            cur.execute(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'books_format_check') THEN
                        ALTER TABLE books ADD CONSTRAINT books_format_check
                            CHECK (format IN ('fisico', 'ebook', 'audiobook', 'quadrinho'));
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'books_progress_unit_check') THEN
                        ALTER TABLE books ADD CONSTRAINT books_progress_unit_check
                            CHECK (progress_unit IN ('pages', 'chapters', 'volumes'));
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'books_first_unit_check') THEN
                        ALTER TABLE books ADD CONSTRAINT books_first_unit_check CHECK (first_unit >= 1);
                    END IF;
                END $$;
                """
            )


def _comic_candidates() -> list[dict]:
    """Buscar os quadrinhos que a migração ainda precisa tratar, com a contagem de sessões.

    Returns:
        Lista de {id, title, sessions}: livros do gênero quadrinho, ainda como `fisico`/páginas.
    """
    return run_select(
        f"""
        SELECT b.id, b.title,
               (SELECT COUNT(*) FROM reading_logs rl WHERE rl.book_id = b.id) AS sessions
          FROM books b
         WHERE b.deleted = FALSE AND {_COMIC_FILTER}
           AND b.format = 'fisico' AND b.progress_unit = 'pages'
         ORDER BY b.title
        """
    )


def main(apply: bool = False) -> dict:
    """Rodar a migração.

    Args:
        apply: False = dry-run (só relata); True = grava.

    Returns:
        Relatório: colunas a criar, quadrinhos a marcar, quantos vão para capítulos (sem sessões)
        e a lista dos que ficam em páginas por já terem sessões.
    """
    missing = _missing_columns()
    result: dict = {"apply": apply, "colunas_a_criar": missing}

    # Só cria o schema de verdade com --apply; depois disso não falta mais nada.
    if apply and missing:
        _create_schema()
        missing = []

    # Dry-run antes da 1ª aplicação: as colunas não existem, então não dá para filtrar por elas.
    # Todo livro do gênero conta como candidato (ainda não foi tratado por ninguém).
    # (Só quando faltam as colunas de formato/unidade: faltar apenas `first_unit` não muda os candidatos.)
    if {"format", "progress_unit"} & set(missing):
        rows = run_select(
            f"""
            SELECT b.id, b.title,
                   (SELECT COUNT(*) FROM reading_logs rl WHERE rl.book_id = b.id) AS sessions
              FROM books b
             WHERE b.deleted = FALSE AND {_COMIC_FILTER}
             ORDER BY b.title
            """
        )
    else:
        rows = _comic_candidates()

    sem_sessoes = [r for r in rows if int(r["sessions"]) == 0]
    com_sessoes = [r for r in rows if int(r["sessions"]) > 0]
    result["quadrinhos_a_marcar"] = len(rows)
    result["vao_para_capitulos"] = [r["title"] for r in sem_sessoes]
    # Estes ficam em páginas: voltam a somar páginas nas estatísticas até você decidir o que fazer.
    result["ficam_em_paginas_por_ter_sessoes"] = [f"{r['title']} ({r['sessions']} sessões)" for r in com_sessoes]

    if apply and rows:
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Todos viram "quadrinho" (formato); só os sem sessões trocam também a unidade.
                cur.execute("UPDATE books SET format = 'quadrinho' WHERE id = ANY(%(ids)s)",
                            {"ids": [r["id"] for r in rows]})
                if sem_sessoes:
                    cur.execute("UPDATE books SET progress_unit = 'chapters' WHERE id = ANY(%(ids)s)",
                                {"ids": [r["id"] for r in sem_sessoes]})

    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--apply", action="store_true", help="grava no banco (padrão: dry-run)")
    args = parser.parse_args()
    summary = main(apply=args.apply)
    for chave, valor in summary.items():
        print(f"{chave}: {valor}")
    if not args.apply:
        print("Dry-run: nada foi alterado. Rode com --apply para gravar.")
