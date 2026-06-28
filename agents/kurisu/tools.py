"""Tools da Kurisu — assistente de base de conhecimento pessoal.

Expõe a FunctionTool `buscar_na_base`, que consulta o corpus Vertex AI RAG
da Knowledge Base Karpathy e aplica o reranker RankService para ordenar os
resultados por relevância semântica.

Por que não usar a VertexAiRagRetrieval nativa do ADK: a tool nativa não expõe
o parâmetro `ranking` (RagRetrievalConfig com RankService), então o padrão
retrieve-wide → rerank-narrow (FR-016 da spec 027) fica inviável. Esta FunctionTool
chama diretamente o SDK `vertexai.rag.retrieval_query` e passa o RagRetrievalConfig
completo — habilitando o reranker sem nenhum servidor extra.

Usage:
    from agents.kurisu.tools import buscar_na_base
    # Passada diretamente para o agente: tools=[buscar_na_base]
"""

import json
import logging
import os
import posixpath

# Credenciais OAuth2 a partir do JSON da service account.
# Mesmo padrão de autenticação do setup_kurisu_rag.py e do backup_postgres.py:
# o JSON inteiro vem de uma variável de ambiente (não de um arquivo em disco).
from google.oauth2 import service_account

# SDK principal do Google Cloud AI para o Vertex AI RAG Engine.
# `vertexai` inicializa o projeto/credenciais e `rag` expõe as funções de corpus.
import vertexai
from vertexai import rag

# Logger padrão do Python — erros de rede/Vertex aparecem nos logs do container
# mas nunca chegam como stack trace ao usuário (requisito FR-009 da spec 027).
logger = logging.getLogger(__name__)

# Escopo OAuth exigido pelo Vertex AI e pelo Cloud Storage.
# "cloud-platform" dá acesso completo às APIs GCP com a service account.
_CLOUD_SCOPE = ["https://www.googleapis.com/auth/cloud-platform"]

# Quantos candidatos buscar na fase "retrieve-wide" (antes do reranker).
# Um valor mais alto aumenta o recall mas também o custo de reranking.
# Configurável via env var para ajuste fino sem redeploy.
_TOP_K_WIDE = int(os.environ.get("KURISU_TOP_K_WIDE", "10"))

# Quantos trechos retornar ao agente após a fase "rerank-narrow".
# Deve ser ≤ _TOP_K_WIDE. Default 5 é suficiente para resposta típica via Telegram.
_TOP_N_NARROW = int(os.environ.get("KURISU_TOP_N_NARROW", "5"))

# Limiar de relevância do reranker. Trechos com score abaixo desse valor são
# descartados → status "vazio", que aciona a honestidade da Kurisu (US2 / FR-004).
# 0.0 como default significa: aceita qualquer resultado positivo do reranker.
# Se muitos trechos fracos estiverem passando, aumente este valor (ex.: 0.1 ou 0.3).
_RELEVANCE_THRESHOLD = float(os.environ.get("KURISU_RELEVANCE_THRESHOLD", "0.0"))

# Controla se o vertexai.init já foi chamado neste processo.
# Inicializar mais de uma vez por processo é desnecessário (e lento):
# a primeira chamada configura projeto/credenciais globalmente no SDK.
_vertexai_initialized = False


def _derivar_fonte(source_display_name: str, source_uri: str) -> str:
    """Deriva um nome de fonte legível para citação a partir dos metadados do trecho.

    Em Serverless mode (RagManagedVertexVectorSearch), o `source_display_name` retornado
    pelo retrieval costuma vir vazio — mas o `source_uri` traz o caminho completo do
    arquivo no GCS (ex.: "gs://bucket/kurisu-wiki/wiki/concepts/ansiedade.md"). Quando o
    display name está vazio, extraímos o nome do arquivo do URI para a Kurisu citar a
    página real (sustenta FR-002/FR-003 e SC-009: citações resolvem para arquivo real).

    Args:
        source_display_name: O display name retornado pelo Vertex (pode ser vazio).
        source_uri: A URI gs:// do arquivo de origem (pode ser vazia em casos raros).

    Returns:
        O nome do arquivo da página (ex.: "ansiedade.md"), ou string vazia se não houver
        nenhuma informação de origem.

    Example:
        >>> _derivar_fonte("", "gs://b/kurisu-wiki/wiki/concepts/ansiedade.md")
        'ansiedade.md'
        >>> _derivar_fonte("bm25-ranking.md", "gs://b/...")
        'bm25-ranking.md'
    """
    # Se o Vertex já forneceu um display name, respeitamos — é o caminho ideal.
    if source_display_name:
        return source_display_name

    # Sem display name: extraímos o último segmento do caminho do URI (o nome do arquivo).
    # posixpath.basename usa "/" como separador (correto para URIs gs:// e caminhos GCS).
    if source_uri:
        return posixpath.basename(source_uri)

    # Nenhuma informação de origem disponível (caso raro/degenerado).
    return ""


def _init_vertexai() -> None:
    """Inicializa o SDK Vertex AI com as credenciais da service account (singleton).

    Lê GCP_CREDENTIALS_JSON (conteúdo JSON da service account como string) e
    GCP_PROJECT_ID do ambiente, constrói o objeto de credenciais e chama
    vertexai.init. As chamadas subsequentes são no-op (flag _vertexai_initialized).

    Raises:
        EnvironmentError: Se GCP_CREDENTIALS_JSON ou GCP_PROJECT_ID não estiverem
            definidas no ambiente.
        ValueError: Se GCP_CREDENTIALS_JSON não for um JSON válido.
    """
    # Usamos `global` para atualizar o flag singleton fora do escopo local.
    global _vertexai_initialized

    # Se já inicializamos neste processo, não fazemos nada — economia de CPU
    # e tempo (vertexai.init estabelece conexões/configurações internas).
    if _vertexai_initialized:
        return

    # Lê o JSON inteiro da service account como uma string (não é um path de arquivo).
    # Este é o padrão do projeto: GCP_CREDENTIALS_JSON contém o conteúdo do JSON,
    # que é passado para from_service_account_info sem escrever arquivo em disco.
    creds_json = os.environ.get("GCP_CREDENTIALS_JSON", "")
    if not creds_json:
        raise EnvironmentError(
            "GCP_CREDENTIALS_JSON não definida. "
            "A Kurisu não consegue se autenticar no Vertex AI RAG."
        )

    # GCP_PROJECT_ID identifica o projeto GCP onde o corpus reside.
    project_id = os.environ.get("GCP_PROJECT_ID", "")
    if not project_id:
        raise EnvironmentError(
            "GCP_PROJECT_ID não definida. "
            "Necessária para localizar o corpus Vertex AI RAG."
        )

    # Deserializa o JSON da service account para um dicionário Python.
    try:
        creds_info = json.loads(creds_json)
    except json.JSONDecodeError as exc:
        raise ValueError(f"GCP_CREDENTIALS_JSON não é um JSON válido: {exc}") from exc

    # Cria o objeto de credenciais e restringe ao escopo cloud-platform,
    # que é o escopo mínimo necessário para o Vertex AI RAG Engine.
    credentials = service_account.Credentials.from_service_account_info(
        creds_info
    ).with_scopes(_CLOUD_SCOPE)

    # Configura o SDK globalmente para este processo.
    # Todos os chamadas rag.* subsequentes usam este projeto/região/credenciais.
    # A região us-central1 é onde o corpus foi criado (ver setup_kurisu_rag.py).
    vertexai.init(project=project_id, location="us-central1", credentials=credentials)

    # Marca como inicializado para que chamadas futuras no mesmo processo sejam no-op.
    _vertexai_initialized = True


def buscar_na_base(query: str) -> dict:
    """Busca trechos relevantes na wiki curada (corpus Vertex AI RAG) e os reordena.

    Implementa o padrão retrieve-wide → rerank-narrow:
    1. Recupera _TOP_K_WIDE candidatos do corpus via embedding denso (busca vetorial).
    2. O reranker RankService (semantic-ranker-default-004) reordena por relevância
       semântica mais fina.
    3. Retorna os _TOP_N_NARROW melhores que superam _RELEVANCE_THRESHOLD.

    Esta função substitui a VertexAiRagRetrieval nativa do ADK (que não expõe o
    parâmetro ranking), habilitando o reranker sem servidor extra (FR-016/spec 027).

    Args:
        query: A pergunta ou consulta do usuário em linguagem natural.
            Aceita PT, EN e JA (embedding multilíngue text-multilingual-embedding-002).

    Returns:
        Um dict com três campos:

        - "status": "ok" quando há trechos relevantes; "vazio" quando nenhum trecho
          passa o limiar de relevância; "indisponivel" em caso de falha técnica ou
          corpus não configurado.
        - "trechos": lista de dicts com "texto", "fonte" (nome do arquivo .md),
          "uri" (gs://...) e "score" (float do reranker). Vazia se status != "ok".
        - "mensagem": string explicativa quando status != "ok", ou None quando "ok".

    Example:
        >>> resultado = buscar_na_base("O que é BM25?")
        >>> resultado["status"]
        'ok'
        >>> resultado["trechos"][0]["fonte"]
        'bm25-ranking.md'
    """
    # --- Passo 1: Verifica se o corpus está configurado ---
    # VERTEX_RAG_CORPUS deve ter o formato:
    #   projects/{PROJECT_ID}/locations/us-central1/ragCorpora/{CORPUS_ID}
    # O valor é preenchido após a ingestão (ver tasks.md T007 e setup_kurisu_rag.py).
    corpus_name = os.environ.get("VERTEX_RAG_CORPUS", "").strip()
    if not corpus_name:
        # Estado válido no v1: corpus ainda não indexado/configurado (FR-009).
        # A instrução da Kurisu lida com "indisponivel" de forma amigável,
        # sem travar nem inventar resposta.
        logger.warning("VERTEX_RAG_CORPUS não configurada — base Kurisu indisponível.")
        return {
            "status": "indisponivel",
            "trechos": [],
            "mensagem": "A base de conhecimento ainda não está configurada neste ambiente.",
        }

    try:
        # --- Passo 2: Inicializa o SDK Vertex AI (singleton na primeira chamada) ---
        _init_vertexai()

        # --- Passo 3: Consulta o corpus com retrieve-wide + reranker ---
        # RagRetrievalConfig une os dois estágios numa única chamada de API:
        #   - top_k: quantos candidatos recuperar na busca vetorial densa
        #   - ranking: qual modelo reordena os candidatos antes de retornar
        #
        # "semantic-ranker-default-004" é o RankService padrão do Vertex AI para PT/EN/JA.
        # Ele produz scores float — quanto maior, mais relevante o trecho.
        resultado = rag.retrieval_query(
            text=query,
            rag_resources=[
                # RagResource encapsula o resource name do corpus no formato esperado pela API.
                rag.RagResource(rag_corpus=corpus_name)
            ],
            rag_retrieval_config=rag.RagRetrievalConfig(
                top_k=_TOP_K_WIDE,
                ranking=rag.Ranking(
                    rank_service=rag.RankService(
                        model_name="semantic-ranker-default-004"
                    )
                ),
            ),
        )

        # --- Passo 4: Extrai e filtra os trechos pelo limiar de relevância ---
        # resultado.contexts.contexts é a lista de RagContext com texto e metadados.
        # Proteção contra resposta vazia (corpus novo, query sem matches, etc.).
        contextos = resultado.contexts.contexts if resultado.contexts.contexts else []

        # Mantém apenas trechos com score acima do limiar configurado.
        # Trechos com score baixo indicam material só tangencial — melhor dizer
        # "não encontrei na base" do que responder com conteúdo fraco (FR-004).
        trechos_relevantes = [
            ctx for ctx in contextos if ctx.score >= _RELEVANCE_THRESHOLD
        ]

        # Ordena do mais relevante para o menos (score descendente).
        trechos_relevantes.sort(key=lambda ctx: ctx.score, reverse=True)

        # Limita ao top-N final (rerank-narrow): _TOP_N_NARROW trechos ao agente.
        trechos_finais = trechos_relevantes[:_TOP_N_NARROW]

        # --- Passo 5: Decide o status e monta o retorno do contrato ---
        if not trechos_finais:
            # Nenhum trecho passou o limiar → caminho honesto da US2 (FR-004).
            # A instrução da Kurisu vai declarar "não encontrei na base" antes
            # de qualquer conhecimento geral — nunca finge que a resposta veio das notas.
            return {
                "status": "vazio",
                "trechos": [],
                "mensagem": "Nenhum trecho com relevância suficiente encontrado na base.",
            }

        # Constrói a lista de trechos no formato do contrato (ver contracts/buscar_na_base.md).
        # "fonte" = source_display_name, ex.: "bm25-ranking.md"
        # "uri"   = source_uri, ex.: "gs://proj-kurisu-rag/kurisu-wiki/wiki/concepts/bm25-ranking.md"
        # Ambos vêm do retrieval (não inventados pelo modelo) → SC-009 garantido.
        trechos = [
            {
                "texto": ctx.text,
                # Em serverless, source_display_name vem vazio — derivamos do URI.
                "fonte": _derivar_fonte(ctx.source_display_name, ctx.source_uri),
                "uri": ctx.source_uri,
                "score": ctx.score,
            }
            for ctx in trechos_finais
        ]

        return {
            "status": "ok",
            "trechos": trechos,
            "mensagem": None,
        }

    except Exception as exc:
        # Captura erros de rede, autenticação ou falha interna do Vertex AI.
        # O stack trace vai para o log do container (diagnóstico), mas o usuário
        # recebe apenas "base indisponível" — sem vazar detalhes internos (FR-009).
        logger.error("Erro ao consultar Vertex RAG: %s", exc, exc_info=True)
        return {
            "status": "indisponivel",
            "trechos": [],
            "mensagem": "Falha temporária ao acessar a base de conhecimento.",
        }
