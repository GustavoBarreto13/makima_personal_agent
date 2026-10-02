"""Middleware de autenticação bearer token do host MCP (mcp_servers/makima/app.py).

Contrato (specs/064-hermes-multicanal/contracts/mcp-servers.md): toda requisição precisa
do header ``Authorization: Bearer ${MAKIMA_MCP_TOKEN}``; ausência ou token incorreto MUST
resultar em 401.

Além do token do Hermes (acesso total, ``MAKIMA_MCP_TOKEN``), este módulo aceita um
segundo tipo de token — ``MAKIMA_MCP_EXTERNAL_TOKENS`` — para clientes MCP externos
(Claude Code, Cursor, VS Code, Claude Desktop via ``mcp-remote`` etc.) que conectam pela
porta pública via Traefik/Dokploy. O token externo é **escopado por domínio**
(``MAKIMA_MCP_EXTERNAL_DOMAINS``, default só ``kaguya``): mesmo que a config de rede do
Traefik seja alargada por engano para outro path, o token externo continua sem acesso a
domínios fora da lista — defesa em profundidade independente da camada de rede.
"""

import hmac
import logging
import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)


def _parse_csv_env(name: str, default: str = "") -> list[str]:
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _extract_bearer_token(auth_header: str) -> str | None:
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _domain_from_path(path: str) -> str | None:
    # Paths montados como /mcp/<domínio> ou /mcp/<domínio>/... (ex.: /mcp/kaguya/).
    parts = [p for p in path.split("/") if p]
    if len(parts) >= 2 and parts[0] == "mcp":
        return parts[1]
    return None


class BearerAuthMiddleware(BaseHTTPMiddleware):
    """Exige ``Authorization: Bearer <token>`` em toda requisição.

    Dois tokens válidos, com escopos diferentes:
    - ``MAKIMA_MCP_TOKEN``: acesso total (Hermes, rede interna).
    - qualquer token em ``MAKIMA_MCP_EXTERNAL_TOKENS``: acesso só aos domínios listados
      em ``MAKIMA_MCP_EXTERNAL_DOMAINS`` (default ``kaguya``).
    """

    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/healthz":
            return await call_next(request)

        internal_token = os.environ.get("MAKIMA_MCP_TOKEN", "")
        external_tokens = _parse_csv_env("MAKIMA_MCP_EXTERNAL_TOKENS")
        external_domains = set(_parse_csv_env("MAKIMA_MCP_EXTERNAL_DOMAINS", "kaguya"))

        token = _extract_bearer_token(request.headers.get("authorization", ""))

        if not token:
            logger.warning(
                "makima-mcp: 401 sem token (ip=%s path=%s)",
                _client_ip(request), request.url.path,
            )
            return JSONResponse({"error": "unauthorized"}, status_code=401)

        if internal_token and hmac.compare_digest(token, internal_token):
            return await call_next(request)

        matched_external = any(
            hmac.compare_digest(token, candidate) for candidate in external_tokens
        )
        if matched_external:
            domain = _domain_from_path(request.url.path)
            if domain in external_domains:
                return await call_next(request)
            logger.warning(
                "makima-mcp: 403 token externo fora de escopo (ip=%s path=%s)",
                _client_ip(request), request.url.path,
            )
            return JSONResponse({"error": "forbidden"}, status_code=403)

        logger.warning(
            "makima-mcp: 401 token incorreto (ip=%s path=%s)",
            _client_ip(request), request.url.path,
        )
        return JSONResponse({"error": "unauthorized"}, status_code=401)
