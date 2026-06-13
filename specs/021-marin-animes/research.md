# Phase 0 — Research: Animes (021-marin-animes)

Consolidação das APIs externas, decisões técnicas e notas de migração (os scripts originais em
`n8n-python-scripts/anime_sync` e `n8n-python-scripts/mal_sync` usavam **Notion** como sink;
aqui o sink é **PostgreSQL**). Cada seção: **decisão · endpoints · auth · rate limits · quirks**.

---

## R1 — MAL (MyAnimeList API v2) — sync do catálogo pessoal

### Auth: OAuth2 PKCE

**Por que PKCE**: MAL v2 usa Authorization Code com PKCE (sem client_secret no fluxo de
autorização, mas o `client_secret` é necessário no token endpoint). O `code_verifier` (43–128
chars aleatórios URL-safe) é gerado localmente; o `code_challenge = base64url(SHA256(verifier))`.

**Fluxo de autorização** (uma vez, via `scripts/authorize_mal.py`):
```
GET https://myanimelist.net/v1/oauth2/authorize
  ?response_type=code
  &client_id={MAL_CLIENT_ID}
  &code_challenge={challenge}
  &code_challenge_method=S256
  &state={random}
```
O usuário abre a URL, autoriza, copia o `code` do redirect. O script troca:
```
POST https://myanimelist.net/v1/oauth2/token
  client_id, client_secret, code, code_verifier, grant_type=authorization_code, redirect_uri
```
Retorna: `access_token`, `refresh_token`, `expires_in` (em segundos, tipicamente 3600).

**Rotação de refresh_token** (CRÍTICO):
```
POST https://myanimelist.net/v1/oauth2/token
  grant_type=refresh_token
  refresh_token={current_refresh_token}
  client_id, client_secret
```
O MAL **rotaciona o `refresh_token` a cada refresh** — o token novo é diferente do anterior. O
token antigo é invalidado. Se não salvar o novo token imediatamente, perde o acesso.

**Onde persistir**: tabela `mal_sync_state` (PostgreSQL), via UPDATE. **Jamais em arquivo** —
arquivos no container Dokploy não sobrevivem a redeploy. O script original usava
`mal_sync/.last_sync.json` (inadequado para produção aqui).

**Env vars**:
- `MAL_CLIENT_ID` — obrigatório
- `MAL_CLIENT_SECRET` — obrigatório
- (Tokens ficam em `mal_sync_state`, não em env vars de longa duração)

### Endpoint: animelist do usuário

```
GET https://api.myanimelist.net/v2/users/@me/animelist
  fields=list_status{score,num_episodes_watched,status,updated_at}
  nsfw=true
  limit=100
  sort=list_updated_at
  offset={paginação}
Authorization: Bearer {access_token}
```

Resposta:
```json
{
  "data": [
    {
      "node": { "id": 52701, "title": "Dungeon Meshi" },
      "list_status": {
        "status": "watching",
        "score": 9,
        "num_episodes_watched": 5,
        "updated_at": "2026-06-10T18:30:00+00:00"
      }
    }
  ],
  "paging": { "next": "https://..." }
}
```

Paginar até `"next"` ausente. Delta sync: filtrar `updated_at > last_sync_at`.

### Mapeamento de status MAL → PT-BR

| MAL (API)       | PT-BR (nosso) | Descrição           |
|-----------------|---------------|---------------------|
| `watching`      | `assistindo`  | Assistindo          |
| `completed`     | `completo`    | Terminado           |
| `plan_to_watch` | `quero_assistir` | Watchlist         |
| `on_hold`       | `pausado`     | Pausado             |
| `dropped`       | `abandonado`  | Abandonado          |

Mapeamento reverso (PT-BR → MAL) para display; sync reverso **fora de escopo** nesta fatia.

### Retry/backoff MAL

Não tem delay recomendado público, mas 429s ocorrem. Usar o HTTP helper padrão:
MAX_RETRIES=3, RETRY_BACKOFF=2.0 (exponencial). O access_token expira em ~1h — verificar
`expires_at` antes de cada chamada e fazer refresh se necessário.

---

## R2 — Jikan (wrapper público da MAL API, sem auth)

**Base URL**: `https://api.jikan.moe/v4`

**Por que Jikan**: a MAL API pública não expõe todos os campos de metadados (gêneros, estúdio,
sinopse completa) sem escopo admin. O Jikan é um wrapper público que não requer auth e expõe
todos esses campos.

### Endpoints principais

**Metadados completos do anime**:
```
GET /anime/{mal_id}/full
```
Resposta (campos relevantes):
```json
{
  "data": {
    "mal_id": 52701,
    "title": "Dungeon Meshi",
    "title_english": "Delicious in Dungeon",
    "title_japanese": "ダンジョン飯",
    "type": "TV",
    "episodes": 24,
    "status": "Finished Airing",
    "season": "winter",
    "year": 2024,
    "studios": [{ "name": "TRIGGER" }],
    "genres": [{ "name": "Adventure" }, { "name": "Comedy" }],
    "images": {
      "jpg": {
        "image_url": "https://cdn.myanimelist.net/images/anime/1/.../l.jpg",
        "large_image_url": "https://cdn.myanimelist.net/images/anime/1/.../l.jpg"
      }
    },
    "synopsis": "..."
  }
}
```

**`type` → `media_type`** (nosso enum):

| Jikan `type` | Nosso `media_type` |
|--------------|---------------------|
| `TV`         | `tv`                |
| `Movie`      | `movie`             |
| `OVA`        | `ova`               |
| `Special`    | `special`           |
| `ONA`        | `ona`               |
| `Music`      | (ignorado)          |

**`status` do Jikan → `airing_status`** (nosso enum):

| Jikan `status`      | Nosso `airing_status` |
|---------------------|-----------------------|
| `Currently Airing`  | `no_ar`               |
| `Finished Airing`   | `finalizado`          |
| `Not yet aired`     | `nao_lancado`         |

**Temporada** (nosso `season`): construído como `"{season} {year}"` → `"winter 2024"`.

**Episódios (paginado)**:
```
GET /anime/{mal_id}/episodes?page=1
GET /anime/{mal_id}/episodes?page=2
... até pagination.has_next_page == false
```
Resposta por episódio:
```json
{
  "data": [
    {
      "mal_id": 1,
      "title": "A Corpse That Won't Rot",
      "aired": "2024-01-04T00:00:00+00:00",
      "filler": false,
      "recap": false,
      "synopsis": "..."  // às vezes ausente
    }
  ],
  "pagination": { "has_next_page": true, "last_visible_page": 3 }
}
```

**Quirks do Jikan**:
- `aired` pode ser null para episódios futuros não agendados.
- `synopsis` pode ser null ou vazio — guardar None.
- `synopsis` deve ser truncado a 2000 chars (limite que o Notion impunha; mantemos por higiene).
- Rate limit oficial: ~3 req/s (~0.83 real com delay 1.2s). 429s ocasionais → retry.
- Delay entre chamadas: **1.2s** (JIKAN_DELAY).

### Busca de animes (para `search_anime`)

```
GET /anime?q={query}&limit=5
```
Retorna lista de candidatos com `mal_id`, `title`, `title_english`, `type`, `year`, `images`.
Usar para o `add_anime(query)` quando o usuário não passa `mal_id`.

---

## R3 — AniList (GraphQL, sem auth)

**URL**: `https://graphql.anilist.co`
**Método**: POST com `Content-Type: application/json`
**Auth**: nenhuma (público)
**Rate limit**: 90 req/min (~1.5 req/s) — delay **0.8s** (ANILIST_DELAY).

### Query: banner + schedule de episódios

```graphql
query ($malId: Int) {
  Media(idMal: $malId, type: ANIME) {
    bannerImage
    airingSchedule(perPage: 100) {
      nodes {
        episode
        airingAt
      }
    }
  }
}
```

`bannerImage`: URL da imagem de banner de alta qualidade (tipicamente 1900×400px). Usar como
`anime.banner_url`. Melhor qualidade que o Jikan/MAL.

`airingSchedule.nodes`: episódios futuros com timestamp Unix (`airingAt`). Converter para DATE:
`datetime.fromtimestamp(airingAt, tz=timezone.utc).date().isoformat()`. Persistir em
`episodes.aired` (como DATE, sem timezone — igual ao campo `aired` do Jikan).

**Quirks da AniList**:
- Para animes finalizados, `airingSchedule` pode estar vazio — normal.
- Para animes em exibição, `airingSchedule` cobre os próximos ~N episódios.
- A query aceita `idMal` (MAL ID) diretamente — não precisa de ID próprio da AniList.
- Rate limit é por IP, não por token; erros 429 ocasionais → retry.

---

## R4 — ARM (MAL → TMDB Bridge, sem auth)

**URL**: `https://arm.haglund.dev/api/v2/ids?source=myanimelist&id={mal_id}`
**Método**: GET
**Auth**: nenhuma (público)
**Delay**: 0.5s (ARM_DELAY)

Resposta:
```json
{ "myanimelist": 52701, "tmdb": 227765, "type": "tv" }
```
ou:
```json
{ "myanimelist": 21, "tmdb": null, "type": null }
```

Quando `tmdb` é `null`: `anime.tmdb_id` fica NULL; thumbnails de episódio são pulados.
`"type"` pode ser `"tv"` ou `"movie"` — usado para decidir qual endpoint TMDB consultar.

**Por que ARM**: o TMDB não tem IDs do MAL; a ARM é o mapeamento canônico da comunidade de
ferramentas de anime (usada pelo Taiga, MAL-Sync, etc.).

---

## R5 — TMDB (thumbnails de episódio, opcional)

**Base URL**: `https://api.themoviedb.org/3`
**Imagens**: `https://image.tmdb.org/t/p/w780{still_path}` (still de episódio)
**Auth**: detecção automática:
- `len(TMDB_TOKEN) == 32` → v3 key: `?api_key={token}`
- caso contrário → v4 Bearer: `Authorization: Bearer {token}`
**Rate limit**: 40 req/10s (~4 req/s) — delay **0.3s** (TMDB_DELAY)
**Env var**: `TMDB_TOKEN` (opcional — sem ele, thumbnails ficam NULL, sem erro)

### Endpoints usados

**Thumbnail de episódio (série TV)**:
```
GET /tv/{tmdb_id}/season/1/episode/{number}/images
```
Retorna `stills: [{ "file_path": "/abc.jpg", "width": 1920 }]`. Usar o primeiro still.

**Pôster do anime (alternativa ao Jikan)**:
```
GET /tv/{tmdb_id}?append_to_response=images
GET /movie/{tmdb_id}?append_to_response=images  (para media_type='movie')
```
Pôster: `https://image.tmdb.org/t/p/w500{poster_path}`. Usar quando Jikan não tem pôster.

**Quirks do TMDB**:
- Thumbnails de episódio podem não existir para animes (stills vazios) — retornar None.
- `tmdb_id` pode ser `null` para animes que não estão no TMDB — ARM já sinaliza isso.
- Sempre usar o pôster do Jikan como primário; TMDB é fallback/complemento.

---

## R6 — Blacklist de MAL IDs

Animes com episódios demais que travem o rate limit do Jikan:
```python
BLACKLIST_MAL_IDS: set[int] = {21}  # One Piece — 1100+ episódios
```
Comportamento: atualiza metadados gerais (`/anime/{mal_id}/full`) normalmente; pula o sync de
`episodes` (não faz as chamadas paginadas `/episodes`). O anime fica no catálogo, mas sem cache
de episódios.

A blacklist pode crescer com outros animes longos (Dragon Ball, Naruto, etc.) conforme necessário.

---

## R7 — HTTP Helper e retry

Todos os módulos (`metadata.py`, `mal_auth.py`, `mal_sync.py`) usam um helper centralizado:

```python
def http_request(method, url, *, headers=None, params=None, json_body=None, timeout=30):
    """Retry com backoff exponencial. 404 → None. Outros 4xx → loga body → None."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.request(method, url, headers=headers, params=params,
                                    json=json_body, timeout=timeout)
            if resp.status_code == 429:
                wait = RETRY_BACKOFF * (2 ** (attempt - 1))
                time.sleep(wait); continue
            if 500 <= resp.status_code < 600:
                wait = RETRY_BACKOFF * (2 ** (attempt - 1))
                time.sleep(wait); continue
            if resp.status_code == 404:
                return None
            if 400 <= resp.status_code < 500:
                log.error(f"{resp.status_code} {url}: {resp.text[:500]}")
                return None
            return resp.json() if resp.content else {}
        except requests.RequestException as e:
            wait = RETRY_BACKOFF * (2 ** (attempt - 1))
            time.sleep(wait)
    return None  # falha definitiva após MAX_RETRIES
```

Constantes:
```python
MAX_RETRIES = 3
RETRY_BACKOFF = 2.0   # segundos; exponencial: 2s → 4s → 8s
JIKAN_DELAY = 1.2     # seconds after each Jikan call
ANILIST_DELAY = 0.8   # seconds after each AniList call
ARM_DELAY = 0.5       # seconds after each ARM call
TMDB_DELAY = 0.3      # seconds after each TMDB call
```

---

## R8 — Migração: de Notion para PostgreSQL

Os scripts originais (`n8n-python-scripts/anime_sync/main.py` e `mal_sync/main.py`) usavam o
**Notion como banco de dados**. A lógica de acesso às APIs externas (Jikan, AniList, TMDB, MAL) é
**portada**; só o sink muda (Notion → PostgreSQL).

### O que muda

| Aspecto | Scripts originais (Notion) | Aqui (PostgreSQL) |
|---------|---------------------------|-------------------|
| Storage | Notion database pages | PostgreSQL tabelas |
| Dedup | `NOTION_DB_ANIMES` page_id | `mal_id` único em `anime` |
| Tokens MAL | `.last_sync.json` em disco | `mal_sync_state` no PG |
| Episódios | Páginas filhas no Notion | Tabela `episodes` com FK |
| Rate limit Notion | 0.4s delay, `NOTION_VERSION` header | não se aplica |
| Namespace | `NOTION_TOKEN`, `NOTION_DB_ANIMES` | `DATABASE_URL` |

### O que é mantido

- Lógica de chamada ao Jikan (endpoints, paginação, quirks).
- Lógica de chamada ao AniList (query GraphQL, campos).
- Lógica do ARM (URL, campos retornados).
- Lógica do TMDB (endpoints de episódio, detecção dual de auth v3/v4).
- HTTP helper com retry/backoff (padrão idêntico).
- Blacklist `{21}` (One Piece).
- Delays de rate limit (JIKAN_DELAY, ANILIST_DELAY, TMDB_DELAY).
- Mapeamento Jikan `type` → nosso `media_type`.
- Mapeamento Jikan `status` → nosso `airing_status`.

### Quirks do Notion (NÃO relevantes aqui — documentados para referência histórica)

Os scripts originais tinham estas restrições do Notion que não se aplicam ao PostgreSQL:
- `rich_text` limitado a 2000 chars (sinopse truncada) — mantemos o truncamento por higiene.
- Air Date de episódio sem timezone (só `[:10]`, YYYY-MM-DD) — o Notion dava 400 com timezone.
  Aqui salvamos como `DATE` no PostgreSQL (sem timezone também, mas sem o bug).
- Rate limit de escrita do Notion: 0.4s entre cada chamada de escrita — não se aplica.
- `NOTION_VERSION: 2022-06-28` header em cada requisição — não se aplica.
- `NOTION_TOKEN` e `NOTION_DB_ANIMES` env vars — substituídas por `DATABASE_URL`.

---

## Resumo das decisões

| # | Tema | Decisão |
|---|------|---------|
| R1 | MAL sync | OAuth2 PKCE; rotação de refresh_token em `mal_sync_state` (nunca arquivo) |
| R2 | Metadados | Jikan (`/full` + `/episodes` paginado, delay 1.2s) |
| R3 | Banner/schedule | AniList (GraphQL, sem auth, delay 0.8s); timestamps UTC → DATE |
| R4 | MAL→TMDB bridge | ARM (`arm.haglund.dev`, delay 0.5s) |
| R5 | Thumbnails | TMDB (opcional, detecção v3/v4, delay 0.3s); sem TMDB_TOKEN → None sem erro |
| R6 | Blacklist | `{21}` (One Piece) — metadados sim, episódios não |
| R7 | HTTP helper | Retry exponencial 3×, backoff 2s; 404→None; 4xx→loga→None |
| R8 | Migração Notion→PG | Lógica das APIs portada; sink trocado; tokens em banco |
