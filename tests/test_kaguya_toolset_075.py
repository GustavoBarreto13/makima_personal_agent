"""O conjunto de tools da Kaguya exposto ao Hermes/MCP (spec 075): paridade com o webapp.

Garante que a lista não tem nomes repetidos, que as capacidades novas estão lá (agenda, dependências, templates,
metas, experimentos, foco, grupos, edição em massa…) e que o FastMCP consegue montar o schema de todas elas.
"""

from agents.kaguya.toolset import TOOLS

NAMES = [f.__name__ for f in TOOLS]

ESPERADAS = {
    # agenda de trabalho e exceções
    "get_schedule_prefs", "set_schedule_prefs", "set_schedule_override", "clear_schedule_override",
    # dependências, templates, logbook, planejamento
    "add_dependency", "duplicate_task", "apply_template", "list_completed", "get_planning_insights",
    # metas e experimentos
    "create_goal", "list_goals", "add_milestone", "review_goal", "create_experiment", "log_experiment", "review_experiment",
    # foco
    "start_focus_session", "finish_focus_session", "cancel_focus_session", "get_focus_stats",
    # grupos, inbox, férias, massa
    "create_group", "set_group_context", "list_inbox_queue", "set_myday_prefs", "bulk_update_tasks", "undo_bulk_update",
    # hábitos arquivados
    "unarchive_habit", "list_archived_habits",
}


def test_sem_nomes_repetidos():
    assert len(NAMES) == len(set(NAMES))


def test_capacidades_do_webapp_estao_no_telegram():
    assert ESPERADAS <= set(NAMES), sorted(ESPERADAS - set(NAMES))


def test_todas_as_tools_tem_docstring():
    # O LLM escolhe a tool pela descrição: sem docstring ela fica invisível.
    sem = [f.__name__ for f in TOOLS if not (f.__doc__ or "").strip()]
    assert not sem, sem


def test_fastmcp_monta_o_schema_de_todas():
    from mcp.server.fastmcp import FastMCP

    server = FastMCP("kaguya-test")
    for f in TOOLS:
        server.add_tool(f)
    assert len(server._tool_manager.list_tools()) == len(TOOLS)
