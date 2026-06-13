# Phase 1 — Data Model: Animes (021-marin-animes)

Schema novo introduzido por esta fatia: `agents/marin/schema_pg.sql` (**4 tabelas**). Convenções
do repo (verificadas em `agents/frieren/schema_pg.sql` e `agents/akane/schema_pg.sql`): PK TEXT
(UUID) via `str(uuid.uuid4())`, `TIMESTAMPTZ DEFAULT NOW()`, soft delete por flag `deleted`,
`IF NOT EXISTS`, índices nas colunas filtradas. O par catálogo+log espelha `anime`/`watch_logs`
com a mesma filosofia de `books`/`reading_logs` (Frieren) e `movies`/`diary_entries` (Akane).

---

## Entidade: `anime` (catálogo)

O anime no catálogo. `id` UUID em TEXT. Dedup por `mal_id` (único parcial quando não nulo).
`normalizado` = `title` minúsculo + sem acento (fuzzy match, padrão `_norm` da Frieren).

| Coluna | Tipo | Regra |
|--------|------|-------|
| `id` | TEXT PK | UUID (`str(uuid.uuid4())`) |
| `mal_id` | INTEGER | ID no MyAnimeList — chave de dedup e sync; nullable (entrada manual sem MAL) |
| `anilist_id` | INTEGER | ID no AniList — quando resolvido via GraphQL |
| `tmdb_id` | INTEGER | ID no TMDB — resolvido via ARM; nullable |
| `title` | TEXT NOT NULL | título de exibição (pt-br ou romaji) |
| `title_english` | TEXT | título em inglês (Jikan `title_english`) |
| `title_japanese` | TEXT | título em japonês (Jikan `title_japanese`) |
| `normalizado` | TEXT NOT NULL | minúsculo + sem acento; fuzzy match e dedup de busca |
| `media_type` | TEXT | `'tv'` \| `'movie'` \| `'ova'` \| `'special'` \| `'ona'` |
| `season` | TEXT | `"winter 2024"` — `"{season} {year}"` do Jikan |
| `studio` | TEXT | nome do estúdio principal (primeiro de `studios[]`) |
| `episodes_total` | INTEGER | total de episódios (NULL se indefinido — ex.: em exibição) |
| `episodes_watched` | INTEGER DEFAULT 0 | soma dos `episodes_count` dos `watch_logs` |
| `status` | TEXT DEFAULT 'quero_assistir' | `'assistindo'` \| `'completo'` \| `'quero_assistir'` \| `'pausado'` \| `'abandonado'` |
| `airing_status` | TEXT | `'no_ar'` \| `'finalizado'` \| `'nao_lancado'` |
| `score` | NUMERIC(3,1) | nota 0.0–10.0 (escala MAL, meia nota); NULL se sem nota |
| `poster_url` | TEXT | URL do pôster (Jikan CDN) |
| `banner_url` | TEXT | URL do banner de alta res (AniList) |
| `overview` | TEXT | sinopse (Jikan `synopsis`, truncada a 2000 chars) |
| `genres` | TEXT[] | gêneros (Jikan `genres[].name`) |
| `tags` | TEXT[] | tags livres (usuário ou MAL themes) |
| `notes` | TEXT | anotações soltas do usuário (≠ `watch_logs.notes`, que é por sessão) |
| `date_started` | DATE | data da primeira sessão (inferida pelo `log_watch`) |
| `date_finished` | DATE | data em que `episodes_watched >= episodes_total` |
| `source` | TEXT | `'manual'` \| `'mal_sync'` \| `'jikan'` |
| `mal_updated_at` | TIMESTAMPTZ | `list_status.updated_at` do MAL (para delta sync) |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ DEFAULT NOW() | atualizado em cada mutação |
| `deleted` | BOOLEAN DEFAULT FALSE | soft delete |

**Índices**:
```sql
-- Dedup do MAL sync: permite múltiplos NULLs (entradas manuais sem mal_id)
CREATE UNIQUE INDEX idx_anime_mal ON anime (mal_id) WHERE mal_id IS NOT NULL;
-- Lookup por TMDB (ARM bridge)
CREATE INDEX idx_anime_tmdb ON anime (tmdb_id);
-- Filtro padrão de listagens
CREATE INDEX idx_anime_status ON anime (status);
CREATE INDEX idx_anime_deleted ON anime (deleted);
-- Fuzzy match
CREATE INDEX idx_anime_norm ON anime (normalizado);
```

**Regras**:
- `delete_anime` faz `UPDATE anime SET deleted = TRUE` — nunca DELETE (preserva `watch_logs`).
- Toda listagem filtra `WHERE deleted = FALSE`.
- `score` validado ∈ [0.0, 10.0] na camada de aplicação (FR-005).
- `episodes_watched` é acumulado: `UPDATE anime SET episodes_watched = episodes_watched + N`.
- `date_finished` é preenchido automaticamente quando `episodes_watched >= episodes_total`
  (e `episodes_total IS NOT NULL`).

---

## Entidade: `watch_logs` (diário de sessões de episódios)

Uma linha por **sessão** de episódios assistidos. Suporta rewatches (sem índice único). Espelha
`reading_logs` da Frieren: denormaliza `anime_title` para evitar JOIN no diário. `ep_start` e
`ep_end` são opcionais (pode-se logar "assisti 2 eps do Dungeon Meshi" sem saber o número).

| Coluna | Tipo | Regra |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `anime_id` | TEXT NOT NULL | `REFERENCES anime(id)` |
| `anime_title` | TEXT | denormalizado (evita JOIN na listagem do diário) |
| `watched_date` | DATE NOT NULL | data da sessão |
| `ep_start` | INTEGER | primeiro episódio da sessão (nullable — "assisti alguns eps") |
| `ep_end` | INTEGER | último episódio da sessão (nullable) |
| `episodes_count` | INTEGER | nº de eps assistidos nesta sessão (`ep_end - ep_start + 1` ou manual) |
| `rating` | NUMERIC(3,1) | nota da sessão 0.0–10.0 (nullable — pode assistir sem avaliar) |
| `notes` | TEXT | observações da sessão (≠ `anime.notes`, que é do anime inteiro) |
| `source` | TEXT | `'manual'` \| `'mal_sync'` |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | |

**Índices**:
```sql
CREATE INDEX idx_logs_anime ON watch_logs (anime_id);         -- histórico de sessões do anime
CREATE INDEX idx_logs_date ON watch_logs (watched_date);      -- ordenação cronológica do diário
```

**Regras**:
- Sem índice único — o mesmo episódio pode ser logado 2× (rewatch intencional).
- Quando `ep_start` e `ep_end` são fornecidos: marcar `episodes.watched=TRUE` para os números
  correspondentes (quando esses episódios existirem em cache na tabela `episodes`).
- `episodes_count` é a fonte de verdade para `anime.episodes_watched` (não `ep_end - ep_start`
  diretamente, pois o usuário pode logar sem passar os números).

---

## Entidade: `episodes` (cache de metadados por episódio)

Cache best-effort de metadados dos episódios. Alimentado pelo `metadata.py` (Jikan + AniList +
TMDB). Pode estar incompleto para séries longas ou animes da blacklist. `watched` é sincronizado
pelos `log_watch` calls.

| Coluna | Tipo | Regra |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `anime_id` | TEXT NOT NULL | `REFERENCES anime(id) ON DELETE CASCADE` |
| `number` | INTEGER NOT NULL | número do episódio |
| `title` | TEXT | título do episódio (Jikan) |
| `aired` | DATE | data de lançamento (ISO, sem timezone — Jikan `aired[:10]` ou AniList timestamp→DATE) |
| `synopsis` | TEXT | sinopse do episódio (Jikan, truncada a 2000 chars; frequentemente NULL) |
| `thumbnail_url` | TEXT | still do episódio (TMDB `/tv/{id}/season/1/episode/{n}/images`, `w780`) |
| `airing_status` | TEXT | `'lancado'` \| `'agendado'` (derivado de `aired <= hoje`) |
| `watched` | BOOLEAN DEFAULT FALSE | marcado TRUE pelo `log_watch` quando o episódio está no range |
| `watched_date` | DATE | quando foi marcado como assistido |

**Constraints**:
```sql
UNIQUE(anime_id, number)   -- um episódio por número por anime; upsert sem duplicar
```

**Índices**:
```sql
CREATE INDEX idx_eps_anime ON episodes (anime_id);                     -- todos eps de um anime
CREATE INDEX idx_eps_airing ON episodes (aired, airing_status);        -- schedule de lançamentos
CREATE INDEX idx_eps_watched ON episodes (anime_id, watched);          -- próximo ep não assistido
```

**Regras**:
- `airing_status` = `'lancado'` se `aired <= NOW()::DATE`, `'agendado'` se `aired > NOW()::DATE`,
  NULL se `aired` for NULL.
- `thumbnail_url` é NULL quando TMDB não disponível ou anime não mapeado — comportamento gracioso.
- Upsert via `INSERT ... ON CONFLICT (anime_id, number) DO UPDATE`.

---

## Entidade: `mal_sync_state` (estado OAuth + delta — linha única)

Tabela singleton (sempre 1 linha, `id=1`, garantido por CHECK). Guarda o estado completo do sync
MAL: tokens OAuth e timestamp do último sync. **Jamais usar arquivo em disco** — o container
Dokploy não sobrevive a redeploy com volumes de escrita fora do PostgreSQL.

| Coluna | Tipo | Regra |
|--------|------|-------|
| `id` | INTEGER PK DEFAULT 1 | `CHECK (id = 1)` — garante linha única |
| `access_token` | TEXT | token de acesso atual (expira em ~1h) |
| `refresh_token` | TEXT | token de refresh — **rotacionado a cada uso pelo MAL** |
| `expires_at` | TIMESTAMPTZ | quando o `access_token` expira (calculado: `NOW() + expires_in * interval '1 second'`) |
| `last_sync_at` | TIMESTAMPTZ | timestamp do último sync bem-sucedido (para delta) |
| `updated_at` | TIMESTAMPTZ DEFAULT NOW() | última atualização da tabela |

**Como usar**:
```sql
-- Inicializar (via authorize_mal.py após o fluxo PKCE)
INSERT INTO mal_sync_state (id, access_token, refresh_token, expires_at, last_sync_at)
VALUES (1, $1, $2, $3, '1970-01-01 00:00:00+00')
ON CONFLICT (id) DO UPDATE SET
  access_token = EXCLUDED.access_token,
  refresh_token = EXCLUDED.refresh_token,
  expires_at = EXCLUDED.expires_at,
  updated_at = NOW();

-- Verificar expiração antes do sync
SELECT access_token, refresh_token, expires_at, last_sync_at
FROM mal_sync_state WHERE id = 1;

-- Após refresh (rotação obrigatória do refresh_token)
UPDATE mal_sync_state SET
  access_token = $1,
  refresh_token = $2,  -- NOVO token retornado pelo MAL
  expires_at = $3,
  updated_at = NOW()
WHERE id = 1;

-- Após sync bem-sucedido
UPDATE mal_sync_state SET last_sync_at = NOW(), updated_at = NOW() WHERE id = 1;
```

---

## DDL Completo (`agents/marin/schema_pg.sql`)

```sql
-- =============================================================
-- Schema: Marin Kitagawa — Animes (fatia 021)
-- Aplicar via: python -m scripts.setup_schemas
-- =============================================================

CREATE TABLE IF NOT EXISTS anime (
    id              TEXT PRIMARY KEY,
    mal_id          INTEGER,
    anilist_id      INTEGER,
    tmdb_id         INTEGER,
    title           TEXT NOT NULL,
    title_english   TEXT,
    title_japanese  TEXT,
    normalizado     TEXT NOT NULL,
    media_type      TEXT,
    season          TEXT,
    studio          TEXT,
    episodes_total  INTEGER,
    episodes_watched INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'quero_assistir',
    airing_status   TEXT,
    score           NUMERIC(3,1),
    poster_url      TEXT,
    banner_url      TEXT,
    overview        TEXT,
    genres          TEXT[],
    tags            TEXT[],
    notes           TEXT,
    date_started    DATE,
    date_finished   DATE,
    source          TEXT,
    mal_updated_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted         BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_anime_mal ON anime (mal_id)
    WHERE mal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anime_tmdb    ON anime (tmdb_id);
CREATE INDEX IF NOT EXISTS idx_anime_status  ON anime (status);
CREATE INDEX IF NOT EXISTS idx_anime_deleted ON anime (deleted);
CREATE INDEX IF NOT EXISTS idx_anime_norm    ON anime (normalizado);

-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS watch_logs (
    id              TEXT PRIMARY KEY,
    anime_id        TEXT NOT NULL REFERENCES anime(id),
    anime_title     TEXT,
    watched_date    DATE NOT NULL,
    ep_start        INTEGER,
    ep_end          INTEGER,
    episodes_count  INTEGER,
    rating          NUMERIC(3,1),
    notes           TEXT,
    source          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_anime ON watch_logs (anime_id);
CREATE INDEX IF NOT EXISTS idx_logs_date  ON watch_logs (watched_date);

-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS episodes (
    id              TEXT PRIMARY KEY,
    anime_id        TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
    number          INTEGER NOT NULL,
    title           TEXT,
    aired           DATE,
    synopsis        TEXT,
    thumbnail_url   TEXT,
    airing_status   TEXT,
    watched         BOOLEAN NOT NULL DEFAULT FALSE,
    watched_date    DATE,
    UNIQUE(anime_id, number)
);

CREATE INDEX IF NOT EXISTS idx_eps_anime   ON episodes (anime_id);
CREATE INDEX IF NOT EXISTS idx_eps_airing  ON episodes (aired, airing_status);
CREATE INDEX IF NOT EXISTS idx_eps_watched ON episodes (anime_id, watched);

-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mal_sync_state (
    id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    access_token    TEXT,
    refresh_token   TEXT,
    expires_at      TIMESTAMPTZ,
    last_sync_at    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Linha inicial (sem tokens — tokens inseridos pelo authorize_mal.py)
INSERT INTO mal_sync_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
```

---

## Diagrama de relacionamento

```text
anime (1) ──< watch_logs            (1 anime → N sessões; rewatch permitido)
  │
  └──< episodes                     (1 anime → N episódios; UNIQUE anime_id+number)

mal_sync_state (singleton)          (linha única id=1; OAuth tokens + last_sync_at)

derivados (sem tabela, agregação SQL):
  STATS     → GROUP BY sobre watch_logs + anime
  SCHEDULE  → SELECT FROM episodes WHERE aired > NOW() AND anime.status='assistindo'
  PROGRESS  → episodes_watched / episodes_total (calculado)
```

---

## Mapeamento completo de enums

### `anime.status` (estado na lista do usuário)

| Valor PT-BR          | MAL API        | Jikan display    | Descrição              |
|----------------------|----------------|------------------|------------------------|
| `assistindo`         | `watching`     | —                | Assistindo ativamente  |
| `completo`           | `completed`    | —                | Terminou de assistir   |
| `quero_assistir`     | `plan_to_watch`| —                | Watchlist              |
| `pausado`            | `on_hold`      | —                | Pausado temporariamente|
| `abandonado`         | `dropped`      | —                | Abandonou              |

### `anime.airing_status` (estado de exibição do anime)

| Valor          | Jikan `status`      | Significado               |
|----------------|---------------------|---------------------------|
| `no_ar`        | `Currently Airing`  | Em exibição agora         |
| `finalizado`   | `Finished Airing`   | Finalizou a exibição      |
| `nao_lancado`  | `Not yet aired`     | Ainda não começou         |

### `anime.media_type`

| Valor      | Jikan `type` | Descrição                    |
|------------|--------------|------------------------------|
| `tv`       | `TV`         | Série de TV (episódios)      |
| `movie`    | `Movie`      | Filme de anime               |
| `ova`      | `OVA`        | Original Video Animation     |
| `special`  | `Special`    | Episódio especial            |
| `ona`      | `ONA`        | Original Net Animation       |

### `episodes.airing_status`

| Valor       | Condição                        |
|-------------|----------------------------------|
| `lancado`   | `aired IS NOT NULL AND aired <= NOW()::DATE` |
| `agendado`  | `aired IS NOT NULL AND aired > NOW()::DATE`  |
| NULL        | `aired IS NULL` (data desconhecida)          |

### `watch_logs.source` / `anime.source`

| Valor       | Origem                              |
|-------------|-------------------------------------|
| `manual`    | Entrada pelo usuário via Telegram   |
| `mal_sync`  | Importado via sync do MAL           |
| `jikan`     | Metadados buscados do Jikan         |

---

## Exemplos de linhas

### `anime` — linha típica

```jsonc
{
  "id": "f3a8c2d1-...",
  "mal_id": 52701,
  "anilist_id": 163134,
  "tmdb_id": 227765,
  "title": "Dungeon Meshi",
  "title_english": "Delicious in Dungeon",
  "title_japanese": "ダンジョン飯",
  "normalizado": "dungeon meshi",
  "media_type": "tv",
  "season": "winter 2024",
  "studio": "TRIGGER",
  "episodes_total": 24,
  "episodes_watched": 12,
  "status": "assistindo",
  "airing_status": "finalizado",
  "score": 9.0,
  "poster_url": "https://cdn.myanimelist.net/images/anime/1/141636l.jpg",
  "banner_url": "https://s4.anilist.co/file/anilistcdn/media/anime/banner/163134.jpg",
  "overview": "Laios Touden e seu grupo de aventureiros...",
  "genres": ["Adventure", "Comedy", "Fantasy"],
  "tags": ["favorito", "dungeon"],
  "notes": "Melhor anime de 2024 fácil. Episódio 4 é incrível.",
  "date_started": "2026-01-10",
  "date_finished": null,
  "source": "jikan",
  "mal_updated_at": "2026-06-10T18:30:00+00:00",
  "created_at": "2026-01-10T20:00:00+00:00",
  "updated_at": "2026-06-10T18:35:00+00:00",
  "deleted": false
}
```

### `watch_logs` — linha típica

```jsonc
{
  "id": "a1b2c3d4-...",
  "anime_id": "f3a8c2d1-...",
  "anime_title": "Dungeon Meshi",
  "watched_date": "2026-01-10",
  "ep_start": 1,
  "ep_end": 3,
  "episodes_count": 3,
  "rating": 9.5,
  "notes": "Abertura do arco do dragão vermelho, adorei o Senshi",
  "source": "manual",
  "created_at": "2026-01-10T21:00:00+00:00"
}
```

### `episodes` — linha típica

```jsonc
{
  "id": "e5f6g7h8-...",
  "anime_id": "f3a8c2d1-...",
  "number": 1,
  "title": "A Corpse That Won't Rot",
  "aired": "2024-01-04",
  "synopsis": "Laios e seu grupo, após perder Farida nas profundezas do dungeon...",
  "thumbnail_url": "https://image.tmdb.org/t/p/w780/abc123.jpg",
  "airing_status": "lancado",
  "watched": true,
  "watched_date": "2026-01-10"
}
```

### `mal_sync_state` — linha única

```jsonc
{
  "id": 1,
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "def50200a1b2c3d4...",
  "expires_at": "2026-06-13T21:00:00+00:00",
  "last_sync_at": "2026-06-13T20:00:00+00:00",
  "updated_at": "2026-06-13T20:00:00+00:00"
}
```

---

## Estrutura de retorno de `get_anime_details(query)`

```jsonc
{
  "status": "ok",
  "anime": {
    "id": "uuid", "mal_id": 52701, "title": "Dungeon Meshi",
    "title_english": "Delicious in Dungeon",
    "media_type": "tv", "season": "winter 2024", "studio": "TRIGGER",
    "episodes_total": 24, "episodes_watched": 12,
    "status": "assistindo", "airing_status": "finalizado",
    "score": 9.0, "poster_url": "...", "banner_url": "...",
    "genres": ["Adventure", "Comedy", "Fantasy"],
    "overview": "...", "notes": "...",
    "date_started": "2026-01-10", "date_finished": null
  },
  "next_episode": {
    "number": 13, "title": "Dumplings / Broiled in a Pan",
    "aired": "2024-04-04", "thumbnail_url": "...", "watched": false
  },
  "recent_logs": [
    { "id": "uuid", "watched_date": "2026-06-10", "ep_start": 10, "ep_end": 12,
      "episodes_count": 3, "rating": 9.5, "notes": "..." }
  ]
}
```

## Estrutura de retorno de `get_stats(year?)`

```jsonc
{
  "status": "ok",
  "year": 2026,
  "total_animes": 12,          // animes distintos com pelo menos 1 log no ano
  "total_episodes": 156,       // soma de episodes_count de watch_logs
  "total_hours": 65.0,         // estimado: total_episodes * 24min / 60 (ou duração real)
  "avg_score": 8.3,            // média dos scores (ignora nulos)
  "top_genres": [ { "genre": "Fantasy", "count": 8 } ],
  "top_studios": [ { "studio": "TRIGGER", "count": 3 } ],
  "by_status": {
    "assistindo": 4, "completo": 7, "quero_assistir": 10, "pausado": 1, "abandonado": 0
  },
  "monthly": [0, 2, 3, 4, 0, 3, 0, 0, 0, 0, 0, 0]  // eps por mês jan→dez
}
```

Todos os blocos resolvem sem erro com dados vazios (zeros/listas) — SC-007.

## Estrutura de retorno de `get_airing_schedule(days=7)`

```jsonc
{
  "status": "ok",
  "days": 7,
  "episodes": [
    {
      "anime_id": "uuid", "anime_title": "Frieren: Beyond Journey's End",
      "episode_number": 28, "episode_title": "...",
      "aired": "2026-06-15", "thumbnail_url": "...",
      "poster_url": "..."
    }
  ]
}
```
Filtra `episodes.airing_status = 'agendado'` + `aired <= NOW() + days * interval '1 day'`
+ `anime.status = 'assistindo'`. Ordenado por `aired ASC`.

## Estrutura de retorno do `sync_mal()`

```jsonc
{ "status": "ok", "created": 3, "updated": 7, "skipped": 45, "errors": [] }
```
Espelha o padrão `created/updated/skipped/errors` dos outros syncs do projeto.
