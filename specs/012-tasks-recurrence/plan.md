# Implementation Plan: Datas e Recorrência — Fase 2 (fatia 012)

**Branch**: `012-tasks-recurrence` | **Date**: 2026-06-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-tasks-recurrence/spec.md` (filha da master
[`specs/010-kaguya-tasks-app/`](../010-kaguya-tasks-app/spec.md), sobre a Fase 1
[`specs/011-tasks-mvp/`](../011-tasks-mvp/spec.md))

## Summary

Segunda fatia do sistema de tarefas próprio: o **motor de recorrência** (modos `fixed` e
`after_completion` expressos em RRULE) sobre o schema já criado na Fase 1, com **datas** de
vencimento (hora opcional) editáveis pelos dois canais. A geração é **lazy** (uma ocorrência viva
por série) e segue os **9 edge cases** da master — o gate da fatia (SC-001 ≡ SC-004 da master). A
regra de negócio vive numa única camada (`recurrence.py` puro + `tools_tasks.py`); o canal Telegram
(agente) e o webapp (router `/api/tasks/*` + TaskModal/QuickAdd) são fachadas finas e paritárias.
Aniversários (`type=birthday`) ganham recorrência anual automática pelo mesmo motor. Tags,
smart-lists e calendário ficam para a 013.

## Technical Context

**Language/Version**: Python 3.12 (backend/agentes), TypeScript 5.8 + React 19 (frontend)

**Primary Dependencies**: as da Fase 1 **+ `python-dateutil`** (nova) — `dateutil.rrule.rrulestr`
faz parse/expansão de RRULE (RFC 5545), evitando reimplementar a aritmética de recorrência. É a
única dependência nova da fatia (a Fase 1 já antecipava "rrule/dateutil só na Fase 2").

**Storage**: PostgreSQL existente, acesso via `agents/db.py`. **Sem migração**: `task_recurrences`
(`rrule`, `mode`, `anchor_date`, `active`) e os campos `tasks.due_date`/`due_time` já nasceram na
Fase 1 (`agents/kaguya/schema_tasks_pg.sql`).

**Testing**: pytest, padrão de `tests/`. O motor `recurrence.py` é **puro** (sem banco) → cobertura
total dos 9 edge cases em testes rápidos e determinísticos; a integração (concluir/excluir gerando
a próxima ocorrência) roda contra um Postgres descartável (skip sem `DATABASE_URL`, como na 011).
Router via FastAPI TestClient (tools mockadas). Parser de datas do webapp validado por build +
quickstart.

**Target Platform**: VPS Linux (Docker/Dokploy) — `makima-web` + bot coordinator.

**Project Type**: Web application (FastAPI + React) + agente conversacional sobre a mesma camada.

**Performance Goals**: cálculo de próxima ocorrência é O(poucas iterações) da RRULE — imperceptível;
nenhuma query N+1 (geração faz 1 INSERT + 1 UPDATE da regra na mesma transação da conclusão).

**Constraints**: single-user; soft delete; **paridade total** (nenhuma regra fora da camada de
lógica); fuso fixo `America/Sao_Paulo`; recorrência em datas civis (`DATE`), imune a DST; "uma
ocorrência viva por vez" como invariante.

**Scale/Scope**: 1 usuário; recorrentes na casa das dezenas; superfície da fatia: 1 módulo novo
(`recurrence.py`), extensões em `tools_tasks.py`/`tools.py`/`agent.py`/router, 1 helper de parsing
de datas no front + controles de recorrência no TaskModal.

## Constitution Check

*GATE: constitution v1.0.1 — verificado antes do Phase 0 e re-verificado pós-design.*

| Princípio | Avaliação |
|---|---|
| **I. Agent Specialization** | ✅ Kaguya continua dona exclusiva de tarefas+agenda; Makima não ganha lógica. A linha do domínio já está correta (1.0.1: "PostgreSQL próprio + Google Calendar via MCP") — sem novo amendment. |
| **II. Hybrid Batch + Agentic** | ✅ Nenhum batch novo. A recorrência é gerada **na conclusão** (interativa), não por job agendado — lembretes/agendamento são Fase 5. |
| **III. Self-Contained Agents** | ✅ `agents/kaguya/` ganha `recurrence.py` (módulo local), mantendo o padrão auto-contido. Nenhum import cross-repo. |
| **IV. Portuguese-First UX** | ✅ A Kaguya ecoa a interpretação de data/recorrência em português (`describe_rrule` em pt-BR), resolve ambiguidade e pede escopo na exclusão. |
| **V. Minimal Footprint** | ✅ Uma dependência nova **madura e ubíqua** (`python-dateutil`), justificada: implementar RRULE à mão seria fonte garantida de bugs nos 9 edge cases. Zero tabela nova (reusa o schema da Fase 1). |
| **Constraints arquiteturais** | ✅ `gemini-2.5-flash`; MCP só Calendar (intacto); psycopg2 síncrono. |

**Resultado**: PASS — sem violações, sem pendências de governança.

## Project Structure

### Documentation (this feature)

```text
specs/012-tasks-recurrence/
├── spec.md              # especificação (pronta)
├── plan.md              # este arquivo
├── research.md          # Phase 0 — decisões + tabela-verdade dos 9 edge cases
├── data-model.md        # Phase 1 — semântica de recorrência (sem mudança de schema)
├── quickstart.md        # Phase 1 — roteiro de validação end-to-end
├── contracts/
│   ├── api-tasks.md     # delta REST /api/tasks/* (recorrência, datas, end_series, scope)
│   └── kaguya-tools.md  # delta das tools do agente (paridade)
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
agents/kaguya/
├── recurrence.py         # NOVO — motor puro RRULE: next_occurrence(), build_rrule(), describe_rrule()
├── tools_tasks.py        # + recurrence em create/update; geração na conclusão; end_series; scope; clear_recurrence; birthday→YEARLY
├── tools.py              # fachada: registra clear_recurrence + novos params
├── agent.py              # instrução: datas/recorrência/fim-de-série/exclusão escopada (eco da interpretação)
└── CLAUDE.md             # atualizado (recorrência + datas)

requirements.txt          # + python-dateutil

webapp/backend/routers/tasks.py   # bodies/params/respostas: recurrence, end_series, scope

webapp/frontend/src/
├── lib/parseDate.ts      # NOVO — parsing determinístico de datas pt-BR (relativos, dia-da-semana, DD/MM, hora)
├── lib/parseTask.ts      # + token de data (classe tok-date) no quick-add
└── pages/kaguya/
    ├── types.ts          # + interface Recurrence; campo recurrence? em Task
    ├── kaguyaApi.ts       # + clearRecurrence; params recurrence/end_series/scope
    ├── kaguya.css         # estilos do controle de recorrência + glyph + tok-date
    ├── modals/TaskModal.tsx        # date/time picker + controle de recorrência + "Concluir série"
    ├── components/{TaskRow,TaskCard,QuickAdd}.tsx   # glyph de recorrência; quick-add com data
    └── ui/Chips.tsx       # chip/glyph de recorrência (ícone loop já existe em Icons.tsx)

tests/
├── agents/test_kaguya_recurrence.py   # NOVO — os 9 edge cases (motor puro + integração) + aniversário
└── test_tasks_router.py               # + recurrence/end_series/scope

webapp/CLAUDE.md          # nota de recorrência/datas no domínio Kaguya
```

**Structure Decision**: mantém a arquitetura da Fase 1. O **motor puro** `recurrence.py` isola toda
a matemática de recorrência (testável sem banco — é onde os 9 edge cases vivem ou morrem);
`tools_tasks.py` orquestra a persistência (geração da próxima ocorrência dentro da mesma transação
da conclusão, em `_complete_task_on_cursor`). Router e agente continuam fachadas finas (FR-014).

**Front-end — fonte única de verdade**: o controle de recorrência e os chips de data seguem o **guia
canônico** [`frontend-design-guide.md`](../010-kaguya-tasks-app/frontend-design-guide.md). O parser
de datas (`parseDate.ts`) é determinístico e em português, espelhando o comportamento que a Kaguya
interpreta por NLP no Telegram (mesma semântica de "próxima ocorrência futura").

## Complexity Tracking

Sem violações da constitution — tabela não aplicável. A única dependência nova (`python-dateutil`)
está justificada no Constitution Check (princípio V).
