# CLAUDE.md — agents/kaguya

## O que é este agente

**Kaguya** é o agente especialista em **tarefas + agenda**. A partir da spec
`011-tasks-mvp`, o motor de tarefas é um **sistema próprio em PostgreSQL** (o mesmo banco
de Nami/Frieren/Journal) — o TickTick foi aposentado. A agenda continua vindo do **Google
Calendar via MCP**.

Princípio central: **paridade de canais**. Toda capacidade nasce como função na camada de
lógica (os módulos `tools_*.py`); o canal Telegram (este agente) e o canal
webapp (router `/api/tasks/*`) são fachadas finas e paritárias sobre ela. O app é 100%
utilizável sem o bot e vice-versa.

---

## Estrutura de arquivos

```
agents/kaguya/
├── __init__.py
├── schema_tasks_pg.sql   # schema completo do domínio (aplicado por scripts/setup_schemas.py)
├── tools_tasks.py        # camada de lógica: CRUD de tarefas/subtarefas, completar, posições
├── tools_projects.py     # camada de lógica: listas, grupos, colunas (Kanban), sidebar
├── tools_tags.py         # camada de lógica: etiquetas (tags) N:N — fatia 013 / P1
├── tools_filters.py      # camada de lógica: smart-lists (filtros salvos) — fatia 013 / P2
├── tools_kanban_views.py # camada de lógica: views de Kanban configuráveis — spec 024
├── tools_calendar.py     # camada de lógica: consulta por intervalo + projeção virtual — fatia 013 / P3
├── recurrence.py         # motor puro RRULE (next_occurrence, project_occurrences, build/describe)
├── habit_strength.py     # motor PURO (sem banco): fórmula da força do hábito (Loop) — fatia 014
├── tools_habits.py       # camada de lógica: hábitos + check-ins + histórico — fatia 014
├── experiment_adherence.py # motor PURO (sem banco): aderência de experimento (razão simples) — spec 029
├── tools_experiments.py  # camada de lógica: Tiny Experiments (CRUD + check-in + pausa + review) — spec 029
├── goal_progress.py      # motor PURO (sem banco): progresso de meta (métrica + marcos) — spec 030
├── tools_goals.py        # camada de lógica: Metas (CRUD + marcos + vínculo de movimentos + review) — spec 030
├── capacity.py           # motor PURO (sem banco): compute_capacity() — janela 8h–22h — fatia 016
├── gcal.py               # cliente Google Calendar compartilhado (read all / write main) — fatia 019
├── gcal_sync.py          # espelho best-effort: push/remove tarefas no GCal "Kaguya — Tarefas" — fatia 019
├── calendar_prefs.py     # CRUD da tabela calendar_prefs (visibilidade + cor por fonte) — fatia 019
├── calendar_hub.py       # agregador: register/list_sources/aggregate fan-out best-effort — fatia 019
├── komi_sync.py          # sync bidirecional best-effort de aniversários Komi ↔ Kaguya — fase 026
├── tools.py              # FACHADA: re-exporta a lógica + wrappers + cross-agent (Nami + Calendar Hub)
├── agent.py              # create_kaguya_agent() — factory (só o McpToolset do Calendar)
└── CLAUDE.md             # este arquivo

mcp_servers/calendar/server.py   # único MCP da Kaguya (Google Calendar)
```

> Não há mais `mcp_servers/ticktick/` nem variáveis `TICKTICK_*`. A Kaguya não depende de
> nenhuma API externa de tarefas.

---

## Como o agente é criado

Continua **factory** (`create_kaguya_agent()`) porque o `McpToolset` do Calendar instancia
um processo filho a cada criação (não pode ser compartilhado). O coordinator chama a factory
em `create_makima()`.

```python
# coordinator/agent.py
from agents.kaguya.agent import create_kaguya_agent
kaguya_agent = create_kaguya_agent()   # instancia só o McpToolset do Calendar
```

As tools de tarefas são **funções Python** registradas direto (não MCP).

---

## Camada de lógica (a fonte única)

### `tools_tasks.py` — tarefas e subtarefas

| Função | O que faz |
|---|---|
| `list_tasks(project_id, include_completed)` | tarefas-pai da lista, com subtarefas aninhadas |
| `list_tasks_today()` | `{overdue, today}` — abertas com `due_date <= hoje` |
| `search_tasks(query)` | busca por título/descrição (ILIKE) |
| `list_trash(project_id?)` | soft-deletadas (restauráveis) |
| `create_task(..., column_id?, recurrence?, tags?)` | cria tarefa/subtarefa; sem lista → Inbox; lista **com board** → 1ª coluna (ou `column_id` explícito) para aparecer no Kanban; `recurrence={rrule,mode}` opcional; `type=birthday`+data → recorrência anual automática; `tags=["mercado",...]` cria/vincula etiquetas |
| `update_task(task_id, ..., recurrence?, clear_recurrence?, tags?)` | edita; trocar de lista aplica a regra da coluna; anexa/edita/remove recorrência; `tags=[...]` **substitui** o conjunto de tags (lista vazia = remover todas) |
| `complete_task(task_id, cascade, end_series?)` | completa; subtarefas abertas sem cascade → `needs_cascade`; numa recorrente gera a próxima (`generated_task_id`); `end_series=True` encerra a série |
| `reopen_task(task_id)` | reabre; bloqueia se o pai está concluído |
| `reorder_task(task_id, after_id?, before_id?)` | posição esparsa ×1000 + renormalização |
| `delete_task(task_id, scope="this")` / `restore_task` | soft delete / restaura; recorrente: `scope=this` (gera próxima) \| `series` (desativa a regra) |
| `set_recurrence(task_id, rrule, mode)` / `clear_recurrence(task_id)` | anexa/remove a regra (exige `due_date`) |
| `get_task(task_id)` | detalhe de uma tarefa (subtarefas, recorrência, tags) — usado pelos chips `[[id\|Título]]` do editor |
| `move_task(task_id, new_parent_id, after_id?, before_id?)` | drag-and-drop de árvore: re-parenteia e posiciona (anti-ciclo; profundidade máx. 12) — spec 025 |
| `list_eisenhower_tasks()` | tarefas abertas com os campos da classificação Eisenhower — fatia 017 |
| `add_to_my_day` / `remove_from_my_day` / `reschedule_pending` / `set_estimate` / `set_time_block` / `clear_time_block` / `list_my_day` | Meu Dia + time-blocking — fatia 016 (servem `GET /api/tasks/my-day` e os wrappers do agente) |

`_complete_task_on_cursor(cur, ...)` é a versão transacional reusada pelo pagamento atômico
(pagamentos recorrentes também regeneram a próxima ocorrência atomicamente).

### Recorrência (Fase 2 / fatia 012) — `recurrence.py`

Motor **puro** (`agents/kaguya/recurrence.py`, sem banco) com a aritmética RRULE (RFC 5545 via
`python-dateutil`): `next_occurrence(rrule, anchor_date, mode, current_due, completed_on)`,
`project_occurrences(rrule, anchor_date, mode, live_due, window_start, window_end)` (projeção
virtual para o calendário — só `fixed`, limitada à janela, estritamente após a ocorrência viva),
`build_rrule(...)`, `describe_rrule(...)` (pt-BR). Dois modos: `fixed` (âncora manda) e
`after_completion` (conta da conclusão real). Modelo **"completar-e-gerar"**: cada ocorrência é
uma linha; concluir consome a atual (vira histórico) e gera **uma** próxima (subtarefas resetam),
realocando a regra (`task_recurrences`, 1:1 com a tarefa viva). Semântica e os 9 edge cases:
`specs/012-tasks-recurrence/research.md` (gate em `tests/agents/test_kaguya_recurrence.py`).

### `tools_tags.py` — etiquetas (tags) — fatia 013

Relação **N:N** tarefa↔tag (`task_tag_links`); nome único ignorando caixa (`uq_task_tags_name`).
`list_tags`, `create_tag`, `update_tag`, `delete_tag` (cascade nos vínculos), `list_tasks_by_tag`,
e o incremental `add_task_tag`/`remove_task_tag`. Helpers transacionais reusados por
`tools_tasks` (mesma transação): `_resolve_or_create_tag` (reuso case-insensitive — SC-002),
`_set_task_tags` (semântica *set*), `_attach_tags` (anexa as tags às listagens, 1 query).

### `tools_filters.py` — smart-lists (filtros salvos) — fatia 013 / P2

Filtros salvos como objetos de 1ª classe (`task_filters`). A **DSL de regras** da master
(`{combinator: and|or, conditions: [{field, op, value}]}`) é traduzida em `WHERE` **sempre
parametrizado** por `_build_where_from_rules` — valores nunca são interpolados no SQL (SC-003).
Campos: `priority`, `due_date` (com atalhos `today`/`Nd`/`overdue`/`none`/`within`), `tag`,
`project_id`, `state`, `text`. Default "só abertas" quando não há condição `state`. Referência
órfã (tag/lista excluída) **não casa nada e não quebra**, e volta em `orphans` (SC-006).
Funções: `list_filters`, `create_filter` (rejeita regra vazia), `update_filter`, `delete_filter`,
`list_tasks_by_filter` (webapp, por id), `list_tasks_by_filter_name` (Telegram, por nome) e a
built-in `list_today_overdue` ("Hoje + Vencidas", **não** persistida).

**Built-ins GTD** (`BUILTIN_FILTERS`, também fixos no código — *Getting Things Done*): além de
"Hoje + Vencidas", o `list_builtin_filters` expõe **Próximas Ações** (`next-actions`), **Aguardando**
(`waiting`), **Algum dia** (`someday`), **Rápidas (5 min)** (`quick`) e **Alta energia** (`energy`);
`list_tasks_by_builtin(key)` abre cada um. As listas de **estado** usam tags reservadas
`RESERVED_TAGS = {#aguardando, #algum-dia}`. Mapeamento: Listas = Áreas · Tags = Contextos ·
Smart-lists = listas de ação. No webapp são ids-sentinela negativos na sidebar; no Telegram
resolvem por nome (`list_tasks_by_filter_name`).

### `tools_kanban_views.py` — views de Kanban configuráveis — spec 024

Views de board **globais** (tabela `kanban_views`, sem `project_id`) salvas/nomeadas. Cada
view guarda `display` (adornos visíveis + 3 métricas do rodapé) e um `filter` opcional
(`FilterRules` inline, **mesmo DSL** das smart-lists). `list_views`/`create_view`/`update_view`/
`delete_view` — `_validate_display` checa 3 slots + adornos conhecidos; o filtro reusa
`_validate_rules`. A view built-in **"Completa"** (`is_builtin`, semeada pelo schema com
índice parcial `uq_kanban_views_builtin`) é **imutável** (update/delete → erro → HTTP 400).
`list_board_tasks(project_id, rules)` carrega o board reusando `list_tasks` (subtarefas/tags)
e o motor `_build_where_from_rules(default_open=False)` por **interseção de ids** — sem
reimplementar a semântica do filtro. `list_board_for_view(view_id, project_id)` resolve o
filtro salvo da view e delega a `list_board_tasks` (é o que o endpoint `/{id}/board` chama).
A view ativa por lista é estado de UI (localStorage do
webapp), não vive no banco. Router: `/api/tasks/kanban-views/*` + `/{id}/board`.

### `tools_calendar.py` — calendário / consulta por intervalo — fatia 013 / P3

`list_tasks_in_range(start_date, end_date, project_id?)`: tarefas datadas reais na janela
**mais** as ocorrências **virtuais** das recorrentes ativas (projetadas por
`recurrence.project_occurrences`, marcadas `is_virtual=True` + `series_task_id`). **Nada é
materializado** — o invariante "uma ocorrência viva por série" da 012 é preservado (SC-005).
Serve a view de calendário do webapp e a consulta "o que tenho essa semana" do Telegram (FR-017).
**Spec 028**: inclui tarefas de **qualquer nível** — pais e **subtarefas datadas** (filtro
`parent_id IS NULL` removido); subtarefas trazem `parent_title` (LEFT JOIN com a mãe) para o
badge ↳. A projeção virtual continua só nas raízes (recorrência é 1:1 com a tarefa raiz).

### `tools_projects.py` — listas, grupos, colunas

`get_sidebar`, `create_project`, `update_project`, `delete_project(mode)`, `create_group`,
`update_group`, `delete_group`, `list_columns`, `create_column`, `update_column`,
`delete_column`, `resolve_project_id_by_name`.

**Funções adicionadas (spec 025):**

- **`copy_columns(source_project_id, target_project_id)`** — copia estrutura de colunas
  (nomes + ordem + `is_done_column`) de um board para outro em uma única transação
  (tudo-ou-nada). Só funciona se o destino ainda não tiver board. Não copia tarefas.
  Exposto via `POST /api/tasks/projects/{id}/copy-columns`. Permite que o usuário reaproveite
  um board existente ao ativar o Kanban de uma lista nova.

- **`get_group_board(group_id)`** — agrega o board de um grupo inteiro: valida o grupo,
  busca todas as listas filhas (não arquivadas), reúne suas colunas e as **unifica por nome**
  (`LOWER(TRIM(name))`) — colunas de mesmo nome de listas diferentes viram uma coluna só,
  com `members: [{project_id, column_id}]`. `is_done=True` se qualquer membro for done;
  `position=min` dos membros. Chama `list_tasks` por lista e concatena. Retorna
  `{group, lists, columns (unificadas), tasks}`.
  Exposto via `GET /api/tasks/groups/{id}/board`.

**Regras de negócio** (validadas aqui): Inbox indelével/inarquivável; no máximo uma coluna
`is_done_column` por lista; captura órfã → Inbox; mover entre listas → primeira coluna do
destino (ou sem coluna); posições esparsas com renormalização transparente.

Mutações retornam `{"status": "ok"|"error", ...}`; listagens retornam o dado direto.

### Hábitos (Fase 4 / fatia 014) — `habit_strength.py` + `tools_habits.py`

Motor **puro** (`habit_strength.py`, sem banco) com o modelo **"caixa d'água"** (substitui a
fórmula Loop): `summary(done_dates, weekly_target, *, weight=0.1, today, window=60)` roda uma EMA
de **peso fixo** (`score_hoje = peso·fez + (1-peso)·score_ontem`, peso 0.1 = histórico pesa 90%)
e **reescala pela meta** (`expected_level(weekly_target) = min(meta/7, 1)`). Devolve as **3
dimensões**: `consistency` (0–100, a nota), `trend` (`up`/`down`/`flat`, via 2 EMAs rápida/lenta) e
`recent_done`/`recent_total` (cumpridos nas últimas 2 semanas). `met_target(value, target)`
resolve sim/não vs mensurável. Tudo **calculado na leitura**, nunca persistido (gate puro em
`tests/agents/test_kaguya_habit_strength.py` — SC-006: falha isolada não derruba a consistência;
3 de 3 num 3x/semana = ~100).

Camada de lógica (`tools_habits.py`): `list_habits`/`get_habit` (com
`consistency`/`trend`/`recent_*`/`done_today` — `_weekly_target` converte `freq_num/freq_den` em
vezes/semana), `create_habit`, `update_habit`, `archive_habit`/`unarchive_habit` (soft delete por
`archived_at`), `check_in` (upsert — 1/dia, `UNIQUE (habit_id, date)`; devolve o score
recalculado), `remove_check_in`, `get_habit_history(year)` (esparso, para o heatmap) e
`resolve_habit_id_by_name` (Telegram fala por nome). Mensurável conta como cumprido quando
`value >= target_value`.

### Tiny Experiments (spec 029) — `experiment_adherence.py` + `tools_experiments.py`

Um **experimento** é uma prática testável COM PRAZO ("Vou [ação] por [duração]"), com check-ins
periódicos (fez? / sensação 1–5 / nota) cuja **aderência perdoa falhas**. Difere do hábito
(contínuo, sem fim): tem início/fim, pode ser **pausado/retomado** e encerra com uma **revisão**
(veredicto `persist`/`pause`/`pivot` + aprendizado). **Webapp-first**: nesta fatia NENHUMA função
é registrada no agente ADK (research D6) — `tools.py` só re-exporta, marcando o ponto de extensão.

Motor **puro** (`experiment_adherence.py`, sem banco): `summary(start_date, end_date, cadence,
status, paused_at, paused_period_days, logs, today)` devolve os derivados
(`periods_done`/`periods_expected`/`adherence_pct`/`logged_current`/`days_remaining`/`is_overdue`).
Aderência = **razão simples** `cumpridos / esperados` capada em 100 (uma falha isolada **não zera**
— SC). "Período": diária = o dia; semanal = a **segunda-feira** da semana (via `monday_of`).
Períodos pausados saem de `periods_expected` (D4/FR-017). Tudo calculado na leitura, nada
persistido (gate puro em `tests/agents/test_kaguya_experiment_adherence.py`).

Camada de lógica (`tools_experiments.py`): `create_experiment`, `list_experiments(include_completed)`,
`get_experiment` (com `logs`), `update_experiment` (sentinela `_UNSET`), `delete_experiment`
(**hard delete** — CASCADE nos check-ins, D3), `log_experiment` (**upsert** por
`(experiment_id, period_date)`; backfill dentro de `[start,end]`; normaliza p/ segunda na semanal),
`remove_log`, `pause_experiment`/`resume_experiment` (transições `active ⇄ paused`; acumula
`paused_period_days` no resume), `review_experiment(verdict, review)` (fecha em `completed`;
fecha a pausa aberta antes da aderência final) e `list_experiments_due_today()` (para o Meu Dia —
ativos cuja cadência cai hoje e sem check-in no período). "Hoje" sempre em **UTC-3**.

Persistência: 2 tabelas em `schema_tasks_pg.sql` (`tiny_experiments`, `tiny_experiment_logs`) +
índice parcial `idx_tiny_experiments_open`. `goal_id` (vínculo com Metas) **não** existe aqui —
será adicionado pela spec 030 (D5).

### Metas (spec 030) — `goal_progress.py` + `tools_goals.py`

Uma **meta** é a camada de **direção** com prazo à qual os experimentos/tarefas/hábitos (os
"movimentos") se vinculam. O progresso combina uma **métrica-alvo** (atual/alvo) e **marcos**
(concluídos/total), encerra com uma **revisão** (desfecho `achieved`/`missed`/`revise` +
aprendizado). **Webapp-first**: sem tool no ADK nesta fatia (D8) — `tools.py` só re-exporta.

Motor **puro** (`goal_progress.py`, sem banco): `progress(metric_target, metric_current,
milestones_done, milestones_total)` devolve `metric_pct`/`milestones_pct`/`progress_pct` (média das
dimensões presentes; `None` se nenhuma — meta direcional); `metric_pct` **satura em 100** quando o
valor passa do alvo; `deadline_status(deadline, status, today)` dá `days_remaining`/`is_overdue`.
Calculado na leitura, nada persistido (gate puro em `tests/agents/test_kaguya_goal_progress.py`).

Camada de lógica (`tools_goals.py`): `create_goal`, `list_goals(include_completed)`, `get_goal`
(com `milestones` + `movements`), `update_goal` (sentinela `_UNSET`; inclui `metric_current`),
`delete_goal` (**hard delete** — marcos por CASCADE, itens por SET NULL), `add_milestone`/
`update_milestone`/`delete_milestone`, `list_goal_areas` (contagem de ativas por área — SC-006),
`link_movement`/`unlink_movement`/`list_linkable_items` (vínculo de movimentos) e `review_goal`
(encerra). "Hoje" sempre em **UTC-3**.

**Vínculo (D1)**: coluna `goal_id` (FK `ON DELETE SET NULL`) em `tiny_experiments`, `tasks` e
`habits` — cardinalidade "um item ↔ no máximo uma meta". Excluir a meta **desvincula**, nunca
apaga os itens (FR-010/SC-005). `get_goal.movements` agrega os três tipos por `goal_id`, reusando
`get_experiment`/`get_habit` para o status derivado. Persistência: 2 tabelas em `schema_tasks_pg.sql`
(`goals`, `goal_milestones`) + as 3 colunas `goal_id` (migração idempotente — a de `tiny_experiments`
é o gancho D5 que a 029 reservou). A 029 **não muda** (só ganha a coluna).

---

## Tools expostas ao agente (`tools.py`)

| Tool | Origem |
|---|---|
| `list_projects` | wrapper de `get_sidebar` |
| `list_tasks_by_project(project)` | aceita id **ou** nome (resolve por prefixo) |
| `list_tasks_today`, `search_tasks` | tarefas |
| `create_task`, `update_task`, `complete_task`, `reopen_task`, `delete_task`, `restore_task` | tarefas |
| `set_task_recurrence(task_id, freq, interval?, weekday?, monthday?, mode?)` | recorrência por intenção simples (monta a RRULE; ecoa `recurrence_text`) |
| `clear_recurrence(task_id)` | remove a recorrência |
| `add_task_tag(task_id, tag)` / `remove_task_tag(task_id, tag)` | etiqueta incremental (fatia 013) |
| `list_tasks_by_tag(name)` | tarefas abertas com uma tag (case-insensitive) |
| `list_filters`, `create_filter(name, rules)`, `update_filter`, `delete_filter` | smart-lists (fatia 013 · DSL de regras) |
| `list_tasks_by_filter_name(name)` / `list_today_overdue()` | abrir smart-list por nome / built-in Hoje+Vencidas |
| `list_tasks_in_range(start_date, end_date)` | consulta por intervalo — só tarefas Kaguya |
| `list_week_with_hub(start_date, end_date)` | visão integrada: tarefas + Nami + Frieren + Violet — fatia 019 |
| `list_habits`, `create_habit`, `update_habit`, `archive_habit` | hábitos (fatia 014) |
| `check_in_habit(habit, value?)` | check-in de hoje por id **ou** nome; ecoa o score recalculado (consistência/tendência) |
| `remove_check_in(habit_id)` / `habit_status(habit?)` | desfaz o check-in / score em 3 dimensões (um ou todos) |
| `create_project`, `update_project`, `delete_project` | listas |
| **`complete_payment_task`** | cross-agent (Kaguya + Nami) — atômico |
| **`create_expense_reminder`** | cross-agent — cria lembrete no Postgres |
| `plan_my_day()` | Meu Dia completo (plano + pendências + sugestões + capacity) — fatia 016. Plano/pendências/sugestões incluem **subtarefas datadas** (spec 028); sub-itens trazem `parent_title` para o badge ↳ |
| `my_day_status()` | resumo textual do plano + capacity (briefing Telegram) — fatia 016 |
| `add_to_my_day_by_name(task, date?)` | adiciona ao Meu Dia por id ou nome — fatia 016 |
| `remove_from_my_day_by_name(task)` | retira do Meu Dia por id ou nome — fatia 016 |
| `set_estimate_by_name(task, minutes)` | grava estimativa de duração por id ou nome — fatia 016 |
| `eisenhower_status()` | relato textual dos 4 quadrantes da matriz de Eisenhower — fatia 017 |
| (Calendar) | `list_events_today`, `create_event`, ... via MCP |

> **Webapp-first (sem tool no agente):** views de Kanban (spec 024), Tiny Experiments (spec 029)
> e Metas (spec 030) não registram nenhuma função no ADK nesta fatia — existem só na camada de
> lógica + router REST. `tools.py` re-exporta os nomes marcando o ponto de extensão futuro.

### Cross-agent: pagamento atômico

`complete_payment_task(task_id, amount, category, account, transaction_name="")`:
completa a tarefa **e** lança a despesa (via `create_transaction_on_cursor` da Nami) na
**mesma transação PostgreSQL** — tudo-ou-nada (acabou o status `partial`). A Kaguya deve
confirmar valor/categoria/conta **antes** de chamar — sem defaults financeiros.

`create_expense_reminder(title, due_date, project_name="Finanças", amount=0, description="")`:
cria a tarefa de lembrete (prioridade alta) no banco; **não** lança despesa.

---

## Calendar Hub (fatia 019) — visão integrada de calendários

### Arquitetura

O Calendar Hub é um agregador de eventos de múltiplos agentes no mesmo feed de calendário.
Cada agente publica um **provedor** (função `list_calendar_events(start, end) -> list[CalendarItem]`)
e o hub faz fan-out para todos os provedores visíveis nas prefs do usuário.

```
calendar_hub.py
├── CalendarItem (TypedDict)  — formato unificado de item de calendário
├── register(source, fn)      — registra uma fonte + provedor
├── list_sources(with_prefs)  — lista fontes com prefs mescladas
└── aggregate(start, end)     — fan-out best-effort → {sources, items, errors}

calendar_prefs.py
└── get/set_calendar_prefs    — CRUD da tabela calendar_prefs (visible + color + position)
```

### Protocolo CalendarItem

Cada item retornado por um provedor deve seguir o TypedDict `CalendarItem`:

| Campo | Tipo | Descrição |
|---|---|---|
| `cal` | str | ID da fonte: `"nami"`, `"frieren"`, `"violet"`, `"akane"`, `"gcal"` |
| `date` | str | `"YYYY-MM-DD"` — dia canônico do item |
| `start` | str \| None | ISO 8601 com hora — `None` se dia inteiro |
| `end` | str \| None | ISO 8601 de término — `None` se dia inteiro |
| `all_day` | bool | `True` se o item ocupa o dia inteiro sem horário |
| `title` | str | Texto de exibição |
| `kind` | str | Tipo semântico: `"expense"`, `"book-session"`, `"journal-entry"`, `"task"` |
| `ref_id` | str \| None | ID do registro na fonte (para deep link) |
| `deep_link` | str \| None | Caminho URL: `/nami/...`, `/books/...`, etc. |
| `color` | str \| None | Cor OKLCH sobrepõe a cor padrão da fonte |
| `loc` | str \| None | Localização (eventos com endereço) |

### Fontes registradas

| ID | Agente | Arquivo | Cor padrão |
|---|---|---|---|
| `kaguya` | Tarefas | stub (`[]`) — as tarefas vêm de `list_tasks_in_range` | azul |
| `nami` | Finanças | `agents/nami/calendar_provider.py` | laranja |
| `frieren` | Livros | `agents/frieren/calendar_provider.py` | verde-azulado |
| `violet` | Diário | `agents/journal/calendar_provider.py` | roxo-magenta |
| `akane` | Filmes | stub (`[]`) — `agents/media/` ainda não implementado | vermelho |

### gcal.py — cliente Google Calendar compartilhado

`agents/kaguya/gcal.py` encapsula toda a interação com a Google Calendar API v3.
Usa as mesmas credenciais OAuth do MCP Calendar (`GOOGLE_CALENDAR_*`).

**Thread-safety:** `_get_service()` é thread-safe. Credenciais compartilhadas sob `_auth_lock`;
o cliente Resource (baseado em `httplib2.Http`, não thread-safe) fica em `threading.local()` — um
por thread. Isso permite que `gcal_sync.py` dispare push num worker thread e que `list_events()`
faça fan-out paralelo sem corrida de dados.

Funções principais:
- `list_calendars()` — todos os calendários da conta; cache 5 min; serve-stale-on-error
- `list_events(start, end, exclude?)` — eventos num intervalo; **fan-out paralelo** (ThreadPoolExecutor
  com até 8 workers, um por calendário); preserva a ordem dos calendários; cache 60s
- `_fetch_cal_events(cal, time_min, time_max)` — helper interno do fan-out; cada worker chama
  `_get_service()` (thread-local) e faz o `events().list()` individualmente
- `create_event(calendar_id, summary, start, end, all_day, ...)` — cria evento com hora ou dia inteiro
- `update_event(calendar_id, event_id, **fields)` — atualiza via `events().patch()`.
  **Fast-path** quando `all_day` é passado explicitamente (sem GET prévio, 1 round-trip);
  **fallback** quando `all_day` está ausente (GET para descobrir o tipo, depois patch).
  O `gcal_sync` sempre passa `all_day`, portanto o push nunca faz o GET desnecessário.
- `delete_event(calendar_id, event_id)` — remove
- `ensure_kaguya_calendar()` — garante que "Kaguya — Tarefas" existe (idempotente; cacheado no módulo)
- `invalidate_events_cache()` — limpa o cache de eventos (chamado pelas rotas POST/PATCH/DELETE do webapp)

### komi_sync.py — sync bidirecional de aniversários Komi ↔ Kaguya (fase 026)

`agents/kaguya/komi_sync.py` sincroniza person_dates com label ILIKE '%anivers%' da Komi
como tarefas `type=birthday` na lista "Aniversários" da Kaguya. Opera de forma **best-effort**
— nunca levanta exceção; falha no sync não aborta o CRUD principal.

**Direção Komi → Kaguya:**
- `push_person_date(date_id)` — chamado por `add_important_date` e `update_important_date` na Komi.
  Cria ou atualiza a tarefa correspondente; anti-loop por convergência de valor.
- `remove_person_date(task_id)` — chamado por `delete_important_date` na Komi. Soft-delete da tarefa.

**Direção Kaguya → Komi:**
- `push_birthday(task_id)` — chamado por `create_task`/`update_task` quando `type='birthday'`.
  Cria ou atualiza o person_date "aniversário" na Komi.
- `remove_birthday(task_id)` — chamado por `delete_task` com `scope='series'` e `type='birthday'`.
  Apaga o person_date correspondente.

**Tabela de ponte:** `birthday_sync_links` em `schema_tasks_pg.sql` (1:1 por person_date).

**Feature flag:** `KOMI_SYNC_ENABLED=false` desabilita todas as propagações sem afetar o CRUD.
Padrão: `true`.

**Lista "Aniversários":** criada sob demanda por `_get_birthdays_list_id(cur)` em `tools_tasks.py`
(análogo a `_get_inbox_id`, com `is_birthdays=TRUE`). Nunca semeada pelo schema — só existe se
o sync já criou pelo menos um aniversário.

### gcal_sync.py — espelho best-effort de tarefas no GCal

`agents/kaguya/gcal_sync.py` mantém um espelho das tarefas Kaguya no Google Calendar
"Kaguya — Tarefas". Opera de forma **best-effort** — falhas do Google são logadas como
`warning` (logger `kaguya.gcal_sync`) mas não abortam a operação principal.

**Fire-and-forget (assíncrono):** as funções públicas submetem o trabalho a um worker thread
de background (`ThreadPoolExecutor(max_workers=1, thread_name_prefix="gcal-sync")`) e retornam
imediatamente — o save de tarefa não espera pelo round-trip ao Google. O único worker serializa
as escritas (preserva a ordem das mutações da mesma tarefa e evita martelar a API).

Funções públicas (fire-and-forget):
- `push_task(task_id)` — agenda criação/atualização do evento espelho. Tarefa concluída ganha prefixo "✓ ".
- `remove_task_event(task_id)` — agenda remoção do evento espelho (usado em soft-delete).

Funções internas síncronas (executadas no worker, testáveis diretamente):
- `_push_task_sync(task_id)` — implementação real do push; nunca levanta exceção.
- `_remove_task_event_sync(task_id)` — implementação real do remove; nunca levanta exceção.

**Gatilhos em `tools_tasks.py`:** todas as mutações de tarefa chamam `push_task` ou
`remove_task_event` (lazy import dentro de `try/except`) **após** a transação PostgreSQL —
o Google Calendar nunca participa da transação.

**Feature flag:** `GCAL_SYNC_ENABLED=false` desativa todos os gatilhos (sem submit ao executor)
sem alterar o CRUD. Padrão: `true`.

### Variáveis de ambiente necessárias

As mesmas do MCP Calendar, mais:

| Variável | Descrição |
|---|---|
| `GCAL_SYNC_ENABLED` | `"true"` (padrão) \| `"false"` — desativa o espelho sem desativar o CRUD |

---

## Regras importantes de comportamento

- **Chame a tool PRIMEIRO**, depois responda. Nunca mande "aguarde...".
- Capture em linguagem natural e **ecoe a interpretação** (lista/data/prioridade assumidas);
  aceite correção conversacional. Datas no fuso `America/Sao_Paulo`, formato `AAAA-MM-DD`.
- Prioridades: 0 nenhuma · 1 baixa · 2 média · 3 alta.
- `list_tasks_today` já traz as vencidas em `overdue` — não chame nada redundante.
- **`needs_cascade`** não é erro: pergunte ao usuário e repita com `cascade=true`.
- **Recorrência**: tarefa precisa de data; crie e chame `set_task_recurrence(id, freq, ...)`; ecoe
  o `recurrence_text`. Aniversário (`type=birthday`+data) recorre todo ano sozinho. Ao concluir
  uma recorrente a próxima nasce (avise `next_due_date`); "encerrar a série" → `complete_task(id, end_series=true)`.
- `delete_task` e `delete_project` são destrutivas → **confirme sempre antes**.
  Recorrente: pergunte o escopo (`scope="this"` só esta · `scope="series"` a série inteira).
  `delete_project` exige `mode` (`move_to_inbox` | `delete_tasks`).
- Listas resolvidas dinamicamente por nome (prefixo) — nunca nomes fixos.
- "o que tenho pra hoje?" = `list_tasks_today()` (banco) + `list_events_today()` (Calendar).
- **Hábitos** (fatia 014): um hábito NÃO é tarefa (sem due_date; vira check-in diário). Criar →
  `create_habit(name, freq_num, freq_den, target_value?, unit?)`; cumprir hoje →
  `check_in_habit(nome, value?)`; consultar → `habit_status(nome?)`. Score "caixa d'água" em 3
  dimensões — ecoe ex.: "Academia — 78/100, 📈 subindo, 5/6 nas últimas 2 semanas" (📈 up · 📉 down
  · ➡️ flat). "excluir" é `archive_habit` (soft, confirme antes). Hábito por nome resolve por prefixo.

---

## MCP Server — Google Calendar (`mcp_servers/calendar/server.py`)

Único MCP da Kaguya. Detalhes de configuração/OAuth em `coordinator/CLAUDE.md`.

- **Leitura**: todos os calendários. **Escrita**: apenas `GOOGLE_CALENDAR_MAIN_CALENDAR_ID`.
- `list_events_today` filtra o calendário externo **"TickTick"** (um calendário Google
  sincronizado de fora) via `_BLOCKED_CALENDARS` — isso é um **nome de calendário**, não tem
  relação com o antigo backend de tarefas.
- Tools: `list_calendars`, `list_events`, `list_events_today`, `get_event`, `create_event`,
  `update_event`, `delete_event`, `find_free_slots`.

---

## Formatação (Telegram = HTML)

- Título em `<b>negrito</b>`; prioridade: 🔴 Alta · 🟡 Média · 🔵 Baixa · ⚪ Nenhuma.
- Cada tarefa num bloco com 📋; subtarefas com ↳; vencidas em seção "⚠️ <b>Atrasadas</b>".
- Confirmação: `✅ <b>Título</b> — em 📁 Lista · 📅 data`. Erros: `❌ Houve um problema: ...`.
- **Nunca** use markdown (`*`, `_`, `~`). Só HTML e emojis.

---

## Personalidade

Kaguya Shinomiya — aristocrática, organizada, levemente condescendente.

- Sempre começa com `Kaguya:`
- Tom de quem faz um favor; admira o usuário mas escapa em `...`
- Cria: "Registrei isso para você. ...Apenas desta vez."
- Completa: "Concluído. Era o mínimo esperado."
- Erro: "Houve um problema. Não foi culpa sua, desta vez."
- Nunca quebra o personagem.
</content>
