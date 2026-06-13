# Tasks: Calendar Hub — Calendário Completo + 2-way Google + Cross-agent (fatia 019)

**Input**: Design documents from `specs/019-tasks-calendar-hub/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-calendar.md,
design-guide.md e o handoff de alta fidelidade em `design_handoff_kaguya_calendario/`

**Tests**: incluídos onde a spec exige verificação automatizada — degradação graciosa do hub
(SC-005), espelho best-effort com Google mockado (SC-004), helpers de tempo/ISO-week (SC-001).
Padrão existente em `tests/agents/`.

**Organization**: agrupado por user story (US1–US4 da spec), cada uma independentemente
testável. **US5** (conectores externos Animes/Futebol/Feriados) e o provider real de
**Akane/Filmes** ficam fora — fase posterior (fontes indefinidas, agente `media` não existe).

## Format: `[ID] [P?] [Story] Description`

- **[P]** = pode rodar em paralelo (arquivo distinto, sem dependência não satisfeita).
- **[Story]** = a qual user story a tarefa pertence (US1/US2/US3/US4).

---

## Phase 1: Setup

**Purpose**: preparar o terreno de schema e env vars antes de qualquer código de lógica.

- [ ] T001 Estender `agents/kaguya/schema_tasks_pg.sql` com as duas DDL mínimas da 019
  (data-model §1–2):
  ```sql
  ALTER TABLE tasks ADD COLUMN IF NOT EXISTS google_event_id TEXT;
  CREATE TABLE IF NOT EXISTS calendar_prefs (
      calendar_id  TEXT PRIMARY KEY,
      visible      BOOL NOT NULL DEFAULT TRUE,
      color        TEXT,
      position     INT  NOT NULL DEFAULT 0
  );
  ```
  Aplicar rodando `scripts/setup_schemas.py` de dentro do container `makima-web` (conforme
  CLAUDE.md raiz — o hostname do Postgres não é resolvível fora do Swarm). Confirmar com
  `\d tasks` (coluna `google_event_id` presente) e `\d calendar_prefs` (tabela criada).

- [ ] T002 [P] Registrar as env vars da 019 em `webapp/backend/config.py` (FR-017): ler
  `GOOGLE_CALENDAR_ACCESS_TOKEN`, `GOOGLE_CALENDAR_REFRESH_TOKEN`, `GOOGLE_CALENDAR_CLIENT_ID`,
  `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_TOKEN_EXPIRY`,
  `GOOGLE_CALENDAR_MAIN_CALENDAR_ID` e `GCAL_SYNC_ENABLED` (bool, default `True`). Anotar no
  checklist de deploy Dokploy que o serviço `makima-web` precisa dessas vars (hoje só o
  coordinator as tem).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: as peças compartilhadas por todas as user stories — cliente Google, hub de
calendários, prefs e a base do frontend (types + api client + CSS). Nenhuma story começa sem isso.

**⚠️ CRITICAL**: nenhuma story de UI ou espelho começa antes desta fase terminar.

- [ ] T003 Criar `agents/kaguya/gcal.py` — cliente Google Calendar compartilhado, **não-MCP**
  (D2). Extrair/reusar o padrão de auth de `mcp_servers/calendar/server.py` (`_get_service`,
  credenciais OAuth, refresh on-demand, escopo `calendar`). Funções (contrato §1):
  - `ensure_kaguya_calendar() -> str` — acha/cria o calendário "Kaguya — Tarefas" por nome;
    cacheia o id em variável de módulo (idempotente; reiniciar recria cache sem duplicar).
  - `list_calendars() -> list[dict]` — `[{id, name, role, is_main, is_kaguya}]`.
  - `list_events(date_from, date_to, exclude=("Kaguya — Tarefas","TickTick")) -> list[dict]`
    — anti-duplicação (reusa conceito do `_BLOCKED_CALENDARS` do MCP).
  - `create_event(calendar_id, summary, start, end, all_day=False, description="", location="") -> dict`
  - `update_event(calendar_id, event_id, **campos) -> dict`
  - `delete_event(calendar_id, event_id) -> dict`
  Docstring Google-style + type hints.

- [ ] T004 [P] Criar `agents/kaguya/calendar_prefs.py` — CRUD sobre a tabela `calendar_prefs`
  (contrato §4):
  - `get_calendar_prefs() -> list[dict]` — todos os registros `{calendar_id, visible, color, position}`.
  - `set_calendar_pref(calendar_id, visible=None, color=None, position=None) -> dict` — upsert
    parcial: só atualiza campos não-None; retorna `{"status":"ok"}` ou `{"status":"error"}`.
  Docstring + type hints.

- [ ] T005 Criar `agents/kaguya/calendar_hub.py` — protocolo de provider + agregador (contrato
  §3). Responsabilidades:
  - Definição do shape `CalendarItem` (TypedDict ou dataclass: `cal, date, start?, end?,
    all_day, title, kind, ref_id?, deep_link?, color?, loc?` — data-model §4).
  - `SOURCE` padrão: `{id, account, kind:'base'|'integration', name, color}`.
  - Registro dos providers ao importar o módulo: Nami (`nami`), Frieren (`frieren`), Violet
    (`violet`), **Akane stub** (registrado como `SOURCE` com `list_calendar_events → []` inline,
    sem importar agente `media`), Google (`gcal` — lido via `gcal.list_events`).
  - `register(source, fn)` — registra dinamicamente.
  - `list_sources(with_prefs=True) -> list[dict]` — lista todos com prefs aplicadas
    (`visible`, `color` da `calendar_prefs`).
  - `aggregate(start_date, end_date, sources=None) -> dict` — fan-out best-effort:
    `{sources:[...], items:[CalendarItem...], errors:[source_id...]}`. Provider que levanta
    exceção → `errors[]`, não derruba os demais (D10). `sources=None` → todos visíveis.
  Docstring + type hints.

- [ ] T006 Criar `tests/agents/test_kaguya_calendar_hub.py` (SC-005):
  - `aggregate` com 2 providers mock → items de ambos concatenados em `items`.
  - Provider que levanta `RuntimeError` → `errors=[source_id]`, demais itens presentes, sem
    exceção propagada.
  - `aggregate(sources=["nami"])` → filtra só a camada Nami.
  - `list_sources()` inclui stub Akane (visível, presente na lista).
  Rodar `pytest tests/agents/test_kaguya_calendar_hub.py -q`.

- [ ] T007 [P] Estender `webapp/frontend/src/pages/kaguya/types.ts` com as interfaces do hub
  (data-model §3–4):
  ```ts
  interface CalAccount { id: string; name: string; sub: string }
  interface Calendar {
    id: string; account: string; kind: 'base'|'integration'
    name: string; color: string; avatar?: string; visible: boolean; primary?: boolean
  }
  interface CalEvent {
    id: string; cal: string; day: string   // YYYY-MM-DD
    start: string|null; end: string|null; allDay: boolean
    color: string|null; kind: 'event'|'task'
    loc?: string; taskId?: number; deepLink?: string
  }
  interface CalendarItem {
    cal: string; date: string; start?: string; end?: string; all_day: boolean
    title: string; kind: string; ref_id?: string; deep_link?: string; color?: string; loc?: string
  }
  interface CalendarPref { calendar_id: string; visible: boolean; color: string|null; position: number }
  ```
  `Task` ganha `google_event_id?: string`.

- [ ] T008 [P] Estender `webapp/frontend/src/pages/kaguya/kaguyaApi.ts` com os métodos novos
  (contrato §5, design-guide §8):
  ```ts
  calendarSources(): Promise<{ sources: Calendar[] }>
  calendarAggregate(start: string, end: string, sources?: string[]): Promise<{ sources, items, errors }>
  calendarPrefs(): Promise<{ prefs: CalendarPref[] }>
  setCalendarPref(calId: string, patch: Partial<CalendarPref>): Promise<{status:string}>
  calendarCalendars(): Promise<{ calendars: any[] }>
  calendarEvents(start: string, end: string): Promise<{ events: CalEvent[] }>
  createCalendarEvent(body: Partial<CalEvent>): Promise<{status:string}>
  updateCalendarEvent(id: string, body: Partial<CalEvent>): Promise<{status:string}>
  deleteCalendarEvent(id: string): Promise<{status:string}>
  ```

- [ ] T009 [P] Estender `webapp/frontend/src/pages/kaguya/kaguya.css` com toda a geometria e
  estilos do calendário (design-guide §2–8, data-model §6, `cal.css` do handoff como referência):
  - Variáveis CSS: `--hh` (52/54/60px por variante), `--gutter: 58px`, `--col-w: 264px`.
  - Cores dos 9 calendários como vars CSS e paleta `CAL_SWATCHES` (10 swatches OKLCH).
  - Classes base: `.calx`, `.cal-bar`, `.cal-seg`, `.cal-dayhead`, `.cal-allday`, `.cal-grid`,
    `.cal-scroll`, `.cg-col`, `.cg-event`, `.cg-ghost`, `.cg-now`, `.cg-resize`,
    `.cmo-grid`, `.cmo-cell`, `.cmo-pill`, `.cal-aside`, `.mini`, `.cal-item`, `.ci-box`,
    `.cal-colors`, `.cal-tray`, `.cal-hint`, `.cad-pill`.
  - 3 variantes via `[data-variant="agora|helvetico|editorial"]` (eventos, coluna de calendários).
  - Tema escuro via `.kg-app[data-theme="dark"] .calx`.
  - Animação `cpop-in` (popover/menu: 140–120ms, opacity + translateY(-6px) + scale(.98)).

**Checkpoint**: cliente Google (`gcal.py`), hub (`calendar_hub.py`), prefs e base do frontend
prontos. As fases US1–US4 podem começar (US1 e US2 em paralelo; US3 e US4 dependem de US1).

---

## Phase 3: User Story 1 — Calendário Dia/Semana/Mês completo (Priority: P1) 🎯

**Goal**: substituir a `CalendarScreen` simples da 013 pelo calendário visual completo com as três
visões e navegação plena. Usa apenas dados de tarefas (`list_tasks_in_range` já existe).

**Independent Test**: abrir a view Calendário e alternar Dia/Semana/Mês; navegar com ‹ › e "Hoje";
conferir a linha do agora na coluna de hoje, a faixa all-day, o rótulo SEMANA N (ISO pela quinta),
o mini-mês lateral com a semana realçada; clicar num dia do mini-mês navega o principal.

### Implementation for User Story 1

- [ ] T010 [US1] Criar `webapp/frontend/src/pages/kaguya/components/CalNavBar.tsx` — barra de
  navegação sticky do calendário (design-guide §1, README §1):
  - Mês + ano (display 22px/800, capitalize; serif 27px em `editorial`).
  - Rótulo "SEMANA N" (mono 11px uppercase; ISO pelo meio da semana — quinta-feira).
  - Setas ‹ › (30×30, raio 8px) e botão "Hoje" (32px, borda `--line`, fundo `--card`).
  - Segmented **Dia / Semana / Mês** (ativo: fundo `--card`, cor `--kg-deep`, `--shadow-sm`).
  Props: `view`, `refDate`, `onViewChange`, `onNav(+1|-1)`, `onToday`.

- [ ] T011 [US1] Criar `components/MonthGrid.tsx` — grade de 6 semanas × 7 colunas
  (design-guide §3, README §3):
  - Linha de nomes de dia (mono 9.5px, alinhados à direita).
  - Células `.cmo-cell`: número (mono 11px, círculo 22px; hoje com `--kg`); dias fora do mês
    `.dim` (fundo `--card-2`); nome do mês abreviado quando muda.
  - Pills `.cmo-pill`: timed = bolinha de cor + hora + título; all-day = `.filled` (fundo tonal).
  - Limite **4 pills/célula + "+N mais"**.
  - Clicar numa célula → abre a view Dia naquela data.
  Props: `refDate`, `events: CalEvent[]`, `cals: Calendar[]`, `onDayClick`.

- [ ] T012 [US1] Criar `components/TimeGrid.tsx` — motor do grid de horas, semana/dia
  (design-guide §2, README §2; `cal-engine.jsx` do handoff como referência visual):
  - **Cabeçalho de dias** `.cal-dayhead` (sticky): sigla mono 10px + número display 19px/700,
    círculo 30px; hoje: fundo `--kg`, texto branco, sigla `--kg-deep`. Canto: "BRT" mono 8.5px.
  - **Faixa all-day** `.cal-allday` (sticky): pills `.cad-pill` por dia (`max-height 116px`,
    rola se transbordar).
  - **Grid 24h** `.cal-grid` (rolável `.cal-scroll`): altura `calc(24 * var(--hh))`; gutter 58px
    com rótulos mono 9.5px; linhas de hora via `repeating-linear-gradient`; scroll inicial ~07:00;
    hoje: tinta `color-mix(--kg 4%)`.
  - **Linha do agora** `.cg-now`: topo 2px `--p-high` + bolinha, só na coluna de hoje,
    `top:(nowMin/1440)*100%`; rótulo de hora em vermelho no gutter.
  - **Eventos timed** `.cg-event`: `top=(startMin/1440)*100%`, `height=(durMin/1440)*100%-2px`;
    largura/posição por **algoritmo de pistas** (colunas para sobreposição); tarefa → `.task`
    (borda tracejada); ≤30min → `.tiny` (1 linha); alça `.cg-resize` (8px no rodapé).
  - Props: `days: string[]`, `events: CalEvent[]`, `cals: Calendar[]`, `onEventClick`.
  - **Somente render nesta task** — interações (mover/resize/criar) vêm na US3 (T023).

- [ ] T013 [US1] Criar `components/CalendarsAside.tsx` — coluna lateral 264px
  (design-guide §4, README §4) — **somente mini-mês + navegação nesta task** (calendários
  conectados + toggle/recolor chegam na US2, T019):
  - **Mini-mês** `.mini`: título + ‹ › próprios; grade 7×6; hoje em `--kg-deep`; dia selecionado
    fundo `--kg`; **semana atual realçada** com faixa arredondada `--kg-tint`. Clicar navega o
    principal.
  - Campo de busca `.cal-srch` "Encontrar com…" (decorativo nesta fatia, design-guide §9).
  - Seção de calendários — placeholder com lista vazia por enquanto (preenchida na US2).
  - Posição via `data-col` (`agora`/`editorial` → direita; `helvetico` → esquerda).
  Props: `refDate`, `selectedDate`, `onDayClick`.

- [ ] T014 [US1] Substituir `webapp/frontend/src/pages/kaguya/screens/CalendarScreen.tsx` pelo
  componente raiz `CalendarPro` que orquestra as views (spec README "State Management"):
  - Estado: `view`, `refDate`, `events` (tarefas de `list_tasks_in_range` mapeadas para `CalEvent`),
    `cals` (lista de `Calendar` do hub — preenchida na US2), `pop`, `ctx`, `hint`.
  - Carrega tarefas da semana/dia/mês visível via `kaguyaApi.calendarAggregate` +
    `list_tasks_in_range` (endpoint `/api/tasks/calendar?start=&end=` já existente da 013).
  - Compõe `CalNavBar` + `TimeGrid` ou `MonthGrid` + `CalendarsAside`.
  - Dica flutuante `.cal-hint` (~4,2s).

- [ ] T015 [US1] Adicionar endpoint backend de suporte se necessário: confirmar que
  `GET /api/tasks/calendar?start=&end=` da 013 já devolve `start_at`/`end_at`/`duration_min`/
  `google_event_id` (campos novos) na resposta serializada. Se não, estender
  `tools_calendar.list_tasks_in_range` para incluí-los no `_serialize_task`.

- [ ] T016 [US1] Validar US1 só pelo webapp (Telegram desligado): alternar Dia/Semana/Mês;
  navegar ‹ ›; "Hoje" volta ao presente; linha do agora só na coluna de hoje; faixa all-day;
  rótulo SEMANA N pelo meio da semana; mini-mês com semana atual realçada; clicar no mini-mês
  navega o principal; clicar no cabeçalho de dia → vista Dia (SC-001). `npm run build` sem erros.

**Checkpoint**: calendário visual completo renderizando tarefas nos dias/horas corretos — a
"tela" da 019 existe. US2 e US4 podem começar em paralelo; US3 depende de T014.

---

## Phase 4: User Story 2 — Calendários conectados: ligar, desligar e recolorir (Priority: P1)

**Goal**: coluna lateral completa (grupos por conta, toggle/recolor, prefs persistidas) e o grid
exibindo eventos das bases cross-agent Nami/Frieren/Violet via hub + degradação graciosa.

**Independent Test**: desligar um calendário → seus itens somem do grid e mês; recolorir →
todos os eventos da base mudam de cor; cor e visibilidade persistem no reload; um provider
indisponível não derruba as demais camadas.

### Implementation for User Story 2

- [ ] T017 [P] [US2] Criar `agents/nami/calendar_provider.py` — SOURCE `{id:"nami", account:"makima",
  kind:"base", name:"Nami · Finanças", color:"oklch(0.70 0.17 52)"}` + `list_calendar_events(start,
  end) -> list[CalendarItem]`. Fontes (data-model §4): `subscriptions.next_billing` (all-day,
  title "Assinatura: {nome}"), vencimentos de parcelas/cartão (`due_day` do mês, all-day,
  title "Vencimento: {nome}"), `transactions.data` com hora (timed). `deep_link="/nami/..."`.
  Reusar `agents.db.run_select`. Docstring + type hints.

- [ ] T018 [P] [US2] Criar `agents/frieren/calendar_provider.py` — SOURCE `{id:"frieren",
  account:"makima", kind:"base", name:"Frieren · Livros", color:"oklch(0.72 0.10 184)"}` +
  `list_calendar_events`. Fontes: `reading_logs.date` (sessões de leitura — timed se houver
  `duration_min`; all-day caso contrário, title "Ler: {title}"); `books.date_finished` (conclusão
  — all-day, title "✓ {title}"). `deep_link="/books/..."`. Docstring + type hints.

- [ ] T019 [P] [US2] Criar `agents/journal/calendar_provider.py` — SOURCE `{id:"violet",
  account:"makima", kind:"base", name:"Violet · Diário", color:"oklch(0.58 0.16 300)"}` +
  `list_calendar_events`. Fonte: `journal_pages.date` (uma entrada por dia — all-day, title
  "Diário"). `deep_link="/journal/..."`. Docstring + type hints.

- [ ] T020 [US2] Registrar os providers criados em `agents/kaguya/calendar_hub.py`: importar e
  `register(SOURCE_NAMI, nami_provider.list_calendar_events)` etc. nos imports de módulo.
  Garantir que o stub Akane (inline, devolve `[]`) já está registrado desde T005. Confirmar que
  `test_kaguya_calendar_hub.py` (T006) ainda passa com os providers reais registrados.

- [ ] T021 [US2] Adicionar endpoints de calendário em `webapp/backend/routers/tasks.py` (contrato
  §5 — todas com `Depends(require_user)`):
  ```
  GET  /api/tasks/calendar/sources                   → calendar_hub.list_sources()        (listagem)
  GET  /api/tasks/calendar/aggregate?start=&end=&sources=  → calendar_hub.aggregate(...)  (listagem)
  GET  /api/tasks/calendar/prefs                     → calendar_prefs.get_calendar_prefs() (listagem)
  PATCH /api/tasks/calendar/prefs/{calendar_id}      → calendar_prefs.set_calendar_pref(...) (_check_result)
  ```
  Modelos Pydantic para o body de PATCH. Listagens sem `_check_result`.

- [ ] T022 [US2] Completar `CalendarsAside.tsx` com a seção de calendários conectados
  (design-guide §4, README §4 — continuação de T013):
  - Carrega `kaguyaApi.calendarSources()` e `kaguyaApi.calendarPrefs()` ao montar.
  - Grupos por conta (`CAL_ACCOUNTS`: "Makima · suíte" e "gustavo@gmail.com · Google Agenda").
  - Por calendário `.cal-item`: checkbox colorido `.ci-box` (preenchido quando visível),
    nome (tag "padrão" no primário `kaguya`), ícone de balde → paleta inline `.cal-colors`
    (swatches de `CAL_SWATCHES`, 10 cores OKLCH), ícone de olho no hover.
  - Toggle → `kaguyaApi.setCalendarPref(id, {visible})` + re-render.
  - Recolor → `kaguyaApi.setCalendarPref(id, {color})` + todos os eventos da base atualizam cor.
  - "Adicionar conta de calendário" tracejado (decorativo nesta fatia).
  - **Bandeja "Sem horário"** `.cal-tray`: tarefas da semana sem `start_at`; cada `TrayCard.tsx`
    arrastável (HTML5 `draggable`). TrayCard exibe título + `duration_min` formatado.

- [ ] T023 [US2] Integrar o aggregate no `CalendarScreen`: após carregar, combinar os `CalendarItem`
  do hub com as tarefas de `list_tasks_in_range` e os eventos do Google (quando disponíveis) num
  único array de `CalEvent`, respeitando `visible` de cada calendário. Items cross-agent sem
  `start`/`end` → faixa all-day; com → grid. Exibir `errors[]` do aggregate com sinalização visual
  suave na aside (ex.: "Nami indisponível").

- [ ] T024 [US2] Validar US2: toggle de calendários filtra eventos no grid e no mês; recolor
  propaga para todos os eventos da base; prefs persistem após reload; provider com erro simulado
  não derruba o calendário (SC-002/SC-005). Confirmação manual.

**Checkpoint**: "hub" completo — as bases cross-agent aparecem no calendário como camadas toggleáveis.
US3 pode começar.

---

## Phase 5: User Story 3 — Criar, mover e bloquear no grid (Priority: P2)

**Goal**: interações de grid — mover/redimensionar/criar por pointer + time-blocking por drag da
bandeja — para eventos editáveis (base Kaguya e Agenda pessoal Google). Bases cross-agent não
se movem; clique deep-linka.

**Independent Test**: arrastar um evento Kaguya → atualiza `start_at`/`end_at`/`due_date`; puxar
alça → só o fim muda (mín 15min); arrastar área vazia → popover de criação (mín 30min); arrastar
TrayCard para 14h → tarefa ganha `start_at=14:00` com duração estimada. Tentar arrastar evento
da Nami → não move, clique abre deep-link.

### Implementation for User Story 3

- [ ] T023 [US3] Adicionar pointer events ao `TimeGrid.tsx` (design-guide §5, README Interactions;
  `cal-engine.jsx` como referência comportamental). Compensação de escala: `rect.height/offsetHeight`.
  Snap de **15 minutos** em todas as interações.
  - **Mover**: `pointerdown` no corpo do evento → arrastar (coluna = dia, Y = hora, preserva offset
    interno); fantasma ao vivo; commit no `pointerup` → chama `kaguyaApi` (para Kaguya:
    `PATCH /tasks/{id}` com `due_date`/`start_at`/`end_at`; para Google: `updateCalendarEvent`).
    Clique sem arrastar → abre `EventPopover`.
  - **Redimensionar**: `pointerdown` em `.cg-resize` → ajusta só o fim (mín 15min); commit →
    `set_time_block` (Kaguya) ou `updateCalendarEvent` (Google).
  - **Criar arrastando**: `pointerdown` em área vazia → define início/fim (mín 30min) →
    fantasma `.cg-ghost` tracejado com faixa de horário; `pointerup` → cria evento (Kaguya:
    `POST /tasks` com `due_date`+`start_at`+`end_at`; Google: `createCalendarEvent`) + abre
    `EventPopover`.
  - **Editabilidade por fonte**: mover/resize/criar **só** em `cal==="kaguya"` e `cal==="gcal"`.
    Bases cross-agent (`nami`/`frieren`/`violet`/`akane`): sem alça de resize, sem drag;
    `pointerdown` → não inicia drag; clique → deep-link (`window.location = ev.deepLink`).

- [ ] T024 [US3] Adicionar drop de **time-blocking** ao `TimeGrid.tsx`: `onDragOver` na coluna
  (aceita transfers do `TrayCard`); `onDrop` → lê `taskId` do `dataTransfer`, calcula horário do
  drop (snap 15min), chama `POST /tasks/{id}/time-block {start_at, duration_min}` → tarefa sai
  da bandeja `.cal-tray` e aparece no grid como evento Kaguya com duração estimada (ou 30min se
  sem estimativa). Integrar com o 016 (`set_time_block` já existe em `tools_tasks.py` e o endpoint
  `POST /tasks/{id}/time-block` já existe no router).

- [ ] T025 [P] [US3] Criar `components/EventPopover.tsx` — popover de evento editável
  (design-guide §5, README Interactions):
  - Título editável (input `onBlur` → salva).
  - Horário/local editáveis, calendário de origem (read-only).
  - Botão de **cor** → paleta `CAL_SWATCHES` + "voltar à cor do calendário" (`color=null`).
  - Botão **excluir** → confirmar → `DELETE /tasks/{id}` (Kaguya) ou `deleteCalendarEvent`
    (Google) → fechar.
  - Posicionado ao lado do evento, clamped à viewport.
  - Animação `cpop-in` (opacity + translateY(-6px) + scale(.98), 120–140ms).
  - **Só abre para eventos editáveis** — cross-agent/integração recebe variante read-only (só info).

- [ ] T026 [P] [US3] Criar `components/ContextMenu.tsx` — menu de contexto (clique-direito em
  evento, design-guide §5):
  - Linha de swatches `CAL_SWATCHES` para recolorir o evento (sobrescreve só aquele).
  - **Duplicar** → cria cópia (`POST /tasks` ou `createCalendarEvent` com mesmo body).
  - "Cor do calendário" → `color=null` (volta à cor da base).
  - **Excluir** (mesma lógica do popover).
  - Posicionado em `{x,y}` do clique-direito, clamped à viewport; mesma animação `cpop-in`.

- [ ] T027 [US3] Validar US3: mover/redimensionar evento Kaguya → banco atualizado (snap 15min
  confirmado); criar arrastando → tarefa criada + popover aberto; TrayCard drag → `start_at`
  gravado, tarefa sai da bandeja; evento cross-agent não arrasta e deep-linka; evento Google
  editável via popover. Confirmar mínimos (15min resize, 30min criar) (SC-003).

**Checkpoint**: o calendário é "usável" — interação direta funciona e respeita a editabilidade
por fonte.

---

## Phase 6: User Story 4 — Espelho 2-way Google + Agenda pessoal no webapp (Priority: P2)

**Goal**: tarefas com data viram eventos no calendário "Kaguya — Tarefas" (espelho best-effort,
automático ao operar tarefas); base "Agenda pessoal" permite criar/editar/apagar eventos do Google
pelo webapp.

**Independent Test**: criar/concluir/excluir uma tarefa com data → evento aparece/atualiza/some no
"Kaguya — Tarefas" do Google Calendar; `ensure_kaguya_calendar` é idempotente (reiniciar não
duplica); com `GCAL_SYNC_ENABLED=false` ou Google offline, CRUD de tarefas funciona normalmente;
criar evento pela UI → aparece no Google Calendar real.

### Implementation for User Story 4

- [ ] T028 Criar `agents/kaguya/gcal_sync.py` — espelho de saída best-effort (contrato §2):
  - `push_task(task_id: int) -> None` — lê a tarefa do banco; decide timed ou all-day (data-model
    §5); se `google_event_id` existe → `gcal.update_event`; senão → `gcal.create_event` +
    salva o id em `tasks.google_event_id`. Recorrente: só a ocorrência viva (sem RRULE Google, D5).
    Concluída: prefixo "✓ " no título. Tudo em try/except; nunca levanta.
  - `remove_task_event(task_id: int) -> None` — se `google_event_id` não nulo →
    `gcal.delete_event`; limpa `google_event_id` no banco. Em try/except; nunca levanta.
  - Gated por `os.environ.get("GCAL_SYNC_ENABLED","true").lower() != "false"` (D4).
  Docstring + type hints.

- [ ] T029 Criar `tests/agents/test_kaguya_gcal_sync.py` (SC-004):
  - Mapeamento timed (`start_at` presente) → `create_event` com hora.
  - Mapeamento all-day (só `due_date`) → evento all-day.
  - Concluir → título com "✓ "; reabrir → remove prefixo.
  - Soft-delete → `remove_task_event` chamado; `google_event_id` limpo no banco.
  - Restore → `push_task` chamado novamente.
  - Upsert idempotente: segunda chamada usa `update_event` com o mesmo `google_event_id`, sem duplicar.
  - Recorrente: só a linha viva é espelhada (sem gerar múltiplos eventos).
  - Google mockado (patch de `gcal.create_event` levanta `Exception`): `push_task` não levanta;
    CRUD de tarefa continua funcionando; `google_event_id` fica `None`.
  Rodar `pytest tests/agents/test_kaguya_gcal_sync.py -q`.

- [ ] T030 Adicionar gatilhos do espelho em `agents/kaguya/tools_tasks.py` (D4 — gatilho na
  camada de lógica garante paridade Telegram automática):
  - Após o `conn.commit()` de cada mutação: `create_task`, `update_task`, `complete_task`,
    `reopen_task`, `delete_task` (soft-delete → `remove_task_event`), `restore_task`,
    `set_time_block`, `clear_time_block`.
  - Padrão: bloco `try: gcal_sync.push_task(task_id) except Exception: pass` **fora** da
    transação (não segurar o lock do Postgres em chamada HTTP ao Google).
  - `delete_task` e soft-delete → `gcal_sync.remove_task_event(task_id)`.

- [ ] T031 Adicionar endpoints Google no `webapp/backend/routers/tasks.py` (contrato §5,
  todos com `Depends(require_user)`):
  ```
  GET  /api/tasks/calendar/calendars           → gcal.list_calendars()          (listagem)
  GET  /api/tasks/calendar/events?start=&end=  → gcal.list_events(start,end)    (listagem)
  POST /api/tasks/calendar/events              → gcal.create_event(...)         (_check_result)
  PATCH /api/tasks/calendar/events/{id}        → gcal.update_event(id,...)      (_check_result)
  DELETE /api/tasks/calendar/events/{id}       → gcal.delete_event(id)         (_check_result)
  ```
  `gcal.list_events` já exclui "Kaguya — Tarefas" e "TickTick" por padrão (anti-duplicação, D6).
  Modelos Pydantic para POST/PATCH bodies.

- [ ] T032 [US4] Integrar a base "Agenda pessoal" (`gcal`) ao `CalendarScreen`: carregar eventos
  do Google via `kaguyaApi.calendarEvents(start, end)` quando `cal="gcal"` estiver visível;
  mapear para `CalEvent{cal:"gcal"}`; esses eventos **entram no `TimeGrid`/`MonthGrid` como editáveis**
  (mover/resize/criar/excluir via `updateCalendarEvent`/`createCalendarEvent`/
  `deleteCalendarEvent`). Confirmar que o calendário espelho "Kaguya — Tarefas" e "TickTick"
  **não aparecem** no overlay (anti-duplicação: `gcal.list_events` já os exclui).

- [ ] T033 [US4] Validar US4 (SC-004): criar tarefa com data → evento aparece no Google Calendar;
  editar a data → mesmo `google_event_id` atualizado; concluir → "✓ " no título; soft-delete →
  evento removido; `ensure_kaguya_calendar` idempotente (reiniciar bot — calendário não duplica);
  com `GCAL_SYNC_ENABLED=false` → CRUD de tarefas OK, nenhuma chamada Google; criar evento pela
  UI da "Agenda pessoal" → aparece no Google Calendar real (SC-004).

**Checkpoint**: 2-way Google completo — tarefas espelhadas automaticamente, Agenda pessoal
gerenciável no webapp.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T034 [P] Paridade Telegram: estender `agents/kaguya/tools.py` para que a consulta
  "o que tenho essa semana" possa incluir as camadas via `calendar_hub.aggregate`, devolvendo
  os items em texto (por data, por calendário, read-only — as camadas cross-agent). Atualizar
  `_INSTRUCTION` em `agent.py` com a menção ao hub de calendários e às bases conectadas.

- [ ] T035 [P] Estender `webapp/frontend/src/pages/kaguya/TweaksPanel.tsx` com o seletor de
  **variante** (`agora` | `helvetico` | `editorial`) e **tema** (`light` | `dark`) para o
  calendário — aplicados como `data-variant` e `data-theme` no `.calx` (design-guide §6).

- [ ] T036 [P] Atualizar `agents/kaguya/CLAUDE.md`: documentar `gcal.py`, `gcal_sync.py`,
  `calendar_hub.py`, `calendar_prefs.py`, o protocolo de provider (`CalendarItem`, `SOURCE`),
  os providers registrados (Nami/Frieren/Violet/Akane-stub), o espelho best-effort e os gatilhos
  em `tools_tasks.py`.

- [ ] T037 [P] Atualizar `CLAUDE.md` raiz: árvore de arquivos da Kaguya (adicionar `gcal.py`,
  `gcal_sync.py`, `calendar_hub.py`, `calendar_prefs.py`); nota de que `GOOGLE_CALENDAR_*`
  agora também entram no container `makima-web`; atualizar status da Fase 2 (se 019 for
  considerada parte dela).

- [ ] T038 Rodar a validação cruzada completa (SC-001 a SC-006):
  - SC-001: três visões renderizam tarefas nos dias/horas corretos, all-day, agora e ISO-week.
  - SC-002: toggle/recolor persiste entre sessões.
  - SC-003: mover/resize/criar/time-block gravam na fonte; cross-agent não move.
  - SC-004: espelho automático; idempotente; Google offline não quebra CRUD.
  - SC-005: provider com erro não derruba o calendário; `errors[]` na resposta.
  - SC-006: checklist de paridade Telegram ("o que tenho essa semana" inclui camadas).
  Rodar `pytest tests/agents/test_kaguya_calendar_hub.py tests/agents/test_kaguya_gcal_sync.py -q`.
  `npm run build` sem erros de tipos.

- [ ] T039 Refletir a fatia no vault do Obsidian (skill `obsidian-vault`): Calendar Hub, espelho
  2-way Google, protocolo de provider cross-agent, variantes visuais.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Setup (P1: T001–T002)
    → Foundational (P2: T003–T009)   ← tudo bloqueia aqui
        → US1 (P3: T010–T016)        ← grid visual, renderiza só tarefas
            → US3 (P5: T023–T027)    ← interações de grid (precisa do TimeGrid renderizando)
        → US2 (P4: T017–T024)        ← providers + aside + endpoints aggregate
            → US3 (endpoints)        ← US3 edita Google; precisa dos endpoints de US4 tbm
        → US4 (P6: T028–T033)        ← espelho + Google; independente do visual
        → Polish (P7: T034–T039)     ← tudo concluído
```

- **US1 e US2** podem rodar em paralelo após a Foundational (arquivos distintos: frontend grid
  × providers Python + aside + endpoints).
- **US3** precisa do `TimeGrid` renderizando (T012) e dos endpoints Google (T031) — começa depois
  de US1/T012 e da US4/T031 estarem prontos.
- **US4** é independente do visual — pode rodar em paralelo com US1/US2 após a Foundational.
- **Polish** depende de todas as user stories.

### Parallel Opportunities

- T002 ∥ T003 (config.py × gcal.py — arquivos distintos).
- T004 ∥ T005 ∥ T007 ∥ T008 ∥ T009 na Foundational (todos em arquivos distintos).
- T017 ∥ T018 ∥ T019 (providers independentes — um por agente).
- T010 ∥ T011 ∥ T012 ∥ T013 na US1 (componentes distintos antes de compor em T014).
- T025 ∥ T026 na US3 (EventPopover e ContextMenu — componentes independentes).
- US4: T028 (gcal_sync) ∥ T029 (testes) — podem avançar juntos.
- T034 ∥ T035 ∥ T036 ∥ T037 no Polish (arquivos distintos).

## Implementation Strategy

**Incremental com paridade**: Setup + Foundational (cliente Google + hub + prefs + base do frontend)
→ **US1 e US2 em paralelo** (grid visual + providers/aside — valor imediato em ambos os eixos) →
**US3** (interações de grid — diferencial da fatia) e **US4** (espelho 2-way — fechando o 2-way)
→ Polish. Cada checkpoint é deployável e verificável independentemente. A base cross-agent (US2)
e o espelho (US4) são completamente independentes do visual — podem ser entregues antes do grid
estar totalmente funcional.

**Frontend**: recriar o handoff `design_handoff_kaguya_calendario/` no stack real do repo
(TypeScript + React + kaguya.css) — **não portar o JSX**. Referência visual, não código de produção.
Reusar tokens `.kg-app`, ícones de `ui/Icons.tsx` do repo, padrão Shell existente do KaguyaShell.

**Total**: 39 tasks — Setup 2 · Foundational 7 · US1 7 · US2 8 · US3 5 · US4 6 · Polish 6.
