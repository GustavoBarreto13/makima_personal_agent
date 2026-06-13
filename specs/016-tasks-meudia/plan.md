# Implementation Plan: Meu Dia + Time-blocking — Fase 3 do Sistema de Tarefas Próprio

**Branch**: `016-tasks-meudia` | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-tasks-meudia/spec.md` (filha da master
[`specs/010-kaguya-tasks-app/`](../010-kaguya-tasks-app/spec.md), Fase 3). Constrói sobre
[`011`](../011-tasks-mvp/spec.md) (MVP), [`012`](../012-tasks-recurrence/spec.md) (recorrência) e
[`013`](../013-tasks-tags-smartlists-calendar/spec.md) (tags/smart lists/calendário).

## Summary

A tela **Meu Dia** (ritual estilo Sunsama) + **time-blocking**: o usuário monta o plano do dia
(revisar pendências de ontem → selecionar tarefas → estimar duração → arrastar para horários), e o
sistema mostra a **CapacityBar** cruzando as estimativas das tarefas com os eventos do Google Calendar
contra a janela útil 8h–22h. **Sem migração de schema** — as colunas `my_day_date`, `start_at`,
`end_at`, `duration_min` já nasceram dormentes na Fase 1; esta fatia só acrescenta **lógica**,
**fachadas** (router `/api/tasks/*` + agente Telegram) e **UI**. A capacity é uma **função pura**
isolada (testável sem banco). A leitura de eventos reusa o **MCP do Calendar já existente**
(`tools_calendar.py`); a indisponibilidade dele degrada com elegância (capacity só de tarefas), nunca
quebra a tela. Paridade total: tudo nasce na camada de lógica; a *timeline*/CapacityBar visuais são
webapp-only, com equivalente textual no Telegram.

## Technical Context

**Language/Version**: Python 3.12 (backend/agente), TypeScript 5.8 + React 19 (frontend).

**Primary Dependencies**: google-adk (Agent, McpToolset do Calendar — já em uso), python-telegram-bot,
FastAPI + Pydantic, psycopg2-binary (síncrono), Vite 6 + Tailwind 3 (frontend). **Nenhuma dependência
nova** — a fatia é puramente lógica + UI sobre o que já existe.

**Storage**: PostgreSQL existente. **Zero DDL** — as colunas-alvo (`my_day_date`, `start_at`,
`end_at`, `duration_min`) e o índice parcial `idx_tasks_my_day` já estão em
`agents/kaguya/schema_tasks_pg.sql` desde a Fase 1. Avaliar na implementação se a query de "pendências
de ontem"/"plano do dia" pede um índice extra; o parcial provavelmente basta (ver
[`data-model.md`](./data-model.md) §1).

**Testing**: pytest, padrão `tests/agents/`. Dois alvos novos: `test_kaguya_capacity.py` (função pura
`(estimativas, eventos, janela) → stats` — SC-001) e `test_kaguya_meudia.py` (camada de lógica contra
Postgres de teste — SC-003/SC-004/SC-005). Validação end-to-end manual via
[`quickstart.md`](./quickstart.md).

**Target Platform**: VPS Linux (Docker/Dokploy) — container `makima-web` (webapp + router) e bot
coordinator; frontend buildado pelo Vite e servido pelo backend.

**Project Type**: Web application (FastAPI + React) + agente conversacional (Telegram/ADK) sobre a
mesma camada de lógica (`agents/kaguya/tools_tasks.py`).

**Performance Goals**: `list_my_day` resolve o ritual com **poucas queries** (sem N+1): uma para o
plano/pendências/sugestões (ou poucas seções) + uma chamada ao Calendar pela janela do dia. CapacityBar
recalcula no front só o layout das larguras (os números vêm prontos do endpoint).

**Constraints**: single-user; soft delete preservado; **paridade total** (nenhuma regra de negócio
fora da camada de lógica); fuso fixo `America/Sao_Paulo`; janela útil 8h–22h e timeline 07h–23h fixas
nesta fatia (não configuráveis); duração padrão de bloco sem estimativa = 30 min.

**Scale/Scope**: 1 usuário; ~7 funções novas na camada de lógica + 1 motor de capacity isolado; ~6
endpoints novos/estendidos; 1 tela rica (substitui a `TodayScreen` MVP) com ~5 componentes
(Hero, review-card, plan-card, CapacityBar, DayTimeline) + ~4 tools de paridade no agente.

## Constitution Check

*GATE: constitution v1.0.1 — verificado antes do Phase 0 e re-verificado pós-design.*

| Princípio | Avaliação |
|---|---|
| **I. Agent Specialization** | ✅ Kaguya segue dona exclusiva de tarefas+agenda; Makima não ganha lógica. A capacity cruza tarefas (domínio Kaguya) com o Calendar (já dela via MCP) — nenhum domínio novo. |
| **II. Hybrid Batch + Agentic** | ✅ Nenhum batch novo; só a camada interativa. |
| **III. Self-Contained Agents** | ✅ Tudo dentro de `agents/kaguya/` (novas funções em `tools_tasks.py`, motor `capacity.py`, fachada em `tools.py`); reuso de `tools_calendar.py`. Nada cruza para outro pacote. |
| **IV. Portuguese-First UX** | ✅ Kaguya relata plano + capacity em português, ecoa interpretações de NLP ("põe X no meu dia", "estima 30min"), erros sem stacktrace (`end_at` sem `start_at` → mensagem amigável, nunca 500). |
| **V. Minimal Footprint** | ✅ Zero dependência nova, **zero DDL** (ativa colunas existentes). A capacity como função pura é o menor footprint testável. |
| **Constraints arquiteturais** | ✅ `gemini-2.5-flash`; MCP do Calendar usado só para leitura (capacity), sem escrita; psycopg2 síncrono. |

**Resultado**: PASS — sem pendências de governança (a v1.0.1 já reflete kaguya = PostgreSQL + Calendar).

## Project Structure

### Documentation (this feature)

```text
specs/016-tasks-meudia/
├── spec.md                 # especificação (pronta)
├── plan.md                 # este arquivo
├── research.md             # decisões técnicas (9 decisões)
├── data-model.md           # colunas ativadas + capacity derivada + funções novas
├── quickstart.md           # guia de validação end-to-end
├── design-guide.md         # layout day-grid, componentes, constantes
├── contracts/
│   └── api-meudia.md        # contrato REST /api/tasks/{my-day,reschedule,time-block} + tools do agente
└── tasks.md                # Phase 2 (este passo)
```

### Source Code (repository root)

```text
agents/kaguya/
├── capacity.py             # NOVO — motor de capacity (função pura; data-model §3)
├── tools_tasks.py          # ESTENDIDO — add_to_my_day, remove_from_my_day, reschedule_pending,
│                           #   set_estimate, set_time_block, clear_time_block, list_my_day;
│                           #   update_task passa a aceitar duration_min/my_day_date/start_at/end_at
├── tools_calendar.py       # REUSADO — leitura de eventos do dia p/ a capacity (sem mudança de escrita)
├── tools.py                # ESTENDIDO (fachada do agente): plan_my_day/my_day_status,
│                           #   add_to_my_day/remove_from_my_day por id OU nome, set_estimate, block_time
├── agent.py                # _INSTRUCTION ganha o vocabulário de Meu Dia (planejar/estimar/puxar/tirar)
└── CLAUDE.md               # documenta as novas tools de Meu Dia + capacity

webapp/backend/routers/tasks.py   # ESTENDIDO — GET /my-day, POST/DELETE /{id}/my-day,
                                  #   POST /{id}/reschedule, POST/DELETE /{id}/time-block,
                                  #   PATCH /{id} aceita duration_min (contracts/api-meudia.md)

webapp/frontend/src/pages/kaguya/
├── types.ts                # ESTENDIDO — Task ganha my_day_date/start_at/end_at/duration_min;
│                           #   tipo MyDayResponse { date, plano, pendencias_ontem, sugestoes, capacity }
├── kaguyaApi.ts            # ESTENDIDO — myDay(date), addToMyDay, removeFromMyDay, reschedule,
│                           #   setTimeBlock, clearTimeBlock
├── screens/TodayScreen.tsx # SUBSTITUÍDO — tela rica de Meu Dia (day-grid 2 colunas)
└── components/             # NOVOS — DayHero, ReviewCard, PlanCard, CapacityBar, DayTimeline
                            #   (reusam tokens .kg-app; QuickAdd já existe)

tests/agents/
├── test_kaguya_capacity.py # NOVO — função pura de capacity (SC-001)
└── test_kaguya_meudia.py   # NOVO — camada de lógica (SC-003/SC-004/SC-005)
```

**Structure Decision**: web application sobre a estrutura real do repo (mesma da 011–015). A camada de
lógica única (FR-009/FR-010) são as funções novas em `tools_tasks.py` + o motor isolado `capacity.py`;
o router FastAPI as envelopa (como em `routers/tasks.py` hoje) e o agente as expõe ao Gemini. **Nenhuma
camada nova** é inventada e **nenhuma tabela** é criada.

**Front-end — fonte única de verdade**: a tela segue o guia canônico
[`010/frontend-design-guide.md`](../010-kaguya-tasks-app/frontend-design-guide.md) + o
[`design-guide.md`](./design-guide.md) desta fatia, ancorados no protótipo de alta fidelidade
`docs/claude_design/design_handoff_kaguya_tarefas/kaguya/screens-today.jsx` (reimplementar no stack
real, **não** copiar o JSX). A `TodayScreen.tsx` MVP é substituída pela tela rica. Constantes fixas do
protótipo: `DAY_START=7`/`DAY_END=23` (timeline), janela 8h–22h = 840 min (capacity), bloco padrão
30 min.

## Complexity Tracking

Sem violações da constitution — tabela não aplicável. Riscos a vigiar na implementação:

- **`update_task` × tools dedicadas**: a recomendação (data-model §4) é criar tools dedicadas para a
  semântica clara (`add_to_my_day`, `set_time_block`, …) **e** estender `update_task` só para
  `duration_min`. Evitar inflar `update_task` com a semântica de ritual.
- **Degradação do Calendar**: o ponto único de falha externo. O try/except vive na leitura para a
  capacity (`calendar_ok: false`, `agenda_min: 0`) — nunca propagar exceção do MCP para o endpoint.
