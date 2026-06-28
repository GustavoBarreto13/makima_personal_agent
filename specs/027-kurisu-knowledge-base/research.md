# Research: Kurisu — Base de Conhecimento (Vertex AI RAG)

**Spec**: [spec.md](./spec.md) · **Data**: 2026-06-28

Consolida as decisões técnicas que destravam o `plan.md`. Cada item segue o formato
**Decisão / Justificativa / Alternativas**. As constantes de implementação já fechadas estão
na seção *Restrições Técnicas* da spec; aqui ficam as resoluções de incerteza.

---

## R1 — Backend de recuperação: RagManagedDb (não Weaviate)

- **Decisão**: usar o backend default `RagManagedDb` do Vertex AI RAG Engine (o que o
  `scripts/setup_kurisu_rag.py` já cria via `RagVectorDbConfig`). **Não** migrar para Weaviate no v1.
- **Justificativa**: hybrid search real (denso + esparso/BM25) só existe com backend Weaviate, que
  adiciona um serviço/container ao VPS — colide com o princípio **V (Minimal Footprint)** da
  constituição. Para ~386 páginas, usuário único, o ganho não justifica a infra agora.
- **Alternativas**: Weaviate (hybrid pleno, FR-017/SC-008 ≥95%) — adiada para fase 2 **se** o uso
  real provar que denso+reranker erra termo exato com frequência (ver R3).

## R2 — Reranking via FunctionTool customizada (substitui `VertexAiRagRetrieval`)

- **Decisão**: trocar a tool ADK `VertexAiRagRetrieval` por uma **FunctionTool customizada**
  (`buscar_na_base`) que chama `rag.retrieval_query()` com
  `RagRetrievalConfig(top_k=<wide>, ranking=Ranking(rank_service=RankService(...)))`.
- **Justificativa**: a tool ADK `VertexAiRagRetrieval` **só** expõe `similarity_top_k` e
  `vector_distance_threshold` — ela chama `rag.retrieval_query()` **sem** `rag_retrieval_config`,
  então rerank é silenciosamente ignorado. Para satisfazer FR-016 (retrieve-wide → rerank-narrow) é
  preciso a chamada direta. O `RankService` (`semantic-ranker-default-004`, latência <100ms) é GA.
- **Alternativas**: manter `VertexAiRagRetrieval` puro (não atende FR-016); LLM Ranker via Gemini
  (latência 1–2s, custo por token) — preterido por latência; RankService é mais barato/rápido.
- **Fonte**: [adk-python vertex_ai_rag_retrieval.py](https://github.com/google/adk-python/blob/main/src/google/adk/tools/retrieval/vertex_ai_rag_retrieval.py);
  [Reranking for RAG Engine](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/rag-engine/retrieval-and-ranking).

## R3 — Termo exato (FR-017 / SC-008): faseado

- **Decisão**: no v1, recuperação **densa + reranker** (sem busca esparsa). FR-017 e SC-008 tratados
  como **parciais no v1 / plenos na fase 2** (Weaviate). O recall de termo exato no v1 apoia-se em:
  (a) o termo literal aparece tanto na query quanto na página (o embedding denso costuma recuperar),
  (b) o reranker reforça, (c) o que escapar cai no **fallback honesto da US2/FR-004** ("não encontrei
  na base") — nunca uma resposta falsamente ancorada.
- **Justificativa**: decisão do usuário (2026-06-28) pela abordagem faseada — MVP rápido sem fechar a
  porta ao hybrid. Meta de SC-008 no v1: **≥80%** (era ≥95%); ≥95% fica para a fase 2 com Weaviate.
- **Sinal de gatilho para a fase 2**: observar, no uso real, buscas por termo literal que retornam
  "não encontrei" apesar de a página existir. Isso é a evidência que justifica o Weaviate (princ. V).

## R4 — Citação / proveniência (FR-003 / FR-019 / SC-009)

- **Decisão**: citar pela `source_display_name` / `source_uri` que cada chunk recuperado já carrega.
  O ingester preserva o caminho relativo (`wiki/concepts/bm25-ranking.md`) como nome do objeto no
  GCS, então o `source_uri` resolve para um arquivo real da wiki. A instrução da Kurisu força a
  citação por título; a menção à fonte `raw/` vem do frontmatter `source_path:` da página.
- **Justificativa**: `rag.retrieval_query()` retorna `source_uri`, `source_display_name`, `text`,
  `score` por contexto. Citação não é automática — depende de prompt rigoroso (já está na instrução).
- **Opcional (não-bloqueante)**: anexar metadados por arquivo via `RagFileMetadataConfig` (title,
  type, source_path) na importação, para citação mais limpa. Fica como melhoria, não requisito do v1.
- **Fonte**: [RAG output explained](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/rag-output-explained);
  [RagFileMetadataConfig](https://docs.cloud.google.com/vertex-ai/docs/reference/rest/v1beta1/RagFileMetadataConfig).

## R5 — Refresh da wiki (FR-013 / SC-007): rebuild via `--recreate`

- **Decisão**: refletir edições da wiki via `python -m scripts.setup_kurisu_rag --recreate` (deleta o
  corpus e recria). Atualizar `VERTEX_RAG_CORPUS` com o novo id após o rebuild.
- **Justificativa**: o RAG Engine de-duplica por URI — re-importar um arquivo de mesmo nome com
  conteúdo novo **não** atualiza o chunk antigo. `rag.delete_file()` existe (refresh incremental por
  arquivo), mas exige rastrear `file_id` por página; para uma wiki revisada com frequência, o rebuild
  é mais simples e atômico. `RagManagedDb` não suporta operações concorrentes no corpus.
- **Alternativas**: delete-file + reimport por página (incremental verdadeiro) — adiado; só compensa
  quando o corpus for grande o bastante para o rebuild doer.
- **Fonte**: [Manage your RAG corpus](https://cloud.google.com/vertex-ai/generative-ai/docs/rag-engine/manage-your-rag-corpus).

## R6 — Embedding multilíngue

- **Decisão**: `text-multilingual-embedding-002` (já no ingester). Cobre PT/EN/JA.
- **Justificativa**: modelo GA avaliado em 18+ idiomas (inclui Português, English, 日本語); é a escolha
  padrão do Vertex para RAG multilíngue. Sem limitação de idioma/dimensão conhecida que afete o caso.
- **Fonte**: [Text embeddings API](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/text-embeddings-api).

## R7 — Decisão de "encontrei vs. não encontrei" (FR-004 / US2)

- **Decisão**: a fronteira de relevância é o **score do reranker** do candidato top-1 após o rerank
  (com um limiar mínimo configurável), combinado ao `vector_distance_threshold` na recuperação. Se
  nenhum candidato passa o limiar do reranker, a tool retorna "vazio" e a Kurisu segue o caminho
  honesto da US2.
- **Justificativa**: resolve a tensão anotada na revisão da spec (FR-016 baniu "corte de distância
  fixo", mas US2 exige uma fronteira). O reranker fornece um score normalizado de relevância, melhor
  fronteira que distância de embedding crua.

---

## Itens deferidos (não bloqueiam o v1)

- **Fase 2 — Weaviate / hybrid search** para FR-017/SC-008 ≥95% (gatilho em R3).
- **Eval set (SC-001..009)**: construir o conjunto de perguntas-gold é tarefa do plano de testes
  (ver `quickstart.md`), não da implementação do agente.
- **Metadados customizados por arquivo** (R4) — melhoria de citação, não requisito do v1.
