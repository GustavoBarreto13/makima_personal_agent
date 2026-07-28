# Tasks: Correções de bugs da Nami (timezone, assinaturas, feedback de erro)

**Input**: Design documents from `specs/040-nami-bugfixes/`
**Prerequisites**: plan.md

**Nota**: todas as tarefas de implementação (T001–T013) já estavam concluídas no commit
`0d771a3` antes da formalização desta spec. As tarefas de verificação e fechamento (T014–T016)
foram executadas nesta passada (2026-07-28).

## Phase 1: Setup

- [X] T001 Confirmar dependência `zoneinfo` (stdlib Python 3.9+, sem instalação extra)

## Phase 2: Foundational

- [X] T002 Criar `_TZ = ZoneInfo("America/Sao_Paulo")` e `_today_date()` em `agents/nami/tools.py`

## Phase 3: User Story 1 — Contagem de parcelas correta em qualquer horário (P1)

- [X] T003 [US1] Substituir `CURRENT_DATE` por `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date` em `agents/nami/tools_installments.py` (contagem de parcelas pagas/pendentes)
- [X] T004 [US1] Mesma substituição no cancelamento de parcelas futuras em `agents/nami/tools_installments.py`
- [X] T005 [US1] Alinhar `agents/nami/tools_budgets.py` e `agents/nami/tools_credit_cards.py` a `_today_date()` (mês corrente, ciclo de fatura)
- [X] T006 [US1] Fechar o GROUP BY de `get_spending_summary` (`agents/nami/tools.py`) via dict `group_cols` fechado — elimina interpolação de texto do usuário na query

**Checkpoint**: consultas de parcelamento/resumo/orçamento não dependem mais de UTC do servidor.

## Phase 4: User Story 2 — Assinatura registrada com pagador real e data válida (P2)

- [X] T007 [US2] Validar `next_billing` com `date.fromisoformat()` em `create_subscription` (`agents/nami/tools.py`), retornando erro amigável em formato inválido
- [X] T008 [US2] Resolver pagador dinamicamente: `_resolve_account(conta)` primeiro, `_resolve_credit_card(conta)` como fallback; erro claro se nenhum resolver
- [X] T009 [US2] Gravar `account_id`/`card_id` mutuamente exclusivos no INSERT de `subscriptions`
- [X] T010 [US2] Migração idempotente `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS account_id/card_id` em `scripts/migrate_nami_reforma.py` + `agents/nami/schema_pg.sql`
- [X] T011 [US2] **Rodar a migração em produção** (dentro do container `makima-web` no VPS) — confirmado executado (colunas presentes no banco de produção, verificado nesta passada)

**Checkpoint**: novas assinaturas gravam vínculo real de pagador; datas malformadas não chegam ao banco.

## Phase 5: User Story 3 — Erros visíveis e saudação personalizada no webapp (P3)

- [X] T012 [P] [US3] Criar `webapp/frontend/src/pages/nami/dateUtils.ts` (hoje/mês corrente/parse ISO/diferença em dias, só com partes locais do navegador)
- [X] T013 [P] [US3] Ajustar `relDay`/`fmtDay` em `webapp/frontend/src/pages/nami/ui.tsx` para usar o novo helper (sem off-by-one perto da meia-noite)
- [X] T014 [US3] Saudação do Dashboard via `/auth/me` (primeiro nome da sessão, fallback silencioso) em `webapp/frontend/src/pages/nami/screens/Dashboard.tsx`
- [X] T015 [P] [US3] Toast no catch de `getCategories` em `Budgets.tsx`, `Transactions.tsx` e `modals/AddModal.tsx`

**Checkpoint**: nenhuma tela da Nami falha silenciosamente ao carregar categorias; saudação não é hardcoded.

## Phase 6: Polish & Fechamento (executado 2026-07-28)

- [X] T016 Verificar cada FR (FR-001 a FR-009) contra o código atual em produção — ver seção "Verificação executada" em `plan.md`
- [X] T017 Confirmar via SSH/`docker exec makima-web` que a migração (T011) já rodou em produção
- [X] T018 [P] Atualizar `docs/referencia/POSTGRES.md` — tabela `subscriptions` ganha as colunas `account_id`/`card_id`
- [X] T019 Atualizar `spec.md` (linha de Status) de "pendente: rodar migração" para "implementado e validado em produção"

## Dependencies & Execution Order

- Setup (T001) → Foundational (T002) → User Story 1 (T003-T006) → User Story 2 (T007-T011) →
  User Story 3 (T012-T015) → Polish (T016-T019)
- T011 depende de T010 (migração só roda depois do script existir)
- T012-T013 e T015 são paralelizáveis entre si (arquivos distintos do frontend)

## Implementation Strategy

MVP já entregue = User Story 1 (P1, maior risco financeiro). US2 e US3 já vieram no mesmo commit
por serem pequenas e compartilharem o mesmo cliente PR. Nada incremental resta — esta spec está
100% fechada após T019.
