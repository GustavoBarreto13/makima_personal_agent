"""Lista de tools públicas da Lucy, para exposição via MCP (mcp_servers/makima).

Extraído de agents/lucy/agent.py (mesma lista passada a Agent(tools=[...])) — nenhuma
lógica nova aqui, só o registro. Usado por mcp_servers/makima/registry.py (Etapa E6 da
spec 064) e continua sendo importado por agent.py, que não muda de comportamento.

Garantia estrutural de leitura preservada: só as 3 tools read-only de agents/lucy/tools.py
são listadas aqui — as capacidades de escrita (label/archive) vivem em gmail_imap.py mas
nunca são registradas como tool, nem aqui nem em agent.py.
"""

from agents.lucy.tools import fetch_recent_emails, get_email, search_emails

TOOLS = [
    fetch_recent_emails,
    search_emails,
    get_email,
]
