"""Host Starlette único do makima-mcp: um FastMCP por domínio, montado sob /mcp/<domínio>.

Consumido pelo Hermes (ou qualquer cliente MCP compatível) via HTTP streamável. Ver
specs/064-hermes-multicanal/contracts/mcp-servers.md para o contrato completo.

Rodar localmente (fora de Docker):
    uvicorn mcp_servers.makima.app:app --host 0.0.0.0 --port 8090
"""

from contextlib import AsyncExitStack, asynccontextmanager

from mcp.server.fastmcp import FastMCP
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.routing import Mount

from mcp_servers.makima.auth import BearerAuthMiddleware
from mcp_servers.makima.registry import DOMAINS


def _build_domain_app(name: str, tools: list):
    """Cria um FastMCP para um domínio, registra suas tools e devolve o app HTTP.

    ``streamable_http_path="/"`` é necessário porque o app resultante é montado sob
    ``/mcp/<domínio>`` no host Starlette — sem isso, o path efetivo duplicaria "mcp"
    (``/mcp/<domínio>/mcp``).
    """
    server = FastMCP(name, streamable_http_path="/")
    for tool in tools:
        server.tool()(tool)
    return server.streamable_http_app()


def _build_calendar_app():
    """Reaproveita o FastMCP já existente do Calendar (mcp_servers/calendar/server.py).

    Único domínio que não vem de um toolset.py de agente — só muda de transporte
    (stdio → HTTP streamável); as tools em si não mudam.
    """
    from mcp_servers.calendar.server import mcp as calendar_mcp

    calendar_mcp.settings.streamable_http_path = "/"
    return calendar_mcp.streamable_http_app()


def _build_legacy_app():
    """Monta a ponte legada (Etapa E2), se o módulo já existir.

    Encolhe/desaparece conforme os domínios migram para seu próprio toolset.py — por
    isso o import é condicional em vez de uma dependência direta no topo do arquivo.
    """
    try:
        from mcp_servers.makima.legacy import mcp as legacy_mcp
    except ImportError:
        return None

    legacy_mcp.settings.streamable_http_path = "/"
    return legacy_mcp.streamable_http_app()


def _build_domain_apps() -> dict:
    apps = {name: _build_domain_app(name, tools) for name, tools in DOMAINS.items()}
    apps["calendar"] = _build_calendar_app()

    legacy_app = _build_legacy_app()
    if legacy_app is not None:
        apps["legacy"] = legacy_app

    return apps


_domain_apps = _build_domain_apps()


@asynccontextmanager
async def _lifespan(_app: Starlette):
    # Cada FastMCP.streamable_http_app() carrega seu próprio session manager via
    # lifespan — Starlette não propaga lifespan de apps montados (Mount) automaticamente,
    # então compomos todos manualmente num único AsyncExitStack (padrão documentado do
    # SDK oficial para hospedar múltiplos servidores MCP num só processo).
    async with AsyncExitStack() as stack:
        for sub_app in _domain_apps.values():
            await stack.enter_async_context(sub_app.router.lifespan_context(sub_app))
        yield


app = Starlette(
    routes=[Mount(f"/mcp/{name}", app=sub_app) for name, sub_app in _domain_apps.items()],
    middleware=[Middleware(BearerAuthMiddleware)],
    lifespan=_lifespan,
)
