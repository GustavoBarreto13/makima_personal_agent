"""Lista de tools públicas da Akane, para exposição via MCP (mcp_servers/makima).

Extraído de agents/akane/agent.py (mesma lista passada a Agent(tools=[...])) — nenhuma
lógica nova aqui, só o registro. Usado por mcp_servers/makima/registry.py (Etapa E6 da
spec 064) e continua sendo importado por agent.py, que não muda de comportamento.
"""

from agents.akane.tools import (
    search_movie,
    add_movie,
    add_to_watchlist,
    log_watch,
    rate_movie,
    set_like,
    update_movie_status,
    set_notes,
    list_movies,
    get_watchlist,
    get_diary,
    get_movie_detail,
    get_stats,
    get_home,
    get_rewind,
    create_movie_reminder,
)

TOOLS = [
    search_movie,
    add_movie,
    add_to_watchlist,
    log_watch,
    rate_movie,
    set_like,
    update_movie_status,
    set_notes,
    list_movies,
    get_watchlist,
    get_diary,
    get_movie_detail,
    get_stats,
    get_home,
    get_rewind,
    create_movie_reminder,
]
