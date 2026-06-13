# Contrato REST — `/api/animes/*`

Router futuro: `webapp/backend/routers/animes.py`, registrado em `webapp/backend/main.py`:
```python
app.include_router(animes_router.router, prefix="/api/animes", tags=["animes"])
```

**Convenções** (idênticas a `routers/books.py` / `routers/movies.py`):
- Toda rota depende de `Depends(require_user)` → sem cookie de sessão válido ⇒ **401**.
- Bodies são modelos **Pydantic** (nunca dict cru); PATCH usa `model_dump(exclude_unset=True)`.
- Mutações (POST/PATCH/DELETE) retornam `{"status": "ok"|"error", ...}` e passam por
  `_check_result` (erro de domínio ⇒ HTTP 400 com `detail` = mensagem).
- Listagens retornam dados direto (sem `_check_result` wrapper).
- O router **importa as tools** de `agents/marin/tools.py` — sem lógica de domínio no router.

---

## `GET /api/animes`

Grid do catálogo completo. → `list_animes(status?, sort?, genre?, search?)`.

**Query params** (todos opcionais):
- `status`: `assistindo` | `completo` | `quero_assistir` | `pausado` | `abandonado`
- `sort`: `updated` (default) | `title` | `score` | `progress` | `added`
- `genre`: string (filtro por gênero exato, ex.: `Fantasy`)
- `search`: string (fuzzy match no `normalizado`)

**Chama**: `tools.list_animes(status, sort, genre, search)`

**200**:
```jsonc
[
  {
    "id": "uuid",
    "mal_id": 52701,
    "title": "Dungeon Meshi",
    "title_english": "Delicious in Dungeon",
    "media_type": "tv",
    "season": "winter 2024",
    "studio": "TRIGGER",
    "episodes_total": 24,
    "episodes_watched": 12,
    "status": "assistindo",
    "airing_status": "finalizado",
    "score": 9.0,
    "poster_url": "https://cdn.myanimelist.net/images/.../l.jpg",
    "genres": ["Adventure", "Comedy", "Fantasy"],
    "updated_at": "2026-06-10T18:35:00+00:00"
  }
]
```

---

## `GET /api/animes/search`

Busca por nome no Jikan (para adicionar novo anime). → `tools.search_anime(query)`.

**Query params**:
- `q` (obrigatório): string de busca

**Chama**: `tools.search_anime(q)` → consulta `GET https://api.jikan.moe/v4/anime?q={q}&limit=5`

**200**:
```jsonc
[
  {
    "mal_id": 52701,
    "title": "Dungeon Meshi",
    "title_english": "Delicious in Dungeon",
    "media_type": "tv",
    "year": 2024,
    "episodes_total": 24,
    "poster_url": "https://cdn.myanimelist.net/images/.../l.jpg",
    "genres": ["Adventure", "Comedy"],
    "airing_status": "finalizado",
    "already_in_catalog": false   // true se mal_id já está em anime(deleted=FALSE)
  }
]
```

---

## `POST /api/animes`

Adiciona anime ao catálogo com metadados do Jikan + AniList + (opcional) TMDB.
→ `tools.add_anime(mal_id?, query?)`.

**Body** (Pydantic):
```jsonc
{
  "mal_id": 52701,          // preferido (bypass da busca)
  "query": "Dungeon Meshi", // alternativo (Jikan busca e usa o primeiro resultado)
  "status": "quero_assistir" // opcional, default 'quero_assistir'
}
```
Pelo menos um de `mal_id` ou `query` é obrigatório.

**Chama**: `tools.add_anime(mal_id, query, status)`

**201**:
```jsonc
{
  "status": "ok",
  "anime": {
    "id": "uuid",
    "mal_id": 52701,
    "title": "Dungeon Meshi",
    "status": "quero_assistir",
    "poster_url": "...",
    "episodes_total": 24
  }
}
```

**400** (anime já no catálogo):
```jsonc
{ "status": "error", "message": "Dungeon Meshi já está no catálogo (id: uuid)" }
```

**400** (query sem resultado):
```jsonc
{ "status": "error", "message": "Nenhum anime encontrado para 'xyzabc'" }
```

---

## `GET /api/animes/{id}`

Detalhe completo: metadados + progresso + próximo ep + histórico de sessões + lista de episódios.
→ `tools.get_anime_details(anime_id=id)`.

**Path params**: `id` (UUID TEXT)

**Chama**: `tools.get_anime_details(id)`

**200** (ver `data-model.md` § "Estrutura de retorno de get_anime_details"):
```jsonc
{
  "status": "ok",
  "anime": { /* AnimeFull */ },
  "next_episode": {
    "number": 13,
    "title": "Dumplings / Broiled in a Pan",
    "aired": "2024-04-04",
    "thumbnail_url": "...",
    "watched": false
  },
  "recent_logs": [
    {
      "id": "uuid", "watched_date": "2026-06-10",
      "ep_start": 10, "ep_end": 12, "episodes_count": 3,
      "rating": 9.5, "notes": "Arco do kraken"
    }
  ],
  "episodes": [
    {
      "number": 1, "title": "A Corpse That Won't Rot",
      "aired": "2024-01-04", "airing_status": "lancado",
      "thumbnail_url": "...", "watched": true, "watched_date": "2026-01-10"
    }
    // ... primeiros 12; "load more" via GET /api/animes/{id}/episodes?page=2
  ]
}
```

**404**: `{ "status": "error", "message": "Anime não encontrado" }`

---

## `PATCH /api/animes/{id}`

Atualiza campos do anime: status, score, notes, tags.
→ `tools.update_anime_status(id, **fields)` ou `tools.rate_anime(id, score)`.

**Path params**: `id` (UUID TEXT)

**Body** (todos opcionais, Pydantic com `exclude_unset`):
```jsonc
{
  "status": "assistindo",          // muda status (watchlist → assistindo, etc.)
  "score": 9.5,                    // nota 0.0–10.0
  "notes": "Melhor anime de 2024", // anotações do anime (nível-anime, não da sessão)
  "tags": ["favorito", "2024"]     // substitui tags completas
}
```

**Chama**: `tools.update_anime(id, **patch_data)`

**200**: `{ "status": "ok", "updated": { "id": "uuid", "status": "assistindo", "score": 9.5 } }`

**400**: `{ "status": "error", "message": "score deve ser entre 0.0 e 10.0" }`

---

## `DELETE /api/animes/{id}`

Soft delete do anime (mantém watch_logs). → `tools.delete_anime(anime_id=id)`.

**Path params**: `id` (UUID TEXT)

**Chama**: `tools.delete_anime(id)` → `UPDATE anime SET deleted=TRUE`

**200**: `{ "status": "ok", "message": "Dungeon Meshi removido do catálogo" }`

**404**: `{ "status": "error", "message": "Anime não encontrado" }`

---

## `POST /api/animes/{id}/log`

Registra sessão de episódios assistidos. → `tools.log_watch(anime_id=id, ...)`.

**Path params**: `id` (UUID TEXT)

**Body** (Pydantic):
```jsonc
{
  "ep_start": 1,               // opcional (pode logar sem saber o número)
  "ep_end": 3,                 // opcional
  "episodes_count": 3,         // obrigatório se ep_start/ep_end ausentes
  "watched_date": "2026-06-13", // opcional, default hoje
  "rating": 9.5,               // opcional 0.0–10.0
  "notes": "Adorei o Senshi"   // opcional
}
```
Pelo menos `episodes_count` OU (`ep_start` + `ep_end`) é obrigatório.

**Chama**: `tools.log_watch(id, ep_start, ep_end, episodes_count, watched_date, rating, notes)`

Efeitos colaterais automáticos:
- `anime.episodes_watched += episodes_count`
- Se `ep_start` e `ep_end`: marcar `episodes.watched=TRUE` para os números no range
- Se primeira sessão: `anime.date_started = watched_date`
- Se `episodes_watched >= episodes_total`: `anime.date_finished = watched_date`, `status = 'completo'`

**201**:
```jsonc
{
  "status": "ok",
  "log": {
    "id": "uuid", "anime_id": "uuid", "anime_title": "Dungeon Meshi",
    "watched_date": "2026-06-13", "ep_start": 1, "ep_end": 3,
    "episodes_count": 3, "rating": 9.5, "notes": "Adorei o Senshi"
  },
  "anime_progress": {
    "episodes_watched": 3, "episodes_total": 24,
    "status": "assistindo"
  }
}
```

**400**: `{ "status": "error", "message": "Informe episodes_count ou ep_start+ep_end" }`

---

## `GET /api/animes/{id}/logs`

Histórico de sessões de um anime específico. → `tools.get_watch_history(anime_id=id)`.

**Path params**: `id` (UUID TEXT)

**Query params**:
- `limit`: int (default 20, max 100)
- `offset`: int (default 0, paginação)

**Chama**: `tools.get_watch_history(anime_id=id, limit=limit, offset=offset)`

**200**:
```jsonc
[
  {
    "id": "uuid",
    "watched_date": "2026-06-10",
    "ep_start": 10, "ep_end": 12,
    "episodes_count": 3,
    "rating": 9.5,
    "notes": "Arco do kraken finalmente",
    "source": "manual",
    "created_at": "2026-06-10T21:00:00+00:00"
  }
]
```

---

## `DELETE /api/animes/logs/{log_id}`

Remove um log de sessão específico. → `tools.delete_watch_log(log_id)`.

**Path params**: `log_id` (UUID TEXT)

**Efeitos colaterais**: `anime.episodes_watched -= episodes_count` do log removido.
Se `anime.status == 'completo'` e remoção deixar `episodes_watched < episodes_total`:
reverter `status` para `'assistindo'`.

**Chama**: `tools.delete_watch_log(log_id)`

**200**: `{ "status": "ok", "message": "Log removido. episodes_watched atualizado para 9." }`

**404**: `{ "status": "error", "message": "Log não encontrado" }`

---

## `GET /api/animes/stats`

Estatísticas agregadas (ano inteiro). → `tools.get_stats(year?)`.

**Query params**:
- `year`: int (default ano atual, ex.: 2026)

**Chama**: `tools.get_stats(year)` → ver `data-model.md` § "Estrutura de retorno de get_stats"

**200**:
```jsonc
{
  "status": "ok",
  "year": 2026,
  "total_animes": 12,
  "total_episodes": 156,
  "total_hours": 65.0,
  "avg_score": 8.3,
  "top_genres": [ { "genre": "Fantasy", "count": 8 } ],
  "top_studios": [ { "studio": "TRIGGER", "count": 3 } ],
  "by_status": {
    "assistindo": 4, "completo": 7,
    "quero_assistir": 10, "pausado": 1, "abandonado": 0
  },
  "monthly": [0, 2, 3, 4, 0, 3, 0, 0, 0, 0, 0, 0]
}
```
Ano vazio → zeros/listas, sem erro (SC-007).

---

## `GET /api/animes/schedule`

Próximos episódios dos animes com status `assistindo`. → `tools.get_airing_schedule(days?)`.

**Query params**:
- `days`: int (default 7, max 30) — janela de dias para frente

**Chama**: `tools.get_airing_schedule(days)` — consulta `episodes` WHERE:
- `airing_status = 'agendado'`
- `aired <= NOW()::DATE + {days} * INTERVAL '1 day'`
- JOIN com `anime WHERE status = 'assistindo' AND deleted = FALSE`

**200** (ver `data-model.md` § "Estrutura de retorno de get_airing_schedule"):
```jsonc
{
  "status": "ok",
  "days": 7,
  "episodes": [
    {
      "anime_id": "uuid",
      "anime_title": "Frieren: Beyond Journey's End",
      "poster_url": "...",
      "episode_number": 28,
      "episode_title": "Retorno ao Passado",
      "aired": "2026-06-15",
      "thumbnail_url": "..."
    }
  ]
}
```

---

## `POST /api/animes/sync-mal`

Trigger do sync delta MAL → catálogo. → `tools.sync_mal()`.

**Body**: vazio (sem params — usa tokens de `mal_sync_state`).

**Chama**: `tools.sync_mal()` → `agents/marin/mal_sync.py:run_sync()`

**200**:
```jsonc
{
  "status": "ok",
  "created": 3,
  "updated": 7,
  "skipped": 45,
  "errors": []
}
```

**400** (sem credenciais):
```jsonc
{
  "status": "error",
  "message": "MAL_CLIENT_ID não configurado. Configure as variáveis de ambiente."
}
```

**400** (token expirado e refresh falhou):
```jsonc
{
  "status": "error",
  "message": "Refresh token inválido. Re-autorize via scripts/authorize_mal.py."
}
```

---

## `GET /api/animes/logs`

Diário global (todas as sessões, todos os animes). Para a tela Diário.
→ `tools.get_watch_history(anime_id=None, limit, offset)`.

**Query params**:
- `limit`: int (default 50, max 200)
- `offset`: int (default 0)
- `anime_id`: UUID TEXT (opcional — filtra por anime)

**Chama**: `tools.get_watch_history(anime_id=anime_id, limit=limit, offset=offset)`

**200**:
```jsonc
[
  {
    "id": "uuid",
    "anime_id": "uuid",
    "anime_title": "Dungeon Meshi",
    "poster_url": "...",
    "watched_date": "2026-06-10",
    "ep_start": 10, "ep_end": 12,
    "episodes_count": 3,
    "rating": 9.5,
    "notes": "..."
  }
]
```

---

## Resumo dos endpoints

| Método | Path | Tool chamada | Descrição |
|--------|------|--------------|-----------|
| GET | `/api/animes` | `list_animes()` | Grid do catálogo (filtros: status, sort, genre, search) |
| GET | `/api/animes/search` | `search_anime()` | Busca no Jikan para adicionar |
| POST | `/api/animes` | `add_anime()` | Adiciona ao catálogo com metadados |
| GET | `/api/animes/{id}` | `get_anime_details()` | Detalhe completo + eps + logs |
| PATCH | `/api/animes/{id}` | `update_anime()` | Atualiza status / score / notes / tags |
| DELETE | `/api/animes/{id}` | `delete_anime()` | Soft delete |
| POST | `/api/animes/{id}/log` | `log_watch()` | Registra sessão de episódios |
| GET | `/api/animes/{id}/logs` | `get_watch_history()` | Histórico de sessões do anime |
| DELETE | `/api/animes/logs/{log_id}` | `delete_watch_log()` | Remove log de sessão |
| GET | `/api/animes/stats` | `get_stats()` | Estatísticas anuais |
| GET | `/api/animes/schedule` | `get_airing_schedule()` | Próximos eps dos "assistindo" |
| POST | `/api/animes/sync-mal` | `sync_mal()` | Trigger delta sync MAL |
| GET | `/api/animes/logs` | `get_watch_history()` | Diário global (todas as sessões) |
