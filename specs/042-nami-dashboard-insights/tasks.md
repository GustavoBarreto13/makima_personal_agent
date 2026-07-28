# Tasks: Dashboard completo — health score, tendência e pagamento de fatura

**Input**: Design documents from `specs/042-nami-dashboard-insights/`
**Prerequisites**: plan.md

## Phase 1: Setup

- [X] T001 Confirmar que `GET /health`, `GET /trend` e `POST /cards/{id}/payment` já existem no backend (nenhuma rota nova necessária)
- [X] T002 Descobrir bug: `GET /health` usava `date.today()` (UTC) em vez de `_today_date()` (America/Sao_Paulo) para o mês padrão

## Phase 2: Foundational

- [X] T003 Corrigir `GET /health` em `webapp/backend/routers/finances.py` — importar `_today_date` de `agents.nami.tools`, trocar `date.today()`
- [X] T004 Tipos `Card.divida_atual`/`utilizacao_pct`/`taxa_juros_mensal` em `webapp/frontend/src/pages/nami/types.ts` (campos que `GET /cards` já retornava e o frontend nunca tipou)

## Phase 3: User Story 1 — Ver a saúde financeira de relance (P1)

- [X] T005 [US1] `namiApi.getHealth(month?)` em `namiApi.ts`
- [X] T006 [US1] Card "Saúde financeira" em `Dashboard.tsx` — `Donut` (score/100) + 4 barras de dimensão (Poupança/Dívidas/Orçamento/Tendência), `try/catch` isolado
- [X] T007 [US1] Estado de erro discreto (`healthError`) sem quebrar o resto do Dashboard

**Checkpoint**: score e dimensões no Dashboard idênticos aos do Telegram para o mesmo mês.

## Phase 4: User Story 2 — Tendência de gastos com projeção (P2)

- [X] T008 [US2] `namiApi.getTrend(months?)` em `namiApi.ts`
- [X] T009 [US2] Componente `AreaTrend` (gráfico de área SVG próprio) em `ui.tsx` — sem lib externa (FR-005)
- [X] T010 [US2] Card "Tendência de gastos" em `Dashboard.tsx` com projeção do mês corrente destacada (linha tracejada + ponto)
- [X] T011 [US2] Estado de erro discreto (`trendError`) isolado do resto do Dashboard

**Checkpoint**: gráfico de área mostra a evolução mensal + projeção idêntica ao Telegram.

## Phase 5: User Story 3 — Registrar pagamento de fatura (P2)

- [X] T012 [US3] `namiApi.payCardBill(cardId, valor, data?)` em `namiApi.ts`
- [X] T013 [US3] Modal "Registrar pagamento" por cartão em `Cards.tsx` (valor + data; sem conta de origem — backend não aceita, ver Nota de escopo do plan.md)
- [X] T014 [US3] Validação de valor vazio/zero/negativo antes de enviar
- [X] T015 [US3] Corrigir a barra de utilização do limite — estava hardcoded em `0%`, passa a usar `card.utilizacao_pct`; dívida atual exibida com `card.divida_atual`
- [X] T016 [US3] Recarregar cartões (`onCardsChanged`) após pagamento confirmado

**Checkpoint**: pagamento reduz a dívida exibida e a barra de utilização atualiza na hora.

## Phase 6: Polish

- [X] T017 [P] `webapp/docs/API.md` — marcar `/summary` como uso exclusivo do agente (FR-006)
- [X] T018 [P] `webapp/CLAUDE.md` — nova linha da fatia 042
- [X] T019 [P] `ROADMAP.md` — nova linha da spec 042
- [X] T020 `npx tsc -b --force` + `npm run build` — limpos
- [X] T021 Atualizar `spec.md` (Status: Draft → implementado)
- [X] T022 Flag em background task: 3 usos remanescentes de `date.today()` em `finances.py` fora do escopo desta spec

## Dependencies & Execution Order

- Setup (T001-T002) → Foundational (T003-T004) → US1 (T005-T007) → US2 (T008-T011) → US3 (T012-T016) → Polish (T017-T022)
- US1, US2 e US3 são independentes entre si (cards distintos do Dashboard vs. ação em Cards.tsx) — podiam ser feitas em qualquer ordem

## Implementation Strategy

Como as 3 rotas de backend já existiam prontas, não houve MVP incremental real — as 3 user
stories foram entregues juntas na mesma passada por serem pequenas extensões independentes de
telas já existentes (Dashboard e Cards), sem dependência entre si.
