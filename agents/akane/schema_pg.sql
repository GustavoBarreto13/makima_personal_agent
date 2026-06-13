-- agents/akane/schema_pg.sql
-- Schema das tabelas de filmes da Akane no PostgreSQL.
-- 7 tabelas criadas de uma vez (schema inteiro nasce na Onda 1).
-- Todas as tabelas usam IF NOT EXISTS para ser idempotente ao reaplicar.
-- Espelha o padrão de agents/frieren/schema_pg.sql (books + reading_logs + shelves).

-- ── Catálogo de filmes ────────────────────────────────────────────────────────
-- Uma linha por filme. Chave de dedup primária = letterboxd_uri (para filmes do
-- Letterboxd) ou tmdb_id (para filmes buscados via TMDB).
-- Filmes adicionados manualmente pelo webapp ou Akane não têm letterboxd_uri.
CREATE TABLE IF NOT EXISTS movies (
    id               TEXT        PRIMARY KEY,           -- UUID gerado em Python (str(uuid.uuid4()))
    tmdb_id          INTEGER,                           -- ID do filme no TMDB — dedup secundária
    imdb_id          TEXT,                              -- ID IMDb (ttXXXXXXX), quando o TMDB fornece
    letterboxd_uri   TEXT,                              -- URL do filme no Letterboxd — chave de dedup RSS/CSV
    title            TEXT        NOT NULL,              -- Título de exibição
    normalizado      TEXT        NOT NULL,              -- Título minúsculo sem acentos — fuzzy match
    year             INTEGER,                           -- Ano de lançamento
    director         TEXT[],                            -- Diretor(es) — TMDB credits (job='Director')
    genres           TEXT[],                            -- Gêneros — TMDB
    runtime          INTEGER,                           -- Duração em minutos — TMDB
    overview         TEXT,                              -- Sinopse — TMDB (truncada em 2000 chars)
    poster_url       TEXT,                              -- URL do pôster TMDB (w500); NULL = pôster tipográfico
    backdrop_url     TEXT,                              -- URL do backdrop TMDB (w1280) — hero da página
    poster_palette   TEXT,                              -- Paleta do pôster tipográfico de fallback (hash do título)
    status           TEXT        DEFAULT 'watchlist',   -- 'watchlist' | 'watched'
    rating           NUMERIC(2,1),                      -- Nota atual/favorita (0.5–5.0); validada na camada de lógica
    rating_source    TEXT,                              -- 'letterboxd' | 'own' | NULL (selo "via Letterboxd")
    liked            BOOLEAN     DEFAULT FALSE,         -- Coração (curtir)
    tags             TEXT[],                            -- Etiquetas de nível-filme (nuvem de tags)
    notes            TEXT,                              -- Anotações soltas sobre o filme (≠ review da sessão)
    last_watched_date DATE,                             -- Data da sessão mais recente
    times_watched    INTEGER     DEFAULT 0,             -- Nº de sessões (incrementa em cada log_watch)
    source           TEXT,                              -- 'manual' | 'letterboxd_rss' | 'letterboxd_csv'
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    deleted          BOOLEAN     DEFAULT FALSE          -- Soft delete — nunca apagamos fisicamente
);

-- Dedup do RSS/CSV: um letterboxd_uri só pode existir uma vez.
-- WHERE parcial: filmes adicionados manualmente (sem URI) não são afetados.
CREATE UNIQUE INDEX IF NOT EXISTS idx_movies_letterboxd
    ON movies (letterboxd_uri)
    WHERE letterboxd_uri IS NOT NULL;

-- Lookup por tmdb_id (dedup secundária + busca por ID externo).
CREATE INDEX IF NOT EXISTS idx_movies_tmdb
    ON movies (tmdb_id);

-- Filtro de grid por status (watched/watchlist).
CREATE INDEX IF NOT EXISTS idx_movies_status
    ON movies (status);

-- Filtro padrão das listagens (exclui soft-deleted).
CREATE INDEX IF NOT EXISTS idx_movies_deleted
    ON movies (deleted);

-- Ordenação do grid "recentes" (last_watched_date DESC).
CREATE INDEX IF NOT EXISTS idx_movies_last_watched
    ON movies (last_watched_date);


-- ── Diário de sessões (log de visualizações) ──────────────────────────────────
-- Uma linha por VEZ que um filme foi assistido — suporta rewatch.
-- Espelha reading_logs da Frieren (denormaliza movie_title para evitar JOIN).
CREATE TABLE IF NOT EXISTS diary_entries (
    id             TEXT        PRIMARY KEY,             -- UUID
    movie_id       TEXT        NOT NULL REFERENCES movies(id),  -- FK para o filme
    movie_title    TEXT,                                -- Denormalizado (lista sem JOIN)
    watched_date   DATE        NOT NULL,                -- Quando foi assistido
    rating         NUMERIC(2,1),                        -- Nota daquela sessão (nullable — assistiu sem avaliar)
    rewatch        BOOLEAN     DEFAULT FALSE,           -- TRUE se já havia sessão anterior do mesmo filme
    review         TEXT,                                -- Texto da review (Letterboxd ou manual)
    tags           TEXT[],                              -- Tags da sessão (Letterboxd permite tags por entrada)
    letterboxd_uri TEXT,                                -- URI do filme (para dedup junto com watched_date)
    source         TEXT,                                -- 'manual' | 'letterboxd_rss' | 'letterboxd_csv'
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotência do RSS/CSV: mesma URI + mesma data = mesma sessão.
-- WHERE parcial: sessões manuais (URI NULL) permitem 2 logs do mesmo dia intencionalmente.
CREATE UNIQUE INDEX IF NOT EXISTS idx_diary_dedup
    ON diary_entries (letterboxd_uri, watched_date)
    WHERE letterboxd_uri IS NOT NULL;

-- Histórico de sessões da página do filme.
CREATE INDEX IF NOT EXISTS idx_diary_movie
    ON diary_entries (movie_id);

-- Ordenação cronológica do diário.
CREATE INDEX IF NOT EXISTS idx_diary_watched
    ON diary_entries (watched_date);


-- ── Listas / Coleções ─────────────────────────────────────────────────────────
-- Coleções temáticas estilo Letterboxd ("Melhores de 2024", "Cinema japonês").
-- Espelha shelves da Frieren. Tabela criada agora; UI na Onda US5.
CREATE TABLE IF NOT EXISTS movie_lists (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    accent      TEXT,                                   -- Cor de acento OKLCH para o card da lista
    ranked      BOOLEAN     DEFAULT FALSE,              -- Lista ordenada (ranking), como no Letterboxd
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── Relacionamento N:N filme ↔ lista ──────────────────────────────────────────
-- Espelha book_shelves da Frieren.
CREATE TABLE IF NOT EXISTS movie_list_items (
    movie_id   TEXT        NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    list_id    UUID        NOT NULL REFERENCES movie_lists(id) ON DELETE CASCADE,
    position   INTEGER,                                 -- Ordem na lista (para listas ranked)
    PRIMARY KEY (movie_id, list_id)
);

-- Lookup de filmes numa lista.
CREATE INDEX IF NOT EXISTS idx_list_items_list
    ON movie_list_items (list_id);


-- ── Cofre de conteúdos ────────────────────────────────────────────────────────
-- Conteúdos salvos SOBRE um filme (vídeos-ensaio, artigos, críticas externas).
-- Um filme tem N itens; cada item é um link tipado. Tabela criada agora; UI na Onda US5.
CREATE TABLE IF NOT EXISTS movie_vault_items (
    id         TEXT        PRIMARY KEY,                 -- UUID
    movie_id   TEXT        NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    type       TEXT        NOT NULL,                    -- 'video' | 'article' | 'essay' | 'review'
    title      TEXT        NOT NULL,                    -- Título do conteúdo
    url        TEXT,                                    -- URL (opcional — alguns são só título/anotação)
    source     TEXT,                                    -- Domínio exibido (ex.: youtube.com, mubi.com)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lookup do Cofre por filme.
CREATE INDEX IF NOT EXISTS idx_vault_movie
    ON movie_vault_items (movie_id);


-- ── Pessoas do filme (elenco/equipe — local ao domínio) ──────────────────────
-- Direção + elenco + equipe-chave de cada filme.
-- person_id RESERVADO (NULL nesta fatia) — FK futura para people(id) da fatia 014.
-- Tabela criada agora; UI na Onda US5.
CREATE TABLE IF NOT EXISTS movie_people (
    id             TEXT        PRIMARY KEY,             -- UUID
    movie_id       TEXT        NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    name           TEXT        NOT NULL,                -- Nome da pessoa (ex.: Satoshi Kon)
    normalizado    TEXT        NOT NULL,                -- Minúsculo sem acento — dedup e fuzzy
    role           TEXT,                                -- Papel (Direção, Roteiro, Fotografia, etc.)
    is_person_tag  BOOLEAN     DEFAULT FALSE,           -- TRUE se também é etiqueta de pessoa em movies.tags
    person_id      TEXT                                 -- RESERVADO — FK futura para people(id) da 014
);

-- Pessoas da página do filme.
CREATE INDEX IF NOT EXISTS idx_people_movie
    ON movie_people (movie_id);

-- Agregação "top pessoas" / dedup por nome normalizado.
CREATE INDEX IF NOT EXISTS idx_people_norm
    ON movie_people (normalizado);


-- ── Favoritos (vitrine do perfil) ─────────────────────────────────────────────
-- Os 4 (ou menos) filmes em destaque no perfil/Início.
-- Persistida no SERVIDOR (não localStorage) para paridade de canais (FR-016).
-- set_favorites() substitui o conjunto inteiro em transação (delete-all + insert).
CREATE TABLE IF NOT EXISTS movie_favorites (
    movie_id   TEXT        PRIMARY KEY REFERENCES movies(id) ON DELETE CASCADE,
    position   INTEGER     NOT NULL                    -- Ordem na vitrine (0–3)
);
