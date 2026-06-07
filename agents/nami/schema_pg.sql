-- agents/nami/schema_pg.sql
-- Schema das tabelas financeiras da Nami no PostgreSQL.
-- Substitui o schema BigQuery (agents/nami/schema.sql).
-- Rodar via: python scripts/setup_schemas.py

-- Tabela de transações (gastos, receitas, transferências)
CREATE TABLE IF NOT EXISTS transactions (
    id           TEXT PRIMARY KEY,
    name         TEXT        NOT NULL,
    valor        NUMERIC     NOT NULL,
    tipo         TEXT        NOT NULL,   -- 'receita' | 'despesa' | 'transferencia'
    categoria    TEXT        NOT NULL,
    conta        TEXT        NOT NULL,
    account_id   TEXT,
    card_id      TEXT,
    data         DATE        NOT NULL,
    notes        TEXT,
    subscription_id     TEXT,
    installment_group_id TEXT,
    source       TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    deleted      BOOLEAN     DEFAULT FALSE
);
-- Índices substituem PARTITION BY e CLUSTER BY do BigQuery
CREATE INDEX IF NOT EXISTS idx_transactions_data      ON transactions(data);
CREATE INDEX IF NOT EXISTS idx_transactions_categoria ON transactions(categoria);
CREATE INDEX IF NOT EXISTS idx_transactions_conta     ON transactions(conta);
CREATE INDEX IF NOT EXISTS idx_transactions_deleted   ON transactions(deleted);

-- Tabela de assinaturas recorrentes (Netflix, Spotify, etc.)
CREATE TABLE IF NOT EXISTS subscriptions (
    id           TEXT PRIMARY KEY,
    name         TEXT        NOT NULL,
    valor        NUMERIC     NOT NULL,
    ciclo        TEXT        NOT NULL,   -- 'mensal' | 'anual' | 'trimestral'
    next_billing DATE,
    conta        TEXT,
    categoria    TEXT,
    status       TEXT        DEFAULT 'ativa',
    notes        TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Tabela de grupos de parcelamento (compras divididas em X vezes)
CREATE TABLE IF NOT EXISTS installment_groups (
    id            TEXT PRIMARY KEY,
    name          TEXT        NOT NULL,
    total_valor   NUMERIC     NOT NULL,
    num_parcelas  INTEGER     NOT NULL,
    valor_parcela NUMERIC     NOT NULL,
    conta         TEXT,
    categoria     TEXT,
    first_due     DATE,
    notes         TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    deleted       BOOLEAN     DEFAULT FALSE
);

-- Tabela de contas bancárias (corrente, poupança, dinheiro, investimento)
CREATE TABLE IF NOT EXISTS accounts (
    id              TEXT PRIMARY KEY,
    name            TEXT        NOT NULL,
    institution     TEXT,
    type            TEXT,   -- 'corrente' | 'poupança' | 'dinheiro' | 'investimento'
    balance_inicial NUMERIC     DEFAULT 0,
    data_inicio     DATE,
    status          TEXT        DEFAULT 'ativa',
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de cartões de crédito
CREATE TABLE IF NOT EXISTS credit_cards (
    id                  TEXT PRIMARY KEY,
    name                TEXT        NOT NULL,
    account_id          TEXT        REFERENCES accounts(id),
    limite              NUMERIC,
    taxa_juros_mensal   NUMERIC,
    closing_day         INTEGER,    -- dia de fechamento da fatura
    due_day             INTEGER,    -- dia de vencimento da fatura
    status              TEXT        DEFAULT 'ativo',
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de empréstimos e financiamentos
CREATE TABLE IF NOT EXISTS loans (
    id                   TEXT PRIMARY KEY,
    name                 TEXT        NOT NULL,
    tipo                 TEXT,
    sistema_amortizacao  TEXT,   -- 'PRICE' | 'SAC'
    valor_original       NUMERIC,
    taxa_juros_mensal    NUMERIC,
    num_parcelas_total   INTEGER,
    parcelas_pagas       INTEGER     DEFAULT 0,
    valor_parcela        NUMERIC,
    primeiro_vencimento  DATE,
    conta                TEXT,
    desconto_folha       BOOLEAN     DEFAULT FALSE,
    status               TEXT        DEFAULT 'ativo',
    notes                TEXT,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de orçamento mensal por categoria
CREATE TABLE IF NOT EXISTS budgets (
    id         TEXT PRIMARY KEY,
    month      TEXT    NOT NULL,   -- formato 'YYYY-MM'
    categoria  TEXT    NOT NULL,
    limite     NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(month, categoria)       -- cada categoria tem só um orçamento por mês
);
