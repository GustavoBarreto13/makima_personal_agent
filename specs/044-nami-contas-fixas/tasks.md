# Tasks: Contas Fixas — separadas de Assinaturas, com confirmação de valor

**Input**: Design documents from `specs/044-nami-contas-fixas/`
**Prerequisites**: plan.md

## Phase 1: Setup

- [X] T001 Confirmar decisão de design da spec (estender `subscriptions`, não criar tabela nova)

## Phase 2: Foundational

- [X] T002 `subscriptions.kind`/`auto_lancar` em `agents/nami/schema_pg.sql` + migração
      idempotente em `scripts/migrate_nami_reforma.py` (defaults preservam comportamento
      das assinaturas existentes — FR-008)
- [X] T003 `create_subscription`/`list_subscriptions`/`update_subscription` em
      `agents/nami/tools.py` ganham `kind`/`auto_lancar`

## Phase 3: User Story 1 — Cadastrar e acompanhar contas fixas (P1)

- [X] T004 [US1] `_cycle_status(sub, today)` — função pura em `tools.py` (paga/pendente/
      atrasada/agendada), sem tocar banco
- [X] T005 [US1] `get_recurring_status(kind="", status="ativa")` em `tools.py` — enriquece
      cada recorrência com `cycle_status` + custo fixo mensal total (contas fixas +
      assinaturas, anuais proporcionalizadas) + contagem de pendências
- [X] T006 [US1] `GET /subscriptions?kind=` e `GET /recurring-status` em `finances.py`
- [X] T007 [US1] `namiApi.getRecurringStatus`, `getSubscriptions(kind?)`,
      `createSubscription`/`updateSubscription` (+kind/auto_lancar) em `namiApi.ts`
- [X] T008 [US1] Tela nova `screens/FixedBills.tsx` — lista de contas fixas com status do
      mês (chip paga/pendente/atrasada/agendada), formulário de criação (kind fixo
      "conta_fixa", `auto_lancar` desligado por padrão)
- [X] T009 [US1] `Subscriptions.tsx` passa a filtrar `kind === 'assinatura'` do array
      compartilhado do shell (não busca de novo)
- [X] T010 [US1] Nova view `contas-fixas` em `NamiShell.tsx` (hash, nav item, título, ícone)

**Checkpoint**: cadastrar "Luz — R$250 — vence dia 10" mostra pendente antes do dia 10 e
atrasada depois; Assinaturas e Contas Fixas não se misturam.

## Phase 4: User Story 2 — Marcar como paga confirmando o valor real (P1)

- [X] T011 [US2] `mark_subscription_paid(id, valor, data, conta)` em `tools.py` — atômico
      via `get_conn()`: cria a despesa vinculada (`create_transaction_on_cursor` com
      `subscription_id`) e rola `next_billing` (mensal +1 mês, anual +1 ano) no mesmo cursor
- [X] T012 [US2] `skip_subscription_cycle(id)` em `tools.py` — rola `next_billing` sem
      lançar despesa (edge case "pular este mês")
- [X] T013 [US2] `POST /subscriptions/{id}/pay` e `POST /subscriptions/{id}/skip` em
      `finances.py`
- [X] T014 [US2] `namiApi.paySubscription`, `namiApi.skipSubscriptionCycle` em `namiApi.ts`
- [X] T015 [US2] Modal "Marcar como paga" em `FixedBills.tsx` — valor esperado pré-preenchido
      e editável, data opcional, ação "Pular este mês" secundária

**Checkpoint**: marcar como paga com valor editado cria a despesa com o valor real,
vínculo `subscription_id` e rola o vencimento — tudo ou nada.

## Phase 5: User Story 3 — Custo fixo de vida no Dashboard (P2)

- [X] T016 [US3] Card "Custo fixo mensal" em `Dashboard.tsx` (contas fixas + assinaturas,
      via `GET /recurring-status`) + aviso "N contas a confirmar" com link para a seção

**Checkpoint**: com 3 contas fixas + 2 assinaturas ativas, o card soma certo e o contador
de pendências bate.

## Phase 6: Classificação no Telegram (FR-006)

- [X] T017 Instrução da Nami em `agent.py` dividida em ASSINATURAS vs CONTAS FIXAS, com
      regra de classificação (serviço digital de valor fixo → assinatura; conta doméstica
      de valor variável → conta fixa) + `mark_subscription_paid`/`skip_subscription_cycle`
      adicionadas à lista de tools

## Phase 7: Polish

- [X] T018 [P] `webapp/docs/API.md`, `webapp/CLAUDE.md`, `agents/nami/CLAUDE.md` — novas
      rotas/tools
- [X] T019 [P] `ROADMAP.md` — linha da spec 044
- [X] T020 `npx tsc -b --force` + `npm run build` — limpos; import smoke-test do router e
      do `agent.py`
- [X] T021 Atualizar `spec.md` (Status: Draft → implementado)

## Dependencies & Execution Order

Setup (T001) → Foundational (T002-T003) → US1 (T004-T010) → US2 (T011-T015) →
US3 (T016) → Telegram (T017) → Polish (T018-T021)
