"""Router do journal — expõe as tools do diário pessoal como endpoints REST.

Cada endpoint embrulha diretamente uma função de tool do journal (agents/journal/tools.py).
As tools retornam dicts com "status": "ok"/"error" — o router converte "error" em HTTP 400.

Usage:
    # Em main.py:
    from webapp.backend.routers import journal as journal_router
    app.include_router(journal_router.router, prefix="/api/journal", tags=["journal"])
"""

import re
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from webapp.backend.deps import require_user

from agents.journal.tools import (
    get_or_create_page,
    upsert_bullet,
    delete_bullet,
    list_heatmap,
    list_mentions,
    get_bullets_by_mention,
    search_bullets,
    set_dream,
    list_entries,
    list_collection,
    list_dreams,
    get_stats,
    get_available_years,
    # Feature 006 — Registro Emocional TCC
    list_emotions,
    create_emotion,
    list_emotion_logs,
    create_emotion_log,
    update_emotion_log,
    delete_emotion_log,
    get_emotion_stats,
    # Feature 007 — Favoritar Bullet
    set_favorite,
    list_favorite_days,
)


# ─── Helper interno ───────────────────────────────────────────────────────────

def _check_result(result: dict) -> dict:
    """Verificar o resultado de uma tool e lançar HTTP 400 se houve erro.

    Args:
        result: Dicionário retornado pela tool.

    Returns:
        O próprio `result` se status == "ok".

    Raises:
        HTTPException: 400 se a tool retornou "status": "error".
    """
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message", "Erro desconhecido"))
    return result


# ─── Router ───────────────────────────────────────────────────────────────────

router = APIRouter()


# ═════════════════════════════════════════════════════════════════════════════
# MODELOS PYDANTIC
# ═════════════════════════════════════════════════════════════════════════════

class UpsertBulletBody(BaseModel):
    """Corpo da requisição para inserir ou atualizar um bullet."""
    page_id: int
    position: int
    content: str
    kind: str = 'bullet'  # default retrocompatível com bullets antigos


class DreamBody(BaseModel):
    """Corpo da requisição para atualizar o campo dream de uma page."""
    page_id: int
    dream: Optional[str] = None  # None ou string vazia limpa o campo


# ─── Modelos da Feature 006 (Registro Emocional TCC) ──────────────────────────

class CreateEmotionBody(BaseModel):
    """Corpo da requisição para criar uma emoção custom."""
    name: str  # nome da emoção; a tool valida não-vazio e deduplica por LOWER(name)


class CreateEmotionLogBody(BaseModel):
    """Corpo da requisição para criar um registro emocional (Registro de Pensamentos TCC).

    Apenas page_id, emotion_id e intensity são obrigatórios. Os demais campos
    refletem as etapas seguintes do registro TCC e podem ser preenchidos depois.
    As intensidades são limitadas a 0–10 pelo Field(ge=0, le=10) do Pydantic.
    """
    page_id: int
    emotion_id: int
    intensity: int = Field(ge=0, le=10)
    situation: Optional[str] = None
    automatic_thought: Optional[str] = None
    adaptive_response: Optional[str] = None
    reappraised_intensity: Optional[int] = Field(default=None, ge=0, le=10)


class UpdateEmotionLogBody(BaseModel):
    """Corpo da requisição para atualizar um registro emocional (atualização parcial).

    Todos os campos são opcionais — só os enviados são atualizados, permitindo
    completar o registro progressivamente (ex.: adicionar a resposta adaptativa depois).
    """
    emotion_id: Optional[int] = None
    intensity: Optional[int] = Field(default=None, ge=0, le=10)
    situation: Optional[str] = None
    automatic_thought: Optional[str] = None
    adaptive_response: Optional[str] = None
    reappraised_intensity: Optional[int] = Field(default=None, ge=0, le=10)


# ─── Modelos da Feature 007 (Favoritar Bullet) ────────────────────────────────

class SetFavoriteBody(BaseModel):
    """Corpo da requisição para favoritar ou desfavoritar um bullet.

    O campo favorite define o estado-alvo explícito (não toggle no servidor),
    tornando a operação idempotente e robusta com optimistic updates no frontend.
    """
    # True para favoritar, False para desfavoritar — estado-alvo, não toggle
    favorite: bool


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS EXISTENTES (atualizados)
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/page")
def page_endpoint(
    date: str = Query(..., description="Data no formato YYYY-MM-DD"),
    type_id: int = Query(default=1, description="ID do tipo de diário"),
    user: dict = Depends(require_user),
) -> dict:
    """Buscar ou criar a página do diário para uma data.

    Args:
        date: Data da página no formato YYYY-MM-DD.
        type_id: ID do tipo de diário (padrão: 1 = personal).
        user: Dados do usuário autenticado.

    Returns:
        {"page": {id, date, type_id, dream, num, ...}, "bullets": [...]}

    Raises:
        HTTPException: 400 se data inválida ou type_id não encontrado.
    """
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', date):
        raise HTTPException(status_code=400, detail="Formato de data inválido. Use YYYY-MM-DD.")
    result = get_or_create_page(date=date, type_id=type_id)
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return _check_result(result)


@router.post("/bullets", status_code=200)
def upsert_bullet_endpoint(
    body: UpsertBulletBody,
    user: dict = Depends(require_user),
) -> dict:
    """Inserir ou atualizar um bullet (cria ou atualiza por page_id + position).

    Args:
        body: {page_id, position, content, kind}
        user: Dados do usuário autenticado.

    Returns:
        {"status": "ok", "bullet": {id, page_id, kind, content, position, created_at}}
    """
    result = upsert_bullet(
        page_id=body.page_id,
        position=body.position,
        content=body.content,
        kind=body.kind,
    )
    return _check_result(result)


@router.delete("/bullets/{bullet_id}")
def delete_bullet_endpoint(
    bullet_id: int,
    user: dict = Depends(require_user),
) -> dict:
    """Deletar um bullet pelo ID.

    Args:
        bullet_id: ID do bullet.
        user: Dados do usuário autenticado.

    Returns:
        {"status": "ok"}
    """
    result = delete_bullet(bullet_id=bullet_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=404, detail=result.get("message", "bullet não encontrado"))
    return result


@router.patch("/bullets/{bullet_id}/favorite")
def set_favorite_endpoint(
    bullet_id: int,
    body: SetFavoriteBody,
    user: dict = Depends(require_user),
) -> dict:
    """Definir ou remover o estado de favorito de um bullet.

    Endpoint dedicado para alternar favorito — separado do upsert_bullet para que
    edições de texto nunca resetem o favorito (FR-005). O frontend envia o estado-alvo
    explícito (não toggle), tornando a operação idempotente e segura com optimistic UI.

    Args:
        bullet_id: ID do bullet a ser alterado.
        body: {favorite: bool} — estado desejado.
        user: Dados do usuário autenticado.

    Returns:
        {"status": "ok", "favorite": bool}

    Raises:
        HTTPException: 404 se o bullet não existir.
    """
    result = set_favorite(bullet_id=bullet_id, favorite=body.favorite)
    # Reusamos _check_result para converter "error" em HTTP 400, mas realmente
    # queremos 404 (bullet não existe) — portanto verificamos antes de chamar.
    if result.get("status") == "error":
        raise HTTPException(status_code=404, detail=result.get("message", "bullet não encontrado"))
    return result


@router.get("/favorite-days")
def favorite_days_endpoint(
    year: int = Query(..., description="Ano de referência"),
    user: dict = Depends(require_user),
) -> list:
    """Retornar as datas do ano que possuem ao menos um bullet favorito.

    Insumo para o heatmap de favoritos (spec 008, FR-007). Retorna somente datas
    com bullet.favorite = TRUE — dias sem favorito não aparecem.

    Args:
        year: Ano de referência (ex.: 2026).
        user: Dados do usuário autenticado.

    Returns:
        ["YYYY-MM-DD", ...] — lista de datas ordenadas ASC. Lista vazia [] se nenhum favorito.
    """
    # list_favorite_days retorna lista direta (sem campo "status") — não usar _check_result.
    return list_favorite_days(year=year)


@router.get("/heatmap")
def heatmap_endpoint(
    year: int = Query(..., description="Ano de referência"),
    user: dict = Depends(require_user),
) -> dict:
    """Retornar palavras escritas por dia para o heatmap anual.

    Args:
        year: Ano de referência.

    Returns:
        {"YYYY-MM-DD": words, ...} — apenas dias com words > 0.
    """
    return list_heatmap(year=year)


@router.get("/mentions")
def mentions_endpoint(
    kind: Literal["person", "tag"] = Query(..., description="Tipo: 'person' ou 'tag'"),
    user: dict = Depends(require_user),
) -> list:
    """Listar menções distintas com contagem.

    Args:
        kind: 'person' para @nomes, 'tag' para #tags.

    Returns:
        [{"value": str, "count": int}, ...]
    """
    return list_mentions(kind=kind)


@router.get("/filter")
def filter_by_mention_endpoint(
    kind: Literal["person", "tag"] = Query(...),
    value: str = Query(...),
    user: dict = Depends(require_user),
) -> list:
    """Bullets que mencionam uma pessoa ou tag específica.

    Returns:
        [{"date": str, "bullets": [{id, content, kind}]}, ...]
    """
    return get_bullets_by_mention(kind=kind, value=value)


@router.get("/search")
def search_endpoint(
    q: str = Query(..., description="Texto de busca"),
    user: dict = Depends(require_user),
) -> list:
    """Busca full-text nos bullets.

    Returns:
        [{"date": str, "bullets": [{id, content, kind}]}, ...]
    """
    return search_bullets(query=q)


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS NOVOS (Violet · Diário)
# ═════════════════════════════════════════════════════════════════════════════

@router.put("/page/dream")
def set_dream_endpoint(
    body: DreamBody,
    user: dict = Depends(require_user),
) -> dict:
    """Atualizar o campo dream de uma entry.

    Args:
        body: {page_id, dream} — dream=None ou "" limpa o campo.

    Returns:
        {"status": "ok"}
    """
    result = set_dream(page_id=body.page_id, text=body.dream or '')
    return _check_result(result)


@router.get("/entries")
def entries_endpoint(
    q: str = Query(default='', description="Busca opcional"),
    user: dict = Depends(require_user),
) -> list:
    """Listar entries resumidas para o arquivo do diário.

    Returns:
        [{date, num, excerpt, bullet_count, has_highlight, has_dream}, ...]
        Ordenado por date DESC.
    """
    return list_entries(query=q)


@router.get("/collection/{kind}")
def collection_endpoint(
    kind: str,
    user: dict = Depends(require_user),
) -> list:
    """Retornar bullets de um tipo específico.

    Args:
        kind: highlight, dream, idea, wisdom, note.

    Returns:
        [{id, kind, content, created_at, date, entry_num}, ...]

    Raises:
        HTTPException: 400 se kind inválido.
    """
    valid_kinds = {'highlight', 'dream', 'idea', 'wisdom', 'note'}
    if kind not in valid_kinds:
        raise HTTPException(status_code=400, detail="kind inválido")
    return list_collection(kind=kind)


@router.get("/dreams")
def dreams_endpoint(
    user: dict = Depends(require_user),
) -> list:
    """Retornar todas as entries com campo dream não nulo.

    Returns:
        [{page_id, date, entry_num, dream}, ...] ordenado por date DESC.
    """
    return list_dreams()


@router.get("/stats")
def stats_endpoint(
    year: int = Query(..., description="Ano de referência"),
    user: dict = Depends(require_user),
) -> dict:
    """Retornar estatísticas agregadas do ano para a tela Insights.

    Returns:
        {entries, bullets, days_written, total_words, per_day, highlights,
         tags, mentions, dreams, highlight_rate, freq_per_week,
         words_by_month, daytime}
    """
    return get_stats(year=year)


@router.get("/years")
def years_endpoint(user: dict = Depends(require_user)) -> list:
    """Listar os anos com registro no diário, do mais recente ao primeiro.

    Usado para popular o seletor de ano na tela Insights. Retorna intervalo
    contíguo do ano corrente até o ano da primeira entrada registrada.
    Se ainda não há entradas, retorna apenas o ano corrente.

    Returns:
        Lista de inteiros em ordem decrescente, ex.: [2026, 2025].
    """
    # Retorna lista crua — sem campo "status", não usar _check_result
    return get_available_years()


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS DA FEATURE 006 (Registro Emocional TCC)
# ═════════════════════════════════════════════════════════════════════════════

def _validate_reappraisal(reappraised_intensity, adaptive_response) -> None:
    """Garantir que a reavaliação de intensidade só venha com resposta adaptativa.

    A reavaliação mede o efeito da resposta adaptativa — sem ela, não faz sentido.
    Essa regra é validada aqui no router (além de na interface) para proteger a API.

    Args:
        reappraised_intensity: Intensidade reavaliada recebida (pode ser None).
        adaptive_response: Resposta adaptativa recebida (pode ser None/vazia).

    Raises:
        HTTPException: 400 se reappraised_intensity vier preenchida mas
            adaptive_response estiver ausente ou vazia.
    """
    # Só validamos quando o usuário enviou uma intensidade reavaliada
    if reappraised_intensity is not None:
        # adaptive_response precisa existir e não ser só espaços em branco
        if not (adaptive_response and adaptive_response.strip()):
            raise HTTPException(
                status_code=400,
                detail="A reavaliação de intensidade exige uma resposta adaptativa preenchida.",
            )


@router.get("/emotions")
def list_emotions_endpoint(
    user: dict = Depends(require_user),
) -> list:
    """Listar o vocabulário de emoções (predefinidas + custom).

    Returns:
        [{"id": int, "name": str, "is_predefined": bool}, ...]
        (predefinidas primeiro, depois custom em ordem alfabética).
    """
    # Retorna a lista direto — sem _check_result (a tool não tem campo "status")
    return list_emotions()


@router.post("/emotions", status_code=201)
def create_emotion_endpoint(
    body: CreateEmotionBody,
    user: dict = Depends(require_user),
) -> dict:
    """Criar uma emoção custom (idempotente — retorna a existente se já houver).

    Args:
        body: {name} — nome da emoção.

    Returns:
        {"status": "ok", "emotion": {"id", "name", "is_predefined"}}

    Raises:
        HTTPException: 400 se o nome for vazio.
    """
    return _check_result(create_emotion(name=body.name))


@router.get("/emotion-logs")
def list_emotion_logs_endpoint(
    page_id: int = Query(..., description="ID da página (dia) cujos registros queremos"),
    user: dict = Depends(require_user),
) -> list:
    """Listar os registros emocionais de um dia (página).

    Args:
        page_id: ID da página.

    Returns:
        [{id, page_id, emotion_id, emotion_name, intensity, situation,
          automatic_thought, adaptive_response, reappraised_intensity,
          created_at}, ...] ordenado por created_at ASC.
    """
    # Retorna a lista direto — sem _check_result (a tool não tem campo "status")
    return list_emotion_logs(page_id=page_id)


@router.post("/emotion-logs", status_code=201)
def create_emotion_log_endpoint(
    body: CreateEmotionLogBody,
    user: dict = Depends(require_user),
) -> dict:
    """Criar um registro emocional (Registro de Pensamentos da TCC).

    Args:
        body: {page_id, emotion_id, intensity, situation?, automatic_thought?,
               adaptive_response?, reappraised_intensity?}

    Returns:
        {"status": "ok", "log": {...}}

    Raises:
        HTTPException: 400 se page_id/emotion_id não existirem, ou se a reavaliação
            vier sem resposta adaptativa.
    """
    # Regra de negócio: reavaliação exige resposta adaptativa preenchida
    _validate_reappraisal(body.reappraised_intensity, body.adaptive_response)
    return _check_result(create_emotion_log(
        page_id=body.page_id,
        emotion_id=body.emotion_id,
        intensity=body.intensity,
        situation=body.situation,
        automatic_thought=body.automatic_thought,
        adaptive_response=body.adaptive_response,
        reappraised_intensity=body.reappraised_intensity,
    ))


@router.patch("/emotion-logs/{log_id}")
def update_emotion_log_endpoint(
    log_id: int,
    body: UpdateEmotionLogBody,
    user: dict = Depends(require_user),
) -> dict:
    """Atualizar um registro emocional (atualização parcial dos campos enviados).

    Args:
        log_id: ID do registro.
        body: Campos a atualizar (todos opcionais).

    Returns:
        {"status": "ok", "log": {...}}

    Raises:
        HTTPException: 400 se o registro não existir, emotion_id inválido, ou se a
            reavaliação vier sem resposta adaptativa.
    """
    # Regra de negócio: reavaliação exige resposta adaptativa preenchida
    _validate_reappraisal(body.reappraised_intensity, body.adaptive_response)
    # exclude_unset=True: só inclui no update os campos que o cliente realmente enviou,
    # preservando os demais valores já salvos no banco
    updates = body.model_dump(exclude_unset=True)
    return _check_result(update_emotion_log(log_id, **updates))


@router.delete("/emotion-logs/{log_id}")
def delete_emotion_log_endpoint(
    log_id: int,
    user: dict = Depends(require_user),
) -> dict:
    """Deletar um registro emocional pelo ID.

    Args:
        log_id: ID do registro.

    Returns:
        {"status": "ok"}

    Raises:
        HTTPException: 404 se o registro não for encontrado.
    """
    result = delete_emotion_log(log_id=log_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=404, detail=result.get("message", "registro não encontrado"))
    return result


@router.get("/emotion-stats")
def emotion_stats_endpoint(
    year: int = Query(..., description="Ano de referência"),
    user: dict = Depends(require_user),
) -> dict:
    """Agregações de emoções do ano para a aba "Emoções" dos Insights.

    Args:
        year: Ano de referência.

    Returns:
        {total, avg_intensity, top_emotion, by_emotion:[{name, count, avg_intensity}],
         by_month:[12]}
    """
    # Retorna o dict direto — sem _check_result (a tool não tem campo "status")
    return get_emotion_stats(year=year)
