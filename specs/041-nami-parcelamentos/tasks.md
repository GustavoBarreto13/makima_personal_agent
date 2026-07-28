# Tasks: Parcelamentos — tela com acompanhamento individual por compra

**Input**: Design documents from `specs/041-nami-parcelamentos/`
**Prerequisites**: plan.md

## Phase 1: Setup

- [X] T001 Confirmar schema atual de `installment_groups` em produção via `docker exec makima-web` (descobriu que `account_id`/`card_id` não estavam declarados no schema canônico)

## Phase 2: Foundational

- [X] T002 Adicionar `account_id`/`card_id` a `installment_groups` em `agents/nami/schema_pg.sql`
- [X] T003 Migração idempotente em `scripts/migrate_nami_reforma.py` (2 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`)
- [X] T004 Rodar a migração em produção (`docker cp` + `docker exec makima-web -m scripts.migrate_nami_reforma`) — confirmado

## Phase 3: User Story 1 — Ver e acompanhar cada compra parcelada (P1)

- [X] T005 [US1] `get_installment_detail(group_id)` em `agents/nami/tools_installments.py` — grupo + parcelas numeradas cronologicamente com `pago`/`mes_corrente`
- [X] T006 [US1] Rota `GET /api/finances/installments/{group_id}` em `webapp/backend/routers/finances.py`
- [X] T007 [US1] `list_installments` passa a expor `account_id`/`card_id` (para decidir ícone de origem no frontend)
- [X] T008 [US1] Tipos `Installment`/`InstallmentDetail`/`InstallmentParcela` em `webapp/frontend/src/pages/nami/types.ts`
- [X] T009 [US1] `namiApi.getInstallments`/`getInstallmentDetail` em `namiApi.ts`
- [X] T010 [US1] Tela `screens/Installments.tsx` — lista com progresso (barra `.loan-track`/`.loan-fill`), drill-down expansível com linha do tempo das parcelas, estado vazio com CTA
- [X] T011 [US1] Rota `POST /api/finances/installments/{group_id}/cancel` (cancelar futuras) + `DELETE /installments/{group_id}` já existente (excluir tudo) — ambas com confirmação (`window.confirm`) no frontend
- [X] T012 [US1] Registrar a view "parcelamentos" em `NamiShell.tsx` (nav, hash, título, ícone)

**Checkpoint**: parcelamentos existentes aparecem na UI com progresso e drill-down corretos.

## Phase 4: User Story 2 — Criar compra parcelada no cartão de crédito (P1)

- [X] T013 [US2] `create_installment` ganha `card_id` opcional em `tools_installments.py` — resolve cartão por UUID (`_load_cards()`) ou conta por nome (`_resolve_account`), mutuamente exclusivos
- [X] T014 [US2] Transações individuais da parcela passam a gravar `card_id` (antes só `account_id`)
- [X] T015 [US2] `CreateInstallmentBody.card_id` em `finances.py` + remoção do comentário "card_id não suportado"
- [X] T016 [US2] Formulário de criação em `Installments.tsx` com seletor combinado conta/cartão (`fonte`, padrão `kind:value` do `AddModal`)
- [X] T017 [US2] Validação tudo-ou-nada preservada: erro de origem/categoria/data aborta antes de qualquer INSERT

**Checkpoint**: compra parcelada no cartão gera transações vinculadas ao cartão, dívida reflete as parcelas.

## Phase 5: User Story 3 — Compromissos futuros e parcelamentos no cartão (P2)

- [X] T018 [US3] `get_card_installments(card_id)` em `tools_installments.py` — grupos ativos do cartão + comprometimento mensal + mês final (`HAVING` parcelas pendentes > 0)
- [X] T019 [US3] Rota `GET /api/finances/cards/{card_id}/installments`
- [X] T020 [US3] Card "Compromissos futuros" (3 meses) em `Installments.tsx`, reusando `get_future_commitments`
- [X] T021 [US3] Seção "Parcelamentos ativos" por cartão em `Cards.tsx` + navegação para o drill-down via `sessionStorage` transiente (`nami:highlight-installment`)

**Checkpoint**: cartão mostra parcelamentos ativos e comprometimento mensal; clique navega e expande a compra certa.

## Phase 6: Polish

- [X] T022 [P] Atualizar `agents/nami/CLAUDE.md` (tabela de tools de `tools_installments.py`)
- [X] T023 [P] Atualizar `webapp/CLAUDE.md` (remover restrição obsoleta, documentar fatia 041)
- [X] T024 [P] Atualizar `docs/referencia/POSTGRES.md` (colunas novas de `installment_groups`)
- [X] T025 Atualizar `ROADMAP.md` com a linha da spec 041
- [X] T026 `npx tsc -b --force` + `npm run build` — limpos
- [X] T027 Atualizar `spec.md` (Status: Draft → implementado)

## Dependencies & Execution Order

- Setup (T001) → Foundational (T002-T004) → US1 (T005-T012) → US2 (T013-T017) → US3 (T018-T021) → Polish (T022-T027)
- US2 depende de US1 (reusa a mesma tela e o mesmo `create_installment`)
- US3 depende de US1 e US2 (comprometimento do cartão só existe depois que parcelamento no cartão é possível)
- T022-T025 são paralelizáveis entre si (arquivos de doc distintos)

## Implementation Strategy

MVP = User Story 1 (P1) — maior gap funcional isolado. User Story 2 (P1) entregue junto por
compartilhar a mesma tela e o mesmo endpoint de criação — dividir teria gerado retrabalho na
mesma tela duas vezes. User Story 3 (P2) fecha o ciclo mas não bloqueia as duas primeiras.
