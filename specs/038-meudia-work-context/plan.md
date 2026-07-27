# Implementation Plan: Meu Dia com contexto Trabalho vs Pessoal (Kaguya)

**Branch**: `master` | **Date**: 2026-07-27 | **Spec**: `specs/038-meudia-work-context/spec.md`

**Input**: Feature specification from `specs/038-meudia-work-context/spec.md`

## Summary

Adiciona um contexto (`personal` padrão, ou `work`) a duas entidades já existentes —
`task_projects` (listas) e `calendar_prefs` (calendários conectados) — e usa esse contexto
para particionar os insumos do motor de capacity **já existente** (`capacity.py`,
`compute_capacity`, intocado) em duas chamadas independentes: uma para tarefas/eventos de
trabalho, outra para pessoal. Não há coluna de contexto em `tasks` — o contexto de uma tarefa
é sempre **herdado por JOIN** com a lista atual (nunca copiado), eliminando qualquer risco de
divergência quando a tarefa muda de lista. O Meu Dia (`list_my_day`) passa a devolver
`capacity_work`/`capacity_personal` além do `capacity` total (soma consistente — ver research
R6 sobre quais campos são estritamente aditivos). O toggle "visão única/dividida" é uma
preferência de **UI pura** em `localStorage` (mesmo padrão já usado pelo próprio
`KaguyaShell.tsx` para lembrar a última visão de lista/grupo) — sem tabela nova para isso.

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript/React (frontend) — stack já em uso.

**Primary Dependencies**: Nenhuma nova — reaproveita FastAPI, psycopg2, React já presentes.

**Storage**: PostgreSQL — 2 colunas novas (`task_projects.context`, `calendar_prefs.context`)
em tabelas já existentes; nenhuma tabela nova.

**Testing**: Sem suíte automatizada no repo (padrão das specs 024–037) — validação por
`quickstart.md` + `tsc -b --force`.

**Target Platform**: Webapp (FastAPI + React); resumo textual também no Telegram (FR-009).

**Project Type**: Web application (backend + frontend), dentro do monorepo existente.

**Performance Goals**: Sem exigência nova — `compute_capacity` já é O(n) puro; rodá-lo 3×
(total + work + personal) sobre listas pequenas (poucas dezenas de itens/dia) é irrelevante.

**Constraints**: FR-006 exige que a soma das duas capacities equivalha à capacity da visão
única — resolvido reaproveitando os MESMOS insumos brutos particionados (nenhum evento/tarefa
conta duas vezes nem fica de fora), com a ressalva documentada em R6 sobre quais campos do
resultado são estritamente somáveis.

**Scale/Scope**: Usuário único; poucas listas/calendários. Sem paginação necessária.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Agent Specialization**: Tudo pertence ao domínio Kaguya (tarefas + agenda) — nenhuma
  mistura de domínio, nenhum agente novo. **PASS**.
- **II. Hybrid Batch + Agentic**: Feature puramente interativa/webapp (+ resumo Telegram já
  existente, só estendido) — nenhuma automação agendada nova. **PASS**.
- **III. Self-Contained Agents**: Toda a lógica nova fica em `agents/kaguya/` (colunas em
  tabelas próprias, funções em `tools_projects.py`/`tools_tasks.py`/`calendar_prefs.py`);
  nenhuma dependência de outro pacote de agente. **PASS**.
- **IV. Portuguese-First UX**: Resumo do Telegram (`my_day_status`) ganha os dois blocos em
  português, mesmo tom direto já usado. **PASS**.
- **V. Minimal Footprint**: Zero dependências novas, zero tabelas novas (só 2 colunas em
  tabelas existentes), motor de capacity **reaproveitado sem alteração** (chamado 2× com
  insumos filtrados — não um novo motor), toggle de visão em `localStorage` (mesmo padrão já
  usado no próprio arquivo para outras preferências de exibição) em vez de uma tabela de 1
  linha. **PASS**.

Nenhuma violação — **Complexity Tracking não se aplica**.

## Project Structure

### Documentation (this feature)

```text
specs/038-meudia-work-context/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
│   └── rest-api.md
└── tasks.md               # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
agents/kaguya/
├── schema_tasks_pg.sql     # + task_projects.context, calendar_prefs.context (CHECK + default 'personal')
├── tools_projects.py       # update_project ganha `context`; nova set_group_context(group_id, context)
├── tools_tasks.py          # list_my_day particiona capacity em work/personal; _gcal_events_for_day expõe contexto por evento
├── calendar_prefs.py       # get/set_calendar_pref ganham `context`
└── tools.py                # my_day_status() ecoa os dois blocos; re-exporta set_group_context

webapp/backend/routers/
└── tasks.py                # PATCH /projects/{id} aceita context; nova rota POST /groups/{id}/context;
                             # PATCH /calendar/prefs/{id} aceita context

webapp/frontend/src/pages/kaguya/
├── types.ts                # + WorkContext, Project.context, CalendarPref.context, MyDayResponse.capacity_work/personal
├── kaguyaApi.ts             # + updateProject(context), setGroupContext, setCalendarPref(context)
├── modals/ProjectModal.tsx  # + seletor Pessoal/Trabalho (oculto/desabilitado no Inbox)
├── components/CalendarsAside.tsx  # + toggle de contexto por calendário
└── screens/TodayScreen.tsx  # duas seções com duas CapacityBar quando "dividida"; toggle visão única/dividida (localStorage)
```

**Structure Decision**: Web application dentro do monorepo já existente — mesmo padrão das
specs anteriores da Kaguya (webapp-only para a divisão; Telegram só estende o resumo textual
já existente). Nenhum projeto/pasta nova.

## Complexity Tracking

Não se aplica — nenhuma violação do Constitution Check.
