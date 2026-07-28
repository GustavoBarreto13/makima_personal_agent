# REST API Contract: Carga histórica do Letterboxd e correção de dados (Akane)

Todas as rotas novas ficam em `webapp/backend/routers/movies.py`, seguindo o padrão já
estabelecido: `Depends(require_user)`, `_check_result()` para converter `status='error'` em
HTTP 400, modelos Pydantic para bodies. Nenhuma rota existente muda de contrato — só ganham
comportamento novo internamente (dedup, idioma).

## `POST /api/movies/{movie_id}/refresh-metadata`

Rebusca metadados no TMDB e sobrescreve os campos de catálogo do filme. Cobre FR-006/FR-007.

**Body** (opcional):
```json
{ "tmdb_id": 603 }
```
- Omitido/`null`: usa o `tmdb_id` já salvo no filme, ou busca por título+ano se não houver.
- Informado: usa esse id diretamente — fluxo de "escolher outro candidato" (FR-007), depois
  de a usuária buscar por texto em `GET /api/movies/tmdb/search?q=` (rota já existente,
  reaproveitada sem mudanças).

**Resposta 200**:
```json
{ "status": "ok", "movie": { /* filme atualizado, mesmo shape de GET /{movie_id} */ } }
```

**Resposta 400** (TMDB indisponível ou id inválido — nenhuma coluna foi tocada):
```json
{ "detail": "Não foi possível buscar metadados no TMDB." }
```

**Nunca altera**: `status`, `rating`, `rating_source`, `liked`, `tags`, `notes`,
`letterboxd_uri`, `source`, `last_watched_date`, `times_watched`, `created_at`, `deleted`.

---

## `PATCH /api/movies/{movie_id}/catalog`

Edição manual dos campos de catálogo. Cobre FR-008 (parte de catálogo — os campos pessoais já
são editáveis pelas rotas existentes `/rating`, `/like`, `/status`, `/notes`).

**Body** (todos opcionais — atualização parcial):
```json
{
  "title": "Perfect Blue",
  "year": 1997,
  "director": ["Satoshi Kon"],
  "genres": ["Animation", "Thriller"],
  "runtime": 81,
  "overview": "..."
}
```

**Resposta 200**: filme atualizado (mesmo shape de `GET /{movie_id}`).

---

## `PATCH /api/movies/diary/{diary_id}`

Edição manual de uma sessão do diário. Cobre FR-009.

**Body** (todos opcionais):
```json
{
  "watched_date": "2026-07-20",
  "rating": 4.5,
  "review": "...",
  "tags": ["cinema", "revisão"],
  "rewatch": true
}
```

**Resposta 200**:
```json
{
  "status": "ok",
  "entry": { /* sessão atualizada */ },
  "movie": { "last_watched_date": "2026-07-20", "times_watched": 3 }
}
```
`movie` reflete os agregados recalculados do filme dono da sessão.

---

## `PATCH /api/movies/diary/reorder`

Reordena sessões dentro de um mesmo dia. Cobre FR-011/FR-012.

**Body**:
```json
{
  "watched_date": "2026-07-20",
  "ordered_ids": ["diary-id-3", "diary-id-1", "diary-id-2"]
}
```
Ordem da lista = ordem desejada (primeiro da lista = assistido primeiro naquele dia).

**Resposta 200**:
```json
{ "status": "ok" }
```

**Resposta 400**: algum id em `ordered_ids` não pertence a uma sessão com aquele
`watched_date` — nenhuma mudança é aplicada (operação tudo-ou-nada).

---

## Rotas existentes com comportamento alterado (sem mudança de contrato HTTP)

| Rota | Mudança interna |
|---|---|
| `GET /api/movies/tmdb/search` | Resultados agora em inglês (FR-005) — mesmo shape de resposta. |
| `POST /api/movies` (`add_movie`) | Passa a resolver identidade por `tmdb_id`/título+ano antes de decidir criar vs. fundir (FR-010) — resposta `status` pode vir `"merged"` além de `"ok"`/`"error"`. |
| `POST /api/movies/sync-letterboxd` | Mesma lógica de fusão de identidade se aplica ao caminho de sync (via `upsert_movie_from_letterboxd`). |
