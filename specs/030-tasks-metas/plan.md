# Implementation Plan: Metas (Kaguya)

**Branch**: `master` (sem branch própria — regra do usuário: não criar branch automaticamente) | **Date**: 2026-07-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/030-tasks-metas/spec.md`

## Summary

Nova seção **Metas** dentro da Kaguya: a camada de *direção* à qual a Tiny Experiments (spec 029)
se vincula. O usuário cria uma meta (título + prazo + porquê + área da vida opcional), define como
mede o sucesso — **métrica-alvo** (número + unidade) e/ou **marcos** — e acompanha um **progresso**
que combina os dois. Vincula **experimentos, tarefas e hábitos** já existentes como os "movimentos"
do plano (um item pertence a **no máximo uma** meta), vê-os agrupados por tipo com seu status, e
encerra a meta com uma **revisão** (desfecho `atingida`/`não atingida`/`revisar` + aprendizado).

Abordagem técnica: seguir o padrão de **paridade de canais** da Kaguya — toda regra na camada de
lógica pura (`agents/kaguya/tools_goals.py`, espelhando `tools_experiments.py`), com o progresso
num **motor puro** testável (`goal_progress.py`, espelhando `experiment_adherence.py`). Exposta pelo
webapp via `/api/tasks/goals/*` (router `webapp/backend/routers/tasks.py`). UI é uma nova `view`
dentro da `KaguyaShell` (como Experimentos/Hábitos), reusando tokens `--kg*`, `DatePicker`,
`lib/dateUtils`. **Webapp-first**: nenhuma tool exposta ao agente ADK nesta fatia. Persistência em
PostgreSQL compartilhado: 2 tabelas novas (`goals`, `goal_milestones`) + a coluna **`goal_id`**
acrescentada de forma idempotente a `tiny_experiments`, `tasks` e `habits` (o gancho **D5** que a
029 deixou reservado). O vínculo é um FK `ON DELETE SET NULL` — excluir a meta **desvincula**, nunca
apaga os itens (FR-010/SC-005).

## Technical Context

**Language/Version**: Python 3.12 (backend/lógica) · TypeScript + React 19 (frontend)

**Primary Dependencies**: FastAPI + uvicorn (REST) · `psycopg2-binary` (PostgreSQL síncrono) · React + Vite 6 + react-router-dom 7 (webapp). Sem dependência nova.

**Storage**: PostgreSQL compartilhado (mesmo banco de Nami/Frieren/Journal/Kaguya), via helper `agents/db.py` (`get_conn`, `run_select`)

**Testing**: `pytest` para o motor puro de progresso (gate isolado, espelhando `test_kaguya_experiment_adherence.py`) · validação manual via `quickstart.md` (REST + UI)

**Target Platform**: Container Linux no VPS (Docker Swarm) servindo FastAPI + `frontend/dist`

**Project Type**: Web application (backend FastAPI + frontend React) — domínio da Kaguya

**Performance Goals**: usuário único; escala trivial (dezenas de metas, poucos movimentos por meta) — sem metas de throughput

**Constraints**: correção de fuso **UTC-3** (`America/Sao_Paulo`) em toda derivação de data/"hoje"/prazo; escopo enxuto; CSS isolado no escopo `.kg-app`

**Scale/Scope**: 1 usuário · 1 nova aba · 2 tabelas + 3 colunas `goal_id` · ~10 funções de lógica · ~13 endpoints · ~3 telas/modais React

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Avaliação contra a Constitution v1.0.1:

- **I. Agent Specialization (NON-NEGOTIABLE)** — ✅ Metas é sub-domínio da **Kaguya** (tarefas +
  rotinas + direção). A lógica vive em `agents/kaguya/tools_goals.py`. Makima só delega; nada no
  coordinator. O **vínculo cross-item** (goal ↔ experiment/task/habit) fica **dentro do próprio
  domínio Kaguya** (as três tabelas são da Kaguya) — não é uma tool cross-agent (não toca Nami etc.).
- **II. Hybrid Batch + Agentic** — ✅ Feature interativa (webapp); nada de batch n8n é migrado.
- **III. Self-Contained Agents** — ✅ A lógica importa só de `agents.db` + o motor puro local. A
  coluna `goal_id` nas tabelas da própria Kaguya não cria dependência de runtime de outro agente.
- **IV. Portuguese-First UX** — ✅ UI em português. Bot Telegram adiado (fatia futura); a regra de
  negócio nasce agnóstica de canal.
- **V. Minimal Footprint** — ✅ **Tools novas num agente existente**, não um agente novo. Reusa o
  PostgreSQL. 2 tabelas justificadas por dado de domínio genuinamente novo (meta + marcos); o
  vínculo é uma **coluna `goal_id`** (não uma tabela de junção nova) — a decisão mais enxuta dado o
  requisito de cardinalidade "um item ↔ no máximo uma meta" (ver `research.md` D1).

**Architecture constraints**: `psycopg2` síncrono ✅ · MCP não aplicável (sem novo MCP) ·
container só do coordinator/webapp ✅. **Sem violações** → Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/030-tasks-metas/
├── spec.md              # Especificação
├── plan.md              # Este arquivo
├── research.md          # Fase 0 — decisões (vínculo/cardinalidade, progresso, exclusão, área)
├── data-model.md        # Fase 1 — tabelas, colunas goal_id, campos derivados, transições
├── quickstart.md        # Fase 1 — guia de validação ponta a ponta
├── contracts/
│   └── api-goals.md     # Fase 1 — contrato REST /api/tasks/goals/*
└── tasks.md             # Fase 2 — gerado por /speckit-tasks (NÃO criado aqui)
```

### Source Code (repository root)

```text
agents/kaguya/
├── schema_tasks_pg.sql        # + 2 tabelas (goals, goal_milestones) + ALTER goal_id em
│                              #   tiny_experiments / tasks / habits (idempotente — gancho D5 da 029)
├── goal_progress.py           # NOVO — motor PURO de progresso (métrica + marcos; sem banco; gate pytest)
├── tools_goals.py             # NOVO — camada de lógica (CRUD + marcos + link/unlink + review + áreas)
└── tools.py                   # + re-export das funções (sem registrar no agente ADK nesta fatia)

webapp/backend/routers/
└── tasks.py                   # + endpoints /goals/* + modelos Pydantic

webapp/frontend/src/pages/kaguya/
├── types.ts                   # + 'goals' em KaguyaView; interfaces Goal/Milestone/GoalMovement(s)
├── kaguyaApi.ts               # + sub-objeto goals.*
├── kaguya.css                 # + classes .kg-goal-*
├── KaguyaShell.tsx            # + branch renderMain('goals') + titleMap + GoalModal state
├── components/SidebarNav.tsx  # + item "Metas" (🎯)
├── ui/Icons.tsx               # + ícone 'target'
├── screens/
│   ├── GoalsScreen.tsx            # NOVO — lista de metas (ativas por área + encerradas) com progresso
│   └── GoalDetailScreen.tsx       # NOVO — métrica/marcos + movimentos vinculados + revisão
├── modals/
│   ├── GoalModal.tsx              # NOVO — criar/editar meta
│   └── ExperimentModal.tsx        # + suporte a goalId (criar experimento já vinculado — FR-011)

tests/agents/
└── test_kaguya_goal_progress.py   # NOVO — gate do motor puro de progresso
```

**Structure Decision**: Web application no monorepo existente. Backend = camada de lógica em
`agents/kaguya/` + router FastAPI. Frontend = nova `view` dentro da `KaguyaShell` (não um shell
novo), alinhada ao padrão de Experimentos/Hábitos. O motor de progresso é **puro** (sem banco),
espelhando `experiment_adherence.py`, para ser testável isoladamente. O vínculo é uma coluna
`goal_id` nas três tabelas de execução da Kaguya (ver `research.md` D1).

## Complexity Tracking

> Sem violações da Constitution — nada a justificar.
