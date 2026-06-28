# Contrato: `buscar_na_base` estendida (busca multi-corpus + recência)

Estende a `buscar_na_base` da 027 (em `agents/kurisu/tools.py`) para consultar **dois** corpora —
wiki (027) + operacional (028) — e aplicar **recência pós-recuperação**.

## Assinatura (inalterada para o agente)

```python
def buscar_na_base(query: str) -> dict:
    """Busca trechos na wiki E na memória operacional, mescla e reordena (relevância + recência)."""
```

> A assinatura vista pelo modelo **não muda** — a Kurisu continua chamando `buscar_na_base(query)`. A
> mudança é interna (2 corpora + merge + recência).

## Saída (dict) — mesma forma da 027, com campos extras no trecho

```jsonc
{
  "status": "ok" | "vazio" | "indisponivel",
  "trechos": [
    {
      "texto": "string",
      "fonte": "string — nome de página (wiki) OU citação operacional legível",
      "uri": "string — gs://... (resolve para arquivo real)",
      "score": 0.0,
      "domain": "string | null — null p/ wiki; domínio p/ operacional",
      "doc_date": "YYYY-MM-DD | null — presente nos documentos operacionais"
    }
  ],
  "mensagem": "string | null"
}
```

## Comportamento interno (normativo)

1. Lê `VERTEX_RAG_CORPUS` (wiki) e `VERTEX_RAG_CORPUS_OPERACIONAL` (028). Se **ambos** ausentes →
   `status: "indisponivel"`. Se só um existe, busca só nesse (degrada com elegância).
2. Faz **uma `retrieval_query` por corpus** (a API aceita só 1 `RagResource` por chamada — validado).
   Podem rodar concorrentemente. Cada query usa `RagRetrievalConfig(top_k=wide, ranking=RankService)`.
3. **Mescla** os candidatos dos 2 corpora numa lista única.
4. Aplica **recência** (`agents/kurisu/recency.py`, R6):
   - intervalo temporal explícito na query → **filtra** por `doc_date` na janela (UTC-3);
   - viés de recência sem intervalo → **reordena** por `score × decaimento(idade)`;
   - query atemporal → ordena só por `score`.
5. Aplica o **limiar de relevância** (herdado da 027) e corta no top-N.
6. Monta `trechos` com `domain`/`doc_date` (null para a wiki). `status`: `ok` / `vazio` / `indisponivel`.

## Regras de saída (mapeadas a requisitos)

- Busca **unânime** wiki + operacional em toda pergunta (FR-009).
- `doc_date`/`domain` vêm do metadado do documento — habilitam recência (FR-005) e citação (FR-011).
- `fonte`/`uri` resolvem para origem real (SC-009 herdado).
- Documentos operacionais nunca expõem stacktrace; falha de um corpus não derruba o outro (FR-009).

## Requisitos cobertos

FR-005 (recência), FR-009 (busca unânime), FR-011 (citação operacional). SC-001/SC-006 (datas e
ordenação por recência).
