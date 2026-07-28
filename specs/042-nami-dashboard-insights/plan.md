# Implementation Plan: Dashboard completo — health score, tendência e pagamento de fatura

**Branch**: `master` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/042-nami-dashboard-insights/spec.md`

## Summary

100% frontend + um bugfix pontual de backend. As três análises da spec já existiam prontas no
backend (`GET /health`, `GET /trend`, `POST /cards/{id}/payment`) sem nenhum consumidor na UI —
a entrega é só a superfície visual: card "Saúde financeira" (Donut já existente + 4 barras de
dimensão), card "Tendência de gastos" (novo componente `AreaTrend`, gráfico de área SVG próprio)
e a ação "Registrar pagamento" na tela Cartões. No caminho, descobri que a barra de utilização do
limite do cartão estava **hardcoded em 0%** (nunca consumia `divida_atual`/`utilizacao_pct`, que
`GET /cards` já retornava) — corrigido junto, pois é o mesmo dado que a US3 pede para atualizar
após o pagamento. Também corrigi `GET /health` usar `date.today()` (UTC do servidor) em vez de
`_today_date()` (America/Sao_Paulo) para o mês padrão — mesma classe de bug da spec 040, só que
neste router ela não tinha sido varrida; os outros 3 pontos do mesmo bug no arquivo ficaram para
uma tarefa separada (fora do escopo desta spec).

## Technical Context

**Language/Version**: Python 3.11 (backend, só 1 linha alterada), TypeScript/React (frontend)

**Primary Dependencies**: FastAPI (já expunha as rotas), React + Vite

**Storage**: PostgreSQL (leitura via tools já existentes — nenhuma tabela nova)

**Testing**: `npx tsc -b --force` + `npm run build`; import smoke-test do router

**Target Platform**: navegador (webapp) — nenhuma mudança de infraestrutura

**Project Type**: Web application — só `webapp/frontend` + 1 linha em `webapp/backend`

**Performance Goals**: N/A

**Constraints**: gráficos SVG próprios, sem lib externa de chart (FR-005)

**Scale/Scope**: 2 cards novos no Dashboard, 1 componente novo em `ui.tsx`, 1 ação nova em
Cards.tsx (+ correção da barra de limite), 3 métodos novos em `namiApi.ts`, 1 linha corrigida
em `finances.py`

## Constitution Check

Sem `.specify/memory/constitution.md`. O gate de fato é FR-005 (sem lib de gráfico externa) —
respeitado: `AreaTrend` é SVG puro, mesmo padrão de `Donut`/`Spark`/`CashflowBars` já existentes.

## Project Structure

### Documentation (this feature)

```text
specs/042-nami-dashboard-insights/
├── plan.md              # este arquivo
├── spec.md               # já existia
├── tasks.md              # gerado nesta passada
└── checklists/
    └── requirements.md   # já existia
```

### Source Code (repository root)

```text
webapp/backend/routers/
└── finances.py            # GET /health: date.today() → _today_date() (fuso SP)

webapp/frontend/src/pages/nami/
├── namiApi.ts              # +getHealth, +getTrend, +payCardBill
├── types.ts                # Card ganha divida_atual/utilizacao_pct/taxa_juros_mensal
├── ui.tsx                  # +AreaTrend (gráfico de área SVG)
└── screens/
    ├── Dashboard.tsx        # +card "Saúde financeira" +card "Tendência de gastos"
    └── Cards.tsx            # +"Registrar pagamento" + barra de limite real (era 0% fixo)

webapp/docs/API.md           # /summary marcado como uso exclusivo do agente (FR-006)
```

**Structure Decision**: nenhuma pasta/arquivo novo fora do padrão já mapeado — só extensão de
telas e componentes existentes do domínio Nami.

## Complexity Tracking

Sem violações. Único desvio de escopo: a barra de limite hardcoded em 0% não estava nos
Functional Requirements originais, mas é o mesmo dado (`utilizacao_pct`) que a US3 exige
atualizar após o pagamento — corrigi por ser trivial e diretamente observável no mesmo fluxo.

## Verificação executada nesta passada (2026-07-28)

- [x] FR-001: card "Saúde financeira" no Dashboard com score 0–100 (Donut) + 4 dimensões
      (Poupança/Dívidas/Orçamento/Tendência) com barra própria — mapeadas de
      `taxa_poupanca`/`divida_cartao`/`taxa_gasto`/`comprometimento_futuro`.
- [x] FR-002: card "Tendência de gastos" com `AreaTrend` (área SVG) + projeção do mês
      corrente destacada (linha tracejada + ponto).
- [x] FR-003: "Registrar pagamento" por cartão em Cards.tsx — modal com valor + data,
      `POST /cards/{id}/payment`; barra de utilização e dívida atualizam ao recarregar
      (`onCardsChanged`).
- [x] FR-004: cada card (`health`/`trend`) tem `try/catch` independente — estado de erro local
      não propaga para o resto do Dashboard.
- [x] FR-005: `AreaTrend` é SVG próprio (mesmo padrão de `Donut`/`Spark`), sem dependência nova.
- [x] FR-006: `/summary` marcado em `webapp/docs/API.md` como uso exclusivo do agente.
- [x] Bugfix: `GET /health` usava `date.today()` (UTC) — corrigido para `_today_date()`.
- [x] `npx tsc -b --force` e `npm run build` — limpos.

## Nota de escopo (não implementado)

`register_card_payment` (backend) não aceita conta de origem — só grava a Receita vinculada ao
`card_id`, nunca debita uma conta bancária (arquitetura já existente: `account_id`/`card_id`
mutuamente exclusivos em `transactions`). O texto da US3 menciona "conta de origem", mas o input
da spec já dizia "a operação já existe no backend" — não criei um novo campo de conta que o
backend ignoraria silenciosamente. O modal de pagamento pede só valor + data, fiel ao contrato
real da API. Se o usuário quiser rastrear de qual conta saiu o dinheiro do pagamento, isso é uma
mudança de arquitetura maior (debitar a conta E reduzir a dívida do cartão na mesma transação) —
registrada aqui como possível spec futura, não implementada.

Os outros 3 usos de `date.today()` (UTC) remanescentes em `finances.py` (`data_inicio` de
parcelamento, mês padrão de orçamento, `next_billing` padrão de assinatura) não foram corrigidos
nesta passada — sinalizados como tarefa em background separada.
