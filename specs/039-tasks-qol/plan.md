# Implementation Plan: QoL — arquivar listas + localização nos eventos (Kaguya)

**Branch**: `master` | **Date**: 2026-07-27 | **Spec**: `specs/039-tasks-qol/spec.md`

**Input**: Feature specification from `specs/039-tasks-qol/spec.md`

## Summary

Duas melhorias pequenas e independentes. **Parte A**: expõe um fluxo real de arquivar/
restaurar listas reusando a coluna `task_projects.archived_at` que já existia (só era
gravada internamente por `delete_project`) — `archive_project`/`restore_project`/
`list_archived_projects` novos, mais a auditoria de todas as views operacionais (Meu Dia,
calendário, Eisenhower, smart-lists, tags, views fixas) para excluírem listas arquivadas,
com a busca global como única exceção (mostra e sinaliza). **Parte B**: o campo `location`
do evento do Google Calendar já é capturado e exibido em parte (agenda/popover) — falta
só propagá-lo também ao Meu Dia (`_gcal_events_for_day`) e torná-lo um link clicável para
o Google Maps nas duas superfícies. Nenhuma migração de schema em nenhuma das duas partes.

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript/React (frontend) — stack já em uso.

**Primary Dependencies**: Nenhuma nova.

**Storage**: PostgreSQL — nenhuma tabela ou coluna nova; reusa `task_projects.archived_at`
já existente.

**Testing**: Sem suíte automatizada no repo (padrão das specs 024–038) — validação por
`quickstart.md` + `tsc -b --force`.

**Target Platform**: Webapp (FastAPI + React) + paridade no Telegram (FR-008).

**Project Type**: Web application (backend + frontend), dentro do monorepo existente.

**Performance Goals**: Sem exigência nova — os fixes de filtro são `AND` extra num WHERE já
existente; custo desprezível para o volume de um usuário único.

**Constraints**: FR-007 exige que `delete_project` continue byte-a-byte igual — nenhuma
linha desse fluxo é tocada, só adicionamos funções novas ao lado.

**Scale/Scope**: Usuário único. Sem paginação necessária na área de arquivadas (poucas
listas esperadas).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Agent Specialization**: Tudo no domínio Kaguya (tarefas + agenda); nenhuma mistura.
  **PASS**.
- **II. Hybrid Batch + Agentic**: Feature interativa (webapp + Telegram sob demanda);
  nenhuma automação agendada nova. **PASS**.
- **III. Self-Contained Agents**: Toda lógica nova em `agents/kaguya/`
  (`tools_projects.py`, `tools_tasks.py`, `tools_calendar.py`, `tools_tags.py`,
  `tools_filters.py`); nenhuma dependência de outro pacote de agente. **PASS**.
- **IV. Portuguese-First UX**: Mensagens de erro/sucesso e o texto do Telegram em
  português, mesmo tom direto já usado. **PASS**.
- **V. Minimal Footprint**: Zero dependências novas, zero tabelas/colunas novas — reusa
  `archived_at` e o campo `location` que já existiam. **PASS**.

Nenhuma violação — sem entradas na tabela de Complexity Tracking.

## Project Structure

### Documentation (this feature)

```
specs/039-tasks-qol/
├── spec.md
├── plan.md              # este arquivo
├── research.md          # Fase 0
├── data-model.md        # Fase 1
├── contracts/
│   └── rest-api.md      # Fase 1
├── quickstart.md         # Fase 1
└── tasks.md              # /speckit-tasks (próximo)
```

### Source Code (arquivos tocados)

```
agents/kaguya/
├── tools_projects.py     # archive_project/restore_project/list_archived_projects +
│                          #   resolve_project_id_by_name_any
├── tools_tasks.py         # location em _gcal_events_for_day; filtro archived_at em
│                          #   list_tasks_today/list_eisenhower_tasks/list_my_day;
│                          #   search_tasks ganha "archived"
├── tools_calendar.py       # filtro archived_at nas 2 queries de list_tasks_in_range
├── tools_tags.py           # filtro archived_at em list_tasks_by_tag
├── tools_filters.py        # filtro archived_at no base de _build_where_from_rules
├── tools.py                 # re-exporta as 3 funções novas + mensagem de lista arquivada
│                             #   em list_tasks_by_project
├── agent.py                  # registra archive_project/restore_project/
│                              #   list_archived_projects como tools ADK
└── CLAUDE.md                  # nova seção "Arquivar listas + localização (spec 039)"

webapp/backend/routers/tasks.py   # 3 rotas novas + "archived" em /search
webapp/docs/API.md                 # rotas novas documentadas

webapp/frontend/src/pages/kaguya/
├── types.ts                        # Project.archived_at?; TimelineEvent.location?;
│                                    #   ArchivedProject; SearchResult.archived?
├── kaguyaApi.ts                     # archiveProject/restoreProject/listArchivedProjects
├── lib/maps.ts                      # NOVO — mapsLinkFor(loc)
├── screens/ArchivedProjectsScreen.tsx  # NOVO — lista arquivadas + restaurar
├── components/SortableListItem.tsx  # botão de arquivar no hover (SC-005)
├── components/SidebarNav.tsx        # link "Arquivadas" + callback onArchive
├── components/EventPopover.tsx      # local vira link (mapsLinkFor)
├── components/DayTimeline.tsx       # local no bloco do evento (link)
├── modals/ProjectModal.tsx          # botão "Arquivar lista" (edição)
├── KaguyaShell.tsx                  # roteamento da nova view 'archived'
└── kaguya.css                       # classes novas (bloco de local no timeline, etc.)

webapp/docs/FRONTEND.md              # área de arquivadas + local nos eventos documentados
ROADMAP.md                            # nova linha fase 039
```
