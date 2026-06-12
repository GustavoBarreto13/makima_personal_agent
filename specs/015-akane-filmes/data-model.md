# Phase 1 — Data Model: Filmes (015-akane-filmes)

Schema novo introduzido por esta fatia: `agents/akane/schema_pg.sql` (**7 tabelas** — todas criadas agora;
a UI das tabelas-satélite `movie_lists`/`movie_vault_items`/`movie_people`/`movie_favorites` é faseada nas
Ondas US4/US5). Convenções do repo
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
| `poster_url` | TEXT | `image.tmdb.org/.../w500{poster_path}`; UI cai p/ pôster tipográfico se NULL |
| `backdrop_url` | TEXT | `image.tmdb.org/.../w1280{backdrop_path}` — hero da página |
| `poster_palette` | TEXT | chave de paleta (`POSTER`: `noir`, `rose`, `teal`, …) — colorgrade do **pôster tipográfico de fallback** quando `poster_url` é NULL; default determinístico por hash do título |
| `status` | TEXT DEFAULT 'watchlist' | `'watchlist'` \| `'watched'` |
| `rating` | NUMERIC(2,1) | nota "atual"/favorita (0.5–5.0); última sessão alimenta |
| `rating_source` | TEXT | `'letterboxd'` \| `'own'` \| NULL — origem da nota; alimenta o selo **"via Letterboxd"** na página do filme (NULL = sem nota) |
| `liked` | BOOLEAN DEFAULT FALSE | "coração" do Letterboxd |
| `tags` | TEXT[] | etiquetas de **nível-filme** (≠ `diary_entries.tags`, que é por sessão); alimenta a tela Etiquetas e o filtro do grid |
| `notes` | TEXT | **anotações soltas** sobre o filme (≠ `review`, que é por sessão no diário) — bloco "caderno" no detalhe |
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
Frieren. **Tabelas criadas nesta fatia; UI na Onda US5.**

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | UUID PK DEFAULT gen_random_uuid() | |
| `name` | TEXT NOT NULL | nome da lista |
| `description` | TEXT NOT NULL DEFAULT '' | |
| `accent` | TEXT | cor de acento da lista (OKLCH, ex.: `oklch(0.66 0.20 355)`) — barra/pilha do card no protótipo |
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

## Entidade: `movie_vault_items` (Cofre de conteúdos)

Conteúdos salvos **sobre** um filme (vídeos-ensaio, artigos, críticas externas) — o "Cofre de conteúdos"
do detalhe. Um filme tem N itens; cada item é um link tipado. **Tabela criada nesta fatia; UI na Onda US5.**

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | TEXT PK | UUID |
| `movie_id` | TEXT NOT NULL | `REFERENCES movies(id) ON DELETE CASCADE` |
| `type` | TEXT NOT NULL | `'video'` \| `'article'` \| `'essay'` \| `'review'` (define ícone/cor — `VAULT_META`) |
| `title` | TEXT NOT NULL | título do conteúdo |
| `url` | TEXT | URL real do conteúdo (no protótipo aponta p/ `#`; em produção, link real) |
| `source` | TEXT | domínio exibido (ex.: `youtube.com`, `mubi.com`) — derivável da `url` |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | |

**Índice**: `CREATE INDEX idx_vault_movie ON movie_vault_items (movie_id);`

## Entidade: `movie_people` (elenco/equipe — pessoas locais ao filme)

Direção + elenco + equipe-chave de cada filme. **Local ao domínio Filmes nesta fatia**; `person_id` fica
**reservado** para o link futuro com o hub `people`/`person_links` da fatia **014-pessoas** (o protótipo
marca pessoas que "vão se conectar à base de pessoas em breve"). **Tabela criada agora; UI na Onda US5.**

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | TEXT PK | UUID |
| `movie_id` | TEXT NOT NULL | `REFERENCES movies(id) ON DELETE CASCADE` |
| `name` | TEXT NOT NULL | nome da pessoa (ex.: `Satoshi Kon`) |
| `normalizado` | TEXT NOT NULL | minúsculo + sem acento (fuzzy match e dedup com tags de pessoa) |
| `role` | TEXT | papel no filme (`Direção`, `Roteiro`, `Mima (voz)`, `Fotografia`, …) |
| `is_person_tag` | BOOLEAN DEFAULT FALSE | TRUE se a pessoa também aparece como **etiqueta de pessoa** (ex.: `Satoshi Kon` em `tags`) |
| `person_id` | TEXT | **reservado** — FK futura para `people(id)` da 014 (NULL nesta fatia) |

**Índices**:
- `CREATE INDEX idx_people_movie ON movie_people (movie_id);` — pessoas da página do filme.
- `CREATE INDEX idx_people_norm ON movie_people (normalizado);` — agregação "top pessoas" / dedup.

## Entidade: `movie_favorites` (vitrine de favoritos)

Os 4 (ou menos) filmes em destaque no perfil/Início — **editável e ordenada**. Persistida **no servidor**
(não só `localStorage` como no protótipo) para **paridade de canais** (FR-016). Espelha uma lista fixa
especial.

| Coluna | Tipo | Regra |
|---|---|---|
| `movie_id` | TEXT PK | `REFERENCES movies(id) ON DELETE CASCADE` (1 linha por filme favorito) |
| `position` | INTEGER NOT NULL | ordem na vitrine (0–3) |

**Regra**: `set_favorites([ids ordenados])` substitui o conjunto inteiro (delete-all + insert) numa
transação; a UI permite remover/adicionar (via `FavPicker`, busca entre os `watched`).

---

## Diagrama de relacionamento

```text
            movies (1) ──< diary_entries          (1 filme → N sessões; rewatch)
              │  │
              │  ├──< movie_vault_items            (1 filme → N conteúdos salvos — Cofre)
              │  ├──< movie_people                 (1 filme → N pessoas; person_id → 014 futuro)
              │  └──< movie_favorites              (0..1 — vitrine ordenada do perfil)
              │
              └──< movie_list_items >── movie_lists   (N:N — coleções; UI na Onda US5)

derivados (sem tabela, agregação SQL): HEATMAP (sessões/dia), TAGS (nuvem), HOME, REWIND/STATS

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
    "poster_palette": "teal", "overview": "...", "status": "watched",
    "rating": 4.5, "rating_source": "letterboxd", "liked": true,
    "tags": ["sci-fi","imax","rewatch"],
    "notes": "Reparar no design de som das naves...",   // anotações soltas (≠ review)
    "last_watched_date": "2026-06-11", "times_watched": 2
  },
  "people": [   /* elenco/equipe — movie_people */
    { "name": "Denis Villeneuve", "role": "Direção", "is_person_tag": false, "person_id": null }
  ],
  "vault": [    /* Cofre de conteúdos — movie_vault_items */
    { "id": "uuid", "type": "essay", "title": "A escala de Villeneuve", "source": "mubi.com", "url": "..." }
  ],
  "diary": [    /* sessões, mais recente primeiro */
    { "id": "uuid", "watched_date": "2026-06-11", "rating": 4.5,
      "rewatch": true, "review": "...", "tags": ["imax"] }
  ]
}
```

> `notes`/`tags`/`rating_source` vivem em `movies` (nível-filme); `review`/`tags`/`rating` de cada linha
> de `diary` vivem em `diary_entries` (nível-sessão). `people` e `vault` vêm das tabelas-filhas.

## Estrutura de retorno de `get_stats(year)` / `get_rewind(year)`

`get_stats` é a base; `get_rewind` é o mesmo retorno enriquecido com os destaques do "ano em revista"
(tela **Rewind**). Espelha o IIFE `STATS` de `data.js` (campos `filmsWatched/sessions/rewatches/...`).

```jsonc
{
  "status": "ok",
  "year": 2026,
  "total_films": 42,          // filmes distintos assistidos no ano
  "total_sessions": 47,       // sessões (inclui rewatches)
  "rewatches": 9,             // sessões marcadas rewatch
  "total_minutes": 5230,      // soma de runtime das sessões (≈ horas assistidas)
  "avg_rating": 3.8,          // média das notas do ano (ignora nulos)
  "liked_count": 14,          // filmes curtidos (coração) no ano
  "monthly": [3,4,2, /* ...12 meses... */ 5],   // sessões por mês (jan→dez) — barras do Rewind
  "rating_histogram": { "0.5":0, "1.0":1, /* ... */ "5.0":6 },
  "top_genres":    [ { "genre": "Drama", "count": 18 } ],
  "top_directors": [ { "director": "Denis Villeneuve", "count": 3 } ],
  "top_people":    [ { "name": "Satoshi Kon", "count": 3, "roles": ["Direção"] } ],  // direção+elenco+equipe
  "top_decade":    { "decade": 2000, "count": 12 },
  "max_sessions":  3,         // maior maratona (mais sessões num único dia)
  "favorite":      { "id": "uuid", "title": "Perfect Blue", "rating": 5 }  // destaque do ano
}
```
Cada bloco resolve **vazio sem erro** (lista vazia / zero / `null`) quando não há dados no ano (SC-006).

## Estrutura de retorno de `get_heatmap(year)`

```jsonc
{ "status": "ok", "year": 2026,
  "days": [ { "date": "2026-01-01", "count": 0 }, { "date": "2026-01-02", "count": 2 } ] }
```
Sessões por dia do ano (agregação de `diary_entries` por `watched_date`). Alimenta o **sparkline** do
card "Sessões · 7 dias" (Início) e a grade do **Rewind**. `get_stats`/`get_rewind` derivam `max_sessions`
e "sessões nos últimos N dias" daqui.

## Estrutura de retorno de `get_tags()`

```jsonc
{ "status": "ok",
  "tags": [ { "name": "atuação", "count": 6, "person": false },
            { "name": "Satoshi Kon", "count": 2, "person": true } ] }
```
Nuvem de etiquetas com contagem (agregação de `movies.tags`). `person=true` quando a etiqueta casa com
uma pessoa em `movie_people` (`is_person_tag`) — recebe o glifo de pessoa e, no futuro, link à base 014.

## Estrutura de retorno de `get_favorites()` / `get_home()`

```jsonc
// get_favorites — vitrine ordenada
{ "status": "ok", "favorites": [ { "id": "uuid", "title": "...", "poster_url": "...", "position": 0 } ] }

// get_home — bloco do Início (composto numa chamada)
{ "status": "ok",
  "favorites": [ /* … */ ],
  "recent_activity": [ /* últimas sessões do diário */ ],
  "watchlist_highlight": [ /* filmes 'watchlist' p/ o carrossel */ ],
  "rating_histogram": { "0.5":0, /* ... */ "5.0":6 },   // painel "Notas" (Letterboxd)
  "sessions_7d": 4, "sessions_7d_prev": 2,               // card "Sessões · 7 dias" + variação
  "last_session": { "title": "Perfect Blue", "rating": 5, "watched_date": "2026-06-11" },
  "counts": { "films_watched": 42, "diary": 47, "watchlist": 4 } }
```
`get_home` é uma conveniência: resolve o Início em **uma** ida ao servidor (sem N+1). Cada bloco é
vazio-seguro.

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
