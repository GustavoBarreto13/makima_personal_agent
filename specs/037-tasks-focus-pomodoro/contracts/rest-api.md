# REST Contract: Foco / Pomodoro (spec 037)

Todas as rotas em `webapp/backend/routers/tasks.py`, prefixo existente do router (`/api/tasks`
ou equivalente — seguir o prefixo já usado pelo router), autenticação via
`Depends(require_user)`, mesmo padrão das rotas existentes.

## `GET /focus/prefs`

Devolve a preferência atual de duração.

**Response 200**:
```json
{ "focus_min": 25, "break_min": 5 }
```

## `GET /focus/active`

Devolve a sessão ativa (fechando automaticamente sessões abandonadas antes de responder — R2).

**Response 200** (sessão ativa):
```json
{
  "id": 12,
  "task_id": 34,
  "task_title": "Escrever relatório",
  "started_at": "2026-07-27T14:00:00-03:00",
  "duration_planned_min": 25,
  "break_planned_min": 5,
  "phase": "foco",
  "remaining_sec": 812
}
```

**Response 200** (nenhuma ativa): `null`

## `POST /focus/start`

Inicia uma sessão. Se já existe uma ativa, `force=true` é obrigatório (o frontend já pediu
confirmação ao usuário — FR-003); sem `force`, responde 409.

**Body**:
```json
{
  "task_id": 34,
  "focus_min": 25,
  "break_min": 5,
  "force": false
}
```

**Response 201**: mesmo shape de `GET /focus/active`.

**Response 409** (já existe sessão ativa e `force=false`):
```json
{ "status": "error", "message": "já existe uma sessão de foco ativa" }
```

Efeito colateral: atualiza `focus_prefs` com `focus_min`/`break_min` recebidos (R4 — última
escolha vira o padrão).

## `POST /focus/{id}/finish`

Conclui a sessão ativa (antecipadamente ou no fim natural). Registra o tempo efetivamente
focado, `completed=true`.

**Body** (opcional):
```json
{ "note": "boa sessão, terminei o rascunho" }
```

**Response 200**:
```json
{ "status": "ok", "session": { "id": 12, "duration_focused_min": 22, "completed": true } }
```

## `POST /focus/{id}/cancel`

Cancela a sessão ativa — `completed=false`, não entra nas estatísticas (FR-005).

**Response 200**: `{ "status": "ok" }`

## `GET /focus/today`

Resumo do dia local (FR-010).

**Response 200**:
```json
{ "date": "2026-07-27", "total_min": 75, "sessoes": 3 }
```

## `GET /focus/week`

Série dos últimos 7 dias locais (FR-010).

**Response 200**:
```json
{
  "days": [
    { "date": "2026-07-21", "total_min": 0, "sessoes": 0 },
    { "date": "2026-07-27", "total_min": 75, "sessoes": 3 }
  ]
}
```

## `GET /focus/history?date=YYYY-MM-DD`

Lista as sessões concluídas/canceladas de um dia local (default: hoje) — US3.

**Response 200**:
```json
[
  {
    "id": 10,
    "task_id": 34,
    "task_title": "Escrever relatório",
    "started_at": "2026-07-27T09:00:00-03:00",
    "duration_focused_min": 25,
    "completed": true,
    "note": null
  },
  {
    "id": 11,
    "task_id": null,
    "task_title": null,
    "started_at": "2026-07-27T10:30:00-03:00",
    "duration_focused_min": 15,
    "completed": true,
    "note": "avulsa"
  }
]
```

Sessões canceladas (`completed=false` e não foi abandono) ficam de fora da listagem de
histórico "focado" — mas isso é decisão de exibição do frontend, não do contrato (a rota
devolve todas as fechadas; o frontend filtra `completed=true` para o resumo, mostrando
canceladas apenas se quiser, fora do escopo da v1).
