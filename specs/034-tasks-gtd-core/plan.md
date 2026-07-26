# Implementation Plan: GTD core — status reais, processamento do inbox, contextos e smart lists padrão de mercado (Kaguya)

**Branch**: `master` (repo convention: no auto-branching — ver `CLAUDE.md`) | **Date**: 2026-07-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/034-tasks-gtd-core/spec.md`

## Summary

Transforma o GTD da Kaguya de heurístico (tags reservadas) para cidadão de primeira classe:
uma coluna `gtd_status` real em `tasks` (próxima ação / aguardando / algum dia), um
processamento guiado do Inbox item a item (webapp + Telegram, decisão em 6 caminhos), uma
tabela `task_contexts` dedicada (1 contexto por tarefa, no máximo), e a reorganização da
sidebar no padrão de mercado (Todas/Hoje/Amanhã/Próximos 7 Dias/Inbox, com contadores). A
migração converte e aposenta as tags `#aguardando`/`#algum-dia`. Abordagem técnica: **reuso
máximo** do motor de smart-lists já existente (`_build_where_from_rules`) para os novos campos
e as views fixas, e do padrão de wizard já existente no coordinator (`_pending_action` +
botões inline) para o Telegram — nenhuma tecnologia nova, nenhum agente novo.

## Technical Context

**Language/Version**: Python 3.11 (backend/agents) + TypeScript/React (frontend, Vite)

**Primary Dependencies**: FastAPI (`webapp/backend`), `psycopg2-binary` (síncrono), `google-adk`
(agente Kaguya), `python-telegram-bot` (coordinator), React + `types.ts`/componentes existentes
(`webapp/frontend/src/pages/kaguya`) — todas já em uso, nenhuma dependência nova.

**Storage**: PostgreSQL (mesmo banco de Nami/Frieren/Journal) — `agents/kaguya/schema_tasks_pg.sql`.

**Testing**: `pytest` (`tests/agents/test_kaguya_*.py` — mesmo padrão dos motores puros/lógica
já testados: recorrência, hábitos, experimentos, metas).

**Target Platform**: Linux server (VPS, container `makima-web`) + navegador (webapp) + Telegram.

**Project Type**: Web application (backend FastAPI + frontend React) com canal adicional
Telegram — estrutura já existente, sem projeto novo.

**Performance Goals**: SC-001 (processar 10 itens do Inbox em <3 min, fluxo sem navegação entre
telas) — objetivo de UX/fluxo, não de throughput de sistema.

**Constraints**: todo cálculo de "hoje/amanhã/7 dias" em `America/Sao_Paulo` (UTC-3), nunca UTC
puro (regra global do repo); toda tradução da DSL de filtros permanece parametrizada (SC-003
herdada da fatia 013); migração idempotente (roda 2× sem duplicar/corromper).

**Scale/Scope**: usuário único (mesma premissa de todo o domínio Kaguya).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|---|---|
| I. Agent Specialization | ✅ Toda a lógica nova fica em `agents/kaguya/` (tools_tasks, tools_filters, tools_views novo, tools_contexts novo). Nenhuma lógica de domínio no coordinator além do wizard de UI (mesmo padrão já usado para contas/livros). |
| II. Hybrid Batch + Agentic | ✅ Processamento conversacional do inbox é interação nova → ADK tool (`process_inbox_item`) + wizard de botões no coordinator (não é automação batch). |
| III. Self-Contained Agents | ✅ Nenhuma dependência de outro agente; `task_contexts`/`gtd_status` vivem só no schema da Kaguya. |
| IV. Portuguese-First UX | ✅ Personalidade Kaguya mantida nas respostas do wizard e do texto livre; erros em português claro. |
| V. Minimal Footprint | ✅ Fila do inbox é derivada (sem coluna nova de "processado" — R2); migração não adiciona coluna de auditoria só para um uso único (R3); wizard reusa o padrão `_pending_action` já existente em vez de um framework de conversação novo (R9). |

Nenhuma violação — sem necessidade de `Complexity Tracking`.

## Project Structure

### Documentation (this feature)

```text
specs/034-tasks-gtd-core/
├── plan.md              # este arquivo
├── research.md          # decisões técnicas (R1–R11)
├── data-model.md        # schema novo + migração + regras de transição
├── contracts/
│   └── rest-api.md      # rotas novas/alteradas + contrato Telegram
├── quickstart.md        # 5 cenários de validação end-to-end
└── tasks.md              # gerado por /speckit-tasks (não criado aqui)
```

### Source Code (repository root)

Aplicação web existente (backend FastAPI + frontend React) — sem opção de estrutura nova,
só extensão dos módulos já mapeados em `agents/kaguya/CLAUDE.md`:

```text
agents/kaguya/
├── schema_tasks_pg.sql      # + task_contexts, + colunas gtd_status/waiting_*/context_id em tasks
├── tools_tasks.py           # update_task/complete_task ganham as regras de transição GTD;
│                            #  + process_inbox_item(task_id, decision, **fields)
├── tools_filters.py         # _FIELD_OPS + gtd_status/context_id; _resolve_relative_date + "tomorrow";
│                            #  BUILTIN_FILTERS (next-actions/waiting/someday) reescritos; RESERVED_TAGS removido
├── tools_contexts.py        # NOVO — CRUD de task_contexts (mesmo padrão de tools_tags.py)
├── tools_views.py           # NOVO — as 5 views fixas + contadores (não persistidas)
├── tools.py                 # facade: + process_inbox_item, + resolve_view_by_name (Telegram)
└── CLAUDE.md                # atualizar com os 2 módulos novos e as regras GTD

webapp/backend/routers/tasks.py   # + rotas de contexts/inbox/views (contracts/rest-api.md)

webapp/frontend/src/pages/kaguya/
├── components/SidebarNav.tsx     # bloco fixo (Todas/Hoje/Amanhã/Próx.7d/Inbox) + seção GTD atualizada
├── modals/FilterModal.tsx        # + campo gtd_status/context_id na DSL; + atalho "amanhã"
├── modals/ContextsModal.tsx      # NOVO — CRUD de contextos (padrão de outro modal de gestão simples)
├── modals/InboxProcessModal.tsx  # NOVO — wizard item-a-item (padrão de FilterModal para a estrutura, UX própria)
└── types.ts                      # + tipos de gtd_status/context/views fixas

coordinator/main.py          # + prefixo de callback "ibx_" + _pending_action["inbox_process"]
                              #  (mesmo padrão de "nc_"/"ncc_"/"fm_")
```

**Structure Decision**: extensão pura da aplicação web + Telegram já existente — nenhum novo
projeto/pacote/serviço. Dois módulos de lógica novos (`tools_contexts.py`, `tools_views.py`)
seguem exatamente a convenção de arquivo-por-concern já usada (`tools_tags.py`,
`tools_kanban_views.py`).

## Complexity Tracking

*Sem violações da Constitution Check — seção não aplicável.*
