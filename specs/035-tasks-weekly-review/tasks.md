---

description: "Task list for spec 035 — Revisão semanal guiada (Kaguya)"
---

# Tasks: Revisão semanal guiada (Kaguya)

**Input**: Design documents from `specs/035-tasks-weekly-review/` (plan.md, spec.md, research.md,
data-model.md, contracts/rest-api.md, quickstart.md)

**Tests**: Not explicitly requested in the spec — no dedicated test tasks generated. `T032`
(Polish) runs the manual `quickstart.md` validation instead.

**Organization**: Tasks are grouped by user story (spec.md priorities): US1/US2 share P1/P2 but
are kept as separate phases because US2 (retomada) is independently testable on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4, mapped 1:1 to spec.md's User Stories
- File paths are exact, relative to the repo root

## Path Conventions

Existing web app + scheduler (no new project): backend logic in `agents/kaguya/*.py`, REST
routes in `webapp/backend/routers/tasks.py`, frontend in
`webapp/frontend/src/pages/kaguya/`, scheduled job in `scripts/`, `scheduler/jobs.py`,
`scheduler/registry.py`. See `plan.md` § Project Structure.

---

## Phase 1: Setup

**Purpose**: Confirm the environment is ready — no new dependencies for this feature.

- [X] T001 Verify local dev environment (webapp backend + frontend, `makima-scheduler`
  container) starts cleanly before touching code, per `CLAUDE.md` § "Como rodar localmente".
  No new dependency is added by this feature (plan.md § Technical Context).

**Checkpoint**: Environment confirmed working — safe to start Foundational changes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `task_weekly_reviews` table and its core state-machine functions
(start/resume, mark step seen, complete) are read/written by US1, US2, and US4 — they must
exist and behave correctly before any of those stories is testable. US3 (reminder) only needs
`get_reminder_summary`, added in its own phase since it depends on `list_inbox_queue`
(spec 034, already shipped) and the "waiting" ordering added in US1.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Add `task_weekly_reviews` (`id`, `started_at`, `completed_at`, `steps_seen TEXT[]`,
  `note`) as `CREATE TABLE IF NOT EXISTS`, the partial unique index
  `uq_task_weekly_reviews_open` (guarantees at most one open review — FR-005), the index
  `idx_task_weekly_reviews_completed_at`, and `task_projects.last_reviewed_at` as an idempotent
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, in `agents/kaguya/schema_tasks_pg.sql` (see
  `data-model.md` § "`task_weekly_reviews`" and "`task_projects.last_reviewed_at`").
- [X] T003 [P] Create `agents/kaguya/tools_review.py` (new module) with the `_ALL_STEPS`
  constant (`["inbox", "next_actions", "waiting", "lists", "calendar", "someday"]`),
  `start_or_resume_review()` (returns the open review if one exists, else `INSERT`s a new one;
  `resumed: bool` in the return), `mark_step_seen(review_id, step)` (idempotent append; 400 on
  invalid `step` or a `review_id` that isn't the current open one), and
  `complete_review(review_id, note=None)` (requires `steps_seen` ⊇ `_ALL_STEPS`, else
  `{"status": "error", "error": "steps_pending", "missing": [...]}`; else sets `completed_at`).
  Depends on T002.
- [X] T004 [P] Add `get_last_completed_review()` and `list_review_history()` to
  `agents/kaguya/tools_review.py` — the most-recent-`completed_at` row (or `None`) and the full
  history ordered by `completed_at DESC` (data-model.md § "`get_last_completed_review()`").
  Depends on T002.
- [X] T005 Re-export `start_or_resume_review`, `mark_step_seen`, `complete_review`,
  `get_last_completed_review`, and `list_review_history` from `agents/kaguya/tools.py` (facade,
  webapp-only — no ADK tool registration, research.md R10). Depends on T003, T004.

**Checkpoint**: Review state machine writable and self-consistent — US1, US2, and US4
implementation can begin.

---

## Phase 3: User Story 1 - Fazer a revisão semanal guiada (Priority: P1) 🎯 MVP

**Goal**: A 6-step guided wizard (inbox zero, próximas ações, aguardando, listas/projetos,
calendário, algum dia/talvez), each step showing live data with inline actions, a final note,
and completion.

**Independent Test**: Start a review, walk through all 6 steps executing at least one action in
each (process 1 inbox item, complete 1 next action, chase 1 waiting item, mark 1 list
reviewed, look at the calendar, promote 1 someday item), write the note, and complete — confirm
the review is stored as completed with all 6 steps marked.

### Implementation for User Story 1

- [X] T006 [P] [US1] Add `mark_project_reviewed(project_id)` (sets
  `task_projects.last_reviewed_at = now()`) and the step-3 query (same conditions as
  `BUILTIN_FILTERS["waiting"]` plus `ORDER BY waiting_since ASC NULLS LAST`, returning
  `waiting_since`/`days_waiting`) to `agents/kaguya/tools_review.py` (data-model.md § "Ações
  inline por passo", research.md R3/R4). Depends on T002.
- [X] T007 [US1] Re-export `mark_project_reviewed` from `agents/kaguya/tools.py`. Depends on
  T006, T005.
- [X] T008 [US1] Add `GET /api/tasks/reviews/current`, `POST /api/tasks/reviews/start`,
  `PATCH /api/tasks/reviews/{review_id}/step`, and `POST /api/tasks/reviews/{review_id}/complete`
  routes in `webapp/backend/routers/tasks.py` (contracts/rest-api.md § "Estado da revisão"),
  following the existing `_check_result()` pattern for the mutations. Depends on T005.
- [X] T009 [US1] Add `GET /api/tasks/reviews/waiting-ordered` and
  `POST /api/tasks/projects/{project_id}/mark-reviewed` routes in
  `webapp/backend/routers/tasks.py` (contracts/rest-api.md § "Passo 4"/"Passo 3"). Depends on
  T007.
- [X] T010 [P] [US1] Add `WeeklyReview`, `ReviewStep`, and the 6-step payload/response types to
  `webapp/frontend/src/pages/kaguya/types.ts`.
- [X] T011 [US1] Build the `WeeklyReviewModal.tsx` shell in
  `webapp/frontend/src/pages/kaguya/modals/WeeklyReviewModal.tsx` — opens by calling
  `POST /reviews/start`, renders the 6-step progress indicator, free navigation between steps,
  a final note field, and the "concluir" action (`POST /reviews/{id}/complete`, blocked with a
  clear message if steps are missing). Depends on T008, T010.
- [X] T012 [US1] Implement the Step 1 (Inbox zero) content inside `WeeklyReviewModal.tsx` —
  reuses the same queue-fetch + 6-decision actions as `InboxProcessModal.tsx` (spec 034); marks
  the step seen (`PATCH .../step {"step": "inbox"}`) when opened; shows a "zerado" celebration
  state when the queue is empty (Acceptance Scenario 6). Depends on T011.
- [X] T013 [US1] Implement the Step 2 (Próximas ações) content — fetches
  `GET /api/tasks/filters/builtin/next-actions/tasks`, offers complete/edit/reprioritize inline
  actions, marks the step seen. Depends on T011.
- [X] T014 [US1] Implement the Step 3 (Aguardando) content — fetches
  `GET /api/tasks/reviews/waiting-ordered` (oldest first, FR-003), highlights the oldest items,
  offers edit `waiting_note`/complete/desist actions, marks the step seen. Depends on T009,
  T011.
- [X] T015 [US1] Implement the Step 4 (Listas/projetos) content — fetches
  `GET /api/tasks/projects` (sidebar, now carrying `last_reviewed_at`), sorted
  never-reviewed-first then oldest-first, with a "marcar revisada" action per list
  (`POST /projects/{id}/mark-reviewed`), marks the step seen. Depends on T009, T011.
- [X] T016 [US1] Implement the Step 5 (Calendário) content — calls the Calendar Hub aggregate
  route twice (past 7 days and next 7 days windows, research.md R5), read-only, marks the step
  seen. Depends on T011.
- [X] T017 [US1] Implement the Step 6 (Algum dia/talvez) content — fetches
  `GET /api/tasks/filters/builtin/someday/tasks`, offers promote (clear `gtd_status` / set
  `due_date`) and delete inline actions, marks the step seen. Depends on T011.
- [X] T018 [US1] Wire an entry point to open `WeeklyReviewModal` (e.g. a "Revisão semanal"
  action) in `webapp/frontend/src/pages/kaguya/components/SidebarNav.tsx` and/or
  `webapp/frontend/src/pages/kaguya/KaguyaShell.tsx`. Depends on T011.

**Checkpoint**: User Story 1 fully functional and testable independently via the web UI.

---

## Phase 4: User Story 2 - Retomar uma revisão abandonada (Priority: P2)

**Goal**: Starting a review when one is already open resumes it at the first pending step
instead of creating a duplicate.

**Independent Test**: Start a review, complete 2 steps, leave without finishing; start again
and confirm it resumes at step 3 of the same review, with steps 1–2 still marked.

### Implementation for User Story 2

- [X] T019 [US2] In `WeeklyReviewModal.tsx`, branch on the `resumed` flag returned by
  `POST /reviews/start` (already exposed by T008/T003) — when `true`, open the wizard at the
  first step key not present in `steps_seen` instead of always step 1. Depends on T011.
- [X] T020 [P] [US2] Show a small "revisão em andamento desde {started_at}" note in the modal
  header when `resumed === true`, so the user knows they're continuing, not starting fresh
  (Acceptance Scenario US2-2). Depends on T019.

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 3 - Lembrete de domingo à noite (Priority: P2)

**Goal**: A Sunday-night Telegram reminder fires only when no review was completed in the last
7 days, with a short summary (inbox size, stale waiting items).

**Independent Test**: With a week with no completed review, trigger the job manually and
confirm the Telegram message; complete a review and trigger again, confirming no message is
sent.

### Implementation for User Story 3

- [X] T021 [US3] Add `get_reminder_summary()` to `agents/kaguya/tools_review.py` — computes
  `should_send` (no review with `completed_at` in the last 7 rolling days, America/Sao_Paulo),
  `inbox_count` (`len(list_inbox_queue())`), and `stale_waiting_count` (items with
  `gtd_status='waiting'` and `waiting_since` older than 7 days) (data-model.md § "Resumo para o
  lembrete"). Depends on T002, T005.
- [X] T022 [US3] Create `scripts/send_weekly_review_reminder.py` (standalone script, same shape
  as `scripts/send_lucy_digest.py`) — calls `get_reminder_summary()`; if `should_send` is
  `False`, logs and exits 0 without sending; if `True`, POSTs the summary message to the
  Telegram Bot API using `TELEGRAM_BOT_TOKEN`/`TELEGRAM_ALERT_CHAT_ID` (contracts/rest-api.md §
  "Telegram"); `sys.exit(1)` on structural failure (missing credentials, request error).
  Depends on T021.
- [X] T023 [US3] Add `run_weekly_review_reminder()` to `scheduler/jobs.py` — runs
  `scripts.send_weekly_review_reminder` as a subprocess (same pattern/rationale as
  `run_lucy_digest`: converts the script's `sys.exit(1)` into a `RuntimeError` for the runner).
  Depends on T022.
- [X] T024 [US3] Add a `weekly_at(day_of_week, hour, minute=0)` helper (`CronTrigger` with
  `day_of_week`/`hour`/`minute`/`timezone=TZ`, mirroring `daily_at`) and the
  `"weekly_review_reminder"` `ScheduledJob` entry (`weekly_at("sun", 20, 0)`) to
  `scheduler/registry.py`. Depends on T023.

**Checkpoint**: US1, US2, US3 all independently functional.

---

## Phase 6: User Story 4 - Saber quando revisei pela última vez (Priority: P3)

**Goal**: A discreet "última revisão há N dias" (or "nunca") indicator in the panel, linking
into the wizard.

**Independent Test**: Complete a review and confirm the indicator shows "hoje"; advance days
(or simulate) and confirm the count updates.

### Implementation for User Story 4

- [X] T025 [US4] Add `GET /api/tasks/reviews/last` and `GET /api/tasks/reviews/history` routes
  in `webapp/backend/routers/tasks.py` (contracts/rest-api.md § "Estado da revisão"), backed by
  `get_last_completed_review`/`list_review_history` (T004/T005). Depends on T005.
- [X] T026 [P] [US4] Add the `LastReview` type (`{completed_at, note} | null`) to
  `webapp/frontend/src/pages/kaguya/types.ts`.
- [X] T027 [US4] Add the "última revisão há N dias" indicator to
  `webapp/frontend/src/pages/kaguya/components/SidebarNav.tsx` — fetches
  `GET /api/tasks/reviews/last`, computes "há N dias"/"nunca" from the local (browser) clock
  per `dateUtils.ts` conventions (never a raw UTC diff), and opens `WeeklyReviewModal` on click.
  Depends on T025, T026, T011.

**Checkpoint**: All 4 user stories independently functional — feature complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and end-to-end validation across all stories.

- [X] T028 [P] Update `agents/kaguya/CLAUDE.md` — document `tools_review.py`, the
  `task_weekly_reviews`/`task_projects.last_reviewed_at` schema, and the webapp-only nature of
  the wizard (no ADK tool, research.md R10).
- [X] T029 [P] Update `webapp/docs/API.md` — document the new `/api/tasks/reviews/*` and
  `/api/tasks/projects/{id}/mark-reviewed` routes.
- [X] T030 [P] Update `webapp/docs/FRONTEND.md` — document `WeeklyReviewModal` and the
  sidebar's "última revisão" indicator.
- [X] T031 [P] Update `scheduler/CLAUDE.md` — document the `weekly_review_reminder` job (Sunday
  20:00 America/Sao_Paulo) and the `weekly_at()` helper.
- [ ] T032 Run all 5 scenarios in `specs/035-tasks-weekly-review/quickstart.md` end-to-end
  (full review, empty step, resume, reminder, indicator) and confirm each Success Criterion
  (spec.md SC-001..SC-005).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup — BLOCKS US1, US2, US4 (all touch
  `task_weekly_reviews`/the review state machine). US3 does not depend on the state machine
  itself beyond `get_reminder_summary` reading `completed_at`, but is ordered after US1 here
  because it also depends on `list_inbox_queue` (already shipped by spec 034) and doesn't need
  the wizard UI.
- **US1 (Phase 3, P1)**: depends on Foundational (T002–T005).
- **US2 (Phase 4, P2)**: depends on Foundational AND on US1's `WeeklyReviewModal.tsx` (T011) —
  it's a small behavior branch inside the same component, not a separate feature surface.
- **US3 (Phase 5, P2)**: depends on Foundational (T002, T005); independent of US1/US2's UI
  (it's a backend-only job).
- **US4 (Phase 6, P3)**: depends on Foundational (T004/T005) and on US1's `WeeklyReviewModal.tsx`
  (T011) for the click-through target.
- **Polish (Phase 7)**: depends on all stories being complete (T032 validates every SC).

### Parallel Opportunities

- T003 and T004 (Foundational) touch the same new file (`tools_review.py`) but different
  functions with no cross-dependency — mark `[P]` only if worked by different people aware of
  the same file; otherwise treat as sequential in solo development.
- T006 [P] (US1) is independent of T008/T009 until they need it.
- T010 [P] (US1, types.ts) can proceed in parallel with T006 (Python, no shared file).
- US3 (Phase 5) can be staffed in parallel with US1 (Phase 3) once Foundational is done —
  neither touches the other's files.
- T028/T029/T030/T031 (Polish docs) are all `[P]` — different files.

---

## Parallel Example: Foundational

```bash
# Different concerns within the same new file — sequence in solo dev, parallelize if staffed:
Task: "start_or_resume_review/mark_step_seen/complete_review in agents/kaguya/tools_review.py"
Task: "get_last_completed_review/list_review_history in agents/kaguya/tools_review.py"
```

## Parallel Example: User Story 1 + User Story 3 (different developers)

```bash
# Dev A — User Story 1 (wizard UI):
Task: "Build WeeklyReviewModal.tsx shell + 6 step contents"

# Dev B — User Story 3 (reminder job, no UI dependency):
Task: "get_reminder_summary() in tools_review.py"
Task: "scripts/send_weekly_review_reminder.py"
Task: "run_weekly_review_reminder() + weekly_at() in scheduler/"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3 (US1) — the full 6-step wizard.
4. **STOP and VALIDATE**: run quickstart.md scenarios 1 and 2.
5. Deploy/demo — the ritual itself is the product-visible value; resume/reminder/indicator are
   reinforcement on top.

### Incremental Delivery

1. Setup + Foundational → review state machine ready.
2. US1 (guided wizard) → validate independently → demo (MVP complete).
3. US2 (resume) → validate independently → demo.
4. US3 (Sunday reminder) → validate independently → demo.
5. US4 (last-reviewed indicator) → validate independently → demo. Each story adds value without
   breaking the previous ones.

### Suggested Team Split

- Dev A: Foundational → US1 → US2 → US4 (all wizard-UI-adjacent).
- Dev B: US3 (after Foundational lands) → Polish docs.
