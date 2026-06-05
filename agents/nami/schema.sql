-- Run in BigQuery console after creating dataset:
--   bq mk --dataset <GCP_PROJECT_ID>:nami_finance_agent

CREATE OR REPLACE TABLE `nami_finance_agent.transactions` (
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
  deleted         BOOL      NOT NULL
)
PARTITION BY data
CLUSTER BY categoria, conta;

CREATE OR REPLACE TABLE `nami_finance_agent.subscriptions` (
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

CREATE OR REPLACE TABLE `nami_finance_agent.installment_groups` (
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
-- Accounts — entidade mestra de contas (substitui lista ACCOUNTS hardcoded)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE TABLE `nami_finance_agent.accounts` (
  id              STRING    NOT NULL,   -- UUID gerado em Python
  name            STRING    NOT NULL,   -- "Cartao Nu", "NuConta", "Itau"
  institution     STRING,               -- "Nubank", "Itaú", "Mercado Pago"
  type            STRING    NOT NULL,   -- "corrente" | "poupanca" | "cartao_credito" | "dinheiro" | "investimento"
  balance_inicial FLOAT64   DEFAULT 0.0,
  data_inicio     DATE      NOT NULL,
  status          STRING    DEFAULT "ativo",  -- "ativo" | "encerrado"
  notes           STRING,
  created_at      TIMESTAMP NOT NULL,
  updated_at      TIMESTAMP
);

-- Adicionar account_id FK a todas as tabelas existentes (rodar no BQ Console):
-- ALTER TABLE `<GCP_PROJECT_ID>.nami_finance_agent.transactions`       ADD COLUMN account_id STRING;
-- ALTER TABLE `<GCP_PROJECT_ID>.nami_finance_agent.subscriptions`      ADD COLUMN account_id STRING;
-- ALTER TABLE `<GCP_PROJECT_ID>.nami_finance_agent.installment_groups` ADD COLUMN account_id STRING;
-- ALTER TABLE `<GCP_PROJECT_ID>.nami_finance_agent.credit_cards`       ADD COLUMN account_id STRING;
-- ALTER TABLE `<GCP_PROJECT_ID>.nami_finance_agent.loans`              ADD COLUMN account_id STRING;

-- card_id: quando a transação pertence a um cartão de crédito (e não a uma conta bancária),
-- este campo contém o ID do cartão (credit_cards.id) e account_id fica NULL.
-- account_id e card_id são mutuamente exclusivos — nunca os dois populados na mesma linha.
-- ALTER TABLE `<GCP_PROJECT_ID>.nami_finance_agent.transactions` ADD COLUMN card_id STRING;

-- Backfill: criar contas iniciais e popular account_id (rodar após CREATE accounts):
-- INSERT INTO `<GCP_PROJECT_ID>.nami_finance_agent.accounts`
--   (id, name, institution, type, balance_inicial, data_inicio, status, created_at)
-- VALUES
--   (GENERATE_UUID(), 'Cartao Nu',    'Nubank',       'cartao_credito', 0, CURRENT_DATE(), 'ativo', CURRENT_TIMESTAMP()),
--   (GENERATE_UUID(), 'Cartao Itau',  'Itaú',         'cartao_credito', 0, CURRENT_DATE(), 'ativo', CURRENT_TIMESTAMP()),
--   (GENERATE_UUID(), 'Itau',         'Itaú',         'corrente',       0, CURRENT_DATE(), 'ativo', CURRENT_TIMESTAMP()),
--   (GENERATE_UUID(), 'Mercado Pago', 'Mercado Pago', 'corrente',       0, CURRENT_DATE(), 'ativo', CURRENT_TIMESTAMP()),
--   (GENERATE_UUID(), 'Generico',     NULL,           'corrente',       0, CURRENT_DATE(), 'ativo', CURRENT_TIMESTAMP()),
--   (GENERATE_UUID(), 'Dinheiro',     NULL,           'dinheiro',       0, CURRENT_DATE(), 'ativo', CURRENT_TIMESTAMP());
--
-- UPDATE `<GCP_PROJECT_ID>.nami_finance_agent.transactions`
--   SET account_id = (SELECT id FROM `<GCP_PROJECT_ID>.nami_finance_agent.accounts` WHERE name = conta LIMIT 1)
--   WHERE TRUE;
-- UPDATE `<GCP_PROJECT_ID>.nami_finance_agent.subscriptions`
--   SET account_id = (SELECT id FROM `<GCP_PROJECT_ID>.nami_finance_agent.accounts` WHERE name = conta LIMIT 1)
--   WHERE TRUE;
-- UPDATE `<GCP_PROJECT_ID>.nami_finance_agent.installment_groups`
--   SET account_id = (SELECT id FROM `<GCP_PROJECT_ID>.nami_finance_agent.accounts` WHERE name = conta LIMIT 1)
--   WHERE TRUE;
-- UPDATE `<GCP_PROJECT_ID>.nami_finance_agent.loans`
--   SET account_id = (SELECT id FROM `<GCP_PROJECT_ID>.nami_finance_agent.accounts` WHERE name = conta LIMIT 1)
--   WHERE TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Feature 2: Tracker de Cartões de Crédito
-- ─────────────────────────────────────────────────────────────────────────────
-- Saldo do cartão é derivado de `transactions` (Despesas - Receitas da conta
-- no ciclo de faturamento). A tabela `credit_cards` guarda apenas metadados.
-- card_debt_entries foi removida — transactions é a única fonte da verdade.

CREATE OR REPLACE TABLE `nami_finance_agent.credit_cards` (
  id                  STRING    NOT NULL,
  name                STRING    NOT NULL,
  account_id          STRING    NOT NULL,  -- FK para accounts.id (conta corrente ou poupança de onde a fatura é paga)
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

CREATE OR REPLACE TABLE `nami_finance_agent.loans` (
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

CREATE OR REPLACE TABLE `nami_finance_agent.budgets` (
  id         STRING    NOT NULL,
  month      STRING    NOT NULL,   -- "YYYY-MM"
  categoria  STRING    NOT NULL,
  limite     FLOAT64   NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP
  -- Constraint lógica: um limite por categoria por mês (enforced via UPSERT na tool set_budget)
);
