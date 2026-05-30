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
