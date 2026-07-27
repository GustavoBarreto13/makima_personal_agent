# Tasks: QoL — arquivar listas + localização nos eventos (Kaguya)

**Input**: Design documents from `specs/039-tasks-qol/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/rest-api.md, quickstart.md

Sem testes automatizados (nenhuma suíte no repo — padrão das specs 024–038); validação via
`quickstart.md` + `tsc -b --force`.

## Phase 1: Setup

- [X] T001 Nenhuma migração de schema necessária (research.md R1/R6) — confirmar que
      `task_projects.archived_at` já existe em `agents/kaguya/schema_tasks_pg.sql` antes de
      prosseguir (checagem, sem edição).

## Phase 2: Foundational

- [X] T002 Em `agents/kaguya/tools_projects.py`: implementar `archive_project(project_id) ->
      dict` (rejeita Inbox e já-arquivada; `UPDATE task_projects SET archived_at = now()`,
      sem tocar tarefas/colunas) e `restore_project(project_id) -> dict` (rejeita se já
      ativa; `UPDATE ... SET archived_at = NULL`).
- [X] T003 Em `agents/kaguya/tools_projects.py`: implementar `list_archived_projects() ->
      list[dict]` — `SELECT id, name, group_id, color, icon, archived_at, task_count` (via
      subquery de contagem) `WHERE archived_at IS NOT NULL ORDER BY archived_at DESC`.
      **Listagem** (sem "status").
- [X] T004 Em `agents/kaguya/tools_projects.py`: implementar
      `resolve_project_id_by_name_any(name) -> Optional[tuple[int, bool]]` — mesmo
      match exato→prefixo de `resolve_project_id_by_name`, mas SEM o filtro
      `archived_at IS NULL`; retorna `(id, is_archived)` ou `None`.

**Checkpoint**: as 3 novas funções de lista existem e são testáveis isoladamente — ainda
sem efeito nas views nem exposição via API/Telegram.

---

## Phase 3: User Story 1 - Arquivar uma lista encerrada (Priority: P1) 🎯 MVP

**Goal**: arquivar sem tocar tarefas; lista some de toda view operacional; busca continua
achando e sinaliza; Inbox nunca arquivável.

**Independent Test**: criar lista com 3 tarefas (1 no Meu Dia, 1 vencendo hoje), arquivar,
conferir sumiço em sidebar/Hoje/Meu Dia, conferir contagem do banco inalterada.

- [X] T005 [US1] [P] Em `agents/kaguya/tools_filters.py`: `_build_where_from_rules` —
      mudar `base = "t.deleted_at IS NULL"` para
      `base = "t.deleted_at IS NULL AND p.archived_at IS NULL"` (cobre smart-lists salvas,
      as 5 views fixas de `tools_views.py` e o filtro de Kanban view).
- [X] T006 [US1] [P] Em `agents/kaguya/tools_calendar.py`: `list_tasks_in_range` — adicionar
      `AND p.archived_at IS NULL` nas 2 queries (`real_rows` e `rec_rows`).
- [X] T007 [US1] [P] Em `agents/kaguya/tools_tags.py`: `list_tasks_by_tag` — adicionar
      `AND p.archived_at IS NULL`.
- [X] T008 [US1] [P] Em `agents/kaguya/tools_tasks.py`: `list_tasks_today` e
      `list_eisenhower_tasks` — adicionar `AND p.archived_at IS NULL`.
- [X] T009 [US1] Em `agents/kaguya/tools_tasks.py`: `list_my_day` — adicionar
      `AND p.archived_at IS NULL` nas 3 queries (`plano_rows`/`pendencias_rows`/
      `sugestoes_rows`).
- [X] T010 [US1] Em `agents/kaguya/tools_tasks.py`: `search_tasks` — adicionar
      `p.archived_at IS NOT NULL AS project_archived` ao SELECT; no item serializado,
      `item["archived"] = bool(r["project_archived"])`.
- [X] T011 [US1] Em `agents/kaguya/tools.py`: re-exportar `archive_project`,
      `restore_project`, `list_archived_projects`, `resolve_project_id_by_name_any`; em
      `list_tasks_by_project`, quando o resolve normal falhar, tentar
      `resolve_project_id_by_name_any` — se achar e `is_archived`, devolver
      `{"status": "error", "message": f"A lista '{project}' está arquivada. Restaure-a (id {id}) antes de usar."}`.
- [X] T012 [US1] Em `agents/kaguya/agent.py`: importar e registrar `archive_project`,
      `restore_project`, `list_archived_projects` na lista `tools=[...]`; acrescentar 1–2
      frases na `_INSTRUCTION` sobre arquivar/restaurar listas pelo Telegram.
- [X] T013 [US1] [P] Rotas em `webapp/backend/routers/tasks.py`:
      `POST /projects/{id}/archive`, `POST /projects/{id}/restore`,
      `GET /projects/archived` (lista direto, sem `_check_result`).
- [X] T014 [US1] [P] Em `webapp/frontend/src/pages/kaguya/types.ts`: `Project.archived_at?:
      string | null`; `ArchivedProject` (id, name, group_id, color, icon, archived_at,
      task_count); campo `archived?: boolean` no item de resultado de busca (Command
      Palette).
- [X] T015 [US1] [P] Em `webapp/frontend/src/pages/kaguya/kaguyaApi.ts`:
      `archiveProject(id)`, `restoreProject(id)`, `listArchivedProjects()`.
- [X] T016 [US1] Em `webapp/frontend/src/pages/kaguya/components/SortableListItem.tsx`:
      novo botão de arquivar revelado no hover (mesmo padrão do grip), chamando
      `kaguyaApi.archiveProject(project.id)` diretamente (sem confirmação — FR-001),
      seguido de toast + recarregar a sidebar. Não renderizado para o Inbox (já garantido —
      Inbox não passa por este componente).
- [X] T017 [US1] Em `webapp/frontend/src/pages/kaguya/modals/ProjectModal.tsx`: botão
      "Arquivar lista" ao lado do "Excluir lista" (mode edit, não-Inbox), chamando
      `kaguyaApi.archiveProject` e fechando o modal com toast.

**Checkpoint**: arquivar funciona ponta a ponta (sidebar, Telegram, busca) — ainda falta a
área de visualizar/restaurar (US2).

---

## Phase 4: User Story 2 - Ver e restaurar arquivadas (Priority: P2)

**Goal**: tela de listas arquivadas com contagem + data, botão restaurar, exclusão
definitiva ainda acessível a partir de lá.

**Independent Test**: arquivar, abrir a área de arquivadas, conferir conteúdo, restaurar,
conferir volta completa.

- [X] T018 [US2] Novo `webapp/frontend/src/pages/kaguya/screens/ArchivedProjectsScreen.tsx`
      (mesmo padrão de `TrashScreen.tsx`): lista `kaguyaApi.listArchivedProjects()`, cada
      linha com nome/ícone/`task_count`/data relativa de arquivamento, botão "Restaurar"
      (`kaguyaApi.restoreProject`) e botão "Editar" que abre `ProjectModal` em modo edit
      (reaproveita a exclusão definitiva já existente lá).
- [X] T019 [US2] Em `webapp/frontend/src/pages/kaguya/types.ts`: `KaguyaView` ganha
      `'archived'`.
- [X] T020 [US2] Em `webapp/frontend/src/pages/kaguya/KaguyaShell.tsx`: roteamento
      `if (view === 'archived') return <ArchivedProjectsScreen .../>`, e passar
      `ProjectModal` reaproveitado (mesmo estado `projectModal` já existente) para a edição
      a partir dessa tela.
- [X] T021 [US2] Em `webapp/frontend/src/pages/kaguya/components/SidebarNav.tsx`: item de
      navegação "Arquivadas" (ícone de caixa) próximo à Lixeira.

**Checkpoint**: US1 + US2 entregam a Parte A completa.

---

## Phase 5: User Story 3 - Ver o local do evento e abrir no Maps (Priority: P2)

**Goal**: local do evento chega ao Meu Dia; vira link para o Maps nas 3 superfícies
(agenda, popover, Meu Dia); sem resíduo quando não há local; URL abre a própria URL.

**Independent Test**: evento com endereço aparece com local + link nas 3 superfícies;
evento com URL abre a URL; evento sem local não deixa resíduo.

- [X] T022 [US3] [P] Em `agents/kaguya/tools_tasks.py::_gcal_events_for_day`: acrescentar
      `"location": ev.get("location", "")` ao dict `item`; atualizar a assinatura/docstring
      (o retorno continua uma tupla de 5 valores — só o shape do dict de `eventos_serial`
      muda).
- [X] T023 [US3] [P] Novo `webapp/frontend/src/pages/kaguya/lib/maps.ts`:
      `mapsLinkFor(loc: string): string` — URL como está se `/^https?:\/\//i`; senão
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`.
- [X] T024 [US3] [P] Em `webapp/frontend/src/pages/kaguya/types.ts`:
      `TimelineEvent.location?: string`.
- [X] T025 [US3] Em `webapp/frontend/src/pages/kaguya/components/EventPopover.tsx`: trocar
      `<span>{ev.loc}</span>` por `<a href={mapsLinkFor(ev.loc)} target="_blank"
      rel="noreferrer">{ev.loc}</a>` (só quando `ev.loc` existe — FR-011).
- [X] T026 [US3] Em `webapp/frontend/src/pages/kaguya/components/DayTimeline.tsx`: dentro do
      bloco de evento com hora (lane esquerda), nova linha condicional
      (`ev.location &&`) com o local como link (`mapsLinkFor`, `stopPropagation` no clique
      para não interferir no bloco).
- [X] T027 [US3] [P] `kaguya.css`: classe para a linha de local dentro do bloco do
      timeline (truncamento com ellipsis, mesmo estilo de `.kg-tl-slot-time`).

**Checkpoint**: as 3 user stories entregues e testáveis independentemente.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T028 [P] Atualizar `agents/kaguya/CLAUDE.md`: nova seção "Arquivar listas +
      localização nos eventos (spec 039)" — reuso de `archived_at`, ponto único de fix em
      `_build_where_from_rules`, exceção da busca, e o elo que faltava do `location`.
- [X] T029 [P] Atualizar `webapp/docs/API.md` com as 3 rotas novas + o campo `archived` em
      `/search` + `location` em `/my-day`.
- [X] T030 [P] Atualizar `webapp/docs/FRONTEND.md` com a tela de Arquivadas, o botão de
      arquivar na sidebar e o link de local nas 3 superfícies.
- [X] T031 Atualizar `ROADMAP.md`: nova linha da fase 039 (✅), atualizar "Status atual",
      remover a linha de pendência "⏳ 039" da tabela de Pendências.
- [X] T032 Validação estática: `python -m py_compile` nos módulos alterados + import smoke
      test de `agents.kaguya.tools`/`webapp.backend.main` com env vars dummy; `tsc -b
      --force` no frontend; `npm run build`.
- [ ] T033 Executar os cenários de `quickstart.md` contra um PostgreSQL real — não
      executável neste ambiente (sem `DATABASE_URL` no sandbox).

## Dependencies & Execution Order

- **Setup (T001)** → bloqueia tudo (checagem rápida).
- **Foundational (T002–T004)** → bloqueia US1.
- **US1 (T005–T017)** é o MVP — arquivar ponta a ponta (webapp + Telegram + busca).
- **US2 (T018–T021)** depende de US1 (precisa de listas arquivadas para existir algo a
  ver/restaurar).
- **US3 (T022–T027)** é totalmente independente de US1/US2 (Parte B da spec) — pode ser
  feito em paralelo.
- **Polish (T028–T033)** por último.

## Parallel Example

T005–T010 (fixes de filtro, arquivos diferentes) podem rodar em paralelo entre si. T022–T024
(Parte B: backend, util novo, type) também são paralelos entre si e com qualquer tarefa de
US1/US2.

## Implementation Strategy

**MVP scope**: Foundational + US1 entrega o valor central da Parte A ("arquivar de
verdade"). US2 é a rede de segurança (ver/restaurar). US3 (Parte B) é independente e pode
entrar em qualquer ordem.
