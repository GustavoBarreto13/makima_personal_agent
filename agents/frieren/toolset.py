"""Lista de tools públicas da Frieren, para exposição via MCP (mcp_servers/makima).

Extraído de agents/frieren/agent.py (mesma lista passada a Agent(tools=[...])) — nenhuma
lógica nova aqui, só o registro. Usado por mcp_servers/makima/registry.py (Etapa E6 da
spec 064) e continua sendo importado por agent.py, que não muda de comportamento.
"""

from agents.frieren.tools import (
    search_book,
    add_book,
    log_reading,
    get_current_reading,
    get_reading_list,
    finish_book,
    update_book_status,
    update_book_pages,
    get_reading_stats,
    get_book_history,
    get_book_menu_data,
    delete_book,
    delete_reading_log,
)

TOOLS = [
    search_book,
    add_book,
    log_reading,
    get_current_reading,
    get_reading_list,
    finish_book,
    update_book_status,
    update_book_pages,
    get_reading_stats,
    get_book_history,
    get_book_menu_data,
    delete_book,
    delete_reading_log,
]
