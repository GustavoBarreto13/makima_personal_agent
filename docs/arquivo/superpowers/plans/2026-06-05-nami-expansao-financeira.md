# Nami Expansão Financeira — Plano de Implementação

> **Status:** Implementação de código CONCLUÍDA em 2026-06-05.
> Falta apenas executar os DDLs no BigQuery Console (passo manual) e implantar no VPS.

**Goal:** Expandir o agente Nami com controle de parcelas, tracker de cartões/empréstimos, orçamento por categoria e score de saúde financeira (Features 1–5 do spec `2026-06-05-nami-expansao-financeira-design.md`). Feature 6 (RAG) está como stub pois depende do setup do Kurisu (Fase 3 pendente).

**Architecture:** Cinco novos módulos Python (`tools_installments.py`, `tools_credit_cards.py`, `tools_loans.py`, `tools_budgets.py`, `tools_health.py`) na pasta `agents/nami/`, cada um importando os helpers privados de `tools.py`. O `agent.py` registra 29 tools no total. Cinco novas tabelas BigQuery + coluna `installment_group_id` em `transactions`.

---

## Estado atual

| Task | Status | Commit |
|---|---|---|
| Schema BigQuery — DDL das 5 novas tabelas | ✅ Código commitado | `9275284` |
| Feature 1 — Controle de Parcelas | ✅ 6 testes passando | `46451c2` |
| Feature 2 — Tracker de Cartões de Crédito | ✅ 6 testes passando | `a78545b` |
| Feature 3 — Tracker de Empréstimos (PRICE/SAC) | ✅ 8 testes passando | `26b0c68` |
| Feature 4 — Orçamento por Categoria | ✅ 4 testes passando | `9f5df49` |
| Feature 5 — Score de Saúde Financeira | ✅ 3 testes passando | `bd9cea2` |
| agent.py — 29 tools registradas | ✅ Verificado | `670f26e` |
| Feature 6 — Stub RAG | ✅ Commitado | `05e7762` |
| **DDLs no BigQuery Console** | ⚠️ **PENDENTE — passo manual** | — |
| **Deploy no VPS** | ⚠️ **PENDENTE** | — |

Suite de testes: **37/37 passando** (`pytest tests/agents/nami/ -v`)

---

## ⚠️ Próximos passos — execução manual no BigQuery

### Passo 1: Adicionar coluna `installment_group_id` na tabela existente

Executar no Console BigQuery (ou via `bq` CLI):

```sql
ALTER TABLE `<GCP_PROJECT_ID>.nami_finance_agent.transactions`
ADD COLUMN IF NOT EXISTS installment_group_id STRING;
```

> Substituir `<GCP_PROJECT_ID>` pelo ID real do projeto GCP.

### Passo 2: Criar as 5 novas tabelas

O DDL completo está em `agents/nami/schema.sql`. Executar cada bloco abaixo no Console BigQuery:

```sql
CREATE TABLE IF NOT EXISTS `<GCP_PROJECT_ID>.nami_finance_agent.installment_groups` (
  id            STRING    NOT NULL,
  name          STRING    NOT NULL,
  total_valor   FLOAT64   NOT NULL,
  num_parcelas  INT64     NOT NULL,
  valor_parcela FLOAT64   NOT NULL,
  conta         STRING    NOT NULL,
  categoria     STRING    NOT NULL,
  first_due     DATE      NOT NULL,
  notes         STRING,
  created_at    TIMESTAMP NOT NULL,
  deleted       BOOL      DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS `<GCP_PROJECT_ID>.nami_finance_agent.credit_cards` (
  id                STRING    NOT NULL,
  name              STRING    NOT NULL,
  conta_key         STRING    NOT NULL,
  limite            FLOAT64   NOT NULL,
  taxa_juros_mensal FLOAT64   NOT NULL,
  closing_day       INT64     NOT NULL,
  due_day           INT64     NOT NULL,
  status            STRING    NOT NULL,
  notes             STRING,
  created_at        TIMESTAMP NOT NULL,
  updated_at        TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `<GCP_PROJECT_ID>.nami_finance_agent.card_debt_entries` (
  id         STRING    NOT NULL,
  card_id    STRING    NOT NULL,
  entry_date DATE      NOT NULL,
  tipo       STRING    NOT NULL,
  valor      FLOAT64   NOT NULL,
  notes      STRING,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `<GCP_PROJECT_ID>.nami_finance_agent.loans` (
  id                  STRING    NOT NULL,
  name                STRING    NOT NULL,
  tipo                STRING    NOT NULL,
  sistema_amortizacao STRING    NOT NULL,
  valor_original      FLOAT64   NOT NULL,
  taxa_juros_mensal   FLOAT64   NOT NULL,
  num_parcelas_total  INT64     NOT NULL,
  parcelas_pagas      INT64     NOT NULL,
  valor_parcela       FLOAT64   NOT NULL,
  primeiro_vencimento DATE      NOT NULL,
  conta               STRING    NOT NULL,
  desconto_folha      BOOL      DEFAULT FALSE,
  status              STRING    NOT NULL,
  notes               STRING,
  created_at          TIMESTAMP NOT NULL,
  updated_at          TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `<GCP_PROJECT_ID>.nami_finance_agent.budgets` (
  id         STRING    NOT NULL,
  month      STRING    NOT NULL,
  categoria  STRING    NOT NULL,
  limite     FLOAT64   NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP
);
```

### Passo 3: Verificar as tabelas no BigQuery

Confirmar que as 5 tabelas aparecem no dataset `nami_finance_agent`:
- `installment_groups`
- `credit_cards`
- `card_debt_entries`
- `loans`
- `budgets`

E que a tabela `transactions` tem a coluna `installment_group_id`.

### Passo 4: Deploy no VPS

```bash
# No VPS, dentro do diretório do projeto:
git pull
# Reiniciar o bot (ajustar conforme o método de deploy usado)
```

---

## Arquivos criados/modificados nesta sessão

| Arquivo | Descrição |
|---|---|
| `agents/nami/schema.sql` | DDL das 5 novas tabelas |
| `agents/nami/tools_installments.py` | Feature 1: 4 tools de parcelas |
| `agents/nami/tools_credit_cards.py` | Feature 2: 5 tools de cartões |
| `agents/nami/tools_loans.py` | Feature 3: 7 tools de empréstimos + helpers PRICE/SAC |
| `agents/nami/tools_budgets.py` | Feature 4: 3 tools de orçamento |
| `agents/nami/tools_health.py` | Feature 5: score de saúde financeira |
| `agents/nami/tools_rag.py` | Feature 6: stub RAG (pendente Kurisu) |
| `agents/nami/agent.py` | 29 tools registradas no nami_agent |
| `tests/agents/nami/test_installments.py` | 6 testes Feature 1 |
| `tests/agents/nami/test_credit_cards.py` | 6 testes Feature 2 |
| `tests/agents/nami/test_loans.py` | 8 testes Feature 3 |
| `tests/agents/nami/test_budgets.py` | 4 testes Feature 4 |
| `tests/agents/nami/test_health.py` | 3 testes Feature 5 |
| `conftest.py` | Mock global do google.cloud.bigquery para os testes |
