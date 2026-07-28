"""fix_letterboxd_fake_diary_sessions.py — Remove sessões de diário fabricadas.

Migração one-time (spec 050, follow-up). A primeira versão do importador de
Letterboxd (`scripts/import_letterboxd_csv.py`) tinha um bug: qualquer filme
avaliado em `ratings.csv` sem sessão correspondente no `diary.csv` virava uma
sessão fabricada em `diary_entries`, usando a data de PUBLICAÇÃO DA NOTA como
se fosse a data de assistência. Isso poluiu o Diário com entradas que não vêm
de uma sessão real logada — o comportamento correto (já corrigido no
importador) é: `ratings.csv` sem sessão só grava a nota no filme, nunca cria
sessão.

Este script identifica e remove essas sessões fabricadas de uma carga que já
rodou, comparando o banco contra os arquivos `diary.csv`/`reviews.csv` reais do
export (as únicas fontes legítimas de sessão). Idempotente: rodar de novo
depois de já ter aplicado (ou contra um banco que nunca teve o bug) encontra
zero candidatos.

Modo padrão é --dry-run (só mostra o que seria removido, não altera nada).
Passar --apply para remover de fato — grava um backup JSON de tudo que for
apagado antes de apagar, e recalcula times_watched/last_watched_date dos
filmes afetados.

Execução (DENTRO do container makima-web — o hostname do PostgreSQL só resolve
de dentro do Docker Swarm):

    docker exec makima-web sh -c \
        "cd /app && python -m scripts.fix_letterboxd_fake_diary_sessions letterboxd_export --dry-run"

    docker exec makima-web sh -c \
        "cd /app && python -m scripts.fix_letterboxd_fake_diary_sessions letterboxd_export --apply"

Usage:
    python -m scripts.fix_letterboxd_fake_diary_sessions /caminho/export --dry-run
    python -m scripts.fix_letterboxd_fake_diary_sessions /caminho/export --apply
"""

import argparse   # Argumentos de linha de comando (--dry-run/--apply)
import csv        # Leitura dos CSVs reais (mesma fonte da verdade do importador)
import json       # Serialização do backup antes de apagar
import logging    # Logs estruturados no stdout
import sys        # sys.exit para código de saída
from datetime import date, datetime
from pathlib import Path

from agents.db import run_select, run_dml, get_conn

logging.basicConfig(
    level=logging.INFO,
    format="[fix_letterboxd_fake_diary_sessions] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)


def _parse_date(text: str | None) -> date | None:
    """Converte string 'YYYY-MM-DD' em date — mesma lógica do importador."""
    if not text or not text.strip():
        return None
    try:
        return date.fromisoformat(text.strip()[:10])
    except ValueError:
        return None


def _legit_session_pairs(pasta: Path) -> set[tuple[str, date]]:
    """Lê diary.csv + reviews.csv e monta o conjunto de sessões legítimas.

    Args:
        pasta: Pasta do export do Letterboxd (mesma usada em import_letterboxd_csv).

    Returns:
        Conjunto de (letterboxd_uri, watched_date) — toda sessão em diary_entries
        que não estiver aqui foi fabricada por outra via (o bug do ratings.csv).
    """
    pairs: set[tuple[str, date]] = set()
    for filename in ("diary.csv", "reviews.csv"):
        path = pasta / filename
        if not path.exists():
            log.warning(f"Arquivo não encontrado (pulando): {path}")
            continue
        with open(path, encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                uri = row.get("Letterboxd URI") or ""
                watched = _parse_date(row.get("Watched Date") or row.get("Date"))
                if uri and watched:
                    pairs.add((uri, watched))
        log.info(f"{filename}: {len(pairs)} pares (letterboxd_uri, watched_date) acumulados")
    return pairs


def find_fake_sessions(pasta: Path) -> list[dict]:
    """Localiza sessões em diary_entries que não têm par em diary.csv/reviews.csv.

    Args:
        pasta: Pasta do export do Letterboxd.

    Returns:
        Lista de dicts (linha completa de diary_entries) candidatas à remoção.
    """
    legit = _legit_session_pairs(pasta)

    # Só sessões vindas da importação CSV com letterboxd_uri — nunca mexe em
    # sessões manuais (sem letterboxd_uri) nem no sync RSS (source diferente).
    rows = run_select(
        """
        SELECT id, movie_id, movie_title, watched_date, rating, review, tags,
               letterboxd_uri, source, created_at
        FROM diary_entries
        WHERE source = 'letterboxd_csv' AND letterboxd_uri IS NOT NULL
        """
    )

    fake = [r for r in rows if (r["letterboxd_uri"], r["watched_date"]) not in legit]
    return fake


def _json_default(obj):
    """Serializa date/datetime pro JSON do backup."""
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    raise TypeError(f"Tipo não serializável: {type(obj)}")


def apply_removal(fake_sessions: list[dict], backup_path: Path) -> None:
    """Remove as sessões fabricadas e recalcula os agregados dos filmes afetados.

    Grava um backup JSON de tudo que será removido ANTES de apagar — para
    recuperação manual, se necessário.

    Args:
        fake_sessions: Lista de linhas de diary_entries a remover (de
            `find_fake_sessions`).
        backup_path: Caminho do arquivo JSON de backup.
    """
    backup_path.write_text(
        json.dumps(fake_sessions, default=_json_default, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    log.info(f"Backup gravado em: {backup_path} ({len(fake_sessions)} sessões)")

    movie_ids = {row["movie_id"] for row in fake_sessions}
    ids_to_delete = [row["id"] for row in fake_sessions]

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM diary_entries WHERE id = ANY(%(ids)s)",
                {"ids": ids_to_delete},
            )
            for movie_id in movie_ids:
                cur.execute(
                    """
                    UPDATE movies
                    SET times_watched     = (SELECT COUNT(*) FROM diary_entries WHERE movie_id = %(mid)s),
                        last_watched_date = (SELECT MAX(watched_date) FROM diary_entries WHERE movie_id = %(mid)s),
                        updated_at        = NOW()
                    WHERE id = %(mid)s
                    """,
                    {"mid": movie_id},
                )

    log.info(f"Removidas {len(ids_to_delete)} sessões fabricadas; {len(movie_ids)} filmes recalculados.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Remove sessões de diário fabricadas pelo bug do fallback de ratings.csv (spec 050)",
    )
    parser.add_argument(
        "export_dir",
        help="Pasta do export do Letterboxd (mesma passada para import_letterboxd_csv)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Remove de fato (padrão é --dry-run: só mostra o que seria removido)",
    )
    parser.add_argument(
        "--backup-path",
        default=None,
        help="Caminho do backup JSON (padrão: fake_diary_sessions_backup_<timestamp>.json na cwd)",
    )
    args = parser.parse_args()

    pasta = Path(args.export_dir)
    if not pasta.is_dir():
        log.error(f"Diretório de exportação não encontrado: {pasta}")
        sys.exit(2)

    fake_sessions = find_fake_sessions(pasta)

    if not fake_sessions:
        log.info("Nenhuma sessão fabricada encontrada — nada a fazer.")
        sys.exit(0)

    log.info(f"{len(fake_sessions)} sessões fabricadas encontradas:")
    for row in fake_sessions:
        log.info(
            f"  - {row['movie_title']!r} em {row['watched_date']} "
            f"(nota={row['rating']}, id={row['id']})"
        )

    if not args.apply:
        log.info(
            f"\nDRY-RUN — nada foi alterado. Rode com --apply para remover de fato "
            f"({len(fake_sessions)} sessões)."
        )
        sys.exit(0)

    backup_path = Path(
        args.backup_path
        or f"fake_diary_sessions_backup_{datetime.now():%Y%m%d_%H%M%S}.json"
    )
    apply_removal(fake_sessions, backup_path)


if __name__ == "__main__":
    main()
