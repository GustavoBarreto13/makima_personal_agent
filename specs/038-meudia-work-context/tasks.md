# Tasks: Meu Dia com contexto Trabalho vs Pessoal (Kaguya)

**Input**: Design documents from `specs/038-meudia-work-context/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/rest-api.md, quickstart.md

Sem testes automatizados (nenhuma suíte no repo — padrão das specs 024–037); validação via
`quickstart.md` + `tsc -b --force`.

## Phase 1: Setup

- [X] T001 Adicionar `task_projects.context` (default `'personal'`, CHECK
      `context IN ('personal','work')`, CHECK `NOT is_inbox OR context = 'personal'`) e
      `calendar_prefs.context` (default `'personal'`, mesmo CHECK de valores) em
      `agents/kaguya/schema_tasks_pg.sql`, conforme `data-model.md`.

## Phase 2: Foundational

- [X] T002 Em `agents/kaguya/tools_projects.py`, `update_project` e `create_project`:
      aceitar `context` opcional (default `'personal'` na criação, FR-001); antes de gravar
      `context == 'work'`, recusar se a lista for o Inbox
      (`{"status": "error", "message": "O Inbox é sempre Pessoal."}`) — validação amigável
      antes do CHECK do banco.
- [X] T003 Em `agents/kaguya/tools_projects.py`, implementar
      `set_group_context(group_id: int, context: str) -> dict` — valida `context in
      ('personal','work')`, roda `UPDATE task_projects SET context = %s WHERE group_id = %s
      AND NOT is_inbox`, retorna `{"status": "ok", "updated": <rowcount>}`.
- [X] T004 Em `agents/kaguya/calendar_prefs.py`, `get_calendar_prefs`/`set_calendar_pref`:
      incluir `context` na SELECT e no upsert (mesmo padrão dos demais campos opcionais;
      default `'personal'` no INSERT).
- [X] T005 Em `agents/kaguya/tools_projects.py`, `get_sidebar`: incluir `p.context` na SELECT
      de `projects` (a sidebar/ProjectModal precisa do valor atual para exibir o seletor).

**Checkpoint**: colunas existem, contexto pode ser lido/escrito por lista/grupo/calendário —
ainda sem nenhum efeito visível no Meu Dia (isso é US2).

---

## Phase 3: User Story 1 - Marcar listas (e calendários) como Trabalho (Priority: P1) 🎯 MVP

**Goal**: contexto definível por lista (com bloqueio do Inbox), ação em massa por grupo,
contexto por calendário.

**Independent Test**: marcar uma lista como Trabalho e conferir a herança; mover uma tarefa
dela para uma lista pessoal e conferir a mudança de contexto.

- [X] T006 [US1] [P] Rota `PATCH /api/tasks/projects/{project_id}` em
      `webapp/backend/routers/tasks.py`: estender `UpdateProjectBody`
      (`webapp/backend/routers/tasks.py`) com `context: Optional[Literal["personal","work"]]`.
- [X] T007 [US1] [P] Nova rota `POST /api/tasks/groups/{group_id}/context` em
      `webapp/backend/routers/tasks.py` — body `SetGroupContextBody {context}`, chama
      `set_group_context`.
- [X] T008 [US1] [P] Rota `PATCH /api/tasks/calendar/prefs/{calendar_id}`: estender o body
      existente com `context: Optional[Literal["personal","work"]]`.
- [X] T009 [US1] [P] Em `webapp/frontend/src/pages/kaguya/types.ts`: `WorkContext = 'personal'
      | 'work'`; `Project.context: WorkContext`; `CalendarPref.context: WorkContext`.
- [X] T010 [US1] [P] Em `webapp/frontend/src/pages/kaguya/kaguyaApi.ts`: estender
      `updateProject`/`createProject` types (context opcional) e `setCalendarPref`; nova
      `setGroupContext(groupId, context)`.
- [X] T011 [US1] Em `webapp/frontend/src/pages/kaguya/modals/ProjectModal.tsx`: seletor
      Pessoal/Trabalho (radio ou segmented control); desabilitado/oculto quando
      `project?.is_inbox`.
- [X] T012 [US1] Ação em massa por grupo: no menu de contexto do grupo na sidebar
      (`SidebarNav.tsx`, mesmo local do editar/excluir grupo — ícone ⚙ no hover), adicionar
      "Marcar como Trabalho"/"Marcar como Pessoal" chamando `setGroupContext`.
- [X] T013 [US1] Em `webapp/frontend/src/pages/kaguya/components/CalendarsAside.tsx`: toggle
      de contexto (Pessoal/Trabalho) por calendário, ao lado do toggle de visibilidade já
      existente, chamando `kaguyaApi.setCalendarPref(id, { context })`.

**Checkpoint**: contexto configurável ponta a ponta (lista, grupo, calendário) — ainda sem
efeito no Meu Dia (US2 consome isso).

---

## Phase 4: User Story 2 - Meu Dia dividido com duas capacities (Priority: P1)

**Goal**: seções Trabalho/Pessoal no Meu Dia, cada uma com sua capacity; timeline única;
resumo do Telegram com os dois blocos.

**Independent Test**: tarefas e eventos nos dois contextos → cada seção só com seus itens;
cada barra de capacity considera só estimativas/eventos do seu contexto.

- [X] T014 [US2] Em `agents/kaguya/tools_tasks.py`, `_gcal_events_for_day`: ler
      `calendar_prefs` já traz `context` (via T004); anexar `context` a cada item de
      `eventos_serial`; produzir `eventos_tuplas_work`/`eventos_tuplas_personal` (partição
      por `pref.get("context", "personal")`) além da lista de tuplas total já existente.
      Retorno passa a ser uma tupla de 5 valores (ajustar a assinatura e o único chamador,
      `list_my_day`; testes em `tests/agents/test_kaguya_gcal_events_for_day.py` atualizados).
- [X] T015 [US2] Em `agents/kaguya/tools_tasks.py`, `list_my_day`: incluir `p.context` nas 3
      queries (`plano_rows`, `pendencias_rows`, `sugestoes_rows` — já fazem JOIN com
      `task_projects p`); em `_prepare`, anexar `item["context"] = r["context"]`; particionar
      `plano`/`pendencias`/`sugestoes` em `_work`/`_personal` por esse campo; chamar
      `compute_capacity` 3× (work, personal, total original) com os insumos correspondentes;
      adicionar `capacity_work`/`capacity_personal`/`plano_work`/`plano_personal`/
      `pendencias_ontem_work`/`pendencias_ontem_personal`/`sugestoes_work`/`sugestoes_personal`
      ao dict de retorno, preservando todos os campos existentes (`plano`, `capacity`, etc. —
      FR-010).
- [X] T016 [US2] Em `agents/kaguya/tools.py`, `my_day_status()`: acrescentar os dois blocos
      ("trabalho: X de Y; pessoal: Z de W") ao texto quando `capacity_work`/`capacity_personal`
      tiverem algum item (`no_plano > 0`); manter a linha total como já é hoje.
- [X] T017 [US2] [P] Em `webapp/frontend/src/pages/kaguya/types.ts`: estender
      `MyDayResponse` com os campos novos (`plano_work`, `plano_personal`,
      `pendencias_ontem_work`, `pendencias_ontem_personal`, `sugestoes_work`,
      `sugestoes_personal`, `capacity_work`, `capacity_personal`); `Task.context?: WorkContext`.
- [X] T018 [US2] Em `webapp/frontend/src/pages/kaguya/screens/TodayScreen.tsx`: quando a
      visão é "dividida" (default), renderizar duas colunas/seções (Trabalho/Pessoal), cada
      uma com seu próprio `<CapacityBar capacity={...} />` e sua lista de `PlanCard`s
      (reaproveitando o componente existente); seção com `plano_X.length === 0 &&
      capacity_X.estimado_min === 0 && capacity_X.agenda_min === 0` se recolhe (R8). A
      `DayTimeline` continua recebendo o `plano`/`eventos` unificados (união, sem mudança).

**Checkpoint**: US1 + US2 juntos entregam o valor central da spec.

---

## Phase 5: User Story 3 - Voltar à visão única quando eu quiser (Priority: P2)

**Goal**: toggle visão única/dividida, escolha lembrada.

**Independent Test**: alternar para visão única, conferir lista/capacity unificadas;
recarregar e conferir persistência.

- [X] T019 [US3] Em `webapp/frontend/src/pages/kaguya/screens/TodayScreen.tsx`: estado
      `viewMode` lido/escrito em `localStorage` (chave `kg:myday:view`, valores `'split'`
      default | `'single'` — mesmo padrão de `readViewMode`/`writeViewMode` do
      `KaguyaShell.tsx`); toggle visível no topo da tela (ex.: segmented control "Dividido" /
      "Único"). Em `'single'`, renderiza a UI atual (uma lista, uma `CapacityBar` com
      `capacity`/`plano` não particionados) — nenhuma mudança de layout além do toggle.

**Checkpoint**: as 3 user stories entregues e testáveis independentemente.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T020 [P] Atualizar `agents/kaguya/CLAUDE.md`: nova seção "Meu Dia — contexto
      Trabalho/Pessoal (spec 038)" documentando a herança por JOIN (sem coluna em `tasks`),
      a partição do motor de capacity (chamado 2×/3×, sem alteração), `set_group_context` e
      o CHECK do Inbox.
- [X] T021 [P] Atualizar `webapp/docs/API.md` com os campos novos de `/my-day`, a extensão de
      `PATCH /projects/{id}` e `PATCH /calendar/prefs/{id}`, e a nova rota
      `/groups/{id}/context`.
- [X] T022 [P] Atualizar `webapp/docs/FRONTEND.md` descrevendo as duas seções do Meu Dia, o
      toggle de visão e os pontos de configuração de contexto (ProjectModal, ação em massa do
      grupo, CalendarsAside).
- [X] T023 Atualizar `ROADMAP.md`: nova linha da fase 038 (✅) na tabela de Fases, atualizar
      "Status atual", remover a linha de pendência "⏳ 038" da tabela de Pendências.
- [X] T024 Validação estática: import dos módulos alterados
      (`agents.kaguya.tools`/`webapp.backend.main`) com env vars dummy (mesmo procedimento
      das specs 035–037 — sem Postgres real no sandbox); `tsc -b --force` no frontend.
- [ ] T025 Executar os cenários de `quickstart.md` contra um PostgreSQL real (VPS ou dev DB)
      — não executável neste ambiente (sem `DATABASE_URL` configurado neste sandbox).

## Dependencies & Execution Order

- **Setup (T001)** → bloqueia tudo.
- **Foundational (T002–T005)** → bloqueia todas as user stories.
- **US1 (T006–T013)** é o MVP de configuração — nenhuma dependência de US2/US3.
- **US2 (T014–T018)** depende de US1 existir (precisa de listas/calendários marcados para ter
  dados reais), mas a lógica de particionamento em si só depende da Foundational.
- **US3 (T019)** depende só de US2 (o toggle alterna entre os dois modos de render já
  existentes após US2).
- **Polish (T020–T025)** por último.

## Parallel Example

Dentro de US1, T006/T007/T008 (rotas), T009/T010 (types/api client) podem rodar em paralelo
(arquivos diferentes) assim que T002/T003/T004 (lógica de negócio) estiverem prontos.

## Implementation Strategy

**MVP scope**: Setup + Foundational + US1 + US2 entrega o valor central pedido ("dividir o
Meu Dia"). US3 (toggle de visão única) é a rede de segurança — incremento independente.
