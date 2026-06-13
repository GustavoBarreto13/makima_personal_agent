# Implementation Plan: Planejamento de Projetos na Kaguya

**Branch**: `020-tasks-projetos` | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-tasks-projetos/spec.md` (origem: conceito de
brainstorming em `C:\Users\gusta\.claude\plans\quero-que-a-kaguya-luminous-waffle.md`)

## Summary

Adiciona à Kaguya uma camada de **planejamento de projetos**, ancorada em três frameworks que
se compõem: **PARA** organiza as Listas por acionabilidade (baldes Projetos/Áreas/Arquivo);
**GTD Natural Planning** dá o esqueleto de cada Projeto (propósito → visão → brainstorm →
fases → próximas ações); e o **Meu Dia** existente continua sendo a execução. Um Projeto é uma
**Lista promovida** (tabela-satélite `project_plans` 1:1 + `para_type='project'`), com
**Fases** (`project_phases`, fase=marco) agrupando as tarefas que já existem (via `phase_id`
opcional). A **saúde** é um motor puro derivado, ponderado por estimativa (`duration_min`).
A superfície primária é a **webapp, que guia a construção** (wizard passo a passo, empty
states que ensinam — é o critério de sucesso da feature); o Telegram cobre o essencial.

## Technical Context

**Language/Version**: Python 3.12 (backend/agente), TypeScript 5.8 + React 19 (frontend).

**Primary Dependencies**: google-adk (Agent), python-telegram-bot, FastAPI + Pydantic,
psycopg2-binary (síncrono), Vite 6 + Tailwind 3 (frontend). **Nenhuma dependência nova** —
sem biblioteca de Gantt (a timeline é desenhada com os primitivos do shell Kaguya); o motor de
saúde é Python puro (estilo `capacity.py`).

**Storage**: PostgreSQL existente. Schema novo aditivo: `agents/kaguya/schema_projects_pg.sql`
(tabelas `project_plans`, `project_phases`; colunas `para_type` em Lista/Grupo, `phase_id` em
`tasks`), aplicado por `scripts/setup_schemas.py` de dentro do container `makima-web` no VPS.
Acesso via `agents/db.py` (`get_conn`, `run_select`, `run_dml`).

**Testing**: pytest no padrão `tests/`: motores puros em `tests/agents/test_project_health.py`
e `test_project_templates.py` (à la `test_capacity` — sem banco); camada de lógica em
`tests/agents/` (contra banco com schema aplicado); router em `tests/test_tasks_router.py`
(FastAPI TestClient). E2E manual via `quickstart.md`.

**Target Platform**: VPS Linux (Docker/Dokploy) — container `makima-web` + bot coordinator;
frontend buildado pelo Vite e servido pelo backend.

**Project Type**: Web application (backend FastAPI + frontend React) + agente conversacional
(Telegram/ADK) sobre a mesma camada de lógica.

**Performance Goals**: interações CRUD percebidas como instantâneas no webapp (<300ms/mutação
em rede local); saúde calculada em memória a partir de uma query por leitura (sem N+1);
resposta da Kaguya limitada pela latência do Gemini.

**Constraints**: single-user; soft delete reaproveitado para o Arquivo; paridade total de
canais (nenhuma regra de negócio fora da camada de lógica); fuso fixo `America/Sao_Paulo`;
aditivo e não-destrutivo sobre o legado (Listas existentes não são movidas/apagadas).

**Scale/Scope**: 1 usuário; dezenas de projetos, centenas de fases, milhares de tarefas;
~8 telas/estados de frontend novos (SidebarNav reestruturada, ProjectScreen, ProjectWizard,
PhaseBoard, TimelineView, modais) + ~12 funções na camada de lógica (`tools_plans.py`) +
2 motores puros + ~14 endpoints REST novos + ~9 tools de agente.

## Constitution Check

*GATE: constitution v1.0.1 — verificado antes do Phase 0 e re-verificado pós-design.*

| Princípio | Avaliação |
|---|---|
| **I. Agent Specialization** | ✅ Kaguya continua dona exclusiva do domínio tarefas+agenda; o planejamento é uma extensão natural do mesmo domínio (não um agente novo). Makima não ganha lógica — só roteamento. Nenhuma tool cross-domain nova (não toca a Nami). A linha do princípio ("kaguya → tarefas + agenda") segue válida — **sem amendment**. |
| **II. Hybrid Batch + Agentic** | ✅ Nenhum batch n8n migrado; só a camada interativa ganha capacidade. O ritual de revisão de Áreas (futuro) respeitará este princípio se virar agendado. |
| **III. Self-Contained Agents** | ✅ `agents/kaguya/` permanece auto-contido: ganha `tools_plans.py`, `project_health.py`, `project_templates.py`, `schema_projects_pg.sql` — exatamente o padrão. Sem dependência de outro agente em runtime. |
| **IV. Portuguese-First UX** | ✅ Kaguya responde em português, ecoa interpretações, comunica saúde (🟢/🟡/🔴) e erros sem stacktrace. Personalidade preservada. |
| **V. Minimal Footprint** | ✅ **Zero dependência nova**. Reusa `duration_min` (sem campo de estimativa novo), o soft delete (Arquivo), o motor puro (`capacity.py` como molde) e a Lista como container (sem tabela de tarefas paralela). Tabelas novas justificadas: domínio genuíno (planejamento) sem proxy adequado nas tabelas atuais. `resource` no enum (forward-compat) evita migração futura — não é especulação de uso, é evitar custo de migração de um caminho já decidido. |
| **Constraints arquiteturais** | ✅ `gemini-2.5-flash`; sem MCP novo; psycopg2 síncrono; python-telegram-bot. Nenhuma superfície MCP adicionada. |

**Resultado**: PASS — sem violações e sem pendência de governança (diferente da 011, esta
fatia não exige amendment da constitution).

## Project Structure

### Documentation (this feature)

```text
specs/020-tasks-projetos/
├── spec.md              # especificação (pronta)
├── plan.md              # este arquivo
├── research.md          # Phase 0 — decisões técnicas (D1–D12)
├── data-model.md        # Phase 1 — schema delta + contrato dos motores puros
├── design-guide.md      # Phase 1 — wizard guiado, tela do Projeto, timeline (UX)
├── contracts/
│   ├── api-tasks-plans.md   # contrato REST /api/tasks/plans/* + PARA
│   └── kaguya-tools.md      # contrato das tools do agente (paridade com a API)
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
agents/kaguya/
├── schema_projects_pg.sql          # NOVO — project_plans, project_phases, para_type, phase_id (idempotente)
├── project_health.py               # NOVO — motor PURO: compute_project_health() (estilo capacity.py)
├── project_templates.py            # NOVO — motor PURO: TEMPLATES + get_template/list_templates
├── tools_plans.py                  # NOVO — camada de lógica: planos, fases, promover/rebaixar, para_type, saúde
├── tools_projects.py               # ALTERADO — get_sidebar() agrupa por balde PARA; update_project/group aceitam para_type
├── tools.py                        # ALTERADO — fachada: re-exporta as tools de planejamento
├── agent.py                        # ALTERADO — registra as tools novas; _INSTRUCTION ganha os fluxos de projeto
└── CLAUDE.md                       # ALTERADO — documenta a camada de planejamento, PARA, tools, saúde

coordinator/agent.py                # ALTERADO — _MAKIMA_INSTRUCTION reconhece os fluxos de projeto (roteia p/ Kaguya)

scripts/setup_schemas.py            # ALTERADO — aplica também schema_projects_pg.sql

webapp/backend/routers/tasks.py     # ALTERADO — rotas /api/tasks/plans/* + para_type (contracts/api-tasks-plans.md)

webapp/frontend/src/pages/kaguya/
├── kaguyaApi.ts                    # ALTERADO — métodos plans.* + para_type
├── types.ts                        # ALTERADO — ProjectPlan, Phase, Health, para_type
├── components/SidebarNav.tsx       # ALTERADO — baldes PARA no topo; Grupos aninhados; "Promover a Projeto"
├── screens/ProjectScreen.tsx       # NOVO — cabeçalho (propósito/visão/saúde + próxima ação) + board de fases
├── screens/TimelineView.tsx        # NOVO — timeline Gantt-leve (marcos = fases com data)
├── modals/ProjectWizard.tsx        # NOVO — wizard passo a passo (peça central da UX — design-guide.md)
├── components/PhaseBoard.tsx       # NOVO — board de fases (seções com tarefas + barra de progresso)
├── components/PhaseColumn.tsx      # NOVO — coluna/seção de uma fase
└── ui/HealthBadge.tsx, ProgressBar.tsx   # NOVO — selo 🟢/🟡/🔴 e barra ponderada

tests/
├── agents/test_project_health.py   # NOVO — motor puro (ponderação, fallback, limiares de status)
├── agents/test_project_templates.py# NOVO — motor puro (moldes, fases semeadas)
├── agents/test_kaguya_plans.py      # NOVO — camada de lógica (promover, fases, para_type, saúde)
└── test_tasks_router.py            # ALTERADO — rotas /plans/* e para_type

CLAUDE.md (raiz)                    # ALTERADO — nota da camada de planejamento na tabela/árvore da Kaguya
```

**Structure Decision**: web application sobre a estrutura real do repo. A camada de lógica
única (FR-015) são `tools_plans.py` + os motores puros — o router FastAPI os importa e
envelopa (como `routers/tasks.py` já faz com `tools_tasks`/`tools_projects`), e o agente os
expõe ao Gemini. Nenhuma camada nova é inventada. O frontend reusa o shell `pages/kaguya/` e
seus tokens OKLCH (`kaguya.css`); a peça central de UX é o `ProjectWizard` (ver
`design-guide.md`), que materializa o princípio "o webapp guia a construção" (SC-001).

**Frontend — fonte única de verdade**: `design-guide.md` desta spec é o guia do wizard, da
tela do Projeto e da timeline, ancorado nos tokens/primitivos já existentes do shell Kaguya
(não há protótipo de alta fidelidade nesta fatia — o design é descrito em texto + ASCII).

## Complexity Tracking

Sem violações da constitution — tabela não aplicável. Riscos a monitorar (não-violações):

- **`get_sidebar()` reestruturada**: a sidebar é consumida por todas as telas; a mudança para
  baldes PARA precisa preservar o contrato existente (Inbox no topo, contagem de abertas) e só
  **acrescentar** o agrupamento por balde — testar a não-regressão das telas atuais.
- **Saúde sempre derivada**: o cálculo roda a cada leitura do plano; manter uma query por
  leitura (carregar tarefas+fases de uma vez) para não criar N+1.
- **Wizard (SC-001)**: o critério de sucesso é qualitativo (um leigo consegue planejar) —
  validado por UAT no `quickstart.md`, não por teste automatizado.
