# Implementation Plan: Tiny Experiments (Kaguya)

**Branch**: `master` (sem branch própria — regra do usuário: não criar branch automaticamente) | **Date**: 2026-06-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/029-tasks-tiny-experiments/spec.md`

## Summary

Nova seção **Tiny Experiments** dentro da Kaguya: o usuário cria experimentos com prazo
("Vou [ação] por [duração]"), faz check-ins periódicos (fez? / sensação 1–5 / nota) com
aderência que **perdoa falhas**, pode **pausar/retomar**, e **encerra com uma revisão**
(veredicto persistir/pausar/pivotar + aprendizado). Experimentos ativos do dia aparecem no
ritual "Meu Dia" com check-in de 1 toque.

Abordagem técnica: seguir o padrão de **paridade de canais** da Kaguya — toda regra na camada
de lógica pura (`agents/kaguya/tools_experiments.py`, espelhando `tools_habits.py`), exposta
pelo webapp via `/api/tasks/experiments/*` (router `webapp/backend/routers/tasks.py`). UI é
uma nova `view` dentro da `KaguyaShell` (como Hábitos/Eisenhower), reusando tokens `--kg*`,
`DatePicker`, `lib/dateUtils`. **Webapp-first**: nenhuma tool exposta ao agente ADK nesta
fatia (lógica nasce agnóstica de canal para o Telegram futuro). Persistência em PostgreSQL
compartilhado: 2 tabelas novas em `agents/kaguya/schema_tasks_pg.sql`.

## Technical Context

**Language/Version**: Python 3.12 (backend/lógica) · TypeScript + React 19 (frontend)

**Primary Dependencies**: FastAPI + uvicorn (REST) · `psycopg2-binary` (PostgreSQL síncrono) · React + Vite 6 + react-router-dom 7 (webapp) · `@dnd-kit` (já presente; não necessário aqui)

**Storage**: PostgreSQL compartilhado (mesmo banco de Nami/Frieren/Journal/Kaguya), via helper `agents/db.py` (`get_conn`, `run_select`)

**Testing**: `pytest` para o motor puro de aderência (gate isolado, espelhando `tests/agents/test_kaguya_habit_strength.py`) · validação manual via `quickstart.md` (REST + UI)

**Target Platform**: Container Linux no VPS (Docker Swarm) servindo FastAPI + `frontend/dist`

**Project Type**: Web application (backend FastAPI + frontend React) — domínio da Kaguya

**Performance Goals**: usuário único; escala trivial (dezenas de experimentos, centenas de check-ins) — sem metas de throughput

**Constraints**: correção de fuso **UTC-3** (`America/Sao_Paulo`) em toda derivação de data/"hoje"; escopo enxuto; CSS isolado no escopo `.kg-app` (evitar vazamento)

**Scale/Scope**: 1 usuário · ~1 nova aba · 2 tabelas · ~9 funções de lógica · ~10 endpoints · ~4 telas/modais React

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Avaliação contra a Constitution v1.0.1:

- **I. Agent Specialization (NON-NEGOTIABLE)** — ✅ Tiny Experiments é sub-domínio da **Kaguya**
  (tarefas + rotinas). A lógica vive em `agents/kaguya/tools_experiments.py`. Makima só delega;
  não há lógica no coordinator. **Sem tool cross-domain** (não toca Nami/outros).
- **II. Hybrid Batch + Agentic** — ✅ Feature interativa (webapp); nada de batch n8n é migrado.
- **III. Self-Contained Agents** — ✅ A lógica importa só de `agents.db`; sem dependência de
  runtime de outro agente. Fica dentro do pacote `agents/kaguya/`.
- **IV. Portuguese-First UX** — ✅ UI em português. Bot Telegram adiado (fatia futura); quando
  vier, as respostas seguirão a regra pt-BR.
- **V. Minimal Footprint** — ✅ **Tool nova num agente existente**, não um agente novo.
  PostgreSQL é o storage padrão. 2 tabelas justificadas por dado de domínio genuinamente novo
  (experimentos + check-ins) que nenhuma tabela atual cobre.

**Architecture constraints**: `psycopg2` síncrono ✅ · MCP não aplicável (sem novo MCP) ·
container só do coordinator/webapp ✅. **Sem violações** → Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/029-tasks-tiny-experiments/
├── spec.md              # Especificação (com Clarifications)
├── plan.md              # Este arquivo
├── research.md          # Fase 0 — decisões (aderência, fuso, exclusão, pausa)
├── data-model.md        # Fase 1 — tabelas, campos derivados, transições de estado
├── quickstart.md        # Fase 1 — guia de validação ponta a ponta
├── contracts/
│   └── api-experiments.md   # Fase 1 — contrato REST /api/tasks/experiments/*
└── tasks.md             # Fase 2 — gerado por /speckit-tasks (NÃO criado aqui)
```

### Source Code (repository root)

```text
agents/kaguya/
├── schema_tasks_pg.sql        # + 2 tabelas (tiny_experiments, tiny_experiment_logs)
├── experiment_adherence.py    # NOVO — motor PURO de aderência (sem banco; gate pytest)
├── tools_experiments.py       # NOVO — camada de lógica (CRUD + check-in + pausa + review + due-today)
└── tools.py                   # + re-export das funções (sem registrar no agent ADK nesta fatia)

webapp/backend/routers/
└── tasks.py                   # + endpoints /experiments/* + modelos Pydantic

webapp/frontend/src/pages/kaguya/
├── types.ts                   # + 'experiments' em KaguyaView; interfaces Experiment/ExperimentLog
├── kaguyaApi.ts               # + sub-objeto experiments.*
├── kaguya.css                 # + classes .kg-exp-*
├── KaguyaShell.tsx            # + branch renderMain('experiments') + titleMap + modal state
├── components/SidebarNav.tsx  # + item "Experimentos" (🧪)
├── screens/
│   ├── ExperimentsScreen.tsx       # NOVO — lista de cards + check-in rápido
│   ├── ExperimentDetailScreen.tsx  # NOVO — tracker (logs) + revisão + pausar/retomar
│   └── TodayScreen.tsx             # + seção "Experimentos de hoje" (Meu Dia)
└── modals/
    └── ExperimentModal.tsx         # NOVO — criar/editar experimento

tests/agents/
└── test_kaguya_experiment_adherence.py  # NOVO — gate do motor puro de aderência
```

**Structure Decision**: Web application no monorepo existente. Backend = camada de lógica em
`agents/kaguya/` + router FastAPI em `webapp/backend/`. Frontend = nova `view` dentro da
`KaguyaShell` (não um shell novo) — decisão alinhada ao pedido "aba dentro da Kaguya" e ao
padrão de Hábitos/Eisenhower. O motor de aderência é **puro** (sem banco), espelhando
`habit_strength.py`/`capacity.py`, para ser testável isoladamente.

## Complexity Tracking

> Sem violações da Constitution — nada a justificar.
