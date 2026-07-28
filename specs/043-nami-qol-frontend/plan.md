# Implementation Plan: Qualidade de vida no webapp — edição, exportação, filtros, transferências

**Branch**: `master` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/043-nami-qol-frontend/spec.md`

## Summary

Backend + frontend, split por user story:

- **US1 (edição de transação)**: descoberta de bug real — `update_transaction` nunca
  atualizava `account_id`/`card_id`, só o campo display `conta` (origem ficava "presa" no
  texto antigo mesmo mudando de conta/cartão). Corrigido junto. `query_expenses` ganha
  `account_id`/`card_id` no SELECT (faltavam — o formulário de edição não teria como saber
  a origem atual). `AddModal.tsx` vira dual-mode (criar/editar) via prop `editingTx`.
- **US2 (editar contas/cartões/assinaturas)**: `update_account`/`update_credit_card` já
  existiam em `tools_accounts.py`/`tools_credit_cards.py` **sem nenhum endpoint HTTP** —
  só faltava expor. `update_subscription` já tinha PATCH; faltavam os campos visuais
  (color/icon_url/next_billing_day), mesmo padrão do POST.
- **US3 (export CSV + filtro completo + persistência)**: `query_expenses` ganha
  `categoria`/`tipo` opcionais; novo endpoint `GET /transactions/export` (CSV com BOM UTF-8
  + `;` como separador — padrão Excel pt-BR). Frontend: categorias do filtro passam a vir
  de `GET /categories` (todas) em vez de só as presentes no mês; filtros + ordenação
  persistidos em `localStorage`.
- **US4 (transferências)**: nova tool `create_transfer` (par atômico via `get_conn()`,
  mesmo padrão de `create_transaction_on_cursor`); `tipo='Transferencia'` — as queries de
  totais (`stats`, `health`, `budgets`, `trend`) já filtram explicitamente por
  `tipo IN ('Despesa','Receita')`, então transferências são excluídas de relatórios **sem
  precisar tocar nesse código** — é só uma consequência do filtro já existente. Migração
  nova: `transactions.transfer_id`.
- **US5 (heatmap + paginação)**: heatmap usa `stats.daily_spending` (já existe, zero
  mudança de backend) — novo componente `HeatmapMonth` em `ui.tsx`. Paginação:
  `query_expenses` ganha `limit`/`offset`; `Transactions.tsx` usa página inicial generosa
  (300) + "Carregar mais".

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript/React (frontend)

**Primary Dependencies**: FastAPI, React + Vite — nenhuma dependência nova

**Storage**: PostgreSQL — 1 coluna nova (`transactions.transfer_id`), migração idempotente

**Testing**: `npx tsc -b --force` + `npm run build`; smoke test manual dos 5 fluxos

**Constraints**: CSV sem lib externa (`csv` stdlib); heatmap SVG próprio (padrão do repo,
sem lib de gráfico)

**Scale/Scope**: 5 user stories independentes entre si (spec.md, Assumptions)

## Project Structure

```text
agents/nami/tools.py                    # query_expenses (+categoria/tipo/limit/offset,
                                         #   +account_id/card_id no SELECT), update_transaction
                                         #   (fix real: account_id/card_id), create_transfer (novo)
agents/nami/schema_pg.sql               # transactions.transfer_id
scripts/migrate_nami_reforma.py         # +1 ALTER TABLE idempotente

webapp/backend/routers/finances.py      # PATCH /accounts/{id}, PATCH /cards/{id} (tools já
                                         #   existiam, só faltava expor); GET /transactions/export
                                         #   (CSV); POST /transfers; UpdateSubscriptionBody +
                                         #   campos visuais

webapp/frontend/src/pages/nami/
├── namiApi.ts                # updateTransaction, updateAccount, updateCard, exportTransactionsUrl,
│                              #   createTransfer, getTransactions(limit/offset/categoria/tipo)
├── types.ts                  # Transaction ganha account_id; TxFilters (persistência)
├── ui.tsx                    # +HeatmapMonth (SVG grid, sem lib externa)
├── modals/AddModal.tsx       # dual-mode criar/editar (prop editingTx)
├── modals/TransferModal.tsx  # novo — conta origem/destino + valor + data
├── components/TxRow.tsx      # +botão editar (chama onEdit)
└── screens/
    ├── Transactions.tsx      # editingTx state, export CSV, filtro completo + localStorage,
    │                          #   paginação "Carregar mais"
    ├── Accounts.tsx          # editar conta (FormModal + initialValues) + botão Transferir
    ├── Cards.tsx             # editar cartão (FormModal + initialValues)
    ├── Subscriptions.tsx     # editar assinatura (FormModal + initialValues)
    └── Dashboard.tsx         # +card heatmap de gastos diários

webapp/docs/API.md                      # novas rotas
webapp/CLAUDE.md                        # fatia 043
ROADMAP.md                              # linha da spec 043
```

**Structure Decision**: nenhuma pasta nova — extensão de arquivos já mapeados no domínio
Nami. `TransferModal.tsx` é o único componente novo do lado backend-facing; `HeatmapMonth`
é o único componente visual novo.

## Constitution Check

Sem `.specify/memory/constitution.md`. Gates de fato: FR-005 (upload de ícone via canal
padrão — já é assim, `namiApi.uploadIcon`, sem mudança) e "gráficos próprios, sem lib
externa" (implícito no padrão do repo, replicado no heatmap).

## Decisões de escopo

1. **Transferência não usa `create_transaction` existente** — teria que forçar
   `tipo IN ('Despesa','Receita')` (validado no código) e não deixaria os dois lados
   com um `transfer_id` compartilhado para desfazer/exibir como par. Função dedicada,
   inserindo direto via `get_conn()` (mesmo padrão de atomicidade da Kaguya).
2. **CSV usa `;` como separador, não `,`** — Excel em locale pt-BR interpreta `,` como
   separador decimal e quebra colunas numéricas; `;` é o separador de lista real do
   Excel BR. BOM UTF-8 (`﻿`) na frente garante acentuação correta ao abrir direto.
3. **Paginação é por mês, não global** — a tela já busca por mês (`GET /transactions?
   start_date&end_date`); "Carregar mais" ainda ancorado ao mês selecionado, evitando
   redesenhar a navegação existente.
4. **Categorias do filtro passam a vir de `GET /categories` inteiro** — a tela já carrega
   essa lista para o `QuickAdd`/`AddModal`; só precisa parar de derivar os chips a partir
   das transações presentes no mês.
