"""Testes de mcp_servers/makima/ — registry, auth e montagem do host MCP (spec 064 E1/E2).

Cobre a parte de lógica nova não-trivial citada em specs/064-hermes-multicanal/plan.md:
o registro dinâmico de tools por domínio (registry.py + app.py) e a exigência de bearer
token (auth.py). Usa Starlette TestClient — não sobe um processo uvicorn de verdade.
"""

import os

os.environ.setdefault("MAKIMA_MCP_TOKEN", "test-token")

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.responses import PlainTextResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from mcp_servers.makima.auth import BearerAuthMiddleware
from mcp_servers.makima.registry import DOMAINS


def _dummy_app():
    async def _ok(request):
        return PlainTextResponse("ok")

    return Starlette(
        routes=[Route("/ping", _ok)],
        middleware=[Middleware(BearerAuthMiddleware)],
    )


def test_registry_has_all_migrated_domains_with_callables():
    # Etapa E6 migrou os 7 domínios que faltavam além de nami/kaguya (E1) — todos devem
    # estar em DOMAINS com pelo menos uma tool, todas callables.
    expected_domains = {
        "nami", "kaguya", "frieren", "akane", "komi", "marin", "mai", "lucy", "kurisu",
    }
    assert expected_domains <= DOMAINS.keys()
    for name, tools in DOMAINS.items():
        assert len(tools) > 0, f"domínio {name} sem tools"
        assert all(callable(tool) for tool in tools), f"domínio {name} tem tool não-callable"


def test_registry_excludes_on_cursor_variants():
    # *_on_cursor recebem um cursor psycopg2 aberto — não são serializáveis por MCP e
    # devem continuar privadas (data-model.md).
    for tools in DOMAINS.values():
        assert all(not tool.__name__.endswith("_on_cursor") for tool in tools)


def test_auth_middleware_rejects_missing_header():
    client = TestClient(_dummy_app())
    resp = client.get("/ping")
    assert resp.status_code == 401


def test_auth_middleware_rejects_wrong_token():
    client = TestClient(_dummy_app())
    resp = client.get("/ping", headers={"Authorization": "Bearer wrong-token"})
    assert resp.status_code == 401


def test_auth_middleware_accepts_correct_token():
    client = TestClient(_dummy_app())
    resp = client.get("/ping", headers={"Authorization": "Bearer test-token"})
    assert resp.status_code == 200
    assert resp.text == "ok"


def test_app_mounts_one_route_per_domain_plus_calendar():
    # Import isolado (fora do topo do arquivo) para dar tempo do MAKIMA_MCP_TOKEN
    # default já estar setado antes do módulo carregar suas dependências.
    import mcp_servers.makima.app as app_module

    mounted_paths = {route.path for route in app_module.app.routes}
    for domain in DOMAINS:
        assert f"/mcp/{domain}" in mounted_paths
    assert "/mcp/calendar" in mounted_paths


def test_domain_apps_disable_dns_rebinding_protection():
    # Regressão: o FastMCP do SDK liga por padrão uma checagem de Host header que só
    # aceita 127.0.0.1/localhost — em produção isso rejeitava (421) o hostname real do
    # Docker Compose (makima-mcp:8090) que o Hermes usa para chegar aqui. A proteção é
    # redundante neste host (rede interna + BearerAuthMiddleware já cobre o mesmo risco)
    # e precisa continuar desligada em todo domínio, ou o handshake MCP quebra de novo.
    import mcp_servers.makima.app as app_module  # noqa: F401 — garante o módulo carregado

    from starlette.testclient import TestClient

    # TestClient só dispara o lifespan (que inicializa o session manager do FastMCP)
    # quando usado como context manager — fora dele, o handshake falha com
    # "Task group is not initialized", independente do fix de Host header.
    with TestClient(app_module.app) as client:
        resp = client.post(
            "/mcp/nami/",
            headers={
                "Host": "makima-mcp:8090",
                "Authorization": "Bearer test-token",
                "Accept": "application/json, text/event-stream",
                "Content-Type": "application/json",
            },
            json={
                "jsonrpc": "2.0", "id": 1, "method": "initialize",
                "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                           "clientInfo": {"name": "test", "version": "1"}},
            },
        )
    assert resp.status_code == 200, resp.text
