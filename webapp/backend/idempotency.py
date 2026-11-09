"""Idempotência das escritas feitas offline: o mesmo `Idempotency-Key` nunca grava duas vezes.

Quando o app volta a ter internet, ele reenvia a fila de escritas. Se a resposta de um envio anterior
se perdeu no caminho, o servidor já gravou e o reenvio duplicaria a tarefa/o gasto. Para isso o app
manda o id único do item no cabeçalho `Idempotency-Key`; este middleware:

    1. reserva a chave no banco (`idempotency_keys`) antes de rodar a rota;
    2. se a chave já terminou antes, devolve a MESMA resposta guardada (sem rodar a rota);
    3. se outra requisição com a mesma chave ainda está rodando, responde 503 (o app tenta de novo);
    4. guarda a resposta quando a rota termina com sucesso (2xx); em erro, solta a chave para o
       reenvio poder tentar de novo.

Só vale para POSTs de uma lista fechada de rotas; sem o cabeçalho, nada muda (o site segue igual).

Usage:
    app.add_middleware(IdempotencyMiddleware)
"""

import logging
import re

from starlette.concurrency import run_in_threadpool
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from agents.db import get_conn

log = logging.getLogger("webapp.idempotency")

# Escritas que o app enfileira offline (ver webapp/frontend/src/lib/offlineWrites.ts).
_ROUTES = re.compile(
    r"^/api/(tasks|tasks/bulk|tasks/\d+/complete|tasks/habits/\d+/checkin"
    r"|finances/transactions|journal/bullets)$"
)
HEADER = "Idempotency-Key"
_MAX_KEY_LEN = 100
# Uma requisição "em andamento" há mais que isso morreu no meio (deploy, queda): a chave pode ser retomada.
_STALE_PENDING_SECONDS = 120
_RETENTION_DAYS = 30


def is_eligible(method: str, path: str) -> bool:
    """Diz se esta requisição participa da idempotência.

    Args:
        method: Verbo HTTP.
        path: Caminho da URL (sem query).

    Returns:
        `True` só para POSTs das rotas de escrita offline.

    Example:
        >>> is_eligible("POST", "/api/tasks")
        True
        >>> is_eligible("GET", "/api/tasks")
        False
    """
    return method == "POST" and bool(_ROUTES.match(path))


def begin(key: str, route: str) -> tuple:
    """Reserva a chave ou descobre o que aconteceu com ela.

    Args:
        key: Valor do `Idempotency-Key`.
        route: Caminho da rota (para depuração).

    Returns:
        `("run",)` se esta requisição deve rodar a rota; `("replay", status, corpo)` se a chave já
        terminou antes; `("busy",)` se outra requisição com a mesma chave ainda está em andamento.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Limpeza barata (índice em created_at): mantém a tabela pequena sem precisar de job.
            cur.execute(
                "DELETE FROM idempotency_keys WHERE created_at < NOW() - make_interval(days => %s)",
                (_RETENTION_DAYS,),
            )
            cur.execute(
                "INSERT INTO idempotency_keys (key, route) VALUES (%s, %s) ON CONFLICT (key) DO NOTHING",
                (key, route),
            )
            if cur.rowcount == 1:
                return ("run",)
            cur.execute("SELECT status, response, created_at FROM idempotency_keys WHERE key = %s", (key,))
            row = cur.fetchone()
            if row is None:  # apagada no meio: tenta de novo na próxima
                return ("busy",)
            status, response, _ = row
            if status is not None:
                return ("replay", status, response or "")
            # Reserva sem resposta: ou está rodando agora, ou morreu no meio. Retoma se for velha.
            cur.execute(
                "UPDATE idempotency_keys SET created_at = NOW() WHERE key = %s AND status IS NULL "
                "AND created_at < NOW() - make_interval(secs => %s)",
                (key, _STALE_PENDING_SECONDS),
            )
            return ("run",) if cur.rowcount == 1 else ("busy",)


def finish(key: str, status: int, body: str) -> None:
    """Guarda a resposta de sucesso para os reenvios.

    Args:
        key: Valor do `Idempotency-Key`.
        status: Código HTTP devolvido.
        body: Corpo da resposta (JSON em texto).
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE idempotency_keys SET status = %s, response = %s WHERE key = %s", (status, body, key))


def release(key: str) -> None:
    """Solta a chave (a rota falhou): o reenvio poderá tentar de novo.

    Args:
        key: Valor do `Idempotency-Key`.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM idempotency_keys WHERE key = %s AND status IS NULL", (key,))


class IdempotencyMiddleware(BaseHTTPMiddleware):
    """Aplica a regra acima às rotas de escrita que o app enfileira offline."""

    @staticmethod
    async def _safely(fn, *args) -> None:
        """Roda uma função de banco numa thread sem nunca derrubar a resposta (a escrita já aconteceu)."""
        try:
            await run_in_threadpool(fn, *args)
        except Exception:  # noqa: BLE001
            log.exception("Falha ao atualizar a chave de idempotência.")

    async def dispatch(self, request, call_next):
        key = request.headers.get(HEADER)
        if not key or len(key) > _MAX_KEY_LEN or not is_eligible(request.method, request.url.path):
            return await call_next(request)
        # Sem credencial a rota vai responder 401 de qualquer jeito: nunca devolver resposta guardada
        # a quem nem se identificou (a chave é um UUID, mas a defesa é barata).
        if not (request.headers.get("authorization") or request.cookies.get("makima_session")):
            return await call_next(request)

        # As funções de banco são síncronas: rodam numa thread para não travar o servidor.
        try:
            estado = await run_in_threadpool(begin, key, request.url.path)
        except Exception:  # noqa: BLE001 — ex.: tabela ainda não criada (deploy antes do setup_schemas)
            # Sem a tabela a escrita continua funcionando, só sem a proteção contra repetição.
            log.exception("Idempotência indisponível; seguindo sem ela.")
            return await call_next(request)
        if estado[0] == "busy":
            # 503 conta como "temporário" para a fila do app: ele espera e reenvia.
            return JSONResponse({"detail": "Esta escrita ainda está sendo processada."}, status_code=503)
        if estado[0] == "replay":
            return Response(
                content=estado[2], status_code=estado[1], media_type="application/json",
                headers={"Idempotent-Replay": "true"},
            )

        try:
            response = await call_next(request)
        except Exception:
            await self._safely(release, key)
            raise

        corpo = b"".join([chunk async for chunk in response.body_iterator])
        if 200 <= response.status_code < 300:
            await self._safely(finish, key, response.status_code, corpo.decode("utf-8", "replace"))
        else:
            await self._safely(release, key)

        # O corpo já foi lido: reconstrói a resposta com os mesmos cabeçalhos.
        novo = Response(content=corpo, status_code=response.status_code)
        novo.raw_headers = list(response.raw_headers)
        return novo
