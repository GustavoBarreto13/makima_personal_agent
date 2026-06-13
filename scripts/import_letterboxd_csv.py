"""Importador de histórico Letterboxd via arquivos CSV.

Processa a exportação de dados do Letterboxd (Settings → Import & Export → Export Your Data).
Os arquivos CSV exportados são: diary.csv, reviews.csv, watchlist.csv, ratings.csv, watched.csv.

A importação é completamente idempotente: rodar o mesmo CSV múltiplas vezes
não cria duplicatas (SC-004). Dedup por letterboxd_uri + (letterboxd_uri, watched_date).

Ordem de processamento:
    1. diary.csv     — registro cronológico de sessões (mais completo)
    2. reviews.csv   — enriquece sessões com o texto da review
    3. watchlist.csv — filmes marcados como "quero ver" (status=watchlist)
    4. ratings.csv   — fallback para notas sem sessão
    5. watched.csv   — fallback para filmes assistidos sem data

Usage:
    # Importa e chama diretamente:
    from scripts.import_letterboxd_csv import run_import
    result = run_import("/caminho/para/pasta/letterboxd_export")

    # Linha de comando:
    python -m scripts.import_letterboxd_csv /caminho/para/pasta/letterboxd_export
    python -m scripts.import_letterboxd_csv /pasta -v --no-tmdb
"""

import argparse     # Argumentos de linha de comando
import csv          # Parser de CSV nativo do Python
import json         # Para saída JSON no stdout
import logging      # Logs estruturados
import os           # Variáveis de ambiente
import sys          # sys.exit para código de saída
from datetime import date, datetime
from pathlib import Path  # Manipulação de caminhos de forma segura

# Funções da camada de lógica da Akane — a lógica de negócio fica lá (FR-016)
from agents.akane.tools import (
    upsert_movie_from_letterboxd,  # Cria/atualiza filme + sessão (idempotente)
    add_movie,                     # Adiciona filme ao catálogo (usado pela watchlist)
)

# Helpers de banco — importados de agents.db diretamente (não de tools.py)
from agents.db import run_select  # Consultas SELECT ao PostgreSQL

# Logger do módulo
log = logging.getLogger("import_letterboxd_csv")


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS INTERNOS
# ─────────────────────────────────────────────────────────────────────────────

def _parse_date(text: str | None) -> date | None:
    """Converte string de data em objeto date.

    Suporta os formatos usados pelo Letterboxd: YYYY-MM-DD.

    Args:
        text: String de data no formato 'YYYY-MM-DD' ou None.

    Returns:
        Objeto date ou None se inválido/vazio.

    Example:
        >>> _parse_date("2024-07-04")
        datetime.date(2024, 7, 4)
    """
    if not text or not text.strip():
        return None
    try:
        return date.fromisoformat(text.strip()[:10])
    except ValueError:
        return None


def _parse_rating(text: str | None) -> float | None:
    """Converte string de nota em float.

    Args:
        text: String numérica ('4.5', '3', '') ou None.

    Returns:
        Float com a nota ou None se inválido/vazio.

    Example:
        >>> _parse_rating("4.5")
        4.5
    """
    if not text or not text.strip():
        return None
    try:
        val = float(text.strip())
        # Valida o intervalo aceito pelo banco — notas fora do range são ignoradas
        return val if 0.5 <= val <= 5.0 else None
    except ValueError:
        return None


def _read_csv(path: Path) -> list[dict]:
    """Lê um CSV e retorna lista de dicts (headers são as chaves).

    Args:
        path: Caminho do arquivo CSV.

    Returns:
        Lista de dicts onde cada dict é uma linha do CSV.
        Lista vazia se o arquivo não existir.
    """
    if not path.exists():
        log.debug(f"Arquivo não encontrado (pulando): {path}")
        return []
    try:
        with open(path, encoding="utf-8-sig", newline="") as f:
            # utf-8-sig remove automaticamente o BOM que o Excel adiciona
            reader = csv.DictReader(f)
            rows = list(reader)
        log.info(f"CSV lido: {path.name} — {len(rows)} linhas")
        return rows
    except Exception as exc:
        log.error(f"Erro ao ler {path.name}: {exc}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# PROCESSADORES POR ARQUIVO
# ─────────────────────────────────────────────────────────────────────────────

def _process_diary(pasta: Path, enrich_tmdb: bool, contadores: dict) -> None:
    """Processa diary.csv — sessões cronológicas com data, nota e review.

    Cada linha do diary.csv representa uma sessão de assistência.
    Colunas esperadas: Date, Name, Year, Letterboxd URI, Rating, Rewatch, Tags, Watched Date, Review

    Args:
        pasta: Pasta com os arquivos CSV da exportação.
        enrich_tmdb: Se deve enriquecer com metadados do TMDB.
        contadores: Dict de contadores que é atualizado in-place.
    """
    rows = _read_csv(pasta / "diary.csv")
    for row in rows:
        # Letteboxd URI é a chave de dedup — sem ela não há como garantir idempotência
        letterboxd_uri = row.get("Letterboxd URI") or row.get("URI") or ""
        if not letterboxd_uri:
            log.warning(f"Linha sem Letterboxd URI em diary.csv: {row}")
            contadores["erros"] += 1
            continue

        # Data de assistência — obrigatória para sessão no diário
        watched_date = _parse_date(row.get("Watched Date") or row.get("Date"))
        if not watched_date:
            log.warning(f"Linha sem data em diary.csv: {row.get('Name', '?')}")
            contadores["erros"] += 1
            continue

        try:
            result = upsert_movie_from_letterboxd(
                title=row.get("Name", ""),
                year=int(row["Year"]) if row.get("Year", "").isdigit() else None,
                letterboxd_uri=letterboxd_uri,
                rating=_parse_rating(row.get("Rating")),
                review=row.get("Review") or None,
                watched_date=watched_date,
                source="letterboxd_csv",
                enrich_tmdb=enrich_tmdb,
            )
            _atualiza_contadores(contadores, result.get("status"), row.get("Name", ""))
        except Exception as exc:
            log.error(f"Erro ao processar '{row.get('Name', '?')}' (diary.csv): {exc}", exc_info=True)
            contadores["erros"] += 1


def _process_reviews(pasta: Path, enrich_tmdb: bool, contadores: dict) -> None:
    """Processa reviews.csv — enriquece sessões com textos de reviews.

    Colunas esperadas: Date, Name, Year, Letterboxd URI, Rating, Review

    A maioria das linhas do reviews.csv já foi processada pelo diary.csv.
    Aqui apenas garantimos que reviews sem sessão correspondente sejam importadas.

    Args:
        pasta: Pasta com os arquivos CSV.
        enrich_tmdb: Se deve enriquecer com TMDB.
        contadores: Dict de contadores atualizado in-place.
    """
    rows = _read_csv(pasta / "reviews.csv")
    for row in rows:
        letterboxd_uri = row.get("Letterboxd URI") or ""
        if not letterboxd_uri:
            contadores["erros"] += 1
            continue

        # Tenta a data do diário primeiro; usa a data de publicação como fallback
        watched_date = _parse_date(row.get("Watched Date") or row.get("Date"))
        if not watched_date:
            contadores["pulados"] += 1
            continue

        try:
            result = upsert_movie_from_letterboxd(
                title=row.get("Name", ""),
                year=int(row["Year"]) if row.get("Year", "").isdigit() else None,
                letterboxd_uri=letterboxd_uri,
                rating=_parse_rating(row.get("Rating")),
                review=row.get("Review") or None,
                watched_date=watched_date,
                source="letterboxd_csv",
                enrich_tmdb=enrich_tmdb,
            )
            _atualiza_contadores(contadores, result.get("status"), row.get("Name", ""))
        except Exception as exc:
            log.error(f"Erro ao processar '{row.get('Name', '?')}' (reviews.csv): {exc}", exc_info=True)
            contadores["erros"] += 1


def _process_watchlist(pasta: Path, enrich_tmdb: bool, contadores: dict) -> None:
    """Processa watchlist.csv — filmes marcados como 'quero ver'.

    Colunas esperadas: Date, Name, Year, Letterboxd URI

    Não cria sessão de diário; apenas adiciona à watchlist se o filme ainda não
    estiver no catálogo (status='watched' tem precedência).

    Args:
        pasta: Pasta com os arquivos CSV.
        enrich_tmdb: Se deve enriquecer com TMDB.
        contadores: Dict de contadores atualizado in-place.
    """
    rows = _read_csv(pasta / "watchlist.csv")
    for row in rows:
        letterboxd_uri = row.get("Letterboxd URI") or ""
        title = row.get("Name", "")
        if not letterboxd_uri or not title:
            contadores["pulados"] += 1
            continue

        try:
            # Verifica se o filme já existe no catálogo (qualquer status)
            existing = run_select(
                "SELECT id, status FROM movies WHERE letterboxd_uri = %(uri)s",
                {"uri": letterboxd_uri},
            )
            if existing:
                # Já existe — não sobrescreve status 'watched' com 'watchlist'
                log.debug(f"○ Watchlist — já existe: {title} (status={existing[0]['status']})")
                contadores["pulados"] += 1
                continue

            # Filme novo — adiciona à watchlist via add_movie
            # enrich_tmdb=False quando --no-tmdb foi passado: passa tmdb_id=None para evitar busca
            result = add_movie(
                title=title,
                year=int(row["Year"]) if row.get("Year", "").isdigit() else None,
                status="watchlist",
                letterboxd_uri=letterboxd_uri,
                source="letterboxd_csv",
            )
            if result.get("status") == "ok":
                log.info(f"✓ Watchlist: {title}")
                contadores["criados"] += 1
            else:
                # Pode ser "error" se o dedup detectou o filme por outra via
                log.debug(f"○ Watchlist — add_movie retornou error: {result.get('message', '?')} ({title})")
                contadores["pulados"] += 1

        except Exception as exc:
            log.error(f"Erro ao processar '{title}' (watchlist.csv): {exc}", exc_info=True)
            contadores["erros"] += 1


def _process_ratings_fallback(pasta: Path, enrich_tmdb: bool, contadores: dict) -> None:
    """Processa ratings.csv — fallback para notas sem sessão no diário.

    Colunas esperadas: Date, Name, Year, Letterboxd URI, Rating

    Só processa filmes que não foram importados pelo diary.csv (não têm URI no banco).
    Usa a data de publicação da nota como data de assistência (aproximação).

    Args:
        pasta: Pasta com os arquivos CSV.
        enrich_tmdb: Se deve enriquecer com TMDB.
        contadores: Dict de contadores atualizado in-place.
    """
    rows = _read_csv(pasta / "ratings.csv")
    for row in rows:
        letterboxd_uri = row.get("Letterboxd URI") or ""
        if not letterboxd_uri:
            contadores["pulados"] += 1
            continue

        # Verifica se já foi importado pelo diary.csv (tem alguma sessão)
        existing_diary = run_select(
            "SELECT id FROM diary_entries WHERE letterboxd_uri = %(uri)s LIMIT 1",
            {"uri": letterboxd_uri},
        )
        if existing_diary:
            log.debug(f"○ Ratings fallback — já tem sessão: {row.get('Name', '?')}")
            contadores["pulados"] += 1
            continue

        # Usa a data da nota como data aproximada de assistência
        watched_date = _parse_date(row.get("Date"))
        if not watched_date:
            contadores["pulados"] += 1
            continue

        try:
            result = upsert_movie_from_letterboxd(
                title=row.get("Name", ""),
                year=int(row["Year"]) if row.get("Year", "").isdigit() else None,
                letterboxd_uri=letterboxd_uri,
                rating=_parse_rating(row.get("Rating")),
                review=None,
                watched_date=watched_date,
                source="letterboxd_csv",
                enrich_tmdb=enrich_tmdb,
            )
            _atualiza_contadores(contadores, result.get("status"), row.get("Name", ""))
        except Exception as exc:
            log.error(f"Erro ao processar '{row.get('Name', '?')}' (ratings.csv): {exc}", exc_info=True)
            contadores["erros"] += 1


def _atualiza_contadores(contadores: dict, status: str | None, title: str) -> None:
    """Incrementa o contador correto com base no status do upsert.

    Args:
        contadores: Dict com chaves 'criados', 'atualizados', 'pulados', 'erros'.
        status: 'created', 'updated', 'skipped' ou None.
        title: Título do filme (para o log).
    """
    if status == "created":
        contadores["criados"] += 1
        log.info(f"✓ Criado:     {title}")
    elif status == "updated":
        contadores["atualizados"] += 1
        log.info(f"↻ Atualizado: {title}")
    elif status == "skipped":
        contadores["pulados"] += 1
        log.debug(f"○ Pulado:     {title} — já existe")
    else:
        contadores["erros"] += 1
        log.warning(f"? Status inesperado '{status}' para '{title}'")


# ─────────────────────────────────────────────────────────────────────────────
# FUNÇÃO PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────

def run_import(export_dir: str, enrich_tmdb: bool = True) -> dict:
    """Importa o histórico completo de uma exportação Letterboxd.

    Processa os CSVs na ordem: diary → reviews → watchlist → ratings (fallback).
    Completamente idempotente: rodar múltiplas vezes não cria duplicatas (SC-004).

    Args:
        export_dir: Caminho para a pasta contendo os arquivos CSV exportados.
        enrich_tmdb: Se True, tenta enriquecer com TMDB (com fallback gracioso).

    Returns:
        Dict com contadores: criados, atualizados, pulados, erros.

    Raises:
        FileNotFoundError: Se export_dir não for um diretório válido.
    """
    pasta = Path(export_dir)

    # Verifica que o diretório de exportação existe
    if not pasta.is_dir():
        raise FileNotFoundError(f"Diretório de exportação não encontrado: {export_dir}")

    log.info(f"Iniciando importação do histórico Letterboxd de: {pasta}")

    # Contadores de resultado — compartilhados entre todos os processadores
    contadores: dict = {
        "criados":     0,
        "atualizados": 0,
        "pulados":     0,
        "erros":       0,
    }

    # ── 1. diary.csv — sessões cronológicas (mais completo) ───────────────────
    log.info("=== Fase 1/4: diary.csv ===")
    _process_diary(pasta, enrich_tmdb, contadores)

    # ── 2. reviews.csv — enriquece/complementa o diary ────────────────────────
    log.info("=== Fase 2/4: reviews.csv ===")
    _process_reviews(pasta, enrich_tmdb, contadores)

    # ── 3. watchlist.csv — filmes para assistir ───────────────────────────────
    log.info("=== Fase 3/4: watchlist.csv ===")
    _process_watchlist(pasta, enrich_tmdb, contadores)

    # ── 4. ratings.csv — fallback para notas sem sessão ──────────────────────
    log.info("=== Fase 4/4: ratings.csv (fallback) ===")
    _process_ratings_fallback(pasta, enrich_tmdb, contadores)

    # Resumo final
    log.info(
        f"Importação concluída — criados: {contadores['criados']}, "
        f"atualizados: {contadores['atualizados']}, pulados: {contadores['pulados']}, "
        f"erros: {contadores['erros']}"
    )
    return contadores


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT — CLI
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Importa histórico Letterboxd (exportação CSV) para o catálogo da Akane",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Onde obter os CSVs:
    Letterboxd → Settings → Import & Export → Export Your Data
    Extraia o ZIP e passe o caminho da pasta como argumento.

Exemplos:
    python -m scripts.import_letterboxd_csv ~/Downloads/letterboxd_export
    python -m scripts.import_letterboxd_csv /pasta -v --no-tmdb
""",
    )
    parser.add_argument(
        "export_dir",
        help="Caminho para a pasta contendo os arquivos CSV do Letterboxd",
    )
    parser.add_argument(
        "--no-tmdb",
        action="store_true",
        help="Desabilita enriquecimento TMDB (mais rápido; filmes criados só com dados Letterboxd)",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Log detalhado (nível DEBUG)",
    )
    args = parser.parse_args()

    # Configura logging
    logging.basicConfig(
        stream=sys.stderr,
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
    )

    # Executa a importação
    try:
        resultado = run_import(
            export_dir=args.export_dir,
            enrich_tmdb=not args.no_tmdb,
        )
    except FileNotFoundError as exc:
        log.error(str(exc))
        sys.exit(2)

    # Saída JSON para facilitar integração com scripts
    print(json.dumps(resultado, ensure_ascii=False))

    # Sai com erro se houve algum problema de processamento
    sys.exit(0 if resultado["erros"] == 0 else 1)
