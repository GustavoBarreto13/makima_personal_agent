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

# Motor puro de recência (spec 028): reordena os trechos para que, em empate de
# relevância, o conteúdo mais recente apareça primeiro (FR-005/SC-006).
from agents.kurisu.recency import aplicar_recencia

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

# Prefixo (pasta lógica no GCS) onde o sync da 028 grava os documentos operacionais.
# Convenção de path combinada com o sync: gs://{bucket}/kurisu-memoria/{domain}/{doc_date}__{source_ref}.md
# A busca extrai `domain` e `doc_date` desse path — usados para citar a origem (FR-011)
# e para o peso de recência (FR-005). Trechos da wiki (outro prefixo) ficam sem essas marcas.
_PREFIXO_OPERACIONAL = "kurisu-memoria"


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


def _extrair_meta_operacional(source_uri: str) -> tuple:
    """Extrai (domain, doc_date) do source_uri de um documento operacional (028).

    Os documentos operacionais seguem a convenção de path
    `.../kurisu-memoria/{domain}/{doc_date}__{source_ref}.md`. Trechos da wiki (027) ficam
    em outro prefixo e retornam (None, None) — eles não têm domínio nem data.

    Args:
        source_uri: A URI gs:// do trecho recuperado.

    Returns:
        Uma tupla (domain, doc_date) como strings, ou (None, None) se não for operacional.

    Example:
        >>> _extrair_meta_operacional("gs://b/kurisu-memoria/diario/2026-05-04__bullet-1.md")
        ('diario', '2026-05-04')
        >>> _extrair_meta_operacional("gs://b/kurisu-wiki/wiki/concepts/ansiedade.md")
        (None, None)
    """
    # Só documentos sob o prefixo operacional têm domínio/data embutidos no path.
    if not source_uri or f"/{_PREFIXO_OPERACIONAL}/" not in source_uri:
        return None, None
    # Pega o que vem depois de "kurisu-memoria/": "{domain}/{doc_date}__{source_ref}.md".
    resto = source_uri.split(f"/{_PREFIXO_OPERACIONAL}/", 1)[1]
    partes = resto.split("/")
    domain = partes[0] if partes and partes[0] else None
    # doc_date é o prefixo do nome do arquivo, antes do separador "__".
    nome = posixpath.basename(resto)
    doc_date = nome.split("__", 1)[0] if "__" in nome else None
    return domain, doc_date


def _consultar_corpus(corpus_name: str, query: str) -> list:
    """Faz UMA `retrieval_query` num único corpus e devolve os trechos relevantes.

    A API do Vertex aceita só 1 corpus por chamada (`Currently only support 1 RagResource`),
    então a busca multi-corpus chama esta função uma vez por corpus e mescla os resultados.
    Cada trecho já vem com `domain`/`doc_date` (None para a wiki) para recência e citação.

    Args:
        corpus_name: Resource name do corpus a consultar.
        query: A pergunta do usuário.

    Returns:
        Lista de trechos (dicts) que passaram o limiar de relevância.
    """
    # retrieve-wide → rerank-narrow: top_k candidatos + reranker RankService.
    resultado = rag.retrieval_query(
        text=query,
        rag_resources=[rag.RagResource(rag_corpus=corpus_name)],
        rag_retrieval_config=rag.RagRetrievalConfig(
            top_k=_TOP_K_WIDE,
            ranking=rag.Ranking(
                rank_service=rag.RankService(model_name="semantic-ranker-default-004")
            ),
        ),
    )
    contextos = resultado.contexts.contexts if resultado.contexts.contexts else []

    trechos = []
    for ctx in contextos:
        # Descarta trechos abaixo do limiar (material só tangencial).
        if ctx.score < _RELEVANCE_THRESHOLD:
            continue
        # domain/doc_date vêm do path operacional (None para a wiki).
        domain, doc_date = _extrair_meta_operacional(ctx.source_uri)
        trechos.append(
            {
                "texto": ctx.text,
                # Em serverless, source_display_name vem vazio — derivamos do URI.
                "fonte": _derivar_fonte(ctx.source_display_name, ctx.source_uri),
                "uri": ctx.source_uri,
                "score": ctx.score,
                "domain": domain,
                "doc_date": doc_date,
            }
        )
    return trechos


def buscar_na_base(query: str) -> dict:
    """Busca trechos na wiki (027) E na memória operacional (028), mescla e reordena.

    Implementa a **busca unânime** da 028 (FR-009): consulta os dois corpora — wiki e
    operacional — porque a API só aceita 1 corpus por chamada, então faz uma
    `retrieval_query` por corpus e mescla. Cada query usa retrieve-wide → rerank-narrow
    (reranker RankService). Sobre o conjunto mesclado, aplica recência pós-recuperação
    (`recency.aplicar_recencia`): em empate de relevância, o conteúdo mais recente vem
    primeiro (FR-005/SC-006). Por fim, corta no top-N.

    Degrada com elegância: se só um dos corpora está configurado, busca só nele; se a
    consulta a um corpus falha mas a do outro funciona, retorna o que deu certo.

    Args:
        query: A pergunta do usuário em linguagem natural (PT/EN/JA).

    Returns:
        Um dict com:
        - "status": "ok" (há trechos), "vazio" (nada relevante), "indisponivel"
          (nenhum corpus configurado ou todas as consultas falharam).
        - "trechos": lista de dicts com "texto", "fonte", "uri", "score", "domain"
          (None p/ wiki) e "doc_date" (None p/ wiki). Vazia se status != "ok".
        - "mensagem": explicação quando status != "ok", ou None quando "ok".
    """
    # --- Passo 1: Reúne os corpora configurados (wiki + operacional) ---
    corpus_wiki = os.environ.get("VERTEX_RAG_CORPUS", "").strip()
    corpus_op = os.environ.get("VERTEX_RAG_CORPUS_OPERACIONAL", "").strip()
    # Mantém só os que existem — permite rodar com um corpus só (degradação elegante).
    corpora = [c for c in (corpus_wiki, corpus_op) if c]

    if not corpora:
        # Nenhum corpus configurado: estado válido (FR-009) — a Kurisu avisa sem travar.
        logger.warning("Nenhum corpus configurado (wiki/operacional) — Kurisu indisponível.")
        return {
            "status": "indisponivel",
            "trechos": [],
            "mensagem": "A base de conhecimento ainda não está configurada neste ambiente.",
        }

    # --- Passo 2: Inicializa o Vertex AI (singleton) ---
    try:
        _init_vertexai()
    except Exception as exc:
        logger.error("Falha ao inicializar o Vertex AI: %s", exc, exc_info=True)
        return {
            "status": "indisponivel",
            "trechos": [],
            "mensagem": "Falha temporária ao acessar a base de conhecimento.",
        }

    # --- Passo 3: Consulta cada corpus (1 por chamada) e mescla ---
    todos = []
    falhas = 0
    for corpus in corpora:
        try:
            todos.extend(_consultar_corpus(corpus, query))
        except Exception as exc:
            # Falha de um corpus não derruba o outro (degradação elegante).
            logger.error("Erro ao consultar o corpus %s: %s", corpus, exc, exc_info=True)
            falhas += 1

    # Se TODOS os corpora falharam, a base está indisponível.
    if falhas == len(corpora):
        return {
            "status": "indisponivel",
            "trechos": [],
            "mensagem": "Falha temporária ao acessar a base de conhecimento.",
        }

    # Nenhum trecho relevante em nenhum corpus → caminho honesto da US2 (FR-004).
    if not todos:
        return {
            "status": "vazio",
            "trechos": [],
            "mensagem": "Nenhum trecho com relevância suficiente encontrado na base.",
        }

    # --- Passo 4: Recência pós-recuperação + top-N final ---
    # aplicar_recencia reordena o conjunto mesclado: em empate de relevância, mais recente
    # primeiro. Depois cortamos no top-N que vai para o agente compor a resposta.
    ordenados = aplicar_recencia(todos)
    trechos = ordenados[:_TOP_N_NARROW]

    return {
        "status": "ok",
        "trechos": trechos,
        "mensagem": None,
    }
