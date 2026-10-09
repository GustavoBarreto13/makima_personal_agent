"""Lista de tools públicas da Kaguya (tarefas), para exposição via MCP (mcp_servers/makima).

Extraído de agents/kaguya/agent.py (mesma lista passada a Agent(tools=[...]), exceto o
McpToolset do Calendar — que já é montado separadamente sob /mcp/calendar) — nenhuma
lógica nova aqui, só o registro. Usado por mcp_servers/makima/registry.py (Etapa E1 da
spec 064) e continua sendo importado por agent.py, que não muda de comportamento.

Exclui variantes `*_on_cursor` (recebem cursor psycopg2 aberto, não serializáveis por
MCP) — essas seguem privadas, chamadas internamente pelas fachadas públicas.
"""

from agents.kaguya.tools import (
    # Data/hora atual — âncora para resolver datas relativas ("amanhã", "ontem"…)
    get_current_datetime,
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
    # Alertas de hábito no Google Calendar + Meu Dia (spec 067)
    set_habit_reminders, add_habit_to_my_day_by_name,
    complete_payment_task, create_expense_reminder,
    # Meu Dia (fatia 016)
    plan_my_day, my_day_status,
    add_to_my_day_by_name, remove_from_my_day_by_name,
    set_estimate_by_name,
    # Time-blocking: compromisso com início e fim reais (fatia 016)
    set_time_block, clear_time_block,
    # Eisenhower (fatia 017)
    eisenhower_status,
    # Calendar Hub (fatia 019)
    list_week_with_hub,
    # GTD core: processamento do inbox + views fixas de mercado (spec 034)
    process_inbox_item, resolve_view_by_name,
)
from agents.kaguya.digest import get_pending_kaguya_digest, apply_kaguya_digest_selection
# Spec 075 — paridade com o webapp: agenda, dependências, templates, logbook, revisão e planejamento.
from agents.kaguya.tools_schedule import (
    get_schedule_prefs, set_schedule_prefs,
    list_schedule_overrides, set_schedule_override, clear_schedule_override,
)
from agents.kaguya.tools_dependencies import add_dependency, remove_dependency, list_dependencies
from agents.kaguya.tools_templates import (
    duplicate_task, duplicate_project, list_templates, apply_template,
    create_task_template, create_project_template, delete_template,
)
from agents.kaguya.tools_logbook import list_completed, list_trash_detailed
from agents.kaguya.tools_projects import list_projects_due_review
from agents.kaguya.tools_stats import get_planning_insights
from agents.kaguya.tools_tasks import get_task
from agents.kaguya.tools_contexts import list_contexts

TOOLS = [
    # Data/hora atual (America/Sao_Paulo) — âncora p/ datas relativas; a linha
    # "Conversation started" do Hermes congela na criação da sessão, não serve.
    get_current_datetime,
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
    # Alertas de hábito no Google Calendar + Meu Dia (spec 067)
    set_habit_reminders, add_habit_to_my_day_by_name,
    # Meu Dia (fatia 016)
    plan_my_day, my_day_status,
    add_to_my_day_by_name, remove_from_my_day_by_name,
    set_estimate_by_name,
    # Time-blocking: compromisso com início e fim reais (fatia 016)
    set_time_block, clear_time_block,
    # Eisenhower (fatia 017)
    eisenhower_status,
    # Cross-agent (Kaguya + Nami)
    complete_payment_task, create_expense_reminder,
    # GTD core: processamento do inbox + views fixas de mercado (spec 034)
    process_inbox_item, resolve_view_by_name,
    # Digest matinal (tarefas/agenda) → WhatsApp: reação do Hermes a uma resposta pendente
    get_pending_kaguya_digest, apply_kaguya_digest_selection,
    # ── Spec 075 ──
    # Agenda: expediente, almoço, acordar/dormir e exceções ("sábado vou trabalhar", "folga terça")
    get_schedule_prefs, set_schedule_prefs,
    list_schedule_overrides, set_schedule_override, clear_schedule_override,
    # Dependências ("só começa depois de…") e leitura de uma tarefa pelo id
    add_dependency, remove_dependency, list_dependencies, get_task,
    # Duplicar e templates
    duplicate_task, duplicate_project, list_templates, apply_template,
    create_task_template, create_project_template, delete_template,
    # Logbook (o que foi concluído), lixeira e contextos de execução (@casa, @rua…)
    list_completed, list_trash_detailed, list_contexts,
    # Revisão por cadência e onde o planejamento está falhando
    list_projects_due_review, get_planning_insights,
]
