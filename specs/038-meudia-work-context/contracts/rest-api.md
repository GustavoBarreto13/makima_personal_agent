# REST Contract: Meu Dia — contexto Trabalho vs Pessoal (spec 038)

Rotas em `webapp/backend/routers/tasks.py` (mesmo prefixo `/api/tasks`), autenticação via
`Depends(require_user)`, mesmo padrão das rotas existentes.

## `GET /api/tasks/my-day` (estendida)

Mesma rota já existente — passa a incluir os campos particionados (ver `data-model.md`).
Nenhuma mudança de assinatura (`?date=` continua opcional).

**Response 200** (trecho novo, além dos campos já existentes):
```json
{
  "plano_work": [ /* ... */ ],
  "plano_personal": [ /* ... */ ],
  "pendencias_ontem_work": [], "pendencias_ontem_personal": [],
  "sugestoes_work": [], "sugestoes_personal": [],
  "capacity_work": { "no_plano": 2, "estimado_min": 90, "agenda_min": 60, "livre_min": 780, "folga_min": 690, "excedeu": false, "calendar_ok": true },
  "capacity_personal": { "no_plano": 1, "estimado_min": 30, "agenda_min": 0, "livre_min": 840, "folga_min": 810, "excedeu": false, "calendar_ok": true }
}
```

## `PATCH /api/tasks/projects/{project_id}` (estendida)

Body ganha o campo opcional `context` (`"personal"` | `"work"`).

**Body**:
```json
{ "context": "work" }
```

**Response 400** se `project_id` for o Inbox e `context != "personal"`:
```json
{ "status": "error", "message": "O Inbox é sempre Pessoal." }
```

## `POST /api/tasks/groups/{group_id}/context` (nova)

Ação em massa (FR-003) — define o contexto de todas as listas do grupo.

**Body**:
```json
{ "context": "work" }
```

**Response 200**: `{ "status": "ok", "updated": 3 }`

## `PATCH /api/tasks/calendar/prefs/{calendar_id}` (estendida)

Body ganha o campo opcional `context` (`"personal"` | `"work"`) — mesma rota já existente de
`visible`/`color`/`position` (fatia 019).

**Body**:
```json
{ "context": "work" }
```

**Response 200**: `{ "status": "ok" }`
