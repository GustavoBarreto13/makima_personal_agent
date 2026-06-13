# Tasks: Meu Dia + Time-blocking — Fase 3 do Sistema de Tarefas Próprio

**Input**: Design documents from `/specs/016-tasks-meudia/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-meudia.md, design-guide.md, quickstart.md

**Tests**: incluídos onde a spec exige verificação automatizada — capacity como função pura (SC-001),
camada de lógica do ritual e do time-block (SC-003/SC-004/SC-005). Padrão existente em `tests/agents/`.

**Organization**: agrupado por user story (US1–US3 da spec), cada uma independentemente testável.

## Format: `[ID] [P?] [Story] Description`

- **[P]** = pode rodar em paralelo (arquivo distinto, sem dependência não satisfeita).
- **[Story]** = a qual user story a tarefa pertence (US1/US2/US3).

---

## Phase 1: Setup

**Purpose**: confirmar o terreno — esta fatia **não** cria schema.

- [ ] T001 Confirmar que as colunas dormentes existem no banco de dev (`my_day_date`, `start_at`, `end_at`, `duration_min`) e o índice parcial `idx_tasks_my_day`, conferindo `agents/kaguya/schema_tasks_pg.sql` e rodando `\d tasks` / `\di idx_tasks_my_day`. Se faltar (banco antigo), aplicar via `scripts/setup_schemas.py` de dentro do container `makima-web` — **sem** nova migração de DDL nesta fatia (data-model §1)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: a camada de lógica única (capacity + funções de Meu Dia) — os dois canais são fachadas
sobre ela; nenhuma user story funciona sem isso.

**⚠️ CRITICAL**: nenhuma story de UI/Telegram começa antes desta fase terminar.

- [ ] T002 [P] Criar `agents/kaguya/capacity.py` — **função pura** `compute_capacity(estimativas, eventos, janela=(8,22)) -> dict` (data-model §3): `estimado_min` = soma de `duration_min` (None → 0); `agenda_min` = soma da duração de cada evento **recortada à janela**; `livre_min = max(0, janela_total - agenda_min)`; `folga_min = livre_min - estimado_min`; saída `{no_plano, estimado_min, agenda_min, livre_min, folga_min, excedeu: folga_min < 0}`. Sem acesso a banco/Calendar — recebe os dados prontos. Docstring Google-style + type hints
- [ ] T003 Criar `tests/agents/test_kaguya_capacity.py` (SC-001): soma de estimativas + agenda recortada à janela; `folga_min` negativa quando o plano excede a janela livre; evento fora da janela conta 0; lista vazia → tudo coerente. Rodar `.venv\Scripts\python -m pytest tests/agents/test_kaguya_capacity.py -q`
- [ ] T004 Estender `agents/kaguya/tools_tasks.py` com as funções de Meu Dia (data-model §4, contrato em `contracts/api-meudia.md`): `add_to_my_day(task_id, date=None)` (default hoje, fuso SP), `remove_from_my_day(task_id)` (`my_day_date=NULL`), `reschedule_pending(task_id, when)` (`when ∈ {today,tomorrow,later}`; `later`→NULL, nunca apaga), `set_estimate(task_id, duration_min)`, `set_time_block(task_id, start_at, end_at=None, duration_min=None)` (deriva `end_at` de `start_at + (duration_min or 30)`; valida a CHECK `end_at` exige `start_at` → erro amigável, nunca IntegrityError 500), `clear_time_block(task_id)`. Mutações retornam `{"status": ...}`. Recorrente: a nova ocorrência **não** herda `my_day_date`/`start_at`/`end_at` (edge case da spec)
- [ ] T005 Estender `update_task` em `agents/kaguya/tools_tasks.py:663` para aceitar **`duration_min`** (e, opcionalmente, `my_day_date`/`start_at`/`end_at` para edição direta), mantendo a semântica PATCH parcial atual — sem quebrar as assinaturas existentes (research: tools dedicadas para a semântica do ritual + `update_task` só para `duration_min`)
- [ ] T006 Implementar `list_my_day(date=None)` em `agents/kaguya/tools_tasks.py` (contrato `GET /my-day`): monta `{date, plano, pendencias_ontem, sugestoes, capacity}` — `plano` = `my_day_date == date` abertas (ordenar por `start_at` depois `position`); `pendencias_ontem` = `my_day_date < date` abertas; `sugestoes` = `due_date BETWEEN date AND date+7` fora do plano, abertas (régua ≤7 dias); `capacity` chama `capacity.compute_capacity` com os `duration_min` do plano + os eventos do dia lidos via `tools_calendar`. **Não** passa por `_check_result` (é listagem). Poucas queries, sem N+1
- [ ] T007 [P] Adicionar a leitura tolerante a falha do Calendar no caminho de `list_my_day`: embrulhar a chamada a `tools_calendar` em try/except → em falha, `agenda_min=0` e `capacity.calendar_ok=false` (FR-008/SC-005), nunca propagar exceção do MCP
- [ ] T008 Criar `tests/agents/test_kaguya_meudia.py` (integração contra Postgres de teste): `add_to_my_day`/`remove_from_my_day` mudam **só** `my_day_date` (SC-004); `reschedule_pending(id,"later")` → `my_day_date=NULL` e tarefa preservada (SC-004); `set_time_block(id, start_at, duration_min=30)` deriva `end_at` e respeita a CHECK (sem `start_at` → erro amigável, não 500 — SC-003); `list_my_day` separa `plano`/`pendencias_ontem`/`sugestoes` corretamente; `calendar_ok=false` quando o Calendar falha (SC-005). Rodar pytest

**Checkpoint**: motor de capacity e camada de lógica de Meu Dia completos e testados — US1, US2 e US3 podem começar (US1 e US3 em paralelo; US2 depende da fachada que a US3 também usa).

---

## Phase 3: User Story 1 - Montar o plano do dia com o ritual (Priority: P1) 🎯

**Goal**: a tela **Meu Dia** rica — pendências de ontem (Hoje/Amanhã/Depois), plano de hoje, sugestões
com "+ Puxar", quick-add — substituindo a `TodayScreen` MVP.

**Independent Test**: quickstart — marcar tarefas no Meu Dia de ontem, deixar uma aberta, abrir Meu Dia
hoje e ver "pendências de ontem"; aplicar Hoje/Amanhã/Depois; puxar uma sugestão; tudo só pelo webapp.

### Implementation for User Story 1

- [ ] T009 [US1] Estender os endpoints em `webapp/backend/routers/tasks.py` (contrato `api-meudia.md`, todas com `Depends(require_user)`): `GET /my-day?date=` (→ `list_my_day`, **sem** `_check_result`), `POST /{id}/my-day` (body opcional `{date}` → `add_to_my_day`), `DELETE /{id}/my-day` (→ `remove_from_my_day`), `POST /{id}/reschedule` (`{when}` → `reschedule_pending`); estender o body do `PATCH /{id}` para aceitar `duration_min`. Mutações com `_check_result` (→ 400 em erro)
- [ ] T010 [US1] Estender `webapp/frontend/src/pages/kaguya/types.ts` (campos `my_day_date`/`start_at`/`end_at`/`duration_min` na `Task` + tipo `MyDayResponse { date, plano, pendencias_ontem, sugestoes, capacity }`) e `kaguyaApi.ts` (`myDay(date)`, `addToMyDay(id,date?)`, `removeFromMyDay(id)`, `reschedule(id,when)`, `setEstimate(id,min)`)
- [ ] T011 [US1] Substituir `webapp/frontend/src/pages/kaguya/screens/TodayScreen.tsx` pela tela rica de Meu Dia (design-guide: layout `day-grid` 2 colunas; `< 860px` → 1 coluna): coluna esquerda com `DayHero` (eyebrow + data por extenso + 3 stats vindos de `capacity`), QuickAdd ("Adicionar ao dia…"), seção **No plano de hoje** e seção **Sugestões**; consome `GET /api/tasks/my-day`. Reusar tokens `.kg-app` e o `QuickAdd` existente
- [ ] T012 [P] [US1] Criar `components/DayHero.tsx` (eyebrow `Meu Dia · {greet()}`, título Hanken 800, 3 stats `dhm` mapeando `capacity`: no plano / estimado `fmtEst` / folga-ou-acima — verde com folga, vermelho-lacre `--p-high` com prefixo `+` quando excede; retrato `kaguya.jpg` à direita)
- [ ] T013 [P] [US1] Criar `components/ReviewCard.tsx` (pendências de ontem; só renderiza se houver): cabeçalho com contagem + cada card com check, título, meta ("venceu … · Lista") e 3 botões **Hoje**/**Amanhã**/**Depois** → `POST /{id}/reschedule {when}` (Depois = `later`, nunca apaga)
- [ ] T014 [P] [US1] Criar `components/PlanCard.tsx` (cartão do plano: traço de prioridade, check, glyph de tipo, título, chips de hora-do-bloco/lista, estimativa `pc-est`; clique abre TaskModal); na seção Sugestões, reusar o card sem drag, com `DateChip` + botão **"+ Puxar"** → `POST /{id}/my-day`
- [ ] T015 [US1] Validar quickstart US1 só pelo webapp (bot desligado): pendências de ontem com as 3 ações; "+ Puxar" das sugestões; `npm run build` sem erros

**Checkpoint**: o ritual de planejamento (revisão + seleção + sugestões) funciona ponta a ponta no webapp.

---

## Phase 4: User Story 2 - Planejar e consultar o Meu Dia pelo Telegram (Priority: P3 → antecipada p/ fechar paridade)

**Goal**: Kaguya planeja, estima e relata o capacity em texto — mesmo motor do webapp.

**Independent Test**: pelo Telegram montar o plano e estimar durações; pedir o resumo do dia e conferir
que o capacity bate com o webapp para o mesmo dia.

### Implementation for User Story 2

- [ ] T016 [US2] Estender a fachada do agente em `agents/kaguya/tools.py` (contrato §"Tools do agente"): `plan_my_day()`/`my_day_status()` → relato textual de `list_my_day(hoje)` (plano + capacity, ex.: "Plano de hoje: 5 tarefas · ~3h estimadas · 4h de agenda · folga de 1h"); `add_to_my_day(task_or_name, date?)` e `remove_from_my_day(task_or_name)` resolvendo por id **ou** nome (prefixo, como as outras tools); `set_estimate(task_or_name, minutes)`; `block_time(task_or_name, start_at, minutes?)` opcional
- [ ] T017 [US2] Atualizar `_INSTRUCTION` em `agents/kaguya/agent.py`: vocabulário de Meu Dia ("o que planejei pra hoje?", "põe X no meu dia", "estima 30min na Y", "tira do meu dia", "meu dia cabe?"), com eco da interpretação e relato de capacity em português; deixar claro que a timeline visual é webapp-only
- [ ] T018 [US2] Validar quickstart US2/paridade pelo Telegram (webapp desligado): "põe 'comprar café' no meu dia" reflete no plano; "meu dia cabe?" devolve total que bate com a CapacityBar do webapp (SC-002)

**Checkpoint**: paridade fechada — selecionar/estimar/ler o plano funcionam nos dois canais, cada um com o outro desligado.

---

## Phase 5: User Story 3 - Ver se o dia cabe e bloquear horários (Priority: P2)

**Goal**: CapacityBar + DayTimeline com time-blocking por drag; o bloco aparece também na view
Calendário (013).

**Independent Test**: com eventos no Calendar ~4h e tarefas estimadas ~6h, conferir o estouro na
CapacityBar; arrastar uma tarefa para as 14h → `start_at=14:00` + `end_at` derivado, e o bloco na view
Calendário daquele dia.

### Implementation for User Story 3

- [ ] T019 [US3] Estender `webapp/backend/routers/tasks.py` com `POST /{id}/time-block` (body `{start_at, end_at?, duration_min?}` → `set_time_block`; deriva `end_at` quando ausente; valida a CHECK) e `DELETE /{id}/time-block` (→ `clear_time_block`). Mutações com `_check_result`
- [ ] T020 [US3] Estender `kaguyaApi.ts` (`setTimeBlock(id, {start_at, end_at?, duration_min?})`, `clearTimeBlock(id)`) e marcar os `PlanCard` do plano como `draggable` (`onDragStart` põe o id no `dataTransfer`)
- [ ] T021 [P] [US3] Criar `components/CapacityBar.tsx` (design-guide): título "Cabe no seu dia?", números "Xh de tarefas + Yh de agenda · livre Z / passou W", track segmentado agenda + tarefas (`--kg`) + excedeu (`--p-high`), marcador no 100% (janela 8h–22h); alimentado pelo objeto `capacity` (não recalcular no front além das larguras); `calendar_ok:false` → nota "agenda indisponível" + `agenda_min=0`
- [ ] T022 [US3] Criar `components/DayTimeline.tsx` (design-guide): régua 07h–23h (`DAY_START=7`/`DAY_END=23`), cada hora é dropzone (`drop-ok` no hover); renderizar eventos do Calendar e tarefas com bloco por `top`/`height` proporcionais ao minuto/duração; soltar uma tarefa numa hora → `POST /{id}/time-block {start_at}` (estimativa vira a altura; sem estimativa → bloco 30min); clique num bloco de tarefa abre TaskModal. Encaixar CapacityBar + DayTimeline na **coluna direita sticky** da TodayScreen
- [ ] T023 [US3] Garantir que o bloco gravado aparece na view Calendário (semana) da 013 — `CalendarScreen.tsx` já lê tarefas datadas; conferir que `start_at`/`end_at` entram na projeção do dia/horário; remover o horário (`DELETE /time-block`) tira da timeline e mantém no plano
- [ ] T024 [US3] Validar quickstart US3: estouro na CapacityBar com ~4h de agenda + ~6h de tarefas; drag de tarefa de 30min para 14h → `start_at=14:00`/`end_at=14:30` (SC-003); bloco visível no Calendário; degradação com Calendar offline (SC-005)

**Checkpoint**: tarefas + agenda sob o mesmo teto — o diferencial da fatia provado.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T025 [P] Atualizar `agents/kaguya/CLAUDE.md`: documentar as tools novas de Meu Dia (`add_to_my_day`/`remove_from_my_day`/`reschedule_pending`/`set_estimate`/`set_time_block`/`clear_time_block`/`list_my_day`), o motor `capacity.py` e o relato textual no Telegram
- [ ] T026 [P] Atualizar `CLAUDE.md` raiz (árvore de arquivos da Kaguya: `capacity.py`; nota da Fase 3 do sistema de tarefas) e o `PLAN.md` se a tabela de fases mencionar Meu Dia
- [ ] T027 Rodar a validação completa do `quickstart.md` (motor puro + camada de lógica + paridade + degradação do Calendar) e a suíte pytest inteira; registrar resultados no checklist da spec
- [ ] T028 Refletir a fatia no vault do Obsidian (skill `obsidian-vault`): nova tela Meu Dia, time-blocking, capacity cruzando Calendar

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)** → **Foundational (P2)** → bloqueia tudo.
- **US1 (webapp ritual)** depende da Foundational (T004/T006/T009). **US3 (capacity/timeline)** depende
  da Foundational + da TodayScreen da US1 (coluna direita encaixa na tela da US1). **US2 (Telegram)**
  depende só da Foundational + da fachada (T016) — independente da UI; pode rodar em paralelo com US1.
- **Polish** depende de todas.

### Parallel Opportunities

- T002 (capacity puro) ∥ T004 (camada de lógica) — arquivos distintos.
- US1 ∥ US2 (frontend/router × agente/fachada — sem arquivos em comum após a Foundational).
- Dentro da US1: T012 ∥ T013 ∥ T014 (componentes distintos).
- T021 ∥ T022 dentro da US3 (componentes distintos, antes de encaixar na tela).
- T025 ∥ T026 no Polish.

## Implementation Strategy

**Incremental com paridade**: Setup + Foundational (capacity puro + camada de lógica + `list_my_day`
tolerante a falha) → US1 (a tela rica, valor imediato) e US2 (paridade Telegram) em paralelo → US3
(capacity/timeline visual, o diferencial) → Polish. Cada checkpoint é deployável. O critério SC-001
(capacity bate com verificação manual) já é exercitável no fim da Foundational.

**Total**: 28 tasks — Setup 1 · Foundational 7 · US1 7 · US2 3 · US3 6 · Polish 4.
