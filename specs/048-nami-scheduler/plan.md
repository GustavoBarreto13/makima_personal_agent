# Implementation Plan: Jobs financeiros agendados — orçamento, cobranças e relatório mensal

**Branch**: `master` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/048-nami-scheduler/spec.md`

## Summary

Três jobs novos no `makima-scheduler` (padrão já estabelecido — `registry.py`/`jobs.py`/
`runner.py`), seguindo o mesmo molde de `send_lucy_digest.py`/`send_weekly_review_reminder.py`
(script standalone, `_send_telegram()` HTML, `sys.exit(1)` em falha estrutural, wrapper
`subprocess.run` em `jobs.py`):

1. **`process_recurring_charges`** (08:30) — cobre US1+US2 (é o mesmo job: a diferença
   entre assinatura e conta fixa não-automática é só o `if auto_lancar` dentro do loop).
   Reaproveita `mark_subscription_paid(id, valor=sub.valor, data=next_billing)` — já
   existente (spec 044) — para o lançamento automático: cria a despesa vinculada e rola
   `next_billing` **atomicamente**, sem nenhuma lógica nova de amortização.
2. **`send_budget_alert`** (09:00) — US3, reaproveita `get_budget_status(month)` já
   existente.
3. **`send_monthly_report`** (dia 1º, 08:00) — US4, reaproveita `get_spending_summary`,
   `get_spending_trend`, `get_financial_health_score` do mês fechado — zero cálculo novo.

**Idempotência (FR-002)**: o lançamento automático é auto-idempotente — assim que
`mark_subscription_paid` roda, `next_billing` rola para o próximo ciclo, então uma
reexecução no mesmo dia recalcula `dias_até_vencer` sobre a NOVA data e não qualifica mais
para lançar de novo. Os avisos (D-3, e D0 de conta fixa não confirmada) não mudam estado
nenhum, então precisam de uma trava própria: nova coluna
`subscriptions.last_notice_date` — só um aviso por dia por recorrência, comparando com
"hoje" (fuso São Paulo).

**Recuperação de job perdido (edge case)**: como o critério é `dias_até_vencer <= 0` (não
`== 0`), uma cobrança vencida há 2 dias (job não rodou) ainda é pega na próxima execução —
lançada com a **data devida** (`data=next_billing`, não "hoje").

## Technical Context

**Language/Version**: Python 3.11

**Primary Dependencies**: `requests` (Telegram, já usado pelos demais jobs), `apscheduler`
(já configurado)

**Storage**: `subscriptions.last_notice_date DATE` — migração idempotente

**Testing**: import smoke-test dos 3 scripts + `scheduler.jobs`/`scheduler.registry`;
execução manual local com `DATABASE_URL` de teste (`python -m scripts.process_recurring_charges`)

**Constraints**: SC-002 (zero duplicata) depende inteiramente da idempotência natural do
`next_billing` já rolado + da trava `last_notice_date` para os avisos.

**Scale/Scope**: 4 user stories (P1, P1, P2, P2) — depende das specs 040 (pagador
vinculado) e 044 (`kind`/`auto_lancar`), ambas já entregues.

## Project Structure

```text
agents/nami/schema_pg.sql              # subscriptions.last_notice_date
scripts/migrate_nami_reforma.py        # +1 ALTER TABLE idempotente

scripts/process_recurring_charges.py   # NOVO — US1+US2, avisos D-3 + lançamento automático
scripts/send_budget_alert.py           # NOVO — US3
scripts/send_monthly_report.py         # NOVO — US4

scheduler/jobs.py                      # +3 wrappers (subprocess.run, mesmo padrão)
scheduler/registry.py                  # +3 ScheduledJob (08:30, 09:00, dia 1º 08:00)

scheduler/CLAUDE.md, ROADMAP.md
```

## Constitution Check

Sem `.specify/memory/constitution.md`. Gate de fato: FR-002 (idempotência) — nenhum job
faz `DELETE`/duplica `INSERT` em reexecução; o teste manual é rodar o script 2× seguidas
e conferir que a segunda vez não lança nem avisa de novo.

## Decisões de escopo

1. **US1+US2 são um job só** (`process_recurring_charges`) — a spec já as descreve como
   duas metades do mesmo loop sobre `subscriptions` (`kind`/`auto_lancar` decide o
   comportamento), não dois jobs separados.
2. **`last_notice_date` é uma trava genérica de "já avisei hoje"**, não um par
   D-3/D0 separado — como os dois avisos caem em dias de calendário diferentes (3 dias
   de intervalo), uma única coluna "última data em que notifiquei esta recorrência"
   já garante no máximo 1 aviso por dia por recorrência, sem duplicar em reexecuções.
3. **Mensagens agrupadas por job/dia** (FR-007) — cada script acumula os eventos do dia
   (lançamentos, avisos D-3, confirmações pendentes) numa lista e manda **uma** mensagem
   Telegram ao final, nunca uma por item.
4. **Relatório mensal reusa 100% de tools já existentes** — nenhuma agregação nova; o job
   só formata o que `get_spending_summary`/`get_spending_trend`/`get_financial_health_score`
   já calculam para o mês fechado.
