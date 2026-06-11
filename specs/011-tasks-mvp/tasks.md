# Tasks: Tasks MVP — Fase 1 do Sistema de Tarefas Próprio

**Input**: Design documents from `/specs/011-tasks-mvp/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: incluídos onde a spec exige verificação automatizada (SC-005 atomicidade,
SC-006 posições) e no padrão existente do repo (`tests/test_finances_router.py`).

**Organization**: agrupado por user story (US1–US5 da spec), cada uma independentemente
testável.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

**Purpose**: schema no banco — pré-requisito físico de tudo.

- [x] T001 Criar `agents/kaguya/schema_tasks_pg.sql` transcrevendo fielmente o DDL completo da master (`specs/010-kaguya-tasks-app/data-model.md`): todas as tabelas (`task_project_groups`, `task_projects`, `task_columns`, `tasks`, `task_recurrences`, `task_tags`, `task_tag_links`, `task_filters`, `habits`, `habit_checkins`), índices e constraints, tudo idempotente (`IF NOT EXISTS`)
- [x] T002 Atualizar `scripts/setup_schemas.py` para aplicar `schema_tasks_pg.sql` e o seed do Inbox (`INSERT ... ON CONFLICT DO NOTHING` protegido por `uq_task_projects_inbox`); rodar contra o banco de dev e verificar `\dt task_*`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: a camada de lógica única (research D1) — os dois canais são fachadas sobre
ela; nenhuma user story funciona sem isso.

**⚠️ CRITICAL**: nenhuma story começa antes desta fase terminar.

- [x] T003 [P] Criar `agents/kaguya/tools_projects.py` sobre `agents/db.py`: `get_sidebar`, `create_project`, `update_project`, `delete_project(mode)`, `create_group`, `update_group`, `delete_group`, `list_columns`, `create_column`, `update_column`, `delete_column` — com regras do Inbox (indelével/inarquivável), única coluna done por projeto, posições esparsas ×1000, retornos `{"status": ...}` em mutações (contrato: `contracts/api-tasks.md`)
- [x] T004 [P] Criar `agents/kaguya/tools_tasks.py` sobre `agents/db.py`: `list_tasks`, `list_tasks_today` (shape `{overdue, today}` por projeto), `search_tasks`, `list_trash`, `create_task` (default Inbox, `type` default `task` ∈ {task,event,birthday}, `parent_id` 1 nível), `update_task` (regra de coluna ao trocar projeto, aceita `type`), `complete_task(cascade)` (erro `needs_cascade` com subtarefas abertas), `reopen_task` (bloqueia pai concluído), criar subtarefa em pai concluído → erro sugerindo reabrir o pai (edge case da spec), `reorder_task` (posição esparsa + renormalização transacional), `delete_task`/`restore_task` (soft delete) — validações e mensagens de erro em português (regras: `data-model.md`)
- [x] T005 Criar `tests/agents/test_kaguya_tasks.py` (padrão `tests/agents/`): posições esparsas (inserir entre vizinhos, colisão → renormalização, 100+ reordenações — SC-006), cascata de conclusão, bloqueio de reabertura com pai concluído, regras do Inbox e de exclusão de projeto/coluna; rodar `python -m pytest tests/agents/test_kaguya_tasks.py -v`

**Checkpoint**: camada de lógica completa e testada — US1–US5 podem começar (US1 e US2 em paralelo).

---

## Phase 3: User Story 1 - Gerenciar tarefas pelo webapp (Priority: P1) 🎯 MVP

**Goal**: CRUD visual completo em `/tasks` — sidebar (grupos/projetos/Inbox), lista com
subtarefas e drag-and-drop, lixeira.

**Independent Test**: quickstart V1 — ciclo de vida completo de uma tarefa só pelo
webapp, com o bot desligado.

### Implementation for User Story 1

- [ ] T006 [US1] Criar `webapp/backend/routers/tasks.py` envelopando as funções de T003/T004 conforme `contracts/api-tasks.md` (todas as rotas com `Depends(require_user)`, Pydantic bodies, `_check_result` **só** em mutações) e registrar o router em `webapp/backend/main.py`
- [ ] T007 [US1] Criar `tests/test_tasks_router.py` (padrão `test_finances_router.py`): happy paths de CRUD, `needs_cascade`, erros 400 (Inbox indelével, projeto inexistente); rodar pytest
- [ ] T008 [P] [US1] Criar fundação do shell seguindo o **guia canônico** (`specs/010-kaguya-tasks-app/frontend-design-guide.md` §0–2): `webapp/frontend/src/pages/kaguya/kaguya.css` (tokens OKLCH escopados `.kg-app`; temas `data-theme` light/dark; **acento azul `#3B82C4` por padrão** + atributos `data-density`/`data-pmark`/`data-anim`; fontes Hanken Grotesk/Playfair/DM Sans/DM Mono), `types.ts` (espelhando `contracts/api-tasks.md`, incluindo `type` = `task`/`event`/`birthday`), `kaguyaApi.ts` sobre `lib/api.ts`, e os primitivos `ui/` compartilhados (Icon, Check, PrioFlag, chips Tag/Date/Proj); copiar o asset `kaguya.jpg` do handoff para `webapp/frontend/public/`
- [ ] T009 [US1] Criar `webapp/frontend/src/pages/kaguya/KaguyaShell.tsx` (navegação interna por estado `{view, param}`; brand mark com `kaguya.jpg` + wordmark Playfair; footer "Voltar à Makima"; `PALETTE_MAP` do acento — guia §1/§5), `components/SidebarNav.tsx` (views fixas, depois **"Listas"** — grupos → listas com contagem, Inbox no topo; rótulo "Listas", não "Projetos") e `TweaksPanel.tsx` (**tema · acento (azul/rosa/violeta/dourado) · densidade · marca de prioridade (bar/dot/fill) · animações** — guia §10); incluir busca no header (`GET /api/tasks/search` — paridade com `search_tasks` da Kaguya) e adotar o padrão re-fetch após cada mutação (mitigação last-write-wins da spec)
- [ ] T010 [US1] Registrar a rota `/tasks/*` em `webapp/frontend/src/App.tsx` (antes do catch-all) e a entrada Kaguya em `components/Layout.tsx` (cor `--c-kaguya`)
- [ ] T011 [US1] Criar `screens/ListScreen.tsx` + `components/TaskRow.tsx` (guia §4.1): lista por `position`, traço/bandeira de prioridade (`PrioFlag`) à esquerda, **subtarefas ricas expandidas por padrão** (`defaultSubOpen` — cada uma com sua bandeira de prioridade e descrição), glyph de tipo, checkbox de conclusão com pop bounce + fade/slide-out (confirmação de cascata), edição inline do título, drag-and-drop chamando `POST /position`; seção colapsável de concluídas (`include_completed`) com ação de reabrir
- [ ] T012 [P] [US1] Criar `modals/TaskModal.tsx` e `modals/ProjectModal.tsx` (portar o padrão `FieldDef`/`FormModal` da Nami — copiar e adaptar, não importar cross-shell; guia §9.2): TaskModal com campos título/notas/lista/prioridade/**tipo (tarefa/evento/aniversário)**/data/hora e **subtarefas com prioridade + descrição próprias**; ProjectModal titulado "Nova lista" (nome/grupo/cor/ícone) com exclusão escolhendo mover-para-Inbox vs excluir
- [ ] T013 [US1] Criar view de lixeira (estado em `ListScreen` ou `screens/TrashScreen.tsx`): listar soft-deletadas por projeto e restaurar
- [ ] T014 [US1] Validar quickstart V1 completo com o bot desligado; `npm run build` sem erros

**Checkpoint**: webapp gerencia tarefas de ponta a ponta, sozinho.

---

## Phase 4: User Story 2 - Capturar e consultar pelo Telegram, sem TickTick (Priority: P1)

**Goal**: Kaguya operando 100% sobre o Postgres; TickTick fora do runtime.

**Independent Test**: quickstart V2 — ciclo completo só pelo Telegram, com o webapp
desligado; quickstart V6 — `grep -ri ticktick` limpo no runtime.

### Implementation for User Story 2

- [ ] T015 [US2] Reescrever `agents/kaguya/agent.py`: remover o `McpToolset` do TickTick da factory (manter o do Calendar intacto), registrar as tools de T003/T004 conforme `contracts/kaguya-tools.md`, e reescrever `_INSTRUCTION` — captura NLP em português com **eco da interpretação** (projeto/data/prioridade assumidos), confirmação obrigatória antes de `delete_task`/`delete_project`, fluxo `needs_cascade`, "o que tenho pra hoje?" = `list_tasks_today` + `list_events_today` (Calendar), personalidade e formatação HTML preservadas
- [ ] T016 [US2] Atualizar `agents/kaguya/tools.py` como fachada: re-exportar as tools novas; remover helpers HTTP do TickTick (token cache, requests diretos)
- [ ] T017 [US2] Atualizar `_MAKIMA_INSTRUCTION` em `coordinator/agent.py`: remover menções a TickTick, manter roteamento dos fluxos duplos (pagou → Kaguya; despesa futura → Nami + Kaguya; briefing → Nami + Kaguya)
- [ ] T018 [US2] Remover `mcp_servers/ticktick/` do repo (git guarda histórico — research D7) e conferir que nada importa dele (`grep -ri ticktick` em `coordinator/ agents/ webapp/backend/ mcp_servers/` retorna vazio)
- [ ] T019 [US2] Validar quickstart V2 (Telegram sozinho) e V6 (zero resíduo TickTick; bot sobe sem `TICKTICK_*`)

**Checkpoint**: os dois canais P1 vivos e independentes — paridade auditável (quickstart V3).

---

## Phase 5: User Story 3 - Kanban (Priority: P2)

**Goal**: segunda view sobre os mesmos dados; coluna done completa a tarefa.

**Independent Test**: quickstart V3.3 — colunas criadas, cards arrastados, done
completa, lista e Telegram refletem.

### Implementation for User Story 3

- [ ] T020 [US3] Criar `screens/KanbanScreen.tsx` + `components/TaskCard.tsx`: colunas por `position`, cards com chips mínimos, drag entre colunas (`PATCH column_id`), drop na done → `POST /complete` com a mesma animação/confirmação da lista
- [ ] T021 [US3] UI de gestão de colunas (em `KanbanScreen` ou `modals/`): criar/renomear/reordenar/excluir coluna, marcar done (única); alternador lista⇄kanban no header do projeto (kanban disponível só com colunas)
- [ ] T022 [US3] Validar cenários da US3: mover entre projetos com/sem board, excluir coluna com cards (tarefas ficam sem coluna), consistência lista⇄kanban⇄Telegram

**Checkpoint**: princípio "uma tarefa, várias views" provado.

---

## Phase 6: User Story 4 - Tela Hoje + quick-add (Priority: P3)

**Goal**: porta de entrada diária (hoje + vencidas) com captura em segundos.

**Independent Test**: quickstart V4.

### Implementation for User Story 4

- [ ] T023 [P] [US4] Criar `screens/TodayScreen.tsx`: consome `GET /api/tasks/today`, vencidas destacadas em vermelho-lacre + hoje, agrupadas por projeto; view default do shell
- [ ] T024 [P] [US4] Criar `lib/parseTask.ts` + `components/QuickAdd.tsx` com `ui/ParseMirror` (guia §6, research D6): parsing determinístico no frontend — `@lista` (prefixo case-insensitive contra a sidebar carregada) e `!alta|!media|!baixa` viram chips/segments destacados ao vivo no mirror (padrão visual `RichText` do Violet, classes `tok-proj`/`tok-prio-*`); `#` fica reservado para tags (Fase 2); token não resolvido permanece no título; `@inexistente` → Inbox com aviso
- [ ] T025 [US4] Integrar QuickAdd na TodayScreen (e no header da ListScreen) e validar quickstart V4

**Checkpoint**: ritual diário mínimo funcionando (embrião do Meu Dia da Fase 3).

---

## Phase 7: User Story 5 - Pagamento atômico (Priority: P3)

**Goal**: "paguei X" completa a tarefa e lança a despesa — tudo ou nada.

**Independent Test**: quickstart V5 + teste automatizado de falha simulada (SC-005).

### Implementation for User Story 5

- [ ] T026 [US5] Adicionar helper `create_transaction_on_cursor(cur, ...)` em `agents/nami/tools.py` (research D3): mesma validação/SQL da tool pública, operando no cursor recebido; refatorar a tool pública para delegar a ele (comportamento externo inalterado — rodar os testes existentes da Nami se houver)
- [ ] T027 [US5] Reescrever `complete_payment_task` e `create_expense_reminder` em `agents/kaguya/tools.py` conforme `contracts/kaguya-tools.md`: transação única (`get_conn()` + cursor compartilhado), some o status `partial`; reminder cria tarefa no Postgres (projeto "Finanças" por fuzzy, prioridade alta)
- [ ] T028 [US5] Adicionar a `tests/agents/test_kaguya_tasks.py` os casos de atomicidade: falha no lançamento → tarefa segue aberta; falha na conclusão → zero despesa (SC-005); validar quickstart V5 no Telegram

**Checkpoint**: todas as user stories funcionais.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T029 [P] PATCH amendment da constitution (`.specify/memory/constitution.md`): linha do domínio kaguya → "tarefas + agenda (PostgreSQL + Google Calendar via MCP)", versão 1.0.0 → 1.0.1 com data (FR-015)
- [ ] T030 [P] Reescrever `agents/kaguya/CLAUDE.md`: nova arquitetura (tools Postgres, factory só com Calendar), tabela de tools, regras de comportamento preservadas, fluxo cross-agent atômico, personalidade — remover tudo de TickTick/OAuth
- [ ] T031 [P] Atualizar `CLAUDE.md` raiz: tabela de agentes (kaguya → PostgreSQL + Calendar), árvore de arquivos (`schema_tasks_pg.sql`, `routers/tasks.py`, `pages/kaguya/`, sem `mcp_servers/ticktick/`), seção de integração cross-agent
- [ ] T032 Rodar a validação completa do `quickstart.md` (V1–V6) + suíte pytest inteira; registrar resultados no checklist da spec
- [ ] T033 Refletir a mudança no vault do Obsidian (skill `obsidian-vault`) — novo motor de tarefas, aposentadoria do TickTick, nota de deploy (remover `TICKTICK_*` do Dokploy após SC-001)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)** → **Foundational (P2)** → bloqueia tudo.
- **US1 (webapp)** e **US2 (Telegram)** são independentes entre si — podem rodar em paralelo após T005; o MVP só fecha com as duas (paridade).
- **US3 (Kanban)** depende do shell da US1 (T008–T011). **US4 (Hoje)** depende do shell da US1; T023/T024 são paralelas entre si. **US5 (pagamento)** depende só da Foundational (+ Kaguya viva da US2 para o teste conversacional).
- **Polish** depende de todas.

### Parallel Opportunities

- T003 ∥ T004 (arquivos distintos da camada de lógica)
- US1 ∥ US2 inteiras (frontend/router × agente/coordinator — sem arquivos em comum)
- T008 ∥ T012 dentro da US1; T023 ∥ T024 dentro da US4; T029 ∥ T030 ∥ T031 no Polish

## Implementation Strategy

**Incremental com paridade**: Setup + Foundational → US1 e US2 em paralelo (checkpoint
de paridade: quickstart V3) → US3 → US4 → US5 → Polish. Cada checkpoint é deployável;
o critério final (SC-001: uma semana sem TickTick) começa a contar no checkpoint da US2.

**Total**: 33 tasks — Setup 2 · Foundational 3 · US1 9 · US2 5 · US3 3 · US4 3 · US5 3 · Polish 5.
