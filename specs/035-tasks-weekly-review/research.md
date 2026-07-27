# Research: Revisão semanal guiada (Kaguya)

**Input**: `specs/035-tasks-weekly-review/spec.md` · depende de `specs/034-tasks-gtd-core/` (já
entregue — `gtd_status`, `process_inbox_item`, views fixas, `task_contexts`).

Nenhum `NEEDS CLARIFICATION` restou no spec (todas as decisões de produto já fechadas com o
usuário — ver spec.md § Assumptions). As decisões abaixo resolvem apenas a forma técnica de
implementar o que o spec já define, reusando ao máximo o que a 034 e as fatias anteriores (016
Meu Dia, 019 Calendar Hub, 029/030 revisão de experimento/meta) já construíram.

## R1 — Onde persistir a revisão

**Decision**: uma tabela nova, `task_weekly_reviews`, com `started_at`, `completed_at` (NULL
enquanto aberta), `steps_seen TEXT[]` (chaves dos passos já vistos) e `note` (nota final,
opcional). Nenhuma tabela de "snapshot" por passo — os dados exibidos em cada passo são sempre
consultados ao vivo (FR-002, edge case "revisão muito antiga").

**Rationale**: mesmo padrão de "registro leve + dados vivos" que `tiny_experiments`/`goals` já
usam para suas revisões (`review TEXT` na própria linha) — nenhuma infraestrutura nova.
`steps_seen` como array evita 6 colunas booleanas (`step1_seen`..`step6_seen`) para o mesmo dado,
e é trivial de checar em Python (`set(steps_seen) >= _ALL_STEPS`).

**Alternatives considered**: 6 colunas boolean (rejeitado — mais verboso, sem ganho real, viola
Constitution V "Minimal Footprint" por preferir a forma mais simples que resolve o requisito);
JSONB por passo com timestamp de quando foi visto (rejeitado — não há requisito de auditoria
por passo, YAGNI).

## R2 — Garantir no máximo uma revisão aberta

**Decision**: índice único parcial `CREATE UNIQUE INDEX uq_task_weekly_reviews_open ON
task_weekly_reviews ((true)) WHERE completed_at IS NULL` — o banco recusa uma segunda linha
com `completed_at IS NULL`, tornando "no máximo uma aberta" uma garantia de schema (FR-005), não
só de aplicação.

**Rationale**: mesmo estilo de garantia que `idx_kanban_views_builtin` (spec 024) já usa para
"a view built-in é única". `start_or_resume_review()` primeiro tenta `SELECT ... WHERE
completed_at IS NULL`; só faz `INSERT` se não achar nada — o índice é a rede de segurança contra
corrida, não o caminho principal.

**Alternatives considered**: checar em Python sem constraint de banco (rejeitado — race
condition entre o SELECT e o INSERT, mesmo em uso solo, se dois cliques disparam simultâneo).

## R3 — Passo 4 (listas/projetos): marca de "última revisão"

**Decision**: nova coluna `task_projects.last_reviewed_at TIMESTAMPTZ NULL`, atualizada por uma
função `mark_project_reviewed(project_id)` chamada quando o usuário confirma ter revisado
aquela lista dentro do passo. O passo 4 exibe `get_sidebar()` (já existente) ordenado pelas
listas **nunca revisadas primeiro** (`last_reviewed_at NULLS FIRST`, depois mais antigas
primeiro) para destacar o que está "parado" (spec: "varrer... procurando itens órfãos ou
paradas").

**Rationale**: reusa `tools_projects.get_sidebar()` inteiro; a única adição é a marca de tempo
e a ordenação — nenhuma tabela nova.

**Alternatives considered**: histórico completo de revisões por lista (tabela N:N
lista↔revisão) — rejeitado, YAGNI; o spec só pede saber que "está parada", não um histórico.

## R4 — Passo 3 (aguardando): destaque dos mais antigos

**Decision**: reusar `BUILTIN_FILTERS["waiting"]` (spec 034) mas com uma consulta dedicada em
vez do endpoint genérico, ordenando explicitamente por `waiting_since ASC NULLS LAST` — os itens
"esperando há mais tempo" aparecem primeiro (FR-003).

**Rationale**: o endpoint genérico `/filters/builtin/waiting/tasks` não garante ordem por
antiguidade (a DSL de smart-lists não tem `order_by`). Em vez de estender a DSL genérica para um
único uso, o passo da revisão consulta direto (`tools_review.py` importa `_build_where_from_rules`
com as mesmas condições do built-in `waiting` + `ORDER BY waiting_since ASC NULLS LAST`).

**Alternatives considered**: adicionar `order_by` genérico à DSL de smart-lists (rejeitado —
escopo maior que o necessário; nenhuma outra smart-list hoje precisa de ordenação customizada).

## R5 — Passo 5 (calendário): semana passada + semana que vem

**Decision**: reusar `calendar_hub.aggregate(start, end)` (fatia 019) duas vezes — uma janela
`[hoje-7, hoje)` (semana que passou) e outra `[hoje, hoje+7)` (semana que vem) — mais
`tools_calendar.list_tasks_in_range` para as tarefas datadas da Kaguya nessas janelas. É
leitura pura (spec.md § Assumptions: "Passo do calendário é leitura").

**Rationale**: `aggregate()` já faz fan-out em todas as fontes registradas (Nami, Frieren,
Violet, GCal) com tratamento de erro por fonte — exatamente "a semana que passou (algo
escapou?) e a que vem" sem reimplementar nada.

## R6 — Passos 1, 2 e 6: reuso direto de spec 034

**Decision**: passo 1 (inbox zero) = `list_inbox_queue()` + `process_inbox_item()` (idênticos à
spec 034, US1); passo 2 (próximas ações) = `BUILTIN_FILTERS["next-actions"]`; passo 6 (algum
dia/talvez) = `BUILTIN_FILTERS["someday"]`. Nenhuma lógica nova nesses três passos — o wizard da
revisão só os agrega numa sequência com progresso.

**Rationale**: a spec 034 já entrega clarify (passo 1) e as duas listas de estado (passos 2 e
6) como cidadãos de 1ª classe; a 035 é o ritual que os costura, não uma reimplementação.

## R7 — Ação inline dentro de cada passo

**Decision**: nenhuma tool nova de "editar item" — cada passo do wizard chama as tools já
existentes (`process_inbox_item`, `complete_task`, `update_task`, `delete_task`, `mark_project_reviewed`)
diretamente do frontend, com efeito **imediato** no sistema (FR-002 exige isso explicitamente:
"não são rascunho da revisão"). O único estado exclusivo da revisão é `steps_seen` e a nota
final.

**Rationale**: qualquer "rascunho" exigiria uma camada de staging/commit que o spec rejeita
explicitamente (Acceptance Scenario 2). Efeito imediato = menos estado para gerenciar
(Constitution V).

## R8 — Lembrete de domingo à noite (US3)

**Decision**: um job novo no `scheduler/` (`weekly_review_reminder`), seguindo exatamente o
padrão de `send_lucy_digest.py` — script standalone em `scripts/send_weekly_review_reminder.py`,
wrapper `run_weekly_review_reminder()` em `scheduler/jobs.py` (subprocesso, mesmo motivo do
digest: `sys.exit(1)` em falha estrutural vira `RuntimeError` para o runner), registrado em
`scheduler/registry.py` com um helper novo `weekly_at(day_of_week, hour, minute=0)` (mesmo
padrão de `daily_at`/`every`, só que com `CronTrigger(day_of_week=..., hour=..., timezone=TZ)`).
Horário: **domingo 20:00 America/Sao_Paulo** (`weekly_at("sun", 20, 0)`).

O script verifica se há uma revisão **concluída** com `completed_at` nos últimos 7 dias
corridos (fuso local); se houver, não envia nada (FR-007, "somente se"). Se não houver, monta um
resumo curto (tamanho da fila do inbox + contagem de "aguardando" com mais de 7 dias) e envia
via `requests.post` na Bot API, reusando `TELEGRAM_BOT_TOKEN`/`TELEGRAM_ALERT_CHAT_ID` (já
existem — nenhuma variável de ambiente nova).

**Rationale**: infraestrutura de jobs agendados já resolve histórico + alerta de falha
(`scheduler/runner.py`) — só falta o job em si, no padrão estabelecido (Constitution II: batch
agendado não vira ADK tool).

**Alternatives considered**: lembrete via ADK tool/coordinator poll (rejeitado — o repo já tem
scheduler dedicado para isso; reinventar seria duplicar infraestrutura, Constitution V).

## R9 — Indicador "última revisão há N dias" (US4)

**Decision**: uma função `get_last_completed_review()` em `tools_review.py` que devolve a linha
`completed_at` mais recente (ou `None`); o frontend calcula "há N dias" localmente (mesmo padrão
de `dateUtils.ts` já usado no diário) a partir do timestamp UTC devolvido — nunca calculando
"hoje" no backend com `CURRENT_DATE` puro (regra global do repo).

**Rationale**: consistente com a regra de fuso já documentada no `CLAUDE.md` raiz — toda
derivação de "N dias atrás" fica no cliente (que já conhece o fuso do navegador) ou, se no
backend, via `AT TIME ZONE 'America/Sao_Paulo'` explícito.

## R10 — Superfície no agente ADK (Telegram)

**Decision**: **nenhuma tool nova registrada no agente Kaguya**. O wizard completo é
**webapp-only** (mesmo padrão *webapp-first* de Kanban views/Experiments/Metas — spec 024/029/030)
— o spec.md já define isso em Assumptions ("pelo Telegram vai apenas o lembrete"). O lembrete
(R8) é hard-coded (script do scheduler), não uma resposta do agente Kaguya.

**Rationale**: evita duplicar 6 passos de UI complexa (com forms de nota, ordenação por
antiguidade, agregação de calendário) numa superfície conversacional que o spec explicitamente
exclui de escopo.

## R11 — Fuso horário / "semana"

**Decision**: toda janela de "últimos 7 dias" (US3) e "semana passada/que vem" (passo 5) é
calculada em `America/Sao_Paulo` — `now()` convertido via `AT TIME ZONE 'America/Sao_Paulo'` no
SQL (nunca `CURRENT_DATE`/`NOW()::date` puros), replicando a regra já usada em `tools_views.py`
(spec 034) e documentada no `CLAUDE.md` raiz.
