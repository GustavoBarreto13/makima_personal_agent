# Implementation Plan: Tasks MVP — Fase 1 do Sistema de Tarefas Próprio

**Branch**: `011-tasks-mvp` | **Date**: 2026-06-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-tasks-mvp/spec.md` (filha da master
[`specs/010-kaguya-tasks-app/`](../010-kaguya-tasks-app/spec.md))

## Summary

Primeiro corte utilizável do sistema de tarefas próprio: o PostgreSQL local vira o motor
de tarefas (sai o TickTick), com o schema completo da master aplicado de uma vez. A
camada de lógica única vive nas tools da Kaguya (padrão Nami); o canal Telegram (agente)
e o canal webapp (router FastAPI `/api/tasks/*` + shell React `KaguyaShell`) são fachadas
finas e paritárias. Entregas: CRUD completo (tarefas/subtarefas/projetos/grupos/colunas),
view lista + Kanban + tela Hoje com quick-add, captura NLP em português,
`complete_payment_task` atômica no mesmo banco, e aposentadoria do MCP do TickTick
(mantendo o MCP do Google Calendar intacto).

## Technical Context

**Language/Version**: Python 3.12 (backend/agentes), TypeScript 5.8 + React 19 (frontend)

**Primary Dependencies**: google-adk (Agent, McpToolset p/ Calendar), python-telegram-bot,
FastAPI + Pydantic, psycopg2-binary (síncrono), Vite 6 + Tailwind 3 (frontend).
**Nenhuma dependência nova no MVP** (rrule/dateutil só na Fase 2).

**Storage**: PostgreSQL existente (mesmo banco de Nami/Frieren/Journal), acesso via
`agents/db.py` (`get_conn`, `run_select`, `run_dml`). Schema novo:
`agents/kaguya/schema_tasks_pg.sql`, aplicado por `scripts/setup_schemas.py`
(executado de dentro do container `makima-web` no VPS — ver CLAUDE.md raiz).

**Testing**: pytest, seguindo o padrão existente em `tests/` (`tests/agents/`,
`tests/test_finances_router.py`): unit tests da camada de lógica (posições esparsas,
regras de cascata, atomicidade) + testes do router com FastAPI TestClient. Validação
end-to-end manual via `quickstart.md`.

**Target Platform**: VPS Linux (Docker/Dokploy) — container `makima-web` (webapp) e bot
coordinator; frontend buildado pelo Vite e servido pelo backend.

**Project Type**: Web application (backend FastAPI + frontend React) + agente
conversacional (Telegram/ADK) sobre a mesma camada de lógica.

**Performance Goals**: interações CRUD percebidas como instantâneas no webapp
(<300ms por mutação em rede local); resposta da Kaguya limitada pela latência do
Gemini (sem chamadas N+1 ao banco — uma query por listagem).

**Constraints**: single-user; soft delete em tudo; paridade total de canais (nenhuma
regra de negócio fora da camada de lógica); fuso fixo `America/Sao_Paulo`; zero
referência a TickTick no runtime após esta fase.

**Scale/Scope**: 1 usuário; centenas a poucos milhares de tarefas; ~6 telas/estados de
frontend (sidebar, lista, Kanban, Hoje, TaskModal, ProjectModal); ~15 tools da Kaguya;
~18 endpoints REST.

## Constitution Check

*GATE: constitution v1.0.0 — verificado antes do Phase 0 e re-verificado pós-design.*

| Princípio | Avaliação |
|---|---|
| **I. Agent Specialization** | ✅ Kaguya continua dona exclusiva do domínio tarefas+agenda; Makima não ganha lógica. A tool cross-domain `complete_payment_task` já existe, continua declarada no `CLAUDE.md` da Kaguya e fica **mais simples** (uma transação local em vez de duas APIs). ⚠️ A linha descritiva do princípio ("kaguya → TickTick + Google Calendar via MCP") fica desatualizada — o spec FR-015 exige **PATCH amendment** da constitution (1.0.0 → 1.0.1) como tarefa explícita desta fase. Não é violação de princípio: é atualização factual do backend do domínio. |
| **II. Hybrid Batch + Agentic** | ✅ Nenhum batch n8n é migrado; o MVP só substitui a camada interativa (TickTick API → Postgres). Lembretes agendados (Fase 5) respeitarão este princípio quando chegarem. |
| **III. Self-Contained Agents** | ✅ `agents/kaguya/` permanece auto-contido: `__init__.py`, `tools.py` (+ módulos), `agent.py`, `CLAUDE.md` (reescrito) e ganha `schema_tasks_pg.sql` — exatamente o padrão exigido. Acesso cross-domain à Nami via helper explícito e documentado. |
| **IV. Portuguese-First UX** | ✅ Kaguya responde em português, confirma interpretações de NLP, comunica erros sem stacktrace. Personalidade preservada. |
| **V. Minimal Footprint** | ✅ Zero dependência nova. Tabelas novas justificadas: domínio genuíno (tarefas) perdendo a API externa que era seu storage. PostgreSQL é o storage padrão da constitution. Schema completo aplicado de uma vez é YAGNI-compatível: evita 4 migrações futuras já especificadas na master (não é especulação — as fases estão especificadas). |
| **Constraints arquiteturais** | ✅ `gemini-2.5-flash`; MCP só stdio (Calendar mantido como está); psycopg2 síncrono; python-telegram-bot. A **remoção** do MCP TickTick reduz a superfície MCP. |

**Resultado**: PASS (com a pendência de PATCH amendment registrada como tarefa, não como violação).

## Project Structure

### Documentation (this feature)

```text
specs/011-tasks-mvp/
├── spec.md              # especificação (pronta)
├── plan.md              # este arquivo
├── research.md          # Phase 0 — decisões técnicas
├── data-model.md        # Phase 1 — delta do MVP sobre o schema da master
├── quickstart.md        # Phase 1 — guia de validação end-to-end
├── contracts/
│   ├── api-tasks.md     # contrato REST /api/tasks/*
│   └── kaguya-tools.md  # contrato das tools do agente (paridade com a API)
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
agents/kaguya/                      # agente reescrito (padrão Nami)
├── __init__.py
├── agent.py                        # create_kaguya_agent(): perde McpToolset TickTick, mantém Calendar
├── tools.py                        # fachada: re-exporta tools; cross-agent complete_payment_task
├── tools_tasks.py                  # NOVO — camada de lógica: CRUD de tarefas/subtarefas, completar/reabrir, posições
├── tools_projects.py               # NOVO — projetos, grupos, colunas (Kanban)
├── schema_tasks_pg.sql             # NOVO — schema da master (fonte: specs/010/data-model.md)
└── CLAUDE.md                       # reescrito: nova arquitetura, tools, personalidade

agents/nami/tools.py                # ganha helper interno create_transaction_on_cursor(cur, ...)
                                    # (Nami continua dona do SQL dela; usado pela transação atômica)

mcp_servers/ticktick/               # REMOVIDO (git guarda histórico)
mcp_servers/calendar/               # intacto

coordinator/agent.py                # _MAKIMA_INSTRUCTION atualizada (sem TickTick)

scripts/setup_schemas.py            # aplica também schema_tasks_pg.sql + seed Inbox

webapp/backend/routers/tasks.py     # NOVO — router /api/tasks/* (padrão journal.py/finances.py)
webapp/backend/main.py              # registra o router

webapp/frontend/src/
├── App.tsx                         # rota /tasks/* antes do catch-all
├── components/Layout.tsx           # entrada Kaguya na sidebar global (--c-kaguya)
└── pages/kaguya/                   # NOVO shell (frontend-design-guide.md da master)
    ├── KaguyaShell.tsx
    ├── TweaksPanel.tsx
    ├── kaguya.css                  # tokens OKLCH escopados .kg-app
    ├── kaguyaApi.ts
    ├── types.ts
    ├── screens/{TodayScreen,ListScreen,KanbanScreen}.tsx
    ├── modals/{TaskModal,ProjectModal}.tsx
    ├── components/{TaskRow,TaskCard,QuickAdd,SidebarNav}.tsx
    └── ui/                         # ícones, chips de prioridade/projeto

tests/
├── agents/test_kaguya_tasks.py     # NOVO — camada de lógica (posições, cascata, atomicidade)
└── test_tasks_router.py            # NOVO — router (padrão test_finances_router.py)

.specify/memory/constitution.md     # PATCH amendment 1.0.1 (linha do domínio kaguya)
CLAUDE.md (raiz)                    # tabela de agentes/arquitetura atualizada
```

**Structure Decision**: web application sobre a estrutura real do repo. A camada de
lógica única (FR-002) são os módulos `tools_*.py` da Kaguya — o router FastAPI os
importa e envelopa (exatamente como `routers/finances.py` envelopa as tools da Nami),
e o agente os expõe ao Gemini. Nenhuma camada nova é inventada.

## Complexity Tracking

Sem violações da constitution — tabela não aplicável. A única pendência de governança
(PATCH amendment 1.0.1) está registrada no Constitution Check e vira tarefa.
