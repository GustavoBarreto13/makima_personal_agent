"""Router de livros — expõe as tools da Frieren como endpoints REST.

Cada endpoint embrulha diretamente uma função de tool da Frieren ou executa
queries diretas no PostgreSQL via run_select de agents.db.

Diferença importante em relação ao router de finanças (finances.py):
As tools da Nami retornam dicts com {"status": "ok"|"error"}, fáceis de checar.
As tools da Frieren retornam **strings HTML** (ex: "<b>Duna</b> adicionado...").
Por isso usamos _books_check() em vez de _check_result() para detectar erros.

Usage:
    # Em main.py:
    from webapp.backend.routers import books as books_router
    app.include_router(books_router.router, prefix="/api/books", tags=["books"])
"""

# re é usado em _books_check para remover tags HTML das mensagens de erro
import re

# datetime.date é usado para obter o ano atual como valor padrão no endpoint de stats
from datetime import date

# Optional permite campos que podem ser None (ex.: author: Optional[str] = None)
from typing import Optional

# Imports do FastAPI: APIRouter (agrupa rotas), Depends (injeção de dependências),
# HTTPException (lança erros HTTP), Query (extrai query params tipados)
from fastapi import APIRouter, Depends, HTTPException, Query

# BaseModel é a base de todos os modelos Pydantic (validação do body da requisição)
from pydantic import BaseModel

# require_user é a dependência de autenticação — bloqueia rotas não autenticadas
# Deve ser incluída em TODAS as rotas /api/* sem exceção
from webapp.backend.deps import require_user

# ─── Tools da Frieren — importadas diretamente (sem instanciar agente) ────────

# Funções de mutação — retornam strings HTML como confirmação ou descrição de erro
from agents.frieren.tools import (
    add_book,           # Adiciona livro ao catálogo (enriquece via Google Books)
    log_reading,        # Registra progresso de leitura de uma sessão
    finish_book,        # Marca livro como lido, registra data e avaliação
    update_book_status, # Atualiza o status de um livro (lendo, pausado, etc.)
    update_book_pages,          # Corrige o total de páginas de uma edição
    update_book_metadata_by_id, # Atualiza campos de metadados do livro diretamente por ID
    delete_book,        # Soft delete — marca deleted=TRUE
    delete_reading_log, # Hard delete de uma sessão de leitura pelo ID
)

# Função de consulta estruturada — retorna dict (não string HTML)
from agents.frieren.tools import get_book_by_id

# Tools de estantes, feed de atividade e heatmap — retornam dicts com status
from agents.frieren.tools import (
    get_shelves, create_shelf, update_shelf, delete_shelf,
    add_book_to_shelf, remove_book_from_shelf,
    get_activity_feed, get_heatmap_data,
)

# _fetch_google_books: busca metadados de livros na Google Books API
from agents.frieren.tools import _fetch_google_books

# run_select executa SELECT no PostgreSQL e retorna lista de dicts
from agents.db import run_select


# ─── Listas de padrões de erro das tools da Frieren ─────────────────────────

# As tools da Frieren retornam strings HTML, não dicts com "status".
# Precisamos detectar se a resposta indica erro verificando se a mensagem
# contém algum desses padrões (em minúsculas para comparação case-insensitive).
_FRIEREN_ERRORS = [
    "nenhum livro encontrado",   # Livro não localizado pelo título/autor/ISBN
    "status inválido",           # Status fora dos valores aceitos
    "não pode ser negativo",     # Número de páginas negativo
    "ultrapassa o total",        # Página atual maior que o total de páginas do livro
    "menor que a última",        # Página informada é menor que a última registrada
    "nenhum progresso",          # delta de páginas lidas é zero
    "a avaliação deve ser",      # Rating fora do intervalo 1.0-5.0
    "não encontrei",             # Livro não encontrado no catálogo (update_book_pages)
    "já está no catálogo",       # Tentativa de adicionar livro duplicado
    "nenhum log",                # Nenhuma sessão de leitura registrada (sem log anterior)
    "não encontrado",            # book_id inexistente (update_book_metadata_by_id)
    "erro ao atualizar",         # Falha no BigQuery (update_book_metadata_by_id)
    "nenhum campo para atualizar", # Payload vazio (update_book_metadata_by_id)
]


def _books_check(msg: str) -> dict:
    """Verificar se a tool da Frieren retornou erro e lançar HTTP 400 se sim.

    As tools da Frieren retornam strings HTML para confirmação E para erros.
    Esta função centraliza a detecção de erros verificando padrões de texto
    conhecidos que indicam falha (lista _FRIEREN_ERRORS).

    Em caso de erro, limpa as tags HTML antes de retornar ao cliente,
    pois a mensagem de detalhe do HTTP 400 será exibida como texto puro.

    Args:
        msg: String HTML retornada pela tool da Frieren.

    Returns:
        Dicionário {"status": "ok", "message": msg} se não houver erro.

    Raises:
        HTTPException: 400 se a mensagem indicar um erro da tool.

    Example:
        >>> _books_check("<b>Duna</b> adicionado com sucesso.")
        {"status": "ok", "message": "<b>Duna</b> adicionado com sucesso."}
    """
    # Verifica se algum dos padrões de erro está presente na mensagem (case-insensitive)
    if any(p in msg.lower() for p in _FRIEREN_ERRORS):
        # Remove tags HTML (ex: <b>, </b>, <code>) para exibir mensagem de erro limpa
        # re.sub('<[^>]+>', '', msg) captura qualquer coisa entre < e > e substitui por vazio
        clean = re.sub('<[^>]+>', '', msg)
        raise HTTPException(status_code=400, detail=clean)

    # Sem erro detectado — retorna a mensagem encapsulada em dict de sucesso
    return {"status": "ok", "message": msg}


def _serialize_book(row: dict) -> dict:
    """Converter tipos não-JSON-serializáveis de uma linha do BigQuery para string.

    O BigQuery retorna campos DATE como objetos `datetime.date` e campos TIMESTAMP
    como `datetime.datetime`. O FastAPI não consegue serializar esses tipos para JSON
    automaticamente — precisamos converter para string ISO 8601 (ex.: "2026-06-01").

    O método `isoformat()` existe em `date`, `datetime` e `time` do Python,
    o que permite usar `hasattr` como verificação genérica.

    Args:
        row: Dicionário com os dados de uma linha do BigQuery.

    Returns:
        Novo dicionário com todos os valores serializáveis como JSON.

    Example:
        >>> from datetime import date
        >>> _serialize_book({"id": "abc", "date_started": date(2026, 1, 1)})
        {"id": "abc", "date_started": "2026-01-01"}
    """
    out = {}
    for k, v in row.items():
        # hasattr(v, 'isoformat') é True para date, datetime e time do Python
        # — todos esses tipos têm o método isoformat() que retorna string ISO 8601
        if hasattr(v, 'isoformat'):
            out[k] = v.isoformat()  # Converte para string (ex.: "2026-06-01")
        else:
            out[k] = v  # Tipos nativos (str, int, float, bool, None) passam sem conversão
    return out


# ─── Criação do router ────────────────────────────────────────────────────────

# O prefixo "/api/books" é adicionado em main.py quando este router é incluído
router = APIRouter()


# ═════════════════════════════════════════════════════════════════════════════
# MODELOS PYDANTIC — Validação dos corpos das requisições POST/PATCH
# ═════════════════════════════════════════════════════════════════════════════

class AddBookBody(BaseModel):
    """Corpo da requisição para adicionar um livro ao catálogo."""
    title: str                              # Título do livro (obrigatório)
    status: str = "quero_ler"               # Status inicial (padrão: lista de desejos)
    google_books_id: Optional[str] = None  # ID da Google Books para buscar metadados precisos
    author: Optional[str] = None           # Autor (opcional — Frieren tenta buscar via API)
    total_pages: Optional[int] = None      # Total de páginas da edição física do usuário


class LogReadingBody(BaseModel):
    """Corpo da requisição para registrar uma sessão de leitura."""
    current_page: int                      # Página atual do leitor após a sessão (obrigatório)
    session_notes: Optional[str] = None   # Anotações opcionais sobre a sessão
    log_date: Optional[str] = None        # Data da sessão em YYYY-MM-DD (padrão: hoje)


class FinishBookBody(BaseModel):
    """Corpo da requisição para marcar um livro como concluído."""
    rating: Optional[float] = None        # Avaliação pessoal de 1.0 a 5.0 (opcional)
    notes: Optional[str] = None           # Anotações finais ou resenha (opcional)
    date_finished: Optional[str] = None   # Data de conclusão YYYY-MM-DD (padrão: hoje)
    date_started: Optional[str] = None    # Data de início YYYY-MM-DD (opcional — sobrescreve)


class UpdateStatusBody(BaseModel):
    """Corpo da requisição para atualizar o status de um livro."""
    status: str  # Novo status: "lendo" | "lido" | "quero_ler" | "pausado" | "abandonado"


class UpdatePagesBody(BaseModel):
    """Corpo da requisição para corrigir o total de páginas de um livro."""
    total_pages: int  # Número correto de páginas da edição física do usuário


class UpdateBookMetadataBody(BaseModel):
    """Corpo da requisição para atualizar metadados de um livro diretamente por ID.

    Todos os campos são opcionais — apenas os campos enviados serão atualizados.
    Útil para corrigir dados enriquecidos pela Google Books API ou preencher
    campos que ficaram vazios no cadastro inicial.
    """
    title: Optional[str] = None           # Título do livro
    author: Optional[str] = None          # Autor do livro
    cover_url: Optional[str] = None       # URL da imagem de capa
    total_pages: Optional[int] = None     # Total de páginas da edição
    genre: Optional[str] = None           # Gênero literário
    published_year: Optional[int] = None  # Ano de publicação
    isbn: Optional[str] = None            # ISBN-10 ou ISBN-13
    language: Optional[str] = None        # Idioma (ex.: "pt-BR", "en")
    description: Optional[str] = None     # Sinopse ou descrição do livro
    notes: Optional[str] = None           # Anotações pessoais / resenha do leitor
    store_url: Optional[str] = None       # URL do anúncio na loja (Amazon, Estante Virtual, etc.)
    price: Optional[float] = None         # Preço visto na loja (wishlist)


class CreateShelfBody(BaseModel):
    """Dados para criar uma nova estante."""
    name: str                                              # Nome da estante (obrigatório)
    description: str = ""                                  # Descrição opcional
    accent: str = "oklch(0.58 0.085 195)"                 # Cor oklch da estante


class UpdateShelfBody(BaseModel):
    """Dados para atualizar uma estante (todos os campos opcionais)."""
    name: Optional[str] = None           # Novo nome da estante
    description: Optional[str] = None   # Nova descrição
    accent: Optional[str] = None        # Nova cor oklch


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS COM PATH FIXO — devem vir ANTES dos endpoints com {book_id}
#
# IMPORTANTE: No FastAPI, a ordem de registro das rotas importa.
# Rotas fixas (ex: /stats, /search-google) devem ser declaradas ANTES
# de rotas com parâmetros de path (ex: /{book_id}), caso contrário o FastAPI
# interpretaria "stats" e "search-google" como valores de book_id.
# ═════════════════════════════════════════════════════════════════════════════

@router.get("")
def list_books(
    user: dict = Depends(require_user),
) -> dict:
    """Listar todos os livros do catálogo com progresso de leitura.

    Executa uma query no PostgreSQL que une a tabela de livros com os logs
    de leitura para calcular a página atual de cada livro (MAX(page_end)).

    A ordenação prioriza livros em leitura ativa, depois lista de desejos,
    pausados, lidos e abandonados — correspondendo à prioridade de exibição.

    Args:
        user: Dados do usuário autenticado (injetado automaticamente pelo Depends).

    Returns:
        Dicionário com "status": "ok" e lista de livros com todos os campos.

    Raises:
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    sql = """
        SELECT
            b.id,
            b.title,
            b.author,
            b.total_pages,
            b.status,
            b.cover_url,
            b.date_started,
            b.date_finished,
            b.rating,
            b.genre,
            b.isbn,
            b.published_year,
            b.updated_at,
            MAX(rl.page_end) AS current_page
        FROM books b
        LEFT JOIN reading_logs rl ON rl.book_id = b.id
        WHERE b.deleted = FALSE
        GROUP BY b.id, b.title, b.author, b.total_pages, b.status,
                 b.cover_url, b.date_started, b.date_finished, b.rating,
                 b.genre, b.isbn, b.published_year, b.updated_at
        ORDER BY
            CASE b.status
                WHEN 'lendo'      THEN 0
                WHEN 'estante'    THEN 1
                WHEN 'quero_ler'  THEN 2
                WHEN 'wishlist'   THEN 3
                WHEN 'pausado'    THEN 4
                WHEN 'lido'       THEN 5
                WHEN 'abandonado' THEN 6
                ELSE 7
            END,
            b.updated_at DESC
    """

    rows = run_select(sql)

    # Converte tipos não-serializáveis (date, datetime) para string em cada linha
    books = [_serialize_book(dict(row)) for row in rows]

    # Busca estantes em lote para todos os livros (evita N+1 queries)
    # ANY(%s::uuid[]) aceita uma lista Python como array PostgreSQL
    all_ids = [b["id"] for b in books]
    if all_ids:
        shelf_rows = run_select(
            "SELECT book_id::text, shelf_id::text FROM book_shelves WHERE book_id = ANY(%s::uuid[])",
            [all_ids]
        )
        # Agrupa shelf_ids por book_id em um dicionário para lookup O(1)
        shelf_map: dict = {}
        for r in shelf_rows:
            shelf_map.setdefault(r["book_id"], []).append(r["shelf_id"])
        # Adiciona a lista de estantes a cada livro serializado
        for b in books:
            b["shelves"] = shelf_map.get(b["id"], [])
    else:
        # Sem livros no catálogo — garante campo shelves presente para o frontend
        for b in books:
            b["shelves"] = []

    return {"status": "ok", "books": books}


@router.get("/stats")
def reading_stats(
    # Optional[int] porque o ano pode ser omitido (None = usa ano atual)
    year: Optional[int] = Query(default=None, description="Ano de referência (padrão: ano atual)"),
    user: dict = Depends(require_user),
) -> dict:
    """Obter estatísticas de leitura para um ano específico.

    Executa 3 queries independentes no BigQuery para calcular:
    1. Livros concluídos e avaliação média no ano
    2. Total de páginas lidas e total de sessões no ano
    3. Média de páginas por dia (calculada sobre os últimos 30 dias com leitura)

    Args:
        year: Ano de referência (padrão: ano atual).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com métricas agregadas de leitura do ano.

    Raises:
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Se o ano não foi informado, usa o ano atual no calendário brasileiro
    if year is None:
        year = date.today().year

    # ── Query 1: Livros concluídos e avaliação média ───────────────────────────
    sql_books = """
        SELECT COUNT(*) AS books_finished, AVG(rating) AS avg_rating
        FROM books
        WHERE status = 'lido'
          AND EXTRACT(YEAR FROM date_finished) = %(year)s
          AND deleted = FALSE
    """
    rows_books = run_select(sql_books, {"year": year})

    # ── Query 2: Total de páginas e sessões de leitura no ano ─────────────────
    sql_logs = """
        SELECT COALESCE(SUM(pages_read), 0) AS total_pages,
               COUNT(*) AS total_sessions
        FROM reading_logs
        WHERE EXTRACT(YEAR FROM date) = %(year)s
    """
    rows_logs = run_select(sql_logs, {"year": year})

    # ── Query 3: Ritmo diário — últimos 30 dias com leitura no ano ────────────
    sql_pace = """
        SELECT date, SUM(pages_read) AS daily_pages
        FROM reading_logs
        WHERE EXTRACT(YEAR FROM date) = %(year)s
        GROUP BY date
        ORDER BY date DESC
        LIMIT 30
    """
    rows_pace = run_select(sql_pace, {"year": year})

    # ── Extrai valores das queries ────────────────────────────────────────────

    # Livros concluídos — garante int mesmo se BigQuery retornar Decimal
    books_finished = int(rows_books[0]["books_finished"]) if rows_books else 0

    # Avaliação média — None se nenhum livro avaliado (AVG de conjunto vazio = None)
    avg_rating = rows_books[0]["avg_rating"] if rows_books else None

    # Total de páginas — garante int
    total_pages = int(rows_logs[0]["total_pages"]) if rows_logs else 0

    # Total de sessões — garante int
    total_sessions = int(rows_logs[0]["total_sessions"]) if rows_logs else 0

    # Média diária: soma de páginas dos 30 dias dividida pela quantidade de dias com leitura.
    # Se não houver nenhum dado de ritmo, deixa None para o frontend saber que não há dado.
    avg_daily_pages: Optional[float] = None
    if rows_pace:
        soma = sum(r["daily_pages"] for r in rows_pace)
        avg_daily_pages = round(soma / len(rows_pace), 1)

    return {
        "status": "ok",
        "year": year,
        "books_finished": books_finished,
        "avg_rating": avg_rating,
        "total_pages": total_pages,
        "total_sessions": total_sessions,
        "avg_daily_pages": avg_daily_pages,
    }


@router.get("/search-google")
def search_google_books(
    # Parâmetro de busca obrigatório — Query(...) torna obrigatório e retorna 422 se ausente
    q: str = Query(..., description="Termo de busca: título, autor ou ISBN"),
    user: dict = Depends(require_user),
) -> dict:
    """Buscar livros na Google Books API por título, autor ou ISBN.

    Usa o helper privado _fetch_google_books da Frieren para buscar até 8 resultados.
    A resposta inclui metadados como título, autor, páginas, ISBN, capa e ID Google Books.

    O ID Google Books retornado pode ser usado no endpoint POST /api/books para
    adicionar o livro com metadados precisos (evita pegar a edição errada).

    Args:
        q: Termo de busca (obrigatório).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e lista de resultados da Google Books.

    Raises:
        HTTPException: 422 se o parâmetro q não for informado.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Busca até 8 resultados — mais que os 5 padrão do agente para o webapp ter mais opções
    results = _fetch_google_books(q, max_results=8)

    return {"status": "ok", "results": results}


# ── Heatmap de páginas por dia ─────────────────────────────────────────────
@router.get("/heatmap")
def get_heatmap(year: Optional[int] = None, user: dict = Depends(require_user)) -> dict:
    """Retornar total de páginas lidas por dia para o heatmap de leitura.

    Args:
        year: Ano para filtrar (opcional — sem filtro retorna todos os anos).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e lista de {date, pages}.
    """
    # get_heatmap_data retorna dict com status, não string HTML — usa _check_result interno
    result = get_heatmap_data(year)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


# ── Feed de atividade global ────────────────────────────────────────────────
@router.get("/activity")
def get_activity(limit: int = 50, user: dict = Depends(require_user)) -> dict:
    """Retornar feed de atividade de leitura (todos os livros, mais recentes primeiro).

    Args:
        limit: Número máximo de entradas a retornar (padrão 50).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e lista de ActivityEntry.
    """
    result = get_activity_feed(limit)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


# ── CRUD de Estantes ────────────────────────────────────────────────────────
@router.get("/shelves")
def list_shelves(user: dict = Depends(require_user)) -> dict:
    """Listar todas as estantes com contagem de livros.

    Returns:
        Dicionário com "status": "ok" e lista de estantes.
    """
    result = get_shelves()
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.post("/shelves", status_code=201)
def create_new_shelf(body: CreateShelfBody, user: dict = Depends(require_user)) -> dict:
    """Criar uma nova estante.

    Args:
        body: Dados da estante (name obrigatório; description e accent opcionais).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e id da estante criada.
    """
    result = create_shelf(body.name, body.description, body.accent)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.patch("/shelves/{shelf_id}")
def update_existing_shelf(shelf_id: str, body: UpdateShelfBody, user: dict = Depends(require_user)) -> dict:
    """Atualizar nome, descrição ou cor de uma estante.

    Args:
        shelf_id: UUID da estante.
        body: Campos a atualizar (todos opcionais).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e mensagem de confirmação.
    """
    result = update_shelf(shelf_id, body.name, body.description, body.accent)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.delete("/shelves/{shelf_id}")
def delete_existing_shelf(shelf_id: str, user: dict = Depends(require_user)) -> dict:
    """Remover uma estante e seus vínculos com livros.

    Args:
        shelf_id: UUID da estante.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e mensagem de confirmação.
    """
    result = delete_shelf(shelf_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.post("/shelves/{shelf_id}/books/{book_id}", status_code=201)
def add_book_to_existing_shelf(shelf_id: str, book_id: str, user: dict = Depends(require_user)) -> dict:
    """Adicionar um livro a uma estante (idempotente).

    Args:
        shelf_id: UUID da estante.
        book_id: UUID do livro.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e mensagem de confirmação.
    """
    result = add_book_to_shelf(book_id, shelf_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.delete("/shelves/{shelf_id}/books/{book_id}")
def remove_book_from_existing_shelf(shelf_id: str, book_id: str, user: dict = Depends(require_user)) -> dict:
    """Remover um livro de uma estante.

    Args:
        shelf_id: UUID da estante.
        book_id: UUID do livro.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e mensagem de confirmação.
    """
    result = remove_book_from_shelf(book_id, shelf_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS COM PARÂMETRO DE PATH — devem vir DEPOIS dos paths fixos
# (ver nota sobre ordem de rotas no início da seção de paths fixos)
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/{book_id}")
def get_book(
    book_id: str,                        # ID do livro, vem na URL (ex.: /books/abc-123)
    user: dict = Depends(require_user),
) -> dict:
    """Obter detalhes completos de um livro pelo ID, incluindo página atual.

    Busca os dados do livro via get_book_by_id e complementa com a página atual
    do leitor (último page_end registrado nos logs de leitura).

    Args:
        book_id: ID único do livro (UUID).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e os dados completos do livro.

    Raises:
        HTTPException: 404 se o livro não for encontrado.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Busca o livro pelo ID exato (sem fuzzy match)
    book = get_book_by_id(book_id)

    # Retorna 404 se o livro não existir ou tiver sido deletado
    if book is None:
        raise HTTPException(status_code=404, detail="Livro não encontrado.")

    # Busca a página atual: último page_end registrado nos logs
    last_logs = run_select(
        "SELECT page_end FROM reading_logs WHERE book_id = %(book_id)s ORDER BY date DESC, created_at DESC LIMIT 1",
        {"book_id": book_id},
    )

    # Se não há nenhum log ou page_end for NULL, current_page = 0
    raw_page = last_logs[0]["page_end"] if last_logs else None
    current_page = int(raw_page) if raw_page is not None else 0

    # Serializa o livro (converte date/datetime para string) e adiciona current_page
    serialized = _serialize_book(dict(book))
    serialized["current_page"] = current_page

    # Busca as estantes deste livro para incluir na resposta
    shelf_rows = run_select(
        "SELECT shelf_id::text FROM book_shelves WHERE book_id = %s::uuid",
        [book_id]
    )
    serialized["shelves"] = [r["shelf_id"] for r in shelf_rows]

    return {"status": "ok", "book": serialized}


@router.get("/{book_id}/history")
def book_history(
    book_id: str,                        # ID do livro, vem na URL
    user: dict = Depends(require_user),
) -> dict:
    """Obter o histórico cronológico de sessões de leitura de um livro.

    Retorna todas as sessões registradas em ordem cronológica crescente
    (da mais antiga à mais recente), com data, páginas e anotações de cada sessão.

    Args:
        book_id: ID único do livro.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e lista de sessões de leitura.

    Raises:
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    logs = run_select(
        "SELECT id, date, page_start, page_end, pages_read, session_notes FROM reading_logs WHERE book_id = %(book_id)s ORDER BY date ASC, created_at ASC",
        {"book_id": book_id},
    )

    # Serializa cada log (converte date para string) antes de retornar
    serialized_logs = [_serialize_book(dict(log)) for log in logs]

    return {"status": "ok", "logs": serialized_logs}


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINTS DE ESCRITA — POST/PATCH (mutações no catálogo)
# ═════════════════════════════════════════════════════════════════════════════

@router.post("", status_code=201)
def add_book_endpoint(
    body: AddBookBody,
    user: dict = Depends(require_user),
) -> dict:
    """Adicionar um novo livro ao catálogo.

    Enriquece automaticamente os metadados via Google Books API se google_books_id
    ou apenas o título forem informados. Se o livro já existir no catálogo
    (mesmo título, fuzzy match), retorna HTTP 400.

    Args:
        body: Dados do livro (title é obrigatório; demais são opcionais).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e mensagem HTML de confirmação.

    Raises:
        HTTPException: 400 se o livro já existir ou o status for inválido.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Chama a tool da Frieren passando todos os campos do body
    msg = add_book(
        title=body.title,
        status=body.status,
        google_books_id=body.google_books_id,
        author=body.author,
        total_pages=body.total_pages,
    )
    # Verifica se a tool retornou uma mensagem de erro e converte para HTTP 400 se sim
    return _books_check(msg)


@router.post("/{book_id}/log", status_code=201)
def log_reading_endpoint(
    book_id: str,                        # ID do livro, vem na URL
    body: LogReadingBody,
    user: dict = Depends(require_user),
) -> dict:
    """Registrar uma sessão de progresso de leitura para um livro.

    Calcula automaticamente o número de páginas lidas na sessão
    (delta = página_atual - última_página_registrada).

    O endpoint usa o título do livro para chamar a tool log_reading,
    que usa fuzzy match internamente — mais robusto do que passar book_id diretamente.

    Args:
        book_id: ID único do livro.
        body: Página atual, anotações opcionais e data da sessão.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e mensagem HTML com o progresso registrado.

    Raises:
        HTTPException: 404 se o livro não for encontrado pelo ID.
        HTTPException: 400 se a página for inválida (negativa, abaixo da anterior, acima do total).
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Busca o livro pelo ID para obter o título — necessário para chamar log_reading
    book = get_book_by_id(book_id)
    if book is None:
        raise HTTPException(status_code=404, detail="Livro não encontrado.")

    # Chama a tool passando o título do livro (log_reading usa fuzzy match por título)
    msg = log_reading(
        book_query=book["title"],
        current_page=body.current_page,
        session_notes=body.session_notes,
        log_date=body.log_date,
    )
    return _books_check(msg)


@router.post("/{book_id}/finish", status_code=200)
def finish_book_endpoint(
    book_id: str,                        # ID do livro, vem na URL
    body: FinishBookBody,
    user: dict = Depends(require_user),
) -> dict:
    """Marcar um livro como concluído com avaliação e notas opcionais.

    Atualiza o status para 'lido', registra a data de conclusão (padrão: hoje)
    e opcionalmente salva avaliação (1.0-5.0) e anotações finais.
    Aceita datas retroativas — útil quando o usuário terminou antes de registrar.

    Args:
        book_id: ID único do livro.
        body: Dados de conclusão (todos opcionais — data de hoje é usada se ausente).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e mensagem HTML de confirmação.

    Raises:
        HTTPException: 404 se o livro não for encontrado.
        HTTPException: 400 se o rating for fora do intervalo 1.0-5.0.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Busca o livro pelo ID para obter o título
    book = get_book_by_id(book_id)
    if book is None:
        raise HTTPException(status_code=404, detail="Livro não encontrado.")

    # Chama a tool de conclusão passando o título e os dados de avaliação
    msg = finish_book(
        book_query=book["title"],
        rating=body.rating,
        notes=body.notes,
        date_finished=body.date_finished,
        date_started=body.date_started,
    )
    return _books_check(msg)


@router.patch("/{book_id}/status")
def update_status_endpoint(
    book_id: str,                        # ID do livro, vem na URL
    body: UpdateStatusBody,
    user: dict = Depends(require_user),
) -> dict:
    """Atualizar o status de um livro (lendo, pausado, quero_ler, etc.).

    Se o novo status for 'lendo' e o livro nunca teve data de início registrada,
    a tool registra automaticamente a data de hoje como date_started.

    Args:
        book_id: ID único do livro.
        body: Novo status (deve ser um dos 5 valores válidos).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e mensagem HTML de confirmação.

    Raises:
        HTTPException: 404 se o livro não for encontrado.
        HTTPException: 400 se o status informado for inválido.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Busca o livro pelo ID para obter o título
    book = get_book_by_id(book_id)
    if book is None:
        raise HTTPException(status_code=404, detail="Livro não encontrado.")

    # Chama a tool de atualização de status com o título e novo status
    msg = update_book_status(
        book_query=book["title"],
        status=body.status,
    )
    return _books_check(msg)


@router.patch("/{book_id}/metadata")
def update_metadata_endpoint(
    book_id: str,                        # ID do livro, vem na URL
    body: UpdateBookMetadataBody,
    user: dict = Depends(require_user),
) -> dict:
    """Atualizar metadados de um livro diretamente pelo ID.

    Permite corrigir ou preencher campos como título, autor, capa, gênero, ISBN,
    idioma e descrição sem precisar recriar o livro. Apenas os campos informados
    no body são atualizados — campos omitidos permanecem inalterados.

    Útil quando a Google Books API preencheu dados incorretos ou incompletos
    no momento do cadastro e o usuário quer ajustar manualmente pela interface.

    Args:
        book_id: ID único do livro (UUID).
        body: Campos a atualizar (todos opcionais — pelo menos um deve ser informado).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" em caso de sucesso.

    Raises:
        HTTPException: 400 se o livro não for encontrado ou os dados forem inválidos.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # model_dump(exclude_none=True) gera um dict apenas com os campos enviados,
    # ignorando os que ficaram None (não foram informados no body).
    # Isso garante que a tool só atualize o que o usuário quis alterar.
    msg = update_book_metadata_by_id(book_id, **body.model_dump(exclude_none=True))

    # Verifica se a tool retornou erro e converte para HTTP 400; caso contrário retorna {"status":"ok"}
    return _books_check(msg)


@router.patch("/{book_id}/pages")
def update_pages_endpoint(
    book_id: str,                        # ID do livro, vem na URL
    body: UpdatePagesBody,
    user: dict = Depends(require_user),
) -> dict:
    """Atualizar o total de páginas de um livro no catálogo.

    Útil quando a Google Books API retornou um número incorreto de páginas
    ou quando a edição física do usuário tem contagem diferente da edição digital.
    Após atualização, a tool recalcula e exibe o percentual de progresso atualizado.

    Args:
        book_id: ID único do livro.
        body: Novo total de páginas (deve ser maior que zero).
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e mensagem HTML com o progresso recalculado.

    Raises:
        HTTPException: 404 se o livro não for encontrado.
        HTTPException: 400 se total_pages for zero ou negativo.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Busca o livro pelo ID para obter o título
    book = get_book_by_id(book_id)
    if book is None:
        raise HTTPException(status_code=404, detail="Livro não encontrado.")

    # Chama a tool de atualização de páginas com o título e novo total
    msg = update_book_pages(
        book_query=book["title"],
        total_pages=body.total_pages,
    )
    return _books_check(msg)


@router.delete("/{book_id}", status_code=200)
def delete_book_endpoint(
    book_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Remover um livro do catálogo (soft delete — marca deleted=TRUE).

    Args:
        book_id: ID único do livro.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e mensagem de confirmação.

    Raises:
        HTTPException: 400 se o livro não for encontrado.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    msg = delete_book(book_id=book_id)
    return _books_check(msg)


@router.delete("/{book_id}/logs/{log_id}", status_code=200)
def delete_log_endpoint(
    book_id: str,
    log_id: str,
    user: dict = Depends(require_user),
) -> dict:
    """Remover uma sessão de leitura pelo ID (hard delete).

    Args:
        book_id: ID do livro pai (usado apenas para roteamento REST).
        log_id: ID da sessão de leitura a remover.
        user: Dados do usuário autenticado.

    Returns:
        Dicionário com "status": "ok" e detalhes do log removido.

    Raises:
        HTTPException: 400 se o log não for encontrado.
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    msg = delete_reading_log(log_id=log_id)
    return _books_check(msg)
