# Handoff: Kaguya — Kanban "Vidro" (redesign)

## Overview
This package documents a redesign of the **Kanban board** in Kaguya, a single-user personal task manager (Portuguese-BR UI). The board is a personal, cross-project workflow view: tasks flow left→right across status columns, and dragging a card to **Concluído** completes it. The new design — codenamed **"Vidro" (Glass)** — replaces the previous flat gray columns with a minimalist, Apple-inspired treatment: frosted-glass columns over a soft gradient, large count numerals, a segmented capacity meter per column, a WIP limit badge on the active column, subtask progress rings on cards, and a board-level summary footer.

Three directions were explored (`Kaguya - Kanban (3 direções).html` — A·Sereno, B·Cartão, C·Vidro). **Direction C · Vidro was chosen and is the one implemented** in `Kaguya - Tarefas.html`. The other two are included only for context.

## About the Design Files
The files in this bundle are **design references created in HTML/React-via-Babel** — prototypes showing the intended look and behavior, **not production code to ship directly**. The Kaguya prototype runs React 18 through an in-browser Babel transform with global-scoped components and a mock data layer (`data.js`). 

Your task is to **recreate this Kanban design in the target codebase's environment**, using its established patterns (component library, state management, styling solution, drag-and-drop library). If no environment exists yet, choose the most appropriate stack and implement there. Treat the HTML/JSX as the source of truth for layout, measurements, color, and interaction — not as files to copy verbatim.

## Fidelity
**High-fidelity (hifi).** Final colors (OKLCH), typography, spacing, radii, and interactions are all specified and should be reproduced pixel-faithfully using the target codebase's libraries. Exact values are listed under **Design Tokens** below.

## Screens / Views

### Screen: Kanban board (`KanbanScreen`)
- **Purpose**: A personal, cross-project board. The user triages and advances tasks by dragging cards between status columns; dropping on *Concluído* marks them done. A project filter narrows the board to one project.
- **File**: `source/screens-board.jsx`
- **Layout (top → bottom)**:
  1. **Page header** — title "Kanban" + subtitle "arraste entre colunas · soltar em Concluído completa". Page container is `.page.wide` (max-width 1320px, centered, padding 22px 32px 80px).
  2. **Toolbar** — a horizontal wrapping row of filter chips: "Todos" + one chip per project that has tasks. Active chip is filled. Each project chip shows a 7px color swatch dot.
  3. **Board** — `.board`: a rounded (20px) container with the gradient background and a 1px border, `min-height: 62vh`, laid out as a vertical flex with two children:
     - **`.kcols`** — horizontal flex row of columns, `gap: 16px`, `padding: 22px 22px 16px`, horizontal scroll when overflowing.
     - **`.ksummary`** — the board summary footer (see below).

#### Component: Column (`.kcol`)
- Frosted glass: `background: oklch(1 0.002 350 / 0.62)`, `backdrop-filter: blur(18px) saturate(1.4)`, `border: 1px solid oklch(1 0 0 / 0.6)`, `border-radius: 20px`, shadow `0 1px 0 oklch(1 0 0 / 0.7) inset, 0 10px 34px oklch(0.32 0.05 348 / 0.10)`.
- Sizing: `flex: 1 1 0; min-width: 270px; max-width: 360px`. Vertical flex column.
- **Drop target** state (`.drop-target`, while a card is dragged over): border becomes `--kg` (accent) with a 2px `--kg-tint` ring.
- **Column header** (`.kcol-head`, padding 17px 17px 14px):
  - **Big count numeral** (`.kc-num`): the number of tasks in the column. Display font, 30px, weight 800, line-height 0.9, letter-spacing -0.03em, tabular-nums.
  - **Name block** (`.kc-namewrap`): 
    - `.kc-name` — an 8px color dot (the column's color) + the column name (sans, 13px, weight 700).
    - `.kc-sub` — mono 10px sub-line: for open columns shows `Σ <total estimated time>` (e.g. "Σ 5.8h") or "sem estimativa"; for the done column shows "concluídas".
  - **WIP badge** (`.kc-wip`, only on the *Fazendo* / `doing` column): mono 10px pill "WIP n/3". When `n > 3` it gains `.over` and turns red (`--p-high` text on `--p-high-t` background).
  - **Capacity meter** (`.kcol-cap`, hidden on done column): 5 equal segments (`<i>`), each 4px tall, `flex: 1`, `gap: 3px`. Segments use the column color; off = `opacity 0.2`, on = `opacity 0.7`. Number of "on" segments = `round( min(colEst / 240, 1) * 5 )` — i.e. 240 minutes (4h) of estimated work fills the bar.
- **Column body** (`.kcol-body`): vertical flex, `gap: 10px`, padding `4px 12px 14px`, vertical scroll.
- **Add button** (`.kcol-add`, hidden on done column): full-width dashed-border button "＋ Adicionar tarefa", centered, creates a new task in this column.

#### Component: Card (`TaskCard` → `.kcard`)
- File: `source/components.jsx`.
- Glass card: `background: oklch(1 0.002 350 / 0.78)`, `border: 1px solid oklch(1 0 0 / 0.7)`, `border-radius: 14px`, padding `13px 14px`, shadow `0 2px 10px oklch(0.32 0.05 348 / 0.07)`. Horizontal flex (`gap: 11px`) with a text body and an optional trailing indicator.
- **Priority accent** (`.kcard::before`): a 2px bar pinned to the top edge (inset 13px left/right), colored by priority (`--pr-color`). Hidden when priority is 0/none.
- **Body** (`.kcard-body`, flex:1, min-width:0):
  - `.kcard-title` — 13.5px, line-height 1.4, letter-spacing -0.005em, `text-wrap: pretty`.
  - `.kcard-meta` (margin-top 10px, gap 11px, wrap): in order —
    - **Date chip** (`DateChip`, only if `task.due`): calendar icon + relative label ("Hoje", "Ontem", "2 dias atrás", weekday, etc.) optionally "· HH:MM". Overdue dates render red, today in accent — see `dueClass()` in `data.js`.
    - **Estimate** (`.kcard-est`, only if `task.est` and not done): mono 11px, e.g. "20min", "1.5h".
    - **Project** (`.kcard-proj`): 7px rounded color square + project name (11px, ellipsis).
  - Tags are intentionally NOT shown on the glass card (kept minimal).
- **Trailing indicator** (right side, mutually exclusive):
  - If **done**: `.kcard-done` — 18px green (`--done`) filled circle with white check icon.
  - Else if the task has subtasks: `.kcard-ring` — a 30px SVG **progress ring** (`ProgressRing` component) showing completed/total subtasks, with the fraction "n/m" centered inside (mono 8.5px). Ring track is `--line-2`, progress stroke is `--done`, 3px, round caps, rotated -90°.
  - Else: nothing.
- **States**: `:hover` raises shadow to `0 4px 16px …` and brightens border. `.dragging` → `opacity 0.4`, `cursor: grabbing`. `.done` → translucent background + strikethrough muted title. Whole card is `draggable` and `cursor: grab`; clicking opens the task detail (`onOpen`).
- **Drag placeholder** (`.kplaceholder`): while dragging over a column, a 52px dashed `--kg` rounded rectangle (radius 14px, `--kg-tint` fill) appears at the end of that column's body.

#### Component: Summary footer (`.ksummary`)
- A frosted bar across the bottom of the board: `border-top: 1px solid oklch(1 0 0 / 0.55)`, `background: oklch(1 0 0 / 0.4)`, `backdrop-filter: blur(10px)`, padding `13px 30px`, flex with `gap: 26px`.
- Three stats, separated by 1px `.ks-sep` dividers (22px tall):
  1. **tarefas abertas** — count of all non-done tasks in scope.
  2. **tempo estimado** — total estimated time of open tasks (`Σ task.est`), formatted (e.g. "13.6h"), or "—" if zero.
  3. **em foco agora** — count of open tasks in the `doing` column.
- Each stat: `.ks-v` (display font, 19px, weight 800, tabular-nums) + `.ks-k` (mono 9px, uppercase, letter-spacing 0.1em, muted).
- **All three react to the active project filter.**

## Interactions & Behavior
- **Drag & drop between columns** (native HTML5 DnD in the prototype; use the codebase's preferred DnD lib):
  - `onDragStart` sets the dragged task id and `dataTransfer`.
  - Column `onDragOver` (preventDefault) sets `overCol` → column shows `.drop-target` + placeholder.
  - `onDragLeave` clears `overCol` only when truly leaving (guard with `contains(relatedTarget)`).
  - `onDrop` resolves the move:
    - Drop on the **done** column → complete the task (`onComplete(t, true)`) + toast "Concluída ✦".
    - Drop a **currently-done** task onto a non-done column → reopen it (`{ done: false, col }`) + toast "Reaberta em <col>".
    - Otherwise → just update `col`.
    - No-op if dropped on its current column/state.
- **Project filter chips**: clicking sets `projF`; `'all'` shows everything. Columns, cards, capacity, WIP, and summary all recompute against the filter.
- **Add task**: `.kcol-add` calls `onNew({ col, project })` (project defaults to the active filter, or `inbox` when "Todos").
- **Card click**: opens task detail/editor (`onOpen`).
- **Column ordering of cards**: open columns sort by `task.pos` ascending; the done column sorts by `due` descending (most recently due first).
- **Animations**: card hover shadow/border transitions ~0.14s. Respect a global `data-anim="off"` flag if present (the app exposes one for reduced motion).

## State Management
Within `KanbanScreen` (local component state in the prototype):
- `projF` — active project filter id (`'all'` or a project id).
- `dragId` — id of the task currently being dragged (null when idle).
- `overCol` — id of the column currently hovered during a drag (null when none).

Callbacks passed in from the app shell (wire these to your real data layer):
- `onComplete(task, done)` — mark complete/incomplete.
- `onUpdate(taskId, patch)` — partial task update (used to change `col`, reopen, etc.).
- `onOpen(task)` — open detail view.
- `onNew({ col, project })` — create a task pre-slotted into a column/project.
- `onToast(message)` — transient confirmation toast.

Derived per render: `colTasks(col)` (filter by scope + column + done-state, then sort); `colEst` (sum of `est`); `segOn` (filled capacity segments); summary counts.

## Data model (relevant fields)
From `source/data.js`:
- **Columns** (`COLUMNS`): `todo` "Backlog" (color `--p-low`), `week` "Esta semana" (`--p-med`), `doing` "Fazendo" (`--kg`), `done` "Concluído" (`--done`, `isDone: true`).
- **Task** fields used by the board: `id`, `title`, `project` (id), `prio` (0–3), `due` (ISO date), `time` ("HH:MM"), `est` (minutes), `col` (column id), `pos` (sort order), `done` (bool), `subtasks` (`[{title, done}]`), `tags` (array).
- Helpers: `projById(id)`, `fmtEst(min)` → "45min"/"1.5h"/"3h", `dueLabel(iso)`, `dueClass(iso, done)` → '', 'today', 'soon', 'overdue', `PRIO[level]` → `{ color, … }`.

## Design Tokens

### Color (light theme — OKLCH; full dark-theme set in `styles.css` under `[data-theme='dark']`)
| Token | Value | Use |
|---|---|---|
| `--paper` | `oklch(0.991 0.005 350)` | app background (rosy ivory) |
| `--paper-2` | `oklch(0.974 0.008 350)` | recessed surfaces |
| `--card` | `oklch(1 0.001 350)` | card base |
| `--mist` | `oklch(0.962 0.016 348)` | gradient base |
| `--ink` | `oklch(0.275 0.020 348)` | primary text (deep plum) |
| `--ink-2` | `oklch(0.452 0.018 348)` | secondary text |
| `--ink-3` | `oklch(0.595 0.015 348)` | tertiary text |
| `--ink-4` | `oklch(0.715 0.012 348)` | muted/mono labels |
| `--line` | `oklch(0.905 0.011 348)` | borders |
| `--line-2` | `oklch(0.944 0.008 348)` | hairlines / ring track |
| `--kg` | `oklch(0.56 0.13 252)` | accent (Kaguya blue) |
| `--kg-deep` | `oklch(0.47 0.13 254)` | accent pressed/text |
| `--kg-tint` | `oklch(0.56 0.13 252 / 0.12)` | accent tint |
| `--p-high` | `oklch(0.575 0.195 22)` | priority high / overdue (sealing-wax red) |
| `--p-med` | `oklch(0.735 0.135 78)` | priority medium (gold) |
| `--p-low` | `oklch(0.585 0.085 250)` | priority low (slate) |
| `--done` | `oklch(0.615 0.115 158)` | completed (emerald) |

**Board-specific glass/gradient values** (hardcoded in the `.board` / `.kcol` / `.kcard` rules — copy exactly):
- Board gradient: `radial-gradient(120% 90% at 12% 0%, oklch(0.56 0.13 252 / 0.10), transparent 46%), radial-gradient(120% 90% at 92% 8%, oklch(0.62 0.15 330 / 0.09), transparent 44%), linear-gradient(160deg, var(--mist), var(--paper) 60%)`
- Column glass fill: `oklch(1 0.002 350 / 0.62)`, border `oklch(1 0 0 / 0.6)`, blur 18px saturate 1.4.
- Card glass fill: `oklch(1 0.002 350 / 0.78)`, border `oklch(1 0 0 / 0.7)`.
- Dark-theme overrides for all of the above exist in `styles.css` (`.kg-app[data-theme='dark'] .board/.kcol/.kcard/.ksummary`).

### Typography
- **Display**: "Hanken Grotesk" (count numerals, summary values) — weights 700/800.
- **Sans (body/UI)**: "DM Sans" — 400/500/600/700.
- **Mono (labels, time, fractions)**: "DM Mono" — 400/500.
- Key sizes: count numeral 30/800; summary value 19/800; column name 13/700; card title 13.5/400 (lh 1.4); meta & mono labels 9–11px.

### Spacing / Radius / Shadow
- Column radius **20px**, card radius **14px**, pills/dots **999px / 2.5–3px**.
- Column gap 16px; card gap 10px; card meta gap 11px.
- Capacity bar: 5 segments × 4px, gap 3px; fill basis = 240 min.
- Card shadow `0 2px 10px oklch(0.32 0.05 348 / 0.07)`, hover `0 4px 16px oklch(0.32 0.05 348 / 0.13)`.
- Column shadow `0 1px 0 oklch(1 0 0 / 0.7) inset, 0 10px 34px oklch(0.32 0.05 348 / 0.10)`.

## Assets
- **Fonts**: Hanken Grotesk, DM Sans, DM Mono (Google Fonts). In a real codebase, self-host or use your font pipeline.
- **Icons**: inline single-path SVGs from the project's `ICONS` map (`source/ui.jsx` → `Icon` component): `calendar`, `clock`, `check`, `plus`. Swap for the target codebase's icon set.
- No raster images are used by the board itself. `preview-vidro.png` is a reference screenshot only.

## Files
- `Kaguya - Tarefas.html` — the full running prototype (open it, click **Kanban** in the sidebar). Authoritative reference.
- `source/screens-board.jsx` — `KanbanScreen` (columns, header, capacity, WIP, summary, DnD).
- `source/components.jsx` — `TaskCard` + `ProgressRing` (the glass card and subtask ring).
- `source/styles.css` — all tokens + the Kanban "Vidro" rules (search "Kanban · \"Vidro\"").
- `source/ui.jsx` — `Icon`/`ICONS`, `DateChip`, `PrioFlag`, chips.
- `source/data.js` — `COLUMNS`, task model, `projById`, `fmtEst`, `dueClass`, `PRIO`.
- `Kaguya - Kanban (3 direções).html` — the exploration (A·Sereno, B·Cartão, C·Vidro); context only — **C was chosen**.
- `preview-vidro.png` — reference screenshot of the implemented board.
