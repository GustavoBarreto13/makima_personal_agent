"""Infraestrutura compartilhada da memória unificada da Kurisu (spec 028).

Reúne os acessos externos que o sync (e a criação do corpus) precisam:
- inicialização do Vertex AI (singleton por processo),
- garantia do **corpus operacional SEPARADO** (Serverless mode) — distinto do corpus da
  wiki da 027, para que o `--recreate` da wiki nunca destrua os dados operacionais,
- conexão **somente leitura** ao PostgreSQL (FR-002),
- cliente do Google Cloud Storage (espelho dos documentos antes de importar).

A lógica delicada de Serverless mode (habilitar Vector Search API, trocar o engine,
criar corpus com retry) é **reusada** do ingester da 027 (`scripts/setup_kurisu_rag.py`)
— é a mesma infra GCP, não vale duplicar.

Usage:
    from agents.kurisu.memory import store
    corpus = store.ensure_corpus_operacional()   # cria/encontra e retorna o resource name
"""

import json
import os

# Driver síncrono do PostgreSQL (padrão do projeto para as tools — Princípio de Arch.).
import psycopg2

# SDK do Vertex AI (módulo preview, que expõe o Serverless mode — ver store da 027).
import vertexai
from vertexai.preview import rag

# Credenciais e cliente GCS (mesmo padrão do resto do projeto: JSON via env var).
from google.oauth2 import service_account
from google.cloud import storage

# Reusa a infra de Serverless/criação de corpus do ingester da 027 (mesma infra GCP).
# Importar este módulo NÃO roda a ingestão (o main() está protegido por __main__).
from scripts.setup_kurisu_rag import (
    _ensure_vector_search_api,
    _ensure_serverless_mode,
    _find_corpus,
    _create_corpus_with_retry,
    DEFAULT_LOCATION,
    DEFAULT_EMBEDDING_MODEL,
)

# Escopo OAuth necessário para Vertex AI + GCS.
_CLOUD_SCOPE = ["https://www.googleapis.com/auth/cloud-platform"]

# Nome de exibição do corpus operacional — a "chave" estável para encontrá-lo.
# É DIFERENTE do corpus da wiki ("kurisu-karpathy-wiki") — corpora separados de propósito.
DISPLAY_NAME_OPERACIONAL = "kurisu-memoria-operacional"

# Estado singleton: credenciais e flag de init, para não reinicializar a cada chamada.
_credentials: "service_account.Credentials | None" = None
_vertex_ready = False


def _load_credentials() -> "service_account.Credentials":
    """Constrói as credenciais da service account a partir de GCP_CREDENTIALS_JSON.

    Returns:
        Credenciais com o escopo cloud-platform aplicado.

    Raises:
        EnvironmentError: Se GCP_CREDENTIALS_JSON não estiver definida.
    """
    creds_json = os.environ.get("GCP_CREDENTIALS_JSON", "")
    if not creds_json:
        raise EnvironmentError("GCP_CREDENTIALS_JSON não definida (memória da Kurisu).")
    return service_account.Credentials.from_service_account_info(
        json.loads(creds_json)
    ).with_scopes(_CLOUD_SCOPE)


def init_vertexai() -> "service_account.Credentials":
    """Inicializa o Vertex AI uma vez por processo e devolve as credenciais.

    Returns:
        As credenciais da service account (reaproveitadas pelo cliente GCS).

    Raises:
        EnvironmentError: Se GCP_PROJECT_ID ou GCP_CREDENTIALS_JSON não estiverem definidas.
    """
    global _vertex_ready, _credentials
    if _vertex_ready and _credentials is not None:
        return _credentials

    project = os.environ.get("GCP_PROJECT_ID", "")
    if not project:
        raise EnvironmentError("GCP_PROJECT_ID não definida (memória da Kurisu).")

    _credentials = _load_credentials()
    vertexai.init(project=project, location=DEFAULT_LOCATION, credentials=_credentials)
    _vertex_ready = True
    return _credentials


def ensure_corpus_operacional() -> str:
    """Encontra ou cria o corpus operacional separado (Serverless) e retorna seu resource name.

    Idempotente: se o corpus já existe (mesmo display_name), só devolve o resource name.
    Se não existe, garante os pré-requisitos do Serverless mode (Vector Search API +
    engine em Serverless) e cria o corpus com o embedding multilíngue.

    Returns:
        O resource name do corpus operacional (use em VERTEX_RAG_CORPUS_OPERACIONAL).
    """
    creds = init_vertexai()
    project = os.environ["GCP_PROJECT_ID"]

    # Já existe? Reusa.
    existente = _find_corpus(DISPLAY_NAME_OPERACIONAL)
    if existente is not None:
        return existente.name

    # Não existe: garante o Serverless mode e cria o corpus (com retry pela propagação).
    _ensure_vector_search_api(creds, project)
    _ensure_serverless_mode(project, DEFAULT_LOCATION)
    corpus = _create_corpus_with_retry(DISPLAY_NAME_OPERACIONAL, DEFAULT_EMBEDDING_MODEL)
    return corpus.name


def pg_connect_readonly() -> "psycopg2.extensions.connection":
    """Abre uma conexão ao PostgreSQL em modo SOMENTE LEITURA.

    `set_session(readonly=True)` faz o próprio banco rejeitar qualquer escrita — uma
    garantia de defesa em profundidade para o FR-002 (a memória nunca altera a origem).
    `autocommit=True` porque só lemos (sem transações de escrita).

    Returns:
        Uma conexão psycopg2 read-only.

    Raises:
        KeyError: Se DATABASE_URL não estiver definida.
    """
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.set_session(readonly=True, autocommit=True)
    return conn


def gcs_bucket() -> "storage.Bucket":
    """Retorna o bucket GCS usado para espelhar os documentos da memória antes de importar.

    Reaproveita o mesmo bucket do ingester da 027 (`{project}-kurisu-rag`), só com um
    prefixo lógico diferente (definido no sync) para não misturar com a wiki.

    Returns:
        O objeto Bucket (não cria — assume que o bucket já existe, criado pela 027).
    """
    creds = init_vertexai()
    project = os.environ["GCP_PROJECT_ID"]
    client = storage.Client(project=project, credentials=creds)
    bucket_name = os.environ.get("KURISU_RAG_BUCKET", f"{project}-kurisu-rag")
    return client.bucket(bucket_name)
