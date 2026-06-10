# API Contracts: Favoritar Bullet pelo Próprio Ícone

**Feature**: 007-favorite-bullet | **Branch**: `007-favorite-bullet` | **Date**: 2026-06-10

---

## Endpoints novos

### PATCH /api/journal/bullets/{bullet_id}/favorite

**Descrição**: Define o estado de favorito de um bullet (favoritar ou desfavoritar).

**Autenticação**: `Depends(require_user)` — obrigatório.

**Path parameter**:
| Param | Tipo | Descrição |
|---|---|---|
| `bullet_id` | int | ID do bullet a ser alterado |

**Request body** (Pydantic `SetFavoriteBody`):
```json
{
  "favorite": true
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `favorite` | bool | sim | Estado de favorito desejado |

**Responses**:

`200 OK` — favorito persistido:
```json
{
  "status": "ok",
  "favorite": true
}
```

`400 Bad Request` — bullet não encontrado (via `_check_result`):
```json
{
  "detail": "bullet não encontrado"
}
```

`401 Unauthorized` — sessão inválida ou ausente.

`422 Unprocessable Entity` — body inválido (Pydantic).

---

### GET /api/journal/favorite-days

**Descrição**: Retorna as datas do ano que possuem ao menos um bullet favorito.
Insumo direto para o heatmap de favoritos (spec 008).

**Autenticação**: `Depends(require_user)` — obrigatório.

**Query parameters**:
| Param | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `year` | int | sim | Ano de referência (ex.: 2026) |

**Response** `200 OK`:
```json
["2026-06-10", "2026-06-12", "2026-06-15"]
```

Lista de strings `"YYYY-MM-DD"`, ordenada ASC. Lista vazia `[]` se nenhum favorito no ano.

**Retorno direto** (sem campo `status`) — **não** usar `_check_result` no router.

`401 Unauthorized` — sessão inválida ou ausente.

---

## Endpoints existentes modificados

### GET /api/journal/page?date=&type_id=

**Mudança**: os objetos de bullet na resposta passam a incluir o campo `favorite`.

Antes:
```json
{
  "page": { ... },
  "bullets": [
    {"id": 1, "page_id": 10, "kind": "bullet", "content": "texto", "position": 0, "created_at": "..."}
  ]
}
```

Depois:
```json
{
  "page": { ... },
  "bullets": [
    {"id": 1, "page_id": 10, "kind": "bullet", "content": "texto", "position": 0, "created_at": "...", "favorite": false}
  ]
}
```

**Retrocompatibilidade**: bullets existentes recebem `favorite: false` (valor do `DEFAULT FALSE`).

---

### POST /api/journal/bullets

**Mudança**: a resposta do upsert passa a incluir `favorite` no objeto `bullet`.

Antes:
```json
{"status": "ok", "bullet": {"id": 1, "page_id": 10, "kind": "bullet", "content": "...", "position": 0, "created_at": "..."}}
```

Depois:
```json
{"status": "ok", "bullet": {"id": 1, "page_id": 10, "kind": "bullet", "content": "...", "position": 0, "created_at": "...", "favorite": false}}
```

**Nota crítica**: `favorite` **não** faz parte do body do POST — o upsert nunca altera o
favorito. Apenas retorna o valor atual persistido no banco.
