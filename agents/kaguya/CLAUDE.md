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
├── tools_views.py        # camada de lógica: views fixas de mercado (Todas/Hoje/Amanhã/Próx.7d/Inbox) — spec 034
├── tools_contexts.py     # camada de lógica: contextos de execução dedicados (CRUD) — spec 034
├── tools_review.py       # camada de lógica: revisão semanal guiada (6 passos) — spec 035, webapp-only
├── tools_kanban_views.py # camada de lógica: views de Kanban configuráveis — spec 024
├── tools_calendar.py     # camada de lógica: consulta por intervalo + projeção virtual — fatia 013 / P3
├── recurrence.py         # motor puro RRULE (next_occurrence, project_occurrences, build/describe)
├── habit_strength.py     # motor PURO (sem banco): fórmula da força do hábito (Loop) — fatia 014
├── tools_habits.py       # camada de lógica: hábitos + check-ins + histórico — fatia 014
├── experiment_adherence.py # motor PURO (sem banco): aderência de experimento (razão simples) — spec 029
├── tools_experiments.py  # camada de lógica: Tiny Experiments (CRUD + check-in + pausa + review) — spec 029
├── goal_progress.py      # motor PURO (sem banco): progresso de meta (métrica + marcos) — spec 030
├── tools_goals.py        # camada de lógica: Metas (CRUD + marcos + vínculo de movimentos + review) — spec 030
├── goal_link_providers.py    # registry: vínculo de meta com outro agente (search/resolve) — spec 036
├── habit_source_providers.py # registry: fonte automática de hábito (get_activity) — spec 036
├── focus_stats.py        # motor PURO (sem banco): agrega sessões de foco (dia/hora/desfecho/streak/ranking) — spec 037 + 062
├── focus_achievements.py # motor PURO (sem banco): catálogo fixo de conquistas de foco — spec 062
├── focus_habit_provider.py   # provider da fonte automática "Foco (Kaguya)" p/ habit_source_providers — spec 062
├── tools_focus.py        # camada de lógica: sessões de foco (start/finish/cancel/stats/heatmap/achievements) — spec 037 + 062
├── capacity.py           # motor PURO (sem banco): compute_capacity() — janela 8h–22h — fatia 016
├── gcal.py               # cliente Google Calendar compartilhado (read all / write main) — fatia 019
├── gcal_sync.py          # espelho best-effort: push/remove tarefas no GCal "Kaguya — Tarefas" — fatia 019
├── calendar_prefs.py     # CRUD da tabela calendar_prefs (visibilidade + cor + contexto Trabalho/Pessoal) — fatia 019 / spec 038
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
`list_tasks_by_builtin(key)` abre cada um. **Spec 034**: as 3 listas de estado consultam o
**status GTD real** (`tasks.gtd_status`) — as tags reservadas `#aguardando`/`#algum-dia` foram
migradas e aposentadas (schema roda a conversão idempotente). Mapeamento: Listas = Áreas · Tags =
Contextos leves (não confundir com `task_contexts`, o campo dedicado) · Smart-lists = listas de
ação. No webapp são ids-sentinela negativos na sidebar; no Telegram resolvem por nome
(`list_tasks_by_filter_name`). DSL ganhou os campos `gtd_status` (eq/none) e `context_id`
(eq/none), e o atalho de data `"tomorrow"` em `_resolve_relative_date`.

### `tools_views.py` — views fixas de mercado (Todas/Hoje/Amanhã/Próximos 7 Dias/Inbox) — spec 034

Bloco fixo no TOPO da sidebar (FR-006), **não editável** — sem linha em `task_filters`, puro
código reusando `_build_where_from_rules`/`_run_filter_rules` de `tools_filters.py`.
`list_view_all/today/tomorrow/next7/inbox()` + `get_view_counts()` (badges da sidebar).
"Próximos 7 Dias" inclui hoje (decisão de produto — research.md R7).

### `tools_contexts.py` — contextos de execução dedicados — spec 034

CRUD simples (`list_contexts`/`create_context`/`update_context`/`delete_context`) sobre a
tabela `task_contexts` — **campo dedicado**, não tag N:N: no máximo **um** contexto por tarefa
(`tasks.context_id`, `ON DELETE SET NULL` — excluir o contexto só desassocia, nunca apaga
tarefas). Nome único ignorando caixa. Sem SEED — o usuário começa com zero contextos.

### Processamento do inbox (GTD clarify) — spec 034

`process_inbox_item(task_id, decision, ...)` em `tools_tasks.py` aplica uma das 6 decisões do
wizard (`next_action`/`waiting`/`someday`/`schedule`/`done`/`trash`) reusando
`update_task`/`complete_task`/`delete_task` — nenhuma regra de negócio duplicada. A fila
(`list_inbox_queue()`) é **100% derivada** (sem coluna de "processado"): tarefas-pai do Inbox,
vivas, abertas, com `gtd_status IS NULL` e `due_date IS NULL`. Cada decisão tira o item da fila
via uma coluna já existente — `gtd_status` (status), `due_date` (agendar), `completed_at`
(concluir) ou `deleted_at` (lixo). `tasks.gtd_status`/`waiting_note`/`waiting_since` são
geridos por `update_task`: entrar em `waiting` reseta `waiting_since = now()`; sair de
`waiting` limpa `waiting_since` (mas preserva `waiting_note`); setar `due_date` numa tarefa
`someday` limpa o status (FR-012 — datas e "algum dia" são contraditórios). Ao gerar a próxima
ocorrência de uma recorrente, `gtd_status`/`context_id`/`waiting_note` são herdados (uma nova
entrada em "waiting" ganha `waiting_since` fresco).

### Revisão semanal guiada (`tools_review.py`) — spec 035

Fecha o bloco GTD aberto pela spec 034 com um ritual de **6 passos fixos**
(`_ALL_STEPS = ["inbox", "next_actions", "waiting", "lists", "calendar", "someday"]`), cada um
mostrando dados **ao vivo** (nenhum passo tem snapshot — o dado exibido é sempre a consulta
atual, mesmo numa revisão retomada semanas depois). **Webapp-only**: nenhuma função aqui é
registrada como tool no agente ADK — pelo Telegram só o lembrete de domingo chega (abaixo), o
wizard em si é `webapp/frontend/src/pages/kaguya/modals/WeeklyReviewModal.tsx`.

Tabela `task_weekly_reviews` (`id`, `started_at`, `completed_at`, `steps_seen TEXT[]`, `note`):
`start_or_resume_review()` retoma a aberta (`completed_at IS NULL`) ou cria uma nova — o índice
único parcial `uq_task_weekly_reviews_open` garante no máximo uma aberta **no schema**, não só
na aplicação. `mark_step_seen(review_id, step)` é idempotente (`array_append` condicional).
`complete_review(review_id, note)` exige `steps_seen ⊇ _ALL_STEPS`, senão devolve
`{"status": "error", "error": "steps_pending", "missing": [...]}` — tratado como um "pedido de
confirmação" (200), não erro de validação (mesmo padrão de `needs_cascade` em `complete_task`).

Cada passo reusa integralmente uma função já existente — nenhuma lógica de negócio duplicada:

| Passo | Fonte |
|---|---|
| 1. Inbox zero | `list_inbox_queue()` + `process_inbox_item()` (spec 034) |
| 2. Próximas ações | `BUILTIN_FILTERS["next-actions"]` (spec 034) |
| 3. Aguardando | `list_waiting_ordered()` (nova — mesmas condições do built-in `waiting`, mas com `ORDER BY waiting_since ASC NULLS LAST`, pois a DSL genérica de smart-lists não tem `order_by`) |
| 4. Listas/projetos | `get_sidebar()` (agora com `task_projects.last_reviewed_at`) + `mark_project_reviewed(project_id)` (nova) |
| 5. Calendário | `calendar_hub.aggregate()` + `list_tasks_in_range()`, chamados 2× (semana passada/semana que vem) — leitura pura |
| 6. Algum dia/talvez | `BUILTIN_FILTERS["someday"]` (spec 034) |

`get_last_completed_review()`/`list_review_history()` alimentam o indicador "última revisão há
N dias" do painel (US4) — o "há N dias" é calculado no FRONTEND a partir do `completed_at` ISO,
nunca no backend com `CURRENT_DATE` puro (regra global do fuso). `get_reminder_summary()` é
usado só pelo job agendado `weekly_review_reminder` (`scripts/send_weekly_review_reminder.py` →
`scheduler/jobs.py::run_weekly_review_reminder` → `scheduler/registry.py`, domingo 20:00
America/Sao_Paulo) — dispara **somente se** nenhuma revisão foi concluída nos últimos 7 dias
corridos; ver `scheduler/CLAUDE.md`.

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

### Metas e Hábitos cross-agent (spec 036) — `goal_link_providers.py` + `habit_source_providers.py`

Uma meta pode ter **movimentos externos** (itens de outro agente, ex.: livros da Frieren) cujo
estado alimenta o **progresso automático** da métrica; um hábito pode ter uma **fonte automática**
de check-in (ex.: diário da Violet, leitura da Frieren). Fase 1: Frieren (livros + leitura) e
Violet (diário). Extensível — um agente novo só precisa publicar um módulo `goal_provider.py`
e/ou `habit_provider.py` no seu próprio pacote e registrar-se (FR-010); nenhuma mudança no modelo
de dados nem nas telas genéricas. **Webapp-only**: sem tool ADK nova (mesma decisão da 024/029/030/035).

Dois **registries** pequenos (não um genérico "gordo"), espelhando o padrão de registro +
importação dinâmica com fallback gracioso do `calendar_hub.py`:

- **`goal_link_providers.py`** — `register(id, name, search_fn, resolve_fn)`. Contrato:
  `search_items(query) -> [{id, label, sublabel, cover_url}]` (buscar itens vinculáveis) e
  `resolve_items(ids) -> [{id, label, sublabel, cover_url, done, deep_link}]` (estado ATUAL dos
  já vinculados — nunca cacheado; `done: True` é o sinal genérico que conta para o progresso
  automático). Ids inexistentes somem da resposta (FR-009). Provedor da fase 1:
  `frieren_books` → `agents/frieren/goal_provider.py`.
- **`habit_source_providers.py`** — `register(id, name, fn)`. Contrato:
  `get_activity(start_date, end_date) -> {"AAAA-MM-DD": valor}` (série esparsa; presença = dia
  cumprido no hábito binário, valor comparado com `target_value` no mensurável). Provedores da
  fase 1: `violet_diary` → `agents/journal/habit_provider.py` (1.0 nos dias com bullet não-vazio);
  `frieren_reading` → `agents/frieren/habit_provider.py` (soma de `reading_logs.pages_read`/dia).
  Spec 062 acrescenta `kaguya_focus` → `agents/kaguya/focus_habit_provider.py` (soma de minutos
  focados/dia, só sessões `outcome='completed'`) — o único provedor "interno" (o próprio domínio
  de foco), mas ainda registrado pelo mesmo import dinâmico com fallback gracioso dos demais.

Ambos os registries **degradam sozinhos** (best-effort, FR-008): provedor não registrado ou que
lança exceção devolve `None`/`{}` (nunca propaga a exceção) — o chamador decide como exibir a
degradação (`unavailable: true` no grupo da meta; hábito sem fonte se comporta como sempre foi).

**Metas (`tools_goals.py`)**: `goals.metric_mode` ∈ `manual`/`auto`. Em `auto`, `metric_current`
armazenado é **ignorado na leitura** — o valor é `COUNT(done=True)` agregando `resolve_items` de
TODOS os provedores vinculados à meta (não um único "provider dono"), calculado a cada consulta
(`_resolve_external_movements` + `_auto_metric_value`). `update_goal` **bloqueia** editar
`metric_current` em modo `auto` (FR-003). `set_metric_mode(goal_id, mode)` faz a transição:
`auto → manual` congela o último valor calculado em `metric_current` antes de trocar (edge case).
Vínculo: tabela `goal_external_links` (`goal_id`, `provider_id`, `entity_id`, `UNIQUE` nos três) —
**não exclusivo** (o mesmo item pode contar para duas metas, diferente do vínculo 1:1 de
movimentos internos da 030). `ON DELETE CASCADE` em `goal_id`: excluir a meta desvincula, nunca
toca a entidade de origem (FR-011). Novas tools: `list_goal_link_providers`,
`search_goal_link_items`, `link_external_item`, `unlink_external_item`, `set_metric_mode`.
`get_goal().movements.external` traz os grupos por provedor (`provider_name`, `unavailable`, `items`).

**Hábitos (`tools_habits.py`)**: `habits.source_provider_id` (nullable) aponta para uma chave do
registry. **Nada da fonte automática é persistido** em `habit_checkins` — a cada leitura,
`_auto_done_map` consulta `habit_source_providers.get_activity` na janela de
`_ACTIVITY_WINDOW_DAYS` (70 dias, margem sobre a janela de 60 dias do `habit_strength`) e faz a
**união** com os check-ins manuais antes de chamar o motor de força (`HS.summary`) — um dia
cumprido por qualquer uma das duas fontes conta uma vez (FR-007). `done_today_source`
(`manual`/`auto`/`both`/`None`) identifica a origem do dia. `get_habit_history(year)` faz a mesma
mescla no ano inteiro, com `source` por dia esparso. `create_habit`/`update_habit` aceitam
`source_provider_id` (`clear_source=True` remove a fonte no update). Nova tool:
`list_habit_source_providers`.

Persistência: 1 tabela nova (`goal_external_links`) + 2 colunas (`goals.metric_mode`,
`habits.source_provider_id`) em `schema_tasks_pg.sql`. Ver `specs/036-goal-habit-links/data-model.md`.

### Foco / Pomodoro gameficado (spec 037 + spec 062) — `focus_stats.py` + `focus_achievements.py` + `focus_habit_provider.py` + `tools_focus.py`

Ciclo pomodoro: o usuário inicia uma **sessão de foco** (ligada a uma tarefa, a um hábito, ou
avulsa), escolhe a duração (presets 25/5, 50/10 ou custom — lembrada em `focus_prefs`, tabela
de 1 linha), e a sessão fica ativa até ser concluída, cancelada, ou fechada automaticamente por
**abandono**. **Webapp-only**: sem tool ADK (mesma decisão de 024/029/030/035/036).

**Nada persistido derivado** (mesmo princípio de `goal_progress`/`habit_strength`/
`experiment_adherence`): o único dado gravado é o registro bruto (`focus_sessions` —
`started_at`, `duration_planned_min`, `break_planned_min`, `ended_at`, `outcome`,
`cancel_reason`, `habit_id`, `note`). Tempo restante, fase (`foco`/`pausa`), streak, espécie da
árvore e o catálogo de conquistas são **sempre** calculados na leitura a partir de
`started_at`/do histórico — nunca um cronômetro persistido, nunca um contador de XP salvo (o
widget do frontend deriva o countdown localmente entre polls, mas a base é sempre o timestamp
do servidor).

**Desfecho de 3 vias (`outcome`, spec 062) — substitui o antigo `completed` booleano.** Um
booleano só distinguia "deu certo" de "não deu certo"; `outcome` distingue **desistência ativa**
(`cancelled`, via `cancel_session(session_id, reason)` — motivo em texto livre e **opcional**,
"o que te tirou do foco?") de **abandono por timeout** (`abandoned`, via `_close_if_abandoned`,
sem o usuário ter voltado ao painel). É essa distinção que torna "onde eu falhei" uma pergunta
respondível pelo overview — antes da 062, sessões falhadas eram simplesmente filtradas de toda
estatística.

`get_active_session()` fecha automaticamente qualquer sessão **abandonada** antes de responder:
se o tempo decorrido já passou de `duration_planned_min + break_planned_min` e a sessão ainda
está aberta, ela é fechada com `outcome='abandoned'` e `ended_at = started_at +
duration_planned_min` — creditando **no máximo** o tempo de foco planejado, nunca a pausa nem
o tempo real até o usuário voltar ao painel. Sem job/cron: a checagem acontece na própria
leitura (mesmo padrão de "nada persistido derivado").

No máximo **uma** sessão ativa por vez (`ended_at IS NULL`) — garantido por índice único
parcial (`uq_focus_sessions_open`, mesmo padrão de `uq_task_weekly_reviews_open` da spec 035).
Iniciar outra com uma já ativa exige `force=True` (o frontend confirma com o usuário antes;
a sessão substituída vira `outcome='cancelled'`, não abandonada).

**Vínculo com hábitos (spec 062) — dois caminhos complementares, não excludentes:**

1. **`habit_id` direto na sessão** — "focar NO hábito X". `finish_session` faz o check-in do
   hábito na **mesma transação** da conclusão (`tools_habits._check_in_on_cursor`, mesmo padrão
   transacional de `_complete_task_on_cursor`/pagamento atômico cross-agent) — a resposta ecoa
   `habit_checked_in` para o frontend confirmar sem uma 2ª chamada. O check-in usa o dia local
   (America/Sao_Paulo) do fim da sessão, não `CURRENT_DATE`.
2. **Provider `kaguya_focus` no registry da spec 036** (`focus_habit_provider.py`) — "foquei
   hoje, em qualquer coisa". `get_activity(start, end)` soma minutos focados (só sessões
   `completed`) por dia; um hábito mensurável "focar 60min/dia" (`target_value=60, unit="min"`)
   marca o check-in sozinho, sem intervenção manual. Registrado junto de `violet_diary`/
   `frieren_reading` em `habit_source_providers.py`.

Os dois convivem sem conflito: `habit_checkins` tem `UNIQUE (habit_id, date)` com upsert — um
dia cumprido por qualquer uma das duas fontes conta uma vez.

**Gameficação sem tabela nova.** Árvore, streak e conquistas são todos calculados na leitura —
zero estado de jogo persistido (sem meta diária, sem moeda, sem loja de espécies: decisão de
produto da spec 062 para manter o princípio "nada persistido derivado" intacto):

- **Árvore por sessão** — a espécie é **derivada** da duração (nunca escolhida): `<20min`
  broto, `20–40` pequena, `40–70` média, `70+` grande; `cancelled`/`abandoned` vira árvore
  **murcha**. Lógica no frontend (`ui/FocusTree.tsx::treeSpecies`), puramente visual — nenhum
  campo "species" existe no backend.
- **Streak** — `focus_stats.current_streak(day_totals, today)`: dias consecutivos com pelo
  menos uma sessão concluída. Se hoje ainda não tem sessão, conta a partir de ontem (não quebra
  no meio do dia, só quando o dia vira sem sessão nenhuma). `longest_streak` é o recorde
  histórico, usado pelas conquistas de sequência (não "some" se o streak atual zerar).
- **Conquistas** (`focus_achievements.py`, motor puro) — catálogo fixo em 8 eixos (sessões
  concluídas, horas totais, streak, sessão longa, dia intenso, horário — madrugador/coruja,
  resiliência — concluir e falhar no mesmo dia, fidelidade — 10h numa mesma lista).
  `evaluate(sessions, today)` reavalia o catálogo inteiro a cada chamada; nenhum "desbloqueei"
  é gravado — se o histórico mudar (ex.: uma sessão editada), o resultado muda junto, sempre
  coerente.

**Estatísticas e overview.** `get_focus_stats(start, end)` é o **payload único** da tela Foco —
orquestra os motores puros sobre a mesma janela de sessões (nenhuma agregação fora deles):
`aggregate_by_day` (zero-fill do período — a árvore/floresta não pode ter buracos),
`aggregate_by_hour` (24 colunas zero-filled, "quando eu foco × quando eu largo"),
`outcome_stats` (taxa de conclusão + tempo médio antes de desistir, `avg_min_before_quit`),
`current_streak`/`longest_streak` (sempre sobre o **histórico inteiro**, não só o período
visível — um streak não deveria sumir só porque o usuário está olhando a semana passada) e
`top_by` (ranking por tarefa/lista/hábito/contexto). `get_focus_today`/`get_focus_week`/
`get_focus_history`/`get_focus_heatmap(year)` continuam existindo para o Meu Dia e o heatmap
anual — todos usam `AT TIME ZONE 'America/Sao_Paulo'`, nunca `CURRENT_DATE`. Diferente da spec
037, a query base (`_query_sessions`) agora **inclui** canceladas/abandonadas — filtrar por
`outcome` é responsabilidade dos motores puros, não da query (eles precisam ver os dois lados
para calcular a taxa de falha).

`get_task_focus_summary(task_id)` alimenta o cabeçalho do `TaskModal` (tempo acumulado nesta
tarefa). `get_focus_history(date)` deixou de filtrar só concluídas — traz qualquer sessão
**encerrada** do dia (com `outcome`/`cancel_reason`), pois o objetivo virou mostrar "onde eu
falhei", não só "quanto eu foquei".

Persistência: 2 tabelas em `schema_tasks_pg.sql` (`focus_sessions`, `focus_prefs`) + 3 colunas
novas em `focus_sessions` (`outcome`, `cancel_reason`, `habit_id`) na spec 062, com backfill
idempotente do `completed` booleano antigo (`true→completed`, `false→cancelled` — não há como
recuperar retroativamente quais eram abandonos, a distinção só passou a existir com o
`outcome`) e a coluna antiga removida após o backfill. Ver `specs/037-tasks-focus-pomodoro/
data-model.md` (base) e o plano da spec 062 (floresta, vínculo com hábitos, overview).

### Meu Dia — contexto Trabalho/Pessoal (spec 038)

O Meu Dia ganha duas seções com capacity própria: **Trabalho** e **Pessoal**. O contexto é
propriedade da **lista** (`task_projects.context`, `'personal'` padrão ou `'work'`) e do
**calendário conectado** (`calendar_prefs.context`, mesmo domínio) — **nunca** da tarefa.
Não existe coluna `context` em `tasks`: o contexto de uma tarefa é sempre resolvido por
**JOIN** com a lista atual (`list_my_day` já faz `JOIN task_projects p`, só passou a incluir
`p.context` na SELECT) — mover uma tarefa de lista muda seu contexto automaticamente, sem
trigger nem risco de divergência (FR-002).

**Motor de capacity intocado**: `compute_capacity` (`capacity.py`) não mudou uma linha —
`list_my_day` só chama a mesma função 3× com insumos filtrados (total, work, personal).
`_gcal_events_for_day` foi estendido para também particionar as tuplas de minutos dos
eventos por `calendar_prefs.context`, devolvendo `eventos_tuplas_work`/`eventos_tuplas_personal`
além da tupla total (assinatura passou de 3 para 5 valores — único chamador é `list_my_day`).

**Semântica da soma (FR-006/SC-002)**: `estimado_min`/`agenda_min`/`no_plano` de
`capacity_work` + `capacity_personal` somam exatamente os valores de `capacity` (visão única)
— são somas diretas dos insumos brutos particionados. `livre_min`/`folga_min`/`excedeu`
**não** são somáveis entre si: cada capacity de contexto é calculada contra a MESMA janela
cheia (8h–22h, sem "horário comercial" separado na v1), então cada barra responde
independentemente "esse contexto sozinho cabe no dia inteiro?" — nunca "quanto sobra depois
do outro contexto". Ver `specs/038-meudia-work-context/research.md` R6.

**Inbox é sempre Pessoal** — garantido no schema (`CHECK (NOT is_inbox OR context =
'personal')`), não só na aplicação; `update_project`/`create_project` também validam antes
do UPDATE para devolver 400 amigável em vez do erro cru do Postgres.

**Ação em massa por grupo** (FR-003): `set_group_context(group_id, context)` — um único
`UPDATE ... WHERE group_id = ... AND NOT is_inbox`, não um loop por lista.

**Toggle visão única/dividida** (FR-008, US3): preferência de **UI pura** em `localStorage`
(chave `kg:myday:view`, frontend `TodayScreen.tsx`) — mesmo padrão já usado em
`KaguyaShell.tsx` para lembrar Lista×Kanban por lista/grupo. Nenhuma tabela nova para isso
(diferente da decisão R4 da spec 037, onde a preferência alimentava um valor que precisa ser
consistente entre abas — aqui é puramente de exibição).

`my_day_status()` (resumo do Telegram) acrescenta os dois blocos ("trabalho: X de Y; pessoal:
Z de W" — estimado de livre em cada contexto) quando há algo planejado em algum lado (FR-009).

Persistência: 2 colunas novas em tabelas já existentes (`task_projects.context`,
`calendar_prefs.context`) — nenhuma tabela nova. Ver
`specs/038-meudia-work-context/data-model.md`.

---

### Arquivar listas + localização nos eventos (spec 039)

**Arquivar (`archive_project`/`restore_project`/`list_archived_projects`, em
`tools_projects.py`) reusa a coluna `task_projects.archived_at` que já existia** —
`delete_project` já a gravava internamente (some da navegação), mas nunca era exposta como
um fluxo próprio nem tinha restauração. A diferença chave: `archive_project` **não move nem
apaga** tarefas/colunas (diferente de `delete_project`, que sempre reaponta/soft-deleta e
apaga o board); `restore_project` zera o campo. Nenhuma migração de schema.

**Ponto único de correção**: a maioria das views operacionais (smart-lists salvas, as 5
views fixas de `tools_views.py`, e o filtro de Kanban view) converge para
`tools_filters._build_where_from_rules()` — um único `AND p.archived_at IS NULL` no `base`
(condicionado a `default_open=True`, o único caso com `JOIN task_projects p`) resolve todas
elas de uma vez. Os pontos que têm query própria (`list_tasks_in_range` no
`tools_calendar.py`, `list_tasks_by_tag` no `tools_tags.py`, `list_tasks_today` e
`list_eisenhower_tasks` e as 3 queries de `list_my_day` no `tools_tasks.py`) ganharam o mesmo
filtro individualmente. A suspensão de recorrência (FR-006) é efeito colateral de
`list_tasks_in_range` já filtrar — a tarefa-mãe da série simplesmente não entra mais na
consulta que alimenta `project_occurrences`.

**Exceção: `search_tasks`** continua trazendo tarefas de listas arquivadas (FR-003 — a busca
"acha tudo") e acrescenta `archived: bool` no item serializado para o frontend sinalizar a
origem.

**Telegram (FR-008)**: `resolve_project_id_by_name` (usado por `create_task`/
`list_tasks_by_project` quando o usuário fala o nome) continua só achando listas vivas.
`resolve_project_id_by_name_any` (novo, sem o filtro) é usado só no caminho de erro de
`list_tasks_by_project`, para distinguir "não existe" de "existe mas está arquivada" e
sugerir `restore_project`.

**Localização nos eventos**: `gcal._format_event()` já normalizava `location` de todo evento
— chegava à agenda (`CalendarScreen`) e ao popover (`EventPopover`), mas
`_gcal_events_for_day()` (o único caminho do Meu Dia) descartava o campo. Fix de uma linha.
O link para o Google Maps é uma função pura no frontend
(`lib/maps.ts::mapsLinkFor`) — usa a busca universal do Maps (sem chave de API) ou a própria
URL quando o local já é um link (Google Meet etc.).

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
| `archive_project`, `restore_project`, `list_archived_projects` | arquivar/restaurar lista sem tocar tarefas/colunas (spec 039) |
| **`complete_payment_task`** | cross-agent (Kaguya + Nami) — atômico |
| **`create_expense_reminder`** | cross-agent — cria lembrete no Postgres |
| `plan_my_day()` | Meu Dia completo (plano + pendências + sugestões + capacity, total e por contexto Trabalho/Pessoal) — fatia 016 + spec 038. Plano/pendências/sugestões incluem **subtarefas datadas** (spec 028); sub-itens trazem `parent_title` para o badge ↳ |
| `my_day_status()` | resumo textual do plano + capacity, com os dois blocos Trabalho/Pessoal quando há algo planejado (briefing Telegram) — fatia 016 + spec 038 |
| `add_to_my_day_by_name(task, date?)` | adiciona ao Meu Dia por id ou nome — fatia 016 |
| `remove_from_my_day_by_name(task)` | retira do Meu Dia por id ou nome — fatia 016 |
| `set_estimate_by_name(task, minutes)` | grava estimativa de duração por id ou nome — fatia 016 |
| `eisenhower_status()` | relato textual dos 4 quadrantes da matriz de Eisenhower — fatia 017 |
| `process_inbox_item(task_id, decision, ...)` | aplica uma das 6 decisões do processamento guiado do inbox — spec 034 |
| `resolve_view_by_name(name)` | resolve "todas"/"hoje"/"amanhã"/"próximos 7 dias"/"inbox" (paridade FR-014) — spec 034 |
| (Calendar) | `list_events_today`, `create_event`, ... via MCP |

**Telegram — processamento do inbox (spec 034 / US5):** o comando `/processar_inbox`
(`coordinator/main.py`) inicia um wizard de botões inline (`ibx_*`), reusando o mesmo padrão de
`_pending_action` + `CallbackQueryHandler` já usado pelos fluxos `/criar_conta`/`/criar_cartao`
(research.md R9) — não é um novo framework de conversação. Resposta em **texto livre** também
funciona (decisão híbrida da clarificação): `_guess_inbox_decision()` interpreta a frase contra
o mesmo vocabulário fixo de 6 decisões e chama a mesma `process_inbox_item`. "Agendar" sempre
pede a data em texto livre (Telegram não tem seletor nativo).

> **Webapp-first (sem tool no agente):** views de Kanban (spec 024), Tiny Experiments (spec 029),
> Metas (spec 030) e Foco/Pomodoro (spec 037) não registram nenhuma função no ADK nesta fatia —
> existem só na camada de lógica + router REST. `tools.py` re-exporta os nomes marcando o ponto
> de extensão futuro.

### Cross-agent: pagamento atômico

`complete_payment_task(task_id, amount, category, account, transaction_name="")`:
completa a tarefa **e** lança a despesa (via `create_transaction_on_cursor` da Nami) na
**mesma transação PostgreSQL** — tudo-ou-nada (acabou o status `partial`). A Kaguya deve
confirmar valor/categoria/conta **antes** de chamar — sem defaults financeiros.

`create_expense_reminder(title, due_date, project_name="Finanças", amount=0, description="")`:
cria a tarefa de lembrete (prioridade alta) no banco; **não** lança despesa.

**Webapp (spec 047, US4)**: `POST /api/tasks/reminders` (`webapp/backend/routers/tasks.py`)
expõe esta mesma tool para o botão "Lembrar-me" nos próximos vencimentos do Dashboard da
Nami — com uma checagem de duplicata própria do endpoint (mesmo título + `due_date` numa
tarefa aberta da lista Finanças não cria de novo).

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
