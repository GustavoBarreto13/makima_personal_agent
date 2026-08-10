"""Lista de tools públicas da Komi, para exposição via MCP (mcp_servers/makima).

Extraído de agents/komi/agent.py (mesma lista passada a Agent(tools=[...])) — nenhuma
lógica nova aqui, só o registro. Usado por mcp_servers/makima/registry.py (Etapa E6 da
spec 064) e continua sendo importado por agent.py, que não muda de comportamento.
"""

from agents.komi.tools import (
    create_person,
    update_person,
    delete_person,
    add_alias,
    add_important_date,
    list_people,
    find_people,
    get_person,
    get_person_summary,
)

TOOLS = [
    create_person,
    update_person,
    delete_person,
    add_alias,
    add_important_date,
    list_people,
    find_people,
    get_person,
    get_person_summary,
]
