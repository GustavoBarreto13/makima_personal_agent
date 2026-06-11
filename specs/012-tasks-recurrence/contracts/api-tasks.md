# Contrato REST — `/api/tasks/*` (delta da fatia 012)

Estende o contrato do MVP ([`011-tasks-mvp/contracts/api-tasks.md`](../../011-tasks-mvp/contracts/api-tasks.md)).
Mesmos padrões: `Depends(require_user)`, bodies Pydantic, mutações via `_check_result` (HTTP 400 em
erro), datas `YYYY-MM-DD` / horas `HH:MM`. Apenas o que **muda ou nasce** nesta fatia:

## Objeto `Recurrence`

```json
{ "rrule": "FREQ=MONTHLY;BYMONTHDAY=5", "mode": "fixed", "anchor_date": "2026-06-05", "active": true }
```

- `rrule`: string RRULE (RFC 5545).
- `mode`: `"fixed"` | `"after_completion"`.
- `anchor_date`: data-base (somente leitura na resposta; no request é derivada de `due_date`).
- `active`: `false` quando a série foi encerrada/excluída.

## Endpoints alterados

| Método e rota | Função | Mudança na 012 |
|---|---|---|
| `POST /api/tasks` | `create_task(..., recurrence?)` | Body ganha `recurrence?: {rrule, mode}` (opcional). Exige `due_date` quando presente. `type=birthday` + `due_date` ⇒ recorrência anual automática (não precisa enviar `recurrence`) |
| `PATCH /api/tasks/{id}` | `update_task(..., recurrence?, clear_recurrence?)` | Pode anexar/editar `recurrence`; `clear_recurrence:true` remove a regra. Editar a regra com ocorrência aberta mantém o `due_date` da linha viva |
| `POST /api/tasks/{id}/complete` | `complete_task(task_id, cascade=False, end_series=False)` | Novo `end_series?: bool`. Sem `end_series`, concluir uma recorrente **gera a próxima** e a resposta inclui `generated_task_id`; com `end_series:true`, conclui e encerra a série (sem gerar) |
| `DELETE /api/tasks/{id}?scope=` | `delete_task(task_id, scope="this")` | Novo query `scope`: `this` (default — soft delete + gera a próxima se recorrente) \| `series` (soft delete + desativa a regra, sem gerar) |

## Endpoint novo

| Método e rota | Função | Descrição |
|---|---|---|
| `POST /api/tasks/{id}/recurrence` | `set_recurrence(task_id, rrule, mode)` | Anexa/substitui a regra de recorrência (atalho explícito; o mesmo efeito de `PATCH` com `recurrence`). Exige `due_date` na tarefa |
| `DELETE /api/tasks/{id}/recurrence` | `clear_recurrence(task_id)` | Remove a regra (tarefa volta a ser simples) |

## `Task` (resposta) — campos que passam a trafegar

Além dos campos do MVP, a tarefa passa a incluir (quando houver):

```json
{
  "id": 42, "title": "pagar aluguel", "type": "task", "priority": 2,
  "due_date": "2026-06-05", "due_time": null,
  "recurrence": { "rrule": "FREQ=MONTHLY;BYMONTHDAY=5", "mode": "fixed", "anchor_date": "2026-06-05", "active": true },
  "recurrence_text": "todo dia 5",
  "completed_at": null, "subtasks": [ ... ]
}
```

- `recurrence`: objeto acima, ou ausente/`null` para tarefas não-recorrentes.
- `recurrence_text`: descrição pt-BR (`describe_rrule`) para a UI exibir sem decodificar RRULE.

Resposta de `POST /{id}/complete` numa recorrente:

```json
{ "status": "ok", "generated_task_id": 57, "next_due_date": "2026-07-05" }
```

(ou `generated_task_id: null` quando `end_series` ou série esgotada.)
