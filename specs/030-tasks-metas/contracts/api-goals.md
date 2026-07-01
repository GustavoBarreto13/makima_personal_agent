# Contract — REST API: `/api/tasks/goals/*`

Endpoints acrescentados ao router existente `webapp/backend/routers/tasks.py` (prefixo
`/api/tasks`). Regras obrigatórias (`webapp/CLAUDE.md`):
- **`Depends(require_user)` em todas as rotas** (sem exceção).
- Modelos **Pydantic** para todo body de POST/PATCH.
- **Mutações** retornam `{"status": "ok"|"error", ...}` → passam por `_check_result`
  (erro vira HTTP 400). **Listagens/leituras** retornam o dado direto → **não** usam `_check_result`.
- Datas em texto: `deadline` = `"YYYY-MM-DD"` (UTC-3).

Mapeamento endpoint → função da camada de lógica (`agents/kaguya/tools_goals.py`):

| Método | Caminho | Função | `_check_result`? |
|---|---|---|---|
| GET | `/api/tasks/goals?include_closed=<bool>` | `list_goals(include_closed)` | não (lista) |
| GET | `/api/tasks/goals/areas` | `list_goal_areas()` | não (lista) |
| GET | `/api/tasks/goals/linkable?item_type=<experiment\|task\|habit>` | `list_linkable_items(item_type)` | não (lista) |
| GET | `/api/tasks/goals/{id}` | `get_goal(id)` | não (dict) |
| POST | `/api/tasks/goals` | `create_goal(...)` | sim (201) |
| PATCH | `/api/tasks/goals/{id}` | `update_goal(id, ...)` | sim |
| DELETE | `/api/tasks/goals/{id}` | `delete_goal(id)` | sim |
| POST | `/api/tasks/goals/{id}/milestones` | `add_milestone(id, title)` | sim |
| PATCH | `/api/tasks/goals/{id}/milestones/{mid}` | `update_milestone(mid, ...)` | sim |
| DELETE | `/api/tasks/goals/{id}/milestones/{mid}` | `delete_milestone(mid)` | sim |
| POST | `/api/tasks/goals/{id}/link` | `link_movement(id, item_type, item_id)` | sim |
| POST | `/api/tasks/goals/{id}/unlink` | `unlink_movement(item_type, item_id)` | sim |
| POST | `/api/tasks/goals/{id}/review` | `review_goal(id, outcome, review)` | sim |

> Importante: registrar as **rotas estáticas** (`/goals/areas`, `/goals/linkable`) **antes** da rota
> paramétrica (`/goals/{id}`) para o FastAPI não capturar "areas"/"linkable" como `{id}`.

---

## Schemas (Pydantic) — bodies

```
CreateGoalBody:
  title: str                       # obrigatório
  deadline: str                    # "YYYY-MM-DD", obrigatório
  why: str | None = None
  life_area: str | None = None
  metric_target: float | None = None
  metric_unit: str | None = None
  anti_goals: str | None = None
  accountability: str | None = None

UpdateGoalBody:                    # todos opcionais (PATCH parcial)
  title: str | None
  why: str | None
  life_area: str | None
  metric_target: float | None
  metric_unit: str | None
  metric_current: float | None     # atualizar o valor atual da métrica (FR-005)
  deadline: str | None
  anti_goals: str | None
  accountability: str | None

AddMilestoneBody:
  title: str                       # obrigatório

UpdateMilestoneBody:               # PATCH parcial
  title: str | None
  done: bool | None                # concluir/reabrir marco (FR-005)

LinkMovementBody:
  item_type: Literal["experiment","task","habit"]
  item_id: int

UnlinkMovementBody:
  item_type: Literal["experiment","task","habit"]
  item_id: int

ReviewGoalBody:
  outcome: Literal["achieved","missed","revise"]
  review: str
```

---

## Formatos de resposta (referência)

**Meta (item de lista / detalhe)** — campos persistidos + derivados (ver `data-model.md`):

```json
{
  "id": 3,
  "title": "Ler 12 livros em 2026",
  "why": "reduzir tempo de tela e pensar melhor",
  "life_area": "Crescimento",
  "metric_target": 12,
  "metric_unit": "livros",
  "metric_current": 3,
  "deadline": "2026-12-31",
  "anti_goals": "não comprar livro novo sem terminar o atual",
  "accountability": "reporto pro grupo do clube do livro",
  "status": "active",
  "outcome": null,
  "review": null,
  "metric_pct": 25,
  "milestones_total": 3,
  "milestones_done": 1,
  "milestones_pct": 33,
  "progress_pct": 29,
  "days_remaining": 183,
  "is_overdue": false,
  "created_at": "2026-07-01T09:00:00-03:00",
  "updated_at": "2026-07-01T09:00:00-03:00"
}
```

**Detalhe** (`GET /{id}`) inclui também `milestones` e `movements` (agrupados por tipo, cada item com
status mínimo — FR-009):

```json
{ "...meta...": "...",
  "milestones": [ { "id": 10, "title": "4 livros até março", "done": true } ],
  "movements": {
    "experiments": [ { "id": 7, "title": "Vou ler 20 min", "status": "active", "adherence_pct": 75 } ],
    "tasks":       [ { "id": 55, "title": "Comprar 'Sapiens'", "completed": false } ],
    "habits":      [ { "id": 4, "name": "Ler antes de dormir", "consistency": 78 } ]
  }
}
```

**`areas`** (SC-006): contagem de metas **ativas** por área da vida (metas sem área → `null`):
`[{ "life_area": "Crescimento", "active_count": 2 }, { "life_area": null, "active_count": 1 }]`

**`linkable`**: itens do tipo pedido que podem ser vinculados (vivos/ativos), com um flag indicando
se já pertencem a outra meta (para a UI avisar que vincular vai reatribuir — cardinalidade D1):
`[{ "id": 7, "label": "Vou ler 20 min", "linked_goal_id": null }]`

**Mutações**: `{ "status": "ok", "id": 3 }` ou `{ "status": "error", "message": "..." }`.

---

## Casos de erro (→ HTTP 400 via `_check_result`, ou 422 via Pydantic)

| Caso | Resultado |
|---|---|
| `title`/`deadline` ausente na criação | 422 (validação Pydantic) |
| `deadline` em formato inválido | `{"status":"error","message":"Data inválida..."}` → 400 |
| `outcome` fora do conjunto | 422 |
| `item_type` inválido no link/unlink | 422 |
| vincular item inexistente/arquivado/soft-deletado | `{"status":"error",...}` → 400 |
| revisar uma meta já `closed` | `{"status":"error",...}` → 400 |
| qualquer rota sem cookie de sessão válido | 401 (`require_user`) |
| `{id}`/`{mid}` inexistente | `{"status":"error",...}` → 400 (mutações) / 404 ou vazio (leitura) |
