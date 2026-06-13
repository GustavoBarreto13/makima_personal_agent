# Implementation Plan: Calendar Hub — Calendário Completo + 2-way Google + Cross-agent (fatia 019)

**Branch**: `019-tasks-calendar-hub` | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification de `specs/019-tasks-calendar-hub/spec.md` (filha da master
[`specs/010-kaguya-tasks-app/`](../010-kaguya-tasks-app/spec.md), FR-018/FR-020). Constrói sobre
[`011`](../011-tasks-mvp/spec.md) (MVP), [`012`](../012-tasks-recurrence/spec.md) (recorrência),
[`013`](../013-tasks-tags-smartlists-calendar/spec.md) (tags/smart lists/calendário simples) e
[`016`](../016-tasks-meudia/spec.md) (Meu Dia / time-blocking).

**Escopo deste plano**: **US1–US4** (calendário Dia/Semana/Mês, calendários conectados, interações de
grid, espelho 2-way Google + CRUD da Agenda pessoal). **US5** (conectores externos Animes/Futebol/
Feriados) e o provider real de **Akane/Filmes** (agente `media`, Fase 5b ainda não existe) ficam como
fase posterior — as fontes dos conectores externos são indefinidas e o agente ainda não está ativo.

## Summary

Substitui a **`CalendarScreen` simples da fatia 013** por um **calendário pessoal completo** (estilo
Notion Calendar / Google Calendar) com visões **Dia / Semana / Mês**, coluna lateral de calendários
conectados, interações de grid (mover/redimensionar/criar/time-blocking) e a liga 2-way com o Google:

1. **Calendário completo (US1)**: `TimeGrid` (grade 24h, faixa all-day, linha do agora, BRT) e
   `MonthGrid` (6 semanas, pills, "+N mais"), com barra de navegação, mini-mês lateral e segmented
   Dia/Semana/Mês.
2. **Calendários conectados (US2)**: modelo contas → calendários ("Makima · suíte" + Google);
   toggle/recolor com prefs persistidas em `calendar_prefs` (Postgres); bases cross-agent via
   protocolo de provider — **Nami, Frieren, Violet** reais + **Akane** como stub vazio. A
   agregação degrada graciosamente (provider com erro não derruba os demais).
3. **Interações de grid (US3)**: mover/redimensionar/criar arrastando na grade (snap 15min),
   time-blocking (arrastar da bandeja "Sem horário" para o grid), popover e menu de contexto —
   editáveis só nas bases Kaguya (tarefas) e Agenda pessoal (Google).
4. **Espelho de saída + CRUD Google no webapp (US4)**: tarefas-pai com data viram eventos no
   calendário "Kaguya — Tarefas" (push best-effort via `gcal_sync.py`, gated por
   `GCAL_SYNC_ENABLED`); a base Agenda pessoal permite criar/editar/apagar eventos no calendário
   Google principal via `gcal.py`.

**Paridade total**: o gatilho do espelho vive na **camada de lógica** (`tools_tasks.py`), então o
Telegram herda o espelho automaticamente sem código novo. A consulta "o que tenho essa semana" pode
incluir as camadas via `calendar_hub.aggregate`.

**Mudança de schema mínima**: `tasks.google_event_id TEXT` (não existe ainda) + tabela nova
`calendar_prefs`. Nenhuma dep nova — `google-api-python-client` e `google-auth` já estão no projeto
para o MCP do Calendar.

## Technical Context

**Language/Version**: Python 3.12 (backend/agente/sync), TypeScript 5.8 + React 19 (frontend).

**Primary Dependencies**: `google-api-python-client` / `google-auth` / `google-auth-oauthlib` (já
usados pelo MCP `mcp_servers/calendar/server.py` — nenhuma dep nova); psycopg2-binary (síncrono,
já em uso); FastAPI + Pydantic; Vite 6 + Tailwind 3 (frontend). **Zero dependências novas**.

**Storage**: PostgreSQL existente. **DDL necessária** (aplicada via `scripts/setup_schemas.py`
rodado de dentro do container `makima-web`, conforme CLAUDE.md raiz):
```sql
-- Coluna nova em tasks (só coluna; não há migration automático — IF NOT EXISTS é idempotente)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS google_event_id TEXT;

-- Tabela nova para preferências de calendário (visibilidade + cor por calendário)
CREATE TABLE IF NOT EXISTS calendar_prefs (
    calendar_id  TEXT PRIMARY KEY,   -- id do calendário (ex.: "kaguya", "nami", "gcal")
    visible      BOOL NOT NULL DEFAULT TRUE,
    color        TEXT,               -- cor OKLCH sobrescrita (null = cor padrão do calendário)
    position     INT  NOT NULL DEFAULT 0
);
```
Sem outras DDL. As colunas `start_at`/`end_at`/`duration_min`/`my_day_date` da 016 já existem.

**Testing**: pytest, padrão `tests/agents/`. Dois alvos novos:
- `test_kaguya_gcal_sync.py` — mapeamento tarefa→evento (timed/all-day, "✓ " ao concluir, remoção
  ao soft-delete), idempotência (`google_event_id` reutilizado, sem duplicar), best-effort com
  Google mockado (SC-004).
- `test_kaguya_calendar_hub.py` — `aggregate` fan-out: resultados de múltiplos providers,
  degradação graciosa quando um provider levanta exceção (SC-005).
- Helpers de tempo/ISO-week do frontend (SC-001) — verificados via os próprios testes do grid ou
  testes unitários utilitários (a decidir na implementação).

**Target Platform**: VPS Linux (Docker/Dokploy). Container `makima-web` (webapp + router) + bot
coordinator. O `gcal.py` roda **dentro do webapp** — logo o container `makima-web` passa a
precisar das env vars `GOOGLE_CALENDAR_*` (hoje só no coordinator) — FR-017.

**Project Type**: Web application (FastAPI + React) + agente conversacional (Telegram/ADK) sobre
a mesma camada de lógica (`agents/kaguya/tools_tasks.py`). Padrão Shell estabelecido; `KaguyaShell`
e o roteamento `/tasks/*` já existem.

**Performance Goals**: `calendar_hub.aggregate` é fan-out paralelo best-effort; cada provider tem
timeout implícito (try/except). A leitura de tarefas `list_tasks_in_range` já existe e é eficiente
(sem N+1). O frontend calcula layout de pistas (sobreposição de eventos) localmente após receber
os dados do aggregate — sem round-trips extras.

**Constraints**: single-user; soft delete preservado; paridade total (nenhuma regra de negócio fora
da camada de lógica); fuso fixo `America/Sao_Paulo`; espelho best-effort (falha do Google nunca
quebra CRUD de tarefas); editabilidade por fonte respeitada (só Kaguya/tarefas + Agenda pessoal/
Google). Escrita Google só no calendário principal (D7). MCP do Calendar permanece intacto (D2).

**Scale/Scope**: 1 usuário; ~6 módulos novos na camada de lógica (`gcal.py`, `gcal_sync.py`,
`calendar_hub.py`, `calendar_prefs.py`, 3 providers cross-agent, 1 stub); ~10 endpoints novos no
router; 1 tela rich (substitui a `CalendarScreen` simples da 013) com ~8 componentes novos;
`tools_tasks.py` recebe gatilhos em ~8 pontos.

## Constitution Check

*GATE: constitution v1.0.1 — verificado antes do Phase 0 e re-verificado pós-design.*

| Princípio | Avaliação |
|---|---|
| **I. Agent Specialization** | ✅ Kaguya dona exclusiva do hub de calendário. Os providers vivem **dentro do pacote de cada agente** (`agents/<dom>/calendar_provider.py`) — cada domínio descreve seus próprios dados datados; a Kaguya só agrega. Makima não ganha lógica. |
| **II. Hybrid Batch + Agentic** | ✅ Nenhum batch novo; apenas camada interativa e espelho best-effort inline. |
| **III. Self-Contained Agents** | ✅ `gcal.py`, `gcal_sync.py`, `calendar_hub.py`, `calendar_prefs.py` todos dentro de `agents/kaguya/`. A Kaguya importa `list_calendar_events` de cada agente (shape normalizado `CalendarItem`) sem conhecer os schemas alheios (D8). |
| **IV. Portuguese-First UX** | ✅ Kaguya relata em português ("o que tenho essa semana" inclui as camadas); erros do espelho não viram 500 (try/except em `gcal_sync`). |
| **V. Minimal Footprint** | ✅ Zero dep nova; 1 coluna `IF NOT EXISTS` + 1 tabela; espelho best-effort com flag (`GCAL_SYNC_ENABLED`). Akane como stub não adiciona código no agente `media`. |
| **Constraints arquiteturais** | ✅ `gemini-2.5-flash`; MCP do Calendar intacto; psycopg2 síncrono; escrita Google só no principal. |

**Resultado**: PASS — sem pendências de governança.

## Project Structure

### Documentation (this feature)

```text
specs/019-tasks-calendar-hub/
├── spec.md                          # especificação (pronta)
├── plan.md                          # este arquivo
├── research.md                      # 17 decisões técnicas (D1–D17)
├── data-model.md                    # schema, CalendarItem, mapeamento espelho, geometria
├── design-guide.md                  # layout, componentes, variantes, design tokens
├── contracts/
│   └── api-calendar.md              # contrato REST + protocolo provider + gcal/gcal_sync
└── design_handoff_kaguya_calendario/
    └── *.html/jsx/css               # protótipo alta fidelidade (referência, não copiar)
```

### Source Code (repository root)

```text
agents/kaguya/
├── gcal.py                # NOVO — cliente Google compartilhado (não-MCP)
│                          #   ensure_kaguya_calendar() → id cacheado (idempotente, acha por nome)
│                          #   list_calendars() → [{id, name, role, is_main, is_kaguya}]
│                          #   list_events(date_from, date_to,
│                          #       exclude=("Kaguya — Tarefas","TickTick")) → list[dict]
│                          #   create_event / update_event / delete_event (só calendário principal)
│                          #   Reusa o _get_service / auth OAuth do server.py (refresh on-demand)
│
├── gcal_sync.py           # NOVO — espelho de saída tarefas → Google, best-effort
│                          #   push_task(task_id) → None   (upsert: criar ou atualizar o evento)
│                          #   remove_task_event(task_id) → None   (ao soft-delete / sem data)
│                          #   Regras (data-model §5): timed se start_at|due_time; all-day se só
│                          #   due_date; "✓ " no título ao concluir; recorrente = só ocorrência viva.
│                          #   try/except + log; nunca levanta; gated por GCAL_SYNC_ENABLED.
│                          #   Atualiza tasks.google_event_id após upsert OK.
│
├── calendar_hub.py        # NOVO — agregador de providers/conectores
│                          #   SOURCES: lista dos providers registrados (Nami, Frieren, Violet +
│                          #       stub Akane + gcal como integration)
│                          #   register(source) → registra um provider/conector
│                          #   list_sources() → [{id, account, kind, name, color}] + prefs aplicadas
│                          #   aggregate(start, end, sources=None)
│                          #       → {sources:[...], items:[CalendarItem...], errors:[source_id...]}
│                          #       fan-out best-effort: provider que falha → errors[], não derruba
│
├── calendar_prefs.py      # NOVO — CRUD de preferências de calendário
│                          #   get_calendar_prefs() → list[dict {calendar_id,visible,color,position}]
│                          #   set_calendar_pref(calendar_id, visible?, color?, position?) → dict
│                          #   Persiste na tabela calendar_prefs (ver schema acima)
│
├── tools_tasks.py         # ESTENDIDO — gatilhos do espelho Google após cada mutação de tarefa
│                          #   Em create_task / update_task / complete_task / reopen_task /
│                          #   delete_task / restore_task / set_time_block / clear_time_block:
│                          #   chamar gcal_sync.push_task ou remove_task_event após commit.
│                          #   D4: gatilho na camada de lógica = Telegram herda o espelho grátis.
│
├── tools.py               # ESTENDIDO — fachada de paridade
│                          #   list_tasks_in_range já existe; adicionar acesso ao calendar_hub.aggregate
│                          #   para a consulta "o que tenho essa semana" incluir as camadas.
│
├── schema_tasks_pg.sql    # ESTENDIDO — adicionar:
│                          #   ALTER TABLE tasks ADD COLUMN IF NOT EXISTS google_event_id TEXT;
│                          #   CREATE TABLE IF NOT EXISTS calendar_prefs (...);
│
├── agent.py               # ESTENDIDO (minor) — _INSTRUCTION menciona que "o que tenho essa semana"
│                          #   pode incluir bases cross-agent via o hub
│
└── CLAUDE.md              # ESTENDIDO — documenta gcal.py, gcal_sync.py, calendar_hub.py,
                           #   calendar_prefs.py, protocolo de provider, scope dos gatilhos

agents/nami/
└── calendar_provider.py   # NOVO — SOURCE {id:"nami", account:"makima", kind:"base", ...}
                           #   list_calendar_events(start_date, end_date) → list[CalendarItem]
                           #   Fontes: subscriptions.next_billing (all-day), vencimentos de cartão/
                           #   parcelas (all-day), transactions.data (timed se houver hora).
                           #   deep_link = "/nami/..." (transação ou assinatura)

agents/frieren/
└── calendar_provider.py   # NOVO — SOURCE {id:"frieren", account:"makima", kind:"base", ...}
                           #   Fontes: reading_logs.date (sessões de leitura — timed com duração),
                           #   books.date_finished (conclusões — all-day), lançamentos futuros.
                           #   deep_link = "/books/..."

agents/journal/
└── calendar_provider.py   # NOVO — SOURCE {id:"violet", account:"makima", kind:"base", ...}
                           #   Fonte: journal_pages.date (entradas do diário — all-day).
                           #   deep_link = "/journal/..."

# Stub Akane (sem pacote agents/media/ ainda):
# calendar_hub.py registra SOURCE {id:"akane", ...} com list_calendar_events → []
# Camada visível na UI, retorna vazio, não quebra o hub.

webapp/backend/
├── config.py              # ESTENDIDO — ler GOOGLE_CALENDAR_* (já presentes no coordinator;
│                          #   agora também expostos para o container makima-web via Dokploy)
│                          #   + GCAL_SYNC_ENABLED (bool, default True)
└── routers/tasks.py       # ESTENDIDO — novos endpoints (prefixo /api/tasks/calendar/):
                           #   GET  /calendar/sources        → calendar_hub.list_sources()
                           #   GET  /calendar/aggregate      → calendar_hub.aggregate(start,end,sources)
                           #   GET  /calendar/prefs          → calendar_prefs.get_calendar_prefs()
                           #   PATCH /calendar/prefs/{cal_id} → calendar_prefs.set_calendar_pref(...)
                           #   GET  /calendar/calendars      → gcal.list_calendars()
                           #   GET  /calendar/events         → gcal.list_events(start,end) (anti-dup)
                           #   POST /calendar/events         → gcal.create_event(...) (só principal)
                           #   PATCH /calendar/events/{id}  → gcal.update_event(...)
                           #   DELETE /calendar/events/{id} → gcal.delete_event(...)
                           #   Todas com Depends(require_user). Mutações: _check_result. Listagens: direto.
                           #   Eventos da base Kaguya reusam endpoints de tarefa existentes (D14).

webapp/frontend/src/pages/kaguya/
├── screens/CalendarScreen.tsx  # SUBSTITUÍDO — calendário completo, compõe os componentes abaixo.
│                               #   Orquestra: view (day|week|month), refDate, events (do aggregate +
│                               #   tarefas + Google), cals (do list_sources + prefs), pop/ctx/hint.
│                               #   Recriar o handoff no stack real do repo — NÃO copiar o JSX.
│
├── components/
│   ├── CalNavBar.tsx           # NOVO — barra de navegação (mês/ano, SEMANA N ISO, ‹ ›, Hoje, segmented)
│   ├── TimeGrid.tsx            # NOVO — motor do grid de horas (semana/dia)
│   │                           #   Cabeçalho de dias (sticky), faixa all-day (sticky), grid 24h
│   │                           #   (scroll ~07h), linha do agora, eventos timed (% de 24h, layout de
│   │                           #   pistas para sobreposição), alça resize (cg-resize).
│   │                           #   Pointer events: mover (snap 15min, coluna=dia, Y=hora),
│   │                           #   redimensionar (só o fim, mín 15min), criar arrastando (mín 30min,
│   │                           #   abre popover). Drop de time-blocking (HTML5 drag do TrayCard).
│   │                           #   Compensação de escala: rect.height/offsetHeight.
│   │                           #   Editabilidade por fonte: só kaguya + gcal; bases cross-agent
│   │                           #   read-only (sem alça, sem drag) → clique deep-linka.
│   ├── MonthGrid.tsx           # NOVO — grade 6 semanas × 7 colunas; pills (timed/all-day),
│   │                           #   "+N mais", hoje destacado, clicar célula → dia, dim (fora do mês).
│   ├── CalendarsAside.tsx      # NOVO — coluna lateral 264px (à direita em agora/editorial, esquerda
│   │                           #   em helvetico via data-col). Mini-mês (grade 7×6, semana realçada,
│   │                           #   clicar navega principal), busca decorativa, grupos por conta
│   │                           #   (checkbox colorido, balde → paleta CAL_SWATCHES, olho hover),
│   │                           #   bandeja "Sem horário" (TrayCard arrastável para TimeGrid).
│   ├── EventPopover.tsx        # NOVO — editar título/horário/local/cor, excluir; posicionado ao lado,
│   │                           #   clamped à viewport; animação cpop-in.
│   ├── ContextMenu.tsx         # NOVO — clique-direito: swatches, duplicar, cor do calendário, excluir.
│   └── TrayCard.tsx            # NOVO — card da bandeja "Sem horário" (draggable HTML5).
│
├── kaguyaApi.ts           # ESTENDIDO — novos métodos:
│                          #   calendarSources() / calendarAggregate(start,end,sources?)
│                          #   calendarPrefs() / setCalendarPref(cal_id, patch)
│                          #   calendarCalendars() / calendarEvents(start,end)
│                          #   createEvent(body) / updateEvent(id,body) / deleteEvent(id)
│
├── types.ts               # ESTENDIDO — interfaces novas:
│                          #   CalAccount, Calendar, CalEvent (shape unificado UI), CalendarItem
│                          #   (shape normalizado providers), CalendarPref.
│                          #   Task ganha google_event_id?: string.
│
├── TweaksPanel.tsx        # ESTENDIDO — seletor de variante (agora|helvetico|editorial) +
│                          #   tema (light|dark) do calendário (via data-variant/data-theme no .calx)
│
└── kaguya.css             # ESTENDIDO — geometria do calendário:
                           #   --hh (52/54/60px por variante), --gutter: 58px, --col-w: 264px;
                           #   3 variantes (agora/helvetico/editorial); tema claro/escuro .calx;
                           #   cores OKLCH dos 9 calendários + CAL_SWATCHES (10 swatches);
                           #   classes: .calx, .cal-bar, .cal-dayhead, .cal-allday, .cal-grid,
                           #   .cal-scroll, .cg-event, .cg-now, .cg-ghost, .cg-resize,
                           #   .cmo-grid, .cmo-cell, .cmo-pill, .cal-aside, .mini,
                           #   .cal-item, .cal-colors, .cal-tray, .cal-hint, cpop-in animation.

tests/agents/
├── test_kaguya_gcal_sync.py   # NOVO — SC-004
│                               #   mapeamento timed (start_at presente) → evento com hora
│                               #   mapeamento all-day (só due_date) → evento all-day
│                               #   concluir → "✓ " no título; reabrir → remove prefixo
│                               #   soft-delete → evento removido; restore → recria
│                               #   upsert idempotente: update usa mesmo google_event_id, sem dup
│                               #   recorrente: só a ocorrência viva espelha (sem RRULE no Google)
│                               #   Google mockado (patch de gcal.*): falha → não levanta, CRUD OK
└── test_kaguya_calendar_hub.py # NOVO — SC-005
                                #   aggregate com 2 providers mock → items de ambos concatenados
                                #   provider que levanta exceção → errors[], demais providers OK
                                #   aggregate com sources=["nami"] → filtra só Nami
                                #   list_sources() inclui stub Akane (visible, items=[])
```

**Structure Decision**: o padrão Shell/api/types/css já estabelecido (Nami, Frieren, Violet, e a
própria Kaguya) é mantido. `CalendarScreen.tsx` é substituição direta da simples da 013. Os
providers cross-agent ficam **nos pacotes de cada agente** (não em `agents/kaguya/`), respeitando
o isolamento de domínio (D8). Nenhuma camada nova é inventada; nenhuma tabela além das duas DDL.

**Frontend — fonte única de verdade**: a tela segue o guia de design
[`design-guide.md`](./design-guide.md) e o protótipo de alta fidelidade em
`design_handoff_kaguya_calendario/` (recriar no stack real do repo — **não** copiar o JSX; a
referência é de design, não de código de produção). Reusar tokens `--kg*`/`--p-*`/`--ink-*`/sombras
de `.kg-app` já definidos em `kaguya.css`; ícones via `ui/Icons.tsx` do repo. Constantes:
`--hh=52px` (agora), snap 15min, semana ISO pelo meio da semana (quinta), `TODAY`/`NOW` de
`new Date()` (o protótipo fixa datas mock).

## Complexity Tracking

Sem violações da constitution. Riscos a vigiar na implementação:

- **Gatilho do espelho × transações**: o `gcal_sync.push_task` deve ser chamado **após** o commit
  do PostgreSQL (não dentro do bloco `with conn` / `try: cur.execute`), para não segurar a transação
  em chamadas HTTP ao Google. O padrão: `commit` → chamar sync em try/except fora da transação.
- **Idempotência do `ensure_kaguya_calendar`**: achar por nome `"Kaguya — Tarefas"` na lista de
  calendários, cachear o id em memória (variável de módulo). Reiniciar o processo recria o cache —
  não duplica o calendário.
- **Upsert por `google_event_id`**: `push_task` verifica se `google_event_id` não-nulo → `update`;
  senão → `create` + salva o id. Migrar tarefas existentes (que não têm `google_event_id`) → na
  primeira vez push cria o evento e preenche o id.
- **Anti-duplicação**: `gcal.list_events` exclui `"Kaguya — Tarefas"` e `"TickTick"` do overlay
  da Agenda pessoal (reusa o conceito do `_BLOCKED_CALENDARS` do MCP).
- **Degradação do hub**: fan-out em try/except por provider; provider vazio (Akane stub → `[]`) é
  resultado válido, não erro. Erro real → `errors[]` na resposta, não 500.
- **Recriação do grid**: a maior parte do esforço é frontend — pointer events com compensação de
  escala (`rect.height / offsetHeight`), layout de pistas (algoritmo de colunas para sobreposição),
  snap de 15min. Recriar com o design system do repo; não portar o JSX do protótipo.
- **Env vars no webapp**: `GOOGLE_CALENDAR_*` (já configuradas no coordinator/Dokploy) precisam ser
  adicionadas ao serviço `makima-web` no Dokploy (FR-017). Documentar no checklist de deploy.
