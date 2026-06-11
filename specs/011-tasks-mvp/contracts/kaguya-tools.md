# Contrato das tools da Kaguya (MVP)

Tools expostas ao Gemini em `create_kaguya_agent()`. São as **mesmas funções** que o
router REST envelopa ([`api-tasks.md`](./api-tasks.md)) — paridade por construção.
Convenções: parâmetros estruturados (o LLM faz o parsing da linguagem natural — research
D5); mutações retornam `{"status": "ok"|"error", ...}`; a Kaguya sempre ecoa a
interpretação na resposta em português.

## Tools de tarefas (substituem o MCP do TickTick)

| Tool | Assinatura (essência) | Equivalente antigo (MCP) |
|---|---|---|
| `list_projects` | `()` → grupos + projetos com contagem | `list_projects` |
| `create_project` | `(name, group_name?)` | — (novo) |
| `update_project` | `(project_id, name?, ...)` | — (novo) |
| `delete_project` | `(project_id, mode)` — confirmar com o usuário antes | — (novo) |
| `list_tasks_today` | `()` → `{overdue, today}` por projeto | `list_tasks_today` (mesmo shape de resposta) |
| `list_tasks_by_project` | `(project_name_or_id)` — fuzzy por prefixo | `list_tasks_by_project` |
| `search_tasks` | `(query)` | `search_tasks` |
| `create_task` | `(title, project_name?, priority?, type?, due_date?, due_time?, description?, parent_id?)` — sem projeto → Inbox; `type` default `task` | `create_task` + `create_subtask` |
| `update_task` | `(task_id, ...)` | `update_task` |
| `complete_task` | `(task_id, cascade=False)` — `needs_cascade` → perguntar e repetir | `complete_task` |
| `reopen_task` | `(task_id)` | — (novo) |
| `delete_task` | `(task_id)` — **sempre** confirmar antes (regra preservada) | `delete_task` |
| `restore_task` | `(task_id)` | — (novo) |
| `list_subtasks` | coberto por `list_tasks_*` (subtarefas aninhadas) | `list_subtasks` |

Não migram (eram do TickTick, sem equivalente no modelo novo): `add_checklist_item`,
`complete_checklist_item` — checklist vira subtarefa (mais simples, mesmo valor).

## Tools cross-agent (reescritas)

| Tool | Comportamento novo |
|---|---|
| `complete_payment_task` | `(task_id, amount, category, account)` — completa a tarefa **e** lança a despesa (helper `create_transaction_on_cursor` da Nami) numa única transação; tudo-ou-nada (some o status `partial`). Confirmar valor/categoria/conta antes — sem defaults financeiros (regra preservada) |
| `create_expense_reminder` | `(title, due_date, project_name="Finanças", amount?, description?)` — cria a tarefa de lembrete **no Postgres** (antes: TickTick). Não lança despesa |

## MCP mantido (intacto)

`mcp_servers/calendar/server.py` — todas as tools de agenda
(`list_events_today`, `create_event`, `find_free_slots`, ...) continuam como estão.
A consulta "o que tenho pra hoje?" combina `list_tasks_today` (banco) +
`list_events_today` (MCP), como a instrução já orienta.

## Regras de comportamento (preservadas do CLAUDE.md da Kaguya)

- Chamar a tool primeiro, responder depois (nunca "aguarde...").
- `list_tasks_today` já traz vencidas — não combinar com chamadas redundantes.
- `delete_task` e `delete_project` são destrutivas → confirmação explícita sempre.
- Projetos resolvidos dinamicamente por nome (fuzzy por prefixo) — nunca nomes fixos.
- Personalidade Kaguya e formatação HTML do Telegram inalteradas.
