"""Orquestrador do sync da memória unificada (spec 028).

Ciclo, por domínio: lê as linhas da origem (read-only), rende `MemoryDoc`s, espelha no
GCS, importa no **corpus operacional** (lotes de ≤25 URIs — limite do `import_files`),
remove da memória os que sumiram da origem (com **trava anti-catástrofe ≤50%**), e grava
um watermark informativo. Nunca toca no corpus da wiki (027) — corpora separados.

Disparado por `scripts/sync_kurisu_memory.py` (job agendado — padrão `backup_postgres.py`).

PILOTO (fatia incremental): só o domínio "diario" está ligado no registro `EXPORTERS`.
Os outros 7 entram replicando o padrão (um exporter + uma entrada no registro).

Estratégia v1 (simples e correta para ADIÇÃO e REMOÇÃO):
- O sync compara as URIs esperadas (da origem, export full) com as que já estão no corpus.
- Importa as que faltam; remove (com trava) as que sumiram.
- EDIÇÃO de um item (mesmo URI, conteúdo novo) ainda **não** é propagada automaticamente
  (o Vertex de-dup por URI). É um TODO: `delete_file` + reimport quando o `content_hash`
  difere. Por ora, edições entram num rebuild do corpus operacional. Ver R3 da spec.
"""

import json
import logging
from datetime import datetime, timezone

# Módulo preview do Vertex (mesmo do store.py — Serverless mode).
from vertexai.preview import rag

from agents.kurisu.memory import store
from agents.kurisu.memory.render import PREFIXO_OPERACIONAL
from agents.kurisu.memory.exporters import export_diario

logger = logging.getLogger(__name__)

# Limite do import_files: máx. 25 URIs por chamada (lição da ingestão da 027).
_MAX_URIS_PER_IMPORT = 25

# Fração máxima de documentos de um domínio que um único sync pode remover (trava ≤50%).
_PRUNE_LIMITE = 0.5

# Chunking dos documentos operacionais (são curtos — 1 chunk por item, em geral).
_CHUNK_SIZE = 512
_CHUNK_OVERLAP = 100

# Registro de exporters por domínio. PILOTO: só "diario". Adicionar os demais aqui à
# medida que os exporters de exporters.py forem implementados (US4).
EXPORTERS = {
    "diario": export_diario,
    # "tarefas": export_tarefas,
    # "financas": export_financas,
    # "pessoas": export_pessoas,
    # "livros": export_livros,
    # "filmes": export_filmes,
    # "animes": export_animes,
    # "series": export_series,
}


# ---------------------------------------------------------------------------
# Watermark (estado de controle, guardado no GCS — não no Postgres de origem)
# ---------------------------------------------------------------------------

def _watermark_blob(bucket, domain: str):
    """Blob GCS onde o watermark de um domínio é persistido."""
    return bucket.blob(f"{PREFIXO_OPERACIONAL}/_state/{domain}.json")


def _gravar_watermark(bucket, domain: str, doc_count: int) -> None:
    """Grava o watermark do domínio (instante do sync + nº de documentos)."""
    blob = _watermark_blob(bucket, domain)
    payload = {
        "last_run_at": datetime.now(timezone.utc).isoformat(),
        "doc_count": doc_count,
    }
    blob.upload_from_string(json.dumps(payload), content_type="application/json")


# ---------------------------------------------------------------------------
# Acesso ao corpus operacional (listar / importar / remover)
# ---------------------------------------------------------------------------

def _files_por_uri(corpus_name: str, domain: str) -> dict:
    """Mapeia URI gs:// → resource name do RagFile, para os documentos de um domínio.

    Usado para saber o que já está no corpus (decidir o que importar) e para remover
    pelo resource name no prune.
    """
    mapa: dict = {}
    marcador = f"/{PREFIXO_OPERACIONAL}/{domain}/"
    for f in rag.list_files(corpus_name=corpus_name):
        fonte = getattr(f, "gcs_source", None)
        if fonte and fonte.uris:
            for uri in fonte.uris:
                if marcador in uri:
                    mapa[uri] = f.name
    return mapa


def _import_em_lotes(corpus_name: str, uris: list) -> int:
    """Importa as URIs no corpus em lotes de ≤25 (limite do import_files). Retorna o total."""
    total = 0
    for i in range(0, len(uris), _MAX_URIS_PER_IMPORT):
        lote = uris[i:i + _MAX_URIS_PER_IMPORT]
        resp = rag.import_files(
            corpus_name=corpus_name,
            paths=lote,
            transformation_config=rag.TransformationConfig(
                rag.ChunkingConfig(chunk_size=_CHUNK_SIZE, chunk_overlap=_CHUNK_OVERLAP)
            ),
            max_embedding_requests_per_min=900,
        )
        total += resp.imported_rag_files_count
    return total


# ---------------------------------------------------------------------------
# Sync de um domínio
# ---------------------------------------------------------------------------

def sync_domain(cur, bucket, corpus_name: str, domain: str, exporter, dry_run: bool = False) -> dict:
    """Sincroniza um domínio: origem → GCS → corpus operacional, com prune e trava.

    Args:
        cur: Cursor psycopg2 read-only (lê a origem).
        bucket: Bucket GCS (espelho dos documentos).
        corpus_name: Resource name do corpus operacional.
        domain: Nome do domínio (chave de EXPORTERS).
        exporter: Função exporter do domínio.
        dry_run: Se True, só conta o que faria (não escreve em GCS nem Vertex).

    Returns:
        Um dict-resumo do que aconteceu (origem, importados, removidos, trava).
    """
    # 1. Export FULL (todos os docs atuais do domínio) — fonte de verdade para o diff.
    docs = exporter(cur, None)
    esperadas = {doc.gcs_uri(bucket.name): doc for doc in docs}
    logger.info("[%s] %d documento(s) na origem", domain, len(docs))

    if dry_run:
        return {"domain": domain, "origem": len(docs), "dry_run": True}

    # 2. Sobe todos ao GCS (sobrescreve — barato; garante o conteúdo atual no espelho).
    for uri, doc in esperadas.items():
        bucket.blob(f"{PREFIXO_OPERACIONAL}/{doc.gcs_relpath()}").upload_from_string(
            doc.texto, content_type="text/markdown"
        )

    # 3. Diff contra o corpus: o que já está lá vs. o que falta importar.
    no_corpus = _files_por_uri(corpus_name, domain)
    novas = [u for u in esperadas if u not in no_corpus]
    importados = _import_em_lotes(corpus_name, novas) if novas else 0

    # 4. Prune: URIs no corpus que sumiram da origem — com TRAVA anti-catástrofe ≤50%.
    removiveis = [u for u in no_corpus if u not in esperadas]
    travado = False
    if removiveis and no_corpus and (len(removiveis) / len(no_corpus)) > _PRUNE_LIMITE:
        # Remoção em massa ⇒ provável defeito de leitura, não remoção legítima. Aborta.
        logger.warning(
            "[%s] TRAVA: prune removeria %d/%d (>50%%) — abortado",
            domain, len(removiveis), len(no_corpus),
        )
        travado = True
        removiveis = []
    for uri in removiveis:
        rag.delete_file(name=no_corpus[uri])

    # 5. Watermark informativo.
    _gravar_watermark(bucket, domain, len(esperadas))

    resumo = {
        "domain": domain,
        "origem": len(esperadas),
        "importados": importados,
        "removidos": len(removiveis),
        "trava_acionada": travado,
    }
    logger.info("[%s] resumo: %s", domain, resumo)
    return resumo


# ---------------------------------------------------------------------------
# Orquestração
# ---------------------------------------------------------------------------

def run_sync(domains: "list | None" = None, dry_run: bool = False) -> list:
    """Roda o ciclo de sync para os domínios pedidos (ou todos os registrados).

    Args:
        domains: Lista de domínios a sincronizar; None = todos em EXPORTERS.
        dry_run: Se True, não escreve nada (só relata o que faria).

    Returns:
        Lista de resumos por domínio.
    """
    # Garante o corpus operacional (cria na 1ª vez) e abre os clientes.
    corpus_name = store.ensure_corpus_operacional()
    bucket = store.gcs_bucket()

    alvos = domains or list(EXPORTERS.keys())
    resumos: list = []

    # Conexão read-only às tabelas de origem (FR-002).
    conn = store.pg_connect_readonly()
    try:
        with conn.cursor() as cur:
            for domain in alvos:
                exporter = EXPORTERS.get(domain)
                if exporter is None:
                    logger.warning("Domínio sem exporter registrado: %s — pulando", domain)
                    continue
                try:
                    resumos.append(sync_domain(cur, bucket, corpus_name, domain, exporter, dry_run))
                except Exception as exc:  # noqa: BLE001 — um domínio em pane não derruba os outros
                    logger.error("[%s] falhou no sync: %s", domain, exc, exc_info=True)
                    resumos.append({"domain": domain, "erro": str(exc)})
    finally:
        conn.close()

    return resumos
