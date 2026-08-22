-- =============================================================
-- Schema: Yato — agente de Viagens (fatia 066)
-- Aplicar via: python -m scripts.setup_schemas
-- 8 tabelas: trips / trip_items / mobility_dossiers / mobility_checks /
--            trip_mobility_snapshots / mobility_apps / trip_checklist_items /
--            trip_budget_items
-- Convenções (plan.md D1-D4): IDs TEXT (str(uuid.uuid4()) em Python), enums
-- como TEXT com comentário (sem CHECK/enum nativo), updated_at setado à mão,
-- IF NOT EXISTS em tudo (schema novo, sem migração de dados).
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- Tabela: trips
-- A viagem — raiz de tudo o mais. Uma cidade por viagem (clarify).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trips (
    id              TEXT PRIMARY KEY,

    -- Título livre; se vazio, a UI monta "Cidade/UF".
    title           TEXT,

    city            TEXT NOT NULL,
    state_uf        TEXT NOT NULL,  -- 2 letras maiúsculas

    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,  -- >= start_date, intervalo <= 60 dias (validado em tools.py)

    -- valores: economia | equilibrado | conforto
    profile         TEXT NOT NULL DEFAULT 'equilibrado',

    -- valores: planejando | confirmada | em_curso | concluida | cancelada
    status          TEXT NOT NULL DEFAULT 'planejando',

    notes           TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    deleted         BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_trips_deleted ON trips (deleted);
CREATE INDEX IF NOT EXISTS idx_trips_status  ON trips (status);
CREATE INDEX IF NOT EXISTS idx_trips_dates   ON trips (start_date, end_date);


-- ─────────────────────────────────────────────────────────────
-- Tabela: trip_items
-- Roteiro dia a dia — uma linha por atividade.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trip_items (
    id              TEXT PRIMARY KEY,
    trip_id         TEXT NOT NULL REFERENCES trips(id),

    day_date        DATE NOT NULL,  -- deve estar em [trips.start_date, trips.end_date] (FR-004)

    -- valores: manha | tarde | noite
    period          TEXT NOT NULL,

    start_time      TIME,  -- opcional — período basta (Edge Cases)

    title           TEXT NOT NULL,
    address         TEXT,  -- texto livre, sem geocodificação nesta fatia

    -- valores: a_pe | transporte_publico | app_corrida | taxi | mototaxi | transfer | outro
    transport_mode  TEXT,

    cost_estimate   NUMERIC(10,2),
    notes           TEXT,
    position        INTEGER NOT NULL DEFAULT 0,  -- ordem dentro do par (day_date, period)

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_items_trip ON trip_items (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_items_day  ON trip_items (trip_id, day_date);


-- ─────────────────────────────────────────────────────────────
-- Tabela: mobility_dossiers
-- O dossiê de mobilidade — global por cidade, reaproveitado entre viagens.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mobility_dossiers (
    id                  TEXT PRIMARY KEY,

    city                TEXT NOT NULL,
    state_uf            TEXT NOT NULL,

    -- valores: capital | media | pequena
    city_size           TEXT,

    -- cidade de escala pedonal (ex.: Jericoacoara) — fecha o dossiê sem
    -- mobilidade motorizada aplicável.
    pedestrian_scale    BOOLEAN NOT NULL DEFAULT FALSE,

    summary             TEXT,
    last_checked_at     TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (city, state_uf)
);

CREATE INDEX IF NOT EXISTS idx_mobility_dossiers_last_checked ON mobility_dossiers (last_checked_at);


-- ─────────────────────────────────────────────────────────────
-- Tabela: mobility_checks
-- Um passo do protocolo de 7 passos — a honestidade epistêmica do agente.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mobility_checks (
    id              TEXT PRIMARY KEY,
    dossier_id      TEXT NOT NULL REFERENCES mobility_dossiers(id),

    -- valores: porte_cidade | uber | 99 | indrive | transporte_publico |
    --          hospedagem_transfer | deslocamentos
    check_key       TEXT NOT NULL,

    -- valores: confirmado | ausente | inconclusivo | pendente
    verdict         TEXT NOT NULL DEFAULT 'pendente',

    -- valores: simulacao_in_app | pagina_oficial | google_maps | moovit |
    --          contato_hospedagem | relato_local | outro
    source          TEXT,

    evidence        TEXT,
    checked_at      TIMESTAMPTZ,

    UNIQUE (dossier_id, check_key)
);

CREATE INDEX IF NOT EXISTS idx_mobility_checks_dossier ON mobility_checks (dossier_id);


-- ─────────────────────────────────────────────────────────────
-- Tabela: trip_mobility_snapshots
-- Cópia congelada dos 7 checks no momento em que a viagem foi confirmada.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trip_mobility_snapshots (
    id              TEXT PRIMARY KEY,
    trip_id         TEXT NOT NULL REFERENCES trips(id),
    dossier_id      TEXT NOT NULL REFERENCES mobility_dossiers(id),

    snapshot_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- array dos 7 checks congelados: [{check_key, verdict, source, evidence, checked_at}, ...]
    checks_payload  JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trip_mobility_snapshots_trip ON trip_mobility_snapshots (trip_id);


-- ─────────────────────────────────────────────────────────────
-- Tabela: mobility_apps
-- Base de conhecimento regional — cobertura DECLARADA, nunca veredito.
-- Semeada por scripts/seed_mobility_apps.py a partir do research.md.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mobility_apps (
    id                  TEXT PRIMARY KEY,

    name                TEXT NOT NULL,

    -- valores: app_corrida | transporte_publico | taxi
    kind                TEXT NOT NULL,

    -- valores: nacional | regiao | uf | cidades
    coverage_scope      TEXT NOT NULL,

    -- siglas de região/UF ou nomes de cidade, conforme coverage_scope
    coverage_values     TEXT[],

    url                 TEXT,
    notes               TEXT,
    source_updated_at   DATE
);

CREATE INDEX IF NOT EXISTS idx_mobility_apps_kind ON mobility_apps (kind);


-- ─────────────────────────────────────────────────────────────
-- Tabela: trip_checklist_items
-- Checklist pré-embarque, semeado do dossiê ou manual.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trip_checklist_items (
    id              TEXT PRIMARY KEY,
    trip_id         TEXT NOT NULL REFERENCES trips(id),

    label           TEXT NOT NULL,
    category        TEXT,  -- agrupamento livre na UI (ex.: "app", "documento", "contato")
    done            BOOLEAN NOT NULL DEFAULT FALSE,
    position        INTEGER NOT NULL DEFAULT 0,

    -- valores: dossie | manual
    origin          TEXT NOT NULL DEFAULT 'manual',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_checklist_items_trip ON trip_checklist_items (trip_id);


-- ─────────────────────────────────────────────────────────────
-- Tabela: trip_budget_items
-- Estimado × realizado por categoria — lançamento atômico cross-agent (Nami).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trip_budget_items (
    id                  TEXT PRIMARY KEY,
    trip_id             TEXT NOT NULL REFERENCES trips(id),

    -- valores: transporte_ida | transporte_volta | hospedagem | alimentacao |
    --          mobilidade_local | passeios | outros
    category            TEXT NOT NULL,

    estimated           NUMERIC(10,2) NOT NULL DEFAULT 0,
    actual              NUMERIC(10,2) NOT NULL DEFAULT 0,

    -- IDs das transações correspondentes na Nami — um por gasto lançado
    nami_transaction_ids TEXT[],

    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (trip_id, category)
);

CREATE INDEX IF NOT EXISTS idx_trip_budget_items_trip ON trip_budget_items (trip_id);
