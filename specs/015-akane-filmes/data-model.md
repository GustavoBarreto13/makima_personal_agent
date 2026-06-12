# Phase 1 — Data Model: Filmes (015-akane-filmes)

Schema novo introduzido por esta fatia: `agents/akane/schema_pg.sql` (4 tabelas). Convenções do repo
(verificadas em `agents/frieren/schema_pg.sql` — par `books` + `reading_logs` + `shelves`): PK TEXT
(UUID) ou SERIAL/UUID, `TIMESTAMPTZ DEFAULT NOW()`, soft delete por flag, `IF NOT EXISTS`, índices nas
colunas filtradas. O par catálogo+log espelha exatamente `books`/`reading_logs`.

---

## Entidade: `movies` (catálogo de filmes)

O filme no catálogo. `id` UUID em TEXT (consistente com Nami/Frieren). Dedup por `letterboxd_uri`
(quando vem do Letterboxd) e/ou `tmdb_id`. `normalizado` = `title` minúsculo + sem acento (para fuzzy
match, no estilo `_norm` da Frieren).

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | TEXT PK | UUID (`str(uuid.uuid4())`) |
| `tmdb_id` | INTEGER | id do filme no TMDB (dedup secundária; nullable) |
| `imdb_id` | TEXT | id no IMDb (`ttXXXXXXX`), quando o TMDB fornece |
| `letterboxd_uri` | TEXT | URL do filme no Letterboxd — **chave de dedup** do RSS/CSV |
| `title` | TEXT NOT NULL | título de exibição |
| `normalizado` | TEXT NOT NULL | minúsculo + sem acento; usado no fuzzy match |
| `year` | INTEGER | ano de lançamento |
| `director` | TEXT[] | diretor(es) — TMDB credits (`job = 'Director'`) |
| `genres` | TEXT[] | gêneros — TMDB |
| `runtime` | INTEGER | duração em minutos — TMDB |
| `overview` | TEXT | sinopse — TMDB (truncar ~2000 chars) |
| `poster_url` | TEXT | `image.tmdb.org/.../w500{poster_path}`; UI cai p/ placeholder se NULL |
| `backdrop_url` | TEXT | `image.tmdb.org/.../w1280{backdrop_path}` — hero da página |
| `status` | TEXT DEFAULT 'watchlist' | `'watchlist'` \| `'watched'` |
| `rating` | NUMERIC(2,1) | nota "atual"/favorita (0.5–5.0); última sessão alimenta |
| `liked` | BOOLEAN DEFAULT FALSE | "coração" do Letterboxd |
| `last_watched_date` | DATE | data da sessão mais recente |
| `times_watched` | INTEGER DEFAULT 0 | nº de sessões (incrementa em cada `log_watch`) |
| `source` | TEXT | `'manual'` \| `'letterboxd_rss'` \| `'letterboxd_csv'` |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ DEFAULT NOW() | atualizado em cada mutação |
| `deleted` | BOOLEAN DEFAULT FALSE | soft delete |

**Índices**:
- `CREATE UNIQUE INDEX idx_movies_letterboxd ON movies (letterboxd_uri) WHERE letterboxd_uri IS NOT NULL;`
  — dedup do RSS/CSV; permite filmes manuais sem `letterboxd_uri`.
- `CREATE INDEX idx_movies_tmdb ON movies (tmdb_id);` — dedup secundária + lookup.
- `CREATE INDEX idx_movies_status ON movies (status);` — filtro grid/watchlist.
- `CREATE INDEX idx_movies_deleted ON movies (deleted);` — filtro padrão das listagens.
- `CREATE INDEX idx_movies_last_watched ON movies (last_watched_date);` — ordenação do grid "recentes".

**Regras**:
- `delete_movie` faz `UPDATE movies SET deleted = TRUE` (nunca `DELETE`) — preserva `diary_entries`.
- Toda busca/grid filtra `WHERE deleted = FALSE`.
- `rating` validado ∈ [0.5, 5.0] na camada de aplicação (FR-005).

## Entidade: `diary_entries` (sessões / log de visualizações)

Uma linha por **vez** que um filme foi assistido — suporta rewatch. Espelha `reading_logs` da Frieren
(denormaliza `movie_title` para evitar JOIN no diário). Cascade não é usado (FK simples; soft delete em
`movies` mantém a sessão como histórico).

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | TEXT PK | UUID |
| `movie_id` | TEXT NOT NULL | `REFERENCES movies(id)` |
| `movie_title` | TEXT | denormalizado (lista do diário sem JOIN) |
| `watched_date` | DATE NOT NULL | quando foi assistido |
| `rating` | NUMERIC(2,1) | nota daquela sessão (0.5–5.0; nullable — assistiu sem avaliar) |
| `rewatch` | BOOLEAN DEFAULT FALSE | TRUE se já havia sessão anterior do mesmo filme |
| `review` | TEXT | texto da review (do Letterboxd ou manual) |
| `tags` | TEXT[] | tags da sessão (Letterboxd permite tags por entrada de diário) |
| `letterboxd_uri` | TEXT | URI do filme (para dedup junto com `watched_date`) |
| `source` | TEXT | `'manual'` \| `'letterboxd_rss'` \| `'letterboxd_csv'` |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | |

**Índices**:
- `CREATE INDEX idx_diary_movie ON diary_entries (movie_id);` — histórico de sessões da página do filme.
- `CREATE INDEX idx_diary_watched ON diary_entries (watched_date);` — ordenação cronológica do diário.
- `CREATE UNIQUE INDEX idx_diary_dedup ON diary_entries (letterboxd_uri, watched_date) WHERE letterboxd_uri IS NOT NULL;`
  — idempotência do RSS/CSV (SC-003); logs manuais (`letterboxd_uri` NULL) não são afetados, permitindo
  dois logs do mesmo filme no mesmo dia se o usuário quiser.

**Regras**:
- `log_watch` insere a sessão e, na **mesma operação**, atualiza `movies` (status, `last_watched_date`,
  `times_watched`, `rating` da última sessão), marcando `rewatch=TRUE` quando `times_watched > 0` antes.

## Entidade: `movie_lists` (listas / coleções)

Coleções temáticas estilo Letterboxd ("Melhores de 2024", "A ver com amigos"). Espelha `shelves` da
Frieren. **Tabelas criadas nesta fatia; UI fica para depois.**

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | UUID PK DEFAULT gen_random_uuid() | |
| `name` | TEXT NOT NULL | nome da lista |
| `description` | TEXT NOT NULL DEFAULT '' | |
| `ranked` | BOOLEAN DEFAULT FALSE | lista ordenada (ranking) como no Letterboxd |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

## Entidade: `movie_list_items` (N:N filme ↔ lista)

Espelha `book_shelves` da Frieren.

| Coluna | Tipo | Regra |
|---|---|---|
| `movie_id` | TEXT NOT NULL | `REFERENCES movies(id) ON DELETE CASCADE` |
| `list_id` | UUID NOT NULL | `REFERENCES movie_lists(id) ON DELETE CASCADE` |
| `position` | INTEGER | ordem na lista (para listas `ranked`) |
| | | PRIMARY KEY (`movie_id`, `list_id`) |

**Índice**: `CREATE INDEX idx_list_items_list ON movie_list_items (list_id);`

---

## Diagrama de relacionamento

```text
            movies (1) ──< diary_entries        (1 filme → N sessões; rewatch)
              │
              └──< movie_list_items >── movie_lists   (N:N — UI futura)

dedup:  movies.letterboxd_uri (único parcial) + movies.tmdb_id
        diary_entries (letterboxd_uri, watched_date) único parcial → idempotência RSS/CSV
```

## Estrutura de retorno de `get_movie_detail(movie_query)`

```jsonc
{
  "status": "ok",
  "movie": {
    "id": "uuid", "title": "Dune", "year": 2021,
    "director": ["Denis Villeneuve"], "genres": ["Sci-Fi","Adventure"],
    "runtime": 155, "poster_url": "...", "backdrop_url": "...",
    "overview": "...", "status": "watched",
    "rating": 4.5, "liked": true,
    "last_watched_date": "2026-06-11", "times_watched": 2
  },
  "diary": [   /* sessões, mais recente primeiro */
    { "id": "uuid", "watched_date": "2026-06-11", "rating": 4.5,
      "rewatch": true, "review": "...", "tags": ["imax"] }
  ]
}
```

## Estrutura de retorno de `get_stats(year)`

```jsonc
{
  "status": "ok",
  "year": 2026,
  "total_films": 42,          // filmes distintos assistidos no ano
  "total_sessions": 47,       // sessões (inclui rewatches)
  "avg_rating": 3.8,          // média das notas do ano (ignora nulos)
  "top_genres":   [ { "genre": "Drama", "count": 18 } ],
  "top_directors":[ { "director": "Denis Villeneuve", "count": 3 } ],
  "rating_histogram": { "0.5":0, "1.0":1, /* ... */ "5.0":6 }
}
```
Cada bloco resolve **vazio sem erro** (lista vazia / zero) quando não há dados no ano (SC-006).

## Estrutura de retorno do sync (`sync_letterboxd` / `POST /api/movies/sync-letterboxd`)

```jsonc
{ "status": "ok", "created": 5, "updated": 12, "skipped": 30, "errors": [] }
```
Espelha o resumo do `gustavoboxd` (`created`/`updated`/`skipped`/`errors`).

---

## Registro do schema

Adicionar `"agents/akane/schema_pg.sql"` à lista `SCHEMA_FILES` em `scripts/setup_schemas.py`, após os
schemas existentes. Aplicado no VPS de dentro do container `makima-web`
(`docker exec makima-web sh -c "cd /app && python -m scripts.setup_schemas"`).
