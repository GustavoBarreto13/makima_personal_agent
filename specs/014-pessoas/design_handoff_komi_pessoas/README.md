# Handoff: Komi · Pessoas (Pessoas / People hub)

## Overview
**Komi · Pessoas** is a new section of the *Makima Web App* — a personal-assistant suite where each
agent (Nami / finances, Kaguya / tasks, Frieren / books, Violet / journal) is a self-contained app
sharing one shell. **Komi** is the *people* agent: a canonical identity store ("pessoas") that every
other agent links to.

The feature delivers three things:
1. **Início (Home)** — a dashboard that opens the app: a Komi hero banner, a one-line summary, a
   "reconnect" list ("you last spoke to X N days ago — reach out?"), upcoming dates, and pending
   balances.
2. **Diretório (Directory)** — a searchable/filterable grid of people → an individual **person page**
   laid out as a *dashboard of cards*, one card per domain (Finanças/Nami, Tarefas/Kaguya,
   Diário/Violet, Livros/Frieren), each showing that person's cross-agent links.
3. **Create/Edit modal** — manage a person's photo, contacts, relationship, nicknames (apelidos) and
   important dates.

This maps to the product spec "014-pessoas" (identidade canônica + vínculos polimórficos N:N +
seção webapp própria). Only the **webapp / frontend** layer is covered here (spec FR-014).

## About the Design Files
The files in this bundle are **design references created in HTML/CSS + React-via-Babel** — runnable
prototypes that show the intended look and behavior. They are **not production code to ship as-is**.

The task is to **recreate these designs in the target codebase's existing environment**, using its
established patterns and libraries. The real product (per the spec) is a **FastAPI backend +
PostgreSQL** with a frontend in the project's "Shell" pattern; data here is mocked in
`komi/data.js` + `localStorage`. Replace that with the real `/api/pessoas/*` endpoints and
`get_person_summary(person_id)` aggregation. If the frontend framework is not yet decided, pick the
one that matches the rest of the app and port the components faithfully.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, shadows, and interactions are all
specified. Recreate the UI pixel-perfectly. All colors are authored in **OKLCH** (see Design Tokens);
keep OKLCH if the target supports it, otherwise convert to the nearest hex/RGB.

---

## Screens / Views

The app is a two-pane shell: a fixed **248px sidebar** (`.km-side`) + a flexible **main column**
(`.km-main`) with a sticky 56px topbar and a scrolling body. Max content width **1160px**, centered,
with 24–32px horizontal padding. There are 4 routed views: `home`, `grid`, `dates`, `person`, plus a
modal overlay. Default view is `home`.

### 1. Sidebar (persistent chrome)
- **Brand**: 42px circular avatar (`komi/komi.png`, indigo radial-gradient ring) + wordmark "Komi"
  (Playfair Display, 21px, 700) + role "PESSOAS" (DM Mono, 9px, uppercase, letter-spacing 0.2em,
  color `--km-deep`).
- **"Nova pessoa" button** (`.side-add`): full-width indigo button, plus icon + label + `N` kbd hint.
- **Nav group "Diretório"**: *Início* (sparkles icon), *Todas as pessoas* (users icon + count),
  *Próximas datas* (cake icon + count of dates within 60 days).
- **Nav group "Relacionamentos"**: one row per category — Família, Amigos, Trabalho, Outros — each a
  colored 9px dot + label + count. Clicking sets the grid filter and navigates to the directory.
- **Footer**: "Voltar à Makima" link (back to `Makima Diário.html`) with a small Makima-red dot.
- Active nav item: `--km-tint` background, `--km-deep` text, 600 weight.

### 2. Início / Home (`view = 'home'`, default)
- **Hero banner** (`.km-hero`): full-width, 246px min-height, radius 20px, layered indigo gradient
  (`--km-deep → --km → --km-bright` + two radial highlights), 1px `--km-tint-2` border, `--shadow-md`.
  - **Left copy** (max-width 64%): eyebrow "KOMI · PESSOAS" (mono, white 78%); **title** = dynamic
    greeting "Bom dia / Boa tarde / Boa noite" (Playfair, clamp 30–44px, 800, white); **sub** sentence
    summarizing counts with bold numbers; **3 stat tiles** (`.hstat`, translucent white, blurred) —
    Pessoas / Vínculos / Datas / mês, each a 24px display number + mono uppercase label.
  - **Right art**: `komi/komi.png` (376×664 transparent PNG of Komi), positioned absolute
    `right:40px; bottom:-6px; height:290px`, with a soft radial glow behind; cropped at the hero's
    bottom edge (overflow hidden). Hidden below 860px viewport.
- **"Que tal entrar em contato?" section** (reconnect): section head (title + "mais tempo sem falar"
  sub + "Nova pessoa" link). A responsive grid (`minmax(280px,1fr)`) of up to **4 reconnect cards**:
  - Each card: 40px avatar + name (Playfair 16/700) + relationship (mono uppercase) + a **gap pill**
    (top-right) reading "há N dias / há X semanas / há 1 mês …"; pill is `--km-tint`/`--km-deep`,
    turning `--garnet-t`/`--garnet` ("warm") when ≥14 days.
  - **Context line** (2-line clamp): `KIND · last interaction text` (kind = diário/finanças/tarefa).
  - **Prompt line**: encouraging copy that scales with the gap.
  - **Actions row**: a smart primary CTA — Telegram (`t.me/…`) > WhatsApp (`wa.me/…`) > Instagram >
    "Ver perfil" fallback — plus a ghost "Abrir" button. Clicking the card body opens the person; the
    actions row stops propagation.
- **Two-column row** (`.home-cols`, 1fr 1fr, stacks <860px):
  - **Próximas datas** panel: header (cake icon, garnet) + "ver todas" link → dates view; up to 5
    mini-rows (28px avatar + name + "label · DD mmm" + countdown big number "N dias"/"hoje").
  - **A acertar** panel: header (wallet icon, amber/`--fin`) + count; up to 5 mini-rows (avatar + name
    + "te devem"/"você deve" + signed BRL amount, green `--pos` / red `--neg`).
- Empty states: friendly one-liners ("Você está em dia com todo mundo…", "Nenhuma conta pendente.").

### 3. Diretório / Grid (`view = 'grid'`)
- **Page head**: title "Diretório de pessoas" (Playfair-family display, 27px/700) + sub + primary
  "Nova pessoa" button.
- **Toolbar**: filter chips — Todas / Família / Amigos / Trabalho / Outros — each with a category
  color dot + count; active chip = solid `--ink` bg, `--paper` text. Right side: result count (mono).
- **Topbar search** (`.km-search`, in the sticky topbar when grid is active): pill input, matches
  name/relationship/aliases/city, accent-insensitive (see `normalize()`).
- **People grid** (`.ppl-grid`, `minmax(244px,1fr)`, gap 16px): **person cards**:
  - 48px avatar (photo or initials) + name (Playfair 17/700, 2-line clamp) + relationship row (mono
    uppercase, colored by category, with a leading dot).
  - Meta row: birthday chip (cake icon + "DD mmm", garnet) and/or city (mono).
  - Links footer (top border): 4 mono counters with domain icons — wallet/`--fin`, checks/`--task`,
    feather/`--diary`, book/`--book`; zero counts are muted; right-aligned total "N vínculos".
  - Hover: lift 2px, `--shadow-md`, left accent bar fades in (category color).
- Empty state when no matches: centered users icon in a tinted circle + message.

### 4. Próximas datas (`view = 'dates'`)
- Page head + a vertical list (`.dates-list`) of **date cards** sorted by days-until: left countdown
  block ("N" big garnet number + "dias"/"hoje"), 40px avatar, name (Playfair) + "label · recorrente",
  right-aligned "DD mmm" (garnet). Whole card opens the person.

### 5. Person page (`view = 'person'`)
- **Topbar** switches: left shows a "‹ Diretório" back button; right shows a ghost "Editar" button.
- **Profile hero** (`.profile-hero`): radius 20px, subtle `--mist→--card` gradient tinted by accent,
  1px `--km-tint` border. Layout = flex: 96px avatar + body + actions.
  - Body: a relationship **badge** (rounded, tinted by category) + **alias chips** ("Aninha", "Ana");
    big **name** (Playfair 34/800); **contacts row** (phone/mail/instagram/telegram/city, each an icon
    + value, links where applicable); **notes** (italic, quoted); **dates strip** — pills with a
    cake/calendar icon, label, and "DD mmm · em Nd / hoje!" (garnet when ≤30 days).
  - Actions: ghost "Editar" button.
- **Domain dashboard** (`.dom-grid`, 2×2, stacks <880px): four **domain cards**, each with a colored
  icon tile, title, agent name (mono), and an optional header value:
  - **Finanças (Nami, `--fin` amber)**: header = net balance in BRL + "te devem"/"você deve"/"quitado"
    (green/red/neutral); body = transaction rows (description, "DD mmm · method", signed amount).
  - **Tarefas (Kaguya, `--task` magenta)**: header = # open + "abertas"; body = task rows with a round
    checkbox (filled magenta when done), title (strikethrough if done), "vence DD mmm"/"concluída";
    footer summary "N concluídas · M abertas".
  - **Diário (Violet, `--diary` periwinkle)**: header = # mentions; body = snippets with `@mentions`
    highlighted in `--diary`, and "DD mmm · HH:MM".
  - **Livros (Frieren, `--book` teal)**: header = # books; body = rows with a gradient spine, title,
    author, and a status pill (indicado/emprestado/lendo).
  - Each card shows a centered **empty state** (icon + "Nenhuma … ligada") when its domain is empty —
    the page must never error on missing data (spec SC-005/SC-006).

### 6. Create / Edit modal (`.modal`)
- Centered overlay (scrim `oklch(0.24 0.03 278/0.40)` + blur), 560px max-width, 88vh max-height,
  scrollable body, slide-in animation. Title "Nova pessoa" / "Editar pessoa" + close X.
- Fields (top→bottom):
  - **Foto**: 72px round preview (photo or initials) + "Adicionar/Trocar foto" (FileReader →
    dataURL) + "Remover" + "sem foto → usa as iniciais" hint.
  - **Nome** (required; the only thing that gates Save).
  - **Relacionamento**: a 4-way segmented control (Família/Amigos/Trabalho/Outros, each tinted by
    category) + a free-text label input ("amiga", "irmã", "colega…").
  - **Contatos**: two-up rows — telefone / e-mail, then instagram / telegram, then cidade.
  - **Apelidos**: chip list + inline add (dedup via `normalize`, Enter to add).
  - **Datas importantes**: existing dates as chips (removable) + an add row (label + "MM-DD or
    YYYY-MM-DD" + an "anual" recurring checkbox + add button).
  - **Notas**: textarea.
- **Footer**: "Excluir pessoa" (danger link, edit mode only) + Cancelar (ghost) + Criar/Salvar
  (primary, disabled until name present).

### 7. Tweaks panel (design-time controls, not a product feature)
Floating panel (provided by `tweaks-panel.jsx`, host-driven): **Tema** Claro/Escuro, **Acento da
Komi** (índigo `#5A4FCF` default / granada `#A23B43` / azul `#3E7FB0` / esmeralda `#3E8C6E`),
**Nomes** Serifa/Sem-serifa, and a "Restaurar exemplo" button. This is a prototyping affordance —
you do **not** need to port it unless the product wants theming.

---

## Interactions & Behavior
- **Navigation**: sidebar items and the topbar set the active view; person cards / mini-rows / date
  cards open the person page; the person topbar "‹ Diretório" returns to the grid. Body scroll resets
  to top on every navigation.
- **Keyboard**: `N` (when not typing and no modal open) opens the create modal; `Esc` on the person
  page returns to the directory; the modal closes on scrim mousedown and the X button.
- **Search & filter** (grid): live, combined; accent/case-insensitive via `normalize()` (NFD strip of
  combining marks); results sorted by `localeCompare('pt-BR')`.
- **Reconnect logic**: `lastInteraction(p)` = most-recent date across journal mentions, transactions,
  and **completed** tasks (ISO dates sort lexically). Show people with a gap **≥ 7 days**, sorted
  longest-gap-first, top 4. CTA picks the first available channel (telegram→whatsapp→instagram).
- **Dates**: `daysUntil(date, recurring)` — recurring ("MM-DD") rolls to next occurrence; one-off
  ("YYYY-MM-DD") is absolute. "Próximas datas" lists only `days >= 0`.
- **Create/Edit/Delete**: optimistic local update; new person gets a generated id and is opened
  immediately; delete returns to the grid. (In production these become `/api/pessoas/*` calls;
  delete is a **soft delete** per spec — `deleted = TRUE`, preserve history.)
- **Animations**: hover lifts (`translateY(-1/-2px)`, 0.1–0.16s); modal/scrim fade+slide
  (~0.18–0.22s, `cubic-bezier(.2,.8,.3,1)`); task-checkbox fill transition. All respect a reduced-
  motion off-switch via `[data-anim='off']`.
- **Responsive**: domain grid 2×2 → 1col <880px; home-cols & reconnect grid → 1col <860px; hero art
  hides <860px; the whole sidebar hides <720px (and the profile hero stacks).

## State Management
Mocked in the prototype with React state in `komi/app.jsx`, persisted to `localStorage` key
`komi.pessoas.v1`:
- `people[]` — the canonical records (see shape below). Persisted on every change.
- `view` ('home'|'grid'|'dates'|'person'), `currentId`, `query`, `filter`, `modal` (null|'new'|{id}).

**Production target** (from the spec):
- People + aliases + dates + polymorphic `person_links` live in Postgres (`agents/komi/schema_pg.sql`).
- The person page consumes a single `get_person_summary(person_id)` aggregation (profile + finances +
  tasks + journal + books), each block resolving empty without error.
- All routes behind `Depends(require_user)`; mutations are atomic (links written in the same
  transaction as the parent item).

### Person record shape (prototype)
```js
{
  id: 'p-ana-silva',
  name: 'Ana Silva',
  relationship: 'amiga',
  category: 'amigos',            // familia | amigos | trabalho | outros
  phone, email, instagram, telegram, city,
  avatar: null,                  // dataURL/string or null → initials fallback
  notes: '…',
  aliases: ['Aninha', 'Ana'],
  dates: [{ label: 'Aniversário', date: '03-12', recurring: true }],
  links: {
    finances: { net: 230, txns: [{ date, desc, amount, method }] },  // amount signed
    tasks:    { items: [{ title, done, due, prio }] },
    journal:  { mentions: [{ date, time, text }] },                  // text may contain @name
    books:    [{ title, author, status }]                            // indicado|emprestado|lendo
  }
}
```

## Design Tokens
All colors are **OKLCH**, scoped under `.km-app` (light) with a `[data-theme='dark']` override. Full
source: `komi/styles.css` (top of file).

### Surfaces (light)
- `--paper` `oklch(0.992 0.004 277)` · `--paper-2` `oklch(0.974 0.006 277)`
- `--card` `oklch(1 0.001 277)` · `--card-2` `oklch(0.976 0.006 277)` · `--mist` `oklch(0.955 0.018 280)`

### Ink (text)
- `--ink` `oklch(0.268 0.030 278)` · `--ink-2` `oklch(0.440 0.026 278)`
- `--ink-3` `oklch(0.585 0.020 278)` · `--ink-4` `oklch(0.710 0.016 278)`
- `--line` `oklch(0.903 0.012 278)` · `--line-2` `oklch(0.945 0.008 278)`

### Brand accent — Komi indigo
- `--km` `oklch(0.505 0.135 277)` · `--km-deep` `oklch(0.420 0.130 278)` · `--km-bright` `oklch(0.640 0.130 275)`
- `--km-tint` `…/0.11` · `--km-tint-2` `…/0.19`
- Alt accents (theme): granada `#A23B43`, azul `#3E7FB0`, esmeralda `#3E8C6E` (HEX picker values;
  resolved to OKLCH triplets in `komi/app.jsx → KM_PALETTES`).

### Secondary accent — granada (dates / birthdays)
- `--garnet` `oklch(0.535 0.165 19)` · `--garnet-t` `…/0.13`

### Domain colors (inherited from each agent)
- Finanças / Nami `--fin` `oklch(0.660 0.155 57)` (amber) · tint `…/0.13`
- Tarefas / Kaguya `--task` `oklch(0.620 0.160 340)` (magenta) · tint `…/0.13`
- Diário / Violet `--diary` `oklch(0.560 0.100 253)` (periwinkle) · tint `…/0.13`
- Livros / Frieren `--book` `oklch(0.560 0.095 184)` (teal) · tint `…/0.13`
- Pos/Neg: `--pos` `oklch(0.580 0.130 158)` · `--neg` `oklch(0.575 0.180 25)`

### Category accents (relationship)
- familia → `--garnet` · amigos → `--km` · trabalho → `--book` · outros → `--ink-3`

### Radius
- `--r-sm` 8px · `--r-md` 13px · `--r-lg` 20px · avatars & dots: 50%

### Shadows
- `--shadow-sm` `0 1px 2px oklch(0.4 0.04 278/0.05), 0 1px 1px …/0.04`
- `--shadow-md` `0 2px 6px …/0.06, 0 8px 28px …/0.09`
- `--shadow-lg` `0 16px 48px oklch(0.30 0.05 278/0.20)`

### Typography
- **Display/headings**: `Hanken Grotesk` (page/section titles), weights 700–800.
- **Serif (names + brand + hero greeting)**: `Playfair Display`, 700–800. Toggleable to Hanken via
  the `--serif` var ("Nomes: Sem serifa").
- **Body**: `DM Sans`, 400–700, base 14px / line-height 1.5.
- **Mono (labels, dates, counters, kbd)**: `DM Mono`, 400–500; uppercase labels use
  letter-spacing 0.08–0.22em.
- Google Fonts import string is in `Komi - Pessoas.html` `<head>`.

### Spacing
Informal 4px-ish rhythm; common values 6/8/10/12/14/16/18/22/24/30px. Card padding 16–20px;
page padding 24–32px; section gaps ~30px.

## Assets
- **`komi/komi.png`** — 376×664 transparent PNG of Komi (the agent's character, from
  *Komi-san wa Comyushou desu*). Used as the sidebar brand avatar (cropped circle) and the Home hero
  art (full figure on the gradient). User-provided upload; swap for the project's own asset if needed.
- **Icons** — inline single-path SVG set in `komi/icons.jsx` (24×24, 1.8 stroke, round caps). No
  external icon dependency; map to your icon library (Lucide-style equivalents fit) or keep the paths.
- **Avatars** — when `person.avatar` is null, render initials on a deterministic OKLCH color
  (`avatarColor()` hashes the name into an 8-color palette). Mirror this fallback in production.

## Files (in this bundle)
- `Komi - Pessoas.html` — entry point: fonts, React 18 + Babel, script order.
- `komi/styles.css` — the entire visual system (tokens, shell, all views, modal, dark theme).
- `komi/data.js` — mock seed (8 people with cross-agent links), `localStorage` persistence, and all
  derived helpers (`normalize`, `avatarColor`, `initials`, `daysUntil`, `daysSince`, `humanGap`,
  `lastInteraction`, `linkCounts`, `totalLinks`, `brl`). **Replace with real API calls.**
- `komi/icons.jsx` — `Icon` + `Avatar` primitives.
- `komi/home.jsx` — Home/Início (hero, reconnect, dates + a-acertar panels).
- `komi/grid.jsx` — directory grid, person card, filters, upcoming-dates view.
- `komi/person.jsx` — person page (profile hero + 4 domain cards) + `highlightMentions`.
- `komi/modal.jsx` — create/edit modal.
- `komi/app.jsx` — shell, sidebar, routing, keyboard, persistence wiring, tweaks, `KM_PALETTES`.
- `tweaks-panel.jsx` — prototyping-only theming panel (skip for production).

## Notes for the implementer
- The HTML is a **reference**; reproduce the visuals in the app's real frontend and wire the four
  domain cards to `get_person_summary`. Honor the spec's atomicity (links in the same transaction)
  and soft-delete semantics — those are backend concerns not visible in the mock.
- Keep the per-agent domain colors — they tie each card back to its source agent and are part of the
  visual language across the suite.
- Every domain block must degrade to a clean empty state; never throw on missing data.
