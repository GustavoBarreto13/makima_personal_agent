# Implementation Plan: Revisão semanal guiada (Kaguya)

**Branch**: `master` (repo convention: no auto-branching — ver `CLAUDE.md`) | **Date**: 2026-07-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/035-tasks-weekly-review/spec.md`

## Summary

Fecha o bloco GTD da Kaguya com o **ritual da revisão semanal**: um wizard de 6 passos (inbox
zero, próximas ações, aguardando, listas/projetos, calendário, algum dia/talvez) que agrega, em
cada passo, dados **já existentes** (todos entregues pela spec 034 ou por fatias anteriores —
Calendar Hub, sidebar) com ações inline de efeito imediato — mais um registro leve
(`task_weekly_reviews`) que permite retomar uma revisão abandonada e alimenta um lembrete no
Telegram quando a semana termina sem revisão concluída. Abordagem técnica: **reuso máximo** —
nenhum passo reimplementa uma consulta que já existe; a única lógica nova é o estado da revisão
em si (iniciar/retomar/marcar passo/concluir) e o job agendado do lembrete.

## Technical Context

**Language/Version**: Python 3.11 (backend/agents) + TypeScript/React (frontend, Vite)

**Primary Dependencies**: FastAPI (`webapp/backend`), `psycopg2-binary` (síncrono), APScheduler
(`scheduler/`, já em uso pelos jobs de backup/sync/digest), `requests` (envio direto ao
Telegram, já em uso por `scheduler/notify.py`/`send_lucy_digest.py`), React + componentes
existentes (`webapp/frontend/src/pages/kaguya`) — nenhuma dependência nova.

**Storage**: PostgreSQL (mesmo banco de Nami/Frieren/Journal) — `agents/kaguya/schema_tasks_pg.sql`.

**Testing**: `pytest` (`tests/agents/test_kaguya_*.py`) — cobertura de `tools_review.py` (regras
de transição: no máximo uma aberta, retomada, passos-pendentes bloqueiam conclusão) no mesmo
padrão dos demais módulos de lógica testados.

**Target Platform**: Linux server (VPS, container `makima-web` + `makima-scheduler`) +
navegador (webapp) + Telegram (só o lembrete, via job).

**Project Type**: Web application (backend FastAPI + frontend React) + job agendado no
`scheduler/` já existente — nenhum projeto/serviço novo.

**Performance Goals**: SC-001 (revisão completa com volume típico ≤10 itens/passo em <15 min) —
objetivo de UX/fluxo, não de throughput.

**Constraints**: toda janela de "7 dias"/"semana" em `America/Sao_Paulo` (UTC-3), nunca UTC puro
(regra global do repo); no máximo uma revisão aberta por vez, garantido por índice único parcial
no banco (não só validação em Python); nenhum passo materializa/snapshotta dado — tudo lido ao
vivo no momento em que o passo é aberto.

**Scale/Scope**: usuário único (mesma premissa de todo o domínio Kaguya).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|---|---|
| I. Agent Specialization | ✅ Toda a lógica nova fica em `agents/kaguya/` (`tools_review.py` novo). Nenhuma lógica de domínio no coordinator; o coordinator não ganha nada nesta spec (wizard é webapp-only — research.md R10). |
| II. Hybrid Batch + Agentic | ✅ O lembrete de domingo é automação agendada em volume fixo → job no `scheduler/` (script Python direto), não uma tool ADK. O ritual em si é interação nova mas fica confinada ao webapp (sem tool ADK — mesmo padrão *webapp-first* de Kanban/Experiments/Metas). |
| III. Self-Contained Agents | ✅ Nenhuma dependência de outro agente; `task_weekly_reviews`/`task_projects.last_reviewed_at` vivem só no schema da Kaguya. O passo de calendário consome `calendar_hub.aggregate()`, que já é o mecanismo oficial de agregação cross-agent (fatia 019) — não é uma dependência nova. |
| IV. Portuguese-First UX | ✅ UI do wizard e a mensagem do lembrete em português; personalidade Kaguya não se aplica ao lembrete (mensagem funcional, sem persona — mesmo padrão do digest da Lucy). |
| V. Minimal Footprint | ✅ Nenhuma tabela de snapshot por passo (dados sempre vivos); `steps_seen` como array em vez de 6 colunas booleanas; nenhuma tool ADK nova (o wizard não precisa de superfície conversacional); reusa `calendar_hub`/`BUILTIN_FILTERS`/`list_inbox_queue`/`process_inbox_item` integralmente. |

Nenhuma violação — sem necessidade de `Complexity Tracking`.

## Project Structure

### Documentation (this feature)

```text
specs/035-tasks-weekly-review/
├── plan.md              # este arquivo
├── research.md          # decisões técnicas (R1–R11)
├── data-model.md         # schema novo + queries derivadas por passo
├── contracts/
│   └── rest-api.md      # rotas novas/reusadas + contrato do lembrete Telegram
├── quickstart.md        # 5 cenários de validação end-to-end
└── tasks.md              # gerado por /speckit-tasks (não criado aqui)
```

### Source Code (repository root)

Aplicação web + scheduler já existentes — sem opção de estrutura nova, só extensão dos módulos
já mapeados em `agents/kaguya/CLAUDE.md` e `scheduler/CLAUDE.md`:

```text
agents/kaguya/
├── schema_tasks_pg.sql      # + task_weekly_reviews, + task_projects.last_reviewed_at
├── tools_review.py          # NOVO — estado da revisão (start/resume, mark_step_seen,
│                            #  complete_review, get_last_completed_review, list_review_history,
│                            #  get_reminder_summary, waiting ordenado por antiguidade,
│                            #  mark_project_reviewed)
└── tools.py                 # facade: + re-exports de tools_review (webapp-only, sem tool ADK)

webapp/backend/routers/tasks.py   # + rotas de /reviews/* e /projects/{id}/mark-reviewed
                                    # (contracts/rest-api.md)

webapp/frontend/src/pages/kaguya/
├── modals/WeeklyReviewModal.tsx  # NOVO — wizard de 6 passos (progresso, navegação livre,
│                                  #  nota final), reusando InboxProcessModal/TaskModal/
│                                  #  CalendarView já existentes para o conteúdo de cada passo
├── components/SidebarNav.tsx     # + indicador "última revisão há N dias" (US4)
└── types.ts                      # + tipos de WeeklyReview/ReviewStep

scripts/
└── send_weekly_review_reminder.py   # NOVO — script standalone (padrão send_lucy_digest.py):
                                       #  checa get_reminder_summary(), envia ao Telegram se
                                       #  should_send=True

scheduler/
├── jobs.py       # + run_weekly_review_reminder() (subprocesso, mesmo padrão de run_lucy_digest)
└── registry.py   # + weekly_at(day_of_week, hour, minute=0) helper, + ScheduledJob
                    #  "weekly_review_reminder" (domingo 20:00 America/Sao_Paulo)
```

**Structure Decision**: extensão pura da aplicação web + scheduler já existentes — nenhum novo
projeto/pacote/serviço. Um módulo de lógica novo (`tools_review.py`) segue a convenção de
arquivo-por-concern já usada (`tools_experiments.py`, `tools_goals.py`); o job novo segue a
convenção de 1-linha-em-`registry.py` já documentada em `scheduler/CLAUDE.md`.

## Complexity Tracking

*Sem violações da Constitution Check — seção não aplicável.*
