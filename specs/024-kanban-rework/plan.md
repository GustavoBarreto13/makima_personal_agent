# Implementation Plan: 024 · Kanban "Vidro" + Views configuráveis

**Branch**: `024-kanban-rework` | **Date**: 2026-06-18 | **Spec**: [`spec.md`](./spec.md)

**Input**: Feature specification from `specs/024-kanban-rework/spec.md`

## Summary

Reescrever a tela Kanban do Kaguya com o visual **"Vidro"** do handoff (glass/OKLCH, numerais grandes, capacity meter, anel de subtarefas, rodapé-resumo, chips), **mantendo as otimizações de performance** do `@dnd-kit` (sem `onDragOver` por pixel, DragOverlay, optimistic update, reload silencioso). Além do reskin, adicionar **views de Kanban configuráveis** — salvas e nomeadas, globais, persistidas no backend (nova tabela `kanban_views`), cada uma capturando adornos visíveis + métricas dos 3 slots do rodapé + um filtro opcional (`FilterRules` inline, reusando o DSL das smart-lists). View built-in **"Completa"** é o default e o baseline de fidelidade.

Abordagem técnica: backend = nova tabela + camada de lógica `tools_kanban_views.py` (reusa `_build_where_from_rules`) + endpoints `/api/tasks/kanban-views/*`; frontend = reescrita do CSS/markup do board e cards no shell Kaguya, novo seletor de views, memória de view ativa por lista em localStorage, CRUD via `kaguyaApi`.

## Technical Context

**Language/Version**: Python 3.12 (backend) · TypeScript 5 / React 19 (frontend)
**Primary Dependencies**: FastAPI + psycopg2-binary (sync) · React + Vite 6 + `@dnd-kit/core`+`/sortable` (já no projeto)
**Storage**: PostgreSQL compartilhado (`DATABASE_URL`) — schema do domínio em `agents/kaguya/schema_tasks_pg.sql`
**Testing**: pytest (`tests/agents/test_kaguya_*`) para a camada de lógica; Vitest (frontend) onde houver lógica pura
**Target Platform**: webapp servido pelo container `makima-web` (FastAPI serve `frontend/dist/`)
**Project Type**: web application (frontend React + backend FastAPI, mesmo container)
**Performance Goals**: drag fluido ~60fps com ≥30 cards; `backdrop-filter: blur` não pode causar repaint do board inteiro por frame (R20)
**Constraints**: zero regressão das otimizações DnD existentes (R19); pt-BR; fuso UTC-3 nas datas dos cards; reusar o DSL de filtros existente (sem motor novo)
**Scale/Scope**: uso single-user; 1 tela reescrita + 1 tabela + 4 endpoints + ~3 componentes novos (seletor de view, modal de view, ProgressRing)

## Constitution Check

*GATE: deve passar antes da Phase 0 e ser reavaliado após a Phase 1.*

| Princípio | Avaliação | Status |
|---|---|---|
| **I. Agent Specialization** | A lógica das views vive em `agents/kaguya/tools_kanban_views.py` (domínio tarefas). Makima não implementa nada; é feature de UI sobre a camada de lógica. | ✅ |
| **II. Hybrid Batch + Agentic** | Não migra batch para ADK; é feature interativa do webapp. | ✅ |
| **III. Self-Contained Agents** | Tabela nova no schema do próprio kaguya; lógica no pacote do agente; sem dependência cross-agent nova. | ✅ |
| **IV. Portuguese-First UX** | Toda a UI e mensagens em pt-BR. | ✅ |
| **V. Minimal Footprint** | **1** tabela nova (mínimo p/ a feature pedida pelo usuário); **reusa** o DSL de filtros (sem motor novo) e o sistema de `Tweaks`/localStorage existente. | ✅ |

**Desvio anotado (ver Complexity Tracking):** as views **não** ganham fachada Telegram (quebra parcial do princípio de paridade de canais do `agents/kaguya/CLAUDE.md`). Justificado: views são um conceito puramente visual do board; a camada de lógica única é preservada, só não há comando de bot para elas.

**Resultado do gate:** PASS (Phase 0 liberada). Reavaliação pós-design: PASS (sem novas violações — ver fim da Phase 1).

## Project Structure

### Documentation (this feature)

```text
specs/024-kanban-rework/
├── plan.md              # Este arquivo
├── spec.md              # Spec + clarifications
├── research.md          # Phase 0 (decisões técnicas)
├── data-model.md        # Phase 1 (tabela kanban_views + tipos)
├── quickstart.md        # Phase 1 (roteiro de validação)
├── contracts/
│   └── kanban-views.md  # Contrato REST /api/tasks/kanban-views/*
└── design_handoff_kaguya_kanban/   # handoff (fonte da verdade visual)
```

### Source Code (repository root)

```text
agents/kaguya/
├── schema_tasks_pg.sql        # + tabela kanban_views + seed da view "Completa"
├── tools_kanban_views.py      # NOVO — camada de lógica: CRUD + resolução de tarefas filtradas do board
├── tools_filters.py           # REUSO — _build_where_from_rules (refator mínimo: base parametrizável)
└── CLAUDE.md                  # + seção "Views de Kanban"

webapp/backend/routers/
└── tasks.py                   # + rotas /api/tasks/kanban-views/* (require_user, Pydantic, _check_result)

webapp/frontend/src/pages/kaguya/
├── kaguyaApi.ts               # + métodos kanbanViews.{list,create,update,delete}
├── types.ts                   # + KanbanView, KanbanViewDisplay, SummaryMetric, etc.
├── screens/KanbanScreen.tsx   # REESCRITA — markup/estilo "Vidro" + seletor de view + filtro + memória por lista
├── components/TaskCard.tsx     # REESCRITA — card glass + chips + prioridade
├── components/ProgressRing.tsx # NOVO — anel SVG de subtarefas
├── components/KanbanViewModal.tsx # NOVO — criar/editar view (adornos + slots + filtro)
├── components/SummaryFooter.tsx   # NOVO — rodapé-resumo com slots configuráveis
├── kaguya.css                 # + tokens/regras "Vidro" (.kg-board/.kg-col/.kg-card/.kg-summary, light+dark)
└── ui/                        # fontes Hanken Grotesk / DM Sans / DM Mono no pipeline

scripts/
└── (migração one-time): aplicar ALTER/CREATE via setup_schemas.py no container makima-web

tests/agents/
└── test_kaguya_kanban_views.py # NOVO — CRUD, built-in protegida, filtro reusando o DSL
```

**Structure Decision**: Web application existente (Shell pattern do Kaguya). Backend segue o padrão de router de `webapp/CLAUDE.md` (`require_user` + Pydantic + `_check_result`) e a camada de lógica do `agents/kaguya/`. Frontend segue o Shell pattern + API por domínio (`kaguyaApi`) + CSS isolado por domínio (`kaguya.css`). Nada de estado global novo (só `useState`/`useEffect` + localStorage para a view ativa).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Views sem fachada Telegram (quebra parcial da paridade de canais) | Views são um conceito visual do board (adornos, glass, slots); não há ação conversacional equivalente | Criar tools de bot para views seria footprint morto (ninguém pede "mude a view do meu Kanban" pelo Telegram) — viola Minimal Footprint |
| 1 tabela nova (`kanban_views`) | Requisito explícito do usuário (views salvas/persistidas, decidido em clarify) | localStorage-only foi a alternativa, mas o usuário pediu persistência server-side e reuso entre dispositivos |
