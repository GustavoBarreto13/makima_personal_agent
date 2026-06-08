-- agents/frieren/schema_pg.sql
-- Schema das tabelas de livros da Frieren no PostgreSQL.

-- Catálogo de livros com status de leitura
CREATE TABLE IF NOT EXISTS books (
    id              TEXT PRIMARY KEY,
    google_books_id TEXT,
    title           TEXT        NOT NULL,
    author          TEXT,
    total_pages     INTEGER,
    isbn            TEXT,
    cover_url       TEXT,
    description     TEXT,
    genre           TEXT,
    language        TEXT,
    published_year  INTEGER,
    status          TEXT        DEFAULT 'quero_ler',
    -- status: 'lendo' | 'lido' | 'quero_ler' | 'estante' | 'wishlist' | 'pausado' | 'abandonado'
    date_started    DATE,
    date_finished   DATE,
    rating          NUMERIC,
    notes           TEXT,
    store_url       TEXT,           -- URL do anúncio na loja (Amazon, Estante Virtual, etc.)
    price           NUMERIC,        -- Preço visto na loja (principalmente para wishlist)
    source          TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted         BOOLEAN     DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_books_status     ON books(status);
CREATE INDEX IF NOT EXISTS idx_books_deleted    ON books(deleted);
CREATE INDEX IF NOT EXISTS idx_books_created_at ON books(created_at);

-- Sessões de leitura (imutáveis — nunca atualizadas, só inseridas)
CREATE TABLE IF NOT EXISTS reading_logs (
    id            TEXT PRIMARY KEY,
    book_id       TEXT        REFERENCES books(id),
    book_title    TEXT,
    date          DATE        NOT NULL,
    page_start    INTEGER,
    page_end      INTEGER,
    pages_read    INTEGER,
    session_notes TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reading_logs_date    ON reading_logs(date);
CREATE INDEX IF NOT EXISTS idx_reading_logs_book_id ON reading_logs(book_id);

-- ── Estantes de livros ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shelves (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    accent      TEXT NOT NULL DEFAULT 'oklch(0.58 0.085 195)',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Relacionamento N:N livro ↔ estante ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS book_shelves (
    book_id    UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    shelf_id   UUID NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
    PRIMARY KEY (book_id, shelf_id)
);

CREATE INDEX IF NOT EXISTS idx_book_shelves_shelf ON book_shelves(shelf_id);
