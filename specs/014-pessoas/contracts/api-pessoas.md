# Contrato REST — `/api/pessoas/*`

Router novo `webapp/backend/routers/pessoas.py`, registrado em `webapp/backend/main.py` com
`app.include_router(pessoas_router.router, prefix="/api/pessoas", tags=["pessoas"])`.

**Convenções** (idênticas a `routers/tasks.py`):
- Toda rota depende de `Depends(require_user)` → sem cookie de sessão válido ⇒ **401** (FR-013,
  SC-005 cenário 5).
- Bodies são modelos **Pydantic** (nunca dict cru).
- Mutações (POST/PATCH/DELETE) retornam `{"status": "ok"|"error", ...}` e passam por `_check_result`
  (erro de domínio ⇒ **HTTP 400** com `detail` = mensagem). Listagens retornam dados direto.
- O router **importa as tools** de `agents/komi/tools.py` — não há lógica de domínio no router.

---

## `GET /api/pessoas/`

Lista pessoas não-excluídas para o grid. → `list_people()`.

**200**:
```jsonc
[
  { "id": "uuid", "name": "Ana Silva", "relationship": "amiga",
    "avatar_url": null, "link_count": 7 }
]
```

## `POST /api/pessoas/`  `201`

Cria pessoa. → `create_person(**body)`.

**Body** (`CreatePersonBody`): `name` (obrigatório), `relationship?`, `phone?`, `email?`,
`instagram?`, `telegram?`, `city?`, `avatar_url?`, `notes?`.

**201**: `{ "status": "ok", "id": "uuid", "message": "..." }`
**400**: nome duplicado entre vivas (índice único `normalizado`).

## `GET /api/pessoas/{id}`

Resumo completo da pessoa (a página de cards). → `get_person_summary(id)`.

**200**: estrutura de `get_person_summary` (ver `data-model.md`): `perfil`, `financas`, `tarefas`,
`diario`, `livros` — cada bloco populado **ou vazio sem erro** (SC-005).
**404**: pessoa inexistente ou excluída.

## `PATCH /api/pessoas/{id}`

Edita campos do perfil. → `update_person(id, **body)`.

**Body** (`UpdatePersonBody`, todos opcionais — `model_dump(exclude_unset=True)`): mesmos campos do
POST. **200**: `{ "status": "ok", ... }`.

## `DELETE /api/pessoas/{id}`

Soft delete. → `delete_person(id)`. **200**: `{ "status": "ok", ... }`. A pessoa some do grid; os
`person_links` permanecem (histórico).

## `POST /api/pessoas/{id}/aliases`  `201`

Adiciona apelido. → `add_alias(id, alias)`.

**Body** (`AddAliasBody`): `alias` (obrigatório).
**201**: `{ "status": "ok", ... }`. **400**: apelido já usado por outra pessoa (único global).

## `POST /api/pessoas/{id}/dates`  `201`

Adiciona data importante. → `add_important_date(id, label, date, recurring)`.

**Body** (`AddDateBody`): `label` (obrigatório), `date` (`YYYY-MM-DD`, obrigatório),
`recurring?` (default `true`).
**201**: `{ "status": "ok", ... }`.

---

## Tabela-resumo

| Método | Rota | Tool | Sucesso | Auth |
|---|---|---|---|---|
| GET | `/api/pessoas/` | `list_people` | 200 lista | require_user |
| POST | `/api/pessoas/` | `create_person` | 201 | require_user |
| GET | `/api/pessoas/{id}` | `get_person_summary` | 200 | require_user |
| PATCH | `/api/pessoas/{id}` | `update_person` | 200 | require_user |
| DELETE | `/api/pessoas/{id}` | `delete_person` | 200 | require_user |
| POST | `/api/pessoas/{id}/aliases` | `add_alias` | 201 | require_user |
| POST | `/api/pessoas/{id}/dates` | `add_important_date` | 201 | require_user |
