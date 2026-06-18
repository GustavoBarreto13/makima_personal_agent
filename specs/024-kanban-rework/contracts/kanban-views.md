# Contrato REST — `/api/tasks/kanban-views/*`

Rotas no router `webapp/backend/routers/tasks.py`. **Todas** exigem `Depends(require_user)` (allowlist de email). Bodies validados por modelos Pydantic; erros de regra de negócio viram HTTP 400 via `_check_result`; validação de shape → 422.

Camada de lógica: `agents/kaguya/tools_kanban_views.py` (mutação retorna `{"status":"ok"|"error", ...}`; listagem retorna lista/dict direto).

## Tipos compartilhados

```jsonc
KanbanViewDisplay = {
  "adornos": { "capacity_meter": bool, "subtask_ring": bool, "summary_footer": bool, "card_chips": bool },
  "slots": ["abertas"|"tempo_estimado"|"concluidas"|"concluidas_hoje"|"em_andamento", x3]
}
FilterRules = { "combinator": "and"|"or", "conditions": [ { "field", "op", "value" }, ... ] }  // já existente
KanbanView = { "id": int, "name": str, "is_builtin": bool, "display": KanbanViewDisplay, "filter": FilterRules|null, "position": int }
```

## `GET /api/tasks/kanban-views`

Lista todas as views (ordenadas por `position`). **Listagem** (sem `status`).

- **200** → `KanbanView[]` (sempre inclui ao menos a built-in "Completa").

## `POST /api/tasks/kanban-views`

Cria uma view customizada.

- **Body** (Pydantic):
  ```jsonc
  { "name": str, "display": KanbanViewDisplay, "filter": FilterRules|null }
  ```
- **201** → `{ "status": "ok", "id": int }`
- **400** → nome vazio / `display` inválido (slots ≠ 3 ou chave desconhecida) / `filter` sem condição.

## `PATCH /api/tasks/kanban-views/{id}`

Edita parcialmente (só campos enviados).

- **Body**: `{ "name"?: str, "display"?: KanbanViewDisplay, "filter"?: FilterRules|null, "position"?: int }`
- **200** → `{ "status": "ok" }`
- **400** → view inexistente · **view `is_builtin`** (não editável) · payload inválido.

## `DELETE /api/tasks/kanban-views/{id}`

Remove uma view customizada. Nenhuma tarefa/coluna é afetada.

- **200** → `{ "status": "ok" }`
- **400** → view inexistente · **view `is_builtin`** (não deletável).

## Notas de aplicação do filtro (não é endpoint novo)

O filtro da view é aplicado na **carga das tarefas do board**, reusando o motor do DSL:
- Sem filtro na view ativa → frontend usa o endpoint existente de listagem de tarefas da lista (caminho atual, intocado).
- Com filtro → a lógica usa `list_board_tasks(project_id, rules)` (reuso de `_build_where_from_rules` com base `default_open=False` — ver `research.md` R-1/R-2). Decisão de tasks: expor via parâmetro opcional no endpoint de tarefas da lista **ou** rota dedicada — não altera este contrato de views.

## Invariantes verificáveis (mapeiam A8–A11)

- A built-in "Completa" sempre existe e responde 400 a PATCH/DELETE.
- CRUD de views customizadas persiste e reaparece no `GET`.
- O filtro tem **a mesma semântica** das smart-lists (mesmo `FilterRules`/motor).
