# Tasks: Jobs financeiros agendados — orçamento, cobranças e relatório mensal

**Input**: plan.md, spec.md · **Branch**: `master`

## Phase 1: Setup

- [X] T001 `agents/nami/schema_pg.sql` + `migrate_nami_reforma.py`: `subscriptions.last_notice_date`

## Phase 2: User Story 1+2 — Cobranças recorrentes (assinaturas automáticas + contas fixas confirmam) (P1)

- [X] T002 [US1] `scripts/process_recurring_charges.py`: loop sobre `subscriptions` ativas,
      calcula dias até vencer, aviso D-3 (trava `last_notice_date`)
- [X] T003 [US1] Lançamento automático (`kind='assinatura'` ou `auto_lancar=True`) via
      `mark_subscription_paid` — atômico, com `data` devida (recuperação de job perdido)
- [X] T004 [US2] Conta fixa não automática: aviso D0 "confirme o valor", sem lançar
- [X] T005 `scheduler/jobs.py::run_recurring_charges` + registro em `registry.py` (08:30)

## Phase 3: User Story 3 — Alerta de orçamento (P2)

- [X] T006 [US3] `scripts/send_budget_alert.py`: `get_budget_status` do mês, filtra ≥90%,
      silencioso se tudo dentro do limite
- [X] T007 `scheduler/jobs.py::run_budget_alert` + registro (09:00)

## Phase 4: User Story 4 — Relatório mensal (P2)

- [X] T008 [US4] `scripts/send_monthly_report.py`: mês fechado via
      `get_spending_summary`/`get_spending_trend`/`get_financial_health_score`
- [X] T009 `scheduler/jobs.py::run_monthly_report` + registro (dia 1º, 08:00)

## Phase 5: Polish

- [X] T010 Verificação: import smoke-test dos 3 scripts + `scheduler.registry`
- [X] T011 Docs: `scheduler/CLAUDE.md`, `agents/nami/CLAUDE.md`, `ROADMAP.md`, status do `spec.md`
