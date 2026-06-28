# Implementation Plan: Kurisu — Memória Unificada sobre o Postgres

**Branch**: `master` (sem branch dedicada — regra do usuário) | **Date**: 2026-06-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/028-kurisu-unified-memory/spec.md`

## Summary

Estender a memória da Kurisu para além da wiki (027): indexar **tudo que os agentes geram no
Postgres** (tarefas, diário, finanças, livros, filmes, animes, séries, pessoas) num **corpus Vertex
AI RAG operacional separado**, mantido fresco por um **job de sync agendado** (noturno, incremental).
A Kurisu passa a responder de forma unânime sobre wiki + atividade real, com peso de recência e
citação da origem.

Abordagem técnica (resolvida em [research.md](./research.md)):
- **Corpus separado** (decisão do clarify) em Serverless mode — isola do `--recreate` da wiki (027).
- **Busca multi-corpus** via **2 chamadas `retrieval_query`** (a API só aceita 1 corpus por chamada —
  validado) + **merge + reordenação por reranker e recência** no código. Isso unifica a busca E
  resolve o *wrinkle* da recência pós-recuperação (FR-005) no mesmo ponto.
- **Sync** seguindo o **padrão do `backup_postgres.py`**: um job agendado containerizado que roda
  `scripts/sync_kurisu_memory.py` (lê Postgres read-only, gera documentos, sobe ao GCS,
  `rag.import_files` para novos/alterados, `rag.delete_file` para removidos, trava anti-catástrofe ≤50%).
- **Exporters por domínio** em `agents/kurisu/memory/` — a lógica de domínio da memória fica no pacote
  da Kurisu (Princípio III), o script em `scripts/` é só o entrypoint fino.

## Technical Context

**Language/Version**: Python 3.11 (mesma do coordinator/agentes)

**Primary Dependencies**: `google-cloud-aiplatform>=1.71` (`vertexai.preview.rag` p/ Serverless +
`retrieval_query`, `import_files`, `delete_file`, `RagRetrievalConfig`, `RankService`),
`psycopg2-binary` (leitura **síncrona** read-only das tabelas dos agentes — Princípio de Arch.),
`google-cloud-storage` (espelho dos documentos no GCS antes de importar)

**Storage**: Vertex AI RAG Engine — **corpus operacional SEPARADO** (`VERTEX_RAG_CORPUS_OPERACIONAL`),
Serverless mode, vector DB `RagManagedVertexVectorSearch`, embedding `text-multilingual-embedding-002`.
Leitura do Postgres existente (`DATABASE_URL`); nenhum storage novo.

**Testing**: validação manual via Telegram (cenários do `quickstart.md`) + eval set temporal
(perguntas "o que fiz na semana de X"). Teste do ciclo de sync (criar→sync→consultar→apagar→sync→sumir).

**Target Platform**: o **job de sync** roda como serviço agendado (padrão `backup_postgres.py`) com
acesso a `DATABASE_URL` + `GCP_CREDENTIALS_JSON`. A **busca** roda no `makima-web` (a tool da Kurisu).

**Project Type**: extensão do agente ADK `agents/kurisu/` + um job batch em `scripts/`.

**Performance Goals**: frescor ≤24h (SC-002) via 1 ciclo de sync/dia; busca interativa por Telegram
(2 queries Vertex + merge, < ~1s aceitável). Volume: centenas a poucos milhares de documentos.

**Constraints**: `gemini-2.5-flash`; respostas em português, HTML do Telegram; **somente leitura** das
tabelas de origem (FR-002); datas em `America/Sao_Paulo` (UTC-3), nunca UTC do container.

**Scale/Scope**: usuário único; 8 domínios; crescimento lento. Trava de prune ≤50% por domínio.

## Constitution Check

*GATE: avaliado contra `.specify/memory/constitution.md` v1.0.1. Resultado: **PASSA com justificativas**.*

| Princípio | Status | Observação |
|---|---|---|
| **I. Agent Specialization** | ⚠️→✅ | A memória unificada é **inerentemente cross-domain**: lê tabelas de Nami/Kaguya/Violet/Komi/Frieren/Akane/Marin/Mai. Justificado como **fluxo de negócio real** (o produto "segundo cérebro"), documentado aqui e no CLAUDE.md da Kurisu. A leitura é **read-only** e isolada em *exporters* dedicados — os agentes de origem não são chamados em runtime (sem acoplamento de execução, só de schema). |
| **II. Hybrid Batch + Agentic** | ✅ | O **sync** é batch agendado → script Python (padrão `backup_postgres.py`), **fora** do runtime do bot. A **busca** é a camada agentic (tool da Kurisu). Exatamente a divisão exigida. |
| **III. Self-Contained Agents** | ⚠️→✅ | A lógica de memória vive em `agents/kurisu/memory/` (não num agente novo). Acoplamento de **schema** com outros domínios é a contrapartida da memória unificada — mitigado: cada exporter isola um schema; mudança de schema de origem quebra só o exporter daquele domínio, não o resto. |
| **IV. Portuguese-First UX** | ✅ | Respostas em PT; citação legível da origem (FR-011). ⚠️ *mesma nota da 027*: constituição diz "Markdown", implementação real usa **HTML**. |
| **V. Minimal Footprint** | ✅ | **Não** cria agente novo (estende a Kurisu) nem storage novo (reusa Vertex + Postgres). O corpus separado é a unidade mínima necessária (compartilhar quebraria com o `--recreate`). Reusa o padrão de job do `backup_postgres.py` em vez de inventar agendador. |

**Complexity Tracking**: o cross-domain (Princ. I/III) é a única complexidade real — justificada pelo
valor central da feature e mitigada por exporters isolados + read-only. Sem violação não-justificada.

**Nota de conformidade**: o agendamento segue o padrão batch do projeto (`backup_postgres.py` /
Constituição II), não um novo mecanismo. Alternativa n8n→HTTP documentada em research.md (R1).

## Project Structure

### Documentation (this feature)

```text
specs/028-kurisu-unified-memory/
├── spec.md              # Especificação (já existe, clarificada)
├── plan.md              # Este arquivo
├── research.md          # Decisões técnicas (R1..R8)
├── data-model.md        # Documentos de memória, watermark, metadados
├── quickstart.md        # Cenários de validação (sync + busca temporal)
├── contracts/
│   ├── busca-multi-corpus.md  # Contrato da busca estendida (2 queries + merge + recência)
│   ├── exporters.md           # Contrato de um Domain Exporter
│   └── sync-job.md            # Contrato do job de sync (incremental + prune + trava)
└── checklists/
    └── requirements.md  # Checklist de qualidade (já existe, alinhado)
```

### Source Code (repository root)

```text
agents/kurisu/
├── tools.py             # MUDA: buscar_na_base → 2 queries (wiki + operacional) + merge + recência
├── recency.py           # NOVO: motor PURO de recência pós-recuperação (reordenar/filtrar por doc_date)
├── memory/              # NOVO subpacote — lógica de memória unificada (domain logic da Kurisu)
│   ├── __init__.py
│   ├── exporters.py     # NOVO: um exporter read-only por domínio → documentos de texto + metadados
│   ├── sync.py          # NOVO: orquestrador (watermark, import incremental, prune c/ trava ≤50%)
│   └── render.py        # NOVO: render dos documentos (resumo datado vs individual — representação mista)
└── CLAUDE.md            # MUDA: documenta memória unificada + cross-domain justificado

scripts/
├── sync_kurisu_memory.py     # NOVO: entrypoint fino do job (chama agents.kurisu.memory.sync)
└── Dockerfile.kurisu-sync    # NOVO (opcional): imagem do job agendado (espelha Dockerfile.backup)

coordinator/CLAUDE.md         # MUDA (pequeno): nova env var VERTEX_RAG_CORPUS_OPERACIONAL
```

**Structure Decision**: a lógica de memória (exporters, sync, render, recência) fica no pacote da
Kurisu (`agents/kurisu/memory/` + `recency.py`) — domain logic do agente, Princípio III. O
`scripts/sync_kurisu_memory.py` é só o entrypoint chamado pelo agendador (padrão do `backup_postgres.py`).
A busca multi-corpus vive em `tools.py` (estende `buscar_na_base`), reusando `recency.py`.

## Phasing (escopo e dependências)

- **Pré-requisito duro**: a **027** precisa estar **deployada e estável** (corpus da wiki + tool
  `buscar_na_base` em produção). A 028 não inicia antes disso.
- **v1 (esta spec)**: corpus operacional separado, exporters dos 8 domínios, sync incremental noturno
  com prune+trava, busca multi-corpus com recência pós-recuperação, citação da origem.
- **Futuro (fora de escopo)**: write-back (sugerir tarefa de estudo ao detectar gap), frescor em
  tempo real, reranking de segundo passe sobre a lista mesclada dos 2 corpora.

## Implementação (visão; detalhamento por tarefa é do `/speckit-tasks`)

1. **`agents/kurisu/memory/render.py` + `exporters.py`**: por domínio, ler as tabelas (read-only,
   UTC-3) e renderizar documentos (resumo datado p/ atividade/finanças; individual p/ diário/mídia/
   pessoas), cada um com `doc_date`, `domain`, `source_ref`, `content_hash` no metadado.
2. **`agents/kurisu/memory/sync.py`**: watermark/hash por domínio; sobe documentos novos/alterados ao
   GCS e `import_files`; `delete_file` dos removidos; **trava ≤50%** por domínio; idempotente.
3. **`scripts/sync_kurisu_memory.py`** (+ `Dockerfile.kurisu-sync`): entrypoint do job agendado.
4. **`agents/kurisu/recency.py` + `tools.py`**: estender `buscar_na_base` p/ 2 queries (wiki +
   operacional), merge por score do reranker, recência pós-recuperação (reordenar/filtrar por
   `doc_date` quando a pergunta é temporal), top-N final.
5. **Env**: `VERTEX_RAG_CORPUS_OPERACIONAL` no `.env`/Dokploy; doc no `coordinator/CLAUDE.md`.

## Riscos & mitigações

| Risco | Mitigação |
|---|---|
| `retrieval_query` aceita só 1 corpus (validado) | Busca = 2 queries + merge no código; já necessário p/ recência |
| Scores de reranker de 2 queries não perfeitamente comparáveis | Mesmo RankService/escala; v1 mescla por score; 2º passe de rerank é backlog |
| Acoplamento de schema com 8 domínios (Princ. I/III) | Exporters isolados por domínio; read-only; quebra contida a 1 exporter |
| Prune apagar demais (defeito de leitura) | Trava ≤50% por domínio aborta e alerta (FR-007/SC-005) |
| Vertex de-dup por URI não atualiza item editado | `delete_file` + reimport no sync (não só reimport) |
| Fuso UTC vs UTC-3 (bug histórico Violet) | `AT TIME ZONE 'America/Sao_Paulo'` na leitura; `doc_date` já local |
