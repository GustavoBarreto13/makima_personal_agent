# Implementation Plan: Nami cross-agent — pessoas, calendário, Hub e lembretes

**Branch**: `master` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/047-nami-cross-agent/spec.md`

## Summary

Das 4 user stories, a **US2 (calendário unificado) já estava implementada** — o Calendar
Hub (fatia 019) já registra `agents/nami/calendar_provider.py` como fonte "nami" e o
`CalendarScreen.tsx` da Kaguya já renderiza itens cross-agent como somente-leitura
(`!isEditable && ev.deepLink`, sem drag). Nenhuma mudança foi necessária ali — só
verificação. As outras 3 user stories exigiram trabalho real:

- **US1 (pessoas em transações)**: `create_transaction` já aceitava `person_ids` (infra
  da spec 014); faltava a porta de entrada — `CreateTransactionBody.person_ids` +
  `PersonPicker.tsx` (busca por prefixo via `komiApi.search`, reuso cross-domain) no
  `AddModal`. `query_expenses` ganhou uma query em lote (não N+1) anexando `people` a
  cada transação; `TxRow.tsx` exibe os chips. O perfil da pessoa (Komi) **já** mostrava
  vínculos financeiros via `get_person_summary` — nenhuma mudança lá.
- **US3 (health score no Hub)**: `_nami()` em `hub.py` trocou o stat2 ("lançamentos /
  semana") pelo score de `get_financial_health_score` — mesma tool da tela da Nami
  (SC-003, paridade exata). Isolado em try/except **próprio** (não o do agente inteiro):
  falha no cálculo do score vira "—" só nesse stat, sem apagar o saldo do mês.
- **US4 ("Lembrar-me")**: novo endpoint `POST /api/tasks/reminders` (Kaguya) chamando
  `create_expense_reminder` (cross-agent já existente) com proteção contra duplicata
  (mesmo título + mesma `due_date` na lista "Finanças", ainda aberta — checagem antes de
  criar). Botão no card "Próximos vencimentos" do Dashboard da Nami.

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript/React (frontend)

**Primary Dependencies**: nenhuma nova — reusa `komiApi`/`kaguyaApi` já existentes
(cross-domain, mesmo padrão de reuso de endpoint já visto no projeto)

**Storage**: nenhuma migração — 100% reuso de tabelas existentes (`person_links`, `tasks`)

**Testing**: `npx tsc -b --force` + `npm run build`; import smoke-test dos 3 routers tocados

**Constraints**: SC-003 exige paridade exata do score Hub↔Nami (mesma função, sem
duplicar lógica); SC-004 exige zero duplicata de lembrete (checagem no banco antes do
insert, não só no frontend).

**Scale/Scope**: 4 user stories (P1, P2, P3, P3) — a mais barata do lote, por ligar
infraestrutura que majoritariamente já existia (specs 014/019).

## Project Structure

```text
agents/nami/tools.py                    # query_expenses: +people por transação (1 query em lote)
webapp/backend/routers/finances.py      # CreateTransactionBody.person_ids
webapp/backend/routers/hub.py           # _nami(): stat2 vira health score (try/except próprio)
webapp/backend/routers/tasks.py         # POST /reminders (dedupe por título+due_date)

webapp/frontend/src/pages/nami/
├── modals/PersonPicker.tsx      # novo — busca (komiApi.search) + chips
├── modals/AddModal.tsx          # +PersonPicker (só criação, não parcelado)
├── components/TxRow.tsx         # +chips de pessoas
├── lib.ts / types.ts            # +people em NormalizedTx/Transaction
└── screens/Dashboard.tsx        # botão "Lembrar-me" no card de vencimentos (kaguyaApi.createReminder)

webapp/frontend/src/pages/kaguya/kaguyaApi.ts   # +createReminder

webapp/docs/API.md, webapp/CLAUDE.md, agents/nami/CLAUDE.md, agents/kaguya/CLAUDE.md, ROADMAP.md
```

## Constitution Check

Sem `.specify/memory/constitution.md`. Gate de fato: SC-004 (zero duplicata) — a
checagem de duplicidade roda no banco (SELECT antes do INSERT), não confia em estado do
frontend (que só desabilita o botão na mesma sessão, sem persistir).

## Decisões de escopo

1. **US2 não exigiu nenhum código novo** — infraestrutura da fatia 019 já cobria
   integralmente os 3 acceptance scenarios (eventos no dia certo, clique navega
   read-only, falha de fonte isolada). Documentado aqui para não relançar trabalho.
2. **PersonPicker só na criação de transação simples** (não em edição, não em compra
   parcelada) — a spec foca em "ao registrar um gasto"; edição de vínculo e parcelamento
   com pessoas ficam fora do escopo desta entrega (podem virar specs futuras se
   necessário).
3. **Hub troca stat2 inteiro, não adiciona 3º stat** — o contrato do Hub é
   estritamente 2 stats por agente (spec 023); "lançamentos/semana" cede lugar ao score,
   que tem mais valor de "visibilidade passiva" conforme a motivação da US3.
4. **Dedupe do lembrete por (título, due_date, lista Finanças, aberta)** — chave simples
   e suficiente para o caso de uso (mesmo vencimento clicado 2×); não tenta achar
   duplicatas semanticamente parecidas com título diferente.
