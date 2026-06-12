# Contrato REST — `/api/movies/*`

Router novo `webapp/backend/routers/movies.py`, registrado em `webapp/backend/main.py` com
`app.include_router(movies_router.router, prefix="/api/movies", tags=["movies"])`.

**Convenções** (idênticas a `routers/books.py` / `routers/tasks.py`):
- Toda rota depende de `Depends(require_user)` → sem cookie de sessão válido ⇒ **401** (FR-007, SC-008).
- Bodies são modelos **Pydantic** (nunca dict cru); PATCH usa `model_dump(exclude_unset=True)`.
- Mutações (POST/PATCH/DELETE) retornam `{"status": "ok"|"error", ...}` e passam por `_check_result`
  (erro de domínio ⇒ **HTTP 400** com `detail` = mensagem). Listagens retornam dados direto (sem `_check_result`).
- O router **importa as tools** de `agents/akane/tools.py` — sem lógica de domínio no router.

---

## `GET /api/movies/`

Grid de filmes. → `list_movies(status?, sort?, genre?)`. Query params opcionais: `status`
(`watched`|`watchlist`), `sort` (`recent`|`rating`|`title`), `genre`.

**200**:
```jsonc
[
  { "id": "uuid", "title": "Dune", "year": 2021, "poster_url": "...",
    "status": "watched", "rating": 4.5, "liked": true, "times_watched": 2,
    "last_watched_date": "2026-06-11" }
]
```

## `GET /api/movies/watchlist`

Filmes `status='watchlist'`. → `get_watchlist()`. **200**: lista de filmes (mesmo shape do grid).

## `GET /api/movies/diary`

Sessões em ordem cronológica decrescente. → `get_diary(limit?)`. Query: `limit` (default 50).

**200**:
```jsonc
[
  { "id": "uuid", "movie_id": "uuid", "movie_title": "Dune",
    "poster_url": "...", "watched_date": "2026-06-11", "rating": 4.5,
    "rewatch": true, "review": "...", "tags": ["imax"] }
]
```

## `GET /api/movies/stats`

Estatísticas do ano. → `get_stats(year?)`. Query: `year` (default ano atual).

**200**: estrutura de `get_stats` (ver `data-model.md`): `total_films`, `total_sessions`, `avg_rating`,
`top_genres`, `top_directors`, `rating_histogram` — vazio sem erro quando não há dados (SC-006).

## `GET /api/movies/tmdb/search`

Busca no TMDB (para os modais). → `search_movie(q)`. Query: `q` (obrigatório). **Não** grava nada.

**200**:
```jsonc
[
  { "tmdb_id": 438631, "title": "Dune", "year": 2021,
    "poster_url": "...", "director": ["Denis Villeneuve"] }
]
```

## `GET /api/movies/{id}`

Detalhe completo + histórico de sessões (a página do filme). → `get_movie_detail(id)`.

**200**: estrutura de `get_movie_detail` (ver `data-model.md`): `movie` + `diary` (sessões).
**404**: filme inexistente ou excluído.

## `POST /api/movies/`  `201`

Adiciona filme (watchlist ou já watched). → `add_movie(**body)`.

**Body** (`AddMovieBody`): `title` (obrigatório) **ou** `tmdb_id`; `status?` (default `watchlist`),
`year?`, `letterboxd_uri?`.
**201**: `{ "status": "ok", "id": "uuid", "message": "..." }`. **400**: filme já existe (dedup).

## `POST /api/movies/{id}/watch`  `201`

Loga uma sessão (vez assistida). → `log_watch(id, **body)`.

**Body** (`LogWatchBody`): `watched_date?` (`YYYY-MM-DD`, default hoje), `rating?` (0.5–5.0),
`review?`, `tags?` (lista), `rewatch?` (default: inferido por `times_watched`).
**201**: `{ "status": "ok", "diary_id": "uuid", ... }`. **400**: `rating` fora de [0.5,5.0].

## `PATCH /api/movies/{id}/rating`

Define a nota "atual"/favorita do filme. → `rate_movie(id, rating)`.

**Body** (`RateBody`): `rating` (0.5–5.0). **200**: `{ "status": "ok", ... }`. **400**: nota inválida.

## `PATCH /api/movies/{id}/like`

Marca/desmarca "coração". → `set_like(id, liked)`.

**Body** (`LikeBody`): `liked` (bool). **200**: `{ "status": "ok", ... }`.

## `PATCH /api/movies/{id}/status`

Move entre watchlist/watched. → `update_movie_status(id, status)`.

**Body** (`StatusBody`): `status` (`watchlist`|`watched`). **200**: `{ "status": "ok", ... }`.

## `DELETE /api/movies/{id}`

Soft delete. → `delete_movie(id)`. **200**: `{ "status": "ok", ... }`. Some do grid; `diary_entries`
permanecem (histórico).

## `DELETE /api/movies/diary/{diary_id}`

Remove uma sessão do diário. → `delete_diary_entry(diary_id)`. **200**: `{ "status": "ok", ... }`.
Recalcula `times_watched`/`last_watched_date` do filme.

## `POST /api/movies/sync-letterboxd`  `202`

Dispara o sync do RSS sob demanda ("Sincronizar agora"). → `run_sync()` (mesma função do
`scripts/sync_letterboxd.py`).

**200/202**: `{ "status": "ok", "created": 5, "updated": 12, "skipped": 30, "errors": [] }`.

---

## Tabela-resumo

| Método | Rota | Tool | Sucesso | Auth |
|---|---|---|---|---|
| GET | `/api/movies/` | `list_movies` | 200 lista | require_user |
| GET | `/api/movies/watchlist` | `get_watchlist` | 200 lista | require_user |
| GET | `/api/movies/diary` | `get_diary` | 200 lista | require_user |
| GET | `/api/movies/stats` | `get_stats` | 200 | require_user |
| GET | `/api/movies/tmdb/search` | `search_movie` | 200 lista | require_user |
| GET | `/api/movies/{id}` | `get_movie_detail` | 200 | require_user |
| POST | `/api/movies/` | `add_movie` | 201 | require_user |
| POST | `/api/movies/{id}/watch` | `log_watch` | 201 | require_user |
| PATCH | `/api/movies/{id}/rating` | `rate_movie` | 200 | require_user |
| PATCH | `/api/movies/{id}/like` | `set_like` | 200 | require_user |
| PATCH | `/api/movies/{id}/status` | `update_movie_status` | 200 | require_user |
| DELETE | `/api/movies/{id}` | `delete_movie` | 200 | require_user |
| DELETE | `/api/movies/diary/{diary_id}` | `delete_diary_entry` | 200 | require_user |
| POST | `/api/movies/sync-letterboxd` | `run_sync` | 200 | require_user |

> **Nota de roteamento FastAPI**: declarar as rotas estáticas (`/watchlist`, `/diary`, `/stats`,
> `/tmdb/search`, `/sync-letterboxd`, `/diary/{diary_id}`) **antes** da rota dinâmica `/{id}` para que
> não sejam capturadas por ela.
