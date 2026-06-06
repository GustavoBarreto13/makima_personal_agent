"""Router do journal — expõe as tools do diário pessoal como endpoints REST.

Cada endpoint embrulha diretamente uma função de tool do journal (agents/journal/tools.py).
As tools retornam dicts com "status": "ok"/"error" — o router converte "error" em HTTP 400.

Usage:
    # Em main.py:
    from webapp.backend.routers import journal as journal_router
    app.include_router(journal_router.router, prefix="/api/journal", tags=["journal"])
"""

# Imports do FastAPI: APIRouter (agrupa rotas), Depends (injeção de dependências),
# HTTPException (lança erros HTTP), Query (extrai query params tipados)
import re  # Para validar o formato da data (YYYY-MM-DD) antes de enviar ao banco

from fastapi import APIRouter, Depends, HTTPException, Query

# BaseModel é a base para todos os modelos Pydantic (validação de body da requisição)
from pydantic import BaseModel

# Literal permite restringir um parâmetro a um conjunto fixo de valores.
# O FastAPI usa isso para validar query params automaticamente (retorna 422 se inválido).
from typing import Literal

# require_user é a dependência de autenticação — bloqueia rotas não autenticadas.
# Obrigatória em TODAS as rotas /api/* sem exceção.
from webapp.backend.deps import require_user

# ─── Tools do journal — importadas diretamente (sem instanciar agente) ────────
from agents.journal.tools import (
    get_or_create_page,       # Busca ou cria página para uma data
    upsert_bullet,            # Insere ou atualiza um bullet em uma posição
    delete_bullet,            # Remove um bullet pelo ID
    list_heatmap,             # Contagem de bullets por dia para o heatmap
    list_mentions,            # Lista @pessoas ou #tags com contagem
    get_bullets_by_mention,   # Bullets que mencionam uma pessoa ou tag
    search_bullets,           # Busca full-text nos bullets
)


# ─── Helper interno ───────────────────────────────────────────────────────────

def _check_result(result: dict) -> dict:
    """Verificar o resultado de uma tool do journal e lançar exceção se houve erro.

    As tools do journal retornam dicts com "status": "ok" ou "status": "error".
    Esta função centraliza a conversão para exceções HTTP, evitando repetição
    em cada endpoint.

    Args:
        result: Dicionário retornado pela tool.

    Returns:
        O próprio `result` se status == "ok" (ou se não houver campo "status").

    Raises:
        HTTPException: 400 se a tool retornou "status": "error".

    Example:
        >>> _check_result({"status": "ok", "page": {}})
        {"status": "ok", "page": {}}
    """
    # Converte "error" em HTTP 400 Bad Request com a mensagem da tool
    if result.get("status") == "error":
        raise HTTPException(
            status_code=400,
            detail=result.get("message", "Erro desconhecido"),
        )
    return result


# ─── Criação do router ────────────────────────────────────────────────────────

# O prefixo "/api/journal" é adicionado em main.py quando este router é incluído
router = APIRouter()


# ═════════════════════════════════════════════════════════════════════════════
# MODELOS PYDANTIC — Validação dos corpos das requisições POST
# ═════════════════════════════════════════════════════════════════════════════

class UpsertBulletBody(BaseModel):
    """Corpo da requisição para inserir ou atualizar um bullet."""
    page_id: int    # ID da página à qual o bullet pertence (obrigatório)
    position: int   # Posição (linha) do bullet na página (obrigatório)
    content: str    # Texto do bullet (obrigatório, pode ser string vazia)


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/page")
def page_endpoint(
    # date é obrigatório — Query(...) faz o FastAPI retornar 422 se ausente
    date: str = Query(..., description="Data no formato YYYY-MM-DD"),
    # type_id opcional — padrão 1 (personal)
    type_id: int = Query(default=1, description="ID do tipo de diário (padrão: 1 = personal)"),
    user: dict = Depends(require_user),
) -> dict:
    """Buscar ou criar a página do diário para uma data específica.

    Se ainda não existir uma página para (type_id, date), ela é criada automaticamente.
    Retorna a página com todos os seus bullets ordenados por posição.

    Args:
        date: Data da página no formato YYYY-MM-DD (obrigatório).
        type_id: ID do tipo de diário (padrão: 1 = personal).
        user: Dados do usuário autenticado (injetado pelo Depends).

    Returns:
        Dicionário com "page" e "bullets" da data solicitada.

    Raises:
        HTTPException: 400 se houver erro ao acessar o banco.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Valida o formato da data antes de enviar ao banco — evita HTTP 500 por DataError do PostgreSQL
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', date):
        raise HTTPException(status_code=400, detail="Formato de data inválido. Use YYYY-MM-DD.")

    # Chama a tool que faz get-or-create da página no PostgreSQL
    result = get_or_create_page(date=date, type_id=type_id)

    # get_or_create_page pode retornar {"error": "type_id não encontrado"}
    # quando type_id não existe — converte para HTTP 400 antes de chamar _check_result
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])

    return _check_result(result)


@router.post("/bullets", status_code=200)
def upsert_bullet_endpoint(
    body: UpsertBulletBody,
    user: dict = Depends(require_user),
) -> dict:
    """Inserir ou atualizar um bullet em uma posição da página.

    Se já existir um bullet na posição (page_id, position), atualiza o conteúdo.
    Se não existir, cria um novo bullet. Após salvar, as menções (@pessoa, #tag)
    são re-extraídas e atualizadas automaticamente.

    Args:
        body: Dados do bullet (page_id, position e content são obrigatórios).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e os dados do bullet salvo.

    Raises:
        HTTPException: 400 se houver erro de banco (page_id inexistente, etc.).
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Repassa os campos do body para a tool de upsert
    result = upsert_bullet(
        page_id=body.page_id,
        position=body.position,
        content=body.content,
    )
    return _check_result(result)


@router.delete("/bullets/{bullet_id}")
def delete_bullet_endpoint(
    bullet_id: int,                      # ID do bullet, vem na URL
    user: dict = Depends(require_user),
) -> dict:
    """Deletar um bullet pelo ID.

    Remove o bullet e suas menções associadas (ON DELETE CASCADE no banco).

    Args:
        bullet_id: ID único do bullet a ser removido.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok".

    Raises:
        HTTPException: 400 se houver erro ao deletar.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Deleta o bullet — as menções são removidas automaticamente pelo CASCADE
    result = delete_bullet(bullet_id=bullet_id)

    # Se o bullet não foi encontrado, retorna 404 (não encontrado) em vez de 400 (erro genérico)
    if result.get("status") == "error":
        raise HTTPException(
            status_code=404,
            detail=result.get("message", "bullet não encontrado"),
        )

    return result


@router.get("/heatmap")
def heatmap_endpoint(
    # year é obrigatório — Query(...) retorna 422 se ausente
    year: int = Query(..., description="Ano de referência (ex.: 2026)"),
    user: dict = Depends(require_user),
) -> dict:
    """Obter contagem de bullets por dia para o heatmap de atividade do diário.

    Retorna apenas os dias que têm pelo menos um bullet registrado.
    Dias sem entrada não aparecem no resultado.

    Args:
        year: Ano de referência (ex.: 2026).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário mapeando datas para contagens:
        {"2026-06-06": 3, "2026-06-07": 1, ...}

    Raises:
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Chama a tool que conta bullets por dia para o ano informado
    result = list_heatmap(year=year)
    # list_heatmap retorna dict diretamente (não tem campo "status")
    # então não precisamos de _check_result aqui — retornamos direto
    return result


@router.get("/mentions")
def mentions_endpoint(
    # Literal["person", "tag"] faz o FastAPI rejeitar automaticamente com 422
    # qualquer valor diferente de 'person' ou 'tag' — sem precisar validar manualmente
    kind: Literal["person", "tag"] = Query(..., description="Tipo da menção: 'person' ou 'tag'"),
    user: dict = Depends(require_user),
) -> list:
    """Listar todas as menções distintas de um tipo, com contagem de ocorrências.

    Útil para exibir painéis de "pessoas mais mencionadas" ou "tags mais usadas".

    Args:
        kind: Tipo da menção: 'person' (para @nomes) ou 'tag' (para #tags).
        user: Dados do usuário autenticado.

    Returns:
        Lista de dicionários [{"value": "Fulano", "count": 12}, ...]
        ordenados por count DESC.

    Raises:
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Retorna lista de menções com contagem — não tem campo "status", retorna direto
    return list_mentions(kind=kind)


@router.get("/filter")
def filter_by_mention_endpoint(
    # Literal["person", "tag"] — FastAPI retorna 422 automaticamente para valores inválidos
    kind: Literal["person", "tag"] = Query(..., description="Tipo da menção: 'person' ou 'tag'"),
    value: str = Query(..., description="Valor da menção sem símbolo (ex.: 'Fulano', não '@Fulano')"),
    user: dict = Depends(require_user),
) -> list:
    """Buscar todos os bullets que mencionam uma pessoa ou tag específica.

    Retorna os resultados agrupados por data, do mais recente ao mais antigo.

    Args:
        kind: Tipo da menção: 'person' ou 'tag'.
        value: Valor da menção sem o símbolo (ex.: "Fulano", não "@Fulano").
        user: Dados do usuário autenticado.

    Returns:
        Lista de dicionários agrupados por data:
        [{"date": "2026-06-06", "bullets": [{"id": 1, "content": "..."}, ...]}, ...]

    Raises:
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Filtra bullets que contêm a menção especificada, agrupados por data
    return get_bullets_by_mention(kind=kind, value=value)


@router.get("/search")
def search_endpoint(
    # q é obrigatório — Query(...) retorna 422 se ausente
    q: str = Query(..., description="Texto de busca em linguagem natural"),
    user: dict = Depends(require_user),
) -> list:
    """Buscar bullets por texto usando full-text search em português.

    Usa o índice TSVECTOR do PostgreSQL com dicionário 'portuguese'
    para stemming e busca eficiente mesmo em tabelas grandes.

    Args:
        q: Texto de busca (ex.: "viagem São Paulo", "reunião trabalho").
        user: Dados do usuário autenticado.

    Returns:
        Lista de dicionários agrupados por data:
        [{"date": "2026-06-06", "bullets": [{"id": 1, "content": "..."}, ...]}, ...]
        Ordenado por date DESC.

    Raises:
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Executa a busca full-text e retorna resultados agrupados por data
    return search_bullets(query=q)
