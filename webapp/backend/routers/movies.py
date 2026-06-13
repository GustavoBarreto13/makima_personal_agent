"""Router de filmes (Akane) — expõe as tools como endpoints REST.

Camada fina: cada endpoint é exatamente uma chamada à tool correspondente
em agents.akane.tools (princípio FR-016 — lógica fica nas tools, não aqui).

Diferente de books.py (que lida com strings HTML), as tools da Akane
retornam sempre dicts {"status": "ok"|"error", ...}, então usamos
_check_result para converter "error" em HTTP 400.

Usage:
    # Em main.py:
    from webapp.backend.routers import movies as movies_router
    app.include_router(movies_router.router, prefix="/api/movies", tags=["movies"])
"""

# Optional permite campos que podem ser None nos modelos Pydantic
from typing import Optional

# Imports do FastAPI para construir o router
from fastapi import APIRouter, Depends, HTTPException, Query

# BaseModel é a base de todos os modelos Pydantic (validação dos bodies)
from pydantic import BaseModel

# require_user bloqueia rotas não autenticadas — obrigatório em TODAS as rotas /api/*
from webapp.backend.deps import require_user

# ─── Tools da Akane — importadas diretamente (sem instanciar agente ADK) ────
from agents.akane.tools import (
    # ── Busca e catálogo ───────────────────────────────────────────────────────
    search_movie,          # Busca no TMDB por texto (sem gravar no banco)
    add_movie,             # Adiciona filme ao catálogo (enriquece via TMDB)
    add_to_watchlist,      # Atalho: add_movie(status='watchlist')
    # ── Visualizações e avaliações ─────────────────────────────────────────────
    log_watch,             # Loga sessão + atualiza movies (transação)
    rate_movie,            # Define nota do filme (rating_source='own')
    set_like,              # Marca/desmarca coração
    update_movie_status,   # Altera status (watchlist↔watched)
    set_notes,             # Salva anotações soltas do filme
    # ── Listagens ─────────────────────────────────────────────────────────────
    list_movies,           # Grid filtrado + ordenado
    get_watchlist,         # Todos os filmes com status='watchlist'
    get_diary,             # Histórico de sessões cronológico
    get_movie_detail,      # Detalhe completo: filme + people + vault + diary
    get_stats,             # Estatísticas do ano (vazio-seguro)
    delete_movie,          # Soft delete
    delete_diary_entry,    # Remove sessão e recalcula contadores
    # ── Agregações (Onda 4) ────────────────────────────────────────────────────
    get_home,              # Todos os blocos do Início numa chamada
    get_rewind,            # Year-in-review enriquecido
    get_heatmap,           # Sessões/dia do ano para o heatmap
    get_top_people,        # Pessoas com mais filmes no catálogo
    get_favorites,         # Vitrine de favoritos (ordered by position)
    set_favorites,         # Substitui a vitrine inteira (delete-all + insert)
    # ── Listas (Onda 5) ───────────────────────────────────────────────────────
    get_lists,             # Todas as coleções com contagem
    get_list,              # Detalhe de uma lista + filmes
    create_list,           # Cria nova coleção
    update_list,           # Atualiza campos de uma lista
    delete_list,           # Remove lista e itens (CASCADE)
    add_to_list,           # Adiciona filme a uma lista
    remove_from_list,      # Remove filme de uma lista
    # ── Etiquetas (Onda 5) ────────────────────────────────────────────────────
    get_tags,              # Nuvem de etiquetas com contagem e flag pessoa
    # ── Cofre de conteúdos (Onda 5) ───────────────────────────────────────────
    get_vault,             # Itens do Cofre de um filme
    add_vault_item,        # Adiciona item ao Cofre
    delete_vault_item,     # Remove item do Cofre
)


# ─── Helper de resultado ────────────────────────────────────────────────────

def _check_result(result: dict) -> dict:
    """Converte dict de erro das tools em HTTP 400; deixa "ok" passar.

    As tools da Akane seguem o padrão {"status": "ok"|"error", "message": ...}.
    Esta função centraliza a conversão de "error" → HTTPException 400,
    evitando repetição em cada endpoint.

    Args:
        result: Dict retornado por uma tool da Akane.

    Returns:
        O mesmo dict de resultado se status for "ok".

    Raises:
        HTTPException: 400 se status == "error".
    """
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message", "Erro desconhecido."))
    return result


# ─── Criação do router ───────────────────────────────────────────────────────
# O prefixo "/api/movies" é adicionado em main.py quando este router é incluído
router = APIRouter()


# ═════════════════════════════════════════════════════════════════════════════
# MODELOS PYDANTIC — Validação dos corpos das requisições POST/PATCH
# ═════════════════════════════════════════════════════════════════════════════

class AddMovieBody(BaseModel):
    """Corpo da requisição para adicionar um filme ao catálogo."""
    title: Optional[str] = None              # Título do filme (obrigatório se tmdb_id ausente)
    tmdb_id: Optional[int] = None            # ID TMDB — enriquece metadados automaticamente
    status: str = "watchlist"                # Status inicial ('watchlist' | 'watched')
    year: Optional[int] = None               # Ano (opcional — vem do TMDB se tmdb_id fornecido)
    letterboxd_uri: Optional[str] = None     # URI Letterboxd para dedup (sync RSS/CSV)
    source: str = "manual"                   # Origem da entrada


class LogWatchBody(BaseModel):
    """Corpo da requisição para logar uma sessão de visualização."""
    watched_date: Optional[str] = None       # Data YYYY-MM-DD (padrão: hoje)
    rating: Optional[float] = None           # Nota 0.5–5.0 (opcional)
    review: Optional[str] = None             # Texto da review (opcional)
    tags: Optional[list[str]] = None         # Etiquetas da sessão (opcional)
    rewatch: Optional[bool] = None           # Se é revisão (inferido automaticamente se None)
    source: str = "manual"                   # Origem da sessão


class RatingBody(BaseModel):
    """Corpo da requisição para definir a nota de um filme."""
    rating: float  # Nota obrigatória (0.5–5.0)


class LikeBody(BaseModel):
    """Corpo da requisição para curtir/descurtir um filme."""
    liked: bool  # True = curtir, False = descurtir


class StatusBody(BaseModel):
    """Corpo da requisição para atualizar o status de um filme."""
    status: str  # 'watchlist' | 'watched'


class NotesBody(BaseModel):
    """Corpo da requisição para atualizar as anotações de um filme."""
    notes: str  # Texto das anotações (pode ser vazio string para limpar)


class FavoritesBody(BaseModel):
    """Corpo da requisição para substituir a vitrine de favoritos."""
    ids: list[str]  # Lista de até 4 movie_ids em ordem de posição


class CreateListBody(BaseModel):
    """Corpo da requisição para criar uma nova lista/coleção."""
    name: str                              # Nome da lista (obrigatório)
    description: str = ""                  # Descrição opcional
    accent: Optional[str] = None          # Cor de acento OKLCH (opcional)
    ranked: bool = False                   # Se é lista ordenada (ranking)


class UpdateListBody(BaseModel):
    """Corpo da requisição para atualizar uma lista (todos os campos opcionais)."""
    name: Optional[str] = None
    description: Optional[str] = None
    accent: Optional[str] = None
    ranked: Optional[bool] = None


class AddToListBody(BaseModel):
    """Corpo da requisição para adicionar um filme a uma lista."""
    movie_id: str               # ID do filme a adicionar
    position: Optional[int] = None  # Posição na lista (para listas ranked)


class AddVaultItemBody(BaseModel):
    """Corpo da requisição para adicionar um item ao Cofre de um filme."""
    type: str                          # 'video' | 'article' | 'essay' | 'review'
    title: str                         # Título do conteúdo
    url: Optional[str] = None          # URL do conteúdo (opcional)
    source: Optional[str] = None       # Domínio de exibição (derivado da URL se não informado)


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS COM PATH FIXO — devem vir ANTES dos endpoints com {movie_id}
#
# IMPORTANTE: No FastAPI, a ordem de registro importa.
# "watchlist", "diary", "stats", "home", etc. devem ser registrados
# ANTES de "/{movie_id}" para não serem interpretados como IDs de filmes.
# ═════════════════════════════════════════════════════════════════════════════

# ── Busca TMDB (sem gravar no banco) ─────────────────────────────────────────

@router.get("/tmdb/search")
def tmdb_search(
    q: str = Query(..., description="Título ou parte do título para buscar no TMDB"),
    user: dict = Depends(require_user),
) -> dict:
    """Buscar filmes no TMDB por título (para os modais de busca da UI).

    Não grava nada — é uma consulta ao TMDB para apresentar opções antes
    de adicionar ao catálogo.

    Args:
        q: Texto de busca.
        user: Usuário autenticado.

    Returns:
        Dict com "results": lista de até 6 filmes TMDB (tmdb_id, title, year, poster_url).
    """
    results = search_movie(q)
    return {"status": "ok", "results": results}


# ── Listagens de catálogo ─────────────────────────────────────────────────────

@router.get("")
def list_movies_endpoint(
    status: Optional[str] = Query(default=None, description="'watched' | 'watchlist'"),
    sort: str = Query(default="recent", description="'recent'|'rating'|'title'|'director'|'year'|'runtime'"),
    genre: Optional[str] = Query(default=None, description="Filtrar por gênero (match parcial)"),
    tag: Optional[str] = Query(default=None, description="Filtrar por etiqueta exata"),
    filter: Optional[str] = Query(default=None, description="Chip: 'all'|'watched'|'liked'|'watchlist'|'rated'"),
    user: dict = Depends(require_user),
) -> dict:
    """Listar filmes do catálogo com filtros e ordenação.

    Args:
        status: Filtrar por status (None = todos).
        sort: Critério de ordenação.
        genre: Filtrar por gênero (match parcial).
        tag: Filtrar por etiqueta (tela de etiqueta).
        filter: Chip de filtro da UI.
        user: Usuário autenticado.

    Returns:
        Dict com "movies": lista de filmes para o grid.
    """
    movies = list_movies(status=status, sort=sort, genre=genre, tag=tag, filter=filter)
    return {"status": "ok", "movies": movies}


@router.get("/watchlist")
def get_watchlist_endpoint(user: dict = Depends(require_user)) -> dict:
    """Retornar filmes na watchlist (status='watchlist').

    Returns:
        Dict com "movies": lista de filmes com metadados de exibição.
    """
    movies = get_watchlist()
    return {"status": "ok", "movies": movies}


@router.get("/diary")
def get_diary_endpoint(
    limit: int = Query(default=50, description="Número máximo de sessões a retornar"),
    user: dict = Depends(require_user),
) -> dict:
    """Retornar o diário de sessões em ordem cronológica decrescente.

    Args:
        limit: Número máximo de sessões (padrão 50).
        user: Usuário autenticado.

    Returns:
        Dict com "entries": lista de sessões com poster_url do filme.
    """
    entries = get_diary(limit=limit)
    return {"status": "ok", "entries": entries}


@router.get("/stats")
def get_stats_endpoint(
    year: Optional[int] = Query(default=None, description="Ano de referência (padrão: ano atual)"),
    user: dict = Depends(require_user),
) -> dict:
    """Retornar estatísticas de filmes do ano (vazio-seguro — SC-006).

    Args:
        year: Ano (padrão: ano atual).
        user: Usuário autenticado.

    Returns:
        Dict com total_films, total_sessions, avg_rating, top_genres,
        top_directors, rating_histogram.
    """
    return get_stats(year=year)


# ── Agregações — Onda 4 ───────────────────────────────────────────────────────

@router.get("/home")
def get_home_endpoint(user: dict = Depends(require_user)) -> dict:
    """Retornar todos os blocos da tela Início em uma única chamada.

    Retorna: favorites, recent_activity, watchlist_highlight,
    rating_histogram, sessions_7d, last_session, counts.

    Returns:
        Dict com todos os blocos do Início.
    """
    return get_home()


@router.get("/rewind")
def get_rewind_endpoint(
    year: Optional[int] = Query(default=None, description="Ano do Rewind (padrão: ano atual)"),
    user: dict = Depends(require_user),
) -> dict:
    """Retornar o year-in-review com destaques do ano.

    Returns:
        Dict com stats + total_minutes, monthly[12], top_people,
        top_decade, max_sessions, favorite, liked_count.
    """
    return get_rewind(year=year)


@router.get("/heatmap")
def get_heatmap_endpoint(
    year: Optional[int] = Query(default=None, description="Ano do heatmap (padrão: ano atual)"),
    user: dict = Depends(require_user),
) -> dict:
    """Retornar sessões por dia do ano para o componente Heatmap.

    Returns:
        Dict com "year" e "days": lista de {date, count} para cada dia.
    """
    return get_heatmap(year=year)


@router.get("/people")
def get_people_endpoint(
    limit: int = Query(default=10, description="Número máximo de pessoas a retornar"),
    user: dict = Depends(require_user),
) -> dict:
    """Retornar as pessoas que mais aparecem no catálogo (direção + elenco).

    Args:
        limit: Número máximo (padrão 10).
        user: Usuário autenticado.

    Returns:
        Dict com "people": lista de {name, count, roles}.
    """
    people = get_top_people(limit=limit)
    return {"status": "ok", "people": people}


# ── Sincronização Letterboxd — Onda 2 ───────────────────────────────────────
#
# O sync é acionado manualmente pelo usuário (botão na UI) ou pelo cron diário.
# O endpoint retorna 202 Accepted e o resultado do sync como JSON.

@router.post("/sync-letterboxd", status_code=202)
def sync_letterboxd_endpoint(user: dict = Depends(require_user)) -> dict:
    """Sincronizar o diário Letterboxd RSS com o catálogo.

    Busca o feed RSS configurado em LETTERBOXD_USERNAME e upserta as entradas.
    Idempotente: rodar múltiplas vezes não cria duplicatas.

    Returns:
        Dict com contadores: created, updated, skipped, errors.

    Raises:
        HTTPException: 500 se LETTERBOXD_USERNAME não estiver configurada.
    """
    # Importação tardia para evitar circular import e para que o módulo seja carregado
    # apenas quando o endpoint for chamado (scripts/ não é importado na inicialização)
    from scripts.sync_letterboxd import run_sync  # noqa: PLC0415

    import os
    if not os.getenv("LETTERBOXD_USERNAME"):
        raise HTTPException(
            status_code=500,
            detail="LETTERBOXD_USERNAME não configurada no servidor.",
        )

    resultado = run_sync(yesterday_only=False, enrich_tmdb=True)
    return {"status": "ok", **resultado}


@router.get("/favorites")
def get_favorites_endpoint(user: dict = Depends(require_user)) -> dict:
    """Retornar a vitrine de favoritos em ordem de posição.

    Returns:
        Dict com "favorites": lista de filmes favoritos com poster.
    """
    return get_favorites()


@router.put("/favorites")
def set_favorites_endpoint(
    body: FavoritesBody,
    user: dict = Depends(require_user),
) -> dict:
    """Substituir a vitrine de favoritos (máximo 4 filmes vistos).

    Operação atômica: delete-all + insert em uma transação.

    Args:
        body: Lista de IDs (até 4) em ordem de posição.
        user: Usuário autenticado.

    Returns:
        Dict com os novos favoritos.

    Raises:
        HTTPException: 400 se algum ID não existir ou filme não estiver como 'watched'.
    """
    return _check_result(set_favorites(ids=body.ids))


# ── Listas/Coleções — Onda 5 ─────────────────────────────────────────────────

@router.get("/lists")
def list_collections_endpoint(user: dict = Depends(require_user)) -> dict:
    """Retornar todas as listas com contagem de filmes em cada uma.

    Returns:
        Dict com "lists": lista de coleções com id, name, description, accent, count.
    """
    lists = get_lists()
    return {"status": "ok", "lists": lists}


@router.post("/lists", status_code=201)
def create_list_endpoint(body: CreateListBody, user: dict = Depends(require_user)) -> dict:
    """Criar uma nova lista/coleção de filmes.

    Args:
        body: Nome (obrigatório), descrição, accent e ranked (opcionais).
        user: Usuário autenticado.

    Returns:
        Dict com status "ok" e id da lista criada.
    """
    return _check_result(create_list(
        name=body.name,
        description=body.description,
        accent=body.accent,
        ranked=body.ranked,
    ))


@router.get("/lists/{list_id}")
def get_list_endpoint(list_id: str, user: dict = Depends(require_user)) -> dict:
    """Retornar detalhe de uma lista com os filmes que a compõem.

    Args:
        list_id: UUID da lista.
        user: Usuário autenticado.

    Returns:
        Dict com "list" e "films".
    """
    return _check_result(get_list(list_id=list_id))


@router.patch("/lists/{list_id}")
def update_list_endpoint(
    list_id: str,
    body: UpdateListBody,
    user: dict = Depends(require_user),
) -> dict:
    """Atualizar campos de uma lista (todos opcionais).

    Args:
        list_id: UUID da lista.
        body: Campos a atualizar.
        user: Usuário autenticado.
    """
    # Passa apenas os campos que foram enviados (não-None)
    kwargs = body.model_dump(exclude_none=True)
    return _check_result(update_list(list_id=list_id, **kwargs))


@router.delete("/lists/{list_id}", status_code=200)
def delete_list_endpoint(list_id: str, user: dict = Depends(require_user)) -> dict:
    """Remover uma lista e seus itens (CASCADE).

    Args:
        list_id: UUID da lista.
        user: Usuário autenticado.
    """
    return _check_result(delete_list(list_id=list_id))


@router.post("/lists/{list_id}/items", status_code=201)
def add_to_list_endpoint(
    list_id: str,
    body: AddToListBody,
    user: dict = Depends(require_user),
) -> dict:
    """Adicionar um filme a uma lista.

    Args:
        list_id: UUID da lista.
        body: movie_id (obrigatório) e position (opcional).
        user: Usuário autenticado.
    """
    return _check_result(add_to_list(
        list_id=list_id,
        movie_id=body.movie_id,
        position=body.position,
    ))


@router.delete("/lists/{list_id}/items/{movie_id}", status_code=200)
def remove_from_list_endpoint(
    list_id: str,
    movie_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Remover um filme de uma lista.

    Args:
        list_id: UUID da lista.
        movie_id: ID do filme.
        user: Usuário autenticado.
    """
    return _check_result(remove_from_list(list_id=list_id, movie_id=movie_id))


# ── Etiquetas — Onda 5 ────────────────────────────────────────────────────────

@router.get("/tags")
def get_tags_endpoint(user: dict = Depends(require_user)) -> dict:
    """Retornar a nuvem de etiquetas com contagem e flag de pessoa.

    Returns:
        Dict com "tags": lista de {name, count, person}.
    """
    return get_tags()


# ── Cofre — vault/{vault_id} como path fixo antes de /{movie_id} ─────────────

@router.delete("/vault/{vault_id}", status_code=200)
def delete_vault_endpoint(vault_id: str, user: dict = Depends(require_user)) -> dict:
    """Remover um item do Cofre pelo ID.

    Args:
        vault_id: ID do item do Cofre.
        user: Usuário autenticado.
    """
    return _check_result(delete_vault_item(vault_id=vault_id))


# ── Diário — diary/{diary_id} como path fixo antes de /{movie_id} ────────────

@router.delete("/diary/{diary_id}", status_code=200)
def delete_diary_endpoint(diary_id: str, user: dict = Depends(require_user)) -> dict:
    """Remover uma sessão do diário e recalcular contadores do filme.

    Args:
        diary_id: ID da sessão de diário.
        user: Usuário autenticado.
    """
    return _check_result(delete_diary_entry(diary_id=diary_id))


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS DE ESCRITA (POST sem parâmetro de path) — antes dos /{movie_id}
# ═════════════════════════════════════════════════════════════════════════════

@router.post("", status_code=201)
def add_movie_endpoint(body: AddMovieBody, user: dict = Depends(require_user)) -> dict:
    """Adicionar um filme ao catálogo (watchlist ou watched).

    Se tmdb_id for fornecido, busca metadados completos do TMDB automaticamente.
    Em caso de falha do TMDB, o filme é criado sem poster_url (SC-005).

    Args:
        body: Dados do filme (title ou tmdb_id obrigatório).
        user: Usuário autenticado.

    Returns:
        Dict com status "ok" e id do filme criado.

    Raises:
        HTTPException: 400 se o filme já existir ou dados inválidos.
    """
    return _check_result(add_movie(
        title=body.title,
        tmdb_id=body.tmdb_id,
        status=body.status,
        year=body.year,
        letterboxd_uri=body.letterboxd_uri,
        source=body.source,
    ))


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS COM {movie_id} — devem vir DEPOIS dos paths fixos
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/{movie_id}")
def get_movie_endpoint(movie_id: str, user: dict = Depends(require_user)) -> dict:
    """Retornar detalhe completo de um filme: metadados + people + vault + diary.

    Aceita ID UUID direto ou texto para fuzzy match.

    Args:
        movie_id: ID do filme ou texto de busca fuzzy.
        user: Usuário autenticado.

    Returns:
        Dict com "movie", "people", "vault" e "diary".

    Raises:
        HTTPException: 404 se o filme não for encontrado.
    """
    result = get_movie_detail(movie_id)
    if result.get("status") == "error":
        # 404 para "não encontrado" (não 400)
        raise HTTPException(status_code=404, detail=result.get("message"))
    return result


@router.post("/{movie_id}/watch", status_code=201)
def log_watch_endpoint(
    movie_id: str,
    body: LogWatchBody,
    user: dict = Depends(require_user),
) -> dict:
    """Logar uma sessão de visualização do filme.

    Insere entrada no diário E atualiza o filme (status, contadores, nota)
    em uma única transação PostgreSQL.

    Args:
        movie_id: ID do filme.
        body: Dados da sessão (data, nota, review, tags, rewatch).
        user: Usuário autenticado.

    Returns:
        Dict com diary_id e mensagem de confirmação.

    Raises:
        HTTPException: 400 se dados inválidos (nota fora do range, etc.).
        HTTPException: 404 se filme não encontrado.
    """
    result = log_watch(
        movie_id=movie_id,
        watched_date=body.watched_date,
        rating=body.rating,
        review=body.review,
        tags=body.tags,
        rewatch=body.rewatch,
        source=body.source,
    )
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.patch("/{movie_id}/rating")
def rate_movie_endpoint(
    movie_id: str,
    body: RatingBody,
    user: dict = Depends(require_user),
) -> dict:
    """Definir a nota atual do filme (rating_source='own').

    Args:
        movie_id: ID do filme.
        body: Nova nota (0.5–5.0).
        user: Usuário autenticado.
    """
    return _check_result(rate_movie(movie_id=movie_id, rating=body.rating))


@router.patch("/{movie_id}/like")
def set_like_endpoint(
    movie_id: str,
    body: LikeBody,
    user: dict = Depends(require_user),
) -> dict:
    """Marcar ou desmarcar o coração (curtir) de um filme.

    Args:
        movie_id: ID do filme.
        body: {"liked": true|false}.
        user: Usuário autenticado.
    """
    return _check_result(set_like(movie_id=movie_id, liked=body.liked))


@router.patch("/{movie_id}/status")
def update_status_endpoint(
    movie_id: str,
    body: StatusBody,
    user: dict = Depends(require_user),
) -> dict:
    """Atualizar o status de um filme (watchlist ↔ watched).

    Args:
        movie_id: ID do filme.
        body: Novo status ('watchlist' | 'watched').
        user: Usuário autenticado.
    """
    return _check_result(update_movie_status(movie_id=movie_id, status=body.status))


@router.patch("/{movie_id}/notes")
def set_notes_endpoint(
    movie_id: str,
    body: NotesBody,
    user: dict = Depends(require_user),
) -> dict:
    """Atualizar as anotações soltas de um filme.

    Args:
        movie_id: ID do filme.
        body: Texto das anotações (vazio para limpar).
        user: Usuário autenticado.
    """
    return _check_result(set_notes(movie_id=movie_id, notes=body.notes))


@router.delete("/{movie_id}", status_code=200)
def delete_movie_endpoint(movie_id: str, user: dict = Depends(require_user)) -> dict:
    """Remover um filme do catálogo (soft delete — preserva diary_entries).

    Args:
        movie_id: ID do filme.
        user: Usuário autenticado.
    """
    return _check_result(delete_movie(movie_id=movie_id))


# ── Cofre (por filme) — path /{movie_id}/vault ────────────────────────────────

@router.get("/{movie_id}/vault")
def get_vault_endpoint(movie_id: str, user: dict = Depends(require_user)) -> dict:
    """Retornar itens do Cofre de um filme.

    Args:
        movie_id: ID do filme.
        user: Usuário autenticado.

    Returns:
        Dict com "items": lista de itens do Cofre.
    """
    items = get_vault(movie_id=movie_id)
    return {"status": "ok", "items": items}


@router.post("/{movie_id}/vault", status_code=201)
def add_vault_endpoint(
    movie_id: str,
    body: AddVaultItemBody,
    user: dict = Depends(require_user),
) -> dict:
    """Adicionar um item ao Cofre de um filme.

    Args:
        movie_id: ID do filme.
        body: Tipo, título, URL (opcional) e source (opcional).
        user: Usuário autenticado.
    """
    return _check_result(add_vault_item(
        movie_id=movie_id,
        type=body.type,
        title=body.title,
        url=body.url,
        source=body.source,
    ))
