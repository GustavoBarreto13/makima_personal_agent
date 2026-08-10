"""Lista de tools públicas da Mai, para exposição via MCP (mcp_servers/makima).

Extraído de agents/mai/agent.py (mesma lista passada a Agent(tools=[...])) — nenhuma
lógica nova aqui, só o registro. Usado por mcp_servers/makima/registry.py (Etapa E6 da
spec 064) e continua sendo importado por agent.py, que não muda de comportamento.
"""

from agents.mai.tools import (
    search_series,
    add_series,
    update_status,
    rate_series,
    set_notes,
    log_watch,
    list_series,
    get_series_detail,
    get_watchlist,
    get_currently_watching,
    get_diary,
    get_upcoming,
    get_stats,
    sync_metadata,
    delete_series,
    get_episodes_for_season,
)

TOOLS = [
    search_series,
    add_series,
    update_status,
    rate_series,
    set_notes,
    log_watch,
    list_series,
    get_series_detail,
    get_watchlist,
    get_currently_watching,
    get_diary,
    get_upcoming,
    get_stats,
    sync_metadata,
    delete_series,
    get_episodes_for_season,
]
