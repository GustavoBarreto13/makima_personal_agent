# Contrato REST — `/api/tasks/*` (MVP)

Router: `webapp/backend/routers/tasks.py`. Padrões do repo: todas as rotas com
`Depends(require_user)`; bodies em Pydantic; **mutações** retornam
`{"status": "ok"|"error", ...}` (router aplica `_check_result` → HTTP 400 em erro);
**listagens** retornam o dado direto. Datas: `YYYY-MM-DD`; horas: `HH:MM`.

Cada endpoint envelopa uma função da camada de lógica (`tools_tasks.py` /
`tools_projects.py`) — a coluna "Função" garante a paridade com
[`kaguya-tools.md`](./kaguya-tools.md).

## Sidebar / projetos / grupos / colunas

| Método e rota | Função | Descrição |
|---|---|---|
| `GET /api/tasks/sidebar` | `get_sidebar()` | Grupos + projetos (com contagem de abertas) + flag de board, ordenados por `position`. Payload único para montar a sidebar |
| `POST /api/tasks/projects` | `create_project(name, group_id?, color?, icon?)` | Cria projeto |
| `PATCH /api/tasks/projects/{id}` | `update_project(project_id, ...)` | Renomear, mover de grupo, cor/ícone, reordenar (`position`) |
| `DELETE /api/tasks/projects/{id}?mode=` | `delete_project(project_id, mode)` | `mode=move_to_inbox` \| `delete_tasks` (obrigatório se houver tarefas). Inbox → erro |
| `POST /api/tasks/groups` | `create_group(name)` | Cria grupo |
| `PATCH /api/tasks/groups/{id}` | `update_group(group_id, ...)` | Renomear/reordenar |
| `DELETE /api/tasks/groups/{id}` | `delete_group(group_id)` | Projetos do grupo ficam sem grupo (`group_id = NULL`) |
| `GET /api/tasks/projects/{id}/columns` | `list_columns(project_id)` | Colunas do board por `position` |
| `POST /api/tasks/columns` | `create_column(project_id, name, is_done_column?)` | Cria coluna (primeira coluna ativa o Kanban) |
| `PATCH /api/tasks/columns/{id}` | `update_column(column_id, ...)` | Renomear/reordenar/marcar done (única por projeto) |
| `DELETE /api/tasks/columns/{id}` | `delete_column(column_id)` | Tarefas da coluna ficam com `column_id = NULL` |

## Tarefas

| Método e rota | Função | Descrição |
|---|---|---|
| `GET /api/tasks?project_id=&include_completed=` | `list_tasks(project_id, include_completed=False)` | Tarefas do projeto (abertas por padrão), subtarefas aninhadas, ordenadas por `position`. Serve lista **e** Kanban (front agrupa por `column_id`) |
| `GET /api/tasks/today` | `list_tasks_today()` | `{overdue: [...], today: [...]}` agrupadas por projeto (abertas, `due_date <= hoje`) |
| `GET /api/tasks/search?q=` | `search_tasks(query)` | Busca por título/descrição (ILIKE no MVP) |
| `GET /api/tasks/trash?project_id=` | `list_trash(project_id?)` | Soft-deletadas, para restauração |
| `POST /api/tasks` | `create_task(title, project_id?, parent_id?, priority?, due_date?, due_time?, description?)` | Sem `project_id` → Inbox. `parent_id` cria subtarefa (1 nível) |
| `PATCH /api/tasks/{id}` | `update_task(task_id, ...)` | Campos editáveis: título, descrição, prioridade, datas, `project_id` (regra da coluna ao trocar de projeto), `column_id` |
| `POST /api/tasks/{id}/complete` | `complete_task(task_id, cascade=False)` | Subtarefas abertas sem `cascade` → `{"status":"error","needs_cascade":true}` (canal confirma e repete com `cascade=true`). Recebe também o drop na coluna done |
| `POST /api/tasks/{id}/reopen` | `reopen_task(task_id)` | Bloqueado se o pai estiver concluído |
| `POST /api/tasks/{id}/position` | `reorder_task(task_id, after_id?, before_id?)` | Posição esparsa entre vizinhos; renormaliza em colisão |
| `DELETE /api/tasks/{id}` | `delete_task(task_id)` | Soft delete (subtarefas juntas) |
| `POST /api/tasks/{id}/restore` | `restore_task(task_id)` | Limpa `deleted_at` |

## Formato de `Task` (resposta)

```json
{
  "id": 42, "project_id": 3, "column_id": 7, "parent_id": null,
  "title": "revisar relatório", "description": null, "priority": 3,
  "due_date": "2026-06-12", "due_time": "17:00",
  "position": 3000, "completed_at": null, "created_at": "2026-06-11T10:00:00-03:00",
  "subtasks": [ { "id": 43, "title": "...", "completed_at": null, "...": "..." } ]
}
```

Campos das fases futuras (`start_at`, `end_at`, `duration_min`, `my_day_date`, tags)
existem no banco mas **não** trafegam no MVP — entram no contrato quando a fase chegar.
