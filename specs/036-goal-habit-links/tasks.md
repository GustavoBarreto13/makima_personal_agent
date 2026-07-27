# Tasks: Metas e Hábitos vinculados a outros agentes (Kaguya ↔ Frieren/Violet)

**Input**: Design documents from `specs/036-goal-habit-links/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/rest-api.md, quickstart.md

**Tests**: Não solicitados nesta feature (mesmo padrão das fatias 024/029/030/035) — validação via
`quickstart.md` + `py_compile`/`tsc -b`.

## Phase 1: Setup

- [X] T001 Adicionar `metric_mode` a `goals`, criar `goal_external_links` e adicionar
  `source_provider_id` a `habits` em `agents/kaguya/schema_tasks_pg.sql` (idempotente —
  `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`), logo
  após o bloco de vínculo Meta↔Movimento já existente

## Phase 2: Foundational (blocking prerequisites)

- [X] T002 [P] Criar `agents/kaguya/goal_link_providers.py` — registry `register(provider_id, name,
  search_fn, resolve_fn)`, `list_providers()`, `search(provider_id, query)` e
  `resolve(provider_id, ids)` (ambos best-effort: `try/except` interno, devolvem `None`/erro
  sinalizado em vez de propagar exceção — R8), com `_try_import_provider` idêntico ao padrão de
  `calendar_hub.py`
- [X] T003 [P] Criar `agents/kaguya/habit_source_providers.py` — registry `register(provider_id,
  name, fn)`, `list_providers()` e `get_activity(provider_id, start_date, end_date)` (best-effort,
  devolve `{}` em falha), com o mesmo `_try_import_provider`
- [X] T004 Registrar os 3 provedores da fase 1 no carregamento dos módulos acima: `frieren_books`
  (goal), `frieren_reading` (habit), `violet_diary` (habit) — mirror do bloco de registro do
  `calendar_hub.py`

**Checkpoint**: registries existem e resolvem para `[]`/`{}` gracefully mesmo sem os provedores
reais ainda implementados (Phase 3+ os cria).

## Phase 3: User Story 1 — Meta de leitura com progresso automático (Priority: P1) 🎯 MVP

**Goal**: vincular livros da Frieren a uma meta e ver o progresso recalculado a cada consulta.

**Independent Test**: quickstart.md Cenário 1.

- [X] T005 [P] [US1] Criar `agents/frieren/goal_provider.py` com `search_items(query)` (reusa a
  query `ILIKE` de título/autor já usada no menu de livros) e `resolve_items(ids)` (SELECT
  `id, title, author, cover_url, status` `WHERE id = ANY(ids)`; `done = status == 'lido'`;
  `deep_link = f"/books/{id}"`)
- [X] T006 [US1] Em `agents/kaguya/tools_goals.py`: adicionar `list_goal_link_providers()`,
  `search_goal_link_items(provider_id, query)`, `link_external_item(goal_id, provider_id,
  entity_id)` (idempotente — `INSERT ... ON CONFLICT DO NOTHING` em `goal_external_links`, valida
  que a meta existe), `unlink_external_item(goal_id, provider_id, entity_id)` — todas usando os
  registries de T002
- [X] T007 [US1] Em `agents/kaguya/tools_goals.py`: estender `_movements_for_goal` para agregar
  `external` por `provider_id` (agrupa os `goal_external_links` da meta, chama
  `goal_link_providers.resolve` uma vez por provedor, marca `unavailable: true` se a chamada
  falhar — degrada sem quebrar os outros grupos)
- [X] T008 [US1] Em `agents/kaguya/tools_goals.py`: adicionar `set_metric_mode(goal_id, mode)`
  (`manual → auto`: só troca o modo; `auto → manual`: calcula o valor ao vivo uma última vez —
  reusa a mesma agregação de T007/T009 — e grava em `metric_current` antes de trocar o modo)
- [X] T009 [US1] Em `agents/kaguya/tools_goals.py`: no `_serialize_goal`/`get_goal`/`list_goals`,
  quando `metric_mode == 'auto'`, ignorar o `metric_current` armazenado e calcular
  `COUNT(done=True)` agregando `resolve` de todos os provedores vinculados à meta (mesma função de
  agregação de T007, sem duplicar a chamada ao provedor — reusar o resultado de
  `_movements_for_goal` dentro de `get_goal`; em `list_goals`, calcular por meta)
- [X] T010 [US1] Em `agents/kaguya/tools_goals.py`: bloquear `metric_current` em `update_goal`
  quando a meta está em modo `auto` (retorna erro explicando a fonte — FR-003/AC3)
- [X] T011 [US1] Re-exportar as novas funções de `tools_goals` em `agents/kaguya/tools.py`
- [X] T012 [US1] Em `webapp/backend/routers/tasks.py`: rotas `GET /goals/link-providers`,
  `GET /goals/link-providers/{provider_id}/search`, `POST /goals/{goal_id}/links`,
  `DELETE /goals/{goal_id}/links/{provider_id}/{entity_id}`,
  `PATCH /goals/{goal_id}/metric-mode` (ver contracts/rest-api.md)
- [X] T013 [P] [US1] Em `webapp/frontend/src/pages/kaguya/types.ts`: adicionar `GoalLinkProvider`,
  `GoalExternalLinkItem`, `metric_mode` em `Goal`, `external` em `movements`
- [X] T014 [P] [US1] Em `webapp/frontend/src/pages/kaguya/kaguyaApi.ts`: métodos
  `listGoalLinkProviders`, `searchGoalLinkItems`, `linkGoalExternalItem`,
  `unlinkGoalExternalItem`, `setGoalMetricMode`
- [X] T015 [US1] No modal de detalhe da meta (localizar o componente em
  `webapp/frontend/src/pages/kaguya/modals/`): toggle "métrica manual/automática" + seção
  "Movimentos externos" com picker de busca (provedor → busca → confirmar, ≤3 passos — SC-002) e
  lista dos itens vinculados (capa/título/status), respeitando `unavailable`

**Checkpoint**: US1 funciona de ponta a ponta e é testável isoladamente (quickstart Cenário 1).

## Phase 4: User Story 2 — Hábito com check-in automático do diário (Priority: P1)

**Goal**: hábito binário "Escrever no diário" com check-in automático vindo da Violet.

**Independent Test**: quickstart.md Cenário 2.

- [X] T016 [P] [US2] Criar `agents/journal/habit_provider.py` com `get_activity(start_date,
  end_date)` — `1.0` nos dias com ≥1 `journal_bullets.content` não-vazio dentro do intervalo
  (JOIN `journal_pages` por `date`, `type_id=1`), demais dias ausentes do dict
- [X] T017 [US2] Em `agents/kaguya/tools_habits.py`: aceitar `source_provider_id` em
  `create_habit`/`update_habit` (validação leve: aceita qualquer string ou `None`, sem checar
  contra o registry no momento da escrita — resiliente a provedor futuro fora do ar)
- [X] T018 [US2] Em `agents/kaguya/tools_habits.py`: `_serialize_habit`/`get_habit`/`list_habits`
  mesclam o mapa `done` (dos check-ins manuais) com `habit_source_providers.get_activity` (quando
  `source_provider_id` setado) ANTES de chamar `habit_strength.summary` — união dos dois conjuntos
  de dias cumpridos (R4); adicionar `done_today_source` (`"manual"|"auto"|None`) ao payload
- [X] T019 [US2] Adicionar `list_habit_source_providers()` em `tools_habits.py` e re-exportar em
  `agents/kaguya/tools.py`
- [X] T020 [US2] Em `webapp/backend/routers/tasks.py`: rota `GET /habits/source-providers`;
  estender os bodies de create/update de hábito com `source_provider_id` opcional
- [X] T021 [P] [US2] Em `types.ts`/`kaguyaApi.ts`: `HabitSourceProvider`, `source_provider_id` e
  `done_today_source` em `Habit`, método `listHabitSourceProviders`
- [X] T022 [US2] No modal de criação/edição de hábito: dropdown "fonte automática" (nenhuma /
  lista dinâmica dos provedores) e badge "auto" ao lado do check-in do dia quando
  `done_today_source === "auto"`

**Checkpoint**: US1 + US2 funcionam juntos sem regressão (quickstart Cenários 1 e 2).

## Phase 5: User Story 3 — Hábito mensurável alimentado pela leitura (Priority: P2)

**Goal**: hábito mensurável "Ler X páginas/dia" com valor diário somado da Frieren.

**Independent Test**: quickstart.md Cenário 3.

- [X] T023 [US3] Criar `agents/frieren/habit_provider.py` com `get_activity(start_date, end_date)`
  — `SELECT date, SUM(pages_read) FROM reading_logs WHERE date BETWEEN ... GROUP BY date`
- [X] T024 [US3] Registrar `frieren_reading` no `habit_source_providers` (T004 já previu o
  registro; esta tarefa é o ponto em que o módulo real passa a existir — antes disso o registry já
  degradava para `{}` sem quebrar)
- [X] T025 [US3] Em `agents/kaguya/tools_habits.py`: confirmar que a mescla de T018 já cobre o caso
  mensurável (o valor numérico do provedor entra no mesmo `done` map via `habit_strength.met_target`
  comparando com `target_value`) — sem código novo, só validar via quickstart Cenário 3;
  se `get_habit_history` não estiver mesclando o provedor ainda (ela lê só `habit_checkins` hoje),
  estender para também mesclar `get_activity` no intervalo do ano pedido, com o `source` por dia
  (`"manual"|"auto"|"both"`)

**Checkpoint**: hábito mensurável com fonte automática soma corretamente logs do mesmo dia.

## Phase 6: User Story 4 — Extensível para os próximos agentes (Priority: P3)

**Goal**: confirmar por revisão de design que adicionar um provedor novo não muda modelo/telas.

**Independent Test**: quickstart.md Cenário 5.

- [X] T026 [US4] Revisão: grep em `agents/kaguya/tools_goals.py` e `tools_habits.py` por
  `"livro"`/`"book"`/`"diário"`/`"journal"` literais — nenhuma ocorrência fora de comentários;
  qualquer menção literal encontrada deve ser generalizada para `provider_id`
- [X] T027 [US4] Confirmar que `GET /goals/link-providers` e `GET /habits/source-providers`
  refletem o registry em runtime (não uma lista hardcoded na rota) — teste manual: comentar um
  `register()` e checar que ele some da resposta sem erro

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T028 [P] Atualizar `agents/kaguya/CLAUDE.md` — nova seção documentando os dois registries,
  `goal_external_links`, `source_provider_id`, e a tabela de provedores da fase 1
- [X] T029 [P] Atualizar `agents/frieren/CLAUDE.md` e `agents/journal/CLAUDE.md` — notar os
  módulos `goal_provider.py`/`habit_provider.py` expostos e por quem são consumidos
- [X] T030 [P] Atualizar `webapp/docs/API.md` com as rotas novas (contracts/rest-api.md como fonte)
- [X] T031 [P] Atualizar `webapp/docs/FRONTEND.md` com o picker de vínculo e o dropdown de fonte
- [X] T032 Atualizar `ROADMAP.md`: marcar 036 como entregue (ou parcial, se algo ficar pendente) e
  remover da tabela de Pendências
- [X] T033 Validação estática: `py_compile` em todos os `.py` tocados + `tsc -b --force` no
  frontend, limpo
- [ ] T034 Rodar os 5 cenários de `quickstart.md` contra um Postgres real (VPS ou dev local) —
  **só possível com `DATABASE_URL` configurado**; se não houver ambiente disponível, reportar a
  limitação explicitamente em vez de assumir sucesso

## Dependencies & Execution Order

- **Setup (T001)** → bloqueia tudo.
- **Foundational (T002–T004)** → bloqueia todas as User Stories (os registries precisam existir
  antes de qualquer provedor real ou consumo).
- **US1 (T005–T015)**, **US2 (T016–T022)** são **independentes entre si** — podem ser feitas em
  qualquer ordem ou em paralelo após o Foundational (ambas são P1, mas usam módulos e rotas
  diferentes).
- **US3 (T023–T025)** depende do registry de hábitos (Foundational) e da lógica de merge (T018 de
  US2) — sequencial após US2.
- **US4 (T026–T027)** é uma revisão, roda por último entre as histórias (depende de US1+US2+US3
  existirem para revisar).
- **Polish (T028–T034)** por último.

## Parallel Example

```bash
# Após o Foundational (T002-T004), US1 e US2 podem avançar em paralelo (arquivos diferentes):
Task T005 (agents/frieren/goal_provider.py)      # US1
Task T016 (agents/journal/habit_provider.py)     # US2
Task T013 (types.ts)                              # US1 — arquivo compartilhado com T021 (US2), CUIDADO
```

## Implementation Strategy

**MVP = User Story 1** (T001–T015): entrega a meta de leitura com progresso automático — o caso
que motivou a feature. US2 (diário) é igualmente P1 e deve fechar na mesma entrega antes do
"pronto para revisão"; US3 (leitura mensurável) e US4 (revisão de extensibilidade) fecham o
incremento completo da spec.
