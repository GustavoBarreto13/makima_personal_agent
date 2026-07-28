# Implementation Plan: Contas Fixas — separadas de Assinaturas, com confirmação de valor

**Branch**: `master` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/044-nami-contas-fixas/spec.md`

## Summary

Decisão de design já vinha na spec: estender `subscriptions` (não criar tabela nova) com
`kind` ('assinatura'|'conta_fixa') e `auto_lancar` (bool). A mecânica de recorrência
(ciclo, next_billing, pagador) é 100% reaproveitada — o que muda é comportamento:

- `list_subscriptions`/`create_subscription`/`update_subscription` ganham `kind`.
- Nova função pura `_cycle_status(sub, today)` deriva paga/pendente/atrasada/agendada
  comparando o dia de vencimento (`next_billing_day`) contra hoje e verificando se já
  existe transação vinculada (`subscription_id`) no período corrente — sem depender do
  valor de `next_billing`, que já foi rolado para a frente assim que a conta é paga.
- `mark_subscription_paid`: atômico via `get_conn()` — cria a despesa vinculada
  (`create_transaction_on_cursor`) **e** rola `next_billing` no mesmo cursor.
- `skip_subscription_cycle`: rola `next_billing` sem lançar despesa (edge case "pular
  este mês").
- Frontend: nova tela `FixedBills.tsx` (Contas Fixas) espelhando `Subscriptions.tsx`;
  `Subscriptions.tsx` passa a filtrar só `kind='assinatura'` do array já compartilhado
  pelo shell (uma única leitura de `GET /subscriptions`, filtrada em cada tela — mesmo
  padrão de dado compartilhado do NamiShell). Dashboard ganha "custo fixo mensal" +
  contador de pendências via novo `GET /recurring-status`.
- Agente Nami (Telegram): instrução dividida em ASSINATURAS vs CONTAS FIXAS com regra de
  classificação (serviço digital/recorrente de valor fixo → assinatura; conta doméstica de
  valor variável → conta fixa) e as 2 tools novas adicionadas à lista.

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript/React (frontend)

**Primary Dependencies**: nenhuma nova — reaproveita `get_conn()`/ADK já existentes

**Storage**: PostgreSQL — `subscriptions.kind`/`auto_lancar` (migração idempotente)

**Testing**: `npx tsc -b --force` + `npm run build`; import smoke-test do router e do agent.py

**Constraints**: FR-008 exige que assinaturas existentes continuem com comportamento
inalterado — `kind` default `'assinatura'`, `auto_lancar` default `TRUE` na migração
preserva 100% do comportamento anterior sem exigir backfill de dados.

**Scale/Scope**: 3 user stories (P1, P1, P2); spec 048 (job de auto-lançamento) fica de
fora — aqui o fluxo é manual (assumption da própria spec).

## Project Structure

```text
agents/nami/schema_pg.sql              # subscriptions.kind / auto_lancar
scripts/migrate_nami_reforma.py        # +2 ALTER TABLE idempotentes

agents/nami/tools.py                   # create/list/update_subscription (+kind/auto_lancar),
                                        #   _cycle_status() (puro), get_recurring_status(),
                                        #   mark_subscription_paid() (atômico), skip_subscription_cycle()
agents/nami/agent.py                   # instrução dividida ASSINATURAS/CONTAS FIXAS + 2 tools novas
agents/nami/CLAUDE.md                  # tabela de tools atualizada

webapp/backend/routers/finances.py     # GET /subscriptions?kind=, GET /recurring-status,
                                        #   POST /subscriptions/{id}/pay, POST /subscriptions/{id}/skip

webapp/frontend/src/pages/nami/
├── namiApi.ts                 # getRecurringStatus, paySubscription, skipSubscriptionCycle
├── types.ts                   # Subscription +kind/auto_lancar; RecurringStatusItem
├── screens/
│   ├── FixedBills.tsx          # novo — lista + status do mês + "Marcar como paga"/"Pular"
│   ├── Subscriptions.tsx       # filtra kind='assinatura' do array compartilhado
│   └── Dashboard.tsx           # +card custo fixo mensal + pendências
└── NamiShell.tsx               # nova view 'contas-fixas'

webapp/docs/API.md, webapp/CLAUDE.md, ROADMAP.md
```

## Constitution Check

Sem `.specify/memory/constitution.md`. Gate de fato: FR-005/SC-003 (operação atômica) —
`mark_subscription_paid` usa `get_conn()` (mesmo padrão de `create_transfer`, spec 043).

## Decisões de escopo

1. **`_cycle_status` não usa `next_billing` como data de vencimento do período corrente**
   — esse campo é o **próximo** vencimento e já foi rolado para frente assim que a conta é
   paga; usar `next_billing_day` (dia do mês, estável) + o mês/ano corrente para saber se
   hoje já passou do vencimento deste ciclo.
2. **Ciclo anual fora do mês de cobrança → status `"agendada"`** (não pendente/atrasada),
   conforme edge case da spec — mês de cobrança fixo = mês de `next_billing` (persiste
   entre rolagens porque a rolagem soma 1 ano).
3. **Assinaturas e contas fixas continuam na mesma tabela/array compartilhado do
   `NamiShell`** — evita duas fontes de verdade; cada tela filtra por `kind`.
4. **Spec 048 (job de auto-lançamento) fora do escopo** — aqui `auto_lancar` só é gravado
   (indicador), sem nenhum scheduler consumindo o campo ainda.
