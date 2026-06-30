# Contract — REST API: `/api/tasks/experiments/*`

Endpoints acrescentados ao router existente `webapp/backend/routers/tasks.py` (prefixo
`/api/tasks`). Regras obrigatórias (`webapp/CLAUDE.md`):
- **`Depends(require_user)` em todas as rotas** (sem exceção).
- Modelos **Pydantic** para todo body de POST/PATCH.
- **Mutações** retornam `{"status": "ok"|"error", ...}` → passam por `_check_result`
  (erro vira HTTP 400). **Listagens/leituras** retornam o dado direto → **não** usam `_check_result`.
- Datas em texto: `period_date`/`start_date`/`end_date` = `"YYYY-MM-DD"` (UTC-3).

Mapeamento endpoint → função da camada de lógica (`agents/kaguya/tools_experiments.py`):

| Método | Caminho | Função | `_check_result`? |
|---|---|---|---|
| GET | `/api/tasks/experiments?include_completed=<bool>` | `list_experiments(include_completed)` | não (lista) |
| GET | `/api/tasks/experiments/due-today` | `list_experiments_due_today()` | não (lista) |
| GET | `/api/tasks/experiments/{id}` | `get_experiment(id)` | não (dict) |
| POST | `/api/tasks/experiments` | `create_experiment(...)` | sim (201) |
| PATCH | `/api/tasks/experiments/{id}` | `update_experiment(id, ...)` | sim |
| DELETE | `/api/tasks/experiments/{id}` | `delete_experiment(id)` | sim |
| POST | `/api/tasks/experiments/{id}/log` | `log_experiment(id, ...)` | sim |
| DELETE | `/api/tasks/experiments/{id}/log?period_date=<YYYY-MM-DD>` | `remove_log(id, period_date)` | sim |
| POST | `/api/tasks/experiments/{id}/pause` | `pause_experiment(id)` | sim |
| POST | `/api/tasks/experiments/{id}/resume` | `resume_experiment(id)` | sim |
| POST | `/api/tasks/experiments/{id}/review` | `review_experiment(id, verdict, review)` | sim |

> Importante: registrar as **rotas estáticas** (`/experiments/due-today`) **antes** da rota
> paramétrica (`/experiments/{id}`) para o FastAPI não capturar "due-today" como `{id}`.

---

## Schemas (Pydantic) — bodies

```
CreateExperimentBody:
  title: str                      # obrigatório
  start_date: str                 # "YYYY-MM-DD", obrigatório
  end_date: str                   # "YYYY-MM-DD", obrigatório (>= start_date)
  why: str | None = None
  hypothesis: str | None = None
  cadence: Literal["daily","weekly"] = "daily"

UpdateExperimentBody:            # todos opcionais (PATCH parcial)
  title: str | None
  why: str | None
  hypothesis: str | None
  cadence: Literal["daily","weekly"] | None
  start_date: str | None
  end_date: str | None

LogExperimentBody:
  period_date: str                # "YYYY-MM-DD" (corrente ou passado, dentro do intervalo)
  done: bool                      # obrigatório
  feeling: int | None = None      # 1..5
  note: str | None = None

ReviewExperimentBody:
  verdict: Literal["persist","pause","pivot"]
  review: str
```

`pause`/`resume` não têm body.

---

## Formatos de resposta (referência)

**Experimento (item de lista / detalhe)** — campos persistidos + derivados (ver `data-model.md`):

```json
{
  "id": 7,
  "title": "Vou meditar 5 min",
  "why": "ter mais foco",
  "hypothesis": "talvez se eu meditar de manhã, então rendo mais",
  "cadence": "daily",
  "start_date": "2026-06-29",
  "end_date": "2026-07-13",
  "status": "active",
  "verdict": null,
  "review": null,
  "periods_done": 3,
  "periods_expected": 4,
  "adherence_pct": 75,
  "logged_current": false,
  "days_remaining": 14,
  "is_overdue": false,
  "created_at": "2026-06-29T09:00:00-03:00",
  "updated_at": "2026-06-29T09:00:00-03:00"
}
```

**Detalhe** (`GET /{id}`) inclui também `logs`: lista de check-ins ordenada por `period_date`:

```json
{ "...experimento...": "...", "logs": [
  { "id": 1, "period_date": "2026-06-29", "done": true, "feeling": 4, "note": "tranquilo" }
] }
```

**`due-today`**: lista mínima dos ativos cuja cadência cai hoje e sem check-in no período
corrente (FR-013): `[{ "id": 7, "title": "Vou meditar 5 min", "cadence": "daily" }]`.

**Mutações**: `{ "status": "ok", "id": 7 }` ou `{ "status": "error", "message": "..." }`.

---

## Casos de erro (→ HTTP 400 via `_check_result`, ou 422 via Pydantic)

| Caso | Resultado |
|---|---|
| `end_date < start_date` na criação/edição | `{"status":"error","message":"Data de fim antes do início."}` → 400 |
| `feeling` fora de 1..5 | 422 (validação Pydantic) |
| `cadence` inválida | 422 |
| pausar um experimento já `completed` (ou `paused`) | `{"status":"error",...}` → 400 |
| retomar um experimento que não está `paused` | `{"status":"error",...}` → 400 |
| revisar um experimento já `completed` | `{"status":"error",...}` → 400 |
| qualquer rota sem cookie de sessão válido | 401 (`require_user`) |
| `{id}` inexistente | `{"status":"error",...}` → 400 (mutações) / 404 ou lista vazia (leitura) |
