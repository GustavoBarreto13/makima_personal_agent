---

description: "Task list for spec 034 — GTD core (Kaguya)"
---

# Tasks: GTD core — status reais, processamento do inbox, contextos e smart lists padrão de mercado (Kaguya)

**Input**: Design documents from `specs/034-tasks-gtd-core/` (plan.md, spec.md, research.md, data-model.md, contracts/rest-api.md, quickstart.md)

**Tests**: Not explicitly requested in the spec — no dedicated test tasks generated. `T043` (Polish) runs the manual `quickstart.md` validation instead.

**Organization**: Tasks are grouped by user story (spec.md priorities). Two stories share Priority P1 (US1 and US2) — see Implementation Strategy.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5, mapped 1:1 to spec.md's User Stories
- File paths are exact, relative to the repo root

## Path Conventions

Existing web app (no new project): backend logic in `agents/kaguya/*.py`, REST routes in
`webapp/backend/routers/tasks.py`, frontend in `webapp/frontend/src/pages/kaguya/`, Telegram
wiring in `coordinator/main.py`. See `plan.md` § Project Structure.

---

## Phase 1: Setup

**Purpose**: Confirm the environment is ready — no new dependencies for this feature.

- [X] T001 Verify local dev environment (backend `python -m coordinator.main`, webapp
  backend + frontend) starts cleanly before touching code, per `CLAUDE.md` § "Como rodar
  localmente". No new dependency is added by this feature (plan.md § Technical Context).

**Checkpoint**: Environment confirmed working — safe to start Foundational changes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `gtd_status` column and its transition rules are read/written by both US1
(wizard) and US3 (manual edit + built-in lists) — they must exist and behave correctly before
either story is testable.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Add `tasks.gtd_status` (`TEXT CHECK IN ('next_action','waiting','someday')`),
  `tasks.waiting_note` (`TEXT`), `tasks.waiting_since` (`TIMESTAMPTZ`) as idempotent
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, plus the partial index
  `idx_tasks_gtd_status`, in `agents/kaguya/schema_tasks_pg.sql` (see `data-model.md` §
  "`tasks` — colunas novas").
- [X] T003 [P] Add the `gtd_status` field (`eq`, `none` ops) to `_FIELD_OPS` and its WHERE
  translation branch in `_build_where_from_rules` in `agents/kaguya/tools_filters.py` (see
  `data-model.md` § "DSL"). Depends on T002 for the column to exist at query time.
- [X] T004 [P] Extend `update_task` in `agents/kaguya/tools_tasks.py` to accept
  `gtd_status`/`waiting_note`/`context_id`* params (*`context_id` write is a no-op until T025
  adds the column — guard defensively) and apply the transition rules from `data-model.md`:
  entering `waiting` sets `waiting_since = now()`; leaving `waiting` clears `waiting_since`
  (keeps `waiting_note`); setting `due_date` while `gtd_status = 'someday'` clears
  `gtd_status` back to `NULL` (FR-012). Depends on T002.
- [X] T005 Propagate `gtd_status`/`context_id`/`waiting_note` to the newly generated occurrence
  in `_complete_task_on_cursor`/`complete_task` (`agents/kaguya/tools_tasks.py`) when completing
  a recurring task; if the copied `gtd_status` is `'waiting'`, recompute `waiting_since = now()`
  on the new row (research.md R10). Depends on T004 (same file, same transition-rule logic).

**Checkpoint**: `gtd_status` writable and self-consistent — US1 and US3 implementation can begin.

---

## Phase 3: User Story 1 - Processar o inbox item a item (Priority: P1) 🎯 MVP

**Goal**: Guided, one-item-at-a-time Inbox processing (web) with 6 possible decisions,
progress counter, and resumability.

**Independent Test**: Capture 5 items in the Inbox, start processing, give each a different
destination (next action, waiting, someday, schedule, complete), confirm the queue empties and
each item landed where chosen, and confirm reopening processing later shows an empty queue.

### Implementation for User Story 1

- [X] T006 [P] [US1] Implement `process_inbox_item(task_id, decision, **fields)` in
  `agents/kaguya/tools_tasks.py` — dispatches the 6 decisions
  (`next_action`/`waiting`/`someday`/`schedule`/`done`/`trash`) onto the existing
  `update_task`/`complete_task`/`delete_task` functions (no duplicated business rules; reuses
  T004's transition logic).
- [X] T007 [P] [US1] Implement `list_inbox_queue()` in `agents/kaguya/tools_tasks.py` — the
  derived query from `data-model.md` § "Fila do processamento do inbox"
  (`project_id = <inbox>`, `parent_id IS NULL`, `deleted_at IS NULL`, `completed_at IS NULL`,
  `gtd_status IS NULL`, `due_date IS NULL`), ordered by `created_at`.
- [X] T008 [US1] Re-export `process_inbox_item` and `list_inbox_queue` from
  `agents/kaguya/tools.py` (facade). Depends on T006, T007.
- [X] T009 [US1] Add `GET /api/tasks/inbox/queue` and `POST /api/tasks/inbox/{task_id}/process`
  routes in `webapp/backend/routers/tasks.py` (contracts/rest-api.md § "Processamento do
  inbox"), following the existing `_check_result()` pattern for the mutation. Depends on T008.
- [X] T010 [P] [US1] Add `InboxQueueItem` and the 6-decision payload types to
  `webapp/frontend/src/pages/kaguya/types.ts`.
- [X] T011 [US1] Build `webapp/frontend/src/pages/kaguya/modals/InboxProcessModal.tsx` — the
  item-by-item wizard: progress counter ("3 de 12"), one card at a time, 6 decision
  actions/forms, calls `POST /inbox/{id}/process` and advances to the next queued item; closing
  and reopening re-fetches `GET /inbox/queue` (resumability, FR-004). Depends on T009, T010.
- [X] T012 [US1] Wire an entry point to open `InboxProcessModal` (e.g. a "Processar" action on
  the Inbox list) in `webapp/frontend/src/pages/kaguya/components/SidebarNav.tsx` and/or
  `webapp/frontend/src/pages/kaguya/KaguyaShell.tsx`. Depends on T011.

**Checkpoint**: User Story 1 fully functional and testable independently via the web UI.

---

## Phase 4: User Story 2 - Navegar pelas smart lists padrão de mercado (Priority: P1) 🎯 MVP

**Goal**: Fixed sidebar block — Todas, Hoje, Amanhã, Próximos 7 Dias, Inbox — each with a
counter, in that order.

**Independent Test**: Create tasks with varied dates (today, tomorrow, +5 days, no date,
overdue) and confirm each fixed view shows exactly the expected set with correct counters, in
the local timezone (UTC-3), including after 21h.

### Implementation for User Story 2

- [X] T013 [P] [US2] Add the `"tomorrow"` literal to `_resolve_relative_date` in
  `agents/kaguya/tools_filters.py` (→ today + 1 day).
- [X] T014 [P] [US2] Create `agents/kaguya/tools_views.py` (new module) with
  `list_view_all()`, `list_view_today()` (alias/reuse of `list_today_overdue`),
  `list_view_tomorrow()`, `list_view_next7()` (inclusive of today — research.md R7),
  `list_view_inbox()`, and `get_view_counts()` — all built on
  `_build_where_from_rules`/`_run_filter_rules` per `data-model.md` § "Views fixas".
- [X] T015 [US2] Re-export the `tools_views` functions from `agents/kaguya/tools.py`. Depends
  on T014.
- [X] T016 [US2] Add `GET /api/tasks/views/{all,today,tomorrow,next7,inbox}` and
  `GET /api/tasks/views/counts` routes in `webapp/backend/routers/tasks.py`
  (contracts/rest-api.md § "Views fixas"). Depends on T015.
- [X] T017 [P] [US2] Add the fixed-view keys/types and counter shape to
  `webapp/frontend/src/pages/kaguya/types.ts`.
- [X] T018 [US2] Render the fixed block (Todas, Hoje, Amanhã, Próximos 7 Dias, Inbox) with
  counters at the top of `webapp/frontend/src/pages/kaguya/components/SidebarNav.tsx`, above
  the GTD state section (`GTD_BUILTINS`). Depends on T016, T017.
- [X] T019 [US2] Wire the new fixed-view keys into the `{view, param}` routing of
  `webapp/frontend/src/pages/kaguya/KaguyaShell.tsx`. Depends on T018.

**Checkpoint**: User Stories 1 AND 2 both work independently — MVP scope complete.

---

## Phase 5: User Story 3 - Status GTD e listas de estado reais (Priority: P2)

**Goal**: Manual GTD status editing in the task detail, and the "Próximas Ações / Aguardando /
Algum dia" lists driven by real status instead of tags; old reserved tags migrated and retired.

**Independent Test**: Mark a task as waiting ("orçamento do João") from the detail view, confirm
it shows in "Aguardando" with the note and wait time; verify an old `#algum-dia`-tagged task
shows in "Algum dia" post-migration, without the tag.

### Implementation for User Story 3

- [X] T020 [US3] Add the idempotent migration (UPDATE tag→status, then DELETE the reserved
  tag links/tags) to `agents/kaguya/schema_tasks_pg.sql`, exactly as specified in
  `data-model.md` § "Migração das tags reservadas → `gtd_status`". Depends on T002 (columns
  must exist first in the same file).
- [X] T021 [US3] Rewrite `BUILTIN_FILTERS["next-actions"/"waiting"/"someday"]` in
  `agents/kaguya/tools_filters.py` to filter on `gtd_status eq ...` instead of tags, and remove
  `RESERVED_TAGS` (data-model.md § "`BUILTIN_FILTERS`"). Depends on T003, T020.
- [X] T022 [P] [US3] Add `gtd_status`/`waiting_note`/`waiting_since` to the `Task` type in
  `webapp/frontend/src/pages/kaguya/types.ts`.
- [X] T023 [US3] Add a GTD status selector (Nenhum/Próxima ação/Aguardando/Algum dia), a
  `waiting_note` field (shown only for "Aguardando"), and a read-only "há X dias" display of
  `waiting_since` to `webapp/frontend/src/pages/kaguya/modals/TaskModal.tsx`. Depends on T022,
  T004.
- [X] T024 [US3] Confirm/adjust the `PATCH /api/tasks/{id}` request schema in
  `webapp/backend/routers/tasks.py` to pass `gtd_status`/`waiting_note` through to
  `update_task` (T004). Depends on T004.

**Checkpoint**: US1, US2, US3 all independently functional.

---

## Phase 6: User Story 4 - Contextos de execução dedicados (Priority: P2)

**Goal**: A manageable, unique-named list of execution contexts (`@casa`, `@rua`...), at most
one per task, filterable, and assignable during Inbox processing.

**Independent Test**: Create `@casa` and `@rua`, assign each to a different task, filter by
`@casa` and see only its tasks; delete `@rua` and confirm its tasks remain, just without a
context.

### Implementation for User Story 4

- [X] T025 [P] [US4] Add `task_contexts` table (`name` unique case-insensitive via
  `LOWER(name)` index, `icon`, `position`) and `tasks.context_id`
  (`REFERENCES task_contexts(id) ON DELETE SET NULL`) + its index to
  `agents/kaguya/schema_tasks_pg.sql` (data-model.md § "`task_contexts`"). No seed rows
  (clarification: users start with zero contexts).
- [X] T026 [US4] Create `agents/kaguya/tools_contexts.py` (new module, same shape as
  `tools_tags.py`): `list_contexts`, `create_context` (rejects duplicate name,
  case-insensitive), `update_context`, `delete_context` (desassociates, never deletes tasks).
  Depends on T025.
- [X] T027 [US4] Add the `context_id` field (`eq`, `none` ops) to `_FIELD_OPS` and its WHERE
  branch in `agents/kaguya/tools_filters.py`. Depends on T025.
- [X] T028 [US4] Re-export the `tools_contexts` functions from `agents/kaguya/tools.py`.
  Depends on T026.
- [X] T029 [US4] Add `GET/POST /api/tasks/contexts` and `PATCH/DELETE
  /api/tasks/contexts/{id}` routes in `webapp/backend/routers/tasks.py`
  (contracts/rest-api.md § "Contextos"). Depends on T028.
- [X] T030 [US4] Extend the `PATCH /api/tasks/{id}` schema in
  `webapp/backend/routers/tasks.py` to accept `context_id`. Depends on T025.
- [X] T031 [P] [US4] Build `webapp/frontend/src/pages/kaguya/modals/ContextsModal.tsx` (new) —
  CRUD UI for contexts (create/rename/reorder/delete), same interaction pattern as an existing
  simple management modal in the same folder.
- [X] T032 [US4] Add a context selector (dropdown, at most one) to
  `webapp/frontend/src/pages/kaguya/modals/TaskModal.tsx`. Depends on T031, T029.
- [X] T033 [US4] Add a `context_id` condition row to the rule builder in
  `webapp/frontend/src/pages/kaguya/modals/FilterModal.tsx` (mirrors `_FIELD_OPS`, per the
  file's existing comment convention). Depends on T027.
- [X] T034 [US4] Add a "Gerenciar contextos" entry point (opens `ContextsModal`) and
  per-context filter chips to
  `webapp/frontend/src/pages/kaguya/components/SidebarNav.tsx`. Depends on T031.
- [X] T035 [US4] Add an optional context selector to the "próxima ação" step of
  `webapp/frontend/src/pages/kaguya/modals/InboxProcessModal.tsx` (US1's wizard), letting the
  user assign a context in the same decision (FR from US4 Acceptance Scenario 4). Depends on
  T011, T031.

**Checkpoint**: US1–US4 all independently functional.

---

## Phase 7: User Story 5 - GTD pelo Telegram (Priority: P3)

**Goal**: Conversational Inbox processing and fixed-view name resolution via the Telegram bot.

**Independent Test**: On Telegram, process 2 Inbox items with different decisions, then ask
"tarefas de amanhã", confirming correct responses.

### Implementation for User Story 5

- [X] T036 [P] [US5] Implement `resolve_view_by_name(name)` in `agents/kaguya/tools.py`,
  resolving "todas"/"hoje"/"amanhã"/"próximos 7 dias"/"inbox" (tolerant matching, same style as
  `list_tasks_by_filter_name`) onto the `tools_views` functions. Depends on T015.
- [X] T037 [US5] Register `process_inbox_item` and `resolve_view_by_name` as ADK tools in the
  Kaguya agent's tool list in `agents/kaguya/agent.py`. Depends on T006, T036.
- [X] T038 [US5] Add the `"ibx_"` inline-keyboard wizard to `coordinator/main.py` — starting
  processing builds `_pending_action[chat_id] = {"action": "inbox_process", "queue": [...],
  "index": 0}` and renders one `InlineKeyboardMarkup` per queued item (buttons
  `ibx_next_action:<id>`, `ibx_waiting:<id>`, `ibx_someday:<id>`, `ibx_schedule:<id>`,
  `ibx_done:<id>`, `ibx_trash:<id>`), mirroring the existing `nc_`/`ncc_`/`fm_` wizard pattern
  (research.md R9). Depends on T009 (reuses the same queue/process logic via T008's facade).
- [X] T039 [US5] Add the `ibx_*` branch to `handle_callback` in `coordinator/main.py` —
  applies the chosen decision via `process_inbox_item`, then advances `index` and re-renders
  the next item's keyboard (or a "fila vazia" message). Depends on T038.

**Checkpoint**: All 5 user stories independently functional — feature complete.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and end-to-end validation across all stories.

- [X] T040 [P] Update `agents/kaguya/CLAUDE.md` — document `tools_contexts.py`,
  `tools_views.py`, the `gtd_status`/`waiting_*`/`context_id` fields, `process_inbox_item`,
  `resolve_view_by_name`, and the retirement of `RESERVED_TAGS`.
- [X] T041 [P] Update `webapp/docs/API.md` — document the new `/api/tasks/contexts/*`,
  `/api/tasks/inbox/*`, and `/api/tasks/views/*` routes.
- [X] T042 [P] Update `webapp/docs/FRONTEND.md` — document `InboxProcessModal`,
  `ContextsModal`, and the sidebar's fixed-view block.
- [X] T043 Run all 5 scenarios in `specs/034-tasks-gtd-core/quickstart.md` end-to-end
  (migration, inbox processing, fixed views, contexts, Telegram) and confirm each Success
  Criterion (spec.md SC-001..SC-006).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup — BLOCKS US1 and US3 (both touch `gtd_status`).
  US2 and US4 do not depend on Foundational (they touch different columns/modules) but are
  ordered after it here for a simpler MVP-first rollout.
- **US1 (Phase 3, P1)**: depends on Foundational (T002–T005).
- **US2 (Phase 4, P1)**: independent of Foundational and of US1 — could be built in parallel
  with Phase 2/3 by a second developer.
- **US3 (Phase 5, P2)**: depends on Foundational; independent of US1/US2 beyond that.
- **US4 (Phase 6, P2)**: independent schema addition (`task_contexts`); T035 additionally
  depends on US1's `InboxProcessModal` (T011) to wire the context picker into the wizard.
- **US5 (Phase 7, P3)**: depends on US1 (T006/T008) and US2 (T015) — it's a Telegram-facing
  wrapper around logic those stories already built.
- **Polish (Phase 8)**: depends on all stories being complete (T043 validates every SC).

### Parallel Opportunities

- T003 and T004 (Foundational) touch different files and can proceed in parallel once T002
  lands.
- T006/T007 (US1), T013/T014 (US2), T025 (US4) are all `[P]` — different files, no
  cross-dependency within their phase.
- US2 (Phase 4) can be staffed in parallel with US1 (Phase 3) once Setup is done — neither
  touches the other's files.
- US4 (Phase 6) can be staffed in parallel with US3 (Phase 5) — different schema addition,
  different modules — except for T035, which needs US1's T011 to exist first.
- T040/T041/T042 (Polish docs) are all `[P]` — different files.

---

## Parallel Example: User Story 1

```bash
# Backend logic, no cross-dependency:
Task: "Implement process_inbox_item in agents/kaguya/tools_tasks.py"
Task: "Implement list_inbox_queue in agents/kaguya/tools_tasks.py"
```

## Parallel Example: Foundational + User Story 2 (different developers)

```bash
# Dev A — Foundational (blocks US1/US3):
Task: "Add gtd_status/waiting_note/waiting_since to schema_tasks_pg.sql"

# Dev B — User Story 2 (no dependency on gtd_status):
Task: "Add 'tomorrow' shortcut to _resolve_relative_date in tools_filters.py"
Task: "Create tools_views.py with the 5 fixed views + counts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 — both Priority P1)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (blocks US1; does not block US2).
3. Complete Phase 3 (US1) and Phase 4 (US2) — in parallel if staffed, sequentially otherwise.
4. **STOP and VALIDATE**: run quickstart.md scenarios 2 and 3 independently.
5. Deploy/demo — this alone delivers the two most product-visible changes (inbox clarify
   ritual + market-standard sidebar navigation).

### Incremental Delivery

1. Setup + Foundational → foundation ready for US1/US3.
2. US1 (Inbox processing) → validate independently → demo.
3. US2 (fixed views) → validate independently → demo (MVP complete after 2+3).
4. US3 (real GTD status + migration) → validate independently → demo.
5. US4 (contexts) → validate independently → demo.
6. US5 (Telegram) → validate independently → demo. Each story adds value without breaking the
   previous ones.

### Suggested Team Split

- Dev A: Foundational → US1 → US5.
- Dev B: US2 → US4 (both largely independent of Foundational).
- Dev C: US3 (after Foundational lands) → Polish docs.
