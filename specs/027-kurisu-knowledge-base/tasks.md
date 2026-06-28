---

description: "Task list — Kurisu: Assistente de Base de Conhecimento (spec 027)"
---

# Tasks: Kurisu — Assistente de Base de Conhecimento

**Input**: Design documents from `specs/027-kurisu-knowledge-base/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: a spec **não** pede testes automatizados. A validação é manual (cenários V1–V9 do
`quickstart.md`) + um eval set de perguntas-gold para os SC. Por isso não há tarefas de teste
unitário/integração — há tarefas de **validação**.

**Organization**: tarefas agrupadas por user story. US5 (ingestão) é o habilitador P1 e vem primeiro
entre as histórias, porque US1–US4 não são testáveis sem o corpus populado.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivo diferente, sem dependência pendente)
- **[Story]**: a qual user story a tarefa pertence (US1, US2, US3, US4, US5)
- Caminhos de arquivo são absolutos/relativos à raiz do repo

> **Nota de escopo (faseado — ver plan.md)**: o v1 entrega recuperação **densa + reranker**. Hybrid
> search real / termo-exato pleno (FR-017, SC-008 ≥95%) é **fase 2** (backend Weaviate) e **não** tem
> tarefas aqui — só o gancho documentado em T023.

---

## Phase 1: Setup (Infraestrutura compartilhada)

**Purpose**: garantir dependências, credenciais e variáveis antes de qualquer código.

- [x] T001 Confirmar `google-cloud-aiplatform>=1.71` em `requirements.txt` e instalar na `.venv`; validar que `from vertexai import rag` expõe `RagRetrievalConfig`, `Ranking` e `RankService` (a versão precisa ter reranker)
- [x] T002 [P] Conferir/definir as env vars `GCP_CREDENTIALS_JSON`, `GCP_PROJECT_ID` no `.env` local (e Dokploy no deploy); deixar `VERTEX_RAG_CORPUS` como placeholder até T007
- [x] T003 [P] Confirmar que a service account GCP tem os papéis `roles/aiplatform.user` (corpus, embeddings, RankService) e `roles/storage.admin` (bucket da ingestão) — service account validada; APIs `vectorsearch` e `discoveryengine` habilitadas (Serverless mode)

---

## Phase 2: Foundational (Pré-requisito bloqueante)

**Purpose**: provar que a ponte com o Vertex funciona antes de construir a tool e rodar a ingestão.

**⚠️ CRITICAL**: bloqueia US5 e US1.

- [x] T004 Smoke-test de conectividade: script `python -c` que faz `vertexai.init(project, location="us-central1", credentials=<service account>)` + `rag.list_corpora()` e imprime o resultado — confirma credenciais/projeto/região válidos. Não escreve nada.

**Checkpoint**: conectividade Vertex OK — ingestão (US5) e tool (US1) podem começar.

---

## Phase 3: User Story 5 - Popular e atualizar a base (Priority: P1 — habilitador) 🎯

**Goal**: o corpus do Vertex AI RAG fica populado com a camada `wiki/` (+ `index.md`) e configurado na
env, de forma re-executável. (O ingester `scripts/setup_kurisu_rag.py` já existe — aqui é operação +
validação, sem mudança de código.)

**Independent Test**: rodar a ingestão sobre a wiki atual e verificar que todas as páginas elegíveis
ficam no corpus e nenhum arquivo de `raw/` foi indexado; editar uma página, re-rodar e confirmar que a
versão nova é a recuperada.

- [x] T005 [US5] Rodar `python -m scripts.setup_kurisu_rag --dry-run` e validar na amostra que **nenhum** caminho `raw/` aparece, só `wiki/` + `index.md` (SC-006); ver contrato [contracts/ingester-cli.md](./contracts/ingester-cli.md) C1/C4 — 410 arquivos, só `wiki/`
- [x] T006 [US5] Rodar a ingestão real `python -m scripts.setup_kurisu_rag`; capturar o `corpus resource name` impresso ao final (C5) — 345/410 importados; corpus `...ragCorpora/6199890982331219968`. Script migrado para **Serverless mode** (projeto novo bloqueado do Spanner mode)
- [x] T007 [US5] Configurar `VERTEX_RAG_CORPUS=<id capturado>` no `.env` local (e Dokploy no deploy) (FR-015) — `.env` local configurado; **Dokploy pendente** no deploy
- [ ] T008 [US5] Validar refresh: editar uma página da wiki, rodar `python -m scripts.setup_kurisu_rag --recreate`, atualizar `VERTEX_RAG_CORPUS` com o novo id e confirmar via consulta que o conteúdo novo é servido (SC-007, FR-013)

**Checkpoint**: corpus populado e `VERTEX_RAG_CORPUS` configurado — as histórias de consulta podem ser testadas.

---

## Phase 4: User Story 1 - Resposta ancorada na base (Priority: P1) 🎯 MVP

**Goal**: o usuário pergunta no Telegram, a Makima roteia para a Kurisu, que recupera material da base,
sintetiza a resposta e cita a(s) página(s) reais de onde veio.

**Independent Test**: com a base contendo notas de um tema conhecido, perguntar sobre o tema e verificar
que a resposta é fiel ao conteúdo e atribui a resposta a páginas reais da base.

### Implementation for User Story 1

- [x] T009 [US1] Criar `agents/kurisu/tools.py` com a função `buscar_na_base(query: str) -> dict` conforme [contracts/buscar_na_base.md](./contracts/buscar_na_base.md): `vertexai.init` com a service account (cliente em singleton global), lê `VERTEX_RAG_CORPUS`, chama `rag.retrieval_query` com `RagRetrievalConfig(top_k=<wide, ex. 10>, ranking=Ranking(rank_service=RankService(model_name="semantic-ranker-default-004")))`, monta a lista de `trechos` (texto, fonte=`source_display_name`, uri=`source_uri`, score). Docstring Google-style + comentários em português (regra do usuário)
- [x] T010 [US1] Em `agents/kurisu/tools.py`, mapear `status`: `"indisponivel"` quando `VERTEX_RAG_CORPUS` ausente/vazio ou exceção de rede/Vertex (capturada + log, sem stacktrace ao usuário) → FR-009; `"ok"` quando há trecho relevante. Retornar o dict `{status, trechos, mensagem}`
- [x] T011 [US1] Atualizar `agents/kurisu/agent.py`: importar `buscar_na_base` de `agents/kurisu/tools.py` e passá-la em `tools=[buscar_na_base]`, removendo a instância `VertexAiRagRetrieval`/`knowledge_tool` e o import correspondente (persona única e instrução já estão prontas)
- [x] T012 [US1] Validar V1 do `quickstart.md`: pergunta sobre tema na base → resposta sintetizada que **cita ≥1 página real** e nada inventado (SC-001, SC-009) — `buscar_na_base` validada direto: "ansiedade" → `ansiedade.md`/`filosofia-ansiedade-ludoviajante.md`; "alcool e cerebro" → `cortex-prefrontal.md`. Fonte derivada do `source_uri` (display_name vem vazio em serverless). Falta validar a resposta sintetizada via Telegram ponta-a-ponta
- [ ] T013 [US1] Validar roteamento Makima→Kurisu (US1 cenário 2): pergunta de conhecimento é encaminhada à Kurisu (e não a outro agente) (SC-003) — a rota já foi ajustada em `coordinator/agent.py`

**Checkpoint**: MVP funcional — perguntar e receber resposta ancorada + citada, ponta a ponta.

---

## Phase 5: User Story 2 - Honestidade quando a base não tem (Priority: P2)

**Goal**: quando a base não tem material relevante, a Kurisu declara isso explicitamente e não
apresenta conhecimento geral como se viesse da base.

**Independent Test**: perguntar sobre um tema comprovadamente ausente e verificar que a resposta declara
a ausência ("Não encontrei nada na sua base sobre isso").

### Implementation for User Story 2

- [ ] T014 [US2] Em `agents/kurisu/tools.py`, implementar o limiar de relevância (R7): `status="vazio"` quando nenhum candidato passa o threshold do reranker (limiar configurável via constante/env), de modo que material só tangencial caia em "vazio" e não em "ok" (US2 cenário 2 / edge "baixa relevância")
- [ ] T015 [US2] Validar V2 e V9 do `quickstart.md`: tema ausente → "não encontrei na base" **antes** de qualquer conhecimento geral (SC-002, FR-004); corpus vazio → "base indisponível" sem travar nem alucinar (FR-009)

**Checkpoint**: US1 + US2 funcionam — caminho feliz e fallback honesto.

---

## Phase 6: User Story 3 - Cruzar e sintetizar várias notas (Priority: P3)

**Goal**: numa pergunta ampla, a Kurisu recupera material de várias páginas e conecta os pontos numa
resposta coerente, citando as fontes envolvidas.

**Independent Test**: com a base contendo subtemas distintos sob um guarda-chuva comum, perguntar pelo
tema amplo e verificar que a resposta integra mais de uma página de forma conectada.

### Implementation for User Story 3

- [ ] T016 [US3] Em `agents/kurisu/tools.py`, garantir que o `top_n` final retornado contempla múltiplas páginas distintas (ex.: 3–5 trechos de fontes diferentes) para habilitar síntese multi-página; ajustar a instrução em `agent.py` apenas se o modelo despejar trechos soltos em vez de conectar (FR-007)
- [ ] T017 [US3] Validar V3 do `quickstart.md`: tema amplo → resposta conecta ≥2 páginas e cita as fontes envolvidas

**Checkpoint**: US1–US3 independentes e funcionais.

---

## Phase 7: User Story 4 - Quiz de revisão (Priority: P3)

**Goal**: a Kurisu gera perguntas de revisão (active recall) ancoradas exclusivamente no conteúdo da
base, e recusa quando não há material suficiente.

**Independent Test**: pedir um quiz sobre um tema presente na base e verificar que as perguntas derivam
do conteúdo real; pedir sobre tema ausente e verificar a recusa.

### Implementation for User Story 4

- [ ] T018 [US4] Validar V4 e V5 do `quickstart.md`: quiz ancorado no conteúdo da base; recusa explícita quando não há material suficiente (FR-008). Refinar a instrução em `agents/kurisu/agent.py` somente se o modelo inventar perguntas fora da base

**Checkpoint**: todas as user stories de consulta independentes e funcionais.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: validação dos critérios mensuráveis, edge cases restantes e documentação.

- [ ] T019 [P] Montar o eval set de perguntas-gold (na-base / fora-da-base / termo-exato) conforme `quickstart.md` Passo 5
- [ ] T020 Rodar o eval set e registrar as métricas vs. metas v1: SC-001 (100% cita real), SC-002 (≥95% sinaliza ausência), SC-003 (≥90% roteamento), SC-004 (≥80% sem follow-up), SC-008 (**≥80%** termo exato no v1), SC-009 (100% citações resolvem)
- [ ] T021 [P] Validar edge cases restantes: V6 (pergunta vaga → reformulação, FR-010), V7 (termo literal — parcial no v1, SC-008), V8 (pedido de escrita → somente leitura, FR-005/SC-005)
- [ ] T022 [P] Conferir que `agents/kurisu/CLAUDE.md` reflete a implementação final (tool `buscar_na_base`, params/threshold reais) e marcar o checklist de Definition of Done do `quickstart.md`
- [ ] T023 [P] Registrar o gancho da **fase 2** (hybrid/Weaviate para FR-017/SC-008 ≥95%) como item de backlog, com o gatilho de R1/R3 (buscas por termo literal retornando "não encontrei" no uso real)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — começa já.
- **Foundational (Phase 2)**: depende do Setup — bloqueia US5 e US1.
- **US5 (Phase 3)**: depende da Foundational — habilita todas as histórias de consulta.
- **US1 (Phase 4)**: o **código** (T009–T011) depende só da Foundational; a **validação** (T012–T013) depende de US5 (corpus populado).
- **US2 (Phase 5)**: depende de US1 (a tool e os status `vazio`/`indisponivel` nascem em US1).
- **US3 (Phase 6)** e **US4 (Phase 7)**: dependem de US1; independentes entre si.
- **Polish (Phase 8)**: depende das histórias desejadas estarem prontas.

### Within Each User Story

- `tools.py` antes de `agent.py` (T009/T010 antes de T011).
- Código antes da validação.

### Parallel Opportunities

- Setup: T002 e T003 em paralelo (T001 é pré-requisito de import).
- Polish: T019, T021, T022, T023 em paralelo (arquivos/atividades distintas); T020 depende de T019.
- US3 e US4 podem ser trabalhadas em paralelo após US1.
- **Atenção**: T009, T010, T014, T016 mexem todas em `agents/kurisu/tools.py` — **não** são paralelas entre si (mesmo arquivo).

---

## Parallel Example: Setup

```bash
# Após T001, rodar em paralelo:
Task: "T002 — definir env vars GCP no .env/Dokploy"
Task: "T003 — confirmar papéis IAM da service account"
```

---

## Implementation Strategy

### MVP First (US5 + US1)

1. Phase 1 (Setup) → Phase 2 (Foundational).
2. Phase 3 (US5): popular o corpus + configurar `VERTEX_RAG_CORPUS`.
3. Phase 4 (US1): tool `buscar_na_base` + wiring no `agent.py`.
4. **PARAR e VALIDAR**: V1 + roteamento (perguntar e receber resposta ancorada e citada).
5. Deploy/demo se pronto.

### Incremental Delivery

1. Setup + Foundational + US5 → fundação pronta.
2. + US1 → testar → **MVP** (resposta ancorada).
3. + US2 → testar → fallback honesto.
4. + US3 → testar → síntese multi-nota.
5. + US4 → testar → quiz.
6. Polish: eval set + edge cases + docs.

---

## Notes

- [P] = arquivos diferentes, sem dependência pendente.
- O grosso do esforço é **T009/T010** (a tool `buscar_na_base`) — US2/US3/US4 são majoritariamente
  validação + ajuste fino, porque a instrução da persona já cobre honestidade, síntese e quiz.
- A ingestão (US5) é **operacional** (rodar o script existente), não código novo.
- Comentários em português e docstrings Google-style em todo código novo (regra do usuário).
- Commit após cada tarefa ou grupo lógico (quando o usuário pedir — ele commita manualmente).
