"""Router de animes (Marin) — expõe as tools como endpoints REST.

Camada fina: cada endpoint é exatamente uma chamada à tool correspondente
em agents.marin.tools. Nenhuma lógica de domínio aqui — regras ficam nas tools.

As tools retornam {"status": "ok"|"error", ...}. A função _check_result()
converte status="error" em HTTP 400, evitando repetição em cada endpoint.

IMPORTANTE — Ordem de registro no FastAPI:
    Paths fixos (/search, /watchlist, /diary, /home, etc.) DEVEM vir antes de
    /{anime_id}, senão FastAPI trata "watchlist" como um anime_id.

Usage:
    # Em webapp/backend/main.py:
    from webapp.backend.routers import animes as animes_router
    app.include_router(animes_router.router, prefix="/api/animes", tags=["animes"])
"""

# Optional permite campos opcionais nos modelos Pydantic
from typing import Optional

# Imports do FastAPI para construir o router e parâmetros de query
from fastapi import APIRouter, Depends, HTTPException, Query

# BaseModel é a base de todos os modelos Pydantic (validação de bodies)
from pydantic import BaseModel

# require_user bloqueia rotas não autenticadas — obrigatório em TODA rota /api/*
from webapp.backend.deps import require_user

# ─── Tools da Marin — importadas diretamente (sem instanciar agente ADK) ────
from agents.marin.tools import (
    # Busca externa (Jikan/MAL)
    search_anime,
    # Catálogo
    add_anime,
    delete_anime,
    # Sessões de episódios
    log_watch,
    delete_watch_log,
    # Atualização de catálogo
    update_anime_status,
    rate_anime,
    # Consultas
    get_currently_watching,
    get_watchlist,
    get_watch_history,
    get_anime_details,
    get_airing_schedule,
    get_stats,
    get_home,
    # Sincronização MAL
    sync_mal,
)

# Importação de run_select para a paginação de episódios (query thin sem lógica de domínio)
from agents.db import run_select


# ─── Helper de resultado ─────────────────────────────────────────────────────

def _check_result(result: dict) -> dict:
    """Converte dict de erro das tools em HTTP 400; deixa "ok" passar.

    As tools da Marin retornam {"status": "ok"|"error", "message": ...}.
    Esta função centraliza a conversão evitando repetição em cada endpoint.

    Args:
        result: Dict retornado por uma tool da Marin.

    Returns:
        O mesmo dict de resultado se status for "ok".

    Raises:
        HTTPException: 400 se status == "error".
    """
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message", "Erro desconhecido."))
    return result


# ─── Criação do router ───────────────────────────────────────────────────────
# O prefixo "/api/animes" é adicionado em main.py quando este router é incluído
router = APIRouter()


# ═════════════════════════════════════════════════════════════════════════════
# MODELOS PYDANTIC — Validação dos corpos das requisições POST/PATCH
# ═════════════════════════════════════════════════════════════════════════════

class AddAnimeBody(BaseModel):
    """Corpo da requisição para adicionar um anime ao catálogo."""
    mal_id: int  # ID obrigatório do anime no MyAnimeList


class LogWatchBody(BaseModel):
    """Corpo da requisição para registrar uma sessão de episódios."""
    ep_start: Optional[int] = None          # Primeiro episódio da sessão (opcional)
    ep_end: Optional[int] = None            # Último episódio da sessão (opcional)
    watched_date: Optional[str] = None      # Data YYYY-MM-DD (padrão: hoje)
    rating: Optional[float] = None          # Nota 0–10, passo 0.5 (opcional)
    notes: Optional[str] = None             # Observações da sessão (opcional)


class StatusBody(BaseModel):
    """Corpo da requisição para atualizar o status de um anime."""
    status: str  # 'assistindo'|'completo'|'quero_assistir'|'pausado'|'abandonado'


class ScoreBody(BaseModel):
    """Corpo da requisição para definir a nota de um anime."""
    score: float  # 0–10, passo 0.5 (0 = remover nota)


class SyncBody(BaseModel):
    """Corpo da requisição para acionar o sync MAL."""
    full: bool = False  # True = reimportar tudo; False = delta desde último sync


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS COM PATH FIXO — devem vir ANTES dos endpoints com {anime_id}
#
# IMPORTANTE: No FastAPI, a ordem de registro no router define a prioridade.
# "search", "watchlist", "diary", "home" etc. devem estar registrados ANTES
# de "/{anime_id}" para não serem interpretados como IDs de anime.
# ═════════════════════════════════════════════════════════════════════════════

# ── Busca externa (Jikan/MAL) — sem gravar no banco ──────────────────────────

@router.get("/search")
def search_endpoint(
    q: str = Query(..., description="Título ou termo de busca no Jikan/MAL"),
    limit: int = Query(default=5, description="Número máximo de resultados (padrão: 5)"),
    user: dict = Depends(require_user),
) -> dict:
    """Buscar animes no Jikan (MAL) por título para o AddAnimeModal.

    Não grava nada — é uma consulta ao Jikan para apresentar opções antes
    de adicionar ao catálogo. Retorna flag in_catalog para cada resultado.

    Args:
        q: Texto de busca.
        limit: Número máximo de resultados.
        user: Usuário autenticado.

    Returns:
        Dict com "results": lista de animes com in_catalog e local_id.
    """
    return search_anime(query=q, limit=limit)


# ── Listagens principais ──────────────────────────────────────────────────────

@router.get("")
def list_animes_endpoint(
    status: Optional[str] = Query(default=None, description="Filtrar por status"),
    sort: Optional[str] = Query(default=None, description="Ordenação: 'updated'|'added'|'score'|'title'"),
    genre: Optional[str] = Query(default=None, description="Filtrar por gênero"),
    user: dict = Depends(require_user),
) -> dict:
    """Listar todos os animes do catálogo com filtros opcionais.

    Retorna todos os animes não-deletados, com paginação básica via parâmetros.
    Ordenação é aplicada pelo campo updated_at (padrão), score, ou title.

    Args:
        status: Filtrar por status (None = todos).
        sort: Critério de ordenação.
        genre: Filtrar por gênero (match parcial no array genres).
        user: Usuário autenticado.

    Returns:
        Dict com "animes": lista de animes para o grid do CatalogScreen.
    """
    # Monta a query SQL com filtros dinâmicos
    filters = ["deleted = FALSE"]
    params: dict = {}

    if status:
        filters.append("status = %(status)s")
        params["status"] = status

    if genre:
        # genres é um array TEXT[] — ANY faz match em um elemento
        filters.append("%(genre)s = ANY(genres)")
        params["genre"] = genre

    # Define a ordenação — padrão é por data de atualização (mais recente primeiro)
    order_map = {
        "score":   "score DESC NULLS LAST, updated_at DESC",
        "title":   "title ASC",
        "added":   "created_at DESC",
        "updated": "updated_at DESC",
    }
    order_clause = order_map.get(sort or "updated", "updated_at DESC")

    where_clause = " AND ".join(filters)
    animes = run_select(
        f"""
        SELECT
            id, mal_id, title, media_type, season, studio,
            episodes_total, episodes_watched, status, airing_status,
            score, poster_url, banner_url, genres, date_started, updated_at,
            created_at
        FROM anime
        WHERE {where_clause}
        ORDER BY {order_clause}
        """,
        params,
    )

    return {"status": "ok", "animes": animes}


@router.get("/watchlist")
def get_watchlist_endpoint(user: dict = Depends(require_user)) -> dict:
    """Retornar animes com status='quero_assistir' (fila de espera).

    Returns:
        Dict com "animes": lista de animes para o WatchlistScreen.
    """
    return get_watchlist()


@router.get("/diary")
def get_diary_endpoint(
    limit: int = Query(default=50, description="Número máximo de sessões a retornar"),
    user: dict = Depends(require_user),
) -> dict:
    """Retornar o histórico de sessões em ordem cronológica decrescente.

    Args:
        limit: Número máximo de registros (padrão 50).
        user: Usuário autenticado.

    Returns:
        Dict com "logs": lista de sessões para o DiaryScreen.
    """
    return get_watch_history(limit=limit)


@router.get("/currently-watching")
def get_currently_watching_endpoint(user: dict = Depends(require_user)) -> dict:
    """Retornar animes com status='assistindo' em andamento.

    Returns:
        Dict com "animes": animes em progresso ordenados por updated_at.
    """
    return get_currently_watching()


@router.get("/stats")
def get_stats_endpoint(
    year: Optional[int] = Query(default=None, description="Ano de referência (padrão: ano atual)"),
    user: dict = Depends(require_user),
) -> dict:
    """Retornar estatísticas de animes do ano (vazio-seguro — SC-007).

    Args:
        year: Ano (padrão: ano atual).
        user: Usuário autenticado.

    Returns:
        Dict com total_animes, total_episodes, total_hours, avg_score,
        top_genres, top_studios, monthly[12], by_status, heatmap, highlight.
    """
    return get_stats(year=year)


@router.get("/schedule")
def get_schedule_endpoint(
    days: int = Query(default=14, description="Janela de dias futuros (padrão: 14)"),
    user: dict = Depends(require_user),
) -> dict:
    """Retornar o schedule de episódios futuros dos animes em progresso.

    Args:
        days: Número de dias à frente para buscar episódios.
        user: Usuário autenticado.

    Returns:
        Dict com "schedule": lista de episódios agendados com data e título.
    """
    return get_airing_schedule(days=days)


@router.get("/home")
def get_home_endpoint(user: dict = Depends(require_user)) -> dict:
    """Retornar todos os blocos da HomeScreen em uma única chamada.

    Evita N+1 requests: agrega last_session, currently_watching, recent_logs,
    upcoming_episodes, watchlist_preview, counts e stats de sessões recentes.

    Returns:
        Dict com todos os blocos que a HomeScreen consome.
    """
    return get_home()


# ── Logs de sessão — path fixo antes de /{anime_id} ──────────────────────────

@router.delete("/logs/{log_id}", status_code=200)
def delete_log_endpoint(log_id: str, user: dict = Depends(require_user)) -> dict:
    """Remover uma sessão do diário e recalcular episodes_watched.

    Args:
        log_id: UUID da sessão em watch_logs.
        user: Usuário autenticado.

    Returns:
        Dict com mensagem de confirmação.
    """
    return _check_result(delete_watch_log(log_id=log_id))


# ── Sync MAL ──────────────────────────────────────────────────────────────────

@router.post("/sync", status_code=202)
def sync_mal_endpoint(body: SyncBody, user: dict = Depends(require_user)) -> dict:
    """Acionar a sincronização com o MyAnimeList (delta ou full).

    Aciona o pull da lista MAL e faz upsert no catálogo local.
    Idempotente: rodar múltiplas vezes sem mudanças no MAL resulta em 0 upserts.

    Args:
        body: {"full": false} para delta (padrão) ou {"full": true} para reimportar tudo.
        user: Usuário autenticado.

    Returns:
        Dict com métricas: ok, full, timestamp, mal_entries_fetched,
        updated, created, skipped, errors.
    """
    return sync_mal(full=body.full)


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS DE ESCRITA (POST raiz) — antes dos /{anime_id}
# ═════════════════════════════════════════════════════════════════════════════

@router.post("", status_code=201)
def add_anime_endpoint(body: AddAnimeBody, user: dict = Depends(require_user)) -> dict:
    """Adicionar um anime ao catálogo via mal_id.

    Busca metadados completos (Jikan + AniList + ARM + TMDB) automaticamente.
    O anime é criado com status 'quero_assistir'.

    Args:
        body: {"mal_id": 52701} — ID do anime no MAL.
        user: Usuário autenticado.

    Returns:
        Dict com id e mensagem de confirmação.

    Raises:
        HTTPException: 400 se o anime já estiver no catálogo ou mal_id inválido.
    """
    return _check_result(add_anime(mal_id=body.mal_id))


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS COM {anime_id} — devem vir DEPOIS de todos os paths fixos acima
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/{anime_id}")
def get_anime_endpoint(anime_id: str, user: dict = Depends(require_user)) -> dict:
    """Retornar detalhes completos de um anime.

    Aceita UUID interno, mal_id numérico ou título fuzzy.

    Args:
        anime_id: ID do anime (UUID, mal_id ou texto fuzzy).
        user: Usuário autenticado.

    Returns:
        Dict com "anime", "next_episode", "episodes", "episodes_total_cached", "recent_logs".

    Raises:
        HTTPException: 404 se o anime não for encontrado.
    """
    result = get_anime_details(anime_id_or_query=anime_id)
    if result.get("status") == "error":
        # "error" em detalhe = não encontrado → 404
        raise HTTPException(status_code=404, detail=result.get("message"))
    return result


@router.get("/{anime_id}/episodes")
def get_episodes_endpoint(
    anime_id: str,
    page: int = Query(default=1, description="Página (12 episódios por página)"),
    user: dict = Depends(require_user),
) -> dict:
    """Retornar episódios paginados de um anime (12 por página).

    Endpoint thin de paginação — sem lógica de domínio.
    Usado pelo EpisodeList do AnimeDetail ao rolar para carregar mais.

    Args:
        anime_id: UUID interno do anime.
        page: Número da página (1-indexed; 12 episódios por página).
        user: Usuário autenticado.

    Returns:
        Dict com "episodes" (lista), "total" (contagem) e "page".
    """
    # 12 episódios por página, paginação por OFFSET
    per_page = 12
    offset = (page - 1) * per_page

    # Conta o total para o frontend calcular a última página
    count_rows = run_select(
        "SELECT COUNT(*) AS cnt FROM episodes WHERE anime_id = %(id)s",
        {"id": anime_id},
    )
    total = int((count_rows[0] if count_rows else {}).get("cnt", 0))

    # Busca a página de episódios ordenada por número
    episodes = run_select(
        """
        SELECT id, number, title, aired, synopsis, thumbnail_url,
               airing_status, watched, watched_date
        FROM episodes
        WHERE anime_id = %(id)s
        ORDER BY number ASC
        LIMIT %(limit)s OFFSET %(offset)s
        """,
        {"id": anime_id, "limit": per_page, "offset": offset},
    )

    return {"status": "ok", "episodes": episodes, "total": total, "page": page}


@router.post("/{anime_id}/log", status_code=201)
def log_watch_endpoint(
    anime_id: str,
    body: LogWatchBody,
    user: dict = Depends(require_user),
) -> dict:
    """Registrar uma sessão de episódios assistidos.

    Insere em watch_logs, atualiza episodes_watched, marca episódios como
    assistidos e infere date_started/date_finished — tudo em uma transação.

    Args:
        anime_id: UUID do anime no banco.
        body: Dados da sessão (ep_start, ep_end, data, nota, notas).
        user: Usuário autenticado.

    Returns:
        Dict com log_id e mensagem de confirmação.

    Raises:
        HTTPException: 400 se dados inválidos (nota fora do range, eps inválidos).
        HTTPException: 404 se anime não encontrado.
    """
    result = log_watch(
        anime_id_or_query=anime_id,
        ep_start=body.ep_start,
        ep_end=body.ep_end,
        watched_date=body.watched_date,
        rating=body.rating,
        notes=body.notes,
    )
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.patch("/{anime_id}/status")
def update_status_endpoint(
    anime_id: str,
    body: StatusBody,
    user: dict = Depends(require_user),
) -> dict:
    """Atualizar o status de um anime na lista do usuário.

    Args:
        anime_id: UUID do anime.
        body: {"status": "assistindo"|"completo"|"quero_assistir"|"pausado"|"abandonado"}.
        user: Usuário autenticado.

    Returns:
        Dict com status "ok" ou "error".
    """
    return _check_result(update_anime_status(
        anime_id_or_query=anime_id,
        status=body.status,
    ))


@router.patch("/{anime_id}/score")
def rate_anime_endpoint(
    anime_id: str,
    body: ScoreBody,
    user: dict = Depends(require_user),
) -> dict:
    """Definir a nota pessoal de um anime (escala MAL: 0–10, passo 0.5).

    Args:
        anime_id: UUID do anime.
        body: {"score": 8.5} — 0 remove a nota.
        user: Usuário autenticado.

    Returns:
        Dict com status "ok" e a nota definida.
    """
    return _check_result(rate_anime(anime_id_or_query=anime_id, score=body.score))


@router.delete("/{anime_id}", status_code=200)
def delete_anime_endpoint(anime_id: str, user: dict = Depends(require_user)) -> dict:
    """Remover um anime do catálogo (soft delete — histórico preservado).

    Args:
        anime_id: UUID do anime.
        user: Usuário autenticado.

    Returns:
        Dict com mensagem de confirmação.
    """
    return _check_result(delete_anime(anime_id_or_query=anime_id))
