"""Ingestão da Knowledge Base Karpathy no Vertex AI RAG Engine (corpus da Kurisu).

Este script "sobe" a sua wiki pessoal (a camada sintetizada `wiki/` do vault
Obsidian "Knowledge Base Karpathy") para um corpus do Vertex AI RAG Engine. É esse
corpus que a Kurisu consulta em runtime via `VertexAiRagRetrieval`
(ver `agents/kurisu/agent.py`).

Fluxo (de ponta a ponta):

    wiki/*.md (local, no Google Drive)  →  upload p/ um bucket GCS
                                        →  rag.import_files(gs://...)  →  RagCorpus
                                                                            ↑
                            Kurisu lê esse corpus via VertexAiRagRetrieval

Por que GCS no meio (e não importar direto do Google Drive): importar `.md` de
GCS é muito mais previsível, reusa a mesma service account/credenciais que o resto
do projeto já usa (BigQuery/backup) e não exige compartilhar a pasta do Drive com
a conta de serviço.

O que entra no corpus (decisão de escopo confirmada): SOMENTE a camada `wiki/`
(as 386 páginas sintetizadas: sources/concepts/entities/overviews) mais o
`index.md` da raiz. O diretório `raw/` (fontes brutas: lectures, transcripts) NÃO
é indexado — cada página-fonte do wiki já guarda `source_path: raw/...` no
frontmatter, então dá pra citar o material bruto sem precisar embeddá-lo.

Pré-requisitos (variáveis de ambiente — as mesmas do resto do projeto):
    GCP_CREDENTIALS_JSON  Conteúdo JSON da service account (como string, não path).
    GCP_PROJECT_ID        ID do projeto GCP (ex.: "projetos-448301").
    KURISU_WIKI_DIR       (opcional) Caminho local do vault. Default: o caminho no G:.
    KURISU_RAG_BUCKET     (opcional) Nome do bucket GCS. Default: "{project}-kurisu-rag".

A service account precisa ter os papéis IAM:
    - "Vertex AI User"        (roles/aiplatform.user)      — criar corpus / embeddings
    - "Storage Admin"         (roles/storage.admin)        — criar bucket e enviar objetos
      (ou no mínimo objectAdmin no bucket + permissão de criar bucket)
    - "Service Usage Admin"   (roles/serviceusage.serviceUsageAdmin) — habilitar a
      Vector Search API (vectorsearch.googleapis.com), usada pelo Serverless mode

Serverless mode (importante): projetos novos do GCP estão bloqueados do "Spanner mode"
(o modo padrão do RAG Engine) nas regiões us-central1/us-east1/us-east4 por limite de
capacidade. Este script resolve isso automaticamente: garante a Vector Search API
habilitada e troca o RAG Engine do projeto para Serverless mode antes de criar o corpus.
Em Serverless mode o vector database é o RagManagedVertexVectorSearch gerenciado (o
embedding multilíngue continua configurável). Trocar de modo não move nem apaga dados.

Uso:
    # 1ª vez — cria o corpus e importa tudo:
    python -m scripts.setup_kurisu_rag

    # Rebuild limpo (recria o corpus do zero — gera um NOVO id):
    python -m scripts.setup_kurisu_rag --recreate

    # Só listar o que seria enviado, sem tocar em nada na nuvem:
    python -m scripts.setup_kurisu_rag --dry-run

Ao final, o script imprime o "corpus resource name". Copie-o para a variável de
ambiente da Kurisu:

    VERTEX_RAG_CORPUS=projects/{PROJECT_ID}/locations/us-central1/ragCorpora/{ID}

Atenção ao refresh: o RAG Engine de-duplica por URI da fonte, então re-importar um
arquivo cujo conteúdo MUDOU (mas o nome continua igual) NÃO atualiza o chunk antigo.
Como a sua wiki é revisada o tempo todo, para refletir edições use `--recreate`
(rebuild limpo). Sem a flag, uma re-execução só ADICIONA páginas novas.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

# Credenciais a partir do JSON da service account (mesmo padrão do backup_postgres.py).
from google.oauth2 import service_account

# SDK do Vertex AI. Usamos o módulo PREVIEW (`vertexai.preview.rag`) e não o GA
# (`vertexai.rag`) porque só o preview expõe o **Serverless mode** do RAG Engine
# (a classe `Serverless` e o parâmetro `mode=` do `RagManagedDbConfig`). Projetos
# novos do GCP estão bloqueados do "Spanner mode" (o modo padrão do GA) nas regiões
# us-central1/us-east1/us-east4 por limite de capacidade — então criar corpus exige
# antes trocar o engine para Serverless mode. Ver _ensure_serverless_mode() abaixo.
import vertexai
from vertexai.preview import rag

# Cliente do Google Cloud Storage — usado para espelhar a wiki num bucket antes de importar.
from google.cloud import storage

# Cliente da Service Usage API — usado para habilitar a Vector Search API
# (vectorsearch.googleapis.com), que o Serverless mode usa como vector database.
from googleapiclient.discovery import build


# ---------------------------------------------------------------------------
# Configuração / constantes
# ---------------------------------------------------------------------------

# Região onde o corpus e os embeddings vivem. O agente da Kurisu espera us-central1
# (ver o formato do resource name em agents/kurisu/agent.py).
DEFAULT_LOCATION = "us-central1"

# Nome de exibição do corpus. É a "chave" estável que usamos para encontrar um
# corpus já existente (em vez de criar duplicado a cada execução).
DEFAULT_DISPLAY_NAME = "kurisu-karpathy-wiki"

# Modelo de embedding. ESCOLHA IMPORTANTE: a wiki é mista (PT/EN/JA), então usamos
# o modelo MULTILÍNGUE. O text-embedding-005 é focado em inglês e degradaria a
# busca em português/japonês.
DEFAULT_EMBEDDING_MODEL = "text-multilingual-embedding-002"

# Caminho local default do vault (Google Drive sincronizado no Windows).
DEFAULT_WIKI_DIR = r"G:\Meu Drive\Backups\Obsidian\Knowledge Base Karpathy"

# Prefixo (pasta lógica) dentro do bucket onde a wiki é espelhada.
DEFAULT_PREFIX = "kurisu-wiki"

# Parâmetros de chunking. Páginas do wiki são curtas e auto-contidas (~4 KB cada),
# então um chunk de 512 tokens com 100 de sobreposição mantém o conceito coeso.
DEFAULT_CHUNK_SIZE = 512
DEFAULT_CHUNK_OVERLAP = 100

# Escopo OAuth necessário para falar com Vertex AI e GCS com a service account.
_CLOUD_SCOPE = ["https://www.googleapis.com/auth/cloud-platform"]


# ---------------------------------------------------------------------------
# Credenciais e inicialização dos clientes
# ---------------------------------------------------------------------------

def _load_credentials() -> service_account.Credentials:
    """Constrói as credenciais da service account a partir da env var GCP_CREDENTIALS_JSON.

    Returns:
        Credenciais já com o escopo cloud-platform aplicado.

    Raises:
        EnvironmentError: Se GCP_CREDENTIALS_JSON não estiver definida ou for inválida.
    """
    # Lê o JSON da service account como string (não é um path — é o conteúdo inteiro).
    creds_json = os.environ.get("GCP_CREDENTIALS_JSON", "")
    if not creds_json:
        raise EnvironmentError(
            "GCP_CREDENTIALS_JSON não definida. Exporte o JSON da service account "
            "(o mesmo usado pelo BigQuery/backup) antes de rodar."
        )
    try:
        # Transforma a string JSON num dicionário Python.
        creds_info = json.loads(creds_json)
    except json.JSONDecodeError as exc:
        raise EnvironmentError(f"GCP_CREDENTIALS_JSON não é um JSON válido: {exc}") from exc

    # Cria o objeto de credenciais e anexa o escopo cloud-platform (exigido pela
    # API do Vertex AI e do Storage).
    return service_account.Credentials.from_service_account_info(creds_info).with_scopes(
        _CLOUD_SCOPE
    )


# ---------------------------------------------------------------------------
# Coleta dos arquivos locais da wiki
# ---------------------------------------------------------------------------

def _collect_wiki_files(wiki_dir: Path) -> list[tuple[Path, str]]:
    """Lista os arquivos da wiki que devem ir para o corpus.

    Inclui todos os `.md` sob `wiki/` (recursivamente) mais o `index.md` da raiz.
    Exclui deliberadamente `raw/`, `log.md`, `.obsidian`, `.trash`, `.git` etc.

    Args:
        wiki_dir: Caminho da raiz do vault "Knowledge Base Karpathy".

    Returns:
        Lista de tuplas (caminho_local, caminho_relativo_posix). O caminho relativo
        preserva a estrutura (ex.: "wiki/concepts/bm25-ranking.md") para manter a
        proveniência clara no bucket e no corpus.

    Raises:
        FileNotFoundError: Se o diretório da wiki não existir.
    """
    if not wiki_dir.is_dir():
        raise FileNotFoundError(
            f"Diretório da wiki não encontrado: {wiki_dir}. "
            "Confirme se o Google Drive está sincronizado ou passe --wiki-dir."
        )

    arquivos: list[tuple[Path, str]] = []

    # 1) Todos os markdown dentro de wiki/ (sources, concepts, entities, overviews).
    wiki_layer = wiki_dir / "wiki"
    if wiki_layer.is_dir():
        # rglob("*.md") percorre recursivamente todas as subpastas procurando .md.
        for md in sorted(wiki_layer.rglob("*.md")):
            # as_posix() normaliza as barras para "/" (o GCS usa "/" como separador).
            rel = md.relative_to(wiki_dir).as_posix()
            arquivos.append((md, rel))

    # 2) O index.md da raiz — é o mapa de navegação da wiki, útil para a busca.
    index_md = wiki_dir / "index.md"
    if index_md.is_file():
        arquivos.append((index_md, "index.md"))

    return arquivos


# ---------------------------------------------------------------------------
# Espelhamento da wiki no GCS
# ---------------------------------------------------------------------------

def _ensure_bucket(
    storage_client: storage.Client, bucket_name: str, location: str
) -> storage.Bucket:
    """Garante que o bucket GCS exista (cria se necessário) e o retorna.

    Args:
        storage_client: Cliente GCS autenticado.
        bucket_name: Nome global do bucket.
        location: Região do bucket (ex.: "us-central1").

    Returns:
        O bucket pronto para uso.
    """
    # lookup_bucket retorna o bucket se ele existir, ou None se não existir.
    bucket = storage_client.lookup_bucket(bucket_name)
    if bucket is not None:
        print(f"  • Bucket já existe: gs://{bucket_name}")
        return bucket

    # Cria o bucket na mesma região do corpus para reduzir latência/custo de egress.
    print(f"  • Criando bucket gs://{bucket_name} em {location} ...")
    return storage_client.create_bucket(bucket_name, location=location)


def _sync_to_gcs(
    storage_client: storage.Client,
    bucket: storage.Bucket,
    prefix: str,
    arquivos: list[tuple[Path, str]],
) -> str:
    """Espelha os arquivos da wiki no bucket, sob `prefix`, e retorna a URI gs://.

    Antes de enviar, apaga tudo que já estava sob o prefixo — assim o espelho no
    GCS reflete EXATAMENTE a wiki atual (páginas deletadas somem do espelho).

    Args:
        storage_client: Cliente GCS autenticado.
        bucket: Bucket de destino.
        prefix: Pasta lógica dentro do bucket (ex.: "kurisu-wiki").
        arquivos: Lista (caminho_local, caminho_relativo) vinda de _collect_wiki_files.

    Returns:
        A URI gs:// do prefixo, pronta para passar ao rag.import_files.
    """
    # --- Limpa o prefixo antigo (mantém o espelho em sincronia com a wiki atual) ---
    # list_blobs com prefix lista todos os objetos cujo nome começa com "prefix/".
    antigos = list(storage_client.list_blobs(bucket, prefix=f"{prefix}/"))
    if antigos:
        print(f"  • Limpando {len(antigos)} objeto(s) antigo(s) sob {prefix}/ ...")
        # delete_blobs apaga em lote (mais rápido que um a um).
        bucket.delete_blobs(antigos)

    # --- Envia cada arquivo da wiki ---
    print(f"  • Enviando {len(arquivos)} arquivo(s) para gs://{bucket.name}/{prefix}/ ...")
    for i, (caminho_local, rel) in enumerate(arquivos, start=1):
        # O nome do objeto no bucket = prefixo + caminho relativo (preserva estrutura).
        blob = bucket.blob(f"{prefix}/{rel}")
        # content_type explícito ajuda o RAG Engine a tratar como markdown/texto.
        blob.upload_from_filename(str(caminho_local), content_type="text/markdown")
        # Feedback de progresso a cada 50 arquivos para não poluir o terminal.
        if i % 50 == 0 or i == len(arquivos):
            print(f"      {i}/{len(arquivos)} enviados")

    return f"gs://{bucket.name}/{prefix}"


# ---------------------------------------------------------------------------
# Pré-requisitos do Serverless mode (API + engine config)
# ---------------------------------------------------------------------------

def _ensure_vector_search_api(
    credentials: service_account.Credentials, project_id: str
) -> None:
    """Garante que a Vector Search API (vectorsearch.googleapis.com) esteja habilitada.

    O Serverless mode armazena os vetores no RagManagedVertexVectorSearch, que é
    backed pela Vector Search API. Em projetos que nunca a usaram, criar o corpus
    falha com 403 até a API ser habilitada. Esta função habilita de forma idempotente
    (se já estiver ENABLED, não faz nada).

    Args:
        credentials: Credenciais da service account (escopo cloud-platform).
        project_id: ID do projeto GCP.

    Raises:
        EnvironmentError: Se a service account não tiver permissão para habilitar a API.
    """
    # Service Usage API permite consultar e habilitar APIs do projeto programaticamente.
    su = build("serviceusage", "v1", credentials=credentials)
    service = f"projects/{project_id}/services/vectorsearch.googleapis.com"

    # Primeiro consultamos o estado atual para evitar uma chamada de enable desnecessária.
    estado = su.services().get(name=service).execute()
    if estado.get("state") == "ENABLED":
        print("  • Vector Search API já habilitada.")
        return

    # Não habilitada ainda: dispara o enable (operação assíncrona do lado do Google).
    print("  • Habilitando Vector Search API (vectorsearch.googleapis.com) ...")
    su.services().enable(name=service).execute()
    print("    (a propagação pode levar 1-2 min; a criação do corpus tem retry)")


def _ensure_serverless_mode(project_id: str, location: str) -> None:
    """Garante que o RAG Engine do projeto esteja em Serverless mode (idempotente).

    Projetos novos do GCP estão bloqueados do "Spanner mode" (modo padrão) nas regiões
    us-central1/us-east1/us-east4. O Serverless mode é o caminho recomendado e não tem
    essa restrição. Trocar de modo NÃO move nem apaga dados — os dois modos são isolados.

    Args:
        project_id: ID do projeto GCP.
        location: Região do RAG Engine (ex.: "us-central1").
    """
    # O ragEngineConfig é um recurso singleton por projeto/região.
    engine_name = f"projects/{project_id}/locations/{location}/ragEngineConfig"

    # Lê o config atual para decidir se já está em Serverless (evita update redundante).
    try:
        atual = rag.get_rag_engine_config(name=engine_name)
        # O modo fica em rag_managed_db_config.mode; em Serverless é uma instância Serverless.
        modo = getattr(getattr(atual, "rag_managed_db_config", None), "mode", None)
        if isinstance(modo, rag.Serverless):
            print("  • RAG Engine já está em Serverless mode.")
            return
    except Exception:
        # Se a leitura falhar, seguimos para o update (que é a ação corretiva mesmo).
        pass

    print("  • Trocando o RAG Engine para Serverless mode ...")
    rag.update_rag_engine_config(
        rag_engine_config=rag.RagEngineConfig(
            name=engine_name,
            rag_managed_db_config=rag.RagManagedDbConfig(mode=rag.Serverless()),
        )
    )
    print("    (Serverless mode ativado — usa RagManagedVertexVectorSearch)")


# ---------------------------------------------------------------------------
# Corpus do Vertex AI RAG
# ---------------------------------------------------------------------------

def _find_corpus(display_name: str):
    """Procura um corpus existente pelo display_name.

    Args:
        display_name: Nome de exibição usado na criação.

    Returns:
        O objeto RagCorpus se encontrado, ou None.
    """
    # list_corpora retorna todos os corpora do projeto/região inicializados em vertexai.init.
    for corpus in rag.list_corpora():
        if corpus.display_name == display_name:
            return corpus
    return None


def _create_corpus(display_name: str, embedding_model: str):
    """Cria um corpus novo (em Serverless mode) com o modelo de embedding especificado.

    Em Serverless mode o vector database é sempre o `RagManagedVertexVectorSearch`
    gerenciado (não dá para escolher RagManagedDb). O modelo de embedding, porém,
    continua configurável — e passamos o multilíngue via o parâmetro
    `embedding_model_config` (classe `EmbeddingModelConfig`).

    IMPORTANTE: NÃO use `backend_config=RagVectorDbConfig(rag_embedding_model_config=...)`
    aqui — em Serverless mode esse caminho dispara um bug do SDK
    ("'RagEmbeddingModelConfig' object has no attribute 'publisher_model'"). O caminho
    correto é o parâmetro separado `embedding_model_config`.

    Args:
        display_name: Nome de exibição do corpus.
        embedding_model: ID curto do modelo (ex.: "text-multilingual-embedding-002").

    Returns:
        O RagCorpus recém-criado.
    """
    print(f"  • Criando corpus '{display_name}' em Serverless mode (embedding: {embedding_model}) ...")
    # embedding_model_config aponta para o publisher model do Vertex.
    # O vector_db fica implícito como RagManagedVertexVectorSearch (default do serverless).
    return rag.create_corpus(
        display_name=display_name,
        embedding_model_config=rag.EmbeddingModelConfig(
            publisher_model=f"publishers/google/models/{embedding_model}"
        ),
    )


def _create_corpus_with_retry(display_name: str, embedding_model: str, tentativas: int = 5):
    """Cria o corpus com retry — a Vector Search API recém-habilitada leva tempo a propagar.

    Logo após habilitar `vectorsearch.googleapis.com`, o `create_corpus` pode falhar com
    403 (PERMISSION_DENIED / "API has not been used... or it is disabled") por 1-2 minutos
    até a permissão propagar. Tentamos algumas vezes com espera entre elas.

    Args:
        display_name: Nome de exibição do corpus.
        embedding_model: ID curto do modelo de embedding.
        tentativas: Número máximo de tentativas antes de desistir.

    Returns:
        O RagCorpus criado.

    Raises:
        Exception: A última exceção, se todas as tentativas falharem.
    """
    ultimo_erro: Exception | None = None
    for i in range(1, tentativas + 1):
        try:
            return _create_corpus(display_name, embedding_model)
        except Exception as exc:  # noqa: BLE001 — queremos capturar qualquer falha transitória
            ultimo_erro = exc
            # 403 enquanto a API propaga é o caso esperado; outros erros também ganham retry
            # (são poucas tentativas e o custo de re-tentar é baixo).
            espera = 45
            print(f"    tentativa {i}/{tentativas} falhou ({str(exc)[:120]})")
            if i < tentativas:
                print(f"    aguardando {espera}s para propagação da API e re-tentando ...")
                time.sleep(espera)
    # Esgotou as tentativas: propaga o último erro para o chamador.
    raise ultimo_erro  # type: ignore[misc]


def _import_files(corpus_name: str, gcs_uri: str, chunk_size: int, chunk_overlap: int) -> int:
    """Importa os arquivos do prefixo GCS para o corpus (chunking + embeddings).

    Args:
        corpus_name: Resource name do corpus de destino.
        gcs_uri: URI gs:// do prefixo onde a wiki foi espelhada.
        chunk_size: Nº de tokens por chunk.
        chunk_overlap: Nº de tokens de sobreposição entre chunks vizinhos.

    Returns:
        Quantidade de arquivos efetivamente importados.
    """
    print(f"  • Importando de {gcs_uri} (chunk={chunk_size}/{chunk_overlap}) ...")
    print("    (isso pode levar alguns minutos — o Vertex faz chunking + embeddings)")
    # import_files é síncrono: bloqueia até o processamento terminar.
    resposta = rag.import_files(
        corpus_name=corpus_name,
        paths=[gcs_uri],
        transformation_config=rag.TransformationConfig(
            rag.ChunkingConfig(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        ),
        # Limita a taxa de requisições de embedding para não estourar quota.
        max_embedding_requests_per_min=900,
    )
    return resposta.imported_rag_files_count


# ---------------------------------------------------------------------------
# Orquestração principal
# ---------------------------------------------------------------------------

def main() -> int:
    """Ponto de entrada: faz o parse dos argumentos e roda a ingestão.

    Returns:
        Código de saída do processo (0 = sucesso).
    """
    parser = argparse.ArgumentParser(
        description="Sobe a Knowledge Base Karpathy (camada wiki/) para o Vertex AI RAG."
    )
    parser.add_argument(
        "--wiki-dir",
        default=os.environ.get("KURISU_WIKI_DIR", DEFAULT_WIKI_DIR),
        help="Caminho local da raiz do vault (default: o caminho no G: ou $KURISU_WIKI_DIR).",
    )
    parser.add_argument(
        "--bucket",
        default=os.environ.get("KURISU_RAG_BUCKET", ""),
        help="Nome do bucket GCS (default: '{GCP_PROJECT_ID}-kurisu-rag').",
    )
    parser.add_argument("--prefix", default=DEFAULT_PREFIX, help="Prefixo no bucket.")
    parser.add_argument("--display-name", default=DEFAULT_DISPLAY_NAME, help="Nome do corpus.")
    parser.add_argument("--location", default=DEFAULT_LOCATION, help="Região GCP.")
    parser.add_argument(
        "--embedding-model", default=DEFAULT_EMBEDDING_MODEL, help="Modelo de embedding."
    )
    parser.add_argument("--chunk-size", type=int, default=DEFAULT_CHUNK_SIZE)
    parser.add_argument("--chunk-overlap", type=int, default=DEFAULT_CHUNK_OVERLAP)
    parser.add_argument(
        "--recreate",
        action="store_true",
        help="Apaga o corpus existente (mesmo display-name) e cria um novo — rebuild limpo. "
        "Gera um NOVO corpus id (atualize VERTEX_RAG_CORPUS depois).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Só lista os arquivos que seriam enviados; não toca em GCS nem Vertex.",
    )
    args = parser.parse_args()

    # --- Resolve configuração que depende do ambiente ---
    project_id = os.environ.get("GCP_PROJECT_ID", "")
    if not project_id:
        print("ERRO: GCP_PROJECT_ID não definida.", file=sys.stderr)
        return 1

    # Bucket default depende do projeto (nomes de bucket são globais e únicos).
    bucket_name = args.bucket or f"{project_id}-kurisu-rag"
    wiki_dir = Path(args.wiki_dir)

    # --- Coleta dos arquivos locais (não precisa de credencial nenhuma) ---
    print("→ Coletando arquivos da wiki ...")
    arquivos = _collect_wiki_files(wiki_dir)
    print(f"  • {len(arquivos)} arquivo(s) selecionado(s) (camada wiki/ + index.md)")

    # No modo dry-run, só mostramos uma amostra e paramos antes de qualquer ação na nuvem.
    if args.dry_run:
        print("\n[dry-run] Amostra dos arquivos que seriam enviados:")
        for _, rel in arquivos[:10]:
            print(f"    {rel}")
        if len(arquivos) > 10:
            print(f"    ... (+{len(arquivos) - 10})")
        print(f"\n[dry-run] Bucket destino: gs://{bucket_name}/{args.prefix}")
        print(f"[dry-run] Corpus: '{args.display_name}' em {project_id}/{args.location}")
        return 0

    if not arquivos:
        print("ERRO: nenhum arquivo encontrado para ingerir.", file=sys.stderr)
        return 1

    # --- Autenticação e init dos clientes (a partir daqui acessamos a nuvem) ---
    print("→ Autenticando na GCP ...")
    credentials = _load_credentials()
    # vertexai.init configura projeto/região/credenciais para todas as chamadas rag.*
    vertexai.init(project=project_id, location=args.location, credentials=credentials)
    storage_client = storage.Client(project=project_id, credentials=credentials)

    # --- Espelha a wiki no GCS ---
    print("→ Espelhando a wiki no Google Cloud Storage ...")
    bucket = _ensure_bucket(storage_client, bucket_name, args.location)
    gcs_uri = _sync_to_gcs(storage_client, bucket, args.prefix, arquivos)

    # --- Pré-requisitos do Serverless mode ---
    # Projetos novos não conseguem criar corpus em Spanner mode (us-central1 et al.),
    # então garantimos: (1) a Vector Search API habilitada e (2) o engine em Serverless.
    print("→ Preparando o Serverless mode do RAG Engine ...")
    _ensure_vector_search_api(credentials, project_id)
    _ensure_serverless_mode(project_id, args.location)

    # --- Resolve o corpus (reusa, recria ou cria novo) ---
    print("→ Preparando o corpus do Vertex AI RAG ...")
    corpus = _find_corpus(args.display_name)

    if corpus is not None and args.recreate:
        # Rebuild limpo: apaga o corpus inteiro (1 chamada) e recria do zero.
        print(f"  • --recreate: apagando corpus existente {corpus.name}")
        rag.delete_corpus(name=corpus.name)
        corpus = None

    if corpus is None:
        # Retry com backoff: a Vector Search API recém-habilitada pode levar 1-2 min
        # para propagar; até lá, create_corpus falha com 403. Tentamos algumas vezes.
        corpus = _create_corpus_with_retry(args.display_name, args.embedding_model)
    else:
        print(f"  • Reusando corpus existente: {corpus.name}")
        print("    (re-importação só ADICIONA páginas novas; para refletir edições use --recreate)")

    # --- Importa os arquivos (chunking + embeddings no Vertex) ---
    print("→ Importando para o corpus ...")
    n = _import_files(corpus.name, gcs_uri, args.chunk_size, args.chunk_overlap)

    # --- Resumo final ---
    print("\n✅ Ingestão concluída.")
    print(f"   Arquivos importados nesta execução: {n}")
    print(f"   Corpus resource name:\n   {corpus.name}")
    print("\n   Configure a env var da Kurisu (e redeploy no Dokploy):")
    print(f"   VERTEX_RAG_CORPUS={corpus.name}")
    return 0


if __name__ == "__main__":
    # sys.exit propaga o código de saída para o shell (0 = ok, !=0 = erro).
    sys.exit(main())
