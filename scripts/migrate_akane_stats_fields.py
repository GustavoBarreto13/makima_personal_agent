"""Migrar os campos de estatísticas da Akane (spec 072): idioma, países e entrada no "Quero ver".

O que faz:
  1. Cria as colunas `movies.original_language`, `movies.countries` e `movies.watchlist_added_at`
     (idempotente; só no --apply).
  2. `watchlist_added_at = created_at` para os filmes que estão hoje no "Quero ver" e ainda não têm a
     data. Filmes já vistos ficam NULL: não há como saber se passaram pela watchlist.
  3. Preenche idioma e países via TMDB para filmes com `tmdb_id` que ainda não têm idioma
     (uma chamada por filme, com pausa entre elas; TMDB fora = o filme fica para a próxima rodada).

Dry-run por padrão: só conta o que seria feito, sem tocar no banco nem no TMDB.

Usage:
    python -m scripts.migrate_akane_stats_fields            # dry-run
    python -m scripts.migrate_akane_stats_fields --apply    # grava

No VPS, rodar de dentro do container (o host do banco não resolve fora do Swarm):
    docker exec makima-web sh -c "cd /app && python -m scripts.migrate_akane_stats_fields --apply"
"""

import argparse
import time

from agents.akane.tools import _TMDB_LANG, _tmdb_get
from agents.db import get_conn, run_dml, run_select

_COLUMNS = ("original_language", "countries", "watchlist_added_at")
_PAUSE_SECONDS = 0.25   # folga para o limite de requisições do TMDB


def _missing_columns() -> list[str]:
    rows = run_select(
        """
        SELECT column_name FROM information_schema.columns
         WHERE table_name = 'movies' AND column_name = ANY(%(cols)s)
        """,
        {"cols": list(_COLUMNS)},
    )
    present = {r["column_name"] for r in rows}
    return [c for c in _COLUMNS if c not in present]


def _create_columns() -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("ALTER TABLE movies ADD COLUMN IF NOT EXISTS original_language TEXT")
            cur.execute("ALTER TABLE movies ADD COLUMN IF NOT EXISTS countries TEXT[]")
            cur.execute("ALTER TABLE movies ADD COLUMN IF NOT EXISTS watchlist_added_at TIMESTAMPTZ")


def main(apply: bool = False) -> dict:
    """Roda a migração.

    Args:
        apply: False = dry-run (só relata); True = grava.

    Returns:
        Contadores: colunas criadas, datas de watchlist preenchidas, filmes enriquecidos/falhos.
    """
    missing = _missing_columns()
    result = {"apply": apply, "colunas_a_criar": missing, "watchlist_datas": 0,
              "tmdb_a_enriquecer": 0, "tmdb_enriquecidos": 0, "tmdb_falhas": 0}

    if apply and missing:
        _create_columns()
        missing = []

    # Sem as colunas (dry-run antes da 1ª aplicação) não há como consultar nelas: tudo é "a fazer".
    if missing:
        result["watchlist_datas"] = run_select(
            "SELECT COUNT(*) AS n FROM movies WHERE status = 'watchlist' AND deleted = FALSE"
        )[0]["n"]
        result["tmdb_a_enriquecer"] = run_select(
            "SELECT COUNT(*) AS n FROM movies WHERE tmdb_id IS NOT NULL AND deleted = FALSE"
        )[0]["n"]
        return result

    pending_watchlist = run_select(
        """
        SELECT COUNT(*) AS n FROM movies
         WHERE status = 'watchlist' AND deleted = FALSE AND watchlist_added_at IS NULL
        """
    )[0]["n"]
    result["watchlist_datas"] = pending_watchlist
    if apply and pending_watchlist:
        run_dml(
            """
            UPDATE movies SET watchlist_added_at = created_at
             WHERE status = 'watchlist' AND deleted = FALSE AND watchlist_added_at IS NULL
            """
        )

    to_enrich = run_select(
        """
        SELECT id, tmdb_id, title FROM movies
         WHERE tmdb_id IS NOT NULL AND deleted = FALSE AND original_language IS NULL
         ORDER BY created_at
        """
    )
    result["tmdb_a_enriquecer"] = len(to_enrich)
    if not apply:
        return result

    for movie in to_enrich:
        details = _tmdb_get(f"/movie/{movie['tmdb_id']}", params={"language": _TMDB_LANG})
        if not details:
            result["tmdb_falhas"] += 1
            print(f"  falhou: {movie['title']} (tmdb {movie['tmdb_id']})")
        else:
            run_dml(
                """
                UPDATE movies SET original_language = %(lang)s, countries = %(countries)s
                 WHERE id = %(id)s
                """,
                {
                    "id": movie["id"],
                    # '' (e não NULL) marca "consultado, TMDB não informa": a próxima rodada pula o filme
                    "lang": details.get("original_language") or "",
                    "countries": [c["iso_3166_1"] for c in details.get("production_countries", [])
                                  if c.get("iso_3166_1")],
                },
            )
            result["tmdb_enriquecidos"] += 1
        time.sleep(_PAUSE_SECONDS)

    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--apply", action="store_true", help="grava no banco (padrão: dry-run)")
    args = parser.parse_args()
    summary = main(apply=args.apply)
    print(summary)
    if not args.apply:
        print("Dry-run: nada foi alterado. Rode com --apply para gravar.")
