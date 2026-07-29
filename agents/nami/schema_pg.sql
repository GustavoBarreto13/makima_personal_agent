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
    transfer_id  TEXT,        -- Colunas adicionadas na spec 043 (Transferências) — vincula
                               -- o par débito/crédito de uma transferência entre contas.
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
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    deleted      BOOLEAN     DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Colunas adicionadas na reforma da Nami (spec 040) — idempotentes para bancos existentes.
-- account_id/card_id seguem a regra de transactions: mutuamente exclusivos
-- (assinatura debitada em conta OU cobrada no cartão, nunca os dois).
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS card_id    TEXT;

-- Colunas adicionadas na spec 044 (Contas Fixas) — idempotentes. Reaproveita a mesma
-- estrutura de recorrência para "conta fixa" (luz, água, aluguel): kind distingue o
-- comportamento (conta fixa exige confirmação de valor ao pagar), auto_lancar indica se
-- o job agendado (spec 048, futuro) pode lançar sem confirmação. Defaults preservam o
-- comportamento das assinaturas existentes (kind='assinatura', auto_lancar=TRUE).
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS kind        TEXT    DEFAULT 'assinatura';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS auto_lancar BOOLEAN DEFAULT TRUE;

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

-- Colunas adicionadas na spec 041 (Parcelamentos) — idempotentes para bancos existentes.
-- Mesma regra de transactions/subscriptions: account_id e card_id são mutuamente exclusivos.
ALTER TABLE installment_groups ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE installment_groups ADD COLUMN IF NOT EXISTS card_id    TEXT;

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
    updated_at           TIMESTAMPTZ DEFAULT NOW(),
    deleted              BOOLEAN     DEFAULT FALSE
);

-- Tabela de listas de compras (spec 045) — múltiplas listas nomeadas, ativa/arquivada.
-- transaction_id é gravado quando a lista é finalizada (vínculo com a despesa criada).
CREATE TABLE IF NOT EXISTS shopping_lists (
    id             TEXT PRIMARY KEY,
    name           TEXT        NOT NULL,
    status         TEXT        DEFAULT 'ativa',   -- 'ativa' | 'arquivada'
    transaction_id TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_status ON shopping_lists(status);

-- Itens de uma lista de compras (spec 045). quantidade/unidade são texto livre
-- (o que não parsear da frase do usuário vira parte do próprio nome — ver
-- _parse_item_text em agents/nami/tools_shopping.py). ordem é a posição de inserção.
CREATE TABLE IF NOT EXISTS shopping_list_items (
    id              TEXT PRIMARY KEY,
    list_id         TEXT        NOT NULL,
    name            TEXT        NOT NULL,
    quantidade      TEXT,
    unidade         TEXT,
    preco_estimado  NUMERIC,
    checked         BOOLEAN     DEFAULT FALSE,
    ordem           INTEGER     DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list_id ON shopping_list_items(list_id);

-- Colunas adicionadas na spec 046 (Unificação de dívidas) — idempotentes.
-- account_id formaliza um drift encontrado na pesquisa: register_loan() já gravava essa
-- coluna sem ela existir aqui (mesmo padrão de drift já visto em installment_groups antes
-- da spec 041). financing_source_id é a chave de idempotência da migração
-- financings→loans (scripts/migrate_financings_to_loans.py) — permite reprocessar sem
-- duplicar.
ALTER TABLE loans ADD COLUMN IF NOT EXISTS account_id           TEXT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS financing_source_id  TEXT;

-- Coluna adicionada na spec 048 (Jobs financeiros agendados) — idempotente.
-- Trava de "já avisei hoje" para o job process_recurring_charges: guarda a última data
-- (fuso São Paulo) em que um aviso D-3 ou D0 foi enviado para esta recorrência. Como os
-- dois avisos caem em dias de calendário diferentes, essa única coluna evita duplicar
-- notificações em reexecuções do job no mesmo dia (FR-002).
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_notice_date DATE;

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
