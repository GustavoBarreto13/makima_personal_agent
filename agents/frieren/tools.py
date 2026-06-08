"""
Tools do agente Frieren — rastreamento de leitura pessoal.
PostgreSQL para persistência + Google Books API para metadados.
"""

import os           # Para ler variáveis de ambiente (credenciais, chaves de API)
import uuid         # Para gerar IDs únicos universais (UUID v4) para cada livro
import unicodedata  # Para remover acentos na normalização de strings (busca fuzzy)
from datetime import datetime, date  # Tipos de data/hora usados no sistema
from zoneinfo import ZoneInfo                  # Para trabalhar com fuso horário (Brasil)

import re                           # Para remover pontuação na normalização de strings (busca fuzzy)
import requests                    # Cliente HTTP para chamar a Google Books API

# Importa os helpers PostgreSQL compartilhados — substituem o BigQuery _run_select/_run_dml
from agents.db import run_select, run_dml


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTES GLOBAIS
# ─────────────────────────────────────────────────────────────────────────────

# Status válidos para um livro no sistema de rastreamento.
# Qualquer valor fora dessa lista deve ser rejeitado para manter consistência.
VALID_STATUSES = ["lendo", "lido", "quero_ler", "estante", "wishlist", "pausado", "abandonado"]

# Fuso horário do usuário (Brasil — UTC-3).
# Usado para garantir que todas as datas sejam registradas no horário brasileiro,
# e não no UTC do servidor (que roda no VPS em outro fuso).
_TZ = ZoneInfo("America/Sao_Paulo")

# Endpoint público da Google Books API.
# Não exige autenticação para buscas básicas — a chave de API aumenta o limite
# de requisições, mas é opcional para uso pessoal em baixo volume.
_BOOKS_API_URL = "https://www.googleapis.com/books/v1/volumes"


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS PRIVADOS — infraestrutura (não chamados diretamente pelo agente)
# ─────────────────────────────────────────────────────────────────────────────

def _now() -> datetime:
    """Retorna o datetime atual no fuso horário de São Paulo.

    Usado para preencher campos de timestamp (created_at, updated_at)
    no horário local do usuário, não em UTC.
    """
    return datetime.now(_TZ)


def _today() -> date:
    """Retorna a data de hoje no fuso horário de São Paulo.

    Extraída de _now() para garantir consistência de fuso — usar
    date.today() retornaria a data do servidor (UTC), que pode diferir
    do dia correto no Brasil próximo à meia-noite.
    """
    return _now().date()


def _norm(s: str) -> str:
    """Normaliza uma string para busca fuzzy: minúsculas, sem acentos, sem pontuação, sem espaços extras.

    Usa decomposição NFD (Normalization Form Decomposition) para separar os
    caracteres base dos diacríticos (acentos). Por exemplo, "ã" é decomposto
    em "a" + til combinante (categoria Unicode "Mn"). Em seguida, filtramos
    apenas os caracteres que NÃO são marcas combinantes (Mn), descartando
    os acentos e ficando só com as letras base.

    Também remove pontuação comum (vírgulas, dois-pontos, etc.) para tolerar
    variações de título. Ex.: "Belo mundo, onde" e "Belo mundo onde" são iguais.

    Isso permite que "Duna", "duna" e "Düna" sejam tratados como iguais numa busca.
    """
    # strip() remove espaços nas bordas; lower() deixa tudo minúsculo
    s = s.strip().lower()

    # NFD decompõe caracteres acentuados em letra base + acento separado
    nfd = unicodedata.normalize("NFD", s)

    # Mantém apenas caracteres que NÃO são marcas combinantes (acentos, cedilhas, etc.)
    # unicodedata.category(c) == "Mn" identifica uma "Mark, Nonspacing" (acento solto)
    s = "".join(c for c in nfd if unicodedata.category(c) != "Mn")

    # Substitui pontuação comum por espaço para que "mundo, onde" == "mundo onde"
    s = re.sub(r'[,.;:!?]', ' ', s)

    # Colapsa múltiplos espaços consecutivos em um único espaço
    s = re.sub(r'  +', ' ', s).strip()

    return s


def _norm_sql_col(col: str) -> str:
    """Retorna uma expressão SQL PostgreSQL que normaliza uma coluna de texto
    da mesma forma que _norm() faz no Python.

    Permite comparar títulos armazenados no banco (com acentos e pontuação,
    vindos da Google Books API) contra queries do usuário (sem acentos, sem
    pontuação) usando ILIKE — sem necessidade de coluna extra no schema.

    Exemplo: título armazenado "Belo mundo, onde você está" é normalizado para
    "belo mundo onde voce esta", que casa com a query "belo mundo onde voce esta".
    """
    # Passo 1: converte para minúsculas
    expr = f"LOWER({col})"

    # Passo 2: substitui letras acentuadas pela letra base equivalente
    # — mesma lógica do _norm() Python via NFD, mas implementada com REGEXP_REPLACE
    # A flag 'g' no PostgreSQL equivale ao comportamento global do BigQuery
    for padrao, repl in [
        ("[àáâãä]", "a"),
        ("[èéêë]",  "e"),
        ("[ìíîï]",  "i"),
        ("[òóôõö]", "o"),
        ("[ùúûü]",  "u"),
        ("ç",       "c"),
    ]:
        # PostgreSQL REGEXP_REPLACE exige a flag 'g' para substituição global
        expr = f"REGEXP_REPLACE({expr}, '{padrao}', '{repl}', 'g')"

    # Passo 3: remove pontuação comum (substitui por espaço para não juntar palavras)
    expr = f"REGEXP_REPLACE({expr}, '[,.;:!?]', ' ', 'g')"

    # Passo 4: colapsa múltiplos espaços e remove espaços nas bordas
    expr = f"TRIM(REGEXP_REPLACE({expr}, '  +', ' ', 'g'))"

    return expr


def _is_isbn(query: str) -> bool:
    """Verifica se uma string parece ser um ISBN (10 ou 13 dígitos, com ou sem hífens).

    Remove hífens e espaços antes de verificar — ISBNs podem ser formatados como
    "978-85-359-3200-3" ou "9788535932003"; ambos são válidos.

    Retorna True apenas para 10 ou 13 dígitos — comprimentos exatos dos formatos de ISBN.
    """
    # Remove os separadores comuns no formato de ISBN antes de contar dígitos
    digits_only = query.replace("-", "").replace(" ", "")

    # ISBN-10 tem exatamente 10 dígitos; ISBN-13 tem exatamente 13 dígitos
    return digits_only.isdigit() and len(digits_only) in (10, 13)


def _find_book_by_query(query: str) -> dict | None:
    """Busca um livro na tabela books por título, autor ou ISBN.

    Prioriza livros com status 'lendo' no topo dos resultados — quando o usuário
    diz "atualize meu livro atual", é quase sempre o que está lendo agora.
    Retorna o primeiro resultado 'lendo' se existir, caso contrário o mais recente.

    Se a query parecer um ISBN (10 ou 13 dígitos), tenta primeiro a correspondência
    exata por ISBN antes de fazer a busca fuzzy por título/autor.

    Parâmetros:
        query — Texto de busca (título parcial, nome do autor, ou ISBN)

    Retorna:
        Dicionário com os dados do livro encontrado, ou None se não encontrar nada.
    """
    # Remove hífens e espaços para comparação de ISBN (ex.: "978-85-..." → "9788535...")
    isbn_clean = query.replace("-", "").replace(" ", "")

    # ── Busca por ISBN exato (se a query parece um ISBN) ──────────────────────
    if _is_isbn(query):
        sql_isbn = """
            SELECT *
            FROM books
            WHERE isbn = %(isbn)s AND deleted = FALSE
            ORDER BY
                CASE WHEN status = 'lendo' THEN 0 ELSE 1 END ASC,
                updated_at DESC
            LIMIT 1
        """
        isbn_rows = run_select(sql_isbn, {"isbn": isbn_clean})
        if isbn_rows:
            return isbn_rows[0]

    # ── Busca fuzzy por título ou autor ───────────────────────────────────────
    # Normaliza a query para busca case-insensitive sem acentos
    norm_query = _norm(query)

    # Padrão LIKE com % nas duas pontas para correspondência parcial
    like_pattern = f"%{norm_query}%"

    # Busca por título OU autor usando _norm_sql_col() para normalizar o texto armazenado
    # ORDER BY: status 'lendo' primeiro (CASE retorna 0), depois por data de atualização.
    sql = f"""
        SELECT *
        FROM books
        WHERE (
            {_norm_sql_col("title")} LIKE %(query)s
            OR {_norm_sql_col("author")} LIKE %(query)s
            OR isbn LIKE %(isbn_like)s
        )
        AND deleted = FALSE
        ORDER BY
            CASE WHEN status = 'lendo' THEN 0 ELSE 1 END ASC,
            updated_at DESC
        LIMIT 5
    """

    params = {
        "query":     like_pattern,
        # isbn_like usa o valor sem hífens para normalizar a comparação
        "isbn_like": f"%{isbn_clean}%",
    }

    rows = run_select(sql, params)

    if not rows:
        # ── Fallback: tenta cada segmento separado por ": " ──────────────────
        # O agente às vezes usa o título completo com subtítulo (ex.: "Stardust: O mistério
        # da estrela"), que não casa com o título curto armazenado no banco ("Stardust").
        segmentos = [s.strip() for s in query.split(":") if s.strip()]
        if len(segmentos) > 1:
            for segmento in segmentos:
                resultado = _find_book_by_query(segmento)
                if resultado:
                    return resultado
        # Nenhum livro encontrado nem pelos segmentos
        return None

    # Se o primeiro resultado já é 'lendo', retorna ele diretamente
    for row in rows:
        if row.get("status") == "lendo":
            return row

    # Sem nenhum 'lendo', retorna o primeiro resultado (mais recentemente atualizado)
    return rows[0]


def _fetch_google_books(query: str, max_results: int = 5) -> list[dict]:
    """Busca metadados de livros na Google Books API.

    Sem restrição de idioma — busca em qualquer língua para não perder livros
    japoneses, ingleses ou de outras origens que o usuário leia.

    Parâmetros:
        query       — Termo de busca (título, autor, ISBN, etc.)
        max_results — Número máximo de resultados (padrão: 5, máximo da API: 40)

    Retorna:
        Lista de dicionários com os metadados extraídos, ou [] em caso de erro.
    """
    # Monta os parâmetros da requisição HTTP para a Google Books API
    request_params = {
        "q": query,                    # Termo de busca
        "maxResults": max_results,     # Limita a quantidade de resultados
        "printType": "books",          # Filtra apenas livros (exclui revistas/periódicos)
        "langRestrict": "pt",          # Restringe resultados ao idioma português
    }

    # Adiciona a chave de API se disponível — aumenta o limite de requisições diárias
    api_key = os.environ.get("GOOGLE_BOOKS_API_KEY", "")
    if api_key:
        request_params["key"] = api_key

    import logging as _logging
    _log = _logging.getLogger(__name__)
    _log.info(f"[books_api] GET {_BOOKS_API_URL} params={request_params}")

    try:
        # Faz a requisição GET para a API com timeout de 10 segundos
        response = requests.get(_BOOKS_API_URL, params=request_params, timeout=10)
        _log.info(f"[books_api] status={response.status_code} body={response.text[:500]!r}")
        response.raise_for_status()  # Lança exceção se o status HTTP for erro (4xx/5xx)
        data = response.json()
    except requests.RequestException as e:
        # Qualquer erro de rede ou HTTP — retorna lista vazia sem quebrar o agente
        _log.warning(f"[books_api] erro na requisição: {e}")
        return []

    # 'items' pode estar ausente se a API não encontrou nenhum resultado
    items = data.get("items", [])
    _log.info(f"[books_api] {len(items)} item(s) retornados para query={query!r}")

    # Lista que acumula os dicionários de metadados extraídos de cada item
    results = []

    for item in items:
        # Cada item tem um 'id' único na Google Books e um objeto 'volumeInfo' com metadados
        volume_id = item.get("id", "")
        info = item.get("volumeInfo", {})

        # Título do livro — fallback para string vazia se ausente
        title = info.get("title", "")

        # Autores podem ser uma lista; juntamos com vírgula para um único campo de texto
        authors = info.get("authors", [])
        author = ", ".join(authors) if authors else ""

        # Número total de páginas — None se não informado pela Google Books
        total_pages = info.get("pageCount", None)

        # ISBN: preferimos o ISBN-13 (mais moderno e universal) ao ISBN-10 (legado)
        isbn = None
        for identifier in info.get("industryIdentifiers", []):
            if identifier.get("type") == "ISBN_13":
                isbn = identifier.get("identifier")
                break
            elif identifier.get("type") == "ISBN_10" and isbn is None:
                isbn = identifier.get("identifier")

        # URLs de capa: preferimos 'thumbnail' (maior) sobre 'smallThumbnail' (menor)
        image_links = info.get("imageLinks", {})
        cover_url = image_links.get("thumbnail") or image_links.get("smallThumbnail")

        # Descrição truncada em 500 caracteres para não ocupar espaço excessivo no banco
        description_full = info.get("description", "")
        description = description_full[:500] if description_full else ""

        # Categorias/gêneros podem ser uma lista; juntamos com vírgula
        categories = info.get("categories", [])
        genre = ", ".join(categories) if categories else ""

        # Idioma do livro (ex.: "pt", "en")
        language = info.get("language", "")

        # Ano de publicação: extraímos apenas os 4 primeiros caracteres da data
        published_date = info.get("publishedDate", "")
        published_year = None
        if published_date and len(published_date) >= 4:
            try:
                published_year = int(published_date[:4])
            except ValueError:
                published_year = None

        # Monta o dicionário com todos os metadados extraídos deste volume
        results.append({
            "google_books_id": volume_id,
            "title": title,
            "author": author,
            "total_pages": total_pages,
            "isbn": isbn,
            "cover_url": cover_url,
            "description": description,
            "genre": genre,
            "language": language,
            "published_year": published_year,
        })

    return results


# ─────────────────────────────────────────────────────────────────────────────
# FERRAMENTAS PÚBLICAS — chamadas diretamente pelo agente Frieren
# ─────────────────────────────────────────────────────────────────────────────

def search_book(query: str, publisher: str | None = None) -> str:
    """
    Busca livros na Google Books API pelo título, autor ou ISBN.
    Use antes de add_book para confirmar o google_books_id do livro correto.

    Nota: para localizar um livro JÁ CADASTRADO no catálogo pelo ISBN, use as
    ferramentas que aceitam book_query (log_reading, finish_book, etc.) passando
    o ISBN diretamente — _find_book_by_query detecta ISBNs automaticamente.

    Args:
        query:     título, autor, ISBN ou qualquer termo de busca
        publisher: editora do livro (opcional) — filtra usando inpublisher: para
                   resultados mais precisos quando há múltiplas edições
    """
    # Monta a query final: se a editora for informada, usa o filtro estruturado
    full_query = f"{query} inpublisher:{publisher}" if publisher else query

    # Chama o helper privado para buscar até 5 resultados na Google Books API
    results = _fetch_google_books(full_query, max_results=5)

    # Se a API não retornou nada, orienta o usuário sobre como adicionar manualmente
    if not results:
        return (
            "Nenhum livro encontrado para esse termo. "
            "Você pode adicionar manualmente informando título, autor e número de páginas."
        )

    # Monta uma lista HTML numerada com os dados de cada livro encontrado
    linhas = []
    for i, livro in enumerate(results, start=1):
        # Formata o ano de publicação — mostra apenas se disponível
        ano = f" ({livro['published_year']})" if livro.get("published_year") else ""

        # Formata o número de páginas — mostra apenas se disponível
        paginas = f" — {livro['total_pages']} páginas" if livro.get("total_pages") else ""

        # Autor: usa o valor extraído ou indica que não foi informado
        autor = livro["author"] if livro.get("author") else "autor desconhecido"

        # Monta o bloco de texto deste resultado com as três linhas de informação
        bloco = (
            f"{i}. <b>{livro['title']}</b>{ano}\n"          # Linha 1: título e ano
            f"   {autor}{paginas}\n"                          # Linha 2: autor e páginas
            f"   ID Google Books: <code>{livro['google_books_id']}</code>"  # Linha 3: ID
        )
        linhas.append(bloco)

    # Une todos os blocos separados por linha em branco para facilitar a leitura
    return "\n\n".join(linhas)


def add_book(
    title: str,
    status: str = "quero_ler",
    google_books_id: str | None = None,
    author: str | None = None,
    total_pages: int | None = None,
) -> str:
    """
    Adiciona um livro ao catálogo. Enriquece metadados via Google Books API automaticamente.
    Se google_books_id for fornecido, busca aquele volume específico.
    """
    # ── 1. Valida o status informado ──────────────────────────────────────────
    if status not in VALID_STATUSES:
        return (
            f"Status inválido: <b>{status}</b>. "
            f"Use um dos seguintes: {', '.join(VALID_STATUSES)}."
        )

    # ── 2. Verifica duplicatas no catálogo ────────────────────────────────────
    existente = _find_book_by_query(title)
    if existente and _norm(existente["title"]) == _norm(title):
        return (
            f"<b>{existente['title']}</b> já está no catálogo "
            f"com status <b>{existente['status']}</b>."
        )

    # ── 3. Obtém metadados do livro ───────────────────────────────────────────
    meta: dict = {}

    if google_books_id:
        # Se o usuário informou um ID específico, busca diretamente aquele volume
        try:
            resp = requests.get(
                f"{_BOOKS_API_URL}/{google_books_id}",
                timeout=10,
            )
            resp.raise_for_status()
            item = resp.json()
            info = item.get("volumeInfo", {})

            authors_list = info.get("authors", [])
            categories = info.get("categories", [])
            image_links = info.get("imageLinks", {})
            description_full = info.get("description", "")
            published_date = info.get("publishedDate", "")

            pub_year = None
            if published_date and len(published_date) >= 4:
                try:
                    pub_year = int(published_date[:4])
                except ValueError:
                    pub_year = None

            isbn_val = None
            for identifier in info.get("industryIdentifiers", []):
                if identifier.get("type") == "ISBN_13":
                    isbn_val = identifier.get("identifier")
                    break
                elif identifier.get("type") == "ISBN_10" and isbn_val is None:
                    isbn_val = identifier.get("identifier")

            meta = {
                "google_books_id": google_books_id,
                "title": info.get("title", title),
                "author": ", ".join(authors_list) if authors_list else "",
                "total_pages": info.get("pageCount"),
                "isbn": isbn_val,
                "cover_url": image_links.get("thumbnail") or image_links.get("smallThumbnail"),
                "description": description_full[:500] if description_full else "",
                "genre": ", ".join(categories) if categories else "",
                "language": info.get("language", ""),
                "published_year": pub_year,
            }
        except requests.RequestException:
            meta = {}

    # Se ainda não temos metadados, tenta busca textual
    if not meta:
        resultados = _fetch_google_books(title, max_results=1)
        if resultados:
            meta = resultados[0]

    # Se mesmo a busca textual não retornou nada, monta um dict manual
    if not meta:
        meta = {
            "google_books_id": None,
            "title": title,
            "author": author or "",
            "total_pages": total_pages,
            "isbn": None,
            "cover_url": None,
            "description": "",
            "genre": "",
            "language": "",
            "published_year": None,
        }

    # ── 4. Sobrescreve campos se o usuário forneceu manualmente ───────────────
    # A edição física do usuário pode ter número de páginas diferente do cadastrado na API
    if total_pages is not None:
        meta["total_pages"] = total_pages

    # O autor fornecido manualmente tem precedência sobre o retornado pela API
    if author is not None:
        meta["author"] = author

    # ── 5. Gera ID único para o livro ─────────────────────────────────────────
    book_id = str(uuid.uuid4())

    # ── 6. Define data de início de leitura ───────────────────────────────────
    # Só registra date_started se o livro já está sendo lido
    date_started = str(_today()) if status == "lendo" else None

    # ── 7. Insere o livro na tabela books do PostgreSQL ───────────────────────
    # Usa parâmetros nomeados %(placeholder)s para todos os valores variáveis.
    agora = _now()

    sql = """
        INSERT INTO books (
            id, google_books_id, title, author, total_pages,
            isbn, cover_url, description, genre, language, published_year,
            status, date_started, date_finished, rating, notes,
            source, created_at, updated_at, deleted
        ) VALUES (
            %(id)s, %(google_books_id)s, %(title)s, %(author)s, %(total_pages)s,
            %(isbn)s, %(cover_url)s, %(description)s, %(genre)s, %(language)s, %(published_year)s,
            %(status)s, %(date_started)s, NULL, NULL, NULL,
            %(source)s, %(created_at)s, %(updated_at)s, FALSE
        )
    """

    params = {
        "id":              book_id,
        "google_books_id": meta.get("google_books_id"),
        "title":           meta.get("title", title),
        "author":          meta.get("author") or None,
        "total_pages":     meta.get("total_pages"),
        "isbn":            meta.get("isbn"),
        "cover_url":       meta.get("cover_url"),
        "description":     meta.get("description") or None,
        "genre":           meta.get("genre") or None,
        "language":        meta.get("language") or None,
        "published_year":  meta.get("published_year"),
        "status":          status,
        "date_started":    date_started,
        "source":          "telegram",
        "created_at":      agora,
        "updated_at":      agora,
    }

    # Executa o INSERT — run_dml aguarda a conclusão
    run_dml(sql, params)

    # ── 8. Monta a mensagem de confirmação ────────────────────────────────────
    titulo_final = meta.get("title", title)
    autor_final  = meta.get("author") or "autor desconhecido"
    paginas_txt  = f" ({meta.get('total_pages')} páginas)" if meta.get("total_pages") else ""

    return (
        f"<b>{titulo_final}</b> de {autor_final}{paginas_txt} "
        f"adicionado ao catálogo com status <b>{status}</b>."
    )


def _get_last_logged_book() -> dict | None:
    """
    Retorna o livro com o log de leitura mais recente (por date DESC, created_at DESC).
    Usado como fallback quando o usuário não especifica qual livro está logando.
    Retorna None se não houver nenhum log ainda.
    """
    # Junta reading_logs com books para obter todos os campos do livro
    sql = """
        SELECT b.id, b.title, b.author, b.total_pages, b.status,
               b.date_started, b.date_finished
        FROM reading_logs rl
        JOIN books b ON b.id = rl.book_id
        ORDER BY rl.date DESC, rl.created_at DESC
        LIMIT 1
    """
    rows = run_select(sql)
    return rows[0] if rows else None


def log_reading(
    book_query: str = "",
    current_page: int = 0,
    session_notes: str | None = None,
    log_date: str | None = None,
) -> str:
    """
    Registra o progresso de leitura de um livro.
    'Li o Duna até a página 80' → loga a sessão calculando delta desde o último registro.

    Parâmetros:
        book_query    — Título parcial ou completo do livro (ex: "Duna", "Harry Potter").
                        Se vazio ou omitido, usa automaticamente o livro com o log mais recente.
        current_page  — Página atual do leitor após a sessão de leitura
        session_notes — Anotações opcionais sobre a sessão (impressões, citações, etc.)
        log_date      — Data da leitura no formato YYYY-MM-DD (padrão: hoje)
    """

    # ── 1. Localiza o livro pelo termo de busca ───────────────────────────────
    if book_query.strip():
        # Busca fuzzy pelo título informado pelo usuário
        book = _find_book_by_query(book_query)
        if book is None:
            return (
                f"Nenhum livro encontrado para '<b>{book_query}</b>'. "
                "Adicione o livro ao catálogo primeiro com o comando de adicionar livro."
            )
    else:
        # Sem título informado — usa o livro com o registro de leitura mais recente
        book = _get_last_logged_book()
        if book is None:
            return (
                "Nenhum log de leitura anterior encontrado. "
                "Informe o título do livro para registrar o progresso."
            )

    # ── 2. Valida que a página informada é um número não-negativo ─────────────
    if current_page < 0:
        return "O número de página não pode ser negativo."

    # ── 3. Valida que a página não ultrapassa o total do livro ────────────────
    total_pages = book.get("total_pages")
    if total_pages and current_page > total_pages:
        return (
            f"A página <b>{current_page}</b> ultrapassa o total de páginas de "
            f"<b>{book['title']}</b> ({total_pages} páginas). "
            "Se você terminou o livro, use o comando de finalizar leitura."
        )

    # ── 4. Busca o último log de leitura para calcular o delta ────────────────
    book_id = book["id"]
    sql_last = """
        SELECT page_end
        FROM reading_logs
        WHERE book_id = %(book_id)s
        ORDER BY date DESC, created_at DESC
        LIMIT 1
    """
    last_params = {"book_id": book_id}
    last_logs = run_select(sql_last, last_params)

    # page_start = última página registrada, ou 0 se nunca houve nenhum log
    page_start = last_logs[0]["page_end"] if last_logs else 0

    # ── 5. Calcula as páginas lidas nesta sessão ──────────────────────────────
    pages_read = current_page - page_start

    # Detecta inconsistência: a página atual é MENOR que a última registrada
    if pages_read < 0:
        return (
            f"A página <b>{current_page}</b> é menor que a última registrada "
            f"(<b>{page_start}</b>) para <b>{book['title']}</b>. "
            "Verifique se informou a página correta."
        )

    # Nenhuma página nova foi lida — evita criar um log inútil no banco
    if pages_read == 0:
        return (
            f"<b>{book['title']}</b> já estava registrado na página <b>{page_start}</b>. "
            "Nenhum progresso novo para registrar."
        )

    # ── 6. Determina a data da sessão ─────────────────────────────────────────
    entry_date = log_date if log_date else str(_today())

    # ── 7. Gera ID único para este log ────────────────────────────────────────
    log_id = str(uuid.uuid4())

    # ── 8. Insere o registro na tabela reading_logs ───────────────────────────
    # book_title desnormalizado facilita consultas históricas sem JOIN
    agora = _now()
    sql_insert = """
        INSERT INTO reading_logs (
            id, book_id, book_title, date,
            page_start, page_end, pages_read,
            session_notes, created_at
        ) VALUES (
            %(id)s, %(book_id)s, %(book_title)s, %(date)s,
            %(page_start)s, %(page_end)s, %(pages_read)s,
            %(session_notes)s, %(created_at)s
        )
    """
    insert_params = {
        "id":            log_id,
        "book_id":       book_id,
        "book_title":    book["title"],
        "date":          entry_date,
        "page_start":    page_start,
        "page_end":      current_page,
        "pages_read":    pages_read,
        "session_notes": session_notes,
        "created_at":    agora,
    }
    run_dml(sql_insert, insert_params)

    # ── 9. Atualiza status do livro para 'lendo' se necessário ────────────────
    # Se o livro estava como 'quero_ler', 'pausado' ou outro status,
    # o ato de registrar progresso implica que a leitura foi (re)iniciada.
    # COALESCE(date_started, @today) preserva a data de início original se já existia.
    if book.get("status") != "lendo":
        today_str = str(_today())
        sql_update = """
            UPDATE books
            SET status = 'lendo',
                date_started = COALESCE(date_started, %(today)s),
                updated_at = %(now)s
            WHERE id = %(book_id)s
        """
        update_params = {
            "today":   today_str,
            "now":     agora,
            "book_id": book_id,
        }
        run_dml(sql_update, update_params)

    # ── 10. Monta a mensagem de confirmação com o progresso ───────────────────
    titulo = book["title"]

    if total_pages:
        percent = round((current_page / total_pages) * 100, 1)
        remaining = total_pages - current_page

        return (
            f"<b>{titulo}</b> — <b>{percent}%</b> concluído "
            f"({current_page}/{total_pages} páginas, {remaining} restantes)\n"
            f"📖 {pages_read} páginas lidas nesta sessão."
        )
    else:
        return (
            f"<b>{titulo}</b> — página <b>{current_page}</b>\n"
            f"📖 {pages_read} páginas lidas nesta sessão."
        )


def get_current_reading() -> str:
    """
    Retorna todos os livros com status 'lendo', com o progresso atual
    baseado no último log de leitura registrado.

    Usa LEFT JOIN para trazer o progresso mesmo quando não há nenhum log ainda
    (ex.: livro adicionado como 'lendo' mas sem log de páginas).
    """
    # Query única com LEFT JOIN — MAX(rl.page_end) dá a página mais avançada lida
    sql = """
        SELECT
            b.id,
            b.title,
            b.author,
            b.total_pages,
            b.date_started,
            MAX(rl.page_end)  AS current_page,
            COUNT(rl.id)      AS total_sessions
        FROM books b
        LEFT JOIN reading_logs rl ON rl.book_id = b.id
        WHERE b.status = 'lendo' AND b.deleted = FALSE
        GROUP BY b.id, b.title, b.author, b.total_pages, b.date_started
        ORDER BY b.updated_at DESC
    """

    rows = run_select(sql)

    # Caso não haja nenhum livro em leitura no momento
    if not rows:
        return "Nenhum livro em leitura no momento."

    # Constrói a mensagem formatada para cada livro encontrado
    linhas = []
    for row in rows:
        titulo       = row["title"]
        autor        = row.get("author") or "autor desconhecido"
        total_pages  = row.get("total_pages")
        current_page = row.get("current_page")
        date_started = row.get("date_started")

        # Formata a data de início como string legível, ou omite se ausente
        inicio_txt = f" · começou em {date_started}" if date_started else ""

        if total_pages and current_page is not None:
            percent = round((current_page / total_pages) * 100, 1)
            progresso_txt = f"{percent}% ({current_page}/{total_pages} páginas)"
        elif current_page is not None:
            progresso_txt = f"página {current_page}"
        else:
            progresso_txt = "não iniciado"

        bloco = (
            f"📖 <b>{titulo}</b>\n"
            f"   {autor} · {progresso_txt}{inicio_txt}"
        )
        linhas.append(bloco)

    return "\n\n".join(linhas)


def get_reading_list(status: str | None = None) -> str:
    """
    Lista todos os livros do catálogo, opcionalmente filtrados por status.
    Agrupa os resultados por status com cabeçalhos visuais com emoji.

    Parâmetros:
        status — Filtra por um status específico (ex.: 'lendo', 'lido').
                 Se None, retorna todos os livros agrupados por status.
    """
    # Mapeamento de status para emoji de cabeçalho
    STATUS_EMOJI = {
        "lendo":      "📖",
        "lido":       "✅",
        "quero_ler":  "📚",
        "pausado":    "⏸️",
        "abandonado": "❌",
    }

    # Monta a query base — WHERE deleted=FALSE exclui livros removidos logicamente
    sql = """
        SELECT title, author, total_pages, status, date_started, date_finished, rating
        FROM books
        WHERE deleted = FALSE
    """
    params = None

    if status is not None:
        # Filtra por status específico se informado pelo usuário
        sql += " AND status = %(status)s"
        params = {"status": status}

    # Ordena por status primeiro (agrupamento), depois por data de atualização mais recente
    sql += " ORDER BY status, updated_at DESC"

    rows = run_select(sql, params)

    # Lista vazia: nenhum livro cadastrado ou nenhum com o status solicitado
    if not rows:
        if status:
            return f"Nenhum livro com status <b>{status}</b> encontrado."
        return "Nenhum livro no catálogo ainda."

    # Agrupa as linhas por status usando um dicionário ordenado
    grupos: dict[str, list[dict]] = {}
    for row in rows:
        s = row["status"]
        if s not in grupos:
            grupos[s] = []
        grupos[s].append(row)

    # Constrói o texto de saída agrupado por status
    secoes = []
    for s, livros in grupos.items():
        # Cabeçalho da seção: emoji + nome do status em negrito
        emoji = STATUS_EMOJI.get(s, "📗")
        cabecalho = f"{emoji} <b>{s.upper()}</b>"

        itens = []
        for livro in livros:
            titulo = livro["title"]
            paginas_txt = f" ({livro['total_pages']}p.)" if livro.get("total_pages") else ""
            rating_txt = f" · ⭐ {livro['rating']}" if livro.get("rating") is not None else ""
            itens.append(f"• {titulo}{paginas_txt}{rating_txt}")

        secoes.append(cabecalho + "\n" + "\n".join(itens))

    return "\n\n".join(secoes)


def finish_book(
    book_query: str,
    rating: float | None = None,
    notes: str | None = None,
    date_finished: str | None = None,
    date_started: str | None = None,
) -> str:
    """
    Marca um livro como lido, registra as datas e opcionalmente salva avaliação e notas.
    Aceita datas retroativas — útil quando o usuário já terminou o livro mas registra depois.

    Parâmetros:
        book_query    — Título parcial ou completo do livro a concluir
        rating        — Nota de 1.0 a 5.0 (opcional)
        notes         — Anotações finais sobre o livro (opcional)
        date_finished — Data de conclusão no formato YYYY-MM-DD (padrão: hoje)
        date_started  — Data de início no formato YYYY-MM-DD (opcional — sobrescreve se informado)
    """
    # ── 1. Localiza o livro no catálogo ───────────────────────────────────────
    book = _find_book_by_query(book_query)
    if book is None:
        return (
            f"Nenhum livro encontrado para '<b>{book_query}</b>'. "
            "Verifique o título e tente novamente."
        )

    # ── 2. Valida a avaliação se fornecida ────────────────────────────────────
    if rating is not None and not (1.0 <= rating <= 5.0):
        return "A avaliação deve ser um valor entre <b>1.0</b> e <b>5.0</b>."

    # ── 3. Calcula o total de páginas lidas nos logs ───────────────────────────
    book_id = book["id"]
    sql_sum = """
        SELECT COALESCE(SUM(pages_read), 0) AS total_pages_read
        FROM reading_logs
        WHERE book_id = %(book_id)s
    """
    sum_params = {"book_id": book_id}
    sum_rows = run_select(sql_sum, sum_params)

    # COALESCE garante que retorne 0 mesmo se não houver nenhum log
    total_pages_read = sum_rows[0]["total_pages_read"] if sum_rows else 0

    # ── 4. Atualiza o registro do livro no PostgreSQL ─────────────────────────
    finished_str = date_finished if date_finished else str(_today())
    agora        = _now()

    # Monta SET dinâmico: date_started só é atualizado se o usuário informou
    # (COALESCE preservaria o valor existente, mas se o usuário quer sobrescrever
    # uma data errada, precisamos de SET condicional via parâmetro)
    set_date_started = (
        "date_started = %(date_started)s,"
        if date_started
        else "date_started = COALESCE(date_started, %(date_started)s),"
    )

    # COALESCE(%(notes)s, notes) preserva as anotações já existentes se não informadas
    sql_update = f"""
        UPDATE books
        SET
            status        = 'lido',
            date_finished = %(date_finished)s,
            {set_date_started}
            rating        = %(rating)s,
            notes         = COALESCE(%(notes)s, notes),
            updated_at    = %(updated_at)s
        WHERE id = %(book_id)s
    """
    update_params = {
        "date_finished": finished_str,
        "date_started":  date_started,
        "rating":        rating,
        "notes":         notes,
        "updated_at":    agora,
        "book_id":       book_id,
    }
    run_dml(sql_update, update_params)

    # ── 5. Monta a mensagem de confirmação ────────────────────────────────────
    titulo      = book["title"]
    rating_txt  = f" · ⭐ {rating}/5.0" if rating is not None else ""
    started_txt = f"\n   Início: {date_started}" if date_started else ""

    return (
        f"✅ <b>{titulo}</b> concluído em {finished_str}"
        f"{rating_txt} · {total_pages_read} páginas lidas no total."
        f"{started_txt}"
    )


def update_book_status(book_query: str, status: str) -> str:
    """
    Atualiza o status de um livro no catálogo.
    Se o novo status for 'lendo' e o livro ainda não tem date_started, registra hoje.

    Parâmetros:
        book_query — Título parcial ou completo do livro a atualizar
        status     — Novo status (deve ser um dos VALID_STATUSES)
    """
    # ── 1. Valida o status antes de qualquer acesso ao banco ──────────────────
    if status not in VALID_STATUSES:
        return (
            f"Status inválido: <b>{status}</b>. "
            f"Use um dos seguintes: {', '.join(VALID_STATUSES)}."
        )

    # ── 2. Localiza o livro no catálogo ───────────────────────────────────────
    book = _find_book_by_query(book_query)
    if book is None:
        return (
            f"Nenhum livro encontrado para '<b>{book_query}</b>'. "
            "Verifique o título e tente novamente."
        )

    # ── 3. Atualiza o status no PostgreSQL ──────────────────────────────────────
    today_str = str(_today())
    agora     = _now()

    # CASE WHEN: se o novo status é 'lendo' E date_started ainda é NULL,
    # registra hoje como data de início. Caso contrário, preserva o valor existente.
    sql = """
        UPDATE books
        SET
            status       = %(status)s,
            date_started = CASE
                               WHEN %(status)s = 'lendo' AND date_started IS NULL
                               THEN %(today)s::date
                               ELSE date_started
                           END,
            updated_at   = %(updated_at)s
        WHERE id = %(book_id)s
    """
    params = {
        "status":     status,
        "today":      today_str,
        "updated_at": agora,
        "book_id":    book["id"],
    }
    run_dml(sql, params)

    return f"<b>{book['title']}</b> → status atualizado para <b>{status}</b>."


def update_book_pages(book_query: str, total_pages: int) -> str:
    """
    Atualiza o total de páginas de um livro no catálogo.
    Útil quando a Google Books API retornou um número errado ou
    a edição física do usuário tem uma contagem diferente.

    Args:
        book_query: título ou trecho do título do livro
        total_pages: número correto de páginas da edição do usuário

    Returns:
        Confirmação com título e novo total de páginas.
    """
    # Valida que o número de páginas faz sentido
    if total_pages <= 0:
        return "Número de páginas inválido. Deve ser maior que zero."

    # Busca o livro no catálogo pelo título (fuzzy match)
    book = _find_book_by_query(book_query)
    if not book:
        return f"Não encontrei '{book_query}' no catálogo."

    now = _now()

    # Atualiza o total de páginas e o timestamp de atualização
    sql = """
        UPDATE books
        SET
            total_pages = %(total_pages)s,
            updated_at  = %(now)s
        WHERE id = %(book_id)s
    """
    run_dml(sql, {
        "total_pages": total_pages,
        "now":         now,
        "book_id":     book["id"],
    })

    # Calcula o progresso atualizado se houver logs de leitura
    last_log_sql = """
        SELECT page_end
        FROM reading_logs
        WHERE book_id = %(book_id)s
        ORDER BY date DESC, created_at DESC
        LIMIT 1
    """
    last_logs = run_select(last_log_sql, {"book_id": book["id"]})

    # Monta a resposta com o novo progresso percentual, se aplicável
    if last_logs and last_logs[0]["page_end"]:
        current = last_logs[0]["page_end"]
        percent = round((current / total_pages) * 100, 1)
        progress = f" · progresso recalculado: {percent}% ({current}/{total_pages} páginas)"
    else:
        progress = ""

    return (
        f"<b>{book['title']}</b> → total de páginas atualizado para "
        f"<b>{total_pages}</b>{progress}."
    )


def get_reading_stats(year: int | None = None) -> str:
    """
    Retorna estatísticas de leitura para um ano específico.
    Se year não for informado, usa o ano corrente.

    Métricas calculadas:
    - Livros concluídos no ano
    - Total de páginas lidas (pela soma dos logs)
    - Total de sessões de leitura
    - Ritmo médio de leitura (páginas/dia nos últimos 30 dias com leitura)
    - Avaliação média dos livros concluídos
    """
    # Usa o ano atual se não for informado pelo usuário
    if year is None:
        year = _today().year

    # ── Query 1: Livros concluídos e avaliação média no ano ───────────────────
    # EXTRACT(YEAR FROM ...) funciona igual no PostgreSQL e no BigQuery
    sql_books = """
        SELECT
            COUNT(*)     AS books_finished,
            AVG(rating)  AS avg_rating
        FROM books
        WHERE status = 'lido'
          AND EXTRACT(YEAR FROM date_finished) = %(year)s
          AND deleted = FALSE
    """
    rows_books = run_select(sql_books, {"year": year})

    # ── Query 2: Total de páginas e sessões de leitura no ano ────────────────
    sql_logs = """
        SELECT
            COALESCE(SUM(pages_read), 0) AS total_pages,
            COUNT(*)                     AS total_sessions
        FROM reading_logs
        WHERE EXTRACT(YEAR FROM date) = %(year)s
    """
    rows_logs = run_select(sql_logs, {"year": year})

    # ── Query 3: Ritmo de leitura — últimos 30 dias com leitura no ano ────────
    sql_pace = """
        SELECT
            date,
            SUM(pages_read) AS daily_pages
        FROM reading_logs
        WHERE EXTRACT(YEAR FROM date) = %(year)s
        GROUP BY date
        ORDER BY date DESC
        LIMIT 30
    """
    rows_pace = run_select(sql_pace, {"year": year})

    # ── Extrai os valores das queries ─────────────────────────────────────────
    books_finished = int(rows_books[0]["books_finished"]) if rows_books else 0
    avg_rating = rows_books[0]["avg_rating"] if rows_books else None
    total_pages = int(rows_logs[0]["total_pages"]) if rows_logs else 0
    total_sessions = int(rows_logs[0]["total_sessions"]) if rows_logs else 0

    avg_daily = None
    if rows_pace:
        soma_diaria = sum(r["daily_pages"] for r in rows_pace)
        avg_daily   = round(soma_diaria / len(rows_pace), 1)

    # ── Monta a mensagem de estatísticas ─────────────────────────────────────
    linhas = [f"<b>Estatísticas de leitura — {year}</b>\n"]

    linhas.append(f"📚 Livros concluídos: <b>{books_finished}</b>")

    if total_pages > 0:
        linhas.append(f"📄 Páginas lidas: <b>{total_pages:,}</b>")

    if total_sessions > 0:
        linhas.append(f"📖 Sessões de leitura: <b>{total_sessions}</b>")

    if avg_daily is not None:
        linhas.append(f"⚡ Ritmo médio: <b>{avg_daily} páginas/dia</b> (últimos 30 dias com leitura)")

    if avg_rating is not None:
        linhas.append(f"⭐ Avaliação média: <b>{avg_rating:.1f}/5.0</b>")

    return "\n".join(linhas)


def get_book_history(book_query: str) -> str:
    """
    Retorna o histórico completo de sessões de leitura de um livro específico.
    Mostra data, intervalo de páginas, páginas lidas e anotações de cada sessão.

    Parâmetros:
        book_query — Título parcial ou completo do livro
    """
    # ── 1. Localiza o livro no catálogo ───────────────────────────────────────
    book = _find_book_by_query(book_query)
    if book is None:
        return (
            f"Nenhum livro encontrado para '<b>{book_query}</b>'. "
            "Verifique o título e tente novamente."
        )

    # ── 2. Busca todas as sessões de leitura do livro ─────────────────────────
    book_id = book["id"]
    sql = """
        SELECT
            date,
            page_start,
            page_end,
            pages_read,
            session_notes
        FROM reading_logs
        WHERE book_id = %(book_id)s
        ORDER BY date ASC, created_at ASC
    """
    params = {"book_id": book_id}
    logs = run_select(sql, params)

    # ── 3. Trata o caso de nenhum log registrado ──────────────────────────────
    if not logs:
        return f"<b>{book['title']}</b> — nenhuma sessão de leitura registrada ainda."

    # ── 4. Calcula totais para o cabeçalho do histórico ───────────────────────
    total_sessoes = len(logs)
    total_paginas = sum(r["pages_read"] for r in logs)

    # ── 5. Monta o cabeçalho ──────────────────────────────────────────────────
    cabecalho = (
        f"<b>{book['title']}</b> — histórico de leitura\n\n"
        f"Total: {total_sessoes} sessões · {total_paginas} páginas\n"
    )

    # ── 6. Formata cada sessão como um item da lista ──────────────────────────
    itens = []
    for log in logs:
        data       = log["date"]
        page_start = log["page_start"]
        page_end   = log["page_end"]
        pages_read = log["pages_read"]
        notas      = log.get("session_notes")

        notas_txt = f" — {notas}" if notas else ""

        itens.append(
            f"• {data}: p.{page_start} → p.{page_end} ({pages_read} páginas){notas_txt}"
        )

    return cabecalho + "\n".join(itens)


# ─────────────────────────────────────────────────────────────────────────────
# MENU INTERATIVO — usadas pelo coordinator para montar botões inline Telegram
# ─────────────────────────────────────────────────────────────────────────────

def get_book_menu_data(book_query: str) -> str:
    """
    Retorna dados estruturados de um livro como JSON para o coordinator montar
    um menu interativo com botões inline no Telegram.
    Use quando o usuário quiser gerenciar, atualizar ou ver detalhes de um livro.

    Retorna APENAS o JSON — sem texto adicional. O coordinator detecta esse JSON
    e constrói os botões automaticamente.
    """
    import json as _json

    # Busca o livro no catálogo pelo título (fuzzy match)
    book = _find_book_by_query(book_query)
    if not book:
        return f"Não encontrei '{book_query}' no catálogo."

    # Busca a última página registrada nos logs de leitura
    sql_last = """
        SELECT page_end
        FROM reading_logs
        WHERE book_id = %(book_id)s
        ORDER BY date DESC, created_at DESC
        LIMIT 1
    """
    last_logs = run_select(sql_last, {"book_id": book["id"]})
    current_page = int(last_logs[0]["page_end"]) if last_logs else 0

    # Monta o dicionário com todos os dados necessários para o menu.
    # cover_url é incluído para que o coordinator possa enviar a capa do livro junto com o menu.
    data = {
        "type":          "book_menu",
        "book_id":       book["id"],
        "title":         book["title"],
        "author":        book.get("author") or "",
        "status":        book["status"],
        "rating":        book.get("rating"),
        "current_page":  current_page,
        "total_pages":   book.get("total_pages"),
        "date_started":  str(book["date_started"]) if book.get("date_started") else None,
        "date_finished": str(book["date_finished"]) if book.get("date_finished") else None,
        "cover_url":     book.get("cover_url"),
    }
    # ensure_ascii=False preserva caracteres UTF-8 (acentos, etc.)
    return _json.dumps(data, ensure_ascii=False)


def delete_book(book_id: str) -> str:
    """Apaga um livro do catálogo com soft delete (marca deleted=TRUE).

    Preserva o registro no banco para histórico — o livro some das listagens
    mas os dados ficam intactos para auditoria.

    Args:
        book_id: UUID do livro na tabela books.

    Returns:
        Mensagem de confirmação com o título do livro removido, ou erro se não encontrado.
    """
    # Busca o título antes de deletar para exibir na confirmação
    title_rows = run_select(
        "SELECT title FROM books WHERE id = %(book_id)s AND deleted = FALSE",
        {"book_id": book_id},
    )
    if not title_rows:
        return f"❌ Livro com ID '{book_id}' não encontrado ou já foi removido."

    titulo = title_rows[0]["title"]

    # Soft delete: marca deleted=TRUE e atualiza o timestamp
    run_dml(
        "UPDATE books SET deleted = TRUE, updated_at = %(now)s WHERE id = %(book_id)s",
        {"book_id": book_id, "now": _now()},
    )

    return f"🗑️ <b>{titulo}</b> removido do catálogo."


def delete_reading_log(log_id: str) -> str:
    """Remove permanentemente um registro de sessão de leitura pelo ID.

    Usado para corrigir logs errados (página errada, data errada, etc.).
    Diferente de livros, logs são apagados fisicamente pois não há motivo
    de auditoria para manter sessões incorretas.

    Args:
        log_id: UUID do log na tabela reading_logs.

    Returns:
        Mensagem de confirmação com data e páginas do log removido, ou erro se não encontrado.
    """
    # Busca detalhes do log antes de deletar para exibir na confirmação
    log_rows = run_select(
        "SELECT book_title, date, pages_read FROM reading_logs WHERE id = %(log_id)s",
        {"log_id": log_id},
    )
    if not log_rows:
        return f"❌ Log de leitura '{log_id}' não encontrado."

    log = log_rows[0]

    # Hard delete: remove permanentemente o registro
    run_dml("DELETE FROM reading_logs WHERE id = %(log_id)s", {"log_id": log_id})

    return (
        f"🗑️ Log removido: <b>{log['book_title']}</b> — "
        f"{log['date']} · {log['pages_read']} páginas."
    )


def get_book_by_id(book_id: str) -> dict | None:
    """Busca um livro pelo ID exato — usado pelo coordinator para re-exibir o menu."""
    sql = "SELECT * FROM books WHERE id = %(book_id)s AND deleted = FALSE"
    rows = run_select(sql, {"book_id": book_id})
    return rows[0] if rows else None


def update_book_by_id(
    book_id: str,
    status: str | None = None,
    rating: float | None = None,
    notes: str | None = None,
    date_finished: str | None = None,
    date_started: str | None = None,
) -> None:
    """
    Atualiza campos específicos de um livro pelo ID exato.
    Usado pelo coordinator ao processar callbacks de botões inline —
    não é exposto como tool do agente, só importado diretamente.
    Só atualiza os campos que não forem None.
    """
    sets: list[str] = []
    params: dict = {
        "book_id": book_id,
        "now":     _now(),
    }

    # Adiciona cada campo apenas se foi fornecido
    if status is not None:
        sets.append("status = %(status)s")
        params["status"] = status
        # Se marcando como lido, garante que date_started não fique nulo
        if status == "lido" and date_finished is None:
            date_finished = str(_today())

    if rating is not None:
        sets.append("rating = %(rating)s")
        params["rating"] = rating

    if notes is not None:
        # CASE WHEN preserva notas anteriores, separando com quebra de linha
        sets.append("notes = CASE WHEN notes IS NULL THEN %(notes)s ELSE notes || E'\\n' || %(notes)s END")
        params["notes"] = notes

    if date_finished is not None:
        sets.append("date_finished = %(date_finished)s")
        params["date_finished"] = date_finished

    if date_started is not None:
        sets.append("date_started = %(date_started)s")
        params["date_started"] = date_started

    if not sets:
        return  # Nada para atualizar

    sets.append("updated_at = %(now)s")
    sql = f"UPDATE books SET {', '.join(sets)} WHERE id = %(book_id)s"
    run_dml(sql, params)


def update_book_metadata_by_id(
    book_id: str,
    title: str | None = None,
    author: str | None = None,
    cover_url: str | None = None,
    total_pages: int | None = None,
    genre: str | None = None,
    published_year: int | None = None,
    isbn: str | None = None,
    language: str | None = None,
    description: str | None = None,
    notes: str | None = None,
) -> str:
    """Atualiza campos de metadados de um livro pelo ID exato.

    Recebe apenas os campos que devem ser sobrescritos — campos com valor None
    são ignorados e permanecem inalterados no banco.
    Sempre atualiza `updated_at` para o momento da chamada.

    Diferente de `update_book_by_id`, esta função trata campos de metadados
    bibliográficos (título, autor, capa, páginas, gênero, ano, ISBN, idioma,
    descrição) e anotações pessoais do leitor.

    Args:
        book_id: UUID do livro na tabela `books` (campo `id`).
        title: Novo título do livro.
        author: Autor(es) separados por vírgula.
        cover_url: URL da imagem de capa.
        total_pages: Total de páginas da edição física do usuário.
        genre: Gênero(s) separados por vírgula.
        published_year: Ano de publicação (inteiro).
        isbn: ISBN-13 (preferido) ou ISBN-10 como fallback.
        language: Código do idioma (ex.: "pt", "en").
        description: Sinopse do livro (recomendado truncar em 500 chars).
        notes: Anotações pessoais / resenha (sobrescreve o valor anterior).

    Returns:
        Mensagem de confirmação em caso de sucesso, ou mensagem de erro
        descrevendo o que falhou.

    Example:
        >>> update_book_metadata_by_id("uuid-aqui", title="Duna", total_pages=896)
        "✅ Livro atualizado com sucesso."
    """
    # Lista de cláusulas SET que serão inseridas no UPDATE (ex.: "title = %(title)s")
    sets: list[str] = []

    # Parâmetros obrigatórios presentes em toda execução:
    # - book_id: identifica qual linha será atualizada (cláusula WHERE)
    # - now: timestamp atual para preencher updated_at
    params: dict = {
        "book_id": book_id,
        "now":     _now(),
    }

    # Para cada campo de metadados, só adicionamos ao SET se o valor foi fornecido.
    # Isso evita sobrescrever dados existentes com None acidentalmente.

    if title is not None:
        sets.append("title = %(title)s")
        params["title"] = title

    if author is not None:
        sets.append("author = %(author)s")
        params["author"] = author

    if cover_url is not None:
        sets.append("cover_url = %(cover_url)s")
        params["cover_url"] = cover_url

    if total_pages is not None:
        sets.append("total_pages = %(total_pages)s")
        params["total_pages"] = total_pages

    if genre is not None:
        sets.append("genre = %(genre)s")
        params["genre"] = genre

    if published_year is not None:
        sets.append("published_year = %(published_year)s")
        params["published_year"] = published_year

    if isbn is not None:
        sets.append("isbn = %(isbn)s")
        params["isbn"] = isbn

    if language is not None:
        sets.append("language = %(language)s")
        params["language"] = language

    if description is not None:
        sets.append("description = %(description)s")
        params["description"] = description

    if notes is not None:
        # Sobrescreve por completo o valor anterior (diferente de update_book_by_id que appenda)
        sets.append("notes = %(notes)s")
        params["notes"] = notes

    # Se nenhum campo foi fornecido, não há nada a atualizar — retorna feedback claro
    if not sets:
        return "⚠️ Nenhum campo para atualizar foi informado."

    # Sempre atualiza updated_at para registrar o momento da modificação
    sets.append("updated_at = %(now)s")

    # Monta a query UPDATE com os campos dinâmicos e executa no PostgreSQL
    sql = f"UPDATE books SET {', '.join(sets)} WHERE id = %(book_id)s"

    try:
        # run_dml retorna o número de linhas afetadas — 0 significa que o ID não existe
        affected = run_dml(sql, params)
    except Exception as e:
        # Captura erros de rede, permissão ou SQL e retorna mensagem legível ao agente
        return f"❌ Erro ao atualizar metadados: {e}"

    # Se nenhuma linha foi afetada, o book_id informado não existe na tabela
    if affected == 0:
        return f"❌ Livro com ID '{book_id}' não encontrado."

    return "✅ Livro atualizado com sucesso."
