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
-- Spec 073 (Design System): coração "Curti" e data em que o livro foi abandonado.
-- ADD COLUMN IF NOT EXISTS deixa o arquivo idempotente em bancos que já tinham a tabela.
ALTER TABLE books ADD COLUMN IF NOT EXISTS liked          BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE books ADD COLUMN IF NOT EXISTS date_abandoned DATE;   -- preenchida ao ir para 'abandonado'
-- Formato do livro e unidade em que o progresso é contado (mangá/audiobook não usam páginas).
-- ATENÇÃO: `total_pages` guarda o total NA UNIDADE do livro (páginas, capítulos ou volumes) e, em
-- `reading_logs`, `page_end` é a posição e `pages_read` o avanço nessa mesma unidade. Os nomes
-- antigos foram mantidos de propósito para não quebrar hub, calendário e estatísticas.
ALTER TABLE books ADD COLUMN IF NOT EXISTS format        TEXT NOT NULL DEFAULT 'fisico';
ALTER TABLE books ADD COLUMN IF NOT EXISTS progress_unit TEXT NOT NULL DEFAULT 'pages';
DO $$
BEGIN
    -- CHECK idempotente: só cria se ainda não existir (ADD CONSTRAINT não tem IF NOT EXISTS).
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'books_format_check') THEN
        ALTER TABLE books ADD CONSTRAINT books_format_check
            CHECK (format IN ('fisico', 'ebook', 'audiobook', 'quadrinho'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'books_progress_unit_check') THEN
        ALTER TABLE books ADD CONSTRAINT books_progress_unit_check
            CHECK (progress_unit IN ('pages', 'chapters', 'volumes'));
    END IF;
END $$;
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
    book_id    TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    shelf_id   UUID NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
    PRIMARY KEY (book_id, shelf_id)
);

CREATE INDEX IF NOT EXISTS idx_book_shelves_shelf ON book_shelves(shelf_id);

-- ── Marcações coloridas por livro ───────────────────────────────────────────
-- Anotações/trechos que o leitor salva na página do livro. Cada marcação recebe
-- uma das 5 cores e, opcionalmente, o número da página de referência.
CREATE TABLE IF NOT EXISTS book_bullets (
    id           TEXT PRIMARY KEY,                    -- UUID gerado na tool
    book_id      TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    content      TEXT NOT NULL,
    color        TEXT NOT NULL CHECK (color IN ('rosa','amarelo','verde','azul','laranja')),
    page_number  INTEGER,                             -- referência opcional (nº da página)
    position     INTEGER NOT NULL DEFAULT 0,          -- ordenação estável (MAX+1 no insert)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_book_bullets_book ON book_bullets(book_id);

-- ── Vitrine de favoritos (spec 073) ─────────────────────────────────────────
-- Até 4 livros escolhidos à mão para a tela Início, na ordem de `position`.
-- Independe do coração (`books.liked`): curtir é sobre um livro; a vitrine é uma curadoria.
CREATE TABLE IF NOT EXISTS book_favorites (
    book_id  TEXT    PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0
);
