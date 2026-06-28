# Implementation Plan: Kurisu — Assistente de Base de Conhecimento

**Branch**: `master` (sem branch dedicada — regra do usuário) | **Date**: 2026-06-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/027-kurisu-knowledge-base/spec.md`

## Summary

Ativar a Kurisu como agente de conhecimento: ela recupera material da wiki curada do usuário
("Knowledge Base Karpathy", camada `wiki/`) indexada num corpus do **Vertex AI RAG Engine** e
responde perguntas ancoradas nela, com citação de fonte e honestidade quando não há material.

Abordagem técnica (resolvida em [research.md](./research.md)): manter o backend `RagManagedDb`
(sem Weaviate — princípio V), e **substituir a tool ADK `VertexAiRagRetrieval`** por uma
**FunctionTool customizada** (`buscar_na_base`) que chama `rag.retrieval_query()` com
`RagRetrievalConfig(top_k=wide, ranking=RankService)` — habilitando o padrão *retrieve-wide →
rerank-narrow* (FR-016) que a tool ADK não expõe. O ingester (`scripts/setup_kurisu_rag.py`) e o
embedding multilíngue já existem e ficam como estão. Termo-exato/hybrid (FR-017/SC-008 ≥95%) é
**faseado**: v1 entrega densa+reranker (SC-008 ≥80%); Weaviate fica para a fase 2 sob gatilho.

## Technical Context

**Language/Version**: Python 3.11 (mesma do coordinator/agentes)

**Primary Dependencies**: `google-adk` (Agent, FunctionTool), `google-cloud-aiplatform>=1.71`
(`vertexai.rag`: `retrieval_query`, `RagRetrievalConfig`, `Ranking`, `RankService`),
`google-cloud-storage` (espelho da wiki no GCS — só na ingestão), `google-auth` (service account)

**Storage**: Vertex AI RAG Engine — corpus `kurisu-karpathy-wiki` em `us-central1`, backend
`RagManagedDb`. **Sem** novo storage local (sem pgvector, sem Weaviate).

**Testing**: validação manual via Telegram (cenários do `quickstart.md`) + eval set de
perguntas-gold para SC-001..009. Sem framework de teste automatizado novo no v1.

**Target Platform**: agente roda no container `makima-web` (coordinator ADK); a **ingestão** roda na
máquina do usuário (Windows, lê o Google Drive `G:\...` e fala com Vertex/GCS pela internet).

**Project Type**: agente ADK (pacote Python local em `agents/kurisu/`) dentro do coordinator Makima.

**Performance Goals**: resposta de consulta típica sem follow-up em ≥80% (SC-004). Reranker
RankService adiciona <100ms à recuperação — aceitável para interação por Telegram.

**Constraints**: modelo `gemini-2.5-flash` (constituição); respostas em português, formatação
**HTML** do Telegram (ver nota de conformidade abaixo); modo **somente leitura** (FR-005).

**Scale/Scope**: ~386 páginas `.md` (camada `wiki/`) + `index.md`; usuário único; crescimento lento.

## Constitution Check

*GATE: avaliado contra `.specify/memory/constitution.md` v1.0.1. Resultado: **PASSA**.*

| Princípio | Status | Observação |
|---|---|---|
| **I. Agent Specialization** | ✅ | Kurisu é dona do domínio conhecimento; a Makima só roteia (FR-001). A lógica de recuperação vai para `agents/kurisu/` (tool `buscar_na_base`). Sem cross-domain no v1. |
| **II. Hybrid Batch + Agentic** | ✅ | A *interação* (perguntar/responder) é ADK. A *ingestão* (batch one-time/manutenção) é script em `scripts/`, fora do runtime do bot — exatamente o padrão. |
| **III. Self-Contained Agents** | ✅ | `agents/kurisu/` importável sozinho; tem `agent.py` + `CLAUDE.md`. Sem dependência de outro agente em runtime. (Sem `tools.py`/`schema_pg.sql` porque não usa Postgres — a tool vive no `agent.py`.) |
| **IV. Portuguese-First UX** | ✅ | Respostas em PT, persona única, formatação rica. ⚠️ *ver nota* — a constituição diz "Markdown", mas o projeto real usa **HTML** no Telegram. |
| **V. Minimal Footprint** | ✅ | Decisão-chave: **não** adicionar Weaviate nem pgvector. Reusa o Vertex RAG + service account já existentes. Nenhuma dependência nova além do `google-cloud-aiplatform` (já no `requirements.txt`). |

**Nota de conformidade (Princípio IV / Architecture Constraints)**: a constituição diz "parse_mode
Markdown", mas a implementação real do coordinator usa **HTML** (`coordinator/CLAUDE.md`,
`coordinator/agent.py`) — markdown quebra o parser do Telegram com `!?R$`. O plano segue a
**implementação real (HTML)**, consistente com todos os outros agentes. Recomenda-se um PATCH na
constituição para corrigir "Markdown" → "HTML" (fora do escopo desta feature).

**Complexity Tracking**: vazio — nenhuma violação a justificar (a opção que violaria o princípio V,
Weaviate, foi deliberadamente adiada).

## Project Structure

### Documentation (this feature)

```text
specs/027-kurisu-knowledge-base/
├── spec.md              # Especificação (já existe)
├── plan.md              # Este arquivo
├── research.md          # Decisões técnicas (R1..R7)
├── data-model.md        # Entidades: corpus, página, chunk recuperado, citação
├── quickstart.md        # Cenários de validação (Telegram + eval set)
├── contracts/
│   ├── buscar_na_base.md # Contrato da FunctionTool de recuperação
│   └── ingester-cli.md   # Contrato do scripts/setup_kurisu_rag.py
└── checklists/
    └── requirements.md   # Checklist de qualidade (já existe)
```

### Source Code (repository root)

```text
agents/kurisu/
├── __init__.py          # pacote (já existe)
├── agent.py             # kurisu_agent — MUDA: tool customizada buscar_na_base + persona única (já ajustado)
├── tools.py             # NOVO: buscar_na_base() — rag.retrieval_query() + RagRetrievalConfig + rerank
└── CLAUDE.md            # guia do agente (já atualizado)

scripts/
└── setup_kurisu_rag.py  # ingester Vertex (já existe; sem mudança funcional no v1)

coordinator/
└── agent.py             # MUDA (pequeno): ajustar texto de roteamento da Kurisu (wiki, não diário)
```

**Structure Decision**: segue o padrão de agente ADK self-contained da constituição (princ. III). A
lógica de recuperação sai do `agent.py` para um `tools.py` novo (a FunctionTool `buscar_na_base`),
mantendo o `agent.py` só com a definição do agente + instrução — espelhando Nami/Frieren. Não há
`schema_pg.sql` porque o storage é o Vertex RAG, não o Postgres.

## Phasing (escopo v1 vs. futuro)

- **v1 (esta spec)**: recuperação densa + reranker (RankService), citação por `source_uri`, refresh
  por `--recreate`, persona única, somente leitura. SC-008 alvo **≥80%**.
- **Fase 2 (futura, condicional)**: backend Weaviate para hybrid search real → FR-017 pleno e
  SC-008 ≥95%. Gatilho: evidência de uso (buscas por termo literal retornando "não encontrei" com a
  página existente). Ver R1/R3 em `research.md`.

## Implementação (visão; o detalhamento por tarefa é do `/speckit-tasks`)

1. **`agents/kurisu/tools.py`** (novo): `buscar_na_base(query: str)` — chama `rag.retrieval_query()`
   com `top_k` largo + `Ranking(RankService)`, aplica o limiar de relevância (R7), e retorna os
   trechos com `source_display_name`/`source_uri` para citação. Inicializa `vertexai` com a service
   account (`GCP_CREDENTIALS_JSON`) e lê o corpus de `VERTEX_RAG_CORPUS`.
2. **`agents/kurisu/agent.py`**: usar a FunctionTool nova em vez de `VertexAiRagRetrieval` (a persona
   única e a instrução já estão prontas).
3. **`coordinator/agent.py`**: ajustar a descrição de roteamento da Kurisu (wiki curada, não "vault
   Obsidian + diário" — diário é a 028).
4. **Eval / validação**: montar o eval set e rodar os cenários do `quickstart.md`.

## Riscos & mitigações

| Risco | Mitigação |
|---|---|
| Recall de termo exato < esperado (sem hybrid) | Reranker + fallback honesto (US2); gatilho de fase 2 documentado |
| `rag.retrieval_query` / `RagRetrievalConfig` variar por versão do SDK | Fixar `google-cloud-aiplatform>=1.71`; `quickstart.md` valida a chamada real antes do deploy |
| Citação inventada pelo modelo | Instrução força citar só `source_display_name` real; SC-009 verifica que resolvem para arquivo |
| Rebuild (`--recreate`) gera novo corpus id | Passo de atualizar `VERTEX_RAG_CORPUS` documentado no `quickstart.md` e no CLAUDE.md |
