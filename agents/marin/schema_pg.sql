-- agents/marin/schema_pg.sql
-- Schema das tabelas de animes da Marin no PostgreSQL.
-- 4 tabelas criadas de uma vez (schema inteiro nasce na fatia 021).
-- Todas as tabelas usam IF NOT EXISTS para ser idempotente ao reaplicar.
-- Espelha o padrão de agents/akane/schema_pg.sql (movies + diary_entries)
-- e agents/frieren/schema_pg.sql (books + reading_logs).


-- ── Catálogo de animes ───────────────────────────────────────────────────────
-- Uma linha por anime no catálogo do usuário.
-- Chave de dedup principal: mal_id (quando o anime foi encontrado no MAL).
-- Animes adicionados manualmente sem busca no MAL ficam com mal_id NULL.
CREATE TABLE IF NOT EXISTS anime (
    id               TEXT         PRIMARY KEY,           -- UUID gerado em Python (str(uuid.uuid4()))
    mal_id           INTEGER,                            -- ID do anime no MyAnimeList — dedup e ponto de sync
    anilist_id       INTEGER,                            -- ID no AniList — resolvido via GraphQL (nullable)
    tmdb_id          INTEGER,                            -- ID no TMDB — resolvido via ARM bridge (nullable)
    title            TEXT         NOT NULL,              -- Título de exibição (pt-br ou romaji, o que o usuário preferir)
    title_english    TEXT,                               -- Título em inglês fornecido pelo Jikan (ex.: "Delicious in Dungeon")
    title_japanese   TEXT,                               -- Título em japonês (ex.: "ダンジョン飯")
    normalizado      TEXT         NOT NULL,              -- Título em minúsculas sem acentos — permite busca fuzzy sem diferença de grafia
    media_type       TEXT,                               -- Formato: 'tv' | 'movie' | 'ova' | 'special' | 'ona'
    season           TEXT,                               -- Temporada de estreia no formato "winter 2024" (do Jikan)
    studio           TEXT,                               -- Nome do estúdio de animação principal (primeiro de studios[] do Jikan)
    episodes_total   INTEGER,                            -- Total de episódios planejados; NULL quando ainda em exibição ou indefinido
    episodes_watched INTEGER      NOT NULL DEFAULT 0,   -- Soma dos episodes_count de todos os watch_logs do usuário
    status           TEXT         NOT NULL DEFAULT 'quero_assistir', -- Estado na lista do usuário: 'assistindo' | 'completo' | 'quero_assistir' | 'pausado' | 'abandonado'
    airing_status    TEXT,                               -- Estado de exibição do anime: 'no_ar' | 'finalizado' | 'nao_lancado'
    score            NUMERIC(3,1),                       -- Nota do usuário de 0.0 a 10.0 (escala MAL, meia nota); NULL se ainda não avaliou
    poster_url       TEXT,                               -- URL do pôster (CDN do MyAnimeList via Jikan)
    banner_url       TEXT,                               -- URL do banner de alta resolução (AniList CDN)
    overview         TEXT,                               -- Sinopse do anime (Jikan synopsis, truncada em 2000 caracteres)
    genres           TEXT[],                             -- Array de gêneros (ex.: ["Adventure", "Comedy", "Fantasy"]) — Jikan genres[].name
    tags             TEXT[],                             -- Tags livres adicionadas pelo usuário ou importadas do MAL themes
    notes            TEXT,                               -- Anotações soltas do usuário sobre o anime (diferente de watch_logs.notes, que é por sessão)
    date_started     DATE,                               -- Data da primeira sessão de episódios (preenchida automaticamente pelo log_watch)
    date_finished    DATE,                               -- Data em que episodes_watched >= episodes_total (preenchida automaticamente)
    source           TEXT,                               -- Origem do registro: 'manual' | 'mal_sync' | 'jikan'
    mal_updated_at   TIMESTAMPTZ,                        -- Timestamp list_status.updated_at do MAL — usado para delta sync (só reprocessar o que mudou)
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(), -- Quando o registro foi criado no banco
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(), -- Quando o registro foi atualizado pela última vez
    deleted          BOOLEAN      NOT NULL DEFAULT FALSE -- Soft delete — nunca apagamos fisicamente (preserva watch_logs do anime)
);

-- Índice único parcial para dedup do MAL sync: garante que um mal_id apareça
-- no máximo uma vez. WHERE parcial: múltiplos NULLs são permitidos (animes
-- adicionados manualmente sem mal_id não se conflitam entre si).
CREATE UNIQUE INDEX IF NOT EXISTS idx_anime_mal
    ON anime (mal_id)
    WHERE mal_id IS NOT NULL;

-- Lookup por tmdb_id (bridge ARM para resolver metadados via TMDB).
CREATE INDEX IF NOT EXISTS idx_anime_tmdb
    ON anime (tmdb_id);

-- Filtro padrão das listagens (ex.: "animes que estou assistindo").
CREATE INDEX IF NOT EXISTS idx_anime_status
    ON anime (status);

-- Filtro de soft delete — toda listagem filtra WHERE deleted = FALSE.
CREATE INDEX IF NOT EXISTS idx_anime_deleted
    ON anime (deleted);

-- Busca fuzzy pelo campo normalizado (sem acentos, minúsculo).
CREATE INDEX IF NOT EXISTS idx_anime_norm
    ON anime (normalizado);

-- Filtro por estado de exibição (ex.: "animes no ar agora").
CREATE INDEX IF NOT EXISTS idx_anime_airing_status
    ON anime (airing_status);


-- ── Diário de sessões de episódios ───────────────────────────────────────────
-- Uma linha por sessão de episódios assistidos. Suporta rewatch (sem índice
-- único — o mesmo episódio pode ser logado mais de uma vez intencionalmente).
-- Espelha reading_logs da Frieren e diary_entries da Akane.
-- anime_title é denormalizado para evitar JOIN nas listagens do diário.
CREATE TABLE IF NOT EXISTS watch_logs (
    id             TEXT         PRIMARY KEY,                         -- UUID
    anime_id       TEXT         NOT NULL REFERENCES anime(id),       -- FK para o anime assistido
    anime_title    TEXT,                                             -- Título denormalizado — evita JOIN ao listar o diário cronológico
    watched_date   DATE         NOT NULL,                            -- Data em que a sessão aconteceu
    ep_start       INTEGER,                                          -- Primeiro episódio da sessão (nullable — "assisti alguns eps" sem saber o número)
    ep_end         INTEGER,                                          -- Último episódio da sessão (nullable)
    episodes_count INTEGER,                                          -- Quantidade de episódios assistidos nesta sessão (ep_end - ep_start + 1 ou valor manual)
    rating         NUMERIC(3,1),                                     -- Nota da sessão de 0.0 a 10.0 (nullable — pode assistir sem avaliar)
    notes          TEXT,                                             -- Observações desta sessão específica (diferente de anime.notes)
    source         TEXT,                                             -- Origem: 'manual' | 'mal_sync'
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()              -- Quando o log foi criado
);

-- Histórico de sessões de um anime específico.
CREATE INDEX IF NOT EXISTS idx_logs_anime
    ON watch_logs (anime_id);

-- Ordenação cronológica do diário (watched_date DESC).
CREATE INDEX IF NOT EXISTS idx_logs_date
    ON watch_logs (watched_date);


-- ── Cache de metadados por episódio ──────────────────────────────────────────
-- Cache best-effort dos episódios de cada anime. Alimentado pelo metadata.py
-- (Jikan + AniList + TMDB). Pode estar incompleto para séries longas ou animes
-- sem dados disponíveis nas APIs.
-- ON DELETE CASCADE: ao remover um anime do catálogo (mesmo que soft delete
-- não acione isso), os episódios em cache são apagados junto.
CREATE TABLE IF NOT EXISTS episodes (
    id             TEXT         PRIMARY KEY,                                             -- UUID
    anime_id       TEXT         NOT NULL REFERENCES anime(id) ON DELETE CASCADE,        -- FK para o anime; CASCADE apaga episódios se o anime for deletado fisicamente
    number         INTEGER      NOT NULL,                                                -- Número do episódio dentro da série (ex.: 1, 2, 24)
    title          TEXT,                                                                 -- Título do episódio (do Jikan; frequentemente NULL para episódios antigos)
    aired          DATE,                                                                 -- Data de lançamento do episódio (ISO sem timezone — Jikan aired[:10])
    synopsis       TEXT,                                                                 -- Sinopse do episódio (Jikan, truncada em 2000 chars; frequentemente NULL)
    thumbnail_url  TEXT,                                                                 -- Still do episódio (TMDB /tv/{id}/season/1/episode/{n}/images, tamanho w780); NULL quando não disponível
    airing_status  TEXT         DEFAULT 'agendado',                                     -- Estado de exibição: 'lancado' (aired <= hoje) | 'agendado' (aired > hoje)
    watched        BOOLEAN      NOT NULL DEFAULT FALSE,                                 -- TRUE quando o episódio foi marcado como assistido pelo log_watch
    watched_date   DATE,                                                                 -- Data em que foi marcado como assistido
    UNIQUE (anime_id, number)                                                            -- Um número de episódio por anime — permite upsert sem duplicar
);

-- Todos os episódios de um anime (para montar a lista de episódios na UI).
CREATE INDEX IF NOT EXISTS idx_eps_anime
    ON episodes (anime_id);

-- Schedule de lançamentos: busca episódios futuros de animes que o usuário está assistindo.
CREATE INDEX IF NOT EXISTS idx_eps_airing
    ON episodes (aired, airing_status);

-- Próximo episódio não assistido de um anime: filtra anime_id + watched = FALSE.
CREATE INDEX IF NOT EXISTS idx_eps_watched
    ON episodes (anime_id, watched);


-- ── Estado OAuth + delta do MAL (linha única) ────────────────────────────────
-- Tabela singleton: armazena tokens OAuth do MyAnimeList e o timestamp do
-- último sync bem-sucedido. O CHECK (id = 1) impede que exista mais de uma
-- linha — toda leitura/escrita sempre referencia WHERE id = 1.
-- Tokens ficam AQUI (não em arquivo em disco) porque o container Docker não
-- sobrevive a redeploys com volumes de escrita fora do PostgreSQL (Dokploy).
CREATE TABLE IF NOT EXISTS mal_sync_state (
    id             INTEGER      PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Sempre 1 — o CHECK garante que só existe uma linha nesta tabela
    access_token   TEXT,                                               -- Token de acesso OAuth atual (expira em ~1 hora)
    refresh_token  TEXT,                                               -- Token de refresh — rotacionado a cada uso pelo MAL (guardar o NOVO valor após cada refresh)
    expires_at     TIMESTAMPTZ,                                        -- Quando o access_token expira (calculado: NOW() + expires_in * interval '1 second')
    last_sync_at   TIMESTAMPTZ,                                        -- Timestamp do último sync bem-sucedido — usado para delta sync (só reprocessar mudanças desde aqui)
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()                -- Quando esta linha foi atualizada pela última vez
);

-- Linha inicial sem tokens. ON CONFLICT DO NOTHING garante idempotência:
-- reaplicar o schema não sobrescreve tokens já existentes.
INSERT INTO mal_sync_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
