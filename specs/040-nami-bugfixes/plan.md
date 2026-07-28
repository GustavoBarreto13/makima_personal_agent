# Implementation Plan: Correções de bugs da Nami (timezone, assinaturas, feedback de erro)

**Branch**: `master` (código já mesclado — spec formalizada após a implementação) | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/040-nami-bugfixes/spec.md`

**Nota sobre esta spec**: o código foi implementado no commit `0d771a3` (`fix(nami): timezone SP,
GROUP BY seguro, assinaturas com account_id/card_id`) antes da formalização via Spec Kit — ver
nota no checklist `checklists/requirements.md`. Este plano documenta retroativamente a abordagem
já adotada e serve de checklist de verificação para o que ainda faltava: rodar a migração em
produção e atualizar a documentação de referência. Ambos concluídos nesta passada (2026-07-28).

## Summary

Três frentes de correção no domínio financeiro (Nami): (1) eliminar todo uso de data/hora UTC do
servidor para derivar "hoje" no backend e no frontend, substituindo por America/Sao_Paulo; (2)
fechar duas superfícies de risco em `get_spending_summary` (GROUP BY livre) e `create_subscription`
(pagador só por nome-texto, sem validar data); (3) fechar duas falhas de UX no webapp (saudação
hardcoded, catches silenciosos sem toast).

Abordagem técnica: backend Python usa `zoneinfo.ZoneInfo("America/Sao_Paulo")` centralizado em
`_today_date()` (agents/nami/tools.py) e `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date` nas
queries SQL que não passam por Python; `get_spending_summary` passa a resolver a coluna do
GROUP BY por um dict fechado (`{"categoria": ..., "conta": ..., "tipo": ...}`) em vez de
interpolar a string recebida; `create_subscription` valida `next_billing` com
`date.fromisoformat()` antes do INSERT e resolve o pagador chamando `_resolve_account()` e, se
falhar, `_resolve_credit_card()`, gravando `account_id`/`card_id` mutuamente exclusivos (mesma
regra já usada em `transactions`). Frontend ganha `webapp/frontend/src/pages/nami/dateUtils.ts`
(partes locais do navegador, nunca `toISOString()`) e a saudação do Dashboard passa a buscar
`/auth/me` em vez de nome fixo no código.

## Technical Context

**Language/Version**: Python 3.11 (backend agentes/webapp), TypeScript/React (frontend)

**Primary Dependencies**: psycopg2 (PostgreSQL síncrono), zoneinfo (stdlib), FastAPI (webapp
backend), React + Vite (webapp frontend)

**Storage**: PostgreSQL (`subscriptions`, `transactions`, `accounts`, `credit_cards`, `budgets`)

**Testing**: Verificação manual via cenários de aceitação da spec (sem suíte automatizada neste
domínio) + `npx tsc -b --force` para o frontend

**Target Platform**: VPS Linux (Docker Swarm, container `makima-web`) + navegador (webapp)

**Project Type**: Web application (backend agents/ + webapp/backend FastAPI + webapp/frontend React)

**Performance Goals**: N/A — mudanças são correções pontuais, sem novo caminho de alta frequência

**Constraints**: migração de schema deve ser idempotente e seguro rodar novamente; hostname do
PostgreSQL só resolve dentro do container `makima-web` no VPS (não na shell do host)

**Scale/Scope**: 5 arquivos de tools do backend Nami + 1 script de migração + 6 arquivos do
frontend Nami

## Constitution Check

Não há `.specify/memory/constitution.md` neste projeto — sem gates formais de constituição.
Convenção global do CLAUDE.md raiz ("Fuso horário — tudo em UTC-3") é o gate de fato desta spec,
e é exatamente o que as mudanças implementam.

## Project Structure

### Documentation (this feature)

```text
specs/040-nami-bugfixes/
├── plan.md              # este arquivo
├── spec.md              # já existia — spec formalizada retroativamente
├── tasks.md             # gerado nesta passada
└── checklists/
    └── requirements.md  # já existia
```

### Source Code (repository root)

```text
agents/nami/
├── tools.py                 # _today_date() com ZoneInfo; create_subscription; get_spending_summary
├── tools_accounts.py        # alinhado a _today_date()
├── tools_budgets.py         # idem
├── tools_credit_cards.py    # idem
└── schema_pg.sql            # colunas account_id/card_id em subscriptions

scripts/
└── migrate_nami_reforma.py  # ALTER TABLE idempotente — já executado em produção

webapp/frontend/src/pages/nami/
├── dateUtils.ts              # helper canônico de datas locais
├── ui.tsx                    # relDay/fmtDay sem off-by-one
├── modals/AddModal.tsx       # toast no catch de getCategories
└── screens/
    ├── Dashboard.tsx         # saudação via /auth/me
    ├── Budgets.tsx           # toast no catch de getCategories
    └── Transactions.tsx      # toast no catch de getCategories
```

**Structure Decision**: segue a estrutura já existente do monorepo (agentes em `agents/<nome>/`,
scripts one-off em `scripts/`, frontend em `webapp/frontend/src/pages/<nome>/`) — nenhuma
estrutura nova foi introduzida, mudança é cirúrgica dentro dos arquivos já mapeados no
`CLAUDE.md` raiz.

## Complexity Tracking

Sem violações — mudança estritamente dentro do padrão já estabelecido pelo projeto (mesmo padrão
de `account_id`/`card_id` mutuamente exclusivos já usado em `transactions`; mesmo padrão de
migração idempotente já usado em outras specs).

## Verificação executada nesta passada (2026-07-28)

- [x] FR-001 (timezone SP em toda derivação de "hoje"): confirmado em `agents/nami/tools.py`
      (`_today_date()` com `ZoneInfo("America/Sao_Paulo")`) e `agents/nami/tools_installments.py`
      (`(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`).
- [x] FR-002 (GROUP BY fechado): confirmado em `get_spending_summary` — dict `group_cols`.
- [x] FR-003/FR-004 (validação de data + resolução dinâmica de pagador): confirmado em
      `create_subscription` — `date.fromisoformat()` + `_resolve_account()`/`_resolve_credit_card()`.
- [x] FR-005 (migração idempotente): `scripts/migrate_nami_reforma.py` — **confirmado já
      executado em produção** (colunas `account_id`/`card_id` presentes na tabela `subscriptions`
      do VPS, verificado via `docker exec makima-web` nesta passada).
- [x] FR-006/FR-007 (dateUtils.ts, datas relativas sem off-by-one): confirmado em
      `webapp/frontend/src/pages/nami/dateUtils.ts` e `ui.tsx`.
- [x] FR-008 (saudação via sessão): confirmado em `Dashboard.tsx` (`/auth/me`).
- [x] FR-009 (toasts nos catches de categorias): confirmado em `Budgets.tsx`, `Transactions.tsx`,
      `AddModal.tsx`.
- [x] `docs/referencia/POSTGRES.md` atualizado com as colunas `account_id`/`card_id` de
      `subscriptions` (pendência do checklist de documentação do CLAUDE.md raiz).
- [x] `spec.md` — linha de Status atualizada de "pendente: rodar migração" para concluído.
