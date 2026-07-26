# Contracts: REST API additions — spec 034

Todas as rotas novas ficam em `webapp/backend/routers/tasks.py` (mesmo router de
`/api/tasks/*`), seguindo o padrão existente: listagens devolvem o dado direto, mutações
passam por `_check_result()` (`{"status":"error"}` → HTTP 400). Toda a regra de negócio vive
na camada de lógica (`agents/kaguya/tools_*.py`) — o router só chama e serializa.

## Contextos (`tools_contexts.py` — novo módulo, mesmo padrão de `tools_tags.py`)

| Método + rota | Lógica chamada | Notas |
|---|---|---|
| `GET /api/tasks/contexts` | `list_contexts()` | ordenado por `position` |
| `POST /api/tasks/contexts` | `create_context(name, icon?)` | nome único (case-insensitive) → erro 400 se duplicado |
| `PATCH /api/tasks/contexts/{id}` | `update_context(id, name?, icon?, position?)` | PATCH parcial |
| `DELETE /api/tasks/contexts/{id}` | `delete_context(id)` | desassocia tarefas (`context_id = NULL`), nunca as apaga |

## Tarefas — campos GTD no `update_task` existente

`PATCH /api/tasks/{id}` (rota já existente) passa a aceitar, além dos campos atuais:

| Campo | Tipo | Efeito |
|---|---|---|
| `gtd_status` | `"next_action" \| "waiting" \| "someday" \| null` | aplica as regras de transição (data-model.md) |
| `waiting_note` | `str \| null` | só tem efeito visível quando `gtd_status="waiting"` |
| `context_id` | `int \| null` | associa/desassocia contexto |

Sem rota nova — reuso do endpoint de edição de tarefa já documentado em `webapp/docs/API.md`.

## Processamento do inbox

| Método + rota | Lógica chamada | Notas |
|---|---|---|
| `GET /api/tasks/inbox/queue` | `list_inbox_queue()` | devolve `{items: [...], total, index_hint}` — itens não processados do Inbox, ordenados por `created_at` |
| `POST /api/tasks/inbox/{task_id}/process` | `process_inbox_item(task_id, decision, **fields)` | `decision` ∈ `next_action\|waiting\|someday\|schedule\|done\|trash`; `fields` variam por decisão (ex.: `context_id`/`project_id` para `next_action`, `waiting_note` para `waiting`, `due_date` para `schedule`) |

`process_inbox_item` é a MESMA função reusada pelo Telegram (botões e texto livre — research.md
R9), garantindo paridade de canal (Princípio IV/regra de negócio única).

## Views fixas (novo módulo `tools_views.py`)

| Método + rota | Lógica chamada |
|---|---|
| `GET /api/tasks/views/all` | `list_view_all()` |
| `GET /api/tasks/views/today` | `list_view_today()` (alias de `list_today_overdue`) |
| `GET /api/tasks/views/tomorrow` | `list_view_tomorrow()` |
| `GET /api/tasks/views/next7` | `list_view_next7()` |
| `GET /api/tasks/views/inbox` | tarefas do Inbox (lista já existente — `list_tasks_by_project`) |
| `GET /api/tasks/views/counts` | `get_view_counts()` → `{all, today, tomorrow, next7, inbox}` (badges da sidebar) |

## Smart-lists / built-ins — sem mudança de contrato

`GET /api/tasks/filters/builtin/{key}/tasks` continua igual; só a semântica interna das chaves
`next-actions`/`waiting`/`someday` muda (agora via `gtd_status`, não tag). `POST /api/tasks/filters`
(smart-lists do usuário) ganha os dois novos campos possíveis na DSL (`gtd_status`, `context_id`)
— sem mudança de rota, só de vocabulário aceito em `rules.conditions[].field`.

## Telegram (coordinator) — sem rota REST, mas contrato do fluxo

- **Botões**: `callback_data` prefixo `ibx_` (`ibx_next_action:<id>`, `ibx_waiting:<id>`,
  `ibx_someday:<id>`, `ibx_schedule:<id>`, `ibx_done:<id>`, `ibx_trash:<id>`), tratado em
  `handle_callback` (`coordinator/main.py`) — mesmo padrão dos prefixos `nc_`/`ncc_`/`fm_`.
- **Texto livre**: nova tool ADK `process_inbox_item(task_id, decision, ...)` exposta em
  `agents/kaguya/tools.py`, que a Kaguya chama quando o usuário responde em linguagem natural
  durante o processamento — delega para a mesma `agents.kaguya.tools_tasks.process_inbox_item`.
- Nova tool `resolve_view_by_name(name)` para "todas"/"amanhã"/"próximos 7 dias" (paridade
  FR-014, reusando `list_tasks_by_filter_name`'s padrão de resolução tolerante por nome/prefixo).
