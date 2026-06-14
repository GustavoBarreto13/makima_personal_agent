# Phase 1 — Data Model: Séries de TV (022-mai-series)

Schema novo introduzido por esta fatia: `agents/mai/schema_pg.sql` (**4 tabelas**). Convenções
do repo (verificadas em `agents/akane/schema_pg.sql` e `agents/marin/schema_pg.sql`): PK TEXT
(UUID) via `str(uuid.uuid4())`, `TIMESTAMPTZ DEFAULT NOW()`, soft delete por flag `deleted`,
`IF NOT EXISTS`, índices nas colunas filtradas. A hierarquia `series`/`seasons`/`episodes`/`watch_logs`
é a mais rica entre os agentes de mídia — única com a camada intermediária `seasons`.

---

## Entidade: `series` (catálogo de séries)

A série no catálogo. `id` UUID em TEXT. Dedup por `tmdb_id` (único parcial quando não nulo).
`normalizado` = `title` minúsculo + sem acento (fuzzy match, padrão `_norm` da Frieren).

| Coluna | Tipo | Regra |
|--------|------|-------|
| `id` | TEXT PK | UUID (`str(uuid.uuid4())`) |
| `tmdb_id` | INTEGER | ID no TMDB — chave de dedup e enriquecimento; nullable (entrada manual sem busca) |
| `imdb_id` | TEXT | IMDb ID (`tt...`), resolvido via TMDB `external_ids`; nullable |
| `title` | TEXT NOT NULL | título de exibição (pt-BR quando disponível, senão original) |
| `title_original` | TEXT | `original_name` do TMDB (título no idioma de origem) |
| `normalizado` | TEXT NOT NULL | minúsculo + sem acento; fuzzy match |
| `first_air_date` | DATE | data do primeiro episódio (TMDB `first_air_date`) |
| `last_air_date` | DATE | data do último episódio exibido (TMDB `last_air_date`); NULL se em exibição |
| `series_status` | TEXT | estado de exibição: `'no_ar'` \| `'finalizada'` \| `'cancelada'` \| `'nao_lancada'` |
| `network` | TEXT | rede/plataforma principal (`networks[0].name` do TMDB) |
| `seasons_count` | INTEGER | `number_of_seasons` do TMDB; atualizado no sync |
| `episodes_count` | INTEGER | `number_of_episodes` do TMDB (total da série); NULL se indefinido |
| `episodes_watched` | INTEGER DEFAULT 0 | soma dos `episodes_count` dos `watch_logs` do usuário |
| `status` | TEXT DEFAULT 'quero_assistir' | estado do usuário: `'quero_assistir'` \| `'assistindo'` \| `'concluida'` \| `'pausada'` \| `'abandonada'` |
| `rating` | NUMERIC(2,1) | nota do usuário 0.5–5.0 (meia estrela); NULL se sem nota |
| `rating_source` | TEXT | `'own'` quando avaliado manualmente; NULL se sem nota |
| `poster_url` | TEXT | URL do pôster (TMDB `/w500`); NULL → pôster tipográfico na UI |
| `backdrop_url` | TEXT | URL do backdrop (TMDB `/w1280`); NULL → gradiente na UI |
| `overview` | TEXT | sinopse da série (truncada a 2000 chars) |
| `genres` | TEXT[] | gêneros (`genres[].name` do TMDB) |
| `tags` | TEXT[] | tags livres do usuário |
| `notes` | TEXT | anotações soltas do usuário sobre a série (≠ `watch_logs.review`, por sessão) |
| `date_started` | DATE | data da primeira sessão (inferida pelo `log_watch`) |
| `date_finished` | DATE | data em que `episodes_watched >= episodes_count` (inferida) |
| `source` | TEXT | `'manual'` \| `'tmdb_sync'` |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ DEFAULT NOW() | atualizado em cada mutação |
| `deleted` | BOOLEAN DEFAULT FALSE | soft delete |

**Índices**:
```sql
-- Dedup do TMDB: permite múltiplos NULLs (entradas manuais sem tmdb_id)
CREATE UNIQUE INDEX idx_series_tmdb ON series (tmdb_id) WHERE tmdb_id IS NOT NULL;
-- Filtro padrão de listagens
CREATE INDEX idx_series_status  ON series (status);
CREATE INDEX idx_series_deleted ON series (deleted);
-- Fuzzy match
CREATE INDEX idx_series_norm ON series (normalizado);
```

**Regras**:
- `delete_series` faz `UPDATE series SET deleted = TRUE` — nunca DELETE (preserva `watch_logs`).
- Toda listagem filtra `WHERE deleted = FALSE`.
- `rating` validado ∈ [0.5, 1.0, …, 5.0] na camada de aplicação (FR-004).
- `episodes_watched` é acumulado: `UPDATE series SET episodes_watched = episodes_watched + N`.
- `date_finished` preenchido automaticamente quando `episodes_watched >= episodes_count`
  (e `episodes_count IS NOT NULL`).

---

## Entidade: `seasons` (cache de temporadas)

Cache de metadados por temporada. *(Camada exclusiva da Mai — sem equivalente na Akane ou Marin.)*
Alimentada pelo `metadata.py` via `GET /tv/{id}/season/{n}`. Temporadas especiais (`season_number=0`)
são excluídas. Serve a tela de acordeão de temporadas no detalhe da série.

| Coluna | Tipo | Regra |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `series_id` | TEXT NOT NULL | `REFERENCES series(id)` |
| `season_number` | INTEGER NOT NULL | número da temporada (≥ 1; especiais = 0 excluídos) |
| `name` | TEXT | nome da temporada (ex.: "Season 1", "Temporada 1") |
| `episode_count` | INTEGER | total de episódios da temporada (do TMDB) |
| `air_date` | DATE | data de estreia da temporada |
| `overview` | TEXT | sinopse da temporada (truncada a 2000 chars; frequentemente NULL) |
| `poster_url` | TEXT | pôster específico da temporada (TMDB `/w500`); nullable |

**Constraints**:
```sql
UNIQUE(series_id, season_number)   -- upsert sem duplicar; exclui season_number=0 na app layer
```

**Índices**:
```sql
CREATE INDEX idx_seasons_series ON seasons (series_id);   -- todas as temporadas de uma série
CREATE INDEX idx_seasons_air    ON seasons (air_date);    -- ordenação cronológica
```

**Regras**:
- Upsert via `INSERT ... ON CONFLICT (series_id, season_number) DO UPDATE SET ...`.
- `season_number = 0` jamais inserido (filtrado no `metadata.py` antes do upsert).
- Deletar `seasons` ao deletar `series`? Não — o `series` usa soft delete; `seasons` permanecem.
  A listagem de seasons filtra `WHERE series.deleted = FALSE` (JOIN implícito).

---

## Entidade: `episodes` (cache de episódios)

Cache best-effort de metadados dos episódios. Alimentado por `metadata.py` via
`GET /tv/{id}/season/{n}`. Pode estar incompleto para séries longas ou em exibição. `watched`
é sincronizado pelos `log_watch` calls (quando `ep_start`/`ep_end` são fornecidos).

| Coluna | Tipo | Regra |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `series_id` | TEXT NOT NULL | `REFERENCES series(id) ON DELETE CASCADE` |
| `season_number` | INTEGER NOT NULL | número da temporada |
| `episode_number` | INTEGER NOT NULL | número do episódio dentro da temporada |
| `title` | TEXT | título do episódio (`name` do TMDB) |
| `air_date` | DATE | data de exibição (ISO; NULL se não anunciado) |
| `overview` | TEXT | sinopse do episódio (TMDB; truncada a 2000 chars; frequentemente NULL) |
| `still_url` | TEXT | still/screenshot do episódio (`still_path`, `/w780`); NULL se não disponível |
| `airing_status` | TEXT | `'lancado'` \| `'agendado'` \| NULL (derivado de `air_date` vs. hoje) |
| `watched` | BOOLEAN DEFAULT FALSE | TRUE quando o usuário logou este episódio |
| `watched_date` | DATE | quando foi marcado como assistido (da sessão mais recente) |

**Constraints**:
```sql
UNIQUE(series_id, season_number, episode_number)   -- upsert sem duplicar
```

**Índices**:
```sql
CREATE INDEX idx_eps_series  ON episodes (series_id);                      -- todos eps de uma série
CREATE INDEX idx_eps_air     ON episodes (air_date, airing_status);        -- schedule de lançamentos
CREATE INDEX idx_eps_watched ON episodes (series_id, season_number, watched); -- próximo ep não assistido
```

**Regras**:
- `airing_status` = `'lancado'` se `air_date IS NOT NULL AND air_date <= NOW()::DATE`;
  `'agendado'` se `air_date > NOW()::DATE`; NULL se `air_date IS NULL`.
- **Skip-logic** (FR-008): ao sincronizar, pular episódios onde `watched=FALSE AND air_date IS NOT NULL
  AND still_url IS NOT NULL AND air_date < NOW()::DATE` — esse episódio já está completo e não vai mudar.
- Upsert via `INSERT ... ON CONFLICT (series_id, season_number, episode_number) DO UPDATE SET ...`.
- `ON DELETE CASCADE` da série → episódios deletados fisicamente se série for deletada fisicamente
  (soft delete não aciona CASCADE).

---

## Entidade: `watch_logs` (diário de sessões de episódios)

Uma linha por **sessão** de episódios assistidos. Suporta rewatches (sem índice único). Espelha
`watch_logs` da Marin mas adiciona `season_number` (obrigatório para séries) e `review` (texto
por sessão, ≠ `series.notes` que é por série). Denormaliza `series_title` para evitar JOIN.

| Coluna | Tipo | Regra |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `series_id` | TEXT NOT NULL | `REFERENCES series(id)` |
| `series_title` | TEXT | denormalizado (evita JOIN na listagem do diário) |
| `watched_date` | DATE NOT NULL | data da sessão |
| `season_number` | INTEGER | temporada assistida (nullable — "assisti 3 eps de X" sem especificar T) |
| `ep_start` | INTEGER | primeiro episódio da sessão (nullable) |
| `ep_end` | INTEGER | último episódio da sessão (nullable) |
| `episodes_count` | INTEGER | nº de eps assistidos nesta sessão (`ep_end - ep_start + 1` ou manual) |
| `rating` | NUMERIC(2,1) | nota da sessão 0.5–5.0 (nullable — pode assistir sem avaliar) |
| `review` | TEXT | texto da sessão (impressões do arco/bloco de eps; ≠ `series.notes`) |
| `source` | TEXT | `'manual'` |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | |

**Índices**:
```sql
CREATE INDEX idx_wlogs_series ON watch_logs (series_id);    -- histórico de sessões de uma série
CREATE INDEX idx_wlogs_date   ON watch_logs (watched_date); -- ordenação cronológica do diário
```

**Regras**:
- Sem índice único — a mesma sessão pode ser logada 2× intencionalmente (rewatch).
- Quando `season_number`, `ep_start` e `ep_end` são fornecidos: marcar `episodes.watched=TRUE`
  para os números correspondentes (quando existirem em `episodes`).
- `episodes_count` é a fonte de verdade para `series.episodes_watched` (acumulado via UPDATE).
- `review` é por sessão (ex.: "Arco do chefe — incrivelmente tenso"); `series.notes` é para
  observações atemporais sobre a série inteira.

---

## DDL Completo (`agents/mai/schema_pg.sql`)

```sql
-- =============================================================
-- Schema: Mai Sakurajima — Séries de TV (fatia 022)
-- Aplicar via: python -m scripts.setup_schemas
-- =============================================================

CREATE TABLE IF NOT EXISTS series (
    id              TEXT PRIMARY KEY,
    tmdb_id         INTEGER,
    imdb_id         TEXT,
    title           TEXT NOT NULL,
    title_original  TEXT,
    normalizado     TEXT NOT NULL,
    first_air_date  DATE,
    last_air_date   DATE,
    series_status   TEXT,
    network         TEXT,
    seasons_count   INTEGER,
    episodes_count  INTEGER,
    episodes_watched INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'quero_assistir',
    rating          NUMERIC(2,1),
    rating_source   TEXT,
    poster_url      TEXT,
    backdrop_url    TEXT,
    overview        TEXT,
    genres          TEXT[],
    tags            TEXT[],
    notes           TEXT,
    date_started    DATE,
    date_finished   DATE,
    source          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted         BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_series_tmdb    ON series (tmdb_id) WHERE tmdb_id IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_series_status  ON series (status);
CREATE INDEX        IF NOT EXISTS idx_series_deleted ON series (deleted);
CREATE INDEX        IF NOT EXISTS idx_series_norm    ON series (normalizado);

-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS seasons (
    id              TEXT PRIMARY KEY,
    series_id       TEXT NOT NULL REFERENCES series(id),
    season_number   INTEGER NOT NULL,
    name            TEXT,
    episode_count   INTEGER,
    air_date        DATE,
    overview        TEXT,
    poster_url      TEXT,
    UNIQUE(series_id, season_number)
);

CREATE INDEX IF NOT EXISTS idx_seasons_series ON seasons (series_id);
CREATE INDEX IF NOT EXISTS idx_seasons_air    ON seasons (air_date);

-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS episodes (
    id              TEXT PRIMARY KEY,
    series_id       TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    season_number   INTEGER NOT NULL,
    episode_number  INTEGER NOT NULL,
    title           TEXT,
    air_date        DATE,
    overview        TEXT,
    still_url       TEXT,
    airing_status   TEXT,
    watched         BOOLEAN NOT NULL DEFAULT FALSE,
    watched_date    DATE,
    UNIQUE(series_id, season_number, episode_number)
);

CREATE INDEX IF NOT EXISTS idx_eps_series  ON episodes (series_id);
CREATE INDEX IF NOT EXISTS idx_eps_air     ON episodes (air_date, airing_status);
CREATE INDEX IF NOT EXISTS idx_eps_watched ON episodes (series_id, season_number, watched);

-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS watch_logs (
    id              TEXT PRIMARY KEY,
    series_id       TEXT NOT NULL REFERENCES series(id),
    series_title    TEXT,
    watched_date    DATE NOT NULL,
    season_number   INTEGER,
    ep_start        INTEGER,
    ep_end          INTEGER,
    episodes_count  INTEGER,
    rating          NUMERIC(2,1),
    review          TEXT,
    source          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wlogs_series ON watch_logs (series_id);
CREATE INDEX IF NOT EXISTS idx_wlogs_date   ON watch_logs (watched_date);
```

---

## Diagrama de relacionamento

```text
series (1) ──< seasons                (1 série → N temporadas; UNIQUE series_id+season_number)
  │
  ├──< episodes                       (1 série → N episódios; UNIQUE series_id+season+episode)
  │       ↑ ON DELETE CASCADE
  │
  └──< watch_logs                     (1 série → N sessões; rewatch permitido, sem unique)

derivados (sem tabela, agregação SQL):
  PROGRESS     → episodes_watched / episodes_count (da tabela series)
  SEASON_PROG  → COUNT episodes WHERE watched=TRUE AND season_number=$n
  UPCOMING     → SELECT FROM episodes WHERE airing_status='agendado'
                 JOIN series WHERE status='assistindo'
                 WHERE air_date <= NOW() + $days
  STATS        → GROUP BY sobre watch_logs + series
```

---

## Mapeamento completo de enums

### `series.status` (estado do usuário)

| Valor PT-BR | Descrição |
|---|---|
| `quero_assistir` | Na watchlist |
| `assistindo` | Assistindo ativamente |
| `concluida` | Terminou de assistir |
| `pausada` | Pausado temporariamente |
| `abandonada` | Desistiu |

### `series.series_status` (estado de exibição — vem do TMDB)

| Valor | TMDB `status` | Significado |
|---|---|---|
| `no_ar` | `"Returning Series"` / `"In Production"` / `"Pilot"` | Em exibição ou em produção |
| `finalizada` | `"Ended"` | Encerrou naturalmente |
| `cancelada` | `"Canceled"` | Cancelada |
| `nao_lancada` | `"Planned"` | Anunciada, não começou |

### `episodes.airing_status`

| Valor | Condição |
|---|---|
| `lancado` | `air_date IS NOT NULL AND air_date <= NOW()::DATE` |
| `agendado` | `air_date IS NOT NULL AND air_date > NOW()::DATE` |
| NULL | `air_date IS NULL` (data desconhecida) |

### `watch_logs.source` / `series.source`

| Valor | Origem |
|---|---|
| `manual` | Entrada pelo usuário via Telegram |
| `tmdb_sync` | Metadados atualizados via sync TMDB |

---

## Exemplos de linhas

### `series` — linha típica

```jsonc
{
  "id": "a1b2c3d4-...",
  "tmdb_id": 95396,
  "imdb_id": "tt11280740",
  "title": "Severance",
  "title_original": "Severance",
  "normalizado": "severance",
  "first_air_date": "2022-02-18",
  "last_air_date": "2025-03-21",
  "series_status": "no_ar",
  "network": "Apple TV+",
  "seasons_count": 2,
  "episodes_count": 19,
  "episodes_watched": 9,
  "status": "assistindo",
  "rating": 4.5,
  "rating_source": "own",
  "poster_url": "https://image.tmdb.org/t/p/w500/jFfFRQP9YTWkHxEMJWWHEtRMfJi.jpg",
  "backdrop_url": "https://image.tmdb.org/t/p/w1280/9pBGCivBOzpX5lXGX7hMz0XlRbv.jpg",
  "overview": "Mark conduz uma equipe de trabalhadores de escritório que concordaram em se submeter...",
  "genres": ["Drama", "Science Fiction", "Mystery"],
  "tags": ["favorita", "distopia-corporativa"],
  "notes": "Uma das séries mais originais dos últimos anos. A construção de mundo é impecável.",
  "date_started": "2026-01-15",
  "date_finished": null,
  "source": "manual",
  "created_at": "2026-01-15T20:00:00+00:00",
  "updated_at": "2026-06-10T18:35:00+00:00",
  "deleted": false
}
```

### `seasons` — linha típica

```jsonc
{
  "id": "s1b2c3d4-...",
  "series_id": "a1b2c3d4-...",
  "season_number": 1,
  "name": "Temporada 1",
  "episode_count": 9,
  "air_date": "2022-02-18",
  "overview": "Mark conduz uma equipe cujos membros concordaram em se submeter a um procedimento...",
  "poster_url": "https://image.tmdb.org/t/p/w500/6klVlrBpTD6P3IiHSUcLvDhGUEa.jpg"
}
```

### `episodes` — linha típica

```jsonc
{
  "id": "e5f6g7h8-...",
  "series_id": "a1b2c3d4-...",
  "season_number": 1,
  "episode_number": 1,
  "title": "Goodnight, Macrodata Refinement",
  "air_date": "2022-02-18",
  "overview": "Mark apresenta Helly ao misterioso mundo do trabalho recortado da Lumon Industries.",
  "still_url": "https://image.tmdb.org/t/p/w780/rB2RuF0kDjGUSUsq3iEFCjmCEJk.jpg",
  "airing_status": "lancado",
  "watched": true,
  "watched_date": "2026-01-15"
}
```

### `watch_logs` — linha típica

```jsonc
{
  "id": "w9x0y1z2-...",
  "series_id": "a1b2c3d4-...",
  "series_title": "Severance",
  "watched_date": "2026-01-15",
  "season_number": 1,
  "ep_start": 1,
  "ep_end": 3,
  "episodes_count": 3,
  "rating": 4.5,
  "review": "Abertura devastadora — a premissa de trabalho/vida separados foi logo ao ponto. Helly é fascinante.",
  "source": "manual",
  "created_at": "2026-01-15T21:30:00+00:00"
}
```

---

## Estrutura de retorno de `get_series_detail(query)`

```jsonc
{
  "status": "ok",
  "series": {
    "id": "uuid", "tmdb_id": 95396, "title": "Severance",
    "title_original": "Severance", "network": "Apple TV+",
    "seasons_count": 2, "episodes_count": 19, "episodes_watched": 9,
    "status": "assistindo", "series_status": "no_ar",
    "rating": 4.5, "poster_url": "...", "backdrop_url": "...",
    "genres": ["Drama", "Science Fiction", "Mystery"],
    "overview": "...", "notes": "...",
    "date_started": "2026-01-15", "date_finished": null
  },
  "seasons": [
    {
      "season_number": 1, "name": "Temporada 1", "episode_count": 9,
      "air_date": "2022-02-18", "poster_url": "...",
      "watched_count": 9  // calculado: COUNT episodes WHERE watched=TRUE AND season_number=1
    },
    {
      "season_number": 2, "name": "Temporada 2", "episode_count": 10,
      "air_date": "2025-01-17", "poster_url": "...",
      "watched_count": 0
    }
  ],
  "next_episode": {
    "season_number": 2, "episode_number": 1,
    "title": "Hello, Ms. Cobel", "air_date": "2025-01-17",
    "still_url": "...", "watched": false
  },
  "recent_logs": [
    {
      "id": "uuid", "watched_date": "2026-06-10", "season_number": 1,
      "ep_start": 7, "ep_end": 9, "episodes_count": 3,
      "rating": 5.0, "review": "Finale da T1 — absurdamente bom."
    }
  ]
}
```

## Estrutura de retorno de `get_stats(year?)`

```jsonc
{
  "status": "ok",
  "year": 2026,
  "total_series": 8,         // séries com pelo menos 1 log no ano
  "total_episodes": 94,      // soma de episodes_count dos watch_logs
  "total_hours": 78.3,       // estimado: total_episodes * 50min / 60 (duração típica de drama)
  "avg_rating": 4.1,         // média dos ratings (ignora nulos)
  "top_genres": [ { "genre": "Drama", "count": 5 } ],
  "top_networks": [ { "network": "Apple TV+", "count": 2 } ],
  "by_status": {
    "assistindo": 3, "concluida": 4, "quero_assistir": 10, "pausada": 1, "abandonada": 0
  },
  "monthly": [0, 10, 12, 15, 8, 18, 0, 0, 0, 0, 0, 0]  // eps por mês jan→dez
}
```

Todos os blocos resolvem sem erro com dados vazios (zeros/listas) — SC-005.

## Estrutura de retorno de `get_upcoming(days=7)`

```jsonc
{
  "status": "ok",
  "days": 7,
  "episodes": [
    {
      "series_id": "uuid", "series_title": "Severance",
      "season_number": 2, "episode_number": 5,
      "title": "Woe's Hollow", "air_date": "2026-06-17",
      "still_url": "...", "poster_url": "..."
    }
  ]
}
```

Filtra `episodes.airing_status = 'agendado'` + `air_date <= NOW() + $days * interval '1 day'`
+ `JOIN series WHERE status = 'assistindo' AND deleted = FALSE`. Ordenado por `air_date ASC`.

## Estrutura de retorno de `sync_metadata(query)`

```jsonc
{
  "status": "ok",
  "series_title": "Severance",
  "seasons_upserted": 2,
  "episodes_created": 3,
  "episodes_updated": 6,
  "episodes_skipped": 10,
  "errors": []
}
```

Espelha o padrão `created/updated/skipped/errors` dos outros syncs do projeto.

---

## Registro do schema

`agents/mai/schema_pg.sql` MUST ser adicionado à lista `SCHEMA_FILES` em `scripts/setup_schemas.py`,
no mesmo padrão de `agents/akane/schema_pg.sql` e `agents/marin/schema_pg.sql`. Aplicação:

```bash
# De dentro do container makima-web (hostname do Postgres só resolve no swarm)
docker exec makima-web sh -c "cd /app && python -m scripts.setup_schemas"
```
