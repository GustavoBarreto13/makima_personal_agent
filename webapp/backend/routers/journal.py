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
from pydantic import BaseModel

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
