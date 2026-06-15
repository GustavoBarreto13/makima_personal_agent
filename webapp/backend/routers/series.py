"""Router de séries de TV (Mai) — expõe as tools como endpoints REST.

Camada fina: cada endpoint é uma chamada direta à tool correspondente
em agents.mai.tools. Lógica de negócio fica sempre nas tools — não aqui.

IMPORTANTE: rotas com path fixo (search, watchlist, diary, upcoming, stats)
DEVEM ser registradas ANTES de /{series_id} para não serem interpretadas
como IDs de séries pelo FastAPI.

Usage:
    # Em main.py:
    from webapp.backend.routers import series as series_router
    app.include_router(series_router.router, prefix="/api/series", tags=["series"])
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from webapp.backend.deps import require_user

# ── Tools da Mai — importadas diretamente (sem instanciar agente ADK) ─────────
from agents.mai.tools import (
    search_series,
    add_series,
    log_watch,
    update_status,
    rate_series,
    set_notes,
    list_series,
    get_series_detail,
    get_watchlist,
    get_diary,
    get_upcoming,
    get_stats,
    delete_series,
    sync_metadata,
    get_episodes_for_season,
    set_episode_watched,  # toggle de episódio individual (checkbox da DetailScreen)
)


# ─── Helper de resultado ────────────────────────────────────────────────────

def _check_result(result: dict) -> dict:
    """Converte resposta de erro das tools em HTTP 400; deixa 'ok' passar.

    As tools da Mai retornam {"status": "ok"|"error", "message": ...}.
    Centraliza a conversão de "error" → HTTPException 400.

    Args:
        result: Dict retornado por uma tool da Mai.

    Returns:
        O mesmo dict se status == "ok".

    Raises:
        HTTPException: 400 se status == "error".
    """
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message", "Erro desconhecido."))
    return result


# ─── Router ─────────────────────────────────────────────────────────────────

# O prefixo "/api/series" é adicionado em main.py
router = APIRouter()


# ════════════════════════════════════════════════════════════════════════════
# MODELOS PYDANTIC — Validação dos bodies POST/PATCH
# ════════════════════════════════════════════════════════════════════════════

class AddSeriesBody(BaseModel):
    """Body para adicionar uma série ao catálogo."""
    tmdb_id: Optional[int] = None      # ID TMDB — enriquece metadados automaticamente
    title: Optional[str] = None        # Título manual (quando tmdb_id é None)
    status: str = "quero_assistir"     # Status inicial


class LogWatchBody(BaseModel):
    """Body para registrar uma sessão de episódios assistidos."""
    watched_date: Optional[str] = None    # Data YYYY-MM-DD (padrão: hoje)
    season_number: Optional[int] = None   # Temporada assistida
    ep_start: Optional[int] = None        # Primeiro episódio da sessão
    ep_end: Optional[int] = None          # Último episódio da sessão
    episodes_count: Optional[int] = None  # Qtd de eps (alternativo a start/end)
    rating: Optional[float] = None        # Nota 0.5–5.0 (opcional)
    review: Optional[str] = None          # Impressões da sessão (opcional)


class UpdateStatusBody(BaseModel):
    """Body para alterar o status de uma série."""
    status: str  # quero_assistir | assistindo | concluida | pausada | abandonada


class RateSeriesBody(BaseModel):
    """Body para definir a nota de uma série."""
    rating: Optional[float] = None  # 0.5–5.0 ou None para remover nota


class SetNotesBody(BaseModel):
    """Body para salvar anotações livres do usuário."""
    notes: str  # Texto das anotações (pode ser '' para limpar)


class ToggleEpisodeBody(BaseModel):
    """Body para marcar/desmarcar um episódio individual como assistido.

    Usado pelo checkbox da linha de episódio no SeasonAccordion (DetailScreen).
    Não cria entrada no Diário — apenas atualiza series_episodes.watched.
    """
    watched: bool  # True = marcar como assistido; False = desmarcar


# ════════════════════════════════════════════════════════════════════════════
# ROTAS FIXAS — DEVEM VIR ANTES DE /{series_id}
# O FastAPI roteia em ordem de registro; "search", "watchlist" etc. viriam
# depois do /{series_id} se não fossem registradas primeiro, e o FastAPI
# os trataria como UUIDs, resultando em erros 400 ou 404 incorretos.
# ════════════════════════════════════════════════════════════════════════════

# ── Busca no TMDB ────────────────────────────────────────────────────────────

@router.get("/search")
def search_endpoint(
    q: str = Query(..., description="Texto para buscar séries no TMDB"),
    user: dict = Depends(require_user),
) -> dict:
    """Buscar séries no TMDB por título (para o AddSeriesModal da UI).

    Não grava nada no banco — consulta ao TMDB para o usuário escolher
    qual série adicionar. Retorna flag in_catalog.

    Args:
        q: Texto de busca.
        user: Usuário autenticado.

    Returns:
        Dict com 'results': lista de séries TMDB com in_catalog e catalog_id.
    """
    return _check_result(search_series(q))


# ── Listagens fixas ─────────────────────────────────────────────────────────

@router.get("")
def list_series_endpoint(
    status: Optional[str] = Query(default=None, description="Filtrar por status"),
    genre: Optional[str] = Query(default=None, description="Filtrar por gênero"),
    limit: int = Query(default=100, description="Máximo de resultados"),
    user: dict = Depends(require_user),
) -> dict:
    """Listar catálogo de séries com filtros opcionais.

    Args:
        status: Status ('assistindo', 'quero_assistir', etc.). None = todos.
        genre: Gênero (match exato). None = todos.
        limit: Máximo de séries a retornar.
        user: Usuário autenticado.

    Returns:
        Dict com 'series' e 'total'.
    """
    return _check_result(list_series(status=status, genre=genre, limit=limit))


@router.get("/watchlist")
def get_watchlist_endpoint(user: dict = Depends(require_user)) -> dict:
    """Retornar séries com status 'quero_assistir'.

    Returns:
        Dict com 'series' ordenadas por data de adição (mais recente primeiro).
    """
    return _check_result(get_watchlist())


@router.get("/diary")
def get_diary_endpoint(
    limit: int = Query(default=50, description="Número de sessões a retornar"),
    user: dict = Depends(require_user),
) -> dict:
    """Retornar o diário de sessões em ordem cronológica decrescente.

    Args:
        limit: Máximo de sessões (padrão 50, máximo 200).
        user: Usuário autenticado.

    Returns:
        Dict com 'logs': lista de watch_logs com poster_url da série.
    """
    return _check_result(get_diary(limit=limit))


@router.get("/upcoming")
def get_upcoming_endpoint(user: dict = Depends(require_user)) -> dict:
    """Retornar episódios futuros de séries 'assistindo'.

    Returns:
        Dict com 'upcoming': lista de episódios agendados (air_date >= hoje).
    """
    return _check_result(get_upcoming())


@router.get("/stats")
def get_stats_endpoint(
    year: Optional[int] = Query(default=None, description="Ano de referência (padrão: ano atual)"),
    user: dict = Depends(require_user),
) -> dict:
    """Retornar estatísticas anuais de séries assistidas.

    Args:
        year: Ano (padrão: ano atual).
        user: Usuário autenticado.

    Returns:
        Dict com total_series, total_episodes, total_hours, avg_rating,
        top_genres, top_networks, by_status, monthly (12 valores).
    """
    return _check_result(get_stats(year=year))


# ── Criação ──────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
def add_series_endpoint(
    body: AddSeriesBody,
    user: dict = Depends(require_user),
) -> dict:
    """Adicionar uma série ao catálogo.

    Enriquece metadados via TMDB se tmdb_id for fornecido.
    Deduplicação automática por tmdb_id (retorna série existente).

    Args:
        body: tmdb_id + status ou title + status.
        user: Usuário autenticado.

    Returns:
        Dict com 'series_id', 'title' e 'already_exists' (bool).
    """
    return _check_result(
        add_series(
            tmdb_id=body.tmdb_id,
            title=body.title,
            status=body.status,
        )
    )


# ════════════════════════════════════════════════════════════════════════════
# ROTAS COM {series_id} — registradas DEPOIS das fixas
# ════════════════════════════════════════════════════════════════════════════

@router.get("/{series_id}")
def get_detail_endpoint(
    series_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Retornar detalhe completo de uma série.

    Inclui: metadados + temporadas (com watched_count) + próximo episódio
    não assistido + 10 sessões mais recentes.

    Args:
        series_id: UUID da série.
        user: Usuário autenticado.

    Returns:
        Dict com 'series', 'seasons', 'next_episode' e 'recent_logs'.
    """
    return _check_result(get_series_detail(series_id))


@router.post("/{series_id}/log", status_code=201)
def log_watch_endpoint(
    series_id: str,
    body: LogWatchBody,
    user: dict = Depends(require_user),
) -> dict:
    """Registrar uma sessão de episódios assistidos.

    Incrementa episodes_watched na série e marca episódios individuais
    como watched quando season_number + ep_start/ep_end são informados.

    Args:
        series_id: UUID da série.
        body: Dados da sessão (data, temporada, eps, nota, review).
        user: Usuário autenticado.

    Returns:
        Dict com 'log_id' e 'episodes_count' registrados.
    """
    return _check_result(
        log_watch(
            series_id=series_id,
            watched_date=body.watched_date,
            season_number=body.season_number,
            ep_start=body.ep_start,
            ep_end=body.ep_end,
            episodes_count=body.episodes_count,
            rating=body.rating,
            review=body.review,
        )
    )


@router.patch("/{series_id}/status")
def update_status_endpoint(
    series_id: str,
    body: UpdateStatusBody,
    user: dict = Depends(require_user),
) -> dict:
    """Alterar o status de uma série.

    Args:
        series_id: UUID da série.
        body: Novo status.
        user: Usuário autenticado.

    Returns:
        Dict com 'series_id' e 'new_status'.
    """
    return _check_result(update_status(series_id=series_id, status=body.status))


@router.patch("/{series_id}/rating")
def rate_series_endpoint(
    series_id: str,
    body: RateSeriesBody,
    user: dict = Depends(require_user),
) -> dict:
    """Definir ou remover a nota de uma série.

    Args:
        series_id: UUID da série.
        body: rating (0.5–5.0) ou None para remover.
        user: Usuário autenticado.

    Returns:
        Dict com 'series_id' e 'rating'.
    """
    return _check_result(rate_series(series_id=series_id, rating=body.rating))


@router.patch("/{series_id}/notes")
def set_notes_endpoint(
    series_id: str,
    body: SetNotesBody,
    user: dict = Depends(require_user),
) -> dict:
    """Salvar anotações livres sobre uma série.

    Args:
        series_id: UUID da série.
        body: Texto das anotações.
        user: Usuário autenticado.

    Returns:
        Dict com status='ok'.
    """
    return _check_result(set_notes(series_id=series_id, notes=body.notes))


@router.post("/{series_id}/sync-metadata", status_code=202)
def sync_metadata_endpoint(
    series_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Sincronizar metadados TMDB de uma série.

    Atualiza campos do show e aplica upserts de temporadas + episódios
    com skip-logic incremental (episódios já encerrados são ignorados).

    Args:
        series_id: UUID da série.
        user: Usuário autenticado.

    Returns:
        Dict com contadores: seasons_synced, episodes_upserted, episodes_skipped.
    """
    return _check_result(sync_metadata(series_id=series_id))


@router.delete("/{series_id}", status_code=200)
def delete_series_endpoint(
    series_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Soft delete de uma série (preserva watch_logs).

    Args:
        series_id: UUID da série.
        user: Usuário autenticado.

    Returns:
        Dict com 'series_id' e 'title' da série removida.
    """
    return _check_result(delete_series(series_id=series_id))


@router.patch("/{series_id}/episodes/{season_number}/{episode_number}")
def toggle_episode_endpoint(
    series_id: str,
    season_number: int,
    episode_number: int,
    body: ToggleEpisodeBody,
    user: dict = Depends(require_user),
) -> dict:
    """Marcar ou desmarcar um episódio individual como assistido.

    Atualiza series_episodes.watched e ajusta series.episodes_watched.
    Idempotente: chamar duas vezes com o mesmo estado não altera nada no banco.

    Diferente do log_watch, este endpoint NÃO cria entrada no Diário.
    Serve exclusivamente para o checkbox de progresso na DetailScreen.

    Args:
        series_id: UUID da série.
        season_number: Número da temporada.
        episode_number: Número do episódio.
        body: Novo estado watched (true/false).
        user: Usuário autenticado.

    Returns:
        Dict com watched, episodes_watched (novo total da série) e changed (bool).
    """
    return _check_result(
        set_episode_watched(
            series_id=series_id,
            season_number=season_number,
            episode_number=episode_number,
            watched=body.watched,
        )
    )


@router.get("/{series_id}/seasons/{season_number}/episodes")
def get_episodes_endpoint(
    series_id: str,
    season_number: int,
    user: dict = Depends(require_user),
) -> dict:
    """Retornar episódios de uma temporada.

    Se a temporada não tiver cache local, sincroniza via TMDB antes
    de responder — garantindo dados no acordeão SeasonAccordion.

    Args:
        series_id: UUID da série.
        season_number: Número da temporada (>= 1).
        user: Usuário autenticado.

    Returns:
        Dict com 'episodes' e 'season_number'.
    """
    return _check_result(
        get_episodes_for_season(series_id=series_id, season_number=season_number)
    )
