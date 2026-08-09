"""Lista de tools públicas da Kaguya (tarefas), para exposição via MCP (mcp_servers/makima).

Extraído de agents/kaguya/agent.py (mesma lista passada a Agent(tools=[...]), exceto o
McpToolset do Calendar — que já é montado separadamente sob /mcp/calendar) — nenhuma
lógica nova aqui, só o registro. Usado por mcp_servers/makima/registry.py (Etapa E1 da
spec 064) e continua sendo importado por agent.py, que não muda de comportamento.

Exclui variantes `*_on_cursor` (recebem cursor psycopg2 aberto, não serializáveis por
MCP) — essas seguem privadas, chamadas internamente pelas fachadas públicas.
"""

from agents.kaguya.tools import (
    list_projects, create_project, update_project, delete_project,
    archive_project, restore_project, list_archived_projects,
    list_tasks_today, list_tasks_by_project, search_tasks,
    create_task, update_task, complete_task, reopen_task, delete_task, restore_task,
    set_task_recurrence, clear_recurrence,
    add_task_tag, remove_task_tag, list_tasks_by_tag,
    list_filters, create_filter, update_filter, delete_filter,
    list_tasks_by_filter_name, list_today_overdue,
    list_tasks_in_range,
    list_habits, create_habit, update_habit, archive_habit,
    check_in_habit, remove_check_in, habit_status,
    complete_payment_task, create_expense_reminder,
    # Meu Dia (fatia 016)
    plan_my_day, my_day_status,
    add_to_my_day_by_name, remove_from_my_day_by_name,
    set_estimate_by_name,
    # Eisenhower (fatia 017)
    eisenhower_status,
    # Calendar Hub (fatia 019)
    list_week_with_hub,
    # GTD core: processamento do inbox + views fixas de mercado (spec 034)
    process_inbox_item, resolve_view_by_name,
)

TOOLS = [
    # Listas e tarefas (camada de lógica própria)
    list_projects, create_project, update_project, delete_project,
    # Arquivar/restaurar listas (spec 039) — distinto de excluir
    archive_project, restore_project, list_archived_projects,
    list_tasks_today, list_tasks_by_project, search_tasks,
    create_task, update_task, complete_task, reopen_task, delete_task, restore_task,
    # Recorrência (Fase 2)
    set_task_recurrence, clear_recurrence,
    # Tags / etiquetas (fatia 013)
    add_task_tag, remove_task_tag, list_tasks_by_tag,
    # Smart-lists (filtros salvos) — fatia 013 / P2
    list_filters, create_filter, update_filter, delete_filter,
    list_tasks_by_filter_name, list_today_overdue,
    # Calendário: consulta por intervalo — fatia 013 / P3; hub integrado — fatia 019
    list_tasks_in_range,
    list_week_with_hub,
    # Hábitos (Fase 4 / fatia 014)
    list_habits, create_habit, update_habit, archive_habit,
    check_in_habit, remove_check_in, habit_status,
    # Meu Dia (fatia 016)
    plan_my_day, my_day_status,
    add_to_my_day_by_name, remove_from_my_day_by_name,
    set_estimate_by_name,
    # Eisenhower (fatia 017)
    eisenhower_status,
    # Cross-agent (Kaguya + Nami)
    complete_payment_task, create_expense_reminder,
    # GTD core: processamento do inbox + views fixas de mercado (spec 034)
    process_inbox_item, resolve_view_by_name,
]
