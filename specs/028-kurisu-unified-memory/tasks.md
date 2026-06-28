---

description: "Task list — Kurisu: Memória Unificada sobre o Postgres (spec 028)"
---

# Tasks: Kurisu — Memória Unificada sobre o Postgres

**Input**: Design documents from `specs/028-kurisu-unified-memory/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: a spec **não** pede testes automatizados. Validação é manual (cenários V1–V6 do
`quickstart.md`) + eval set temporal. Exceção: `recency.py` é motor PURO reutilizável → leva
**doctests** (regra do usuário). Não há tarefas de teste unitário/integração — há tarefas de **validação**.

**Organization**: tarefas agrupadas por user story. **US4 (sync)** é o habilitador P1 e vem primeiro
entre as histórias — sem dados sincronizados, US1–US3 não são testáveis. A **busca multi-corpus** é
Foundational (transversal às 3 histórias de recuperação).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivo diferente, sem dependência pendente)
- **[Story]**: US1, US2, US3, US4
- Caminhos relativos à raiz do repo

> **PRÉ-REQUISITO DURO (do plan.md)**: a **027 precisa estar deployada e estável** (corpus da wiki +
> `buscar_na_base` em produção) **antes** de iniciar a 028. Nenhuma tarefa abaixo começa antes disso.

> **Nota de escopo**: o v1 entrega busca densa + reranker + recência pós-recuperação e sync incremental.
> 2º passe de rerank sobre a lista mesclada dos 2 corpora é **futuro** (gancho em T025).

---

## Phase 1: Setup (Infraestrutura compartilhada)

**Purpose**: dependências, credenciais e variáveis antes de qualquer código.

- [ ] T001 Confirmar que `requirements.txt` já cobre `google-cloud-aiplatform>=1.71`, `psycopg2-binary`, `google-cloud-storage` (nenhuma dep nova esperada); validar na `.venv`
- [ ] T002 [P] Definir `VERTEX_RAG_CORPUS_OPERACIONAL` como placeholder no `.env` local (e Dokploy no deploy); documentar a env var nova em `coordinator/CLAUDE.md`
- [ ] T003 [P] Confirmar pré-requisito: a 027 está deployada (corpus da wiki + `buscar_na_base` ativos) e a service account tem `roles/aiplatform.user` + `roles/storage.admin` + `roles/serviceusage.serviceUsageAdmin`

---

## Phase 2: Foundational (Pré-requisito bloqueante)

**Purpose**: a infra base da memória + a busca multi-corpus, que TODAS as histórias precisam.

**⚠️ CRITICAL**: bloqueia US1–US4.

- [ ] T004 Criar o subpacote `agents/kurisu/memory/` (`__init__.py`) + infra base: garantir o **corpus operacional separado** (criar em Serverless mode se não existir, embedding `text-multilingual-embedding-002`, seguindo o padrão do `setup_kurisu_rag.py`), init `vertexai`, helpers de cliente GCS e de conexão PostgreSQL **read-only** (`DATABASE_URL`)
- [ ] T005 [P] Criar `agents/kurisu/recency.py` — motor **puro** (sem banco): filtrar candidatos por janela de `doc_date` (UTC-3) quando a pergunta é por período; reordenar por `score × decaimento(idade)` quando há viés de recência; passar direto quando atemporal. Docstrings Google-style + **doctests** (R6)
- [ ] T006 Estender `agents/kurisu/tools.py` (`buscar_na_base`) conforme [contracts/busca-multi-corpus.md](./contracts/busca-multi-corpus.md): ler `VERTEX_RAG_CORPUS` (wiki) + `VERTEX_RAG_CORPUS_OPERACIONAL`; **2 chamadas `retrieval_query`** (a API aceita só 1 corpus — validado), merge dos trechos, aplicar `recency.py`, limiar + top-N; `domain`/`doc_date` no trecho; `indisponivel` só se **ambos** ausentes, degrada se só um existe

**Checkpoint**: a busca multi-corpus funciona (com o corpus operacional ainda vazio, cai na wiki) — habilita validar todas as histórias.

---

## Phase 3: User Story 4 - Manter a memória fresca (Priority: P1 — habilitador) 🎯

**Goal**: um job agendado sincroniza, incremental, os domínios do Postgres para o corpus operacional;
itens removidos somem; trava ≤50% protege contra remoção em massa.

**Independent Test**: criar uma tarefa/bullet novo → rodar o sync → consultável; apagar na origem →
rodar o sync → some da memória. Forçar passe de remoção >50% → trava dispara.

### Implementation for User Story 4

- [ ] T007 [US4] Criar `agents/kurisu/memory/render.py` — render dos documentos (resumo datado vs individual, R4) + metadados obrigatórios: `doc_date` (UTC-3 via `AT TIME ZONE`), `domain`, `source_ref`, `source_type`, `content_hash` ([data-model.md](./data-model.md))
- [ ] T008 [US4] Criar `agents/kurisu/memory/exporters.py` com os exporters de **resumo** (read-only, UTC-3): `export_tarefas` (Kaguya, tarefas concluídas) e `export_financas` (Nami, gastos por período) — conforme [contracts/exporters.md](./contracts/exporters.md)
- [ ] T009 [US4] Em `agents/kurisu/memory/exporters.py`, adicionar os exporters **individuais**: `export_diario` (Violet/bullets) e `export_pessoas` (Komi, 1 doc/pessoa)
- [ ] T010 [US4] Em `agents/kurisu/memory/exporters.py`, adicionar os exporters de **mídia** (individuais): `export_livros`, `export_filmes`, `export_animes`, `export_series` (Frieren/Akane/Marin/Mai, com data/nota)
- [ ] T011 [US4] Criar o estado de **watermark** por domínio (`last_synced_at`, `doc_count`, `last_run_at`) — tabela leve própria OU arquivo de estado; decidir e implementar o acesso ([data-model.md](./data-model.md))
- [ ] T012 [US4] Criar `agents/kurisu/memory/sync.py` — orquestrador conforme [contracts/sync-job.md](./contracts/sync-job.md): por domínio, export incremental (`since=watermark`), `import_files` p/ novos e `delete_file`+reimport p/ editados (de-dup por URI), detectar removidos, **trava ≤50%** por domínio (aborta+alerta), atualizar watermark só em sucesso, idempotente
- [ ] T013 [US4] Criar `scripts/sync_kurisu_memory.py` — entrypoint fino do job (flags `--dry-run`, `--domain`) que chama `agents.kurisu.memory.sync`
- [ ] T014 [P] [US4] Criar `scripts/Dockerfile.kurisu-sync` — imagem do job agendado (espelha `scripts/Dockerfile.backup`: Python + deps + entrypoint), para rodar no Dokploy com `DATABASE_URL` + `GCP_CREDENTIALS_JSON`
- [ ] T015 [US4] Validar o ciclo de frescor (`quickstart.md` Passo 4): criar item → sync → consultável (SC-002); apagar → sync → some (SC-003); rodar 2x sem mudança → nenhuma alteração (idempotência, C1: 0 escritas na origem)
- [ ] T016 [US4] Validar a **trava anti-catástrofe** (`quickstart.md` Passo 5): passe que removeria >50% dos docs de um domínio → aborta a remoção + alerta, nada apagado (SC-005, FR-007)

**Checkpoint**: memória populada e fresca + `VERTEX_RAG_CORPUS_OPERACIONAL` configurado — histórias de recuperação testáveis.

---

## Phase 4: User Story 1 - Atividade num período (Priority: P1) 🎯 MVP

**Goal**: "o que fiz esta semana?" → atividade real do intervalo (tarefas/bullets/mídia), datas UTC-3,
sem vazar outras semanas.

**Independent Test**: com atividade conhecida numa semana, perguntar por ela e conferir itens reais +
datas corretas; o item mais recente tende a vir primeiro.

- [ ] T017 [US1] Validar V1 do `quickstart.md`: "o que fiz na semana de X" → atividade real do intervalo, datas em **UTC-3** (SC-001). Ajustar `recency.py` (janela) e/ou `render.py` (resumo datado) se as datas/intervalos saírem errados
- [ ] T018 [US1] Validar V6 (recência): em empate de relevância, o item mais recente vem primeiro em ≥90% (SC-006). Ajustar o decaimento em `recency.py` se necessário

**Checkpoint**: MVP — perguntar atividade por período e receber resposta ancorada, datada e recente.

---

## Phase 5: User Story 2 - Diário por tema (Priority: P1)

**Goal**: "o que escrevi no diário sobre carreira?" → bullets reais do tema, citando datas; honesto
quando não há nada.

**Independent Test**: com bullets conhecidos sobre um tema, perguntar pelo tema → bullets reais com
datas; tema ausente → "não encontrei no diário".

- [ ] T019 [US2] Validar V2 do `quickstart.md`: diário sobre um tema → bullets reais citando datas (FR-011); tema ausente → honestidade da 027 (FR-004). Ajustar `export_diario`/citação em `agent.py` se o modelo não citar datas ou misturar wiki

**Checkpoint**: US1 + US2 — atividade e diário recuperáveis.

---

## Phase 6: User Story 3 - Consumo de mídia (Priority: P2)

**Goal**: "que filmes vi em maio?" / "que livros li este ano?" → itens reais do período, com nota/data.

**Independent Test**: com logs de mídia num período, perguntar por período/domínio → itens reais com
data e nota quando há.

- [ ] T020 [US3] Validar V3 do `quickstart.md`: mídia por período/domínio → itens reais com data e nota (US3). Ajustar os exporters de mídia (T010) se faltarem nota/data ou vazarem períodos

**Checkpoint**: US1–US3 independentes e funcionais.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: validar critérios mensuráveis, busca unânime e documentação.

- [ ] T021 [P] Validar V4 e V5 do `quickstart.md`: pergunta de wiki continua respondida pela wiki (busca unânime não atrapalha, FR-009); tema ausente em tudo → honesto (FR-004)
- [ ] T022 [P] Montar e rodar o eval set temporal (`quickstart.md` Passo 6) e registrar métricas vs. metas: SC-001 (≥90% atividade/datas), SC-002 (≤24h), SC-003 (100% remoção), SC-005 (100% trava), SC-006 (≥90% recência)
- [ ] T023 [P] Atualizar `agents/kurisu/CLAUDE.md`: memória unificada, **cross-domain justificado** (Princ. I/III), busca multi-corpus, exporters, sync, env var nova
- [ ] T024 [P] Atualizar `coordinator/agent.py`: roteamento da Kurisu agora **inclui** diário/finanças/atividade do dia a dia (a 028 ativou — remover a ressalva "fatia 028 não ativada" da 027)
- [ ] T025 [P] Registrar no backlog o **2º passe de rerank** sobre a lista mesclada dos 2 corpora (melhora a comparabilidade de scores entre corpora) — futuro, sob gatilho de qualidade

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências (além do pré-requisito 027 deployada).
- **Foundational (Phase 2)**: depende do Setup — bloqueia US1–US4.
- **US4 (Phase 3)**: depende da Foundational — habilita as histórias de recuperação (popula dados).
- **US1 (Phase 4)**: validação depende de US4 (dados) + Foundational (busca).
- **US2 (Phase 5)** e **US3 (Phase 6)**: dependem de US4 + Foundational; independentes entre si e de US1.
- **Polish (Phase 7)**: depende das histórias desejadas prontas.

### Within Each Phase

- Foundational: `recency.py` (T005) antes de `tools.py` (T006, que o usa). T004 (infra) independe de T005.
- US4: `render.py` (T007) antes dos exporters (T008–T010); exporters antes do `sync.py` (T012);
  `sync.py` antes do entrypoint (T013); código antes da validação (T015–T016).

### Parallel Opportunities

- Setup: T002, T003 em paralelo (após T001).
- Foundational: T005 (recency.py) em paralelo com T004 (memory/ infra) — arquivos distintos.
- US4: T014 (Dockerfile) em paralelo com a lógica; T008/T009/T010 **não** são paralelas entre si (mesmo arquivo `exporters.py`).
- Histórias US1/US2/US3 podem ser validadas em paralelo após US4.
- Polish: T021–T025 em paralelo (arquivos/atividades distintas).
- **Atenção (mesmo arquivo)**: T008/T009/T010 (`exporters.py`); T006 depende de T005 (`tools.py`←`recency.py`).

---

## Implementation Strategy

### MVP First (Foundational + US4 + US1)

1. Phase 1 (Setup) → Phase 2 (Foundational: corpus operacional + recency + busca multi-corpus).
2. Phase 3 (US4): exporters + sync + job agendado → popular a memória.
3. Phase 4 (US1): **PARAR e VALIDAR** — "o que fiz esta semana" com datas UTC-3 e recência.
4. Deploy/demo se pronto.

### Incremental Delivery

1. Setup + Foundational + US4 → memória fresca + busca pronta.
2. + US1 → **MVP** (atividade por período).
3. + US2 → diário por tema.
4. + US3 → consumo de mídia.
5. Polish: busca unânime + eval + docs + roteamento.

---

## Notes

- [P] = arquivos diferentes, sem dependência pendente.
- O grosso do esforço é **US4** (exporters dos 8 domínios + sync incremental com prune/trava) e a
  **busca multi-corpus** (T006) — US1/US2/US3 são majoritariamente validação + ajuste fino.
- O sync é **batch** (job agendado, padrão `backup_postgres.py`), nunca acoplado ao runtime do bot.
- **Read-only** nas tabelas de origem (FR-002) e **UTC-3** em toda data (FR-010) são invariantes de
  TODO exporter — verificar em cada um.
- Comentários em português e docstrings Google-style (com doctests no `recency.py`) — regra do usuário.
- Commit após cada tarefa ou grupo lógico (quando o usuário pedir — ele commita manualmente).
