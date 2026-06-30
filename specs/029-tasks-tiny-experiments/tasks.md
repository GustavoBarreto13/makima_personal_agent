---
description: "Task list — Tiny Experiments (Kaguya)"
---

# Tasks: Tiny Experiments (Kaguya)

**Input**: Design documents from `specs/029-tasks-tiny-experiments/`

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Tests**: Apenas o **motor puro de aderência** tem gate de teste (convenção do projeto, espelhando
`tests/agents/test_kaguya_habit_strength.py`). O resto é validado via `quickstart.md` (manual).

**Organization**: tarefas agrupadas por user story (US1 P1 · US2 P2 · US3 P2). Webapp-first —
**nenhuma** tool registrada no agente ADK nesta fatia (D6).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivo diferente, sem dependência pendente)
- **[Story]**: US1 / US2 / US3 (fases de história); Setup/Foundational/Polish sem label

## Path Conventions

Monorepo existente. Backend de lógica: `agents/kaguya/`. REST: `webapp/backend/routers/`.
Frontend: `webapp/frontend/src/pages/kaguya/`. Testes: `tests/agents/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: orientação; o projeto já existe (sem novas dependências).

- [ ] T001 Confirmar pontos de integração e ausência de novas dependências: `DATABASE_URL` ativo, schema aplicado por `scripts/setup_schemas.py`, e os arquivos-alvo existentes (`agents/kaguya/schema_tasks_pg.sql`, `agents/kaguya/tools.py`, `webapp/backend/routers/tasks.py`, `webapp/frontend/src/pages/kaguya/{KaguyaShell.tsx,kaguyaApi.ts,types.ts,kaguya.css,components/SidebarNav.tsx,screens/TodayScreen.tsx}`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schema, motor puro e scaffolding que TODAS as histórias usam.

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase.

- [ ] T002 Adicionar as 2 tabelas idempotentes (`tiny_experiments`, `tiny_experiment_logs`) + índice parcial `idx_tiny_experiments_open` ao final de `agents/kaguya/schema_tasks_pg.sql`, conforme `data-model.md` (CHECKs de `cadence`/`status`/`verdict`/`feeling`, `end_date >= start_date`, `UNIQUE(experiment_id, period_date)`, `ON DELETE CASCADE`)
- [ ] T003 [P] Criar o motor PURO de aderência `agents/kaguya/experiment_adherence.py` (sem banco): cálculo `periods_done/periods_expected → adherence_pct`, normalização de período (diária=dia; semanal=segunda via ISODOW), desconto de períodos pausados (D1/D4), `days_remaining`/`is_overdue`
- [ ] T004 [P] Criar o gate pytest `tests/agents/test_kaguya_experiment_adherence.py` cobrindo: 3/4 ⇒ 75%; 6/7 ⇒ 86% (falha isolada não zera); cadência semanal (1/semana, segunda); períodos pausados fora de `periods_expected`; `periods_expected` capado em `min(hoje,end)`
- [ ] T005 Criar `agents/kaguya/tools_experiments.py` com o scaffolding: imports de `agents.db` (`get_conn`, `run_select`), helper `_serialize_experiment(row)` (datas→"YYYY-MM-DD", timestamps→ISO; espelho de `_serialize_task`), helper `_period_date(d, cadence)` (segunda da semana p/ semanal), sentinela `_UNSET` e constantes de validação
- [ ] T006 Em `agents/kaguya/tools.py`, re-exportar (stub) as funções de `tools_experiments` e deixar comentário marcando o ponto de exposição futura ao agente ADK (D6 — **não** registrar em `agent.py` nesta fatia)
- [ ] T007 [P] Frontend: em `webapp/frontend/src/pages/kaguya/types.ts`, adicionar `'experiments'` ao union `KaguyaView` e as interfaces `Experiment` e `ExperimentLog` (espelho de `data-model.md`, datas como `string`)
- [ ] T008 [P] Frontend: em `webapp/frontend/src/pages/kaguya/kaguya.css`, adicionar as classes base `.kg-exp-*` (cards, barra de aderência, tracker) usando os tokens `--kg*` existentes
- [ ] T009 Frontend: registrar a aba na navegação — item "Experimentos" (🧪) em `components/SidebarNav.tsx` chamando `onNavigate('experiments')`, e em `KaguyaShell.tsx` adicionar o branch `view === 'experiments'` no `renderMain()` (placeholder por ora), a entrada `experiments: 'Experimentos'` no `titleMap` e o estado do `ExperimentModal`

**Checkpoint**: aba aparece (vazia), schema pronto, motor de aderência testado e verde.

---

## Phase 3: User Story 1 - Criar e acompanhar com check-ins (Priority: P1) 🎯 MVP

**Goal**: criar um experimento e acompanhá-lo com check-ins periódicos (fez? / sensação / nota),
com aderência que perdoa falhas; gerenciar o ciclo (pausar/retomar, editar, excluir).

**Independent Test**: criar experimento (fórmula + datas + cadência), registrar 2 check-ins
(um "fez", um "não fez", com sensação/nota), conferir histórico e `adherence_pct`; reexecutar o
check-in de hoje e confirmar upsert (sem duplicar); pausar e retomar.

### Implementation for User Story 1

Backend — lógica (`agents/kaguya/tools_experiments.py`, mesmo arquivo ⇒ sequencial):

- [ ] T010 [US1] `create_experiment(title, start_date, end_date, why=None, hypothesis=None, cadence='daily')` — valida `end_date>=start_date` e cadência; retorna `{"status","id"}`
- [ ] T011 [US1] `list_experiments(include_completed=False)` e `get_experiment(id)` — anexam os campos derivados via `experiment_adherence.py`; `get_experiment` inclui `logs` ordenados; "hoje" em UTC-3
- [ ] T012 [US1] `update_experiment(id, **campos)` (sentinela `_UNSET`) e `delete_experiment(id)` (hard delete; CASCADE cuida dos logs — D3)
- [ ] T013 [US1] `log_experiment(id, period_date, done, feeling=None, note=None)` — **upsert** `ON CONFLICT (experiment_id, period_date)`; backfill aceito dentro de `[start,end]`; e `remove_log(id, period_date)`
- [ ] T014 [US1] `pause_experiment(id)` / `resume_experiment(id)` — transições `active ⇄ paused`; grava `paused_at` e acumula `paused_period_days` no resume (D4); erros amigáveis se estado inválido

Backend — REST (`webapp/backend/routers/tasks.py`, mesmo arquivo ⇒ sequencial):

- [ ] T015 [US1] Modelos Pydantic `CreateExperimentBody`, `UpdateExperimentBody`, `LogExperimentBody` (ver `contracts/api-experiments.md`)
- [ ] T016 [US1] Endpoints US1 com `Depends(require_user)`: `POST /experiments` (201), `GET /experiments`, `GET /experiments/{id}`, `PATCH /experiments/{id}`, `DELETE /experiments/{id}`, `POST /experiments/{id}/log`, `DELETE /experiments/{id}/log`, `POST /experiments/{id}/pause`, `POST /experiments/{id}/resume` — `_check_result` só nas mutações

Frontend (arquivos distintos ⇒ vários [P], dependem de T007/T009):

- [ ] T017 [US1] Em `kaguyaApi.ts`, adicionar o sub-objeto `experiments` com `list/get/create/update/del/log/removeLog/pause/resume` (via `api.*`)
- [ ] T018 [P] [US1] `screens/ExperimentsScreen.tsx` — lista de cards dos ativos (fórmula, prazo, barra de aderência, botão de check-in rápido de hoje quando `logged_current=false`); card → `navigate('experiments', id)`
- [ ] T019 [P] [US1] `modals/ExperimentModal.tsx` — criar/editar (título/fórmula, why/hipótese opcionais, cadência, datas com `DatePicker`)
- [ ] T020 [P] [US1] `screens/ExperimentDetailScreen.tsx` — tracker (tabela de logs por período: fez?/sensação/nota, com **backfill**/edição), botões **pausar/retomar**; padrão de carregamento silencioso (`firstLoad` ref)
- [ ] T021 [US1] Ligar tudo na `KaguyaShell.tsx`: `renderMain('experiments')` mostra `ExperimentsScreen` quando `param==null` e `ExperimentDetailScreen` quando `param!=null`; abrir/fechar `ExperimentModal`

**Checkpoint**: US1 funcional e testável de ponta a ponta (criar → check-in → aderência → pausar/retomar). MVP entregável.

---

## Phase 4: User Story 2 - Encerrar com revisão e veredicto (Priority: P2)

**Goal**: encerrar o experimento com aprendizado + veredicto (persistir/pausar/pivotar);
separar concluídos dos ativos, preservando histórico.

**Independent Test**: num experimento ativo, abrir a revisão, escrever aprendizado, escolher
"pivotar", confirmar; verificar que sai dos ativos e aparece em concluídos com veredicto e texto.

### Implementation for User Story 2

- [ ] T022 [US2] Backend lógica: `review_experiment(id, verdict, review)` em `agents/kaguya/tools_experiments.py` — grava `verdict`+`review`, seta `status='completed'` (fecha intervalo de pausa em aberto antes da aderência final); permite encerramento antecipado; erro se já concluído
- [ ] T023 [US2] Backend REST: `ReviewExperimentBody` + `POST /experiments/{id}/review` em `webapp/backend/routers/tasks.py` (`Depends(require_user)`, `_check_result`)
- [ ] T024 [US2] Frontend: `experiments.review(id, body)` em `kaguyaApi.ts`
- [ ] T025 [US2] Frontend: formulário de **Revisão** (veredicto + aprendizado) em `screens/ExperimentDetailScreen.tsx`; seção/aba de **concluídos** em `screens/ExperimentsScreen.tsx` (usa `include_completed=true`)

**Checkpoint**: US1 e US2 funcionam independentemente; o ciclo do experimento fecha na reflexão.

---

## Phase 5: User Story 3 - Lembrar no "Meu Dia" (Priority: P2)

**Goal**: experimentos ativos do dia aparecem no ritual "Meu Dia" com check-in de 1 toque.

**Independent Test**: com um experimento ativo de cadência diária sem check-in hoje, abrir "Meu
Dia" e vê-lo; registrar o check-in por ali e confirmar que some; pausado/concluído/fora do
período não aparecem.

### Implementation for User Story 3

- [ ] T026 [US3] Backend lógica: `list_experiments_due_today()` em `agents/kaguya/tools_experiments.py` — ativos cuja cadência cai hoje (diária sempre; semanal se sem check-in na semana corrente) e **sem** check-in no período; payload mínimo (id, title, cadence); exclui pausados/concluídos/fora do intervalo (FR-013/FR-014)
- [ ] T027 [US3] Backend REST: `GET /experiments/due-today` em `webapp/backend/routers/tasks.py` — **registrar antes** da rota `/{id}` (evitar captura paramétrica)
- [ ] T028 [US3] Frontend: `experiments.dueToday()` em `kaguyaApi.ts`
- [ ] T029 [US3] Frontend: seção "Experimentos de hoje" em `screens/TodayScreen.tsx` — busca `dueToday` no mount, check-in de 1 toque (reusa `experiments.log`), recarrega e some após registrado (abordagem desacoplada; não altera o motor de `capacity`/`plan_my_day`)

**Checkpoint**: as 3 histórias funcionam de forma independente.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T030 [P] Documentar a fatia em `agents/kaguya/CLAUDE.md` (nova seção de experimentos + tools) e em `webapp/CLAUDE.md` (endpoints `/api/tasks/experiments/*` + aba)
- [ ] T031 [P] Rodar `python -m doctest`/`pytest` do motor puro e revisar comentários em pt-BR (padrão do usuário) nos arquivos novos
- [ ] T032 Rodar a validação completa do `quickstart.md` (pytest → lógica → REST → UI) e registrar evidências
- [ ] T033 Deploy (quando solicitado): aplicar o schema dentro do container `makima-web` (hostname do Postgres só resolve lá) antes de subir a imagem; conferir `\d tiny_experiments`/`\d tiny_experiment_logs`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup — **bloqueia** todas as histórias.
- **User Stories (Phase 3–5)**: dependem da Foundational. US1 é o MVP; US2 e US3 podem vir em
  paralelo após US1 (ambas tocam arquivos parcialmente compartilhados — ver abaixo).
- **Polish (Phase 6)**: depende das histórias desejadas concluídas.

### User Story Dependencies

- **US1 (P1)**: começa após Foundational. Independente.
- **US2 (P2)**: após Foundational. Reusa `ExperimentDetailScreen`/`ExperimentsScreen` (US1) — melhor após US1.
- **US3 (P2)**: após Foundational. Independente de US2; toca `TodayScreen` (arquivo próprio).

### Within Each User Story

- Lógica antes do REST antes do frontend. Funções no mesmo arquivo (`tools_experiments.py`,
  `tasks.py`, `kaguyaApi.ts`) são **sequenciais** (não [P]); telas/modais em arquivos distintos são [P].

### Parallel Opportunities

- Foundational: T003 (engine) e T004 (teste) podem casar; T007/T008 (types/css) são [P] entre si.
- US1: T018/T019/T020 (telas/modal — arquivos distintos) são [P] após T017.
- US2 e US3 podem ser tocadas em paralelo por pessoas diferentes após US1 (US3 isola-se em `TodayScreen.tsx`).

---

## Parallel Example: User Story 1 (frontend)

```text
# Após T017 (kaguyaApi), em paralelo (arquivos distintos):
Task T018: ExperimentsScreen.tsx (lista + check-in rápido)
Task T019: ExperimentModal.tsx (criar/editar)
Task T020: ExperimentDetailScreen.tsx (tracker + pausar/retomar)
# T021 (KaguyaShell wiring) entra depois, pois integra as três.
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 (Setup) → 2. Phase 2 (Foundational — schema + motor + scaffolding) →
3. Phase 3 (US1) → **PARAR e VALIDAR**: criar/checar/pausar um experimento de ponta a ponta →
demo/deploy se pronto.

### Incremental Delivery

Foundational → **US1 (MVP)** → US2 (revisão) → US3 (Meu Dia). Cada história agrega valor sem
quebrar a anterior. Deploy do schema no container `makima-web` antes de subir a imagem.

---

## Notes

- [P] = arquivos distintos, sem dependência pendente. Funções no mesmo módulo são sequenciais.
- Comentários em pt-BR detalhados (padrão do usuário) em todo código novo.
- `goal_id` (vínculo com a spec 030 de Metas) **não** entra aqui — será adicionado pela 030 (D5).
- Commits só quando o usuário pedir (regra do usuário). Sem criação de branch automática.
- Validar o gate puro (T004) **antes** de seguir para a lógica que o consome.
