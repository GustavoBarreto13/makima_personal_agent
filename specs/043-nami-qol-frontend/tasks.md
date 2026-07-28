# Tasks: Qualidade de vida no webapp — edição, exportação, filtros, transferências

**Input**: Design documents from `specs/043-nami-qol-frontend/`
**Prerequisites**: plan.md

## Phase 1: Setup

- [X] T001 Levantar tools já existentes (`update_account`, `update_credit_card` — sem
      endpoint HTTP) e bugs (`update_transaction` não toca `account_id`/`card_id`;
      `query_expenses` não seleciona `account_id`/`card_id`, nem filtra categoria/tipo)

## Phase 2: Foundational

- [X] T002 `transactions.transfer_id` em `agents/nami/schema_pg.sql` + migração idempotente
      em `scripts/migrate_nami_reforma.py` — rodar no VPS via `docker exec makima-web`
- [X] T003 Corrigir `update_transaction` em `agents/nami/tools.py` — passa a atualizar
      `account_id`/`card_id` junto com `conta` (mutuamente exclusivos, mesmo padrão de
      `create_transaction_on_cursor`)
- [X] T004 `query_expenses` em `agents/nami/tools.py` — `account_id`/`card_id` no SELECT;
      parâmetros opcionais `categoria`, `tipo`, `limit`, `offset` (+`has_more` no retorno)

## Phase 3: User Story 1 — Editar transação (P1)

- [X] T005 [US1] `PATCH /transactions/{id}` em `finances.py` — `UpdateTransactionBody`
      ganha `card_id` opcional
- [X] T006 [US1] `namiApi.updateTransaction(id, body)` em `namiApi.ts`
- [X] T007 [US1] `AddModal.tsx` vira dual-mode via prop opcional `editingTx` — título/label
      do botão mudam, pré-preenche todos os campos, chama `updateTransaction` em vez de
      `createTransaction`/`createInstallment` (edição não mexe em parcelamento)
- [X] T008 [US1] Botão de editar em `TxRow.tsx` (ícone, ao lado da lixeira) + `onEdit`
      prop propagada por `TxList`
- [X] T009 [US1] `Transactions.tsx` — estado `editingTx`, abre `AddModal` em modo edição,
      recarrega a lista + `onTransactionSaved` ao salvar

**Checkpoint**: editar valor/categoria/origem de uma transação existente reflete na lista,
nos totais do mês e persiste a origem corretamente (conta ↔ cartão).

## Phase 4: User Story 2 — Editar contas, cartões e assinaturas (P2)

- [X] T010 [US2] `PATCH /accounts/{id}` em `finances.py` — usa `update_account` (já
      existia) + UPDATE dos campos visuais (color/short/icon_url), mesmo padrão do POST
- [X] T011 [US2] `PATCH /cards/{id}` em `finances.py` — usa `update_credit_card` (já
      existia) + UPDATE dos campos visuais (brand/last4/grad)
- [X] T012 [US2] `UpdateSubscriptionBody` ganha campos visuais (color/icon_url/
      next_billing_day) no `PATCH /subscriptions/{id}` já existente
- [X] T013 [US2] `namiApi.updateAccount`, `updateCard`, `updateSubscription` (ajustar
      assinatura) em `namiApi.ts`
- [X] T014 [US2] `Accounts.tsx` — botão editar por card, `FormModal` com `initialValues`
- [X] T015 [US2] `Cards.tsx` — botão editar por cartão, `FormModal` com `initialValues`
- [X] T016 [US2] `Subscriptions.tsx` — botão editar por linha, `FormModal` com
      `initialValues`

**Checkpoint**: renomear conta e mudar limite/vencimento de cartão refletem na tela e no
histórico vinculado (nenhum apaga+recria).

## Phase 5: User Story 3 — Exportar extrato e filtrar melhor (P2)

- [X] T017 [US3] `GET /transactions/export` em `finances.py` — CSV (BOM UTF-8 + `;`),
      respeita `start_date`/`end_date`/`categoria`/`tipo`
- [X] T018 [US3] `namiApi.exportTransactionsUrl(...)` (monta a URL; download via
      `window.location.href`, cookie de sessão já vai automático em navegação same-origin)
- [X] T019 [US3] `Transactions.tsx` — categorias do filtro vêm de `GET /categories`
      (todas) em vez de só as presentes no mês; botão "Exportar CSV"
- [X] T020 [US3] Persistência de filtro + ordenação em `localStorage` (`nami:tx-filters`)

**Checkpoint**: filtrar por categoria, exportar, abrir no Excel com acentos corretos;
recarregar a página mantém o filtro.

## Phase 6: User Story 4 — Transferir entre contas (P2)

- [X] T021 [US4] `create_transfer` em `agents/nami/tools.py` — par atômico via
      `get_conn()`, `tipo='Transferencia'`, `transfer_id` compartilhado, valida origem ≠
      destino
- [X] T022 [US4] `POST /transfers` em `finances.py`
- [X] T023 [US4] `namiApi.createTransfer(...)` em `namiApi.ts`
- [X] T024 [US4] `modals/TransferModal.tsx` (novo) — origem/destino (contas) + valor + data
- [X] T025 [US4] Botão "Transferir" em `Accounts.tsx` abrindo o `TransferModal`

**Checkpoint**: transferir R$100 muda os 2 saldos e não aparece em receita/despesa do mês
(consequência automática do filtro `tipo IN ('Despesa','Receita')` já existente em
stats/health/trend/budgets).

## Phase 7: User Story 5 — Heatmap + paginação (P3)

- [X] T026 [US5] `HeatmapMonth` (novo componente SVG) em `ui.tsx` — grid de dias coloridos
      por gasto, usa `stats.daily_spending` (já existe)
- [X] T027 [US5] Card "Ritmo de gastos" em `Dashboard.tsx` com `HeatmapMonth`
- [X] T028 [US5] `namiApi.getTransactions` ganha `limit`/`offset`; `Transactions.tsx` usa
      página inicial de 300 + botão "Carregar mais" quando `has_more`

**Checkpoint**: heatmap coerente com gastos concentrados; "Carregar mais" aparece só
quando há mais de 300 lançamentos no mês.

## Phase 8: Polish

- [X] T029 [P] `webapp/docs/API.md` — novas rotas (`PATCH /accounts/{id}`, `PATCH
      /cards/{id}`, `GET /transactions/export`, `POST /transfers`)
- [X] T030 [P] `webapp/CLAUDE.md` — fatia 043
- [X] T031 [P] `ROADMAP.md` — linha da spec 043
- [X] T032 `npx tsc -b --force` + `npm run build` — limpos
- [X] T033 Atualizar `spec.md` (Status: Draft → implementado)

## Dependencies & Execution Order

Setup (T001) → Foundational (T002-T004) → US1 (T005-T009) → US2 (T010-T016) →
US3 (T017-T020) → US4 (T021-T025) → US5 (T026-T028) → Polish (T029-T033)

US1-US5 são independentes entre si após o Foundational (spec.md, Assumptions) — só T003/
T004 (query_expenses/update_transaction) são pré-requisito comum de US1 e US3.
