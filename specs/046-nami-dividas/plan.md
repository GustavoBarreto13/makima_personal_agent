# Implementation Plan: Unificação de dívidas — financiamentos, empréstimos e simuladores

**Branch**: `master` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/046-nami-dividas/spec.md`

## Summary

Hoje existem **três** sistemas de dívida paralelos: `loans` (PRICE/SAC + 6 simuladores,
só Telegram, `agents/nami/tools_loans.py`), `financings` (financiamento simples, só
webapp, acesso SQL direto em `finances.py`) e `personal_loans` (p2p, só webapp, mesmo
padrão de acesso direto). Decisão aprovada: `financings` migra para `loans` (superset
estrito); `personal_loans` continua separada mas ganha uma camada de tools própria
(`agents/nami/tools_personal_loans.py`) usada pelos dois canais.

- **Migração** (`scripts/migrate_financings_to_loans.py`): idempotente via nova coluna
  `loans.financing_source_id` (chave de dedupe — pula linhas já migradas). Taxa textual
  (`"1,2% a.m."`) parseada por regex; quando não interpretável, grava `taxa_juros_mensal=0`
  e acrescenta `"[REVISAR TAXA]"` nas notas (FR-001, edge case). Sem conta vinculada
  (financings nunca teve `account_id`) — `conta`/`account_id` ficam vazios, nota pede
  revisão do pagador. Migração roda com `INSERT` direto (não via `register_loan`, que
  exigiria conta resolvida) — mantém a regra "nada é descartado".
- **Correção de drift encontrada durante a pesquisa**: `register_loan` já insere
  `account_id` numa coluna que **não existe** em `schema_pg.sql` (só teria funcionado se
  alguém rodou um `ALTER TABLE` manual em produção, fora do controle de versão — mesmo
  padrão de drift já visto e corrigido em `installment_groups` antes da spec 041). Corrigido
  aqui: `account_id` formalizado em `schema_pg.sql` + migração idempotente.
- **`agents/nami/tools_personal_loans.py`** (novo): `list_personal_loans`,
  `create_personal_loan`, `update_personal_loan`, `register_personal_loan_payment`,
  `delete_personal_loan` — mesma tabela `personal_loans`, agora por trás de uma API Python
  única. `finances.py` para de acessar `run_select`/`run_dml` direto (FR-006) e passa a
  chamar essas tools, igual a todo o resto do domínio.
- **Endpoints novos em `/loans`**: `PATCH /loans/{id}`, `POST /loans/{id}/payment`,
  `POST /loans/{id}/simulate/payoff`, `.../simulate/amortization`,
  `.../simulate/accelerated`, `GET /loans/priority` — expõem tools que já existiam só para
  o Telegram (`update_loan`, `register_loan_payment`, os 3 simuladores, `compare_payoff_priority`).
- **Rotas antigas de `/financings` removidas** (FR-007) após a migração — `Financings.tsx`
  passa a consumir `/loans`; a tabela `financings` permanece intacta no banco como backup
  (decisão da spec), só as rotas HTTP saem.
- **Frontend**: `Financings.tsx` reescrita para consumir `GET /loans` (nome, sistema,
  taxa, saldo devedor e parcelas já calculados no backend — SC-002 exige resultado
  idêntico ao Telegram, então **nenhum cálculo é duplicado no frontend**), com card por
  empréstimo + botão "Registrar parcela" + painel de simuladores (quitação antecipada,
  amortização extra, parcela acelerada) + seção "Prioridade de quitação" (avalanche).
  `Loans.tsx` (empréstimos p2p) ganha "Registrar pagamento" para fechar a paridade da US4.

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript/React (frontend)

**Primary Dependencies**: nenhuma nova

**Storage**: PostgreSQL — `loans.account_id` (drift) + `loans.financing_source_id`
(idempotência da migração), ambas via `ALTER TABLE IF NOT EXISTS`

**Testing**: `npx tsc -b --force` + `npm run build`; import smoke-test do router e do
`agent.py`; migração testada com contagem origem×destino (SC-001) antes/depois

**Constraints**: SC-002 exige resultado idêntico entre webapp e Telegram — motor de
cálculo é 100% reaproveitado (`tools_loans.py`), zero duplicação no frontend. FR-006
exige fim do acesso direto a `personal_loans` fora da camada de lógica.

**Scale/Scope**: 4 user stories (P1, P2, P2, P3) — a mais arriscada do lote por mexer em
dado financeiro existente (migração), por isso planejada com o cuidado de nunca apagar
`financings` fisicamente.

## Project Structure

```text
agents/nami/schema_pg.sql                 # loans.account_id (drift), loans.financing_source_id
scripts/migrate_nami_reforma.py           # +2 ALTER TABLE idempotentes
scripts/migrate_financings_to_loans.py    # NOVO — migração idempotente financings→loans

agents/nami/tools_personal_loans.py       # NOVO — list/create/update/pay/delete personal_loans
agents/nami/agent.py                      # +5 tools p2p, seção "EMPRÉSTIMOS PESSOA-A-PESSOA"

webapp/backend/routers/finances.py        # PATCH/POST /loans/{id}/*, GET /loans/priority;
                                           #   /personal-loans passa a chamar tools_personal_loans;
                                           #   /financings (GET/POST/DELETE) REMOVIDOS (FR-007)

webapp/frontend/src/pages/nami/
├── types.ts                     # BankLoan (novo); Financing mantido só para tipos legados se preciso
├── namiApi.ts                   # getLoans/registerLoan/updateLoan/deleteLoan/payLoanInstallment/
│                                 #   simulate*/getPayoffPriority; payPersonalLoanInstallment
├── components/LoanCard.tsx      # +BankLoanCard
├── screens/Financings.tsx       # reescrita — consome /loans, simuladores, prioridade
└── screens/Loans.tsx            # +botão "Registrar pagamento" (p2p)

webapp/docs/API.md, webapp/CLAUDE.md, ROADMAP.md
```

## Constitution Check

Sem `.specify/memory/constitution.md`. Gate de fato: SC-001 (zero perda de dados na
migração) — script idempotente, nunca faz `DELETE`/`UPDATE` destrutivo em `financings`;
gate de reversibilidade: se a migração produzir dado errado, basta corrigir a linha em
`loans` ou re-rodar após ajuste (chave `financing_source_id` permite reprocessar 1 linha
apagando e reinserindo, sem tocar na origem).

## Decisões de escopo

1. **Migração via SQL direto, não via `register_loan`** — `register_loan` exige uma conta
   resolvida (`_resolve_account`), e financiamentos legados nunca tiveram essa informação;
   forçar uma conta arbitrária mascararia dados incorretos. `conta`/`account_id` ficam
   vazios e a nota pede revisão — dado ausente é mais honesto que dado inventado.
2. **`sistema_amortizacao` migrado como `"PRICE"`** — financiamentos legados só guardavam
   parcela = `total_amount / installments` (parcela fixa), que é exatamente o que PRICE
   assume quando a taxa é 0. Não há informação suficiente para inferir SAC.
3. **`taxa_juros_mensal` parseada por regex best-effort** (`_parse_interest_rate`) —
   captura o primeiro número antes de `%` (aceita `,` ou `.` como decimal); qualquer coisa
   fora desse formato grava taxa 0 + nota de revisão, nunca falha a migração inteira.
4. **`financing_source_id` como chave de idempotência** — permite rodar o script quantas
   vezes for preciso; linhas já migradas (mesmo `financing_source_id`) são puladas.
5. **`financings` nunca é apagada nem tem suas linhas alteradas** pela migração — é
   puramente aditiva sobre `loans`. A tabela físical só seria removida numa decisão
   posterior (fora do escopo, conforme a spec).
6. **Rotas antigas de `/financings` removidas, não só descontinuadas** — FR-007 é
   explícito ("MUST ser desativadas"); como o único consumidor era o próprio
   `Financings.tsx` (agora migrado para `/loans`), a remoção é segura.
7. **`personal_loans` sem tabela/rota nova** — só ganha uma camada de tools Python por
   trás dos endpoints já existentes (FR-006), mantendo os contratos HTTP atuais para não
   quebrar `Loans.tsx`.
