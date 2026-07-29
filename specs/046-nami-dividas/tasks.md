# Tasks: Unificação de dívidas — financiamentos, empréstimos e simuladores

**Input**: plan.md, spec.md · **Branch**: `master`

## Phase 1: Setup

- [X] T001 `agents/nami/schema_pg.sql`: `loans.account_id` (drift) + `loans.financing_source_id`
- [X] T002 `scripts/migrate_nami_reforma.py`: +2 migrações idempotentes

## Phase 2: Foundational

- [X] T003 `scripts/migrate_financings_to_loans.py`: `_parse_interest_rate()` (puro) +
      migração idempotente (dedupe por `financing_source_id`)
- [X] T004 `agents/nami/tools_personal_loans.py`: list/create/update/pay/delete

## Phase 3: User Story 1 — Um único lugar para financiamentos (P1)

- [X] T005 [US1] Rodar a migração localmente (dry-run contra dump/ambiente de teste) —
      validar contagem origem×destino
- [X] T006 [US1] `finances.py`: remover rotas `/financings` (GET/POST/DELETE) + `CreateFinancingBody`
- [X] T007 [US1] `finances.py`: `personal-loans` passa a chamar `tools_personal_loans`
      (fim do acesso SQL direto — FR-006)
- [X] T008 [US1] `types.ts`: `BankLoan`; `namiApi.ts`: `getLoans`, `registerLoan`, `updateLoan`, `deleteLoan`
- [X] T009 [US1] `screens/Financings.tsx`: reescrita consumindo `/loans`

## Phase 4: User Story 2 — Simuladores pelo webapp (P2)

- [X] T010 [US2] Endpoints `POST /loans/{id}/simulate/payoff|amortization|accelerated`,
      `GET /loans/priority`
- [X] T011 [US2] `namiApi.ts`: `simulatePayoff/simulateAmortization/simulateAccelerated/getPayoffPriority`
- [X] T012 [US2] `Financings.tsx`: painel de simuladores por card + seção "Prioridade de quitação"

## Phase 5: User Story 3 — Registrar parcela paga pelo webapp (P2)

- [X] T013 [US3] Endpoint `POST /loans/{id}/payment` (`register_loan_payment`)
- [X] T014 [US3] `namiApi.ts`: `payLoanInstallment`; `Financings.tsx`: botão "Registrar parcela"

## Phase 6: User Story 4 — Empréstimos p2p no Telegram (P3)

- [X] T015 [US4] `agent.py`: registra as 5 tools p2p + seção "EMPRÉSTIMOS PESSOA-A-PESSOA"
- [X] T016 [US4] Endpoint `POST /personal-loans/{id}/payment`; `Loans.tsx` ganha botão
      "Registrar pagamento" (fecha a paridade webapp↔Telegram)

## Phase 7: Polish

- [X] T017 Verificação: `npx tsc -b --force`, `npm run build`, import smoke-test Python
- [X] T018 Docs: `agents/nami/CLAUDE.md`, `webapp/CLAUDE.md`, `webapp/docs/API.md`,
      `ROADMAP.md`, status do `spec.md`
