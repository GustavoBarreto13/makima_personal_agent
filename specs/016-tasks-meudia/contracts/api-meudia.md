# Contrato de API — Meu Dia + Time-blocking (fatia 016)

Base: `/api/tasks` (router `webapp/backend/routers/tasks.py`). Todas as rotas exigem
`Depends(require_user)`. Convenção do repo: mutações retornam `{status: ok|error}` (convertido por
`_check_result` → 400 em erro); listagens retornam o dado direto (sem `_check_result`).

---

## Endpoints novos

### `GET /api/tasks/my-day?date=YYYY-MM-DD`
Monta o ritual do dia. `date` opcional (default: hoje, fuso `America/Sao_Paulo`). Listagem (dado
direto). Chama `list_my_day(date)`.

```jsonc
{
  "date": "2026-06-13",
  "plano": [ Task, ... ],            // my_day_date == date, abertas, ordenadas por start_at depois position
  "pendencias_ontem": [ Task, ... ], // my_day_date < date, abertas
  "sugestoes": [ Task, ... ],        // vencem em ≤2 dias, fora do plano
  "capacity": {
    "no_plano": 5,
    "estimado_min": 180,
    "agenda_min": 240,
    "livre_min": 600,
    "folga_min": 420,
    "excedeu": false,
    "calendar_ok": true              // false quando o MCP do Calendar não respondeu
  }
}
```

### `POST /api/tasks/{id}/my-day`
Marca a tarefa no Meu Dia. Body opcional `{ "date": "YYYY-MM-DD" }` (default hoje). Mutação.
→ `add_to_my_day(id, date)`.

### `DELETE /api/tasks/{id}/my-day`
Tira a tarefa do Meu Dia (`my_day_date = NULL`). Mutação. → `remove_from_my_day(id)`.

### `POST /api/tasks/{id}/reschedule`
Atalho do ritual de pendências. Body `{ "when": "today" | "tomorrow" | "later" }`. Ajusta
`my_day_date`. Mutação. → `reschedule_pending(id, when)`.

### `POST /api/tasks/{id}/time-block`
Grava o bloco de tempo. Body `{ "start_at": "ISO8601", "end_at"?: "ISO8601", "duration_min"?: int }`.
Se `end_at` ausente, deriva de `start_at + (duration_min or 30min)`. Valida a CHECK
(`end_at` exige `start_at`). Mutação. → `set_time_block(...)`.

### `DELETE /api/tasks/{id}/time-block`
Remove o bloco (`start_at = end_at = NULL`). Mutação. → `clear_time_block(id)`.

---

## Endpoint estendido

### `PATCH /api/tasks/{id}`
Estender o body (`update_task`) para aceitar **`duration_min`** (estimativa) e, opcionalmente,
`my_day_date`/`start_at`/`end_at` para edição direta. Mantém a semântica PATCH parcial atual.

---

## Tools do agente (Telegram) — paridade

Registradas em `agents/kaguya/tools.py` (fachada fina sobre a camada de lógica):

| Tool | Mapeia para |
|---|---|
| `plan_my_day()` / `my_day_status()` | `list_my_day(hoje)` → relato textual (plano + capacity) |
| `add_to_my_day(task_or_name, date?)` | `add_to_my_day` (resolve id **ou** nome por prefixo) |
| `remove_from_my_day(task_or_name)` | `remove_from_my_day` |
| `set_estimate(task_or_name, minutes)` | `set_estimate` |
| `block_time(task_or_name, start_at, minutes?)` *(opcional)* | `set_time_block` |

A timeline/CapacityBar visuais são webapp-only; a Kaguya relata o plano + capacity em texto.

---

## Notas de implementação

- `list_my_day` **não** passa por `_check_result` (é listagem) — mesmo cuidado das listagens do
  journal/tarefas.
- A leitura de eventos do Calendar reusa `tools_calendar` / o MCP existente; se falhar, devolver
  `calendar_ok: false` e `agenda_min: 0` em vez de propagar exceção (FR-008).
- Datas/horas no fuso `America/Sao_Paulo`. `start_at`/`end_at` são `TIMESTAMPTZ`.
