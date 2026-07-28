"""Importador de histórico Letterboxd via arquivos CSV.

Processa a exportação de dados do Letterboxd (Settings → Import & Export → Export Your Data).
Os arquivos CSV exportados são: diary.csv, reviews.csv, watchlist.csv, ratings.csv, watched.csv.

A importação é completamente idempotente: rodar o mesmo CSV múltiplas vezes
não cria duplicatas (SC-004). Dedup por letterboxd_uri + (letterboxd_uri, watched_date).

Ordem de processamento:
    1. diary.csv     — a ÚNICA fonte de sessões (diary_entries). Diário é estritamente
                       o que vem daqui — nenhum outro arquivo cria sessão nova.
    2. reviews.csv   — preenche review/tags nas sessões já criadas pelo diary.csv (por
                       (letterboxd_uri, watched_date)); se não achar a sessão, não cria
                       nada — só loga um aviso (não deveria acontecer: no Letterboxd toda
                       review pressupõe uma sessão logada).
    3. watchlist.csv — filmes marcados como "quero ver" (status=watchlist)
    4. ratings.csv   — fallback de CATÁLOGO (não de diário): filmes só avaliados, sem
                       sessão. Preenche só a nota do filme; nunca cria diary_entries (a
                       data de publicação da nota não é uma data de assistência real).
    5. watched.csv   — fallback de catálogo para filmes assistidos sem nenhuma outra
                       informação — sem sessão, sem nota.

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
import itertools    # Contador incremental para o created_at das sessões (ordem no dia)
import json         # Para saída JSON no stdout
import logging      # Logs estruturados
import os           # Variáveis de ambiente
import sys          # sys.exit para código de saída
from datetime import date, datetime, timedelta
from pathlib import Path  # Manipulação de caminhos de forma segura

# Funções da camada de lógica da Akane — a lógica de negócio fica lá (FR-016)
from agents.akane.tools import (
    upsert_movie_from_letterboxd,  # Cria/atualiza filme + sessão (idempotente) — só diary.csv
    add_movie,                     # Adiciona filme ao catálogo (watchlist/ratings/watched)
    backfill_diary_review,         # Preenche review/tags numa sessão já existente
)

# Helpers de banco — importados de agents.db diretamente (não de tools.py)
from agents.db import run_select, run_dml  # Consultas SELECT/UPDATE ao PostgreSQL

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


def _parse_tags(text: str | None) -> list[str] | None:
    """Converte a coluna "Tags" do Letterboxd (string separada por vírgula) em lista.

    O `csv.DictReader` já desfaz o quoting do CSV — se o campo original tinha
    "ação, favorito" entre aspas, aqui já chega como uma única string com vírgula
    interna; dividir por vírgula recupera as tags individuais.

    Args:
        text: Valor bruto da coluna "Tags" ('', 'belasartes', 'ação, favorito' ou None).

    Returns:
        Lista de tags (sem espaços nas bordas, sem entradas vazias), ou None se
        não houver nenhuma tag.

    Example:
        >>> _parse_tags("ação, favorito")
        ['ação', 'favorito']
    """
    if not text or not text.strip():
        return None
    tags = [t.strip() for t in text.split(",") if t.strip()]
    return tags or None


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

def _process_diary(pasta: Path, enrich_tmdb: bool, contadores: dict, ts_base: datetime, ts_seq: itertools.count) -> None:
    """Processa diary.csv — sessões cronológicas com data, nota e review.

    Cada linha do diary.csv representa uma sessão de assistência.
    Colunas esperadas: Date, Name, Year, Letterboxd URI, Rating, Rewatch, Tags, Watched Date, Review

    Args:
        pasta: Pasta com os arquivos CSV da exportação.
        enrich_tmdb: Se deve enriquecer com metadados do TMDB.
        contadores: Dict de contadores que é atualizado in-place.
        ts_base: Instante base da importação (spec 050, FR-011).
        ts_seq: Contador compartilhado entre as fases que criam sessões — cada
            linha processada consome o próximo valor, garantindo que a ordem de
            `created_at` reflita a ordem de leitura do export, mesmo dentro do
            mesmo `watched_date`.
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
                created_at=ts_base + timedelta(milliseconds=next(ts_seq)),
                tags=_parse_tags(row.get("Tags")),
            )
            _atualiza_contadores(contadores, result.get("status"), row.get("Name", ""))
        except Exception as exc:
            log.error(f"Erro ao processar '{row.get('Name', '?')}' (diary.csv): {exc}", exc_info=True)
            contadores["erros"] += 1


def _process_reviews(pasta: Path, contadores: dict) -> None:
    """Processa reviews.csv — preenche review/tags nas sessões já criadas pelo diary.csv.

    Colunas esperadas: Date, Name, Year, Letterboxd URI, Rating, Rewatch, Review, Tags,
    Watched Date

    Nunca cria sessão nova: Diário é estritamente o que vem do diary.csv. Se uma
    linha de reviews.csv não tiver uma sessão correspondente (mesma URI + Watched
    Date) — no export real do Letterboxd isso não deveria acontecer, toda review
    pressupõe uma sessão logada — é contada como erro e logada para investigação,
    mas nada é criado.

    Args:
        pasta: Pasta com os arquivos CSV.
        contadores: Dict de contadores atualizado in-place.
    """
    rows = _read_csv(pasta / "reviews.csv")
    for row in rows:
        letterboxd_uri = row.get("Letterboxd URI") or ""
        title = row.get("Name", "?")
        if not letterboxd_uri:
            contadores["erros"] += 1
            continue

        watched_date = _parse_date(row.get("Watched Date") or row.get("Date"))
        if not watched_date:
            contadores["pulados"] += 1
            continue

        try:
            result = backfill_diary_review(
                letterboxd_uri=letterboxd_uri,
                watched_date=watched_date,
                review=row.get("Review") or None,
                tags=_parse_tags(row.get("Tags")),
            )
            status = result.get("status")
            if status == "updated":
                contadores["atualizados"] += 1
                log.info(f"↻ Review/tags preenchidos: {title}")
            elif status == "skipped":
                contadores["pulados"] += 1
                log.debug(f"○ Review — sessão já tinha review/tags: {title}")
            else:  # "no_session" — review sem sessão de diário correspondente
                contadores["erros"] += 1
                log.warning(
                    f"? Review sem sessão de diário correspondente: {title} "
                    f"({letterboxd_uri}, {watched_date})"
                )
        except Exception as exc:
            log.error(f"Erro ao processar '{title}' (reviews.csv): {exc}", exc_info=True)
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
            # enrich_tmdb repassado explicitamente: sem isso, --no-tmdb não tinha
            # efeito aqui e a watchlist sempre enriquecia via TMDB (bug, spec 050 FR-003)
            result = add_movie(
                title=title,
                year=int(row["Year"]) if row.get("Year", "").isdigit() else None,
                status="watchlist",
                letterboxd_uri=letterboxd_uri,
                source="letterboxd_csv",
                enrich_tmdb=enrich_tmdb,
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


def _process_ratings(pasta: Path, enrich_tmdb: bool, contadores: dict) -> None:
    """Processa ratings.csv — fallback de CATÁLOGO para notas sem sessão no diário.

    Colunas esperadas: Date, Name, Year, Letterboxd URI, Rating

    O Letterboxd permite avaliar um filme sem logar uma sessão de diário (rating
    rápido). Essa nota não implica uma data de assistência real — a coluna "Date"
    aqui é a data em que a nota foi publicada, não quando o filme foi visto. Por
    isso esta função NUNCA cria `diary_entries`: só grava a nota no catálogo
    (`movies.rating`), preenchendo apenas o que ainda estava vazio (não sobrescreve
    uma nota que já veio de uma sessão real via diary.csv).

    Args:
        pasta: Pasta com os arquivos CSV.
        enrich_tmdb: Se deve enriquecer com TMDB (só quando o filme ainda não existe).
        contadores: Dict de contadores atualizado in-place.
    """
    rows = _read_csv(pasta / "ratings.csv")
    for row in rows:
        letterboxd_uri = row.get("Letterboxd URI") or ""
        title = row.get("Name", "")
        if not letterboxd_uri or not title:
            contadores["pulados"] += 1
            continue

        rating = _parse_rating(row.get("Rating"))

        try:
            existing = run_select(
                "SELECT id, rating FROM movies WHERE letterboxd_uri = %(uri)s",
                {"uri": letterboxd_uri},
            )
            if existing:
                # Já catalogado por outra via (diary/reviews/watchlist) — só
                # preenche a nota se ainda estiver vazia; nunca sobrescreve.
                if existing[0]["rating"] is None and rating is not None:
                    run_dml(
                        "UPDATE movies SET rating = %(r)s, rating_source = 'letterboxd' "
                        "WHERE id = %(id)s",
                        {"r": rating, "id": existing[0]["id"]},
                    )
                    contadores["atualizados"] += 1
                    log.info(f"↻ Nota preenchida: {title}")
                else:
                    contadores["pulados"] += 1
                continue

            # Filme genuinamente novo, conhecido só pela nota — sem sessão.
            result = add_movie(
                title=title,
                year=int(row["Year"]) if row.get("Year", "").isdigit() else None,
                status="watched",
                letterboxd_uri=letterboxd_uri,
                source="letterboxd_csv",
                enrich_tmdb=enrich_tmdb,
                rating=rating,
            )
            if result.get("status") == "ok":
                log.info(f"✓ Avaliado (sem sessão): {title}")
                contadores["criados"] += 1
            else:
                log.debug(f"○ Ratings — add_movie retornou '{result.get('status')}': {title}")
                contadores["pulados"] += 1
        except Exception as exc:
            log.error(f"Erro ao processar '{title}' (ratings.csv): {exc}", exc_info=True)
            contadores["erros"] += 1


def _process_watched(pasta: Path, enrich_tmdb: bool, contadores: dict) -> None:
    """Processa watched.csv — fallback para filmes assistidos sem data confiável.

    Colunas esperadas: Name, Year, Letterboxd URI

    Cobre filmes que não aparecem em diary/reviews/ratings (nunca logados com data).
    Registra apenas o filme com status='watched' — sem criar sessão em
    `diary_entries`, já que este arquivo não traz uma data de visualização
    confiável (spec 050, FR-001, decidido no clarify de 2026-07-27).

    Args:
        pasta: Pasta com os arquivos CSV.
        enrich_tmdb: Se deve enriquecer com TMDB.
        contadores: Dict de contadores atualizado in-place.
    """
    rows = _read_csv(pasta / "watched.csv")
    for row in rows:
        letterboxd_uri = row.get("Letterboxd URI") or ""
        title = row.get("Name", "")
        if not letterboxd_uri or not title:
            contadores["pulados"] += 1
            continue

        try:
            # Já catalogado por qualquer via (diary/reviews/watchlist/ratings)? pula.
            existing = run_select(
                "SELECT id FROM movies WHERE letterboxd_uri = %(uri)s",
                {"uri": letterboxd_uri},
            )
            if existing:
                log.debug(f"○ Watched — já existe: {title}")
                contadores["pulados"] += 1
                continue

            result = add_movie(
                title=title,
                year=int(row["Year"]) if row.get("Year", "").isdigit() else None,
                status="watched",
                letterboxd_uri=letterboxd_uri,
                source="letterboxd_csv",
                enrich_tmdb=enrich_tmdb,
            )
            if result.get("status") == "ok":
                log.info(f"✓ Watched (sem sessão): {title}")
                contadores["criados"] += 1
            else:
                log.debug(f"○ Watched — add_movie retornou '{result.get('status')}': {title}")
                contadores["pulados"] += 1

        except Exception as exc:
            log.error(f"Erro ao processar '{title}' (watched.csv): {exc}", exc_info=True)
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

    Processa os CSVs na ordem: diary → reviews → watchlist → ratings → watched.
    Completamente idempotente: rodar múltiplas vezes não cria duplicatas (SC-004).

    `diary.csv` é a ÚNICA fonte de sessões (`diary_entries`) — `reviews.csv` só
    enriquece as sessões já criadas (review/tags); `ratings.csv`/`watched.csv` são
    fallbacks de catálogo (nota/status), nunca criam sessão.

    Dentro do mesmo `watched_date`, as sessões criadas pelo diary.csv recebem
    `created_at` incremental na ordem em que as linhas foram lidas do export
    (spec 050, FR-011) — não dependem do relógio da chamada ao banco.

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

    # Base de tempo + contador compartilhado (FR-011) — cada linha que cria uma
    # sessão consome o próximo valor, garantindo ordem estável dentro do dia.
    ts_base = datetime.now()
    ts_seq = itertools.count()

    # ── 1. diary.csv — única fonte de sessões ──────────────────────────────────
    log.info("=== Fase 1/5: diary.csv ===")
    _process_diary(pasta, enrich_tmdb, contadores, ts_base, ts_seq)

    # ── 2. reviews.csv — preenche review/tags nas sessões já criadas ─────────
    log.info("=== Fase 2/5: reviews.csv ===")
    _process_reviews(pasta, contadores)

    # ── 3. watchlist.csv — filmes para assistir ───────────────────────────────
    log.info("=== Fase 3/5: watchlist.csv ===")
    _process_watchlist(pasta, enrich_tmdb, contadores)

    # ── 4. ratings.csv — fallback de catálogo (nota, sem sessão) ─────────────
    log.info("=== Fase 4/5: ratings.csv (fallback de catálogo) ===")
    _process_ratings(pasta, enrich_tmdb, contadores)

    # ── 5. watched.csv — fallback final, sem sessão (FR-001) ─────────────────
    log.info("=== Fase 5/5: watched.csv (fallback) ===")
    _process_watched(pasta, enrich_tmdb, contadores)

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
