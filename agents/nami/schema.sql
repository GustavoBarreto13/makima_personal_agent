-- Run in BigQuery console after creating dataset:
--   bq mk --dataset <GCP_PROJECT_ID>:nami_finance_agent

CREATE TABLE IF NOT EXISTS `nami_finance_agent.transactions` (
  id              STRING    NOT NULL,
  name            STRING    NOT NULL,
  valor           FLOAT64   NOT NULL,
  tipo            STRING    NOT NULL,
  categoria       STRING    NOT NULL,
  conta           STRING    NOT NULL,
  data            DATE      NOT NULL,
  source          STRING    NOT NULL,
  notes           STRING,
  subscription_id STRING,
  created_at      TIMESTAMP NOT NULL,
  updated_at      TIMESTAMP,
  deleted         BOOL      NOT NULL DEFAULT FALSE
)
PARTITION BY data
CLUSTER BY categoria, conta;

CREATE TABLE IF NOT EXISTS `nami_finance_agent.subscriptions` (
  id           STRING    NOT NULL,
  name         STRING    NOT NULL,
  valor        FLOAT64   NOT NULL,
  ciclo        STRING    NOT NULL,
  next_billing DATE      NOT NULL,
  conta        STRING    NOT NULL,
  categoria    STRING    NOT NULL,
  status       STRING    NOT NULL,
  notes        STRING,
  created_at   TIMESTAMP NOT NULL,
  updated_at   TIMESTAMP
)
CLUSTER BY status;

-- ─────────────────────────────────────────────────────────────────────────────
-- Feature 1: Controle de Parcelas
-- ─────────────────────────────────────────────────────────────────────────────

-- Adicionar coluna na tabela existente (rodar no Console BigQuery):
-- ALTER TABLE `<GCP_PROJECT_ID>.nami_finance_agent.transactions`
--   ADD COLUMN IF NOT EXISTS installment_group_id STRING;

CREATE TABLE IF NOT EXISTS `nami_finance_agent.installment_groups` (
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Feature 2: Tracker de Cartões de Crédito
-- ─────────────────────────────────────────────────────────────────────────────
-- Saldo do cartão é derivado de `transactions` (Despesas - Receitas da conta
-- no ciclo de faturamento). A tabela `credit_cards` guarda apenas metadados.
-- card_debt_entries foi removida — transactions é a única fonte da verdade.

CREATE TABLE IF NOT EXISTS `nami_finance_agent.credit_cards` (
  id                  STRING    NOT NULL,
  name                STRING    NOT NULL,
  conta_key           STRING    NOT NULL,  -- chave da conta em transactions
  limite              FLOAT64   NOT NULL,
  taxa_juros_mensal   FLOAT64   NOT NULL,
  closing_day         INT64     NOT NULL,
  due_day             INT64     NOT NULL,
  status              STRING    NOT NULL,
  notes               STRING,
  created_at          TIMESTAMP NOT NULL,
  updated_at          TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Feature 3: Tracker de Empréstimos e Financiamentos
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `nami_finance_agent.loans` (
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Feature 4: Orçamento por Categoria
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `nami_finance_agent.budgets` (
  id         STRING    NOT NULL,
  month      STRING    NOT NULL,   -- "YYYY-MM"
  categoria  STRING    NOT NULL,
  limite     FLOAT64   NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP
  -- Constraint lógica: um limite por categoria por mês (enforced via UPSERT na tool set_budget)
);
