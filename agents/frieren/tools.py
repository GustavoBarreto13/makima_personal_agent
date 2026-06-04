"""
Tools do agente Frieren — rastreamento de leitura pessoal.
BigQuery para persistência + Google Books API para metadados.
"""

import os           # Para ler variáveis de ambiente (credenciais, chaves de API)
import uuid         # Para gerar IDs únicos para cada livro registrado
import unicodedata  # Para remover acentos na normalização de strings (busca fuzzy)
from datetime import datetime, timezone, date  # Tipos de data/hora usados no sistema
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
