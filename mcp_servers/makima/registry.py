"""Registro de domínios expostos via MCP HTTP (mcp_servers/makima/app.py).

Ponto único de verdade sobre quais domínios estão expostos no momento. Cresceu de Nami +
Kaguya (Etapa E1) para os 9 domínios de agente (Etapa E6) e depois para os 10, com a
ativação da Violet (agents/journal — chave "journal", personalidade "Violet").

Os domínios ``calendar`` (mcp_servers/calendar/server.py, um FastMCP já existente) e
``legacy`` (mcp_servers/makima/legacy.py, Etapa E2) não entram aqui — não vêm de um
``toolset.py`` de agente, são montados à parte por app.py.
"""

from typing import Callable

from agents.nami.toolset import TOOLS as _NAMI_TOOLS
from agents.kaguya.toolset import TOOLS as _KAGUYA_TOOLS
from agents.frieren.toolset import TOOLS as _FRIEREN_TOOLS
from agents.akane.toolset import TOOLS as _AKANE_TOOLS
from agents.komi.toolset import TOOLS as _KOMI_TOOLS
from agents.marin.toolset import TOOLS as _MARIN_TOOLS
from agents.mai.toolset import TOOLS as _MAI_TOOLS
from agents.lucy.toolset import TOOLS as _LUCY_TOOLS
from agents.kurisu.toolset import TOOLS as _KURISU_TOOLS
from agents.journal.toolset import TOOLS as _JOURNAL_TOOLS

DOMAINS: dict[str, list[Callable]] = {
    "nami": _NAMI_TOOLS,
    "kaguya": _KAGUYA_TOOLS,
    "frieren": _FRIEREN_TOOLS,
    "akane": _AKANE_TOOLS,
    "komi": _KOMI_TOOLS,
    "marin": _MARIN_TOOLS,
    "mai": _MAI_TOOLS,
    "lucy": _LUCY_TOOLS,
    "kurisu": _KURISU_TOOLS,
    "journal": _JOURNAL_TOOLS,
}
