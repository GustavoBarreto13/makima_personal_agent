"""Tools ADK da Mai Sakurajima — séries de TV (fatia 022).

Camada de lógica: cada função é uma tool Google ADK que pode ser chamada
diretamente pelo agente Mai ou pelos endpoints REST (/api/series/*).

Padrão de retorno: sempre dict {"status": "ok"|"error", ...}.
Nunca lançam exceções para o chamador — erros são capturados e retornados
como {"status": "error", "message": "..."}.

Usage:
    from agents.mai.tools import add_series, log_watch, get_stats
    result = add_series(tmdb_id=1396)   # {"status": "ok", "series_id": "..."}
"""

import os
import re
import unicodedata
import uuid
import logging
from datetime import date, datetime
from typing import Optional

# Helpers compartilhados do projeto — mesma conexão PostgreSQL de todos os agentes
from agents.db import get_conn, run_select, run_dml

# Cliente TMDB para busca e enriquecimento de metadados
from agents.mai import metadata as tmdb

# ─── Logger ────────────────────────────────────────────────────────────────

logger = logging.getLogger(__name__)

# ─── Helpers internos ──────────────────────────────────────────────────────

def _ok(**kwargs) -> dict:
    """Monta resposta de sucesso com status='ok' + campos extras.

    Example:
        >>> _ok(series_id="abc")
        {'status': 'ok', 'series_id': 'abc'}
    """
    return {"status": "ok", **kwargs}


def _err(message: str) -> dict:
    """Monta resposta de erro com status='error' + mensagem.

    Example:
        >>> _err("Série não encontrada")
        {'status': 'error', 'message': 'Série não encontrada'}
    """
    return {"status": "error", "message": message}


def _norm(text: str) -> str:
    """Normaliza texto para fuzzy match: minúsculas + sem acentos.

    Usado para popular a coluna `normalizado` e para buscas locais no banco.

    Args:
        text: Qualquer string (título de série, por exemplo).

    Returns:
        String em minúsculas sem caracteres acentuados.

    Example:
        >>> _norm("Olá Mundo!")
        'ola mundo!'
    """
    # Decompõe os caracteres acentuados (ex.: 'é' → 'e' + acento) e filtra os acentos
    return "".join(
        c for c in unicodedata.normalize("NFD", text.lower())
        if unicodedata.category(c) != "Mn"
    )


# Passos válidos de nota: 0.5, 1.0, 1.5, …, 5.0 (10 valores)
_VALID_RATINGS = {i / 2 for i in range(1, 11)}


def _validate_rating(rating: float) -> Optional[str]:
    """Valida se a nota está no intervalo 0.5–5.0 em passos de 0.5.

    Args:
        rating: Valor numérico da nota a validar.

    Returns:
        Mensagem de erro se inválida, None se válida.
    """
    if not (0.5 <= float(rating) <= 5.0):
        return "Nota deve estar entre 0.5 e 5.0"
    if round(float(rating) * 2) / 2 != float(rating):
        return "Nota deve ser múltiplo de 0.5 (ex.: 3.5, 4.0)"
    return None


# ─── Tools ──────────────────────────────────────────────────────────────────


def search_series(query: str) -> dict:
    """Buscar séries no TMDB por texto livre (sem gravar no banco).

    Retorna os resultados do TMDB enriquecidos com flag `in_catalog` para
    indicar se a série já foi adicionada pelo usuário.

    Args:
        query: Nome ou trecho do título (ex.: 'Breaking Bad', 'Dark').

    Returns:
        dict com status='ok' e lista 'results' de até 20 séries TMDB.
        Cada item: tmdb_id, title, title_original, first_air_date, overview,
        poster_url, in_catalog (bool), catalog_id (str|None).
    """
    if not query or not query.strip():
        return _err("Informe um nome de série para buscar")

    try:
        tmdb_results = tmdb.search_tv(query.strip())
    except Exception as exc:
        return _err(f"Erro ao consultar TMDB: {exc}")

    if not tmdb_results:
        return _ok(results=[])

    # Verifica quais tmdb_ids já estão no catálogo do usuário
    tmdb_ids = [r["tmdb_id"] for r in tmdb_results if r.get("tmdb_id")]
    existing: dict = {}
    if tmdb_ids:
        rows = run_select(
            "SELECT id, tmdb_id FROM series WHERE tmdb_id = ANY(%s) AND deleted = FALSE",
            (tmdb_ids,),
        )
        existing = {row["tmdb_id"]: row["id"] for row in rows}

    results = []
    for r in tmdb_results:
        tid = r.get("tmdb_id")
        results.append({
            **r,
            "in_catalog":  tid in existing,
            "catalog_id":  existing.get(tid),
        })

    return _ok(results=results)


def add_series(
    tmdb_id: Optional[int] = None,
    title: Optional[str] = None,
    status: str = "quero_assistir",
) -> dict:
    """Adicionar série ao catálogo, enriquecendo metadados via TMDB.

    Se tmdb_id for fornecido, busca os metadados completos no TMDB.
    Caso contrário, cria entrada manual com o título informado.
    Deduplicação por tmdb_id: se já existir no catálogo, retorna o ID existente.

    Args:
        tmdb_id: ID do show no TMDB (opcional — pode ser None para entrada manual).
        title: Título manual (obrigatório quando tmdb_id=None).
        status: Status inicial. Valores: quero_assistir, assistindo, concluida,
                pausada, abandonada. Default: 'quero_assistir'.

    Returns:
        dict com status='ok', series_id e title da série adicionada.
    """
    valid_statuses = {"quero_assistir", "assistindo", "concluida", "pausada", "abandonada"}
    if status not in valid_statuses:
        return _err(f"Status inválido: '{status}'. Use: {', '.join(valid_statuses)}")

    if tmdb_id is None and not title:
        return _err("Informe tmdb_id ou title para adicionar a série")

    # ── Se tem tmdb_id, verifica se já existe no catálogo ─────────────────
    if tmdb_id:
        existing = run_select(
            "SELECT id, title FROM series WHERE tmdb_id = %s AND deleted = FALSE",
            (tmdb_id,),
        )
        if existing:
            return _ok(
                series_id=existing[0]["id"],
                title=existing[0]["title"],
                already_exists=True,
            )

    # ── Busca metadados no TMDB ────────────────────────────────────────────
    meta: dict = {}
    if tmdb_id:
        try:
            meta = tmdb.get_show(tmdb_id) or {}
        except Exception as exc:
            # Falha no TMDB não impede a inserção — cria com dados mínimos
            logger.warning("TMDB indisponível ao adicionar série %s: %s", tmdb_id, exc)

    # Título de exibição: TMDB (pt-BR) → parâmetro title → fallback
    display_title = meta.get("title") or title or "Série sem título"

    # ── Insere no banco ────────────────────────────────────────────────────
    series_id = str(uuid.uuid4())
    run_dml(
        """
        INSERT INTO series (
            id, tmdb_id, imdb_id, title, title_original, normalizado,
            first_air_date, last_air_date, series_status, network,
            seasons_count, episodes_count, status,
            poster_url, backdrop_url, overview, genres, source
        ) VALUES (
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s, %s, %s
        )
        """,
        (
            series_id,
            tmdb_id,
            meta.get("imdb_id"),
            display_title,
            meta.get("title_original"),
            _norm(display_title),
            meta.get("first_air_date"),
            meta.get("last_air_date"),
            meta.get("series_status"),
            meta.get("network"),
            meta.get("seasons_count"),
            meta.get("episodes_count"),
            status,
            meta.get("poster_url"),
            meta.get("backdrop_url"),
            meta.get("overview"),
            # Converte lista de gêneros para array PostgreSQL
            meta.get("genres") or [],
            "tmdb_sync" if tmdb_id else "manual",
        ),
    )

    return _ok(series_id=series_id, title=display_title)


def log_watch(
    series_id: str,
    watched_date: Optional[str] = None,
    season_number: Optional[int] = None,
    ep_start: Optional[int] = None,
    ep_end: Optional[int] = None,
    episodes_count: Optional[int] = None,
    rating: Optional[float] = None,
    review: Optional[str] = None,
) -> dict:
    """Registrar uma sessão de episódios assistidos.

    Cria uma entrada em `watch_logs` e incrementa `episodes_watched` na série.
    Se season_number + ep_start + ep_end forem informados, também marca os
    episódios individuais como watched=TRUE na tabela `episodes`.

    Args:
        series_id: UUID da série.
        watched_date: Data da sessão (ISO YYYY-MM-DD). Default: hoje.
        season_number: Temporada assistida (opcional).
        ep_start: Primeiro episódio da sessão (opcional).
        ep_end: Último episódio da sessão (opcional, default=ep_start se omitido).
        episodes_count: Número total de eps (alternativo a start/end).
        rating: Nota da sessão 0.5–5.0 (opcional).
        review: Impressões escritas sobre a sessão (opcional).

    Returns:
        dict com status='ok', log_id e episodes_count registrado.
    """
    # Valida que a série existe e não está deletada
    rows = run_select(
        "SELECT id, title, status FROM series WHERE id = %s AND deleted = FALSE",
        (series_id,),
    )
    if not rows:
        return _err(f"Série '{series_id}' não encontrada no catálogo")

    series_title = rows[0]["title"]
    series_status = rows[0]["status"]

    # Valida rating se fornecido
    if rating is not None:
        err = _validate_rating(rating)
        if err:
            return _err(err)

    # Data da sessão — padrão: hoje
    log_date = watched_date or date.today().isoformat()
    try:
        date.fromisoformat(log_date)
    except ValueError:
        return _err(f"Data inválida: '{log_date}'. Use formato YYYY-MM-DD")

    # Calcula episodes_count se não fornecido explicitamente
    if episodes_count is None and ep_start is not None:
        ep_end_calc = ep_end if ep_end is not None else ep_start
        episodes_count = max(1, ep_end_calc - ep_start + 1)

    # ── Insere o log ───────────────────────────────────────────────────────
    log_id = str(uuid.uuid4())
    run_dml(
        """
        INSERT INTO series_watch_logs (
            id, series_id, series_title, watched_date,
            season_number, ep_start, ep_end, episodes_count,
            rating, review, source
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'manual')
        """,
        (
            log_id, series_id, series_title, log_date,
            season_number, ep_start, ep_end, episodes_count,
            rating, review,
        ),
    )

    # ── Incrementa episodes_watched na série ──────────────────────────────
    if episodes_count and episodes_count > 0:
        run_dml(
            "UPDATE series SET episodes_watched = episodes_watched + %s, updated_at = NOW() WHERE id = %s",
            (episodes_count, series_id),
        )

    # ── Marca episódios individuais como watched se ep_start informado ────
    if season_number is not None and ep_start is not None:
        ep_end_mark = ep_end if ep_end is not None else ep_start
        run_dml(
            """
            UPDATE series_episodes
            SET watched = TRUE, watched_date = %s
            WHERE series_id = %s
              AND season_number = %s
              AND episode_number BETWEEN %s AND %s
            """,
            (log_date, series_id, season_number, ep_start, ep_end_mark),
        )

    # ── Atualiza status para 'assistindo' se ainda for 'quero_assistir' ──
    if series_status == "quero_assistir":
        run_dml(
            "UPDATE series SET status = 'assistindo', date_started = %s, updated_at = NOW() WHERE id = %s",
            (log_date, series_id),
        )

    return _ok(log_id=log_id, episodes_count=episodes_count or 0, series_title=series_title)


def update_status(series_id: str, status: str) -> dict:
    """Alterar o status de uma série no catálogo.

    Args:
        series_id: UUID da série.
        status: Novo status. Valores: quero_assistir, assistindo, concluida,
                pausada, abandonada.

    Returns:
        dict com status='ok' e o novo status aplicado.
    """
    valid = {"quero_assistir", "assistindo", "concluida", "pausada", "abandonada"}
    if status not in valid:
        return _err(f"Status inválido. Use: {', '.join(sorted(valid))}")

    rows = run_select(
        "SELECT id FROM series WHERE id = %s AND deleted = FALSE", (series_id,)
    )
    if not rows:
        return _err(f"Série '{series_id}' não encontrada")

    # Registra data_finished automaticamente ao concluir
    if status == "concluida":
        run_dml(
            "UPDATE series SET status = %s, date_finished = NOW()::DATE, updated_at = NOW() WHERE id = %s",
            (status, series_id),
        )
    else:
        run_dml(
            "UPDATE series SET status = %s, updated_at = NOW() WHERE id = %s",
            (status, series_id),
        )

    return _ok(series_id=series_id, new_status=status)


def rate_series(series_id: str, rating: Optional[float]) -> dict:
    """Avaliar uma série (nota 0.5–5.0) ou remover avaliação.

    Args:
        series_id: UUID da série.
        rating: Nota entre 0.5 e 5.0 em passos de 0.5. Passar None remove a nota.

    Returns:
        dict com status='ok' e a nota aplicada.
    """
    rows = run_select(
        "SELECT id FROM series WHERE id = %s AND deleted = FALSE", (series_id,)
    )
    if not rows:
        return _err(f"Série '{series_id}' não encontrada")

    if rating is not None:
        err = _validate_rating(rating)
        if err:
            return _err(err)

    run_dml(
        """
        UPDATE series
        SET rating = %s, rating_source = %s, updated_at = NOW()
        WHERE id = %s
        """,
        (rating, "own" if rating is not None else None, series_id),
    )

    return _ok(series_id=series_id, rating=rating)


def set_notes(series_id: str, notes: str) -> dict:
    """Salvar anotações livres do usuário sobre uma série.

    Diferente do `review` de watch_logs (por sessão), estas notas são
    atemporais e descrevem a série como um todo.

    Args:
        series_id: UUID da série.
        notes: Texto livre de anotações (pode estar vazio para apagar).

    Returns:
        dict com status='ok'.
    """
    rows = run_select(
        "SELECT id FROM series WHERE id = %s AND deleted = FALSE", (series_id,)
    )
    if not rows:
        return _err(f"Série '{series_id}' não encontrada")

    run_dml(
        "UPDATE series SET notes = %s, updated_at = NOW() WHERE id = %s",
        (notes or None, series_id),
    )
    return _ok(series_id=series_id)


def list_series(
    status: Optional[str] = None,
    genre: Optional[str] = None,
    limit: int = 100,
) -> dict:
    """Listar séries do catálogo com filtros opcionais.

    Args:
        status: Filtra por status ('assistindo', 'quero_assistir', etc.).
                None = todos os status.
        genre: Filtra por gênero (ex.: 'Drama'). None = todos.
        limit: Número máximo de resultados. Default: 100.

    Returns:
        dict com status='ok', lista 'series' e 'total'.
    """
    # Constrói a query com filtros dinâmicos
    conditions = ["deleted = FALSE"]
    params: list = []

    if status:
        conditions.append("status = %s")
        params.append(status)

    if genre:
        # `genres` é um array TEXT[] — ANY busca dentro do array
        conditions.append("%s = ANY(genres)")
        params.append(genre)

    where = " AND ".join(conditions)
    params.append(min(limit, 500))  # Limita a 500 para evitar resposta gigante

    rows = run_select(
        f"""
        SELECT id, tmdb_id, title, title_original, first_air_date, last_air_date,
               series_status, network, seasons_count, episodes_count, episodes_watched,
               status, rating, poster_url, genres, tags, notes, date_started,
               date_finished, updated_at
        FROM series
        WHERE {where}
        ORDER BY updated_at DESC
        LIMIT %s
        """,
        params,
    )

    return _ok(series=[dict(r) for r in rows], total=len(rows))


def get_series_detail(series_id: str) -> dict:
    """Retornar detalhe completo de uma série: metadados + temporadas + próximo ep + logs.

    Args:
        series_id: UUID da série.

    Returns:
        dict com status='ok', 'series', 'seasons' (com watched_count),
        'next_episode' (nullable) e 'recent_logs' (últimas 10 sessões).
    """
    # ── Série ──────────────────────────────────────────────────────────────
    rows = run_select(
        "SELECT * FROM series WHERE id = %s AND deleted = FALSE", (series_id,)
    )
    if not rows:
        return _err(f"Série '{series_id}' não encontrada")

    series = dict(rows[0])

    # Converte tipos não-serializáveis para str
    for field in ("first_air_date", "last_air_date", "date_started", "date_finished"):
        if series.get(field):
            series[field] = str(series[field])
    if series.get("created_at"):
        series["created_at"] = series["created_at"].isoformat()
    if series.get("updated_at"):
        series["updated_at"] = series["updated_at"].isoformat()

    # ── Temporadas com watched_count ──────────────────────────────────────
    season_rows = run_select(
        """
        SELECT s.*,
               COUNT(e.id) FILTER (WHERE e.watched = TRUE) AS watched_count
        FROM seasons s
        LEFT JOIN series_episodes e ON e.series_id = s.series_id
                            AND e.season_number = s.season_number
        WHERE s.series_id = %s
        GROUP BY s.id
        ORDER BY s.season_number
        """,
        (series_id,),
    )
    seasons = []
    for r in season_rows:
        s = dict(r)
        if s.get("air_date"):
            s["air_date"] = str(s["air_date"])
        seasons.append(s)

    # ── Próximo episódio não assistido ────────────────────────────────────
    next_ep_rows = run_select(
        """
        SELECT * FROM series_episodes
        WHERE series_id = %s AND watched = FALSE
        ORDER BY season_number, episode_number
        LIMIT 1
        """,
        (series_id,),
    )
    next_episode = None
    if next_ep_rows:
        ne = dict(next_ep_rows[0])
        if ne.get("air_date"):
            ne["air_date"] = str(ne["air_date"])
        if ne.get("watched_date"):
            ne["watched_date"] = str(ne["watched_date"])
        next_episode = ne

    # ── Logs recentes (10 últimas sessões) ────────────────────────────────
    log_rows = run_select(
        """
        SELECT * FROM series_watch_logs
        WHERE series_id = %s
        ORDER BY watched_date DESC, created_at DESC
        LIMIT 10
        """,
        (series_id,),
    )
    recent_logs = []
    for r in log_rows:
        log = dict(r)
        if log.get("watched_date"):
            log["watched_date"] = str(log["watched_date"])
        if log.get("created_at"):
            log["created_at"] = log["created_at"].isoformat()
        recent_logs.append(log)

    return _ok(
        series=series,
        seasons=seasons,
        next_episode=next_episode,
        recent_logs=recent_logs,
    )


def get_watchlist() -> dict:
    """Retornar séries com status 'quero_assistir'.

    Returns:
        dict com status='ok' e lista 'series' ordenada por data de adição (mais recente primeiro).
    """
    rows = run_select(
        """
        SELECT id, tmdb_id, title, title_original, first_air_date,
               series_status, network, genres, poster_url, overview, created_at
        FROM series
        WHERE status = 'quero_assistir' AND deleted = FALSE
        ORDER BY created_at DESC
        """,
        (),
    )
    result = []
    for r in rows:
        s = dict(r)
        if s.get("first_air_date"):
            s["first_air_date"] = str(s["first_air_date"])
        if s.get("created_at"):
            s["created_at"] = s["created_at"].isoformat()
        result.append(s)

    return _ok(series=result)


def get_currently_watching() -> dict:
    """Retornar séries com status 'assistindo' e seus próximos episódios.

    Returns:
        dict com status='ok' e lista 'series', cada item com campo 'next_episode'.
    """
    rows = run_select(
        """
        SELECT id, title, title_original, network, seasons_count, episodes_count,
               episodes_watched, status, rating, poster_url, date_started
        FROM series
        WHERE status = 'assistindo' AND deleted = FALSE
        ORDER BY updated_at DESC
        """,
        (),
    )

    result = []
    for r in rows:
        s = dict(r)
        if s.get("date_started"):
            s["date_started"] = str(s["date_started"])

        # Busca o próximo episódio não assistido para cada série
        ne_rows = run_select(
            """
            SELECT season_number, episode_number, title, air_date, still_url, airing_status
            FROM series_episodes
            WHERE series_id = %s AND watched = FALSE
            ORDER BY season_number, episode_number
            LIMIT 1
            """,
            (s["id"],),
        )
        s["next_episode"] = None
        if ne_rows:
            ne = dict(ne_rows[0])
            if ne.get("air_date"):
                ne["air_date"] = str(ne["air_date"])
            s["next_episode"] = ne

        result.append(s)

    return _ok(series=result)


def get_diary(limit: int = 50) -> dict:
    """Retornar o diário de sessões em ordem cronológica inversa.

    Args:
        limit: Máximo de sessões retornadas. Default: 50.

    Returns:
        dict com status='ok' e lista 'logs' de watch_logs com metadados da série.
    """
    limit = min(max(1, limit), 200)  # Garante range razoável

    rows = run_select(
        """
        SELECT wl.*,
               s.poster_url, s.status AS series_status
        FROM series_watch_logs wl
        JOIN series s ON s.id = wl.series_id
        WHERE s.deleted = FALSE
        ORDER BY wl.watched_date DESC, wl.created_at DESC
        LIMIT %s
        """,
        (limit,),
    )

    logs = []
    for r in rows:
        log = dict(r)
        if log.get("watched_date"):
            log["watched_date"] = str(log["watched_date"])
        if log.get("created_at"):
            log["created_at"] = log["created_at"].isoformat()
        logs.append(log)

    return _ok(logs=logs)


def get_upcoming() -> dict:
    """Retornar episódios futuros de séries com status 'assistindo'.

    Lista episódios com air_date >= hoje de séries que o usuário está
    assistindo, ordenados por data crescente.

    Returns:
        dict com status='ok' e lista 'upcoming' de episódios agendados.
    """
    rows = run_select(
        """
        SELECT e.series_id, s.title AS series_title, s.poster_url,
               e.season_number, e.episode_number, e.title,
               e.air_date, e.still_url
        FROM series_episodes e
        JOIN series s ON s.id = e.series_id
        WHERE s.status = 'assistindo'
          AND s.deleted = FALSE
          AND e.airing_status = 'agendado'
          AND e.air_date >= NOW()::DATE
          AND e.watched = FALSE
        ORDER BY e.air_date, s.title
        LIMIT 50
        """,
        (),
    )

    upcoming = []
    for r in rows:
        item = dict(r)
        if item.get("air_date"):
            item["air_date"] = str(item["air_date"])
        upcoming.append(item)

    return _ok(upcoming=upcoming)


def get_stats(year: Optional[int] = None) -> dict:
    """Retornar estatísticas anuais de séries assistidas.

    Args:
        year: Ano a consultar. Default: ano atual.

    Returns:
        dict com status='ok' e campos: total_series, total_episodes, total_hours,
        avg_rating, top_genres, top_networks, by_status, monthly (12 valores).
    """
    target_year = year or date.today().year

    # ── Total de séries com log no ano ───────────────────────────────────
    series_count = run_select(
        """
        SELECT COUNT(DISTINCT series_id) AS cnt
        FROM series_watch_logs
        WHERE EXTRACT(YEAR FROM watched_date) = %s
        """,
        (target_year,),
    )
    total_series = series_count[0]["cnt"] if series_count else 0

    # ── Total de episódios (soma dos episodes_count dos logs) ─────────────
    ep_count = run_select(
        """
        SELECT COALESCE(SUM(episodes_count), 0) AS cnt
        FROM series_watch_logs
        WHERE EXTRACT(YEAR FROM watched_date) = %s
        """,
        (target_year,),
    )
    total_episodes = ep_count[0]["cnt"] if ep_count else 0

    # ── Nota média das sessões com avaliação ──────────────────────────────
    avg_rows = run_select(
        """
        SELECT ROUND(AVG(rating)::numeric, 2) AS avg
        FROM series_watch_logs
        WHERE EXTRACT(YEAR FROM watched_date) = %s AND rating IS NOT NULL
        """,
        (target_year,),
    )
    avg_rating = float(avg_rows[0]["avg"]) if avg_rows and avg_rows[0]["avg"] else None

    # ── Top gêneros (das séries com log no ano) ────────────────────────────
    genre_rows = run_select(
        """
        SELECT g AS genre, COUNT(*) AS cnt
        FROM (
            SELECT DISTINCT wl.series_id
            FROM series_watch_logs wl
            WHERE EXTRACT(YEAR FROM wl.watched_date) = %s
        ) ld
        JOIN series s ON s.id = ld.series_id
        CROSS JOIN UNNEST(s.genres) AS g
        GROUP BY g
        ORDER BY cnt DESC
        LIMIT 5
        """,
        (target_year,),
    )
    top_genres = [{"genre": r["genre"], "count": r["cnt"]} for r in genre_rows]

    # ── Top networks (das séries com log no ano) ───────────────────────────
    net_rows = run_select(
        """
        SELECT s.network, COUNT(*) AS cnt
        FROM (
            SELECT DISTINCT wl.series_id
            FROM series_watch_logs wl
            WHERE EXTRACT(YEAR FROM wl.watched_date) = %s
        ) ld
        JOIN series s ON s.id = ld.series_id
        WHERE s.network IS NOT NULL
        GROUP BY s.network
        ORDER BY cnt DESC
        LIMIT 5
        """,
        (target_year,),
    )
    top_networks = [{"network": r["network"], "count": r["cnt"]} for r in net_rows]

    # ── Distribuição por status (no momento atual, não histórico) ──────────
    status_rows = run_select(
        "SELECT status, COUNT(*) AS cnt FROM series WHERE deleted = FALSE GROUP BY status",
        (),
    )
    by_status = {r["status"]: r["cnt"] for r in status_rows}

    # ── Episódios por mês (array de 12 valores) ────────────────────────────
    monthly_rows = run_select(
        """
        SELECT EXTRACT(MONTH FROM watched_date) AS month,
               COALESCE(SUM(episodes_count), 0) AS cnt
        FROM series_watch_logs
        WHERE EXTRACT(YEAR FROM watched_date) = %s
        GROUP BY month
        ORDER BY month
        """,
        (target_year,),
    )
    monthly_map = {int(r["month"]): int(r["cnt"]) for r in monthly_rows}
    # Preenche meses sem dados com 0 — sempre retorna 12 elementos (jan=índice 0)
    monthly = [monthly_map.get(m, 0) for m in range(1, 13)]

    # Estimativa de horas: ~50 minutos por episódio
    total_hours = round(int(total_episodes) * 50 / 60, 1)

    # ── Sessões por dia (heatmap) — contagem de logs por data no ano ──────────
    # Retorna somente os dias COM sessão; dias vazios são preenchidos em Python.
    daily_rows = run_select(
        """
        SELECT watched_date, COUNT(*) AS cnt
        FROM series_watch_logs
        WHERE EXTRACT(YEAR FROM watched_date) = %s
        GROUP BY watched_date
        ORDER BY watched_date
        """,
        (target_year,),
    )
    # Mapa data_iso → contagem (apenas os dias que têm sessão)
    daily_map = {str(r["watched_date"]): int(r["cnt"]) for r in daily_rows}

    # Gera array contíguo de 1º/jan até 31/dez (ou até hoje no ano corrente)
    from datetime import timedelta  # import local — evita poluir o topo do módulo
    start_date = date(target_year, 1, 1)
    end_date = min(date(target_year, 12, 31), date.today())
    daily: list[dict] = []
    cursor = start_date
    while cursor <= end_date:
        iso = str(cursor)
        daily.append({"date": iso, "count": daily_map.get(iso, 0)})
        cursor += timedelta(days=1)

    # ── Destaque do ano — série mais bem avaliada com logs no ano ────────────
    # Critério primário: rating DESC; critério secundário: episódios assistidos no ano DESC.
    highlight_rows = run_select(
        """
        SELECT s.id, s.title, s.poster_url, s.rating, s.network,
               COALESCE(SUM(wl.episodes_count), 0) AS episodes_year,
               COUNT(wl.id)                          AS sessions_year
        FROM series_watch_logs wl
        JOIN series s ON s.id = wl.series_id
        WHERE EXTRACT(YEAR FROM wl.watched_date) = %s
          AND s.deleted = FALSE
        GROUP BY s.id, s.title, s.poster_url, s.rating, s.network
        ORDER BY s.rating DESC NULLS LAST,
                 SUM(wl.episodes_count) DESC
        LIMIT 1
        """,
        (target_year,),
    )
    highlight = None
    if highlight_rows:
        r = highlight_rows[0]
        highlight = {
            "id":            r["id"],
            "title":         r["title"],
            "poster_url":    r["poster_url"],
            "rating":        float(r["rating"]) if r["rating"] is not None else None,
            "network":       r["network"],
            "episodes_year": int(r["episodes_year"]),
            "sessions_year": int(r["sessions_year"]),
        }

    return _ok(
        year=target_year,
        total_series=int(total_series),
        total_episodes=int(total_episodes),
        total_hours=total_hours,
        avg_rating=avg_rating,
        top_genres=top_genres,
        top_networks=top_networks,
        by_status=by_status,
        monthly=monthly,
        daily=daily,
        highlight=highlight,
    )


def delete_series(series_id: str) -> dict:
    """Soft delete de uma série (marca deleted=TRUE, preserva watch_logs).

    Args:
        series_id: UUID da série.

    Returns:
        dict com status='ok' e o título da série removida.
    """
    rows = run_select(
        "SELECT title FROM series WHERE id = %s AND deleted = FALSE", (series_id,)
    )
    if not rows:
        return _err(f"Série '{series_id}' não encontrada ou já removida")

    title = rows[0]["title"]
    run_dml(
        "UPDATE series SET deleted = TRUE, updated_at = NOW() WHERE id = %s",
        (series_id,),
    )
    return _ok(series_id=series_id, title=title)


def sync_metadata(series_id: str) -> dict:
    """Sincronizar metadados TMDB de uma série (temporadas + episódios).

    Busca os dados atualizados no TMDB e aplica upserts com skip-logic
    incremental (episódios já finalizados no passado são ignorados).

    Args:
        series_id: UUID da série.

    Returns:
        dict com status='ok' e contadores: seasons_synced, episodes_upserted,
        episodes_skipped.
    """
    rows = run_select(
        "SELECT tmdb_id, title, seasons_count FROM series WHERE id = %s AND deleted = FALSE",
        (series_id,),
    )
    if not rows:
        return _err(f"Série '{series_id}' não encontrada")

    series = rows[0]
    tmdb_id = series["tmdb_id"]

    if not tmdb_id:
        return _err("Esta série não tem tmdb_id — não é possível sincronizar metadados")

    # Atualiza os campos do show principal no TMDB
    try:
        meta = tmdb.get_show(tmdb_id)
        if not meta:
            return _err(f"TMDB não encontrou o show com ID {tmdb_id}")
    except Exception as exc:
        return _err(f"Erro ao consultar TMDB: {exc}")

    # Atualiza campos atualizáveis da série
    run_dml(
        """
        UPDATE series SET
            title          = %s,
            title_original = %s,
            normalizado    = %s,
            last_air_date  = %s,
            series_status  = %s,
            network        = %s,
            seasons_count  = %s,
            episodes_count = %s,
            poster_url     = %s,
            backdrop_url   = %s,
            overview       = %s,
            genres         = %s,
            updated_at     = NOW()
        WHERE id = %s
        """,
        (
            meta["title"],
            meta.get("title_original"),
            _norm(meta["title"]),
            meta.get("last_air_date"),
            meta.get("series_status"),
            meta.get("network"),
            meta.get("seasons_count"),
            meta.get("episodes_count"),
            meta.get("poster_url"),
            meta.get("backdrop_url"),
            meta.get("overview"),
            meta.get("genres") or [],
            series_id,
        ),
    )

    # Sincroniza temporadas e episódios via skip-logic incremental
    seasons_count = meta.get("seasons_count") or 0
    if seasons_count == 0:
        return _ok(series_id=series_id, seasons_synced=0, episodes_upserted=0, episodes_skipped=0)

    try:
        with get_conn() as conn:
            stats = tmdb.sync_seasons(conn, series_id, tmdb_id, seasons_count)
            conn.commit()
    except Exception as exc:
        return _err(f"Erro ao sincronizar temporadas: {exc}")

    return _ok(series_id=series_id, **stats)


def set_episode_watched(
    series_id: str,
    season_number: int,
    episode_number: int,
    watched: bool,
) -> dict:
    """Marcar ou desmarcar um episódio individual como assistido.

    Atualiza series_episodes.watched e ajusta o contador episodes_watched
    da série. Operação idempotente: se o episódio já está no estado
    desejado, retorna ok sem alterar o banco.

    Não cria entrada no Diário — use log_watch para sessões com nota/review.

    Args:
        series_id: UUID da série.
        season_number: Número da temporada (>= 1).
        episode_number: Número do episódio dentro da temporada.
        watched: True para marcar como assistido, False para desmarcar.

    Returns:
        dict com status='ok', watched, episodes_watched (novo valor do contador)
        e changed (bool indicando se o estado foi alterado).
    """
    # Valida que a série existe e não está deletada
    series_rows = run_select(
        "SELECT id, status, episodes_watched FROM series WHERE id = %s AND deleted = FALSE",
        (series_id,),
    )
    if not series_rows:
        return _err(f"Série '{series_id}' não encontrada")

    series_data = series_rows[0]

    # Busca o episódio específico pelo identificador único (series_id, season, episode)
    ep_rows = run_select(
        """
        SELECT watched FROM series_episodes
        WHERE series_id = %s AND season_number = %s AND episode_number = %s
        """,
        (series_id, season_number, episode_number),
    )
    if not ep_rows:
        return _err(f"Episódio T{season_number}E{episode_number} não encontrado no cache — execute sync_metadata primeiro")

    # Idempotência: se já está no estado desejado, não faz nada no banco
    current_watched = bool(ep_rows[0]["watched"])
    if current_watched == watched:
        return _ok(
            series_id=series_id,
            season_number=season_number,
            episode_number=episode_number,
            watched=watched,
            episodes_watched=int(series_data["episodes_watched"] or 0),
            changed=False,  # nenhuma alteração foi feita
        )

    # Atualiza watched + watched_date no episódio:
    #   - marcar: preenche watched_date com a data de hoje
    #   - desmarcar: limpa watched_date (NULL)
    run_dml(
        """
        UPDATE series_episodes
        SET watched = %s,
            watched_date = CASE WHEN %s THEN CURRENT_DATE ELSE NULL END
        WHERE series_id = %s AND season_number = %s AND episode_number = %s
        """,
        (watched, watched, series_id, season_number, episode_number),
    )

    # Ajusta o contador de episódios assistidos na série
    if watched:
        # Marcar como assistido → incrementa o contador
        run_dml(
            "UPDATE series SET episodes_watched = episodes_watched + 1, updated_at = NOW() WHERE id = %s",
            (series_id,),
        )
    else:
        # Desmarcar → decrementa, mas GREATEST garante que não vai abaixo de zero
        run_dml(
            "UPDATE series SET episodes_watched = GREATEST(episodes_watched - 1, 0), updated_at = NOW() WHERE id = %s",
            (series_id,),
        )

    # Se marcou como assistido e a série ainda era 'quero_assistir', avança para 'assistindo'
    # automaticamente (mesma lógica do log_watch)
    if watched and series_data["status"] == "quero_assistir":
        run_dml(
            "UPDATE series SET status = 'assistindo', date_started = CURRENT_DATE, updated_at = NOW() WHERE id = %s",
            (series_id,),
        )

    # Busca o novo valor do contador para retornar ao frontend (para atualizar a barra de progresso)
    updated = run_select(
        "SELECT episodes_watched FROM series WHERE id = %s",
        (series_id,),
    )
    new_count = int(updated[0]["episodes_watched"]) if updated and updated[0]["episodes_watched"] is not None else 0

    return _ok(
        series_id=series_id,
        season_number=season_number,
        episode_number=episode_number,
        watched=watched,
        episodes_watched=new_count,
        changed=True,  # o estado foi alterado
    )


def get_episodes_for_season(series_id: str, season_number: int) -> dict:
    """Retornar episódios de uma temporada, sincronizando do TMDB se necessário.

    Se a temporada não tiver episódios no cache local, aciona o sync antes
    de retornar — garantindo que o acordeão de temporadas sempre mostre dados.

    Args:
        series_id: UUID da série.
        season_number: Número da temporada (1-based, >= 1).

    Returns:
        dict com status='ok' e lista 'episodes' da temporada.
    """
    if season_number < 1:
        return _err("Número de temporada deve ser >= 1 (temporada 0 = Specials não é suportada)")

    # Verifica se a série existe
    series_rows = run_select(
        "SELECT id, tmdb_id, seasons_count FROM series WHERE id = %s AND deleted = FALSE",
        (series_id,),
    )
    if not series_rows:
        return _err(f"Série '{series_id}' não encontrada")

    series = series_rows[0]

    # Busca episódios do cache local
    ep_rows = run_select(
        """
        SELECT * FROM series_episodes
        WHERE series_id = %s AND season_number = %s
        ORDER BY episode_number
        """,
        (series_id, season_number),
    )

    # Se não há cache e há tmdb_id, sincroniza a temporada agora
    if not ep_rows and series["tmdb_id"]:
        try:
            season_data = tmdb.get_season(series["tmdb_id"], season_number)
            if season_data:
                with get_conn() as conn:
                    # Usa sync_seasons com range limitado a esta temporada
                    import psycopg2.extras  # noqa: PLC0415
                    with conn.cursor() as cur:
                        # Upserta apenas esta temporada
                        cur.execute(
                            """
                            INSERT INTO seasons (id, series_id, season_number, name,
                                                 episode_count, air_date, overview, poster_url)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (series_id, season_number) DO UPDATE SET
                                name          = EXCLUDED.name,
                                episode_count = EXCLUDED.episode_count,
                                overview      = EXCLUDED.overview,
                                poster_url    = EXCLUDED.poster_url
                            """,
                            (
                                str(uuid.uuid4()), series_id, season_number,
                                season_data["name"], season_data["episode_count"],
                                season_data["air_date"], season_data["overview"],
                                season_data["poster_url"],
                            ),
                        )
                        # Insere os episódios da temporada
                        for ep in season_data["episodes"]:
                            if ep["episode_number"] is None:
                                continue
                            cur.execute(
                                """
                                INSERT INTO series_episodes (id, series_id, season_number, episode_number,
                                                     title, air_date, overview, still_url, airing_status)
                                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                                ON CONFLICT (series_id, season_number, episode_number) DO NOTHING
                                """,
                                (
                                    str(uuid.uuid4()), series_id, season_number,
                                    ep["episode_number"], ep["title"], ep["air_date"],
                                    ep["overview"], ep["still_url"], ep["airing_status"],
                                ),
                            )
                    conn.commit()
        except Exception as exc:
            logger.warning("Falha ao sincronizar T%d da série %s: %s", season_number, series_id, exc)

        # Busca novamente do banco após sync
        ep_rows = run_select(
            "SELECT * FROM series_episodes WHERE series_id = %s AND season_number = %s ORDER BY episode_number",
            (series_id, season_number),
        )

    episodes = []
    for r in ep_rows:
        ep = dict(r)
        if ep.get("air_date"):
            ep["air_date"] = str(ep["air_date"])
        if ep.get("watched_date"):
            ep["watched_date"] = str(ep["watched_date"])
        episodes.append(ep)

    return _ok(episodes=episodes, season_number=season_number)
