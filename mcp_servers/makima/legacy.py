"""Ponte legada MCP — mantém os domínios ainda não migrados vivos via o Runner ADK atual.

Etapa E2 da spec 064: expõe uma única tool, ``perguntar_makima_legado(mensagem,
chat_id)``, que instancia a Makima (coordinator/agent.py) com uma lista REDUZIDA de
sub_agents — só os domínios que ainda não têm servidor MCP nativo em
mcp_servers/makima/registry.py — e roda a mensagem pelo Runner ADK, devolvendo o texto
consolidado da resposta.

``_LEGACY_DOMAIN_AGENTS`` encolhe manualmente a cada domínio migrado (Etapa E6) e este
módulo inteiro é removido na Etapa E7, quando ``registry.DOMAINS`` cobrir os 10 domínios.

Rodar isolado para debug:
    python -m mcp_servers.makima.legacy
"""

import os

from dotenv import load_dotenv

load_dotenv()

# O ADK lê GOOGLE_API_KEY; o .env deste repo usa GEMINI_API_KEY — mesma ponte do coordinator.
os.environ.setdefault("GOOGLE_API_KEY", os.environ.get("GEMINI_API_KEY", ""))
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "False")

from google.adk.runners import Runner  # noqa: E402
from google.adk.sessions import DatabaseSessionService  # noqa: E402
from mcp.server.fastmcp import FastMCP  # noqa: E402

from coordinator.agent import create_makima  # noqa: E402
from coordinator.runner_utils import run_and_collect_text  # noqa: E402

# Domínios ainda não presentes em mcp_servers/makima/registry.py.DOMAINS — mesma lista
# do coordinator, exceto Nami e Kaguya (migrados na Etapa E1). Remover uma entrada daqui
# no mesmo commit em que o domínio ganha seu toolset.py (Etapa E6).
from agents.kurisu.agent import kurisu_agent  # noqa: E402
from agents.frieren.agent import frieren_agent  # noqa: E402
from agents.akane.agent import akane_agent  # noqa: E402
from agents.marin.agent import marin_agent  # noqa: E402
from agents.mai.agent import mai_agent  # noqa: E402
from agents.komi.agent import komi_agent  # noqa: E402
from agents.lucy.agent import lucy_agent  # noqa: E402

_LEGACY_DOMAIN_AGENTS = [
    kurisu_agent, frieren_agent, akane_agent, marin_agent, mai_agent, komi_agent, lucy_agent,
]

APP_NAME = "makima-legacy"

mcp = FastMCP("legacy")

_known_sessions: set[str] = set()
_runner: Runner | None = None  # construído lazy — ver _get_runner()


def _get_runner() -> Runner:
    """Constrói o Runner ADK da ponte legada na primeira chamada (memoizado).

    Lazy de propósito: ``create_makima()`` atribui cada item de _LEGACY_DOMAIN_AGENTS
    como sub_agent — como esses agentes são instâncias singleton (importadas de
    agents/<nome>/agent.py), o ADK rejeita associá-los a um segundo "pai" se
    coordinator/main.py (que monta sua PRÓPRIA Makima com a lista completa de
    sub_agents) já rodou no mesmo processo. Isso nunca acontece em produção — cada um
    roda no seu próprio container (makima-bot vs. makima-mcp) — mas construir aqui só
    na primeira chamada da tool evita a colisão em qualquer cenário que importe os dois
    módulos no mesmo processo (ex.: testes, um script de debug combinado).
    """
    global _runner
    if _runner is None:
        database_url = os.environ.get("DATABASE_URL", "").replace("postgresql://", "postgresql+asyncpg://", 1)
        session_service = DatabaseSessionService(db_url=database_url) if database_url else None
        makima_legacy = create_makima(sub_agents=_LEGACY_DOMAIN_AGENTS)
        _runner = Runner(agent=makima_legacy, app_name=APP_NAME, session_service=session_service)
    return _runner


@mcp.tool()
async def perguntar_makima_legado(mensagem: str, chat_id: str) -> str:
    """Encaminha uma mensagem para os domínios ainda não migrados para MCP nativo.

    Roda a mensagem pelo Runner ADK da Makima (coordinator/agent.py), restrito aos
    sub_agents que ainda não têm servidor MCP próprio (kurisu, frieren, akane, marin,
    mai, komi, lucy — ver _LEGACY_DOMAIN_AGENTS). Cobre exatamente os domínios que
    faltam em mcp_servers/makima/registry.py.DOMAINS.

    Args:
        mensagem: texto do usuário, repassado como está para o Runner ADK.
        chat_id: identificador estável do usuário (não precisa ser o chat_id literal do
            Telegram — qualquer string estável por usuário serve, usada como
            user_id/parte do session_id).

    Retorna:
        Texto de resposta consolidado do domínio que atendeu o pedido.
    """
    session_id = f"{chat_id}_legacy"
    response_text, _tokens_used = await run_and_collect_text(
        _get_runner(), APP_NAME, chat_id, session_id, mensagem, _known_sessions,
    )
    return response_text or "(sem resposta)"


if __name__ == "__main__":
    mcp.run(transport="stdio")
