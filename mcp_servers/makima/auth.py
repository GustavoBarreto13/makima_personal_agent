"""Middleware de autenticação bearer token do host MCP (mcp_servers/makima/app.py).

Contrato (specs/064-hermes-multicanal/contracts/mcp-servers.md): toda requisição precisa
do header ``Authorization: Bearer ${MAKIMA_MCP_TOKEN}``; ausência ou token incorreto MUST
resultar em 401.
"""

import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


class BearerAuthMiddleware(BaseHTTPMiddleware):
    """Exige ``Authorization: Bearer <MAKIMA_MCP_TOKEN>`` em toda requisição."""

    async def dispatch(self, request: Request, call_next):
        expected_token = os.environ.get("MAKIMA_MCP_TOKEN", "")
        auth_header = request.headers.get("authorization", "")

        # Sem token configurado no ambiente, ou header ausente/incorreto → 401.
        # Comparação simples (não é um segredo de alta sensibilidade cross-serviço
        # público; a rede já é interna/dokploy-network, isto é defesa em profundidade).
        if not expected_token or auth_header != f"Bearer {expected_token}":
            return JSONResponse({"error": "unauthorized"}, status_code=401)

        return await call_next(request)
