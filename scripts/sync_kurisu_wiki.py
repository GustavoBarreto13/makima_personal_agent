"""Sync incremental do corpus da wiki da Kurisu (Vertex AI RAG).

Este script resolve um problema do `setup_kurisu_rag.py`: para refletir uma EDIÇÃO
numa página já existente da wiki, hoje é preciso rodar `--recreate` (apaga e recria
o corpus inteiro, reembeddando as ~410 páginas de novo — caro e gera um corpus ID
novo, exigindo atualizar `VERTEX_RAG_CORPUS` + redeploy).

Este script faz a MESMA coisa de forma incremental:

    wiki/*.md (local)  →  hash local (grátis, sem API)
                        →  compara com um "manifesto" (uri → hash) salvo no GCS
                        →  SÓ o que mudou (novo/editado) é reenviado ao GCS e
                           reimportado no Vertex — o corpus NUNCA é recriado, o ID
                           nunca muda.

Pensado para rodar automaticamente a cada push no repo do vault (GitHub Actions —
ver o ticket "github-actions-wiring"), mas funciona igual rodando manualmente.
Rascunho do workflow já existe em `.github/workflows/sync-kurisu-rag.yml` no repo do
vault (Obisidan-Knowledge-Base), mas ainda não está ativo — faltam os secrets
GCP_CREDENTIALS_JSON, GCP_PROJECT_ID e MAKIMA_REPO_TOKEN nesse repo (ver
agents/kurisu/CLAUDE.md, seção "Manter o corpus da wiki atualizado"). Até lá, rodar
manualmente quando uma busca não achar conteúdo que deveria estar na wiki.

Pré-requisitos (mesmos do setup_kurisu_rag.py): GCP_CREDENTIALS_JSON, GCP_PROJECT_ID.
O corpus da wiki (`kurisu-karpathy-wiki`) precisa já existir — este script NÃO cria
corpus do zero; se ele não existir, rode `python -m scripts.setup_kurisu_rag` uma vez
antes.

Uso:
    # Mostra o que seria feito (novo/editado/removido), sem escrever em GCS/Vertex:
    python -m scripts.sync_kurisu_wiki --dry-run

    # Sincroniza de verdade:
    python -m scripts.sync_kurisu_wiki

    # Aponta para outro checkout do vault (ex.: usado pelo workflow do GitHub Actions,
    # que faz checkout do vault num diretório separado do checkout deste repo):
    python -m scripts.sync_kurisu_wiki --wiki-dir ../vault

Primeira execução (bootstrap): como o corpus já tem as 410 páginas importadas pelo
`setup_kurisu_rag.py`, mas o manifesto ainda não existe, a 1ª rodada trata "página já
está no corpus, mas sem hash registrado no manifesto" como **já sincronizada** — só
grava o hash atual no manifesto, sem reimportar. Isso evita reembeddar tudo de novo
só porque é a primeira vez que este script roda (o corpus já reflete o que foi
importado pelo `--recreate` mais recente). Rodadas seguintes já comparam hash a hash
normalmente.
"""

import argparse
import hashlib
import os
import sys
import time
from pathlib import Path

from google.api_core.exceptions import ResourceExhausted
from google.cloud import storage
from vertexai.preview import rag

import vertexai

# Reusa a infra já validada do ingester da 027 — credenciais, coleta de arquivos
# locais, busca do corpus por nome — em vez de duplicar essa lógica aqui.
from scripts.setup_kurisu_rag import (
    DEFAULT_CHUNK_OVERLAP,
    DEFAULT_CHUNK_SIZE,
    DEFAULT_DISPLAY_NAME,
    DEFAULT_LOCATION,
    DEFAULT_PREFIX,
    DEFAULT_WIKI_DIR,
    _collect_wiki_files,
    _find_corpus,
    _load_credentials,
)

# Limite do import_files: no máx. 25 URIs por chamada (mesma lição da 027).
_MAX_URIS_PER_IMPORT = 25

# Fração máxima de páginas que uma única rodada pode remover do corpus (trava
# anti-catástrofe — protege contra checkout incompleto/defeituoso apagando tudo).
_PRUNE_LIMITE = 0.5

# Quantas rodadas de "confere o que faltou e tenta de novo" o import faz antes de
# desistir de um arquivo (mesma ideia da verificação anti-truncamento da 027).
_MAX_RODADAS_IMPORT = 3

# Caminho (dentro do bucket) onde o manifesto uri→hash fica guardado. Fica sob o
# mesmo prefixo da wiki (kurisu-wiki/), separado por "_state/" pra não ser
# confundido com as páginas de verdade.
_MANIFESTO_PATH = f"{DEFAULT_PREFIX}/_state/manifest.json"

# O RAG Engine em modo Serverless tem uma quota de requests/minuto relativamente
# baixa — uma rodada de sync com list/import/delete em sequência pode estourá-la
# (visto rodando manualmente e no GitHub Actions em 2026-08-15). Como é uma janela
# por minuto, esperar e tentar de novo resolve sem intervenção manual.
_QUOTA_MAX_TENTATIVAS = 3
_QUOTA_ESPERA_SEGUNDOS = 65


def _com_retry_quota(func, *args, **kwargs):
    """Executa `func`, tentando de novo em caso de 429 (quota por minuto do Vertex).

    Args:
        func: Callable a executar.
        *args: Posicionais repassados para `func`.
        **kwargs: Nomeados repassados para `func`.

    Returns:
        O retorno de `func`, na primeira tentativa que tiver sucesso.

    Raises:
        ResourceExhausted: Se todas as tentativas esgotarem a quota.
    """
    for tentativa in range(1, _QUOTA_MAX_TENTATIVAS + 1):
        try:
            return func(*args, **kwargs)
        except ResourceExhausted:
            if tentativa == _QUOTA_MAX_TENTATIVAS:
                raise
            print(
                f"  ⚠ Quota do Vertex AI excedida (tentativa {tentativa}/"
                f"{_QUOTA_MAX_TENTATIVAS}) — aguardando {_QUOTA_ESPERA_SEGUNDOS}s "
                "a janela por minuto resetar ...",
                file=sys.stderr,
            )
            time.sleep(_QUOTA_ESPERA_SEGUNDOS)


# ---------------------------------------------------------------------------
# Hash local (grátis — não fala com nenhuma API paga)
# ---------------------------------------------------------------------------

def _hash_arquivo(caminho: Path) -> str:
    """Calcula um hash curto e estável do conteúdo de um arquivo.

    Mesmo formato usado por `MemoryDoc.content_hash` (agents/kurisu/memory/render.py)
    — sha256 truncado em 16 caracteres, o suficiente pra detectar mudança de conteúdo
    sem gastar espaço à toa no manifesto.

    Args:
        caminho: Caminho local do arquivo.

    Returns:
        Hash hexadecimal de 16 caracteres.
    """
    # Lê como bytes (não texto) para não depender de decidir um encoding — o hash
    # precisa refletir o conteúdo exato do arquivo, byte a byte.
    conteudo = caminho.read_bytes()
    return hashlib.sha256(conteudo).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Manifesto (estado do último sync, guardado no GCS — não no disco do runner)
# ---------------------------------------------------------------------------

def _ler_manifesto(bucket: "storage.Bucket") -> dict:
    """Lê o manifesto uri→hash do último sync (dict vazio se ainda não existe).

    Args:
        bucket: Bucket GCS onde o manifesto é guardado.

    Returns:
        Dicionário `{uri_gs: hash}` do estado do último sync bem-sucedido.
    """
    import json

    blob = bucket.blob(_MANIFESTO_PATH)
    if not blob.exists():
        # 1ª execução: ainda não existe manifesto nenhum.
        return {}
    try:
        return json.loads(blob.download_as_text())
    except (ValueError, OSError):
        # Manifesto corrompido/ilegível: trata como vazio — pior caso é reprocessar
        # tudo como "novo/bootstrap", nunca perde dado.
        print("  ⚠ manifesto ilegível — tratando como vazio", file=sys.stderr)
        return {}


def _gravar_manifesto(bucket: "storage.Bucket", manifesto: dict) -> None:
    """Grava o manifesto uri→hash atual (base do diff do próximo sync).

    Args:
        bucket: Bucket GCS onde o manifesto é guardado.
        manifesto: Dicionário `{uri_gs: hash}` a persistir.
    """
    import json

    bucket.blob(_MANIFESTO_PATH).upload_from_string(
        json.dumps(manifesto, indent=2, sort_keys=True),
        content_type="application/json",
    )


# ---------------------------------------------------------------------------
# Estado atual do corpus (o que já está importado, e onde)
# ---------------------------------------------------------------------------

def _corpus_uris_map(corpus_name: str, prefix: str) -> dict:
    """Mapeia URI gs:// → resource name do RagFile, só para arquivos da wiki.

    Filtra pelo prefixo da wiki (`kurisu-wiki/`) para não confundir com outros
    corpora/documentos — hoje só existe a wiki neste corpus, mas o filtro é uma
    proteção barata contra o corpus errado ser passado por engano.

    Args:
        corpus_name: Resource name do corpus da wiki.
        prefix: Prefixo lógico da wiki dentro do bucket (ex.: "kurisu-wiki").

    Returns:
        Dicionário `{uri_gs: resource_name_do_ragfile}`.
    """
    mapa: dict = {}
    marcador = f"/{prefix}/"
    arquivos = _com_retry_quota(lambda: list(rag.list_files(corpus_name=corpus_name)))
    for f in arquivos:
        fonte = getattr(f, "gcs_source", None)
        if fonte and fonte.uris:
            for uri in fonte.uris:
                if marcador in uri:
                    mapa[uri] = f.name
    return mapa


# ---------------------------------------------------------------------------
# Import em lotes (com retry — o import_files pode truncar numa chamada grande)
# ---------------------------------------------------------------------------

def _importar_com_retry(
    corpus_name: str, uris: list, chunk_size: int, chunk_overlap: int
) -> None:
    """Importa as URIs pedidas, em lotes de ≤25, repetindo o que faltar.

    O `import_files` já é chamado em lotes pequenos (≤25 URIs) — o limite da API —
    mas mesmo assim uma chamada pode importar menos do que o pedido (lição da
    ingestão da 027). Por isso confere o que realmente entrou e tenta de novo só o
    que faltou, por algumas rodadas.

    Args:
        corpus_name: Resource name do corpus de destino.
        uris: Lista de URIs gs:// a importar.
        chunk_size: Nº de tokens por chunk.
        chunk_overlap: Nº de tokens de sobreposição.
    """
    if not uris:
        return

    pendentes = set(uris)
    for rodada in range(1, _MAX_RODADAS_IMPORT + 1):
        if not pendentes:
            return
        lote_uris = sorted(pendentes)
        print(f"  • Import rodada {rodada}: {len(lote_uris)} arquivo(s) pendente(s)")
        for i in range(0, len(lote_uris), _MAX_URIS_PER_IMPORT):
            lote = lote_uris[i:i + _MAX_URIS_PER_IMPORT]
            _com_retry_quota(
                rag.import_files,
                corpus_name=corpus_name,
                paths=lote,
                transformation_config=rag.TransformationConfig(
                    rag.ChunkingConfig(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
                ),
                max_embedding_requests_per_min=900,
            )
        # Confere o que realmente entrou, pra saber se precisa de outra rodada.
        ja_no_corpus = set(_corpus_uris_map(corpus_name, DEFAULT_PREFIX).keys())
        pendentes = pendentes - ja_no_corpus

    if pendentes:
        # Não é fatal — essas URIs simplesmente ficam de fora do manifesto final,
        # então a PRÓXIMA execução as trata como "novo" de novo e tenta sozinha.
        print(
            f"  ⚠ {len(pendentes)} arquivo(s) não confirmados após {_MAX_RODADAS_IMPORT} "
            "rodadas — serão retentados na próxima execução.",
            file=sys.stderr,
        )


# ---------------------------------------------------------------------------
# Sync principal
# ---------------------------------------------------------------------------

def sync_wiki(wiki_dir: Path, bucket_name: str, dry_run: bool = False) -> dict:
    """Sincroniza o corpus da wiki de forma incremental (só o que mudou).

    Args:
        wiki_dir: Raiz local do vault (contém `wiki/` e `index.md`).
        bucket_name: Nome do bucket GCS (mesmo bucket da 027).
        dry_run: Se True, só calcula e reporta o diff — não escreve em GCS/Vertex.

    Returns:
        Um dict-resumo do que foi feito (ou seria feito, em dry-run).
    """
    # --- 1. Coleta local + hash (grátis — nenhuma chamada de API ainda) ---
    print("→ Coletando arquivos locais da wiki ...")
    arquivos = _collect_wiki_files(wiki_dir)
    print(f"  • {len(arquivos)} arquivo(s) na wiki local")

    # esperadas: uri_gs -> (caminho_local, hash)
    esperadas: dict = {}
    for caminho_local, rel in arquivos:
        uri = f"gs://{bucket_name}/{DEFAULT_PREFIX}/{rel}"
        esperadas[uri] = (caminho_local, rel, _hash_arquivo(caminho_local))

    # --- 2. Autenticação + clientes (a partir daqui, chamadas reais à nuvem) ---
    print("→ Autenticando na GCP ...")
    credentials = _load_credentials()
    vertexai.init(project=os.environ["GCP_PROJECT_ID"], location=DEFAULT_LOCATION, credentials=credentials)
    storage_client = storage.Client(project=os.environ["GCP_PROJECT_ID"], credentials=credentials)
    bucket = storage_client.bucket(bucket_name)

    # --- 3. Localiza o corpus (NUNCA cria um novo — isso é papel do setup_kurisu_rag.py) ---
    corpus = _find_corpus(DEFAULT_DISPLAY_NAME)
    if corpus is None:
        raise SystemExit(
            f"ERRO: corpus '{DEFAULT_DISPLAY_NAME}' não existe. Rode "
            "'python -m scripts.setup_kurisu_rag' uma vez antes de usar o sync incremental."
        )
    print(f"  • Corpus: {corpus.name}")

    # --- 4. Estado atual: o que já está no corpus e o que o último sync viu ---
    no_corpus = _corpus_uris_map(corpus.name, DEFAULT_PREFIX)  # uri -> resource_name
    manifesto = _ler_manifesto(bucket)                          # uri -> hash do último sync
    print(f"  • {len(no_corpus)} arquivo(s) já no corpus, {len(manifesto)} no manifesto")

    # --- 5. Classifica cada arquivo esperado ---
    novos: list = []
    editados: list = []
    bootstrap: list = []   # já está no corpus, mas nunca foi rastreado no manifesto
    inalterados: list = []

    for uri, (_caminho, _rel, h) in esperadas.items():
        if uri not in no_corpus:
            novos.append(uri)
        elif uri not in manifesto:
            # Bootstrap: o arquivo já foi importado (provavelmente pelo
            # setup_kurisu_rag.py), mas este é o 1º sync incremental — não temos
            # como saber se mudou desde então sem um hash de referência. Assume que
            # o corpus reflete o conteúdo atual (evita reembeddar tudo de graça) e
            # só passa a rastrear a partir de agora.
            bootstrap.append(uri)
        elif manifesto[uri] != h:
            editados.append(uri)
        else:
            inalterados.append(uri)

    removiveis = [uri for uri in no_corpus if uri not in esperadas]

    resumo = {
        "total_local": len(esperadas),
        "novos": len(novos),
        "editados": len(editados),
        "bootstrap": len(bootstrap),
        "inalterados": len(inalterados),
        "removiveis": len(removiveis),
    }

    if dry_run:
        print("\n[dry-run] Diff calculado (nada foi escrito em GCS/Vertex):")
        for chave, valor in resumo.items():
            print(f"    {chave}: {valor}")
        return {**resumo, "dry_run": True}

    # --- 6. Editados: remove o chunk antigo antes de reimportar (Vertex de-dup por URI) ---
    for uri in editados:
        _com_retry_quota(rag.delete_file, name=no_corpus[uri])

    # --- 7. Upload ao GCS — SÓ o que muda (novo + editado). Inalterado nem é tocado. ---
    a_enviar = novos + editados
    if a_enviar:
        print(f"→ Enviando {len(a_enviar)} arquivo(s) ao GCS (só o que mudou) ...")
        for uri in a_enviar:
            caminho_local, rel, _h = esperadas[uri]
            bucket.blob(f"{DEFAULT_PREFIX}/{rel}").upload_from_filename(
                str(caminho_local), content_type="text/markdown"
            )

    # --- 8. Import (com retry) — só novo + editado. Custo proporcional só ao diff. ---
    if a_enviar:
        print(f"→ Importando {len(a_enviar)} arquivo(s) no corpus ...")
        _importar_com_retry(corpus.name, a_enviar, DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP)

    # --- 9. Prune — remove do corpus o que saiu da wiki local, com trava ≤50% ---
    travado = False
    if removiveis and no_corpus and (len(removiveis) / len(no_corpus)) > _PRUNE_LIMITE:
        print(
            f"  ⚠ TRAVA: remoção afetaria {len(removiveis)}/{len(no_corpus)} "
            "(>50%) — abortando remoção (provável checkout incompleto).",
            file=sys.stderr,
        )
        travado = True
        removiveis = []
    else:
        for uri in removiveis:
            print(f"  • Removendo do corpus (não existe mais localmente): {uri}")
            _com_retry_quota(rag.delete_file, name=no_corpus[uri])

    # --- 10. Manifesto final: relista o corpus e só grava hash do que está CONFIRMADO ---
    # Isso é auto-curativo: qualquer arquivo que não tenha entrado de verdade (falha
    # silenciosa do import) fica de fora do manifesto e vira "novo" automaticamente
    # na próxima execução — sem precisar de lógica extra de retry entre execuções.
    no_corpus_final = _corpus_uris_map(corpus.name, DEFAULT_PREFIX)
    novo_manifesto = {
        uri: h for uri, (_c, _r, h) in esperadas.items() if uri in no_corpus_final
    }
    _gravar_manifesto(bucket, novo_manifesto)

    resumo["trava_acionada"] = travado
    resumo["confirmados_no_manifesto"] = len(novo_manifesto)
    print("\n✅ Sync concluído.")
    for chave, valor in resumo.items():
        print(f"    {chave}: {valor}")
    return resumo


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    """Ponto de entrada: parse dos argumentos e execução do sync.

    Returns:
        Código de saída do processo (0 = sucesso).
    """
    parser = argparse.ArgumentParser(
        description="Sync incremental do corpus da wiki da Kurisu (Vertex AI RAG)."
    )
    parser.add_argument(
        "--wiki-dir",
        default=os.environ.get("KURISU_WIKI_DIR", DEFAULT_WIKI_DIR),
        help="Caminho local da raiz do vault (default: caminho no G: ou $KURISU_WIKI_DIR).",
    )
    parser.add_argument(
        "--bucket",
        default=os.environ.get("KURISU_RAG_BUCKET", ""),
        help="Nome do bucket GCS (default: '{GCP_PROJECT_ID}-kurisu-rag').",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Só calcula e mostra o diff (novo/editado/removido) — não escreve nada.",
    )
    args = parser.parse_args()

    project_id = os.environ.get("GCP_PROJECT_ID", "")
    if not project_id:
        print("ERRO: GCP_PROJECT_ID não definida.", file=sys.stderr)
        return 1

    bucket_name = args.bucket or f"{project_id}-kurisu-rag"
    wiki_dir = Path(args.wiki_dir)

    sync_wiki(wiki_dir, bucket_name, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
