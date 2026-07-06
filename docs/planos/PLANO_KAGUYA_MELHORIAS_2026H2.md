# Plano — Kaguya: 6 melhorias (specs 034–039)

**Status: planejado, não executado** · criado em 2026-07-06

Roadmap das 6 melhorias da lista "Kaguya Shinomiya – Task Agent", organizadas em specs a
partir da **034**, em ordem "grandes primeiro". Cada spec será implementada individualmente
via fluxo Spec Kit (`speckit-specify → plan → tasks → implement`) e, ao ser entregue, segue
o checklist do `CLAUDE.md` raiz (ROADMAP, `docs/referencia/POSTGRES.md`,
`agents/kaguya/CLAUDE.md`, `webapp/docs/API.md`/`FRONTEND.md`).

## Decisões de produto (fechadas com o usuário em 2026-07-06)

| Tema | Decisão |
|---|---|
| GTD | Escopo completo: inbox + processamento (clarify), revisão semanal guiada, próximas ações, Someday/Maybe + Waiting For |
| Smart lists | Padrão de mercado (TickTick/Todoist): bloco fixo **Todas, Hoje, Amanhã, Próximos 7 Dias, Inbox** na sidebar |
| Contextos GTD | **Campo dedicado** na tarefa (tabela `gtd_contexts` gerenciável), não tags |
| Cross-agent | Fase 1: Metas ↔ Livros (Frieren) e Metas/Hábitos ↔ Diário (Violet); estrutura **extensível** para Nami/Akane/Marin/Mai |
| Meta de leitura | Vincular livros **manualmente** (progresso = livros vinculados concluídos) |
| Pomodoro | Timer no webapp ligado à tarefa + estatísticas; durações **configuráveis desde a v1** (25/5, 50/10, custom) |
| Work no Meu Dia | Seções Trabalho vs Pessoal com capacity própria; contexto via **flag na lista** (`task_projects.context`) |
| Localização | Só **exibir** o `location` dos eventos GCal no webapp (com link Google Maps) |
| Ordem | Grandes primeiro, estrito: 034 → 035 → 036 → 037 → 038 → 039 |

## Sequência e marcos

| Ordem | Spec | Esforço | Marco entregável |
|---|---|---|---|
| 1 | `034-tasks-gtd-core` | G | Inbox processável item a item; status GTD reais + contextos; sidebar com smart lists padrão de mercado (web + Telegram) |
| 2 | `035-tasks-weekly-review` | M | Ritual semanal guiado com lembrete — fecha o bloco GTD |
| 3 | `036-goal-habit-links` | G | Meta "ler 12 livros" com progresso automático; hábito do diário com check-in automático; infra pronta para os demais agentes |
| 4 | `037-tasks-focus-pomodoro` | M | Botão "Focar" em qualquer tarefa + stats de foco no Meu Dia |
| 5 | `038-meudia-work-context` | M | Meu Dia com duas capacities (Trabalho/Pessoal) |
| 6 | `039-tasks-qol` | P | Arquivar listas de primeira classe + endereço/Maps nos eventos |

Dependência dura: **035 depende de 034**. 036/037/039 são independentes entre si e do bloco
GTD — podem ser reordenadas ou paralelizadas se a prioridade mudar.

---

## Spec 034 — `034-tasks-gtd-core` (G)

Status GTD de primeira classe + processamento do inbox + contextos dedicados + smart lists
padrão de mercado. Hoje o GTD é 100% heurístico: os built-ins "Próximas Ações"/"Aguardando"
são smart-lists sobre as tags reservadas `RESERVED_TAGS = {#aguardando, #algum-dia}` em
`agents/kaguya/tools_filters.py` — haverá migração de dados.

**Schema** (`agents/kaguya/schema_tasks_pg.sql`):
- `tasks.gtd_status TEXT CHECK (gtd_status IN ('next','waiting','someday'))`, nullable
  (`NULL` = não classificada). "Scheduled" deriva de `due_date`; "inbox" já é a lista
  `is_inbox` — nada de dupla fonte de verdade.
- `tasks.waiting_on TEXT` + `tasks.waiting_since DATE` (só com `gtd_status='waiting'`).
- `tasks.clarified_at TIMESTAMPTZ` — marca "processada" (inbox parcialmente processado ok).
- Contextos: tabela `gtd_contexts (id SERIAL, name TEXT UNIQUE, icon TEXT, position)` +
  `tasks.context_id INT REFERENCES gtd_contexts(id) ON DELETE SET NULL`, com CRUD na UI
  (ex.: @casa, @computador, @rua).
- Migração idempotente no schema (padrão 026/030): tag `#aguardando` → `waiting`;
  `#algum-dia` → `someday`; apagar as tags reservadas após migrar.

**Tools** (`tools_tasks.py`, `tools_filters.py`, `tools.py`):
- `clarify_task(task_id, decision, **kwargs)` — decisões: next / waiting / someday /
  schedule / delete / done (regra dos 2 minutos). Grava `clarified_at`.
- `list_inbox_queue()` — fila do processamento (Inbox com `clarified_at IS NULL`).
- `set_gtd_status()`, CRUD de `gtd_contexts`.
- Built-ins reescritos para consultar `gtd_status` real; DSL das smart-lists ganha os campos
  `gtd_status` e `context`.
- Wrappers Telegram: processamento conversacional do inbox item a item.

**Smart lists padrão de mercado**:
- Bloco fixo no topo da sidebar, nesta ordem: **Todas** (abertas), **Hoje** (vence hoje +
  vencidas — absorve o built-in "Hoje + Vencidas"), **Amanhã**, **Próximos 7 Dias**,
  **Inbox** (sobe pro bloco fixo). Contadores por view no payload da sidebar.
- Implementação: a DSL já suporta `due_date` com atalhos `today`/`Nd`/`overdue` — "Todas"/
  "Amanhã"/"Próximos 7 dias" são novas entradas em `BUILTIN_FILTERS` (adicionar o atalho
  `tomorrow` à DSL).
- Built-ins GTD de estado (Próximas Ações, Aguardando, Algum dia) ficam numa seção própria
  abaixo do bloco fixo, consultando o status real.
- **Rápidas (5 min)** e **Alta energia** deixam de ser built-ins fixos: a migração os
  converte em smart-lists salvas normais (editáveis/apagáveis).
- Telegram: `list_tasks_by_filter_name` resolve os novos nomes.

**Endpoints** (`webapp/backend/routers/tasks.py`): `GET /api/tasks/gtd/inbox-queue`,
`POST /api/tasks/{id}/clarify`, CRUD `/api/tasks/gtd/contexts`; PATCH aceita
`gtd_status`/`waiting_on`/`context_id`.

**Frontend** (`webapp/frontend/src/pages/kaguya/`): `screens/InboxProcessScreen.tsx`
(wizard card a card, botões grandes, contador "3 de 12"; view nova no union `KaguyaView` +
switch no `KaguyaShell.tsx` + botão "Processar" no Inbox); badge de status GTD na TaskRow;
seletores de status/contexto no TaskModal; sidebar reorganizada.

**Regras adotadas**: agendar limpa `gtd_status='someday'`; recorrente herda o status na
próxima ocorrência; subtarefa tem status próprio mas não entra na fila do inbox.

---

## Spec 035 — `035-tasks-weekly-review` (M) — depende da 034

Revisão semanal guiada (wizard) + lembrete agendado.

- **Schema**: `gtd_reviews (id, started_at, finished_at, steps_done JSONB, notes)` +
  `task_projects.last_reviewed_at`.
- **Tools**: novo `agents/kaguya/tools_review.py`: `start_review()` (retoma aberta),
  `get_review()` (agrega dados por passo), `complete_step()`, `finish_review()`,
  `last_review_info()`. 6 passos: inbox zero → próximas ações → aguardando (destaca
  `waiting_since` velho) → listas/projetos → calendário (semana passada/próxima) →
  someday/maybe. Review abandonada fica aberta e é retomada.
- **Endpoints**: `/api/tasks/reviews` (POST/GET), `/api/tasks/reviews/{id}/steps/{step}`,
  `/api/tasks/reviews/latest`.
- **Frontend**: `screens/WeeklyReviewScreen.tsx` (wizard com checklist lateral, reusa
  TaskRow); nudge "Última revisão há N dias" na sidebar/TodayScreen.
- **Scheduler**: job novo no `scheduler/registry.py` — lembrete Telegram domingo à noite se
  não houve review na semana.

---

## Spec 036 — `036-goal-habit-links` (G) — cross-agent

Metas/Hábitos vinculados a entidades de outros agentes. Fase 1: livros (Frieren) e diário
(Violet). Arquitetura copia os dois padrões já validados no repo: tabela genérica da Komi
(`entity_type TEXT` / `entity_id TEXT`, idempotente, lazy import) e registry fan-out do
Calendar Hub (`register(source, fn)` + provider por agente).

- **Schema** (em `schema_tasks_pg.sql` — as tabelas são da Kaguya):
  - `goal_links (goal_id FK CASCADE, entity_type TEXT, entity_id TEXT,
    UNIQUE(goal_id, entity_type, entity_id))` — vínculo manual, `entity_id` sempre TEXT.
  - `goals.metric_mode TEXT DEFAULT 'manual' CHECK (IN ('manual','auto'))` — em `auto`,
    `metric_current` é **calculado na leitura** (nada persistido, coerente com
    `goal_progress.py`/`habit_strength.py`); UI bloqueia edição manual com aviso.
  - `habit_sources (habit_id FK CASCADE, source TEXT, config JSONB,
    PK(habit_id, source))` — ex.: `source='violet_journal'` (escreveu no diário = check-in),
    `source='frieren_reading'` (mensurável: `value = SUM(pages_read)` do dia).
- **Backend**:
  - Novo `agents/kaguya/link_providers.py` — registry: `register(entity_type, provider)`,
    `search(q)`, `resolve(links)` (fan-out **best-effort**: falha de um agente não derruba
    `get_goal`), `habit_checkin_dates(source, config, range)`.
  - Providers nos agentes donos: `agents/frieren/goal_provider.py` (`entity_type='book'`,
    done = `status='lido'`) e `agents/journal/goal_provider.py` — espelha o padrão
    `calendar_provider.py` da fatia 019. Extensão futura (Akane/Marin/Mai/Nami) = 1 arquivo
    + 1 `register()`, sem migração de schema.
  - Check-ins automáticos: **merge em leitura** em `list_habits`/`get_habit`/`history`
    (marcados `source:'auto'`) antes do motor EMA — motor puro intocado, sem jobs de sync;
    apagar a page do diário desfaz o check-in sozinho.
- **Endpoints**: `POST/DELETE /api/tasks/goals/{id}/links`,
  `GET /api/tasks/goals/linkable?entity_type=book&q=`, `PUT /api/tasks/habits/{id}/sources`.
- **Frontend**: GoalDetailScreen — seção "Movimentos externos" (capa/título/status do livro)
  + picker de vínculo por tipo; HabitsScreen — badge "auto" no check-in derivado + seletor
  de fonte no HabitModal.

---

## Spec 037 — `037-tasks-focus-pomodoro` (M)

Timer de foco ligado (opcionalmente) a uma tarefa + histórico e estatísticas. Greenfield.

- **Schema**: `focus_sessions (id, task_id FK SET NULL, started_at, ended_at,
  planned_min INT, break_min INT, completed BOOL, note)`. Durações configuráveis desde a
  v1: presets 25/5, 50/10 e custom (default do usuário em prefs ou localStorage; valores
  por sessão no schema).
- **Tools**: novo `agents/kaguya/tools_focus.py`: `start_focus(task_id?, planned_min,
  break_min)` (fecha órfã aberta), `finish_focus()`, `cancel_focus()`,
  `list_focus_sessions(date)`, `focus_stats(range)` — agregações com
  `AT TIME ZONE 'America/Sao_Paulo'`. `list_my_day()` passa a incluir
  `foco: {total_min, sessoes}`.
- **Endpoints**: `/api/tasks/focus/start`, `/{id}/finish`, `/{id}/cancel`,
  `GET /sessions?date=`, `GET /stats?range=`.
- **Frontend**: `components/FocusTimer.tsx` — widget flutuante montado no `KaguyaShell.tsx`
  **fora do switch de views** (sobrevive à navegação); estado em localStorage derivado de
  `started_at` (sobrevive a reload); tempo autoritativo no servidor. Botão "Focar" no
  TaskModal, hover da TaskRow e PlanCards do TodayScreen. Stats no TodayScreen ("Focado
  hoje: 1h15 · 3 pomodoros") + série semanal. Sessão abandonada: fechar com
  `completed=false` e `ended_at = started_at + planned_min` na próxima abertura.

---

## Spec 038 — `038-meudia-work-context` (M)

Meu Dia dividido Trabalho vs Pessoal, cada bloco com sua capacity.

- **Schema**: `task_projects.context TEXT NOT NULL DEFAULT 'personal'
  CHECK (IN ('personal','work'))` — tarefa **herda** da lista (sem coluna em `tasks`, evita
  divergência); `calendar_prefs.context` — calendário corporativo conta contra a capacity
  work.
- **Backend**: `create_project`/`update_project`/`get_sidebar` ganham `context`;
  **`capacity.py` intocado** — `list_my_day()` chama `compute_capacity()` duas vezes
  (estimativas/eventos filtrados por contexto) e retorna `capacity: {total, work,
  personal}`; `my_day_status()` (Telegram) menciona os dois blocos. Mesma janela 8h–22h
  para ambos na v1.
- **Frontend**: TodayScreen com duas seções ("Trabalho"/"Pessoal"), cada uma com PlanCards
  e sua `CapacityBar` + toggle "visão única"; DayTimeline única; ProjectModal com seletor
  de contexto; seletor por calendário no aside; ação em massa no grupo via UI (flag só na
  lista).
- **Regra**: Inbox é `personal`; tarefa work ganha contexto ao ser movida (o clarify da 034
  já cobre esse fluxo).

---

## Spec 039 — `039-tasks-qol` (P)

Miscelânea de qualidade de vida: arquivar listas + localização nos eventos.

**Parte A — Arquivar listas** (arquivar ≠ excluir):
- `task_projects.archived_at` já existe, mas hoje só o `delete_project(mode)` a usa
  (forçando mover/apagar as tarefas). Criar `archive_project()` / `unarchive_project()` /
  `list_archived_projects()` em `tools_projects.py` (bloqueia `is_inbox`;
  `delete_project()` intocado) — arquivar preserva as tarefas na lista.
- **Risco transversal**: auditar `list_tasks_today`, `list_my_day`,
  `_build_where_from_rules`, `list_tasks_in_range`, `list_eisenhower_tasks`,
  `search_tasks`, adicionando filtro `archived_at IS NULL` via JOIN onde faltar (sidebar e
  `get_group_board` já filtram). Busca mostra itens de arquivadas com badge; Meu
  Dia/hoje/filtros não.
- Endpoints: `POST /api/tasks/projects/{id}/archive|unarchive`,
  `GET /api/tasks/projects/archived`. Frontend: "Arquivar" no menu de contexto da lista
  (SidebarNav) + view `archived` análoga à TrashScreen, com restaurar.

**Parte B — Localização nos eventos**:
- Backend: incluir `location` no dict de `_gcal_events_for_day`
  (`agents/kaguya/tools_tasks.py`) — o CalendarScreen já recebe e o EventPopover já exibe
  (`ev.loc`, classe `.ce-loc` já existe no CSS); só o Meu Dia não recebia.
- Frontend: `types.ts` ganha `location?`; DayTimeline exibe o local no bloco do evento;
  EventPopover e popover do CalendarScreen ganham âncora
  `https://www.google.com/maps/search/?api=1&query=<encodeURIComponent(loc)>` em nova aba.

---

## Verificação (por spec, ao implementar)

- Rodar o webapp local (frontend + backend FastAPI) e testar os fluxos via UI.
- Motores puros com testes em `tests/` (precedente: recorrência, capacity, habit_strength).
- Migrações (034 em especial) validadas antes do VPS; no VPS, rodar de dentro do container
  `makima-web` (regra do `CLAUDE.md` raiz).
