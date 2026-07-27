# Implementation Plan: Foco / Pomodoro — timer por tarefa e estatísticas (Kaguya)

**Branch**: `master` | **Date**: 2026-07-27 | **Spec**: `specs/037-tasks-focus-pomodoro/spec.md`

**Input**: Feature specification from `specs/037-tasks-focus-pomodoro/spec.md`

## Summary

Adiciona ciclo pomodoro à Kaguya: uma tabela `focus_sessions` (PostgreSQL) guarda o registro
autoritativo de cada sessão (tarefa opcional, início, duração planejada de foco/pausa, fim,
completada ou não, nota). Uma única sessão pode estar ativa por vez (`ended_at IS NULL`),
garantida por índice único parcial. O tempo restante nunca é contado no cliente — é sempre
`início + duração_planejada - agora()`, recalculado a cada leitura; isso resolve nativamente
FR-007 (sobrevive a reload) e FR-008 (sessão abandonada é fechada, creditando no máximo o
planejado, na próxima leitura — sem job/cron). O widget flutuante vive em `KaguyaShell.tsx`
(componente persistente entre todas as views internas do painel), faz polling leve do estado
do servidor e deriva a contagem regressiva localmente entre polls. Webapp-only (sem tool ADK),
seguindo o precedente das specs 024/029/030/035/036.

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript/React (frontend) — stack já em uso.

**Primary Dependencies**: FastAPI (router REST), psycopg2-binary (PostgreSQL síncrono), React
(sem lib nova de timer — `setInterval` + derivação por timestamp).

**Storage**: PostgreSQL — nova tabela `focus_sessions` em `agents/kaguya/schema_tasks_pg.sql`
(mesmo banco/schema da Kaguya; FK opcional para `tasks`).

**Testing**: Nenhuma suíte automatizada de testes no repo (padrão dos specs 024–036) —
validação por `quickstart.md` + `tsc -b --force` no frontend.

**Target Platform**: Webapp (FastAPI + React), consumido pelo navegador do usuário único.

**Project Type**: Web application (backend + frontend), dentro do monorepo existente.

**Performance Goals**: Polling do widget a cada 1s (client-side) é cosmético; leitura do
servidor (`GET /focus/active`) só precisa ser barata (uma query indexada) — sem exigência de
alta vazão (usuário único).

**Constraints**: Tempo restante exibido não pode divergir do real em mais de 2s após reload
(SC-002) — resolvido por derivar sempre de `started_at` + duração, nunca de um cronômetro que
começa do zero na tela.

**Scale/Scope**: Um usuário; poucas sessões por dia. Sem paginação necessária no histórico do
dia/semana.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Agent Specialization**: Foco pertence 100% ao domínio Kaguya (tarefas + agenda) — não
  cria agente novo, não mistura domínio. `focus_sessions.task_id` é uma FK opcional dentro do
  próprio schema da Kaguya (não é cross-agent). **PASS**.
- **II. Hybrid Batch + Agentic**: Feature é puramente interativa/webapp — nenhuma automação
  agendada nem migração de batch envolvida. **PASS**.
- **III. Self-Contained Agents**: Toda a lógica nova fica em `agents/kaguya/tools_focus.py` +
  schema próprio; nenhuma dependência de outro pacote de agente. **PASS**.
- **IV. Portuguese-First UX**: Sem superfície de Telegram nesta spec (Assumptions do spec.md:
  fora de escopo iniciar/parar por chat); textos do widget/telas em português, como o resto do
  painel. **PASS**.
- **V. Minimal Footprint**: Uma tabela nova, zero dependências novas (sem lib de timer),
  reaproveita o padrão de "nada persistido derivado" (fecho automático calculado na leitura,
  não por cron) e o padrão de tools puras (`capacity.py`-style) para agregação de estatísticas.
  **PASS**.

Nenhuma violação — **Complexity Tracking não se aplica**.

## Project Structure

### Documentation (this feature)

```text
specs/037-tasks-focus-pomodoro/
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
├── schema_tasks_pg.sql     # + tabela focus_sessions, índice único parcial "1 ativa"
├── focus_stats.py          # motor PURO: agrega sessões em {total_min, sessoes} por dia/semana
├── tools_focus.py          # CRUD + regra de negócio: start/finish/cancel/get_active/stats/history
└── tools.py                # re-exporta as novas funções (fachada)

webapp/backend/routers/
└── tasks.py                # + rotas /focus/* (start, active, finish, cancel, today, week, history)

webapp/frontend/src/pages/kaguya/
├── types.ts                # + FocusSession, FocusPrefs, FocusStats
├── kaguyaApi.ts             # + kaguyaApi.focus.{start,active,finish,cancel,today,week,history}
├── KaguyaShell.tsx          # + montagem do FocusWidget (persistente, fora do switch de views)
├── components/
│   └── FocusWidget.tsx      # widget flutuante: fase, tempo restante, tarefa, concluir/cancelar
├── modals/
│   └── FocusStartModal.tsx  # escolher preset/custom e iniciar (a partir de tarefa ou avulso)
└── screens/
    └── TodayScreen.tsx      # + resumo "Focado hoje" e série de 7 dias (Meu Dia)
```

**Structure Decision**: Web application dentro do monorepo já existente — backend
`agents/kaguya/` + `webapp/backend/routers/tasks.py`, frontend
`webapp/frontend/src/pages/kaguya/`. Mesmo padrão de todas as specs anteriores da Kaguya
(webapp-only, sem tool ADK, sem projeto/pasta nova).

## Complexity Tracking

Não se aplica — nenhuma violação do Constitution Check.
