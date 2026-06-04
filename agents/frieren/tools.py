"""
Tools do agente Frieren — rastreamento de leitura pessoal.
BigQuery para persistência + Google Books API para metadados.
"""

import os           # Para ler variáveis de ambiente (credenciais, chaves de API)
import uuid         # Para gerar IDs únicos universais (UUID v4) para cada livro
import unicodedata  # Para remover acentos na normalização de strings (busca fuzzy)
from datetime import datetime, date  # Tipos de data/hora usados no sistema
from zoneinfo import ZoneInfo                  # Para trabalhar com fuso horário (Brasil)

import re                           # Para remover pontuação na normalização de strings (busca fuzzy)
import requests                    # Cliente HTTP para chamar a Google Books API
from google.cloud import bigquery  # Cliente oficial do BigQuery (banco de dados na nuvem)
from google.oauth2 import service_account  # Para criar credenciais a partir do JSON do service account


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTES GLOBAIS
# ─────────────────────────────────────────────────────────────────────────────

# Status válidos para um livro no sistema de rastreamento.
# Qualquer valor fora dessa lista deve ser rejeitado para manter consistência.
VALID_STATUSES = ["lendo", "lido", "quero_ler", "pausado", "abandonado"]

# Fuso horário do usuário (Brasil — UTC-3).
# Usado para garantir que todas as datas sejam registradas no horário brasileiro,
# e não no UTC do servidor (que roda no VPS em outro fuso).
_TZ = ZoneInfo("America/Sao_Paulo")

# Endpoint público da Google Books API.
# Não exige autenticação para buscas básicas — a chave de API aumenta o limite
# de requisições, mas é opcional para uso pessoal em baixo volume.
_BOOKS_API_URL = "https://www.googleapis.com/books/v1/volumes"

# Nome do dataset BigQuery dedicado ao agente Frieren.
# Separado do dataset da Nami (nami_finance_agent) para isolar domínios.
_DATASET = "frieren_books_agent"


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS PRIVADOS — infraestrutura (não chamados diretamente pelo agente)
# ─────────────────────────────────────────────────────────────────────────────

def _project() -> str:
    """Retorna o ID do projeto GCP lido da variável de ambiente GCP_PROJECT_ID.

    Retorna string vazia se não estiver configurado — os helpers de query
    vão falhar com erro claro do BigQuery se o projeto estiver ausente.
    """
    # Lê o ID do projeto GCP configurado no ambiente (Dokploy/Docker/.env)
    return os.environ.get("GCP_PROJECT_ID", "")


# Cache do cliente BigQuery — evita criar múltiplas conexões entre chamadas de tool
_bq_client: bigquery.Client | None = None


def _client() -> bigquery.Client:
    """Retorna o cliente BigQuery, criando-o na primeira chamada (singleton).

    Usa GCP_CREDENTIALS_JSON (conteúdo JSON do service account como string),
    igual ao padrão da Nami — funciona em Docker/Dokploy sem montar arquivos.
    Fallback para ADC em desenvolvimento local.
    """
    global _bq_client

    if _bq_client is None:
        # Lê o conteúdo JSON do service account direto da env var (padrão Docker/Dokploy)
        creds_json = os.environ.get("GCP_CREDENTIALS_JSON", "")

        if creds_json:
            import json
            # Converte a string JSON para dict e cria credenciais sem precisar de arquivo
            info = json.loads(creds_json)
            creds = service_account.Credentials.from_service_account_info(
                info,
                scopes=["https://www.googleapis.com/auth/bigquery"],
            )
            _bq_client = bigquery.Client(project=_project(), credentials=creds)
        else:
            # ADC — funciona localmente com `gcloud auth application-default login`
            _bq_client = bigquery.Client(project=_project())

    return _bq_client


def _table(name: str) -> str:
    """Retorna o caminho completo de uma tabela no formato BigQuery SQL.

    O formato é: projeto.dataset.tabela — sem crases, pois o nome do projeto
    e dataset não contêm caracteres especiais que exijam escape.

    Exemplo de resultado: "projetos-448301.frieren_books_agent.books"
    """
    return f"{_project()}.{_DATASET}.{name}"


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
    """Retorna uma expressão SQL BigQuery que normaliza uma coluna de texto
    da mesma forma que _norm() faz no Python.

    Permite comparar títulos armazenados no banco (com acentos e pontuação,
    vindos da Google Books API) contra queries do usuário (sem acentos, sem
    pontuação) usando LIKE — sem necessidade de coluna extra no schema.

    Exemplo: título armazenado "Belo mundo, onde você está" é normalizado para
    "belo mundo onde voce esta", que casa com a query "belo mundo onde voce esta".
    """
    # Passo 1: converte para minúsculas
    expr = f"LOWER({col})"

    # Passo 2: substitui letras acentuadas pela letra base equivalente
    # — mesma lógica do _norm() Python via NFD, mas implementada com REGEXP_REPLACE
    # porque BigQuery não expõe normalização NFD diretamente via SQL
    for padrao, repl in [
        ("[àáâãä]", "a"),
        ("[èéêë]",  "e"),
        ("[ìíîï]",  "i"),
        ("[òóôõö]", "o"),
        ("[ùúûü]",  "u"),
        ("ç",       "c"),
    ]:
        expr = f"REGEXP_REPLACE({expr}, '{padrao}', '{repl}')"

    # Passo 3: remove pontuação comum (substitui por espaço para não juntar palavras)
    expr = f"REGEXP_REPLACE({expr}, '[,.;:!?]', ' ')"

    # Passo 4: colapsa múltiplos espaços e remove espaços nas bordas
    expr = f"TRIM(REGEXP_REPLACE({expr}, '  +', ' '))"

    return expr


def _run_select(sql: str, params: list) -> list[dict]:
    """Executa uma query SELECT no BigQuery e retorna as linhas como lista de dicionários.

    Usa parâmetros nomeados (@placeholder) para evitar SQL injection —
    os valores do usuário nunca são concatenados diretamente na string SQL.

    Parâmetros:
        sql    — Query SQL com @placeholders para os parâmetros
        params — Lista de bigquery.ScalarQueryParameter com os valores reais
    """
    # Configura o job com os parâmetros que substituirão os @placeholders
    job_config = bigquery.QueryJobConfig(query_parameters=params)

    # Envia a query para o BigQuery, aguarda o resultado e converte para lista de dicts
    result = _client().query(sql, job_config=job_config).result()

    return [dict(row) for row in result]


def _run_dml(sql: str, params: list) -> int:
    """Executa uma operação DML (INSERT/UPDATE/DELETE) no BigQuery.

    Aguarda a conclusão do job e retorna o número de linhas afetadas,
    útil para verificar se um UPDATE encontrou o registro alvo.

    Parâmetros:
        sql    — Query DML com @placeholders
        params — Lista de bigquery.ScalarQueryParameter com os valores

    Retorna:
        Número de linhas afetadas (0 se nenhum registro foi modificado)
    """
    # Configura os parâmetros para evitar SQL injection
    job_config = bigquery.QueryJobConfig(query_parameters=params)

    # Envia a operação para o BigQuery
    job = _client().query(sql, job_config=job_config)

    # Aguarda a conclusão no servidor — sem isso, o job pode ainda estar rodando
    job.result()

    # num_dml_affected_rows pode ser None se a operação não retornar contagem
    return job.num_dml_affected_rows or 0


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
    # Tentamos primeiro porque ISBN é um identificador único — é mais preciso
    # do que a correspondência parcial por título, que pode retornar livros errados.
    if _is_isbn(query):
        sql_isbn = f"""
            SELECT *
            FROM `{_table("books")}`
            WHERE isbn = @isbn AND deleted = FALSE
            ORDER BY
                CASE WHEN status = 'lendo' THEN 0 ELSE 1 END ASC,
                updated_at DESC
            LIMIT 1
        """
        isbn_rows = _run_select(sql_isbn, [
            bigquery.ScalarQueryParameter("isbn", "STRING", isbn_clean),
        ])
        if isbn_rows:
            # ISBN encontrado — retorna diretamente, sem precisar de busca fuzzy
            return isbn_rows[0]

    # ── Busca fuzzy por título ou autor ───────────────────────────────────────
    # Normaliza a query para busca case-insensitive sem acentos
    norm_query = _norm(query)

    # Padrão LIKE com % nas duas pontas para correspondência parcial
    # Ex.: "duna" casa com "Duna", "A Saga de Duna", "Duna: Messias"
    like_pattern = f"%{norm_query}%"

    # Busca por título OU autor — usando _norm_sql_col() para normalizar o texto armazenado
    # da mesma forma que _norm() normalizou a query do usuário.
    # Isso garante que "Belo mundo, onde você está" case com "belo mundo onde voce esta":
    # a função remove acentos e pontuação antes de fazer o LIKE.
    # ORDER BY: status 'lendo' primeiro (CASE retorna 0), depois por data de atualização.
    # Isso garante que o livro em leitura atual apareça antes de livros já lidos.
    sql = f"""
        SELECT *
        FROM `{_table("books")}`
        WHERE (
            {_norm_sql_col("title")} LIKE @query
            OR {_norm_sql_col("author")} LIKE @query
            OR isbn LIKE @isbn_like
        )
        AND deleted = FALSE
        ORDER BY
            CASE WHEN status = 'lendo' THEN 0 ELSE 1 END ASC,
            updated_at DESC
        LIMIT 5
    """

    params = [
        bigquery.ScalarQueryParameter("query",     "STRING", like_pattern),
        # isbn_like usa o valor sem hífens para normalizar a comparação
        bigquery.ScalarQueryParameter("isbn_like", "STRING", f"%{isbn_clean}%"),
    ]

    rows = _run_select(sql, params)

    if not rows:
        # ── Fallback: tenta cada segmento separado por ": " ──────────────────
        # O agente às vezes usa o título completo com subtítulo (ex.: "Stardust: O mistério
        # da estrela"), que não casa com o título curto armazenado no banco ("Stardust").
        # Dividimos por ": " e tentamos cada parte de forma independente.
        segmentos = [s.strip() for s in query.split(":") if s.strip()]
        if len(segmentos) > 1:
            for segmento in segmentos:
                resultado = _find_book_by_query(segmento)
                if resultado:
                    return resultado
        # Nenhum livro encontrado nem pelos segmentos
        return None

    # Se o primeiro resultado já é 'lendo', retorna ele diretamente
    # Caso contrário, verifica se existe algum 'lendo' na lista e prioriza
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
    # Monta os parâmetros da requisição HTTP para a Google Books API.
    # langRestrict="pt" filtra resultados em português — retorna edições brasileiras/portuguesas
    # primeiro, o que evita que a API priorize edições em inglês para títulos internacionais.
    request_params = {
        "q": query,                    # Termo de busca
        "maxResults": max_results,     # Limita a quantidade de resultados
        "printType": "books",          # Filtra apenas livros (exclui revistas/periódicos)
        "langRestrict": "pt",          # Restringe resultados ao idioma português
    }

    # Adiciona a chave de API se disponível — aumenta o limite de requisições diárias
    # Sem a chave, o limite padrão é ~1000 req/dia (suficiente para uso pessoal)
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

        # ISBN: preferimos o ISBN-13 (mais moderno e universal) ao ISBN-10 (legado).
        # A API retorna uma lista de identificadores com diferentes tipos.
        isbn = None
        for identifier in info.get("industryIdentifiers", []):
            if identifier.get("type") == "ISBN_13":
                # ISBN-13 encontrado — usa e para de buscar (é o preferido)
                isbn = identifier.get("identifier")
                break
            elif identifier.get("type") == "ISBN_10" and isbn is None:
                # ISBN-10 como fallback — só usa se ainda não encontrou ISBN-13
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
        # porque o campo 'publishedDate' pode ser "2021", "2021-03", ou "2021-03-15"
        published_date = info.get("publishedDate", "")
        published_year = None
        if published_date and len(published_date) >= 4:
            try:
                # Converte para int para facilitar comparações e ordenações
                published_year = int(published_date[:4])
            except ValueError:
                # Se os primeiros 4 caracteres não forem um número, mantém None
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
    # inpublisher: que a Google Books API entende, mais preciso que texto livre
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
    # Rejeita qualquer status que não esteja na lista de valores aceitos pelo sistema
    if status not in VALID_STATUSES:
        return (
            f"Status inválido: <b>{status}</b>. "
            f"Use um dos seguintes: {', '.join(VALID_STATUSES)}."
        )

    # ── 2. Verifica duplicatas no catálogo ────────────────────────────────────
    # Busca no banco se já existe um livro com título parecido para evitar duplicação
    existente = _find_book_by_query(title)
    if existente and _norm(existente["title"]) == _norm(title):
        # Livro já cadastrado — informa o status atual para o usuário saber o estado
        return (
            f"<b>{existente['title']}</b> já está no catálogo "
            f"com status <b>{existente['status']}</b>."
        )

    # ── 3. Obtém metadados do livro ───────────────────────────────────────────
    # Dicionário que vai acumular os metadados do livro (da API ou fornecidos manualmente)
    meta: dict = {}

    if google_books_id:
        # Se o usuário informou um ID específico, busca diretamente aquele volume
        # Isso é mais preciso do que uma busca por texto (evita pegar a edição errada)
        try:
            resp = requests.get(
                f"{_BOOKS_API_URL}/{google_books_id}",
                timeout=10,
            )
            resp.raise_for_status()  # Lança exceção se o volume não existir (404, etc.)
            item = resp.json()
            info = item.get("volumeInfo", {})

            # Extrai os campos necessários do volumeInfo retornado pela API
            authors_list = info.get("authors", [])
            categories = info.get("categories", [])
            image_links = info.get("imageLinks", {})
            description_full = info.get("description", "")
            published_date = info.get("publishedDate", "")

            # Ano de publicação: pega os primeiros 4 caracteres da data
            pub_year = None
            if published_date and len(published_date) >= 4:
                try:
                    pub_year = int(published_date[:4])
                except ValueError:
                    pub_year = None

            # Extrai o ISBN preferindo ISBN-13 sobre ISBN-10 (mesma lógica do _fetch_google_books)
            isbn_val = None
            for identifier in info.get("industryIdentifiers", []):
                if identifier.get("type") == "ISBN_13":
                    isbn_val = identifier.get("identifier")
                    break
                elif identifier.get("type") == "ISBN_10" and isbn_val is None:
                    isbn_val = identifier.get("identifier")

            # Monta o dicionário de metadados com todos os campos extraídos
            meta = {
                "google_books_id": google_books_id,
                "title": info.get("title", title),  # Fallback para o título informado pelo usuário
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
            # Falha na requisição — continua sem metadados da API; tentará busca textual abaixo
            meta = {}

    # Se ainda não temos metadados (não veio por ID ou falhou), tenta busca textual
    if not meta:
        resultados = _fetch_google_books(title, max_results=1)
        if resultados:
            # Usa o primeiro resultado como fonte de metadados
            meta = resultados[0]

    # Se mesmo a busca textual não retornou nada, monta um dict manual com os dados fornecidos
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
    # (ex.: edições especiais, omnibus, traduções com diagramação diferente)
    if total_pages is not None:
        meta["total_pages"] = total_pages

    # O autor fornecido manualmente tem precedência sobre o retornado pela API
    # (útil para pseudônimos, co-autores ou grafias diferentes)
    if author is not None:
        meta["author"] = author

    # ── 5. Gera ID único para o livro ─────────────────────────────────────────
    # UUID v4 garante unicidade global sem necessidade de sequência numérica no banco
    book_id = str(uuid.uuid4())

    # ── 6. Define data de início de leitura ───────────────────────────────────
    # Só registra date_started se o livro já está sendo lido — outros status não têm data de início
    date_started = str(_today()) if status == "lendo" else None

    # ── 7. Insere o livro na tabela books do BigQuery ─────────────────────────
    # Usa parâmetros nomeados (@placeholder) para todos os valores variáveis.
    # NULL e FALSE são literais SQL seguros (sem entrada do usuário) — não precisam de params.
    # Os campos date_finished, rating, notes são NULL pois o livro está sendo adicionado agora.
    sql = f"""
        INSERT INTO `{_table("books")}` (
            id, google_books_id, title, author, total_pages,
            isbn, cover_url, description, genre, language, published_year,
            status, date_started, date_finished, rating, notes,
            source, created_at, updated_at, deleted
        ) VALUES (
            @id, @google_books_id, @title, @author, @total_pages,
            @isbn, @cover_url, @description, @genre, @language, @published_year,
            @status, @date_started, NULL, NULL, NULL,
            @source, @created_at, @updated_at, FALSE
        )
    """

    # Timestamp atual para os campos de auditoria (created_at e updated_at)
    agora = _now()

    # Monta a lista de parâmetros tipados — o BigQuery exige o tipo explícito para cada valor
    params = [
        bigquery.ScalarQueryParameter("id",              "STRING",    book_id),
        bigquery.ScalarQueryParameter("google_books_id", "STRING",    meta.get("google_books_id")),
        bigquery.ScalarQueryParameter("title",           "STRING",    meta.get("title", title)),
        bigquery.ScalarQueryParameter("author",          "STRING",    meta.get("author") or None),
        bigquery.ScalarQueryParameter("total_pages",     "INT64",     meta.get("total_pages")),
        bigquery.ScalarQueryParameter("isbn",            "STRING",    meta.get("isbn")),
        bigquery.ScalarQueryParameter("cover_url",       "STRING",    meta.get("cover_url")),
        bigquery.ScalarQueryParameter("description",     "STRING",    meta.get("description") or None),
        bigquery.ScalarQueryParameter("genre",           "STRING",    meta.get("genre") or None),
        bigquery.ScalarQueryParameter("language",        "STRING",    meta.get("language") or None),
        bigquery.ScalarQueryParameter("published_year",  "INT64",     meta.get("published_year")),
        bigquery.ScalarQueryParameter("status",          "STRING",    status),
        bigquery.ScalarQueryParameter("date_started",    "DATE",      date_started),
        bigquery.ScalarQueryParameter("source",          "STRING",    "telegram"),
        bigquery.ScalarQueryParameter("created_at",      "TIMESTAMP", agora),
        bigquery.ScalarQueryParameter("updated_at",      "TIMESTAMP", agora),
    ]

    # Executa o INSERT — _run_dml aguarda a conclusão e retorna linhas afetadas
    _run_dml(sql, params)

    # ── 8. Monta a mensagem de confirmação ────────────────────────────────────
    # Exibe o título final (que pode ter vindo da API), o autor e as páginas
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
    sql = f"""
        SELECT b.id, b.title, b.author, b.total_pages, b.status,
               b.date_started, b.date_finished
        FROM `{_table("reading_logs")}` rl
        JOIN `{_table("books")}` b ON b.id = rl.book_id
        ORDER BY rl.date DESC, rl.created_at DESC
        LIMIT 1
    """
    rows = _run_select(sql, [])
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
    # Se book_query não foi informado, usa o livro com o log mais recente —
    # assume que o usuário está continuando a leitura que já estava registrando.
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
    # Página 0 é válida (indica início do livro / recomeço), mas negativos não fazem sentido.
    if current_page < 0:
        return "O número de página não pode ser negativo."

    # ── 3. Valida que a página não ultrapassa o total do livro ────────────────
    # Se o livro tem total_pages cadastrado, verificamos o limite.
    # Sugerimos finish_book porque ao concluir o livro o fluxo é diferente
    # (atualiza status para 'lido', registra date_finished, solicita avaliação).
    total_pages = book.get("total_pages")
    if total_pages and current_page > total_pages:
        return (
            f"A página <b>{current_page}</b> ultrapassa o total de páginas de "
            f"<b>{book['title']}</b> ({total_pages} páginas). "
            "Se você terminou o livro, use o comando de finalizar leitura."
        )

    # ── 4. Busca o último log de leitura para calcular o delta ────────────────
    # O "delta" (páginas lidas nesta sessão) é fundamental para medir o progresso.
    # Calculamos como: páginas_lidas = página_atual - página_final_do_último_log.
    # Ordenamos por date DESC, created_at DESC para pegar o registro mais recente,
    # mesmo que dois logs tenham a mesma data (o inserted_at desempata).
    book_id = book["id"]
    sql_last = f"""
        SELECT page_end
        FROM `{_table("reading_logs")}`
        WHERE book_id = @book_id
        ORDER BY date DESC, created_at DESC
        LIMIT 1
    """
    last_params = [
        bigquery.ScalarQueryParameter("book_id", "STRING", book_id),
    ]
    last_logs = _run_select(sql_last, last_params)

    # page_start = última página registrada, ou 0 se nunca houve nenhum log
    # (ou seja, o usuário nunca registrou progresso antes para este livro)
    page_start = last_logs[0]["page_end"] if last_logs else 0

    # ── 5. Calcula as páginas lidas nesta sessão ──────────────────────────────
    pages_read = current_page - page_start

    # Detecta inconsistência: a página atual é MENOR que a última registrada.
    # Isso pode acontecer se o usuário informou a página errada ou está relendo
    # um trecho anterior. Pedimos confirmação em vez de registrar valor negativo.
    if pages_read < 0:
        return (
            f"A página <b>{current_page}</b> é menor que a última registrada "
            f"(<b>{page_start}</b>) para <b>{book['title']}</b>. "
            "Verifique se informou a página correta."
        )

    # Nenhuma página nova foi lida — evita criar um log inútil no banco.
    if pages_read == 0:
        return (
            f"<b>{book['title']}</b> já estava registrado na página <b>{page_start}</b>. "
            "Nenhum progresso novo para registrar."
        )

    # ── 6. Determina a data da sessão ─────────────────────────────────────────
    # Se o usuário não informou a data, usamos hoje (no fuso brasileiro).
    # Isso permite registrar sessões retroativamente (ex: "ontem li até a página 80").
    entry_date = log_date if log_date else str(_today())

    # ── 7. Gera ID único para este log ────────────────────────────────────────
    # UUID v4 garante unicidade sem depender de sequência auto-incrementada no BigQuery.
    log_id = str(uuid.uuid4())

    # ── 8. Insere o registro na tabela reading_logs ───────────────────────────
    # Armazenamos book_title como cópia desnormalizada para facilitar consultas
    # históricas sem precisar de JOIN com a tabela books (BigQuery é orientado a colunas,
    # JOINs desnecessários adicionam custo de processamento).
    agora = _now()
    sql_insert = f"""
        INSERT INTO `{_table("reading_logs")}` (
            id, book_id, book_title, date,
            page_start, page_end, pages_read,
            session_notes, created_at
        ) VALUES (
            @id, @book_id, @book_title, @date,
            @page_start, @page_end, @pages_read,
            @session_notes, @created_at
        )
    """
    insert_params = [
        bigquery.ScalarQueryParameter("id",            "STRING",    log_id),
        bigquery.ScalarQueryParameter("book_id",       "STRING",    book_id),
        bigquery.ScalarQueryParameter("book_title",    "STRING",    book["title"]),
        bigquery.ScalarQueryParameter("date",          "DATE",      entry_date),
        bigquery.ScalarQueryParameter("page_start",    "INT64",     page_start),
        bigquery.ScalarQueryParameter("page_end",      "INT64",     current_page),
        bigquery.ScalarQueryParameter("pages_read",    "INT64",     pages_read),
        bigquery.ScalarQueryParameter("session_notes", "STRING",    session_notes),
        bigquery.ScalarQueryParameter("created_at",    "TIMESTAMP", agora),
    ]
    _run_dml(sql_insert, insert_params)

    # ── 9. Atualiza status do livro para 'lendo' se necessário ────────────────
    # Se o livro estava como 'quero_ler', 'pausado' ou outro status,
    # o ato de registrar progresso implica que a leitura foi (re)iniciada.
    # COALESCE(date_started, @today) preserva a data de início original se já existia —
    # evitamos sobrescrever a data em que a leitura foi de fato começada.
    if book.get("status") != "lendo":
        today_str = str(_today())
        sql_update = f"""
            UPDATE `{_table("books")}`
            SET status = 'lendo',
                date_started = COALESCE(date_started, @today),
                updated_at = @now
            WHERE id = @book_id
        """
        update_params = [
            bigquery.ScalarQueryParameter("today",   "DATE",      today_str),
            bigquery.ScalarQueryParameter("now",     "TIMESTAMP", agora),
            bigquery.ScalarQueryParameter("book_id", "STRING",    book_id),
        ]
        _run_dml(sql_update, update_params)

    # ── 10. Monta a mensagem de confirmação com o progresso ───────────────────
    titulo = book["title"]

    if total_pages:
        # Calcula o percentual concluído e as páginas restantes para terminar
        percent = round((current_page / total_pages) * 100, 1)
        remaining = total_pages - current_page

        return (
            f"<b>{titulo}</b> — <b>{percent}%</b> concluído "
            f"({current_page}/{total_pages} páginas, {remaining} restantes)\n"
            f"📖 {pages_read} páginas lidas nesta sessão."
        )
    else:
        # Sem total de páginas cadastrado, mostra apenas a página atual e o delta
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
    # Tabelas completas para usar no SQL
    books_table = _table("books")
    logs_table  = _table("reading_logs")

    # Query única com LEFT JOIN — MAX(rl.page_end) dá a página mais avançada lida,
    # COUNT(rl.id) conta quantas sessões foram registradas para este livro.
    # GROUP BY é necessário porque estamos usando funções de agregação.
    sql = f"""
        SELECT
            b.id,
            b.title,
            b.author,
            b.total_pages,
            b.date_started,
            MAX(rl.page_end)  AS current_page,
            COUNT(rl.id)      AS total_sessions
        FROM `{books_table}` b
        LEFT JOIN `{logs_table}` rl ON rl.book_id = b.id
        WHERE b.status = 'lendo' AND b.deleted = FALSE
        GROUP BY b.id, b.title, b.author, b.total_pages, b.date_started
        ORDER BY b.updated_at DESC
    """

    # Nenhum parâmetro de usuário nesta query — os filtros são literais seguros
    rows = _run_select(sql, [])

    # Caso não haja nenhum livro em leitura no momento
    if not rows:
        return "Nenhum livro em leitura no momento."

    # Constrói a mensagem formatada para cada livro encontrado
    linhas = []
    for row in rows:
        titulo       = row["title"]
        autor        = row.get("author") or "autor desconhecido"
        total_pages  = row.get("total_pages")          # Pode ser None se não cadastrado
        current_page = row.get("current_page")         # Pode ser None se nunca houve log
        date_started = row.get("date_started")         # Data de início, pode ser None

        # Formata a data de início como string legível, ou omite se ausente
        inicio_txt = f" · começou em {date_started}" if date_started else ""

        if total_pages and current_page is not None:
            # Temos total de páginas e progresso: calculamos o percentual concluído
            percent = round((current_page / total_pages) * 100, 1)
            progresso_txt = f"{percent}% ({current_page}/{total_pages} páginas)"
        elif current_page is not None:
            # Temos progresso mas não sabemos o total de páginas
            progresso_txt = f"página {current_page}"
        else:
            # Nunca houve nenhum log de leitura para este livro
            progresso_txt = "não iniciado"

        # Monta o bloco de texto para este livro
        bloco = (
            f"📖 <b>{titulo}</b>\n"
            f"   {autor} · {progresso_txt}{inicio_txt}"
        )
        linhas.append(bloco)

    # Separa cada livro com linha em branco para melhor legibilidade
    return "\n\n".join(linhas)


def get_reading_list(status: str | None = None) -> str:
    """
    Lista todos os livros do catálogo, opcionalmente filtrados por status.
    Agrupa os resultados por status com cabeçalhos visuais com emoji.

    Parâmetros:
        status — Filtra por um status específico (ex.: 'lendo', 'lido').
                 Se None, retorna todos os livros agrupados por status.
    """
    # Tabela de livros
    books_table = _table("books")

    # Mapeamento de status para emoji de cabeçalho — facilita leitura visual no Telegram
    STATUS_EMOJI = {
        "lendo":      "📖",
        "lido":       "✅",
        "quero_ler":  "📚",
        "pausado":    "⏸️",
        "abandonado": "❌",
    }

    # Monta a query base — WHERE deleted=FALSE exclui livros removidos logicamente
    sql = f"""
        SELECT title, author, total_pages, status, date_started, date_finished, rating
        FROM `{books_table}`
        WHERE deleted = FALSE
    """
    params = []

    if status is not None:
        # Filtra por status específico se informado pelo usuário
        # Parâmetro nomeado @status para evitar SQL injection
        sql += " AND status = @status"
        params.append(bigquery.ScalarQueryParameter("status", "STRING", status))

    # Ordena por status primeiro (agrupamento), depois por data de atualização mais recente
    sql += " ORDER BY status, updated_at DESC"

    rows = _run_select(sql, params)

    # Lista vazia: nenhum livro cadastrado ou nenhum com o status solicitado
    if not rows:
        if status:
            return f"Nenhum livro com status <b>{status}</b> encontrado."
        return "Nenhum livro no catálogo ainda."

    # Agrupa as linhas por status usando um dicionário ordenado
    # Chave: string do status; Valor: lista de dicts de cada livro naquele status
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

        # Lista os livros dentro do grupo
        itens = []
        for livro in livros:
            titulo = livro["title"]

            # Número de páginas formatado com N p. — omite se não cadastrado
            paginas_txt = f" ({livro['total_pages']}p.)" if livro.get("total_pages") else ""

            # Avaliação com estrela — omite se não avaliado
            rating_txt = f" · ⭐ {livro['rating']}" if livro.get("rating") is not None else ""

            itens.append(f"• {titulo}{paginas_txt}{rating_txt}")

        # Une cabeçalho e itens da seção
        secoes.append(cabecalho + "\n" + "\n".join(itens))

    # Separa seções com linha em branco
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
    # A escala vai de 1.0 a 5.0 — valores fora disso são rejeitados
    if rating is not None and not (1.0 <= rating <= 5.0):
        return "A avaliação deve ser um valor entre <b>1.0</b> e <b>5.0</b>."

    # ── 3. Calcula o total de páginas lidas nos logs ───────────────────────────
    # SUM(pages_read) soma todas as sessões de leitura registradas para este livro
    book_id = book["id"]
    sql_sum = f"""
        SELECT COALESCE(SUM(pages_read), 0) AS total_pages_read
        FROM `{_table("reading_logs")}`
        WHERE book_id = @book_id
    """
    sum_params = [
        bigquery.ScalarQueryParameter("book_id", "STRING", book_id),
    ]
    sum_rows = _run_select(sql_sum, sum_params)

    # COALESCE garante que retorne 0 mesmo se não houver nenhum log
    total_pages_read = sum_rows[0]["total_pages_read"] if sum_rows else 0

    # ── 4. Atualiza o registro do livro no BigQuery ───────────────────────────
    # Usa a data informada pelo usuário ou cai para hoje como padrão
    finished_str = date_finished if date_finished else str(_today())
    agora        = _now()

    # Monta SET dinâmico: date_started só é atualizado se o usuário informou
    # (COALESCE preservaria o valor existente, mas se o usuário quer sobrescrever
    # uma data errada, precisamos de SET condicional via parâmetro)
    set_date_started = (
        "date_started = @date_started,"
        if date_started
        else "date_started = COALESCE(date_started, @date_started),"
    )

    # COALESCE(@notes, notes) preserva as anotações já existentes se não informadas
    sql_update = f"""
        UPDATE `{_table("books")}`
        SET
            status        = 'lido',
            date_finished = @date_finished,
            {set_date_started}
            rating        = @rating,
            notes         = COALESCE(@notes, notes),
            updated_at    = @updated_at
        WHERE id = @book_id
    """
    update_params = [
        bigquery.ScalarQueryParameter("date_finished", "DATE",      finished_str),
        bigquery.ScalarQueryParameter("date_started",  "DATE",      date_started),
        bigquery.ScalarQueryParameter("rating",        "FLOAT64",   rating),
        bigquery.ScalarQueryParameter("notes",         "STRING",    notes),
        bigquery.ScalarQueryParameter("updated_at",    "TIMESTAMP", agora),
        bigquery.ScalarQueryParameter("book_id",       "STRING",    book_id),
    ]
    _run_dml(sql_update, update_params)

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
    # Rejeita valores inválidos para manter integridade dos dados
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

    # ── 3. Atualiza o status no BigQuery ──────────────────────────────────────
    today_str = str(_today())
    agora     = _now()

    # CASE WHEN: se o novo status é 'lendo' E date_started ainda é NULL,
    # registra hoje como data de início. Caso contrário, preserva o valor existente.
    # Isso evita sobrescrever a data real de início quando o status já foi 'lendo' antes.
    sql = f"""
        UPDATE `{_table("books")}`
        SET
            status       = @status,
            date_started = CASE
                               WHEN @status = 'lendo' AND date_started IS NULL
                               THEN @today
                               ELSE date_started
                           END,
            updated_at   = @updated_at
        WHERE id = @book_id
    """
    params = [
        bigquery.ScalarQueryParameter("status",     "STRING",    status),
        bigquery.ScalarQueryParameter("today",      "DATE",      today_str),
        bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", agora),
        bigquery.ScalarQueryParameter("book_id",    "STRING",    book["id"]),
    ]
    _run_dml(sql, params)

    # ── 4. Retorna confirmação ────────────────────────────────────────────────
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
    sql = f"""
        UPDATE `{_table('books')}`
        SET
            total_pages = @total_pages,
            updated_at  = @now
        WHERE id = @book_id
    """
    _run_dml(sql, [
        bigquery.ScalarQueryParameter("total_pages", "INT64",     total_pages),
        bigquery.ScalarQueryParameter("now",         "TIMESTAMP", now),
        bigquery.ScalarQueryParameter("book_id",     "STRING",    book["id"]),
    ])

    # Calcula o progresso atualizado se houver logs de leitura
    last_log_sql = f"""
        SELECT page_end
        FROM `{_table('reading_logs')}`
        WHERE book_id = @book_id
        ORDER BY date DESC, created_at DESC
        LIMIT 1
    """
    last_logs = _run_select(
        last_log_sql,
        [bigquery.ScalarQueryParameter("book_id", "STRING", book["id"])]
    )

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

    books_table = _table("books")
    logs_table  = _table("reading_logs")

    # ── Query 1: Livros concluídos e avaliação média no ano ───────────────────
    # Filtra livros com status 'lido' cujo date_finished caiu no ano alvo
    sql_books = f"""
        SELECT
            COUNT(*)     AS books_finished,
            AVG(rating)  AS avg_rating
        FROM `{books_table}`
        WHERE status = 'lido'
          AND EXTRACT(YEAR FROM date_finished) = @year
          AND deleted = FALSE
    """
    params_books = [
        bigquery.ScalarQueryParameter("year", "INT64", year),
    ]
    rows_books = _run_select(sql_books, params_books)

    # ── Query 2: Total de páginas e sessões de leitura no ano ────────────────
    # SUM(pages_read) soma todas as sessões; COUNT(*) conta o número de sessões
    sql_logs = f"""
        SELECT
            COALESCE(SUM(pages_read), 0) AS total_pages,
            COUNT(*)                     AS total_sessions
        FROM `{logs_table}`
        WHERE EXTRACT(YEAR FROM date) = @year
    """
    params_logs = [
        bigquery.ScalarQueryParameter("year", "INT64", year),
    ]
    rows_logs = _run_select(sql_logs, params_logs)

    # ── Query 3: Ritmo de leitura — últimos 30 dias com leitura no ano ────────
    # Agrega pages_read por dia para calcular a média diária de leitura.
    # LIMIT 30 pega os 30 dias mais recentes em que houve leitura.
    # Nota: conta dias com leitura, não dias corridos — evita distorção por dias sem leitura.
    sql_pace = f"""
        SELECT
            date,
            SUM(pages_read) AS daily_pages
        FROM `{logs_table}`
        WHERE EXTRACT(YEAR FROM date) = @year
        GROUP BY date
        ORDER BY date DESC
        LIMIT 30
    """
    params_pace = [
        bigquery.ScalarQueryParameter("year", "INT64", year),
    ]
    rows_pace = _run_select(sql_pace, params_pace)

    # ── Extrai os valores das queries ─────────────────────────────────────────
    # Número de livros concluídos — 0 se não houver
    books_finished = int(rows_books[0]["books_finished"]) if rows_books else 0

    # Avaliação média — None se não houver livros avaliados
    avg_rating = rows_books[0]["avg_rating"] if rows_books else None

    # Total de páginas lidas nos logs do ano
    total_pages = int(rows_logs[0]["total_pages"]) if rows_logs else 0

    # Total de sessões de leitura no ano
    total_sessions = int(rows_logs[0]["total_sessions"]) if rows_logs else 0

    # Ritmo médio: média de páginas por dia com leitura (últimos 30 dias)
    # Só calcula se houver dados de ritmo disponíveis
    avg_daily = None
    if rows_pace:
        soma_diaria = sum(r["daily_pages"] for r in rows_pace)
        avg_daily   = round(soma_diaria / len(rows_pace), 1)

    # ── Monta a mensagem de estatísticas ─────────────────────────────────────
    # Só exibe linhas que têm dados relevantes (evita linhas de "0" sem contexto)
    linhas = [f"<b>Estatísticas de leitura — {year}</b>\n"]

    # Livros concluídos — sempre mostra (mesmo que seja 0)
    linhas.append(f"📚 Livros concluídos: <b>{books_finished}</b>")

    if total_pages > 0:
        # Formata com separador de milhar para legibilidade (ex.: 1,234)
        linhas.append(f"📄 Páginas lidas: <b>{total_pages:,}</b>")

    if total_sessions > 0:
        linhas.append(f"📖 Sessões de leitura: <b>{total_sessions}</b>")

    if avg_daily is not None:
        linhas.append(f"⚡ Ritmo médio: <b>{avg_daily} páginas/dia</b> (últimos 30 dias com leitura)")

    if avg_rating is not None:
        # Exibe com uma casa decimal para consistência (ex.: 4.2/5.0)
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
    # Ordena por data ASC (cronológica) e created_at ASC para desempatar sessões
    # no mesmo dia — mantém a ordem em que foram registradas.
    book_id = book["id"]
    sql = f"""
        SELECT
            date,
            page_start,
            page_end,
            pages_read,
            session_notes
        FROM `{_table("reading_logs")}`
        WHERE book_id = @book_id
        ORDER BY date ASC, created_at ASC
    """
    params = [
        bigquery.ScalarQueryParameter("book_id", "STRING", book_id),
    ]
    logs = _run_select(sql, params)

    # ── 3. Trata o caso de nenhum log registrado ──────────────────────────────
    if not logs:
        return (
            f"<b>{book['title']}</b> — nenhuma sessão de leitura registrada ainda."
        )

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
        data       = log["date"]            # Data da sessão (objeto date ou string)
        page_start = log["page_start"]      # Página onde a sessão começou
        page_end   = log["page_end"]        # Página onde a sessão terminou
        pages_read = log["pages_read"]      # Quantas páginas foram lidas na sessão
        notas      = log.get("session_notes")  # Anotações opcionais — pode ser None

        # Formata as anotações da sessão: adiciona " — notas" se existirem
        notas_txt = f" — {notas}" if notas else ""

        # Linha da sessão no formato: "• data: p.X → p.Y (Z páginas) — notas"
        itens.append(
            f"• {data}: p.{page_start} → p.{page_end} ({pages_read} páginas){notas_txt}"
        )

    # Une cabeçalho e itens de sessão
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
    sql_last = f"""
        SELECT page_end
        FROM `{_table('reading_logs')}`
        WHERE book_id = @book_id
        ORDER BY date DESC, created_at DESC
        LIMIT 1
    """
    last_logs = _run_select(sql_last, [
        bigquery.ScalarQueryParameter("book_id", "STRING", book["id"])
    ])
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


def get_book_by_id(book_id: str) -> dict | None:
    """Busca um livro pelo ID exato — usado pelo coordinator para re-exibir o menu."""
    sql = f"SELECT * FROM `{_table('books')}` WHERE id = @book_id AND deleted = FALSE"
    rows = _run_select(sql, [bigquery.ScalarQueryParameter("book_id", "STRING", book_id)])
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
    params: list = [
        bigquery.ScalarQueryParameter("book_id", "STRING",    book_id),
        bigquery.ScalarQueryParameter("now",     "TIMESTAMP", _now()),
    ]

    # Adiciona cada campo apenas se foi fornecido
    if status is not None:
        sets.append("status = @status")
        params.append(bigquery.ScalarQueryParameter("status", "STRING", status))
        # Se marcando como lido, garante que date_started não fique nulo
        if status == "lido" and date_finished is None:
            date_finished = str(_today())

    if rating is not None:
        sets.append("rating = @rating")
        params.append(bigquery.ScalarQueryParameter("rating", "FLOAT64", rating))

    if notes is not None:
        # CONCAT preserva notas anteriores, separando com quebra de linha
        sets.append("notes = CASE WHEN notes IS NULL THEN @notes ELSE CONCAT(notes, '\\n', @notes) END")
        params.append(bigquery.ScalarQueryParameter("notes", "STRING", notes))

    if date_finished is not None:
        sets.append("date_finished = @date_finished")
        params.append(bigquery.ScalarQueryParameter("date_finished", "DATE", date_finished))

    if date_started is not None:
        sets.append("date_started = @date_started")
        params.append(bigquery.ScalarQueryParameter("date_started", "DATE", date_started))

    if not sets:
        return  # Nada para atualizar

    sets.append("updated_at = @now")
    sql = f"UPDATE `{_table('books')}` SET {', '.join(sets)} WHERE id = @book_id"
    _run_dml(sql, params)
