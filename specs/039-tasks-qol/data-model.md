# Data Model: QoL — arquivar listas + localização nos eventos

## Parte A — Arquivar listas

**Nenhuma migração de schema.** `task_projects.archived_at TIMESTAMPTZ` já existe
(`agents/kaguya/schema_tasks_pg.sql`) e passa a ter dois gravadores em vez de um:

| Gravador | Ação em `archived_at` | Ação em tarefas/colunas |
|---|---|---|
| `delete_project(mode)` (já existia) | `now()` | reaponta p/ Inbox OU soft-delete, colunas apagadas (hard delete) |
| `archive_project(id)` (novo) | `now()` | **nenhuma** — tarefas e colunas intocadas |
| `restore_project(id)` (novo) | `NULL` | **nenhuma** |

Regras de negócio (aplicação, não CHECK novo):
- `archive_project`: rejeita se `is_inbox` (`{"status":"error","message":"O Inbox não pode ser arquivado."}`) ou se já arquivada.
- `restore_project`: rejeita se já estiver ativa (`archived_at IS NULL`).
- `list_archived_projects()`: `SELECT id, name, group_id, color, icon, archived_at,` + contagem de tarefas
  (`(SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND deleted_at IS NULL) AS task_count`)
  `FROM task_projects WHERE archived_at IS NOT NULL ORDER BY archived_at DESC`.

### Views afetadas (todas ganham `AND p.archived_at IS NULL` no JOIN com `task_projects`)

| Módulo | Função | Consumidor |
|---|---|---|
| `tools_filters.py` | `_build_where_from_rules` (`base`) | smart-lists salvas + as 5 views fixas (`tools_views.py`) + filtro de Kanban view (`tools_kanban_views.py`) |
| `tools_calendar.py` | `list_tasks_in_range` (2 queries) | `CalendarScreen` (mês/semana) + suspensão de recorrência |
| `tools_tags.py` | `list_tasks_by_tag` | clique em tag na sidebar |
| `tools_tasks.py` | `list_tasks_today` | widget hoje/vencidas |
| `tools_tasks.py` | `list_eisenhower_tasks` | matriz Eisenhower |
| `tools_tasks.py` | `list_my_day` (3 queries) | Meu Dia |

### Exceção (não filtra — FR-003)

| Módulo | Função | Mudança |
|---|---|---|
| `tools_tasks.py` | `search_tasks` | adiciona `p.archived_at IS NOT NULL AS project_archived` ao SELECT; item serializado ganha `"archived": bool` |

### Sidebar/contagens (já filtravam — confirmado, sem mudança)

`get_sidebar()` (linha 145) e `list_projects_of_group` (linha 669) já têm
`archived_at IS NULL` — nenhum ajuste necessário.

## Parte B — Localização nos eventos

**Nenhuma migração.** `location` já é uma string (endereço ou URL) normalizada por
`gcal._format_event()`; só passa a ser copiada também no payload do Meu Dia:

```
TimelineEvent (frontend, types.ts) ganha:
  location?: string          # espelha o "location" do dict de tools_tasks.py::_gcal_events_for_day
```

Nenhuma mudança em `CalEvent`/`CalendarItem` — já têm `loc?: string` (Calendar Hub).

## Requisitos → dados

| Requisito | Onde |
|---|---|
| FR-001/FR-005/FR-006 | `archive_project`/`restore_project` (reusam `archived_at`) |
| FR-002 | views da tabela acima, todas com `AND p.archived_at IS NULL` |
| FR-003 | `search_tasks` + campo `archived` no item |
| FR-004 | `list_archived_projects()` |
| FR-007 | `delete_project` inalterado |
| FR-008 | `resolve_project_id_by_name_any` (novo helper, sem filtro) + mensagem de erro específica |
| FR-009/FR-011 | `_gcal_events_for_day` inclui `location`; render condicional no frontend |
| FR-010/FR-012 | `mapsLinkFor()` (frontend, função pura) |
