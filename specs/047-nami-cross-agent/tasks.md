# Tasks: Nami cross-agent — pessoas, calendário, Hub e lembretes

**Input**: plan.md, spec.md · **Branch**: `master`

## Phase 1: User Story 2 — Vencimentos e gastos no calendário unificado (P2)

- [X] T001 [US2] Verificar infraestrutura existente (fatia 019) — `calendar_hub` já
      registra "nami", `CalendarScreen.tsx` já renderiza read-only com deep-link. Sem
      código novo.

## Phase 2: User Story 1 — Vincular pessoas a transações pelo webapp (P1)

- [X] T002 [US1] `CreateTransactionBody.person_ids` + repasse em `create_transaction_endpoint`
- [X] T003 [US1] `query_expenses`: query em lote anexando `people` por transação
- [X] T004 [US1] `modals/PersonPicker.tsx` (busca `komiApi.search` + chips)
- [X] T005 [US1] `AddModal.tsx`: integra `PersonPicker` (criação, não parcelado)
- [X] T006 [US1] `TxRow.tsx` + `lib.ts`/`types.ts`: chips de pessoas na listagem

## Phase 3: User Story 3 — Saúde financeira na home (Hub) (P3)

- [X] T007 [US3] `hub.py::_nami()`: stat2 vira `get_financial_health_score`, try/except próprio

## Phase 4: User Story 4 — "Lembrar-me" cria lembrete na Kaguya (P3)

- [X] T008 [US4] `POST /api/tasks/reminders` com proteção contra duplicata (título+due_date)
- [X] T009 [US4] `kaguyaApi.createReminder`; botão "Lembrar-me" no Dashboard da Nami

## Phase 5: Polish

- [X] T010 Verificação: `npx tsc -b --force`, `npm run build`, import smoke-test Python
- [X] T011 Docs: `agents/nami/CLAUDE.md`, `agents/kaguya/CLAUDE.md`, `webapp/CLAUDE.md`,
      `webapp/docs/API.md`, `ROADMAP.md`, status do `spec.md`
