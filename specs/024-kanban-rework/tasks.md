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

- [X] T009 [US2] Tabela `kanban_views` + índice parcial `uq_kanban_views_builtin` + seed idempotente da built-in **"Completa"** em `schema_tasks_pg.sql`. ⚠️ Migração precisa rodar no container `makima-web` (VPS) — não aplicada localmente.
- [X] T010 [US2] `agents/kaguya/tools_kanban_views.py`: `list_views/create_view/update_view/delete_view` + `_validate_display` + reuso de `_validate_rules` no filtro + proteção da built-in + posição esparsa (R8/R21/R22). `py_compile` ✓
- [X] T011 [US2] `tests/agents/test_kaguya_kanban_views.py`: seed idempotente, CRUD, built-in protegida, validação de display, filtro opcional. ⚠️ **Não executado** — exige `DATABASE_URL` (Postgres real), indisponível local.
- [X] T012 [US2] Rotas `/api/tasks/kanban-views` (GET/POST) + `/{id}` (PATCH/DELETE) em `routers/tasks.py` (`require_user`, Pydantic, `_check_result`, built-in → 400). `py_compile` ✓
- [X] T013 [P] [US2] Tipos `KanbanView`/`KanbanViewDisplay`/`SummaryMetric` em `types.ts` (SummaryFooter importa de lá)
- [X] T014 [P] [US2] `kanbanViews` métodos em `kaguyaApi.ts`
- [X] T015 [US2] `components/KanbanViewModal.tsx` — toggles dos 4 adornos + 3 selects de métrica + excluir (não-builtin). Filtro fica para US3.
- [X] T016 [US2] Seletor de views no `KanbanScreen.tsx` + adornos/rodapé **data-driven** pela view ativa. `tsc` ✓
- [X] T017 [US2] View ativa persistida por lista em `localStorage`; fallback "Completa" para id órfão (R7/R25)

---

## Phase 5 — US3: Filtro da view (P3)

**Goal**: filtro `FilterRules` da view aplicado ao board reusando o DSL.
**Independent test**: view com filtro oculta cards que não casam; contadores/capacity/slots refletem o conjunto filtrado; semântica idêntica à smart-list equivalente (A11).

- [X] T018 [US3] `_build_where_from_rules(rules, default_open=True)` — base parametrizável em `tools_filters.py`; smart-lists inalteradas (research R-2). `py_compile` ✓
- [X] T019 [US3] `list_board_tasks(project_id, rules=None)` + `list_board_for_view(view_id, project_id)` em `tools_kanban_views.py` — reusa `list_tasks` (subtarefas/tags) + DSL via interseção de ids, `default_open=False` (research R-1)
- [X] T020 [US3] Rota `GET /api/tasks/kanban-views/{view_id}/board?project_id=` em `tasks.py` + `kaguyaApi.kanbanViewBoard`. `py_compile` ✓
- [X] T021 [US3] Testes em `test_kaguya_kanban_views.py`: board sem/com filtro, `list_board_for_view`, subtarefas preservadas. ⚠️ não executado (sem `DATABASE_URL`).
- [X] T022 [US3] Construtor de filtro no `KanbanViewModal.tsx` (toggle + combinador + condições, mesmo DSL/UX do `FilterModal`). `tsc` ✓
- [X] T023 [US3] `KanbanScreen.tsx`: view com filtro carrega via `kanbanViewBoard` (load inicial, troca de view e reload pós-drag); contadores/capacity/slots recalculam sobre o conjunto filtrado (A11). `tsc` ✓

---

## Phase 6 — Polish & Cross-Cutting

- [X] T024 [P] Seção "Views de Kanban (spec 024)" em `agents/kaguya/CLAUDE.md` (tabela, tools, proteção da built-in, `list_board_tasks`) + entrada no file-tree
- [X] T025 [P] `webapp/CLAUDE.md` — nova linha 024 na tabela de fatias
- [ ] T026 Rodar o roteiro de `quickstart.md` (7 cenários) + ~60fps com ≥30 cards. ⏳ **Pendente** — requer app rodando (dev server / container) e a migração aplicada; verificação visual ainda não feita.
- [X] T027 [P] Edge: `view_id` órfão no localStorage → fallback "Completa" (em `loadViews`); falha de carga das views → board no default "tudo ligado"; estados vazios herdam `kg-empty`

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
