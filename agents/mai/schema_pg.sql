-- =============================================================
-- Schema: Mai Sakurajima — Séries de TV (fatia 022)
-- Aplicar via: python -m scripts.setup_schemas
-- 4 tabelas: series / seasons / series_episodes / series_watch_logs
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- Tabela: series
-- Catálogo de séries de TV do usuário.
-- Uma linha por série (dedup por tmdb_id quando disponível).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS series (
    -- Identificador único gerado em Python: str(uuid.uuid4())
    id              TEXT PRIMARY KEY,

    -- ID da série no TMDB — chave de dedup e enriquecimento de metadados.
    -- Nullable para entradas manuais sem busca no TMDB.
    tmdb_id         INTEGER,

    -- IMDb ID (formato tt...) resolvido via TMDB external_ids. Nullable.
    imdb_id         TEXT,

    -- Título de exibição (pt-BR quando disponível, senão original).
    title           TEXT NOT NULL,

    -- Título no idioma de origem (original_name do TMDB). Nullable.
    title_original  TEXT,

    -- Título normalizado: minúsculas + sem acentos. Usado para fuzzy match.
    normalizado     TEXT NOT NULL,

    -- Data do primeiro episódio exibido (first_air_date do TMDB). Nullable.
    first_air_date  DATE,

    -- Data do último episódio exibido (last_air_date do TMDB). NULL se ainda em exibição.
    last_air_date   DATE,

    -- Estado de exibição da série (vem do TMDB status):
    -- 'no_ar' = Returning Series / In Production / Pilot
    -- 'finalizada' = Ended
    -- 'cancelada' = Canceled
    -- 'nao_lancada' = Planned
    series_status   TEXT,

    -- Rede ou plataforma principal (networks[0].name do TMDB). Ex.: "Netflix".
    network         TEXT,

    -- Número total de temporadas (number_of_seasons do TMDB). Atualizado no sync.
    seasons_count   INTEGER,

    -- Número total de episódios da série (number_of_episodes do TMDB). NULL se indefinido.
    episodes_count  INTEGER,

    -- Acumulador de episódios assistidos pelo usuário. Incrementado via log_watch.
    episodes_watched INTEGER NOT NULL DEFAULT 0,

    -- Estado do usuário em relação à série:
    -- 'quero_assistir' (default) | 'assistindo' | 'concluida' | 'pausada' | 'abandonada'
    status          TEXT NOT NULL DEFAULT 'quero_assistir',

    -- Nota do usuário: 0.5–5.0 em passos de 0.5 (escala Letterboxd). NULL = sem nota.
    rating          NUMERIC(2,1),

    -- Origem da nota: 'own' quando dada manualmente. NULL quando sem nota.
    rating_source   TEXT,

    -- URL do pôster da série (TMDB /w500). NULL → pôster tipográfico gerado pela UI.
    poster_url      TEXT,

    -- URL do backdrop/banner da série (TMDB /w1280). NULL → gradiente na UI.
    backdrop_url    TEXT,

    -- Sinopse da série (truncada a 2000 chars). Nullable.
    overview        TEXT,

    -- Gêneros da série como array (ex.: ["Drama", "Science Fiction"]). Nullable.
    genres          TEXT[],

    -- Tags livres do usuário (ex.: ["favorita", "distopia"]). Nullable.
    tags            TEXT[],

    -- Anotações do usuário sobre a série inteira (≠ review por sessão em watch_logs).
    notes           TEXT,

    -- Data da primeira sessão assistida (inferida pelo primeiro log_watch). Nullable.
    date_started    DATE,

    -- Data em que episodes_watched >= episodes_count (inferida). Nullable.
    date_finished   DATE,

    -- Origem do registro: 'manual' | 'tmdb_sync'
    source          TEXT,

    -- Timestamps de criação e atualização (com fuso UTC).
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Soft delete: TRUE significa removido (preserva watch_logs).
    deleted         BOOLEAN NOT NULL DEFAULT FALSE
);

-- Índice único parcial: impede duplicatas por tmdb_id mas permite múltiplos NULLs
-- (cada NULL é tratado como distinto — entradas manuais sem tmdb_id convivem).
CREATE UNIQUE INDEX IF NOT EXISTS idx_series_tmdb    ON series (tmdb_id) WHERE tmdb_id IS NOT NULL;

-- Índices para os filtros mais comuns na listagem (status e soft delete).
CREATE INDEX        IF NOT EXISTS idx_series_status  ON series (status);
CREATE INDEX        IF NOT EXISTS idx_series_deleted ON series (deleted);

-- Índice para fuzzy match na busca por título.
CREATE INDEX        IF NOT EXISTS idx_series_norm    ON series (normalizado);


-- ─────────────────────────────────────────────────────────────
-- Tabela: seasons
-- Cache de metadados de temporadas (camada exclusiva da Mai).
-- Alimentada via GET /tv/{id}/season/{n} no TMDB.
-- Temporadas especiais (season_number=0) são EXCLUÍDAS na camada de aplicação.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seasons (
    id              TEXT PRIMARY KEY,

    -- FK para a série à qual esta temporada pertence.
    series_id       TEXT NOT NULL REFERENCES series(id),

    -- Número da temporada (sempre >= 1; temporada 0 = Specials nunca é inserida).
    season_number   INTEGER NOT NULL,

    -- Nome da temporada (ex.: "Season 1", "Temporada 1"). Nullable.
    name            TEXT,

    -- Total de episódios da temporada (do TMDB). Nullable.
    episode_count   INTEGER,

    -- Data de estreia da temporada. Nullable.
    air_date        DATE,

    -- Sinopse da temporada (frequentemente NULL no TMDB). Nullable.
    overview        TEXT,

    -- URL do pôster específico da temporada (TMDB /w500). Nullable.
    poster_url      TEXT,

    -- Garante que não haja duas linhas com o mesmo season_number para a mesma série.
    -- Usado no upsert: INSERT ... ON CONFLICT (series_id, season_number) DO UPDATE SET ...
    UNIQUE(series_id, season_number)
);

-- Índice para buscar todas as temporadas de uma série (JOIN frequente).
CREATE INDEX IF NOT EXISTS idx_seasons_series ON seasons (series_id);

-- Índice para ordenação cronológica das temporadas.
CREATE INDEX IF NOT EXISTS idx_seasons_air    ON seasons (air_date);


-- ─────────────────────────────────────────────────────────────
-- Tabela: series_episodes
-- Cache best-effort de metadados de episódios.
-- Alimentada via GET /tv/{id}/season/{n} no TMDB.
-- Renomeada de "episodes" para evitar colisão com a tabela de mesmo nome da Marin.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS series_episodes (
    id              TEXT PRIMARY KEY,

    -- FK para a série. ON DELETE CASCADE garante limpeza se a série for fisicamente deletada.
    -- (Soft delete não aciona CASCADE — episódios permanecem com series.deleted=TRUE.)
    series_id       TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,

    -- Número da temporada (desnormalizado para queries rápidas sem JOIN em seasons).
    season_number   INTEGER NOT NULL,

    -- Número do episódio dentro da temporada.
    episode_number  INTEGER NOT NULL,

    -- Título do episódio (name do TMDB). Nullable.
    title           TEXT,

    -- Data de exibição (ISO date). NULL se não anunciado.
    air_date        DATE,

    -- Sinopse do episódio (truncada a 2000 chars; frequentemente NULL). Nullable.
    overview        TEXT,

    -- URL do still/screenshot do episódio (still_path, /w780). NULL se não disponível.
    still_url       TEXT,

    -- Estado de exibição derivado de air_date vs. data atual:
    -- 'lancado'  → air_date IS NOT NULL AND air_date <= NOW()::DATE
    -- 'agendado' → air_date IS NOT NULL AND air_date > NOW()::DATE
    -- NULL       → air_date IS NULL (data desconhecida)
    airing_status   TEXT,

    -- TRUE quando o usuário logou este episódio como assistido.
    watched         BOOLEAN NOT NULL DEFAULT FALSE,

    -- Data em que o episódio foi marcado como assistido (da sessão mais recente).
    watched_date    DATE,

    -- Garante não duplicar episódios: upsert via ON CONFLICT (series_id, season_number, episode_number).
    UNIQUE(series_id, season_number, episode_number)
);

-- Índice para buscar todos os episódios de uma série (JOIN frequente).
CREATE INDEX IF NOT EXISTS idx_eps_series  ON series_episodes (series_id);

-- Índice composto para schedule de lançamentos (UpcomingScreen).
CREATE INDEX IF NOT EXISTS idx_eps_air     ON series_episodes (air_date, airing_status);

-- Índice para encontrar o próximo episódio não assistido de uma temporada.
CREATE INDEX IF NOT EXISTS idx_eps_watched ON series_episodes (series_id, season_number, watched);


-- ─────────────────────────────────────────────────────────────
-- Tabela: series_watch_logs
-- Diário de sessões de episódios assistidos (uma linha por sessão).
-- Suporta rewatches (sem índice único).
-- Renomeada de "watch_logs" para evitar colisão com a tabela de mesmo nome da Marin.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS series_watch_logs (
    id              TEXT PRIMARY KEY,

    -- FK para a série.
    series_id       TEXT NOT NULL REFERENCES series(id),

    -- Título desnormalizado (evita JOIN na listagem do diário).
    series_title    TEXT,

    -- Data da sessão (obrigatória).
    watched_date    DATE NOT NULL,

    -- Temporada assistida (nullable — "assisti eps de X" sem especificar temporada).
    season_number   INTEGER,

    -- Primeiro episódio da sessão (nullable).
    ep_start        INTEGER,

    -- Último episódio da sessão (nullable).
    ep_end          INTEGER,

    -- Número de episódios assistidos nesta sessão (ep_end - ep_start + 1 ou manual).
    -- Fonte de verdade para series.episodes_watched (acumulado via UPDATE).
    episodes_count  INTEGER,

    -- Nota da sessão 0.5–5.0 (nullable — pode assistir sem avaliar).
    rating          NUMERIC(2,1),

    -- Texto da sessão (impressões do arco/bloco de eps; ≠ series.notes que é atemporal).
    review          TEXT,

    -- Origem do registro: 'manual' (entrada do usuário via Telegram).
    source          TEXT,

    -- Timestamp de criação (com fuso UTC).
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para listar o histórico de sessões de uma série.
CREATE INDEX IF NOT EXISTS idx_wlogs_series ON series_watch_logs (series_id);

-- Índice para ordenação cronológica do diário.
CREATE INDEX IF NOT EXISTS idx_wlogs_date   ON series_watch_logs (watched_date);
