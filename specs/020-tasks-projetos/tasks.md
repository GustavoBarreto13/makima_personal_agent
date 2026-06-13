# Tasks: Planejamento de Projetos na Kaguya

**Input**: Design documents from `/specs/020-tasks-projetos/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, design-guide.md, contracts/,
quickstart.md

**Tests**: incluídos onde a spec exige verificação automatizada (SC-004 cálculo de saúde) e
no padrão existente do repo (`tests/agents/test_capacity*`, `tests/test_tasks_router.py`).

**Organization**: agrupado por user story (US1–US4 da spec), cada uma independentemente
testável. As 4 fatias do conceito mapeiam para as 4 user stories.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

**Purpose**: schema aditivo no banco — pré-requisito físico de tudo. Não-destrutivo sobre o
legado (SC-006).

- [ ] T001 Criar `agents/kaguya/schema_projects_pg.sql` (fonte: `data-model.md`): `CREATE TABLE IF NOT EXISTS project_plans` e `project_phases`; `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para `para_type` (em `task_projects` e `task_project_groups`) e `phase_id` (em `tasks`); índices `ix_project_phases_plan` e `ix_tasks_phase`. Ordenar: `project_plans` → `project_phases` → `ALTER`s (a FK `phase_id` referencia `project_phases`)
- [ ] T002 Registrar `schema_projects_pg.sql` em `scripts/setup_schemas.py` (`SCHEMA_FILES += ...`); rodar contra o banco de dev e verificar `\d project_plans`, `\d project_phases`, `\d+ task_projects` (coluna `para_type` com default `area`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: os motores puros + a camada de lógica única (research D4/D8) — os dois canais são
fachadas sobre ela; nenhuma user story funciona sem isso.

**⚠️ CRITICAL**: nenhuma story começa antes desta fase terminar.

- [ ] T003 [P] Criar `agents/kaguya/project_health.py` — motor **puro** (sem banco/rede, estilo `capacity.py`): `compute_project_health(tasks, phases, start_date, target_date, today)` conforme contrato em `data-model.md` (peso = `duration_min`, peso-fallback = mediana ou 30, `pct_concluido`, `by_phase`, `sem_fase`, `pct_esperado`, `status` 🟢/🟡/🔴, `projecao_termino`)
- [ ] T004 [P] Criar `agents/kaguya/project_templates.py` — motor **puro**: dict `TEMPLATES` (`data_science`/CRISP-DM, `bi`, `codigo`, `pessoal`) + `get_template(type)` (erro amigável se desconhecido) e `list_templates()` (para a UI/Telegram)
- [ ] T005 [P] Criar `tests/agents/test_project_health.py` (molde `test_capacity`): ponderação por estimativa, peso-fallback quando faltam estimativas (sem divisão por zero), limiares `no_prazo`/`em_risco`/`atrasado`, degradação sem datas (status `None`), `by_phase` e `sem_fase` (SC-004)
- [ ] T006 [P] Criar `tests/agents/test_project_templates.py`: cada molde retorna as fases esperadas; `get_template` desconhecido → erro; `list_templates` traz `type`+`label`+`fases`
- [ ] T007 Criar `agents/kaguya/tools_plans.py` sobre `agents/db.py` (contrato: `contracts/api-tasks-plans.md` + `kaguya-tools.md`): `create_project_plan`, `promote_list_to_project` (UNIQUE bloqueia duplicar), `get_project_plan` (monta plano + fases + chama `compute_project_health` + `next_action`), `update_project_plan`, `demote_project` (apaga plano/fases, zera `phase_id`, define `para_type`), `list_phases`/`create_phase`/`update_phase`/`reorder_phase` (posição esparsa ×1000 + renormalização)/`delete_phase` (`phase_id = NULL` nas tarefas), `assign_task_phase` (valida mesmo plano), `set_list_para_type` — mutações retornam `{"status": ...}`, mensagens de erro em português
- [ ] T008 [P] Alterar `agents/kaguya/tools_projects.py`: `get_sidebar()` passa a agrupar Listas/Grupos por **balde PARA** (Projetos/Áreas/Arquivo; Recursos omitido; Inbox no topo; Arquivo = `archived_at IS NOT NULL`), incluindo `para_type`, `is_project` e a contagem de abertas — **sem quebrar** o contrato consumido pelas telas atuais; `update_project`/`update_group` aceitam `para_type`
- [ ] T009 Criar `tests/agents/test_kaguya_plans.py` (molde `tests/agents/test_kaguya_tasks.py`, contra banco com schema aplicado): promover Lista (e bloquear duplicação), semear template cria fases, atribuir tarefa a fase (e rejeitar fase de outro plano), mover entre baldes (`para_type`), `get_project_plan` agrega saúde corretamente, rebaixar preserva tarefas (`phase_id = NULL`); rodar `python -m pytest tests/agents/test_kaguya_plans.py -v`

**Checkpoint**: motores + camada de lógica completos e testados — US1–US4 podem começar.

---

## Phase 3: User Story 1 - Organização PARA (Priority: P1) 🎯

**Goal**: as Listas organizadas em baldes Projetos/Áreas/Arquivo na sidebar, com Grupos
aninhados; mover Listas entre baldes pelos dois canais.

**Independent Test**: quickstart V1 — classificar Listas, mover entre baldes, conferir a
hierarquia `Balde → Grupo → Lista` e o Arquivo.

### Implementation for User Story 1

- [ ] T010 [US1] Estender `webapp/backend/routers/tasks.py`: `GET /sidebar` devolve a estrutura por balde (de `get_sidebar()`); `PATCH /projects/{id}` e `PATCH /groups/{id}` aceitam `para_type` (Pydantic body) — registrar conforme `contracts/api-tasks-plans.md`
- [ ] T011 [US1] Atualizar `webapp/frontend/src/pages/kaguya/types.ts` e `kaguyaApi.ts`: tipos `ParaType`/balde na sidebar; método para `setParaType` de Lista/Grupo
- [ ] T012 [US1] Reestruturar `components/SidebarNav.tsx` (design-guide §1): baldes de topo fixos (Projetos/Áreas/Arquivo), Grupos aninhados dentro do balde, Inbox no topo, Arquivo colapsado; ação "Mover para → balde" (menu) e drag-and-drop entre baldes; **não regredir** as telas que consomem a sidebar
- [ ] T013 [US1] Adicionar a tool `set_list_para_type` ao agente (registro em `agents/kaguya/tools.py` + `agent.py`) e validar pelo Telegram ("move a lista X para Áreas"); validar quickstart V1

**Checkpoint**: organização PARA viva nos dois canais; legado classificado em Áreas sem perda.

---

## Phase 4: User Story 2 - Projeto com fases e saúde (motor + Telegram) (Priority: P1)

**Goal**: promover Lista a Projeto, gerenciar fases e consultar saúde/próxima ação pelo
Telegram — o coração do planejamento, antes da UI rica.

**Independent Test**: quickstart V2 — só pelo Telegram, promover, criar fases, perguntar a
saúde e a próxima ação, com o webapp desligado.

### Implementation for User Story 2

- [ ] T014 [US2] Registrar as tools de planejamento no agente: atualizar `agents/kaguya/tools.py` (fachada re-exporta de `tools_plans.py`) e `agents/kaguya/agent.py` (declarar `create_project_plan`, `promote_list_to_project`, `demote_project`, `project_status`, `project_next_action`, `list_project_phases`, `add_project_phase`, `list_project_templates` — conforme `contracts/kaguya-tools.md`)
- [ ] T015 [US2] Reescrever trecho do `_INSTRUCTION` da Kaguya (`agent.py`): fluxos de projeto com **eco da interpretação**, saúde em 🟢/🟡/🔴, confirmação antes de `demote_project`, e "sem datas → não inventar status de prazo"; `project_next_action` pode oferecer adicionar ao Meu Dia
- [ ] T016 [US2] Atualizar `_MAKIMA_INSTRUCTION` em `coordinator/agent.py`: reconhecer e rotear os fluxos de projeto para a Kaguya (criar projeto, promover lista, status, próxima ação, mover balde) — `contracts/kaguya-tools.md` §Roteamento
- [ ] T017 [US2] Adicionar a `tests/agents/test_kaguya_plans.py` (ou ao router em US3) os casos conversacionais cobertos por lógica: `project_status` com/sem datas, `project_next_action` retorna a 1ª aberta; validar quickstart V2 no Telegram

**Checkpoint**: planejamento utilizável 100% pelo Telegram; paridade auditável com a webapp na US3.

---

## Phase 5: User Story 3 - Construir um projeto guiado pela webapp (Priority: P1)

**Goal**: o wizard passo a passo + a tela do Projeto (cabeçalho + board de fases + saúde +
próxima ação) — o **critério de sucesso da feature** (SC-001).

**Independent Test**: quickstart V3 — um leigo cria um projeto só seguindo o wizard; a tela do
Projeto mostra saúde, board de fases e a próxima ação; empty states ensinam.

### Implementation for User Story 3

- [ ] T018 [US3] Estender `webapp/backend/routers/tasks.py` com as rotas `/api/tasks/plans/*` (templates, create, promote, get-com-saúde, update, demote, fases CRUD + position, `POST /{id}/phase`) conforme `contracts/api-tasks-plans.md`; `_check_result` só em mutações; e `phase_id` no shape/`PATCH` de `Task`
- [ ] T019 [US3] Estender `tests/test_tasks_router.py` (molde `test_finances_router.py`): happy paths de `/plans/*`, promover já-Projeto → 400, `GET /plans/{id}` traz `health`, atribuir tarefa a fase de outro plano → 400
- [ ] T020 [P] [US3] Atualizar `kaguyaApi.ts` + `types.ts`: `plans.*` (templates/create/promote/get/update/demote/phases/assign) e os tipos `ProjectPlan`/`Phase`/`Health`
- [ ] T021 [US3] Criar `ui/HealthBadge.tsx` + `ui/ProgressBar.tsx` (design-guide §5): selo 🟢/🟡/🔴 e barra ponderada, reusando os tokens do `kaguya.css` (sem variáveis novas se já houver equivalente)
- [ ] T022 [US3] Criar `modals/ProjectWizard.tsx` (design-guide §2 — **peça central**): wizard 5 passos (tipo → propósito → visão → fases sugeridas → primeira ação), barra de progresso, "Pular"/"Voltar" sempre disponíveis, cada passo pulável; abre por "Novo projeto" **e** por "Promover a Projeto" (vinculado à Lista)
- [ ] T023 [US3] Criar `components/PhaseColumn.tsx` + `components/PhaseBoard.tsx` (design-guide §3): fases como seções com mini-barra e marco (se datada); tarefas via `TaskRow` existente; seção "(sem fase)"; **empty states que ensinam**; quick-add da fase já nasce com `phase_id`
- [ ] T024 [US3] Criar `screens/ProjectScreen.tsx` (design-guide §3): cabeçalho (propósito/visão com **divulgação progressiva**, `HealthBadge`+`ProgressBar`, datas, **próxima ação sempre visível** com "+ Meu Dia"), embute o `PhaseBoard`, alternador "Quadro de fases | Linha do tempo", seletor de status no "⋯"; empty state do cabeçalho sem propósito
- [ ] T025 [US3] Ligar a navegação: `SidebarNav` abre `ProjectScreen` ao clicar num Projeto e o `ProjectWizard` em "Novo projeto"/"Promover a Projeto"; re-fetch da sidebar após mutações (last-write-wins); validar quickstart V3 (incl. critério SC-001) e `npm run build`

**Checkpoint**: webapp guia a construção de ponta a ponta; paridade com o Telegram (quickstart V4).

---

## Phase 6: User Story 4 - Linha do tempo (Priority: P2)

**Goal**: a timeline Gantt-leve com marcos (fases com data).

**Independent Test**: quickstart V5 — num projeto com fases datadas, abrir a timeline e ver
fases posicionadas e marcos destacados.

### Implementation for User Story 4

- [ ] T026 [US4] Criar `screens/TimelineView.tsx` (design-guide §4): régua entre `start_date` e `target_date` do projeto; cada fase = barra; fases com `target_date` = marco (◆); fases sem data sequenciais; linha "hoje"; barra de fase atrasada em tom de alerta — desenhada com CSS-grid e tokens do shell (**sem biblioteca de Gantt**)
- [ ] T027 [US4] Integrar `TimelineView` no alternador da `ProjectScreen` ("Linha do tempo") e garantir que fases semeadas por template já aparecem; validar quickstart V5

**Checkpoint**: ciclo de planejamento fechado (organizar → planejar → construir → ver no tempo).

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T028 [P] Reescrever/atualizar `agents/kaguya/CLAUDE.md`: camada de planejamento (PARA, Projeto=Lista promovida, fases, saúde derivada), tabela das tools novas, motores puros, regras de comportamento (saúde sem datas, confirmação de rebaixar)
- [ ] T029 [P] Atualizar `CLAUDE.md` raiz: nota da camada de planejamento na linha/árvore da Kaguya (novos arquivos `tools_plans.py`, `project_health.py`, `project_templates.py`, `schema_projects_pg.sql`, telas `ProjectScreen`/`ProjectWizard`/`TimelineView`)
- [ ] T030 Rodar a validação completa do `quickstart.md` (V1–V5) + suíte pytest inteira; registrar resultados no checklist da spec
- [ ] T031 Refletir a feature no vault do Obsidian (skill `obsidian-vault`): nova camada de planejamento da Kaguya (PARA + GTD Natural Planning + saúde), nota de deploy (aplicar `schema_projects_pg.sql` no VPS)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)** → **Foundational (P2)** → bloqueia tudo.
- **US1 (PARA)**, **US2 (Telegram)** e **US3 (webapp)** dependem só da Foundational. US1 e US2
  são independentes entre si; US3 depende da camada de lógica (não da US1/US2), mas a paridade
  só fecha com US2+US3 vivas.
- **US4 (timeline)** depende da `ProjectScreen` da US3 (alternador de view).
- **Polish** depende de todas.

### Parallel Opportunities

- T003 ∥ T004 ∥ T005 ∥ T006 (motores puros e seus testes, arquivos distintos)
- T007 e T008 tocam módulos distintos da lógica (planos × sidebar) — coordenar só o
  `get_sidebar`
- US1 ∥ US2 inteiras (frontend sidebar/router × agente/coordinator)
- T020 ∥ (T021→T022→T023→T024) dentro da US3; T028 ∥ T029 no Polish

## Implementation Strategy

**Incremental com paridade**: Setup + Foundational → US1 (PARA) e US2 (Telegram) em paralelo →
US3 (webapp guiado, o critério de sucesso) → US4 (timeline) → Polish. Cada checkpoint é
deployável; o valor já começa na US2 (planejamento pelo Telegram) e atinge o pico na US3.

**Total**: 31 tasks — Setup 2 · Foundational 7 · US1 4 · US2 4 · US3 8 · US4 2 · Polish 4.
