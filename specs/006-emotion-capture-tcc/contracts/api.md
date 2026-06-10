# API Contract — Registro Emocional (TCC)

**Feature**: 006-emotion-capture-tcc | **Base**: `/api/journal` | **Auth**: `Depends(require_user)` em todas

Padrão do router (ver `webapp/CLAUDE.md`): mutações usam `_check_result` (erro → HTTP 400);
endpoints que retornam lista/dict direto **não** usam `_check_result`. Bodies POST/PATCH são
modelos Pydantic.

---

## GET `/emotions`

Lista o vocabulário de emoções (predefinidas + custom).

- **Resposta 200**: `[{ "id": int, "name": str, "is_predefined": bool }, ...]`
  (predefinidas primeiro, depois custom em ordem alfabética).
- Sem `_check_result` (retorna lista direto).

## POST `/emotions`

Cria uma emoção custom; idempotente (retorna a existente se já houver, por `LOWER(name)`).

- **Body**: `{ "name": str }` — Pydantic: `name` não-vazio (após trim).
- **Resposta 201**: `{ "status": "ok", "emotion": { "id": int, "name": str, "is_predefined": false } }`
- **Erros**: 422 (nome vazio).

## GET `/emotion-logs?page_id={id}`

Lista os registros emocionais de um dia (página).

- **Query**: `page_id: int` (obrigatório).
- **Resposta 200**: `[{ id, page_id, emotion_id, emotion_name, intensity,
  situation, automatic_thought, adaptive_response, reappraised_intensity, created_at }, ...]`
  ordenado por `created_at` ASC.
- Sem `_check_result`.

## POST `/emotion-logs`

Cria um registro emocional (apenas emoção + intensidade obrigatórias).

- **Body** (Pydantic `CreateEmotionLogBody`):
  ```jsonc
  {
    "page_id": int,
    "emotion_id": int,
    "intensity": int,                 // 0–10 (ge=0, le=10)
    "situation": "str | null",
    "automatic_thought": "str | null",
    "adaptive_response": "str | null",
    "reappraised_intensity": "int | null"  // 0–10; só com adaptive_response não-vazia
  }
  ```
- **Resposta 201**: `{ "status": "ok", "log": { ... } }`
- **Erros**: 400 (`emotion_id`/`page_id` inexistente, ou `reappraised_intensity` sem
  `adaptive_response`); 422 (intensidade fora de 0–10).

## PATCH `/emotion-logs/{log_id}`

Atualiza campos de um registro (preenchimento progressivo). Todos os campos opcionais.

- **Body** (Pydantic `UpdateEmotionLogBody`, todos opcionais):
  `emotion_id?, intensity?, situation?, automatic_thought?, adaptive_response?, reappraised_intensity?`
- **Resposta 200**: `{ "status": "ok", "log": { ... } }`
- **Erros**: 400 (log inexistente ou regra reavaliação↔resposta violada); 422 (intensidade inválida).

## DELETE `/emotion-logs/{log_id}`

Remove um registro emocional.

- **Resposta 200**: `{ "status": "ok" }`
- **Erros**: 404 (`{ "status": "error", "message": "registro não encontrado" }`).

## GET `/emotion-stats?year={year}`

Agregações para a aba "Emoções" dos Insights.

- **Query**: `year: int` (obrigatório) — integra com o filtro de ano (spec 005).
- **Resposta 200**:
  ```jsonc
  {
    "total": int,
    "avg_intensity": number,        // 0 se total=0
    "top_emotion": "str | null",
    "by_emotion": [{ "name": str, "count": int, "avg_intensity": number }],  // count DESC
    "by_month": [int, ...]          // 12 posições, Jan=0..Dez=11
  }
  ```
- Sem `_check_result` (retorna dict direto).

---

## Modelos Pydantic (router)

```python
class CreateEmotionBody(BaseModel):
    name: str  # validar não-vazio após strip

class CreateEmotionLogBody(BaseModel):
    page_id: int
    emotion_id: int
    intensity: int = Field(ge=0, le=10)
    situation: Optional[str] = None
    automatic_thought: Optional[str] = None
    adaptive_response: Optional[str] = None
    reappraised_intensity: Optional[int] = Field(default=None, ge=0, le=10)

class UpdateEmotionLogBody(BaseModel):
    emotion_id: Optional[int] = None
    intensity: Optional[int] = Field(default=None, ge=0, le=10)
    situation: Optional[str] = None
    automatic_thought: Optional[str] = None
    adaptive_response: Optional[str] = None
    reappraised_intensity: Optional[int] = Field(default=None, ge=0, le=10)
```
