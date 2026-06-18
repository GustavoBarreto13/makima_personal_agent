# Tasks: 024 · Kanban "Vidro" + Views configuráveis

**Feature**: `specs/024-kanban-rework/` | **Branch**: `024-kanban-rework`
**Input**: plan.md, spec.md, research.md, data-model.md, contracts/kanban-views.md, quickstart.md

## User Stories derivadas da spec

- **US1 (P1) — Reskin "Vidro" do board** *(MVP — o que o usuário pediu originalmente)*: o board renderiza fiel ao handoff (glass/OKLCH, numerais, capacity meter, anel de subtarefas, rodapé-resumo, chips, light/dark) **sem regredir** as otimizações de `@dnd-kit`. Testável contra A1–A6 na configuração default.
- **US2 (P2) — Views configuráveis (CRUD + seletor + memória)**: views salvas/nomeadas, globais, persistidas no backend; troca pela UI muda adornos/slots sem mexer em colunas; view ativa lembrada por lista. Testável contra A8–A10.
- **US3 (P3) — Filtro da view**: `FilterRules` inline aplicado ao board reusando o DSL; contadores/capacity/slots recalculam sobre o conjunto filtrado. Testável contra A11.

---

## Phase 1 — Setup

- [X] T001 [P] Fontes Hanken Grotesk / DM Sans / DM Mono — **já presentes** (`@import` no topo de `kaguya.css`, linha 10) e tokens `--display`/`--sans`/`--mono` já definidos. Nada a fazer.
- [X] T002 [P] Tokens OKLCH base — **já presentes** em `.kg-app` (`kaguya.css`); os valores glass específicos do "Vidro" foram adicionados inline nas regras `.kg-board/.kcol/.kcard/.ksummary`.

## Phase 2 — Foundational

Nenhuma tarefa bloqueante-para-todas além do Setup: **US1 é totalmente independente** (não toca backend). A tabela `kanban_views` é pré-requisito de US2/US3 e está alocada na US2 (story mais cedo que a usa).

---

## Phase 3 — US1: Reskin "Vidro" do board (P1, MVP)

**Goal**: board pixel-fiel ao handoff na configuração default, com performance preservada.
**Independent test**: abrir o Kanban de uma lista com colunas/cards → bate com `preview-vidro.png`; drag fluido (≥30 cards) sem spinner no drop e com rollback em erro (A1–A6).

- [X] T003 [P] [US1] Criado `components/ProgressRing.tsx` (anel SVG 30px, track `--line-2`, stroke `--done`, rotacionado -90°) — portado verbatim do handoff (R12)
- [X] T004 [US1] Reescrito `components/TaskCard.tsx`: card glass, barra de prioridade (respeita `pmark` via CSS bar/dot/fill), meta (data relativa pt-BR com **fix UTC-3** via `todayLocalISO`, estimativa `duration_min`, chip de projeto), `ProgressRing`/check de concluído (R9–R13)
- [X] T005 [P] [US1] Criado `components/SummaryFooter.tsx` com catálogo de 5 métricas + slots default `['abertas','tempo_estimado','em_andamento']` (R14/R15)
- [X] T006 [US1] Reescrito `screens/KanbanScreen.tsx` (markup): board com gradiente, `.kcols`, coluna glass (numeral/nome/sub-linha/drop-target/capacity meter/add), rodapé via `SummaryFooter`; **handlers `@dnd-kit` intactos** (R1–R7)
- [X] T007 [US1] Regras CSS "Vidro" `.kg-board`/`.kcol`/`.kcard`/`.ksummary` + capacity meter + pmark + **overrides dark** em `kaguya.css` (R3,R9,R14,R16,R17) — portado verbatim do handoff
- [X] T008 [US1] Performance: `DragOverlay` renderiza o card **sem** `backdrop-filter` (fundo sólido), `contain: paint` nas colunas; `PointerSensor`/optimistic/reload silencioso/drop-em-concluído preservados (R19/R20). **`tsc --noEmit` exit 0.**

---

## Phase 4 — US2: Views configuráveis (P2)

**Goal**: views salvas/nomeadas globais, persistidas; troca pela UI; memória por lista.
**Independent test**: criar/editar/deletar view persiste; built-in "Completa" rejeita PATCH/DELETE; trocar de view muda adornos/slots sem alterar colunas; reabrir lista restaura a última view (A8–A10).

- [ ] T009 [US2] Adicionar a tabela `kanban_views` (colunas/constraints da `data-model.md`) + seed idempotente da view built-in **"Completa"** (`is_builtin=true`) em `agents/kaguya/schema_tasks_pg.sql`
- [ ] T010 [US2] Criar a camada de lógica `agents/kaguya/tools_kanban_views.py`: `list_views`, `create_view`, `update_view`, `delete_view` — validação de `display` (3 slots válidos, chaves de adornos conhecidas), `_validate_rules` no `filter`, **proteção da built-in** (erro em update/delete de `is_builtin`), posição esparsa ×1000 (R8/R21/R22)
- [ ] T011 [US2] Teste de gate `tests/agents/test_kaguya_kanban_views.py`: CRUD, rejeição de built-in, validação de `display`/`slots` — depende de T010
- [ ] T012 [US2] Adicionar as rotas `/api/tasks/kanban-views` (GET/POST) e `/{id}` (PATCH/DELETE) em `webapp/backend/routers/tasks.py` conforme `contracts/kanban-views.md` (`require_user`, modelos Pydantic, `_check_result`) — depende de T010
- [ ] T013 [P] [US2] Adicionar os tipos `KanbanView`, `KanbanViewDisplay`, `SummaryMetric` em `webapp/frontend/src/pages/kaguya/types.ts`
- [ ] T014 [P] [US2] Adicionar `kanbanViews.{list,create,update,delete}` ao `webapp/frontend/src/pages/kaguya/kaguyaApi.ts` — depende de T013
- [ ] T015 [US2] Criar `webapp/frontend/src/pages/kaguya/components/KanbanViewModal.tsx` (criar/editar: toggles dos 4 adornos + escolha das 3 métricas dos slots) — depende de T013
- [ ] T016 [US2] Seletor de views no cabeçalho do `KanbanScreen.tsx` + tornar `SummaryFooter` e a renderização dos adornos **data-driven pela view ativa** (substitui o default fixo da T005) — depende de T006, T014, T015
- [ ] T017 [US2] Persistir a view ativa por lista em localStorage (`kaguya:kanban:active-view:<project_id>`); ao abrir, restaurar ou cair na "Completa" — em `KanbanScreen.tsx` (R7/R25)

---

## Phase 5 — US3: Filtro da view (P3)

**Goal**: filtro `FilterRules` da view aplicado ao board reusando o DSL.
**Independent test**: view com filtro oculta cards que não casam; contadores/capacity/slots refletem o conjunto filtrado; semântica idêntica à smart-list equivalente (A11).

- [ ] T018 [US3] Refatorar `_build_where_from_rules` em `agents/kaguya/tools_filters.py` para aceitar `default_open: bool = True` (base parametrizável), sem alterar o comportamento das smart-lists (research R-2)
- [ ] T019 [US3] Implementar `list_board_tasks(project_id, rules=None)` em `agents/kaguya/tools_kanban_views.py` — escopa por `project_id` e aplica os fragmentos do DSL com `default_open=False` (research R-1) — depende de T018, T010
- [ ] T020 [US3] Expor a carga filtrada do board (parâmetro opcional na listagem de tarefas da lista **ou** rota dedicada) em `webapp/backend/routers/tasks.py` + método correspondente em `kaguyaApi.ts` — depende de T019
- [ ] T021 [US3] Teste de gate em `tests/agents/test_kaguya_kanban_views.py`: filtro com semântica de board (inclui concluídas na done; escopo do projeto; mesma semântica do DSL) — depende de T019
- [ ] T022 [US3] Adicionar o construtor de filtro ao `KanbanViewModal.tsx` reusando o padrão do `FilterModal` das smart-lists — depende de T015
- [ ] T023 [US3] No `KanbanScreen.tsx`: quando a view ativa tem filtro, carregar pelo caminho filtrado e recalcular contadores de coluna, capacity meter e slots do rodapé sobre o conjunto filtrado (A11) — depende de T016, T020, T022

---

## Phase 6 — Polish & Cross-Cutting

- [ ] T024 [P] Documentar a feature em `agents/kaguya/CLAUDE.md` (nova seção "Views de Kanban": tabela, tools, proteção da built-in)
- [ ] T025 [P] Atualizar `webapp/CLAUDE.md` (tabela de fatias: + 024) e o `README` do repo
- [ ] T026 Rodar o roteiro de `quickstart.md` (7 cenários) e confirmar ~60fps com ≥30 cards (sem regressão DnD)
- [ ] T027 [P] Estados vazios/edge: coluna sem cards, board só com a built-in, `view_id` órfão no localStorage → fallback "Completa" — em `KanbanScreen.tsx`

---

## Dependencies — ordem de conclusão das stories

```
Setup (T001–T002)
      ↓
US1 (T003→T004, T005, →T006→T007→T008)         ← MVP entregável sozinho
      ↓ (US2 assume o board reescrito da US1)
US2 (T009→T010→{T011,T012}; T013→{T014,T015}; →T016→T017)
      ↓ (US3 assume views + board data-driven)
US3 (T018→T019→{T020,T021}; T022; →T023)
      ↓
Polish (T024–T027)
```

- **US1** não depende de US2/US3 (entrega o visual sem backend).
- **US2** depende do board da US1 (T006) para pendurar o seletor e o data-driven.
- **US3** depende de US2 (view com filtro) e do refator T018.

## Paralelização

- **Setup:** T001 ∥ T002.
- **US1:** T003 ∥ T005 (arquivos distintos); T004 após T003; T006 após T004/T005; T007 ∥ T006 (CSS vs TSX, mas convergem — coordenar); T008 após T006.
- **US2 backend ∥ frontend:** {T009→T010→T011,T012} em paralelo com {T013→T014,T015}; convergem em T016.
- **US3:** T021 ∥ T020 (após T019); T022 ∥ trilha backend.
- **Polish:** T024 ∥ T025 ∥ T027; T026 por último.

## Estratégia de implementação (MVP-first)

1. **MVP = US1** (Phase 1–3): entrega exatamente o que o usuário pediu — "copie o visual fielmente" + performance preservada. Já é demonstrável e mergeável.
2. **Incremento 2 = US2**: adiciona a configurabilidade pedida no clarify (views persistidas).
3. **Incremento 3 = US3**: liga o filtro reusando o DSL.
4. **Polish**: docs + validação + edge cases.

## Format validation

Todas as tarefas seguem `- [ ] [TaskID] [P?] [Story?] descrição + caminho`. Setup/Foundational/Polish sem `[Story]`; US1/US2/US3 com `[US#]`; caminhos de arquivo explícitos em toda tarefa de implementação.
