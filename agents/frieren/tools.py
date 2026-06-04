"""
Tools do agente Frieren — rastreamento de leitura pessoal.
BigQuery para persistência + Google Books API para metadados.
"""

import os           # Para ler variáveis de ambiente (credenciais, chaves de API)
import uuid         # Para gerar IDs únicos universais (UUID v4) para cada livro
import unicodedata  # Para remover acentos na normalização de strings (busca fuzzy)
from datetime import datetime, date  # Tipos de data/hora usados no sistema
from zoneinfo import ZoneInfo                  # Para trabalhar com fuso horário (Brasil)

import requests                    # Cliente HTTP para chamar a Google Books API
from google.cloud import bigquery  # Cliente oficial do BigQuery (banco de dados na nuvem)
from google.oauth2 import service_account  # Para autenticação via arquivo de service account


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


def _client() -> bigquery.Client:
    """Cria e retorna um cliente BigQuery autenticado.

    Tenta autenticar via GOOGLE_APPLICATION_CREDENTIALS (arquivo JSON do
    service account). Se a variável não estiver definida, cai para o ADC
    (Application Default Credentials) — útil em desenvolvimento local com
    `gcloud auth application-default login`.

    Diferente da Nami (que usa GCP_CREDENTIALS_JSON com o conteúdo do JSON),
    aqui usamos o caminho do arquivo — padrão do Google SDK.
    """
    # Lê o caminho do arquivo de credenciais do service account
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")

    project = _project()  # ID do projeto GCP (ex.: "projetos-448301")

    if creds_path:
        # Carrega as credenciais do arquivo de service account no caminho indicado.
        # O escopo 'bigquery' limita o acesso apenas ao BigQuery (menor privilégio).
        creds = service_account.Credentials.from_service_account_file(
            creds_path,
            scopes=["https://www.googleapis.com/auth/bigquery"],
        )
        # Cria o cliente com credenciais explícitas e o projeto correto
        return bigquery.Client(project=project, credentials=creds)
    else:
        # Sem arquivo de credenciais: usa ADC (funciona quando já autenticado via gcloud)
        return bigquery.Client(project=project)


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
    """Normaliza uma string para busca fuzzy: minúsculas, sem acentos, sem espaços extras.

    Usa decomposição NFD (Normalization Form Decomposition) para separar os
    caracteres base dos diacríticos (acentos). Por exemplo, "ã" é decomposto
    em "a" + til combinante (categoria Unicode "Mn"). Em seguida, filtramos
    apenas os caracteres que NÃO são marcas combinantes (Mn), descartando
    os acentos e ficando só com as letras base.

    Isso permite que "Duna", "duna" e "Düna" sejam tratados como iguais numa busca.
    """
    # strip() remove espaços nas bordas; lower() deixa tudo minúsculo
    s = s.strip().lower()

    # NFD decompõe caracteres acentuados em letra base + acento separado
    nfd = unicodedata.normalize("NFD", s)

    # Mantém apenas caracteres que NÃO são marcas combinantes (acentos, cedilhas, etc.)
    # unicodedata.category(c) == "Mn" identifica uma "Mark, Nonspacing" (acento solto)
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn")


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


def _find_book_by_query(query: str) -> dict | None:
    """Busca um livro na tabela books por título ou autor usando correspondência parcial.

    Prioriza livros com status 'lendo' no topo dos resultados — quando o usuário
    diz "atualize meu livro atual", é quase sempre o que está lendo agora.
    Retorna o primeiro resultado 'lendo' se existir, caso contrário o mais recente.

    Parâmetros:
        query — Texto de busca (título parcial, nome do autor, etc.)

    Retorna:
        Dicionário com os dados do livro encontrado, ou None se não encontrar nada.
    """
    # Normaliza a query para busca case-insensitive sem acentos
    norm_query = _norm(query)

    # Padrão LIKE com % nas duas pontas para correspondência parcial
    # Ex.: "duna" casa com "Duna", "A Saga de Duna", "Duna: Messias"
    like_pattern = f"%{norm_query}%"

    # Busca por título OU autor — LOWER() no SQL para ignorar maiúsculas/minúsculas
    # ORDER BY: status 'lendo' primeiro (CASE retorna 0), depois por data de atualização
    # Isso garante que o livro em leitura atual apareça antes de livros já lidos
    sql = f"""
        SELECT *
        FROM `{_table("books")}`
        WHERE (LOWER(title) LIKE @query OR LOWER(author) LIKE @query)
        ORDER BY
            CASE WHEN status = 'lendo' THEN 0 ELSE 1 END ASC,
            updated_at DESC
        LIMIT 5
    """

    params = [
        bigquery.ScalarQueryParameter("query", "STRING", like_pattern),
    ]

    rows = _run_select(sql, params)

    if not rows:
        # Nenhum livro encontrado com esse termo de busca
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

    Restringe a busca a livros em português (langRestrict="pt") porque o
    usuário lê principalmente em PT-BR — evita poluir resultados com edições
    estrangeiras do mesmo título. Para livros em inglês, o usuário pode
    especificar explicitamente o título em inglês.

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
        "langRestrict": "pt",          # Restringe ao português para relevância pessoal
    }

    # Adiciona a chave de API se disponível — aumenta o limite de requisições diárias
    # Sem a chave, o limite padrão é ~1000 req/dia (suficiente para uso pessoal)
    api_key = os.environ.get("GOOGLE_BOOKS_API_KEY", "")
    if api_key:
        request_params["key"] = api_key

    try:
        # Faz a requisição GET para a API com timeout de 10 segundos
        response = requests.get(_BOOKS_API_URL, params=request_params, timeout=10)
        response.raise_for_status()  # Lança exceção se o status HTTP for erro (4xx/5xx)
        data = response.json()
    except requests.RequestException:
        # Qualquer erro de rede ou HTTP — retorna lista vazia sem quebrar o agente
        return []

    # 'items' pode estar ausente se a API não encontrou nenhum resultado
    items = data.get("items", [])

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

def search_book(query: str) -> str:
    """
    Busca livros na Google Books API pelo título, autor ou ISBN.
    Use antes de add_book para confirmar o google_books_id do livro correto.
    """
    # Chama o helper privado para buscar até 5 resultados na Google Books API
    results = _fetch_google_books(query, max_results=5)

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


def log_reading(
    book_query: str,
    current_page: int,
    session_notes: str | None = None,
    log_date: str | None = None,
) -> str:
    """
    Registra o progresso de leitura de um livro.
    'Li o Duna até a página 80' → loga a sessão calculando delta desde o último registro.

    Parâmetros:
        book_query    — Título parcial ou completo do livro (ex: "Duna", "Harry Potter")
        current_page  — Página atual do leitor após a sessão de leitura
        session_notes — Anotações opcionais sobre a sessão (impressões, citações, etc.)
        log_date      — Data da leitura no formato YYYY-MM-DD (padrão: hoje)
    """

    # ── 1. Localiza o livro pelo termo de busca ───────────────────────────────
    # Usamos _find_book_by_query para fazer busca fuzzy (ignora acentos, maiúsculas).
    # O livro precisa estar cadastrado antes de poder registrar progresso —
    # não queremos criar livros implicitamente para evitar inconsistências de dados.
    book = _find_book_by_query(book_query)
    if book is None:
        return (
            f"Nenhum livro encontrado para '<b>{book_query}</b>'. "
            "Adicione o livro ao catálogo primeiro com o comando de adicionar livro."
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
