# Contrato: FunctionTool `buscar_na_base`

A tool de recuperação da Kurisu (em `agents/kurisu/tools.py`). Substitui a tool ADK
`VertexAiRagRetrieval` para habilitar o reranker (FR-016), que a tool nativa não expõe.

## Assinatura

```python
def buscar_na_base(query: str) -> dict:
    """Busca trechos relevantes na wiki curada (corpus Vertex AI RAG) e os reordena.

    Args:
        query: A pergunta/consulta do usuário em linguagem natural (PT/EN/JA).

    Returns:
        dict com a forma do contrato abaixo.
    """
```

> No ADK, o agente recebe o `dict` retornado e o usa para compor a resposta. O nome, a docstring e os
> tipos viram o schema que o modelo enxerga — por isso a docstring é parte do contrato.

## Entrada

| Param | Tipo | Regras |
|---|---|---|
| `query` | `str` | Não vazia. Idioma livre (o embedding é multilíngue). |

## Saída (dict)

```jsonc
{
  "status": "ok" | "vazio" | "indisponivel",
  "trechos": [
    {
      "texto": "string — conteúdo do chunk",
      "fonte": "string — source_display_name (ex.: 'bm25-ranking.md')",
      "uri": "string — source_uri (gs://.../wiki/concepts/bm25-ranking.md)",
      "score": 0.0
    }
  ],
  "mensagem": "string | null — motivo quando status != ok"
}
```

### Regras de saída (mapeadas a requisitos)

- **`status: "ok"`** quando ≥1 trecho passa o limiar de relevância pós-rerank (R7). `trechos`
  ordenado por `score` desc, no máx. top-N (N < top_k de recuperação) — **retrieve-wide → rerank-narrow** (FR-016).
- **`status: "vazio"`** quando nenhum candidato passa o limiar → a Kurisu segue o caminho honesto da
  US2 ("não encontrei na base") (FR-004). `trechos: []`.
- **`status: "indisponivel"`** quando `VERTEX_RAG_CORPUS` está ausente/vazio ou a chamada ao Vertex
  falha → a Kurisu avisa que a base não está pronta (FR-009). Nunca propaga stacktrace.
- Cada `fonte`/`uri` MUST resolver para um arquivo real da wiki (SC-009) — vêm do retrieval, não inventados.

## Comportamento interno (implementação — referência, não normativo)

1. Lê `VERTEX_RAG_CORPUS`; se vazio → `status: "indisponivel"`.
2. `vertexai.init(project, location, credentials)` com a service account (`GCP_CREDENTIALS_JSON`).
3. `rag.retrieval_query(text=query, rag_resources=[corpus], rag_retrieval_config=RagRetrievalConfig(
   top_k=<wide, ex. 10>, ranking=Ranking(rank_service=RankService(model_name="semantic-ranker-default-004"))))`.
4. Filtra pelo limiar de relevância; monta `trechos`; define `status`.
5. Exceções de rede/Vertex → captura → `status: "indisponivel"` + log (não quebra o turno).

## Erros

| Situação | `status` | Para o usuário |
|---|---|---|
| Corpus não configurado | `indisponivel` | "a base ainda não está disponível pra consulta" |
| Falha de rede / Vertex | `indisponivel` | mesma mensagem; erro real só no log |
| Nenhum trecho relevante | `vazio` | caminho honesto US2 (decidido pela instrução do agente) |

## Requisitos cobertos

FR-002, FR-003, FR-004 (via `vazio`), FR-009 (via `indisponivel`), FR-016 (rerank), FR-019 (proveniência
no retorno), SC-009 (fontes resolvem). FR-017/FR-018/SC-008 (termo-exato/hybrid) — **parcial no v1**
(densa+rerank); pleno na fase 2 (Weaviate).
