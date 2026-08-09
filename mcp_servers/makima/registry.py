"""Registro de domínios expostos via MCP HTTP (mcp_servers/makima/app.py).

Ponto único de verdade sobre quais domínios estão expostos no momento. Cresce um item
por vez conforme a migração da spec 064 avança (Etapa E1: Nami + Kaguya; Etapa E6: os
7 domínios restantes, um de cada vez).

Os domínios ``calendar`` (mcp_servers/calendar/server.py, um FastMCP já existente) e
``legacy`` (mcp_servers/makima/legacy.py, Etapa E2) não entram aqui — não vêm de um
``toolset.py`` de agente, são montados à parte por app.py.
"""

from typing import Callable

from agents.nami.toolset import TOOLS as _NAMI_TOOLS
from agents.kaguya.toolset import TOOLS as _KAGUYA_TOOLS

DOMAINS: dict[str, list[Callable]] = {
    "nami": _NAMI_TOOLS,
    "kaguya": _KAGUYA_TOOLS,
}
