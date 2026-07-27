# Contract: REST API — spec 039

Base: `/api/tasks` (router `webapp/backend/routers/tasks.py`), `Depends(require_user)` em todas.

## Parte A — Arquivar listas

### `POST /api/tasks/projects/{project_id}/archive`
Sem body. Chama `archive_project(project_id)`.
- 200 `{"status": "ok", "message": "Lista arquivada."}`
- 400 se Inbox ou já arquivada.

### `POST /api/tasks/projects/{project_id}/restore`
Sem body. Chama `restore_project(project_id)`.
- 200 `{"status": "ok", "message": "Lista restaurada."}`
- 400 se não estava arquivada.

### `GET /api/tasks/projects/archived`
Chama `list_archived_projects()`. **Listagem** (sem `status`).
```json
[{"id": 12, "name": "Mudança de apartamento", "group_id": null, "color": null,
  "icon": "📦", "archived_at": "2026-07-01T10:00:00-03:00", "task_count": 7}]
```

### Consultas existentes (sem mudança de assinatura, só de filtro interno)
`GET /api/tasks?project_id=` (ListScreen) continua funcionando para uma lista arquivada
(precisa — é como a área de arquivadas abre o conteúdo, FR-004) porque não passa pelo
helper de exclusão — só a listagem (`GET /projects` via `get_sidebar`) e as views
operacionais (`GET /my-day`, `GET /calendar`, `GET /eisenhower`, `GET /filters/*`,
`GET /views/*`, `GET /tags/{name}`) param de trazer tarefas de lista arquivada.

### `GET /api/tasks/search?q=`
Resposta ganha o campo `archived: boolean` em cada item (default `false`).

## Parte B — Localização nos eventos

### `GET /api/tasks/my-day?date=`
Cada item de `eventos`/`eventos_work`/`eventos_personal` (dict de evento gcal) ganha
`"location": string` (pode ser `""`).

Nenhuma outra rota muda de contrato — `location` já trafegava em
`GET /api/tasks/calendar/hub` (Calendar Hub) e no popover.
