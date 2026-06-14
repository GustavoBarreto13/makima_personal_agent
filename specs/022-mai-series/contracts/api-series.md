# Contrato REST — `/api/series/*`

Router FastAPI **futuro** (`webapp/backend/routers/series.py`), registrado em `main.py` com:
```python
app.include_router(series_router.router, prefix="/api/series", tags=["series"])
```

Toda rota exige `user: dict = Depends(require_user)` (cookie de sessão). Lógica de domínio vive
em `agents/mai/tools.py`; o router é fachada fina. Erros retornam `{"detail": "..."}` via `_check_result`.
Rotas fixas declaradas **antes** de `/{series_id}` para evitar captura pelo parâmetro dinâmico.

---

## `GET /api/series`

Lista o catálogo com filtros e ordenação.

**Query params**:
| Param | Tipo | Default | Descrição |
|---|---|---|---|
| `status` | string | — | Filtrar por status do usuário |
| `genre` | string | — | Filtrar por gênero |
| `tag` | string | — | Filtrar por tag |
| `sort` | string | `recent` | `recent` \| `updated` \| `rating` \| `title` \| `progress` |
| `limit` | int | 100 | Máximo de resultados |

**Response 200**:
```jsonc
{
  "series": [
    {
      "id": "uuid", "tmdb_id": 95396, "title": "Severance",
      "network": "Apple TV+", "status": "assistindo",
      "series_status": "no_ar", "rating": 4.5,
      "poster_url": "...", "episodes_watched": 9, "episodes_count": 19,
      "genres": ["Drama"], "tags": ["favorita"]
    }
  ],
  "total": 12
}
```

---

## `GET /api/series/watchlist`

Atalho: `GET /api/series?status=quero_assistir`. Retorna shape idêntico.

---

## `GET /api/series/diary`

Lista todos os logs de sessão em ordem cronológica decrescente.

**Query params**: `limit` (default 50), `series_id` (opcional, filtrar por série).

**Response 200**:
```jsonc
{
  "logs": [
    {
      "id": "uuid", "series_id": "uuid", "series_title": "Severance",
      "watched_date": "2026-06-10", "season_number": 1,
      "ep_start": 7, "ep_end": 9, "episodes_count": 3,
      "rating": 5.0, "review": "Finale arrasador.",
      "poster_url": "..."
    }
  ]
}
```

---

## `GET /api/series/upcoming`

Próximos episódios de séries `status='assistindo'` nos próximos N dias.

**Query params**: `days` (default 14).

**Response 200**:
```jsonc
{
  "days": 14,
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

---

## `GET /api/series/stats`

Estatísticas do catálogo do usuário, opcionalmente filtradas por ano.

**Query params**: `year` (int, default = ano atual).

**Response 200**:
```jsonc
{
  "year": 2026,
  "total_series": 8, "total_episodes": 94,
  "total_hours": 78.3, "avg_rating": 4.1,
  "top_genres": [{"genre": "Drama", "count": 5}],
  "top_networks": [{"network": "Apple TV+", "count": 2}],
  "by_status": {"assistindo": 3, "concluida": 4, "quero_assistir": 10, "pausada": 1, "abandonada": 0},
  "monthly": [0, 10, 12, 15, 8, 18, 0, 0, 0, 0, 0, 0]
}
```

Nunca retorna erro com dados vazios — zeros/listas vazias (SC-005).

---

## `GET /api/series/search`

Busca no TMDB (não no catálogo local). Retorna candidatos para adição.

**Query params**: `q` (string, obrigatório), `year` (int, opcional).

**Response 200**:
```jsonc
{
  "results": [
    {
      "tmdb_id": 95396, "title": "Severance",
      "first_air_date": "2022-02-18", "network": "Apple TV+",
      "poster_url": "...", "overview": "...",
      "in_catalog": false
    }
  ]
}
```

`in_catalog: true` quando `tmdb_id` já existe em `series` — evitar duplicata na UI.

---

## `POST /api/series` `201`

Adiciona uma série ao catálogo (cria na tabela `series`).

**Body**:
```jsonc
{
  "title": "Severance",       // obrigatório se tmdb_id ausente
  "tmdb_id": 95396,           // preferencial — enriquece metadados automaticamente
  "status": "quero_assistir", // default
  "year": 2022                // opcional — ajuda na busca TMDB quando title é ambíguo
}
```

**Response 201**:
```jsonc
{
  "status": "ok",
  "series": { "id": "uuid", "title": "Severance", "tmdb_id": 95396, "poster_url": "...", ... }
}
```

---

## `GET /api/series/{series_id}`

Detalhe completo: série + temporadas (com `watched_count` por temporada) + próximo episódio + logs recentes.

**Response 200**: ver "Estrutura de retorno de `get_series_detail`" em `data-model.md`.

**Response 404** quando `series_id` não encontrado ou `deleted=TRUE`.

---

## `POST /api/series/{series_id}/log` `201`

Loga uma sessão de assistência.

**Body**:
```jsonc
{
  "watched_date": "2026-06-13",  // default = hoje
  "season_number": 1,            // opcional
  "ep_start": 1,                 // opcional
  "ep_end": 3,                   // opcional
  "episodes_count": 3,           // calculado se ep_start/ep_end fornecidos
  "rating": 4.5,                 // opcional, 0.5–5.0
  "review": "Abertura devastadora." // opcional
}
```

**Response 201**:
```jsonc
{
  "status": "ok",
  "log": { "id": "uuid", "watched_date": "2026-06-13", "episodes_count": 3, ... },
  "series": { "id": "uuid", "episodes_watched": 3, "status": "assistindo", ... }
}
```

---

## `PATCH /api/series/{series_id}/status`

Atualiza o status do usuário.

**Body**: `{ "status": "assistindo" }`

**Response 200**: `{ "status": "ok", "series": { "id": "...", "status": "assistindo" } }`

---

## `PATCH /api/series/{series_id}/rating`

Avalia a série.

**Body**: `{ "rating": 4.5 }`

**Response 200**: `{ "status": "ok", "series": { "id": "...", "rating": 4.5, "rating_source": "own" } }`

---

## `PATCH /api/series/{series_id}/notes`

Edita as anotações da série.

**Body**: `{ "notes": "Roteiro cirúrgico, performance do Edie Falco impecável." }`

**Response 200**: `{ "status": "ok", "series": { "id": "...", "notes": "..." } }`

---

## `POST /api/series/{series_id}/sync-metadata` `202`

Dispara enriquecimento TMDB da série (seasons + episodes). Síncrono nesta fatia (retorna quando
terminar); pode ser tornado assíncrono no futuro.

**Response 202**:
```jsonc
{
  "status": "ok", "series_title": "Severance",
  "seasons_upserted": 2, "episodes_created": 3,
  "episodes_updated": 6, "episodes_skipped": 10, "errors": []
}
```

---

## `DELETE /api/series/{series_id}` `200`

Soft delete da série (`deleted=TRUE`). `watch_logs` permanecem.

**Response 200**: `{ "status": "ok", "deleted": "uuid" }`

---

## `DELETE /api/series/{series_id}/logs/{log_id}` `200`

Remove um log de sessão específico. `series.episodes_watched` é recalculado.

**Response 200**: `{ "status": "ok", "deleted": "uuid", "series": { "episodes_watched": N } }`

---

## `GET /api/series/{series_id}/seasons/{season_number}/episodes`

Lista episódios de uma temporada específica com status `watched`.

**Response 200**:
```jsonc
{
  "season_number": 1,
  "episodes": [
    {
      "episode_number": 1, "title": "Goodnight, Macrodata Refinement",
      "air_date": "2022-02-18", "still_url": "...", "airing_status": "lancado",
      "watched": true, "watched_date": "2026-01-15"
    }
  ]
}
```

**Note**: este endpoint é opcional para a fatia atual — o front-end pode receber episódios
inline em `GET /{series_id}`. Incluído aqui para o acordo de dados da tela de detalhe.

---

## Tabela-resumo

| Método | Endpoint | Status | Descrição |
|---|---|---|---|
| GET | `/api/series` | 200 | Listar catálogo com filtros |
| GET | `/api/series/watchlist` | 200 | Atalho para `status=quero_assistir` |
| GET | `/api/series/diary` | 200 | Logs de sessão cronológicos |
| GET | `/api/series/upcoming` | 200 | Próximos episódios de séries assistindo |
| GET | `/api/series/stats` | 200 | Estatísticas anuais |
| GET | `/api/series/search` | 200 | Busca no TMDB (não no catálogo) |
| POST | `/api/series` | 201 | Adicionar série ao catálogo |
| GET | `/api/series/{id}` | 200/404 | Detalhe completo |
| POST | `/api/series/{id}/log` | 201 | Logar sessão de episódios |
| PATCH | `/api/series/{id}/status` | 200 | Atualizar status do usuário |
| PATCH | `/api/series/{id}/rating` | 200 | Avaliar série |
| PATCH | `/api/series/{id}/notes` | 200 | Editar anotações |
| POST | `/api/series/{id}/sync-metadata` | 202 | Enriquecer via TMDB |
| DELETE | `/api/series/{id}` | 200 | Soft delete da série |
| DELETE | `/api/series/{id}/logs/{log_id}` | 200 | Remover log de sessão |
| GET | `/api/series/{id}/seasons/{n}/episodes` | 200 | Episódios de uma temporada |

**Nota de ordenação no router**: rotas fixas (`/watchlist`, `/diary`, `/upcoming`, `/stats`, `/search`)
DEVEM ser declaradas ANTES de `/{series_id}` para evitar que o FastAPI interprete strings literais
como IDs dinâmicos. Padrão idêntico ao `movies.py` da Akane.
