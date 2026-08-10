"""Lista de tools públicas da Kurisu, para exposição via MCP (mcp_servers/makima).

Extraído de agents/kurisu/agent.py (mesma lista passada a Agent(tools=[...])) — nenhuma
lógica nova aqui, só o registro. Usado por mcp_servers/makima/registry.py (Etapa E6 da
spec 064) e continua sendo importado por agent.py, que não muda de comportamento.

buscar_na_base faz lazy init do Vertex AI RAG na primeira chamada, não no import —
seguro para ser registrado num FastMCP sem inicializar o Vertex AI cedo demais.
"""

from agents.kurisu.tools import buscar_na_base

TOOLS = [
    buscar_na_base,
]
