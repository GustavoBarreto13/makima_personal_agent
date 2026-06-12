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

Grid de filmes. → `list_movies(status?, sort?, genre?, tag?, filter?)`. Query params opcionais: `status`
(`watched`|`watchlist`), `sort` (`recent`|`rating`|`title`|`director`|`year`|`runtime`), `genre`, `tag`
(modo "tela de etiqueta"), `filter` (chips do grid: `all`|`watched`|`liked`|`watchlist`|`rated`).

**200**:
```jsonc
[
  { "id": "uuid", "title": "Dune", "year": 2021, "poster_url": "...", "poster_palette": "teal",
    "status": "watched", "rating": 4.5, "rating_source": "letterboxd", "liked": true,
    "tags": ["sci-fi","imax"], "times_watched": 2, "last_watched_date": "2026-06-11" }
]
```
> `poster_palette` é a paleta do **pôster tipográfico de fallback** (usada pelo front quando `poster_url`
> é NULL — SC-005). `rating_source` alimenta o selo "via Letterboxd".

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

## `GET /api/movies/home`  *(Onda US4)*

Bloco do **Início** numa só ida ao servidor. → `get_home()`. Sem query.
**200**: estrutura de `get_home` (ver `data-model.md`): `favorites`, `recent_activity`,
`watchlist_highlight`, `rating_histogram`, `sessions_7d`(+`_prev`), `last_session`, `counts`.

## `GET /api/movies/rewind`  *(Onda US4)*

Year-in-review. → `get_rewind(year?)`. Query: `year` (default ano atual).
**200**: `get_stats` **enriquecido** (ver `data-model.md`): `rewatches`, `total_minutes`, `monthly[12]`,
`top_people`, `top_decade`, `max_sessions`, `favorite`, `liked_count`. Ano vazio → zeros/listas sem erro.

## `GET /api/movies/heatmap`  *(Onda US4)*

Sessões por dia do ano. → `get_heatmap(year?)`. Query: `year` (default atual).
**200**: `{ "year": 2026, "days": [ { "date": "...", "count": 0 } ] }`.

## `GET /api/movies/tags`  *(Onda US5)*

Nuvem de etiquetas. → `get_tags()`.
**200**: `{ "tags": [ { "name": "atuação", "count": 6, "person": false } ] }`. Filtrar o grid por uma tag
usa `GET /api/movies/?tag=<nome>`.

## `GET /api/movies/favorites`  ·  `PUT /api/movies/favorites`  *(Onda US4)*

Vitrine de favoritos (servidor, paridade de canais). `GET` → `get_favorites()` (lista ordenada).
`PUT` → `set_favorites(ids)` substitui o conjunto inteiro.
**Body** (`FavoritesBody`): `{ "ids": ["uuid", ...] }` (≤ 4, ordem = posição).
**200**: `{ "status": "ok", "favorites": [ ... ] }`. **400**: id inexistente / não-`watched`.

## `GET /api/movies/people`  *(Onda US5)*

Top pessoas (direção + elenco + equipe). → `get_top_people(limit?)`.
**200**: `[ { "name": "Satoshi Kon", "count": 3, "roles": ["Direção"] } ]`. (As pessoas de **um** filme
vêm em `GET /api/movies/{id}` › `people[]`.)

## `GET /api/movies/{id}/vault`  ·  `POST /api/movies/{id}/vault`  ·  `DELETE /api/movies/vault/{vault_id}`  *(Onda US5)*

Cofre de conteúdos do filme. `GET` → `get_vault(id)`; `POST` → `add_vault_item(id, **body)`;
`DELETE` → `delete_vault_item(vault_id)`.
**Body** (`VaultItemBody`): `type` (`video`|`article`|`essay`|`review`), `title`, `url?`, `source?`.
**200/201**: `{ "status": "ok", ... }`.

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

**200**: estrutura de `get_movie_detail` (ver `data-model.md`): `movie` (inclui `notes`, `rating_source`,
`tags`, `poster_palette`) + `people[]` (elenco/equipe) + `vault[]` (Cofre) + `diary[]` (sessões).
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
> Logar manualmente grava `movies.rating_source = 'own'` (o selo "via Letterboxd" só aparece quando a nota
> veio do RSS/CSV, `rating_source = 'letterboxd'`).

## `PATCH /api/movies/{id}/rating`

Define a nota "atual"/favorita do filme. → `rate_movie(id, rating)`. Grava `rating_source = 'own'`.

**Body** (`RateBody`): `rating` (0.5–5.0). **200**: `{ "status": "ok", ... }`. **400**: nota inválida.

## `PATCH /api/movies/{id}/like`

Marca/desmarca "coração". → `set_like(id, liked)`.

**Body** (`LikeBody`): `liked` (bool). **200**: `{ "status": "ok", ... }`.

## `PATCH /api/movies/{id}/status`

Move entre watchlist/watched. → `update_movie_status(id, status)`.

**Body** (`StatusBody`): `status` (`watchlist`|`watched`). **200**: `{ "status": "ok", ... }`.

## `PATCH /api/movies/{id}/notes`  *(Onda US5)*

Define as **anotações soltas** do filme (≠ review da sessão). → `set_notes(id, notes)`.

**Body** (`NotesBody`): `notes` (TEXT, pode ser vazio p/ limpar). **200**: `{ "status": "ok", ... }`.

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
| GET | `/api/movies/home` | `get_home` | 200 | require_user |
| GET | `/api/movies/rewind` | `get_rewind` | 200 | require_user |
| GET | `/api/movies/heatmap` | `get_heatmap` | 200 | require_user |
| GET | `/api/movies/tags` | `get_tags` | 200 lista | require_user |
| GET | `/api/movies/favorites` | `get_favorites` | 200 lista | require_user |
| PUT | `/api/movies/favorites` | `set_favorites` | 200 | require_user |
| GET | `/api/movies/people` | `get_top_people` | 200 lista | require_user |
| GET | `/api/movies/tmdb/search` | `search_movie` | 200 lista | require_user |
| GET | `/api/movies/{id}` | `get_movie_detail` | 200 | require_user |
| GET | `/api/movies/{id}/vault` | `get_vault` | 200 lista | require_user |
| POST | `/api/movies/` | `add_movie` | 201 | require_user |
| POST | `/api/movies/{id}/watch` | `log_watch` | 201 | require_user |
| POST | `/api/movies/{id}/vault` | `add_vault_item` | 201 | require_user |
| PATCH | `/api/movies/{id}/rating` | `rate_movie` | 200 | require_user |
| PATCH | `/api/movies/{id}/like` | `set_like` | 200 | require_user |
| PATCH | `/api/movies/{id}/status` | `update_movie_status` | 200 | require_user |
| PATCH | `/api/movies/{id}/notes` | `set_notes` | 200 | require_user |
| DELETE | `/api/movies/{id}` | `delete_movie` | 200 | require_user |
| DELETE | `/api/movies/diary/{diary_id}` | `delete_diary_entry` | 200 | require_user |
| DELETE | `/api/movies/vault/{vault_id}` | `delete_vault_item` | 200 | require_user |
| POST | `/api/movies/sync-letterboxd` | `run_sync` | 200 | require_user |

> **Listas** (`movie_lists`/`movie_list_items`) ganham endpoints (`GET/POST/PATCH/DELETE
> /api/movies/lists*`) na **Onda US5**, quando a UI de Listas é construída — documentados lá.

> **Nota de roteamento FastAPI**: declarar as rotas estáticas (`/watchlist`, `/diary`, `/stats`, `/home`,
> `/rewind`, `/heatmap`, `/tags`, `/favorites`, `/people`, `/tmdb/search`, `/sync-letterboxd`,
> `/diary/{diary_id}`, `/vault/{vault_id}`) **antes** da rota dinâmica `/{id}` (e `/{id}/...`) para que
> não sejam capturadas por ela.

> **Tweaks são client-only**: tema (claro/escuro), cor de acento (rosa/teal/carmim/âmbar), densidade,
> estilo do pôster (tipográfico/minimal) e ordenação padrão são preferências de UI persistidas em
> `localStorage` — **não** têm endpoint. Os **favoritos**, ao contrário, são persistidos no servidor
> (paridade de canais), não no `localStorage`.
