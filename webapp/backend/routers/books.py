"""Router de livros — expõe as tools da Frieren como endpoints REST.

Cada endpoint embrulha diretamente uma função de tool da Frieren ou executa
queries diretas no BigQuery via helpers privados da Frieren.

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
    update_book_pages,  # Corrige o total de páginas de uma edição
)

# Função de consulta estruturada — retorna dict (não string HTML)
from agents.frieren.tools import get_book_by_id

# Helpers privados — importáveis mesmo sendo "privados" por convenção (underscore)
# _run_select: executa SELECT no BigQuery e retorna lista de dicts
# _table: retorna o caminho completo da tabela no formato BigQuery (project.dataset.table)
# _fetch_google_books: busca metadados de livros na Google Books API
from agents.frieren.tools import _run_select, _table, _fetch_google_books

# ScalarQueryParameter é necessário para passar parâmetros tipados ao BigQuery,
# evitando SQL injection ao não concatenar valores diretamente nas queries
from google.cloud import bigquery


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

    Executa uma query no BigQuery que une a tabela de livros com os logs
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
    # Caminho completo das tabelas BigQuery no formato project.dataset.table
    books_table = _table("books")
    logs_table  = _table("reading_logs")

    # Query com LEFT JOIN: MAX(rl.page_end) calcula a página mais avançada registrada
    # para cada livro. LEFT JOIN garante que livros sem nenhum log também apareçam
    # (current_page = NULL nesses casos, tratado como 0 no frontend).
    # CAST(...AS INT64) é necessário porque MAX() sobre INT64 pode retornar NUMERIC no BigQuery.
    # WHERE b.deleted = FALSE exclui livros removidos logicamente (soft delete).
    # ORDER BY CASE: ordena por prioridade de status, depois por data de atualização mais recente.
    # IMPORTANTE: b.updated_at deve estar no SELECT e no GROUP BY para poder ser usado no ORDER BY —
    # BigQuery Standard SQL não permite referenciar colunas não agrupadas no ORDER BY de queries com GROUP BY.
    sql = f"""
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
            CAST(MAX(rl.page_end) AS INT64) AS current_page
        FROM `{books_table}` b
        LEFT JOIN `{logs_table}` rl ON rl.book_id = b.id
        WHERE b.deleted = FALSE
        GROUP BY b.id, b.title, b.author, b.total_pages, b.status,
                 b.cover_url, b.date_started, b.date_finished, b.rating,
                 b.genre, b.isbn, b.published_year, b.updated_at
        ORDER BY
            CASE b.status
                WHEN 'lendo'     THEN 0
                WHEN 'quero_ler' THEN 1
                WHEN 'pausado'   THEN 2
                WHEN 'lido'      THEN 3
                WHEN 'abandonado' THEN 4
                ELSE 5
            END,
            b.updated_at DESC
    """

    # Executa a query sem parâmetros de usuário (sem risco de SQL injection aqui)
    rows = _run_select(sql, [])

    # Converte tipos não-serializáveis (date, datetime) para string em cada linha
    books = [_serialize_book(dict(row)) for row in rows]

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

    # Caminhos completos das tabelas BigQuery
    books_table = _table("books")
    logs_table  = _table("reading_logs")

    # ── Query 1: Livros concluídos e avaliação média ───────────────────────────
    # Conta livros com status='lido' cujo date_finished caiu no ano especificado.
    # AVG(rating) retorna None se nenhum livro tiver avaliação — tratado abaixo.
    sql_books = f"""
        SELECT COUNT(*) AS books_finished, AVG(rating) AS avg_rating
        FROM `{books_table}`
        WHERE status = 'lido'
          AND EXTRACT(YEAR FROM date_finished) = @year
          AND deleted = FALSE
    """
    rows_books = _run_select(sql_books, [
        bigquery.ScalarQueryParameter("year", "INT64", year),
    ])

    # ── Query 2: Total de páginas e sessões de leitura no ano ─────────────────
    # COALESCE(SUM(pages_read), 0) garante 0 se não houver nenhum log no ano.
    sql_logs = f"""
        SELECT COALESCE(SUM(pages_read), 0) AS total_pages,
               COUNT(*) AS total_sessions
        FROM `{logs_table}`
        WHERE EXTRACT(YEAR FROM date) = @year
    """
    rows_logs = _run_select(sql_logs, [
        bigquery.ScalarQueryParameter("year", "INT64", year),
    ])

    # ── Query 3: Ritmo diário — últimos 30 dias com leitura no ano ────────────
    # Agrega páginas por dia (GROUP BY date) e pega os 30 dias mais recentes.
    # Usamos "dias com leitura" em vez de dias corridos para não distorcer a média
    # com dias sem leitura. Ex.: quem lê 3x/semana tem ritmo real sem penalizar
    # os dias de descanso.
    sql_pace = f"""
        SELECT date, SUM(pages_read) AS daily_pages
        FROM `{logs_table}`
        WHERE EXTRACT(YEAR FROM date) = @year
        GROUP BY date
        ORDER BY date DESC
        LIMIT 30
    """
    rows_pace = _run_select(sql_pace, [
        bigquery.ScalarQueryParameter("year", "INT64", year),
    ])

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

    # Busca a página atual: último page_end registrado nos logs, ordenado por data
    # e created_at para desempatar múltiplos logs no mesmo dia
    sql_current = f"""
        SELECT page_end
        FROM `{_table("reading_logs")}`
        WHERE book_id = @book_id
        ORDER BY date DESC, created_at DESC
        LIMIT 1
    """
    last_logs = _run_select(sql_current, [
        bigquery.ScalarQueryParameter("book_id", "STRING", book_id),
    ])

    # Se não há nenhum log ou page_end for NULL, current_page = 0
    raw_page = last_logs[0]["page_end"] if last_logs else None
    current_page = int(raw_page) if raw_page is not None else 0

    # Serializa o livro (converte date/datetime para string) e adiciona current_page
    serialized = _serialize_book(dict(book))
    serialized["current_page"] = current_page

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
    # Query com filtro por book_id e ordenação cronológica crescente.
    # created_at como segundo critério de ordenação para desempatar sessões no mesmo dia.
    sql = f"""
        SELECT date, page_start, page_end, pages_read, session_notes
        FROM `{_table("reading_logs")}`
        WHERE book_id = @book_id
        ORDER BY date ASC, created_at ASC
    """
    logs = _run_select(sql, [
        bigquery.ScalarQueryParameter("book_id", "STRING", book_id),
    ])

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
