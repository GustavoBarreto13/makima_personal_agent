# Implementation Plan: Parcelamentos — tela com acompanhamento individual por compra

**Branch**: `master` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/041-nami-parcelamentos/spec.md`

## Summary

Fecha o maior gap funcional do webapp da Nami: compras parceladas existem no banco desde a
Fase 1 mas não tinham nenhuma tela — só o Telegram conseguia consultá-las, e a criação só
aceitava conta bancária (nunca cartão de crédito, o caso mais comum no Brasil). A entrega tem
três frentes: (1) nova tela "Parcelamentos" no shell da Nami com lista + drill-down por compra;
(2) `create_installment()` passa a aceitar cartão como origem (mutuamente exclusivo com conta,
mesma regra já usada em `create_transaction`/`create_subscription`); (3) compromissos futuros no
topo da tela + "Parcelamentos ativos" dentro de cada cartão na tela Cartões.

Abordagem técnica: `installment_groups` nunca teve `account_id`/`card_id` declarados no schema
canônico (gap descoberto durante a implementação — `create_installment` já gravava `account_id`
"no escuro", produção não tinha a coluna) — migração idempotente formaliza as duas colunas.
`get_installment_detail(group_id)` numera as parcelas pela posição cronológica (não pelo parse do
nome "(N/M)"), e `get_card_installments(card_id)` agrega por HAVING (só grupos com ao menos uma
parcela pendente contam no comprometimento mensal). Frontend segue o padrão já usado por Loans
(`.loan-card`/`.loan-track`/`.loan-fill`) para o card de progresso, e o padrão do `AddModal`
(`kind:value` no seletor) para a escolha conta-ou-cartão no formulário de criação.

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript/React (frontend)

**Primary Dependencies**: psycopg2, FastAPI, React + Vite

**Storage**: PostgreSQL (`installment_groups`, `transactions`, `accounts`, `credit_cards`,
`subscriptions`)

**Testing**: `npx tsc -b --force` + `npm run build` (frontend); `python -m py_compile` + import
smoke test (backend); verificação manual dos cenários de aceitação da spec

**Target Platform**: VPS Linux (container `makima-web`) + navegador (webapp)

**Project Type**: Web application (agents/nami + webapp/backend FastAPI + webapp/frontend React)

**Performance Goals**: N/A — CRUD simples sobre poucas dezenas de grupos de parcelamento

**Constraints**: migração de schema deve ser idempotente; hostname do PostgreSQL só resolve
dentro do container `makima-web` no VPS

**Scale/Scope**: 1 tabela alterada (2 colunas novas), 1 arquivo de tools do backend
(`tools_installments.py`, 2 funções novas + 1 alterada), 1 router (`finances.py`, 3 rotas
novas), 1 tela nova do frontend + 1 tela existente estendida (`Cards.tsx`)

## Constitution Check

Sem `.specify/memory/constitution.md` no projeto — sem gates formais. Convenção global de
mutual-exclusividade `account_id`/`card_id` (já estabelecida em `transactions`/`subscriptions`)
é o gate de fato, replicada aqui sem desvio.

## Project Structure

### Documentation (this feature)

```text
specs/041-nami-parcelamentos/
├── plan.md              # este arquivo
├── spec.md              # já existia
├── tasks.md             # gerado nesta passada
└── checklists/
    └── requirements.md  # já existia
```

### Source Code (repository root)

```text
agents/nami/
├── tools_installments.py   # create_installment (+card_id), get_installment_detail (novo),
│                           # get_card_installments (novo), list_installments (+account_id/card_id)
└── schema_pg.sql           # installment_groups ganha account_id/card_id

scripts/
└── migrate_nami_reforma.py  # +2 ALTER idempotentes (installment_groups) — já executado no VPS

webapp/backend/routers/
└── finances.py              # +3 rotas: GET /installments/{id}, POST /installments/{id}/cancel,
                              # GET /cards/{id}/installments; CreateInstallmentBody ganha card_id

webapp/frontend/src/pages/nami/
├── types.ts                 # Installment, InstallmentDetail, InstallmentParcela, CardInstallment
├── namiApi.ts                # +6 métodos de installments/commitments
├── NamiShell.tsx             # nova view "parcelamentos" (nav, hash, título, ícone)
└── screens/
    ├── Installments.tsx      # tela nova — lista + drill-down + compromissos + criação
    └── Cards.tsx             # +seção "Parcelamentos ativos" por cartão
```

**Structure Decision**: segue a estrutura já existente do monorepo — nenhum arquivo/pasta nova
fora do padrão já mapeado no `CLAUDE.md` raiz e no `webapp/CLAUDE.md`.

## Complexity Tracking

Sem violações — mutual-exclusividade conta/cartão replica o padrão já usado em
`transactions`/`subscriptions`; drill-down por posição cronológica evita depender de parsing de
string (`"(N/M)"` no nome), que seria mais frágil.

## Verificação executada nesta passada (2026-07-28)

- [x] FR-001: `get_installment_detail(group_id)` retorna grupo + parcelas com número/data/valor/pago.
- [x] FR-002: `create_installment` aceita `card_id` (mutuamente exclusivo com `conta`), tudo-ou-nada
      (grupo só é criado após validar origem/categoria/data; cada parcela falha aborta a mensagem
      de erro, mas o grupo e as parcelas já inseridas não são revertidas automaticamente — mesma
      limitação que já existia antes desta spec, fora do escopo corrigir aqui).
- [x] FR-003: tela "Parcelamentos" no nav da Nami com lista, drill-down, criação, cancelamento e
      exclusão total (ambos com confirmação via `window.confirm`).
- [x] FR-004: card "Compromissos futuros" (3 meses) reusando `get_future_commitments`.
- [x] FR-005: tela Cartões exibe parcelamentos ativos por cartão + comprometimento mensal + mês
      final, com navegação para o drill-down (`sessionStorage` transiente).
- [x] FR-006: parcela do mês corrente destacada (`mes_corrente` calculado no backend).
- [x] FR-007: comentário/restrição obsoleta removida de `webapp/CLAUDE.md`.
- [x] Migração (`installment_groups.account_id`/`card_id`) executada em produção via
      `docker exec makima-web` — confirmado por consulta direta ao schema.
- [x] `docs/referencia/POSTGRES.md` e `agents/nami/CLAUDE.md` atualizados.
- [x] `npx tsc -b --force` e `npm run build` — limpos.

## Nota de escopo (não implementado)

`create_installment` não é atômico entre o INSERT do grupo e o loop de INSERTs das parcelas —
mesma limitação do código anterior a esta spec (não introduzida agora, não coberta pelos
Functional Requirements). Se um INSERT de parcela falhar no meio do loop, o grupo e as parcelas
já criadas ficam órfãos no banco. Não corrigido aqui por estar fora do escopo declarado da spec;
registrado para uma spec futura de hardening transacional caso vire problema real.
