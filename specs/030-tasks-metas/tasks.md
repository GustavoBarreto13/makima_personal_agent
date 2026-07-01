---
description: "Task list — Metas (Kaguya)"
---

# Tasks: Metas (Kaguya)

**Input**: Design documents from `specs/030-tasks-metas/`

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Tests**: Apenas o **motor puro de progresso** tem gate de teste (convenção do projeto, espelhando
`tests/agents/test_kaguya_experiment_adherence.py`). O resto é validado via `quickstart.md` (manual).

**Organization**: tarefas agrupadas por user story (US1 P1 · US2 P1 · US3 P2). Webapp-first —
**nenhuma** tool registrada no agente ADK nesta fatia (D8).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivo diferente, sem dependência pendente)
- **[Story]**: US1 / US2 / US3 (fases de história); Setup/Foundational/Polish sem label

## Path Conventions

Monorepo existente. Backend de lógica: `agents/kaguya/`. REST: `webapp/backend/routers/`.
Frontend: `webapp/frontend/src/pages/kaguya/`. Testes: `tests/agents/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: orientação; o projeto já existe (sem novas dependências).

- [X] T001 Confirmar pontos de integração e ausência de novas dependências: `DATABASE_URL` ativo, schema aplicado por `scripts/setup_schemas.py` (029 já aplicada), e os arquivos-alvo existentes (`agents/kaguya/schema_tasks_pg.sql`, `agents/kaguya/tools.py`, `webapp/backend/routers/tasks.py`, `webapp/frontend/src/pages/kaguya/{KaguyaShell.tsx,kaguyaApi.ts,types.ts,kaguya.css,ui/Icons.tsx,components/SidebarNav.tsx,modals/ExperimentModal.tsx}`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schema, motor puro e scaffolding que TODAS as histórias usam.

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase.

- [X] T002 Adicionar ao final de `agents/kaguya/schema_tasks_pg.sql`, conforme `data-model.md`: as 2 tabelas idempotentes (`goals` com CHECKs de `status`/`outcome`; `goal_milestones` com `ON DELETE CASCADE`), o índice parcial `idx_goals_active`, o índice `idx_goal_milestones_goal`, e — na seção de migrações — os `ALTER TABLE ... ADD COLUMN IF NOT EXISTS goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL` em `tiny_experiments` (gancho D5 da 029), `tasks` e `habits`, com os índices parciais `idx_*_goal` (as tabelas `goals`/`goal_milestones` devem ser criadas ANTES dos ALTER)
- [X] T003 [P] Criar o motor PURO de progresso `agents/kaguya/goal_progress.py` (sem banco): `metric_pct` (`min(100, round(100*atual/alvo))` com alvo>0, senão `None`), `milestones_pct` (`round(100*done/total)` ou `None`), `progress_pct` (média das dimensões presentes; `None` se nenhuma — D2), `days_remaining`/`is_overdue` (UTC-3)
- [X] T004 [P] Criar o gate pytest `tests/agents/test_kaguya_goal_progress.py` cobrindo: só métrica 3/12 ⇒ 25%; só marcos 1/3 ⇒ 33%; métrica+marcos ⇒ média (25 e 33 ⇒ 29); sem métrica e sem marcos ⇒ `progress_pct is None`; valor acima do alvo (15/12) ⇒ 100 (satura); `is_overdue`/`days_remaining`
- [X] T005 Criar `agents/kaguya/tools_goals.py` com o scaffolding: imports de `agents.db` (`get_conn`, `run_select`) e do motor `goal_progress`, helper `_today()` (UTC-3), `_serialize_goal(row, ...)` e `_serialize_milestone(row)` (datas→"YYYY-MM-DD", timestamps→ISO; espelho de `_serialize_experiment`), sentinela `_UNSET`, constantes de validação (`_VALID_STATUS`, `_VALID_OUTCOMES`, `_VALID_ITEM_TYPES`) e a lista de colunas `_GOAL_FIELDS`
- [X] T006 Em `agents/kaguya/tools.py`, re-exportar (stub) as funções de `tools_goals` e deixar comentário marcando o ponto de exposição futura ao agente ADK (D8 — **não** registrar em `agent.py` nesta fatia)
- [X] T007 [P] Frontend: em `webapp/frontend/src/pages/kaguya/types.ts`, adicionar `'goals'` ao union `KaguyaView` e as interfaces `Goal`, `Milestone`, `GoalMovements` (grupos experiments/tasks/habits com status mínimo) e `GoalAreaCount`/`LinkableItem` (espelho de `data-model.md`/`contracts`, datas como `string`)
- [X] T008 [P] Frontend: em `webapp/frontend/src/pages/kaguya/kaguya.css`, adicionar as classes base `.kg-goal-*` (cards, barra de progresso, seção de movimentos, grupos por área) usando os tokens `--kg*` existentes
- [X] T009 Frontend: registrar a aba na navegação — ícone `target` (🎯) em `ui/Icons.tsx`, item "Metas" em `components/SidebarNav.tsx` (`FIXED_VIEWS`) chamando `onNavigate('goals')`, e em `KaguyaShell.tsx` o branch `view === 'goals'` no `renderMain()` (placeholder por ora), a entrada `goals: 'Metas'` no `titleMap` e o estado do `GoalModal`

**Checkpoint**: aba aparece (vazia), schema pronto, motor de progresso testado e verde.

---

## Phase 3: User Story 1 - Definir uma meta e acompanhar seu progresso (Priority: P1) 🎯 MVP

**Goal**: criar uma meta (título + prazo + porquê + área opcional + métrica e/ou marcos) e
acompanhar um progresso que combina métrica (atual/alvo) e marcos (concluídos/total); editar,
excluir, e ver a contagem de metas ativas por área.

**Independent Test**: criar uma meta com título, porquê, prazo e métrica-alvo; atualizar o valor
atual; adicionar dois marcos e concluir um; confirmar que a barra de progresso reflete métrica e
marcos; excluir e confirmar a confirmação.

### Implementation for User Story 1

Backend — lógica (`agents/kaguya/tools_goals.py`, mesmo arquivo ⇒ sequencial):

- [X] T010 [US1] `create_goal(title, deadline, why=None, life_area=None, metric_target=None, metric_unit=None, anti_goals=None, accountability=None)` — valida `deadline` e `title`; retorna `{"status","id"}`
- [X] T011 [US1] `list_goals(include_completed=False)` e `get_goal(id)` — anexam os campos derivados via `goal_progress.py`; `get_goal` inclui `milestones` ordenados (movements entram na US2); "hoje" em UTC-3
- [X] T012 [US1] `update_goal(id, **campos)` (sentinela `_UNSET`; inclui `metric_current` — FR-005) — revalida `deadline`; retorna status
- [X] T013 [US1] `delete_goal(id)` — hard delete; marcos por CASCADE, itens vinculados por `ON DELETE SET NULL` (D4/SC-005)
- [X] T014 [US1] `add_milestone(id, title)`, `update_milestone(milestone_id, title=_UNSET, done=_UNSET)` (concluir/reabrir — FR-005) e `delete_milestone(milestone_id)`
- [X] T015 [US1] `list_goal_areas()` — contagem de metas **ativas** por `life_area` (metas sem área → `null`), para o SC-006

Backend — REST (`webapp/backend/routers/tasks.py`, mesmo arquivo ⇒ sequencial):

- [X] T016 [US1] Modelos Pydantic `CreateGoalBody`, `UpdateGoalBody`, `AddMilestoneBody`, `UpdateMilestoneBody` (ver `contracts/api-goals.md`)
- [X] T017 [US1] Endpoints US1 com `Depends(require_user)`: `POST /goals` (201), `GET /goals`, `GET /goals/areas`, `GET /goals/{id}`, `PATCH /goals/{id}`, `DELETE /goals/{id}`, `POST /goals/{id}/milestones`, `PATCH /goals/{id}/milestones/{mid}`, `DELETE /goals/{id}/milestones/{mid}` — **rotas estáticas antes** da paramétrica `/{id}`; `_check_result` só nas mutações

Frontend (arquivos distintos ⇒ vários [P], dependem de T007/T009):

- [X] T018 [US1] Em `kaguyaApi.ts`, adicionar o sub-objeto `goals` com `list/get/create/update/del/addMilestone/updateMilestone/delMilestone/areas` (via `api.*`)
- [X] T019 [P] [US1] `screens/GoalsScreen.tsx` — lista de metas ativas **agrupadas por área** (com contagem — SC-006), cada card com barra de progresso combinada e prazo; card → `navigate('goals', id)`; botão "Nova meta"
- [X] T020 [P] [US1] `modals/GoalModal.tsx` — criar/editar (título, why/área/anti-metas/accountability opcionais, métrica-alvo+unidade, prazo com `DatePicker`); excluir com confirmação na edição
- [X] T021 [P] [US1] `screens/GoalDetailScreen.tsx` — cabeçalho + barra de progresso; edição do **valor da métrica**; CRUD de **marcos** (adicionar/concluir/reabrir/remover); padrão de carregamento silencioso (`firstLoad` ref)
- [X] T022 [US1] Ligar tudo na `KaguyaShell.tsx`: `renderMain('goals')` mostra `GoalsScreen` quando `param==null` e `GoalDetailScreen` quando `param!=null`; abrir/fechar `GoalModal`

**Checkpoint**: US1 funcional e testável de ponta a ponta (criar → métrica/marcos → progresso → excluir). MVP entregável.

---

## Phase 4: User Story 2 - Vincular experimentos, tarefas e hábitos como o "plano" (Priority: P1)

**Goal**: vincular/desvincular experimentos, tarefas e hábitos a uma meta; vê-los agrupados por
tipo com seu status; criar um experimento já vinculado a partir do contexto da meta.

**Independent Test**: em uma meta, vincular um experimento, uma tarefa e um hábito; confirmar que
aparecem agrupados no detalhe com status; desvincular um e confirmar que some da meta mas continua
existindo na sua seção.

### Implementation for User Story 2

- [X] T023 [US2] Backend lógica: `link_movement(goal_id, item_type, item_id)` e `unlink_movement(item_type, item_id)` em `agents/kaguya/tools_goals.py` — setam/limpam a coluna `goal_id` na tabela do item (`tiny_experiments`/`tasks`/`habits`); validam item vivo/ativo; reatribuição sobrescreve (cardinalidade D1)
- [X] T024 [US2] Backend lógica: estender `get_goal` com `movements` agrupados por tipo (experiments com `status`+`adherence_pct` via motor 029; tasks com aberta/concluída; habits com `consistency`) filtrando itens vivos/ativos (edge case arquivado); e `list_linkable_items(item_type)` (itens vinculáveis + `linked_goal_id`)
- [X] T025 [US2] Backend REST: `LinkMovementBody`/`UnlinkMovementBody` + `POST /goals/{id}/link`, `POST /goals/{id}/unlink`, `GET /goals/linkable?item_type=<...>` em `webapp/backend/routers/tasks.py` (`/goals/linkable` **antes** de `/goals/{id}`; `_check_result` nas mutações)
- [X] T026 [US2] Frontend: `goals.link/unlink/linkable` em `kaguyaApi.ts`
- [X] T027 [US2] Frontend: seção **"Movimentos"** em `screens/GoalDetailScreen.tsx` — itens agrupados por tipo com status; seletor de vínculo (escolher tipo → item → confirmar, ≤2 passos — SC-002); botão de desvincular
- [X] T028 [US2] Frontend: criar experimento **já vinculado** (FR-011) — `modals/ExperimentModal.tsx` aceita `goalId` opcional e, após criar, chama `goals.link(goalId, 'experiment', id)`; `GoalDetailScreen` oferece "Novo experimento" abrindo o modal com o `goalId` da meta (via `KaguyaShell`)

**Checkpoint**: US1 e US2 funcionam; a meta mostra seus movimentos e nasce o vínculo pedido com a 029.

---

## Phase 5: User Story 3 - Revisar e encerrar uma meta com um veredicto (Priority: P2)

**Goal**: encerrar a meta com um aprendizado + desfecho (atingida/não atingida/revisar); separar
ativas de encerradas, preservando histórico e vínculos.

**Independent Test**: numa meta ativa, abrir a revisão, escrever aprendizado, escolher "atingida",
confirmar; verificar que sai das ativas e aparece em encerradas com desfecho, aprendizado e os
vínculos históricos preservados.

### Implementation for User Story 3

- [X] T029 [US3] Backend lógica: `review_goal(id, outcome, review)` em `agents/kaguya/tools_goals.py` — grava `outcome`+`review`, seta `status='closed'`; permite encerramento antecipado; erro se já encerrada. Os `goal_id` dos itens **permanecem** (vínculos históricos — D5)
- [X] T030 [US3] Backend REST: `ReviewGoalBody` + `POST /goals/{id}/review` em `webapp/backend/routers/tasks.py` (`Depends(require_user)`, `_check_result`)
- [X] T031 [US3] Frontend: `goals.review(id, body)` em `kaguyaApi.ts`
- [X] T032 [US3] Frontend: formulário de **Revisão** (desfecho + aprendizado) em `screens/GoalDetailScreen.tsx`; seção de **encerradas** em `screens/GoalsScreen.tsx` (usa `include_completed=true`), com o desfecho e os movimentos históricos visíveis

**Checkpoint**: as 3 histórias funcionam de forma independente; o ciclo da meta fecha na revisão.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T033 [P] Documentar a fatia em `agents/kaguya/CLAUDE.md` (nova seção de metas + tools + coluna `goal_id`) e em `webapp/CLAUDE.md` (endpoints `/api/tasks/goals/*` + aba)
- [X] T034 [P] Rodar `python -m doctest`/`pytest` do motor puro e revisar comentários em pt-BR (padrão do usuário) nos arquivos novos
- [ ] T035 Rodar a validação completa do `quickstart.md` (pytest → lógica → REST → UI) e registrar evidências
  - ✅ **pytest**: gate puro verde (15 testes em `test_kaguya_goal_progress.py`) + doctests do motor OK; type-check do frontend limpo nos arquivos novos.
  - ⏳ **lógica/REST/UI**: exigem PostgreSQL ativo (`DATABASE_URL`) + `.venv` com FastAPI e cookie de sessão — **não disponíveis neste ambiente**; rodar localmente/no VPS conforme o `quickstart.md`. **Aplicar o schema** (`python -m scripts.setup_schemas`) antes — cria `goals`/`goal_milestones` + as colunas `goal_id`.
- [ ] T036 Deploy (quando solicitado): aplicar o schema dentro do container `makima-web` (hostname do Postgres só resolve lá) antes de subir a imagem; conferir `\d goals`, `\d goal_milestones` e a coluna `goal_id` em `\d tiny_experiments`/`\d tasks`/`\d habits`
  - ⏳ **Adiado até o usuário solicitar** (regra do projeto: deploy só quando pedido).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup — **bloqueia** todas as histórias.
- **User Stories (Phase 3–5)**: dependem da Foundational. US1 é o MVP; US2 reusa o
  `GoalDetailScreen` (US1) — melhor após US1; US3 também estende as telas da US1.
- **Polish (Phase 6)**: depende das histórias desejadas concluídas.

### User Story Dependencies

- **US1 (P1)**: começa após Foundational. Independente.
- **US2 (P1)**: após Foundational. Estende `GoalDetailScreen`/`get_goal` (US1) — melhor após US1.
- **US3 (P2)**: após Foundational. Estende `GoalDetailScreen`/`GoalsScreen` (US1) — melhor após US1.

### Within Each User Story

- Lógica antes do REST antes do frontend. Funções no mesmo arquivo (`tools_goals.py`, `tasks.py`,
  `kaguyaApi.ts`) são **sequenciais** (não [P]); telas/modais em arquivos distintos são [P].

### Parallel Opportunities

- Foundational: T003 (engine) e T004 (teste) podem casar; T007/T008 (types/css) são [P] entre si.
- US1: T019/T020/T021 (telas/modal — arquivos distintos) são [P] após T018.

---

## Parallel Example: User Story 1 (frontend)

```text
# Após T018 (kaguyaApi), em paralelo (arquivos distintos):
Task T019: GoalsScreen.tsx (lista por área + progresso)
Task T020: GoalModal.tsx (criar/editar)
Task T021: GoalDetailScreen.tsx (métrica + marcos)
# T022 (KaguyaShell wiring) entra depois, pois integra as três.
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 (Setup) → 2. Phase 2 (Foundational — schema + motor + scaffolding) →
3. Phase 3 (US1) → **PARAR e VALIDAR**: criar/medir/marcar uma meta de ponta a ponta →
demo/deploy se pronto.

### Incremental Delivery

Foundational → **US1 (MVP)** → US2 (vínculos) → US3 (revisão). Cada história agrega valor sem
quebrar a anterior. Deploy do schema no container `makima-web` antes de subir a imagem.

---

## Notes

- [P] = arquivos distintos, sem dependência pendente. Funções no mesmo módulo são sequenciais.
- Comentários em pt-BR detalhados (padrão do usuário) em todo código novo.
- O vínculo é a coluna `goal_id` (FK `ON DELETE SET NULL`) — excluir a meta **desvincula**, nunca
  apaga os itens (D1/D4/SC-005). A 029 **não muda** (só ganha a coluna via migração idempotente — D7).
- Commits só quando o usuário pedir (regra do usuário). Sem criação de branch automática.
- Validar o gate puro (T004) **antes** de seguir para a lógica que o consome.
