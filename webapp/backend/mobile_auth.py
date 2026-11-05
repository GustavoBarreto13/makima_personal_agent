"""Autenticação do app Android: token de acesso, refresh token rotativo e aparelhos.

O site continua usando o cookie `makima_session`. O app não consegue usar cookie de forma
confiável nem o login por redirecionamento do Google (que bloqueia WebView), então ele:

1. faz o login nativo do Google e recebe um **ID token**;
2. troca esse ID token por um par (token de acesso curto, refresh token longo) em `POST /auth/mobile`;
3. manda o token de acesso em `Authorization: Bearer ...` e, quando ele expira, troca o
   refresh token por um par novo (o refresh é **rotativo**: cada um só vale uma vez).

Segurança em resumo:
    * O token de acesso usa um *salt* próprio (`makima-mobile`), então um cookie do site nunca
      é aceito como bearer (nem o contrário).
    * No banco fica só o SHA-256 do refresh token.
    * Reutilizar um refresh token antigo (sinal de roubo) revoga o aparelho inteiro.
    * Revogar um aparelho derruba o acesso em até `_ACTIVE_CACHE_TTL` segundos.

Usage:
    from webapp.backend.mobile_auth import create_device, read_access_token
"""

import hashlib
import hmac
import logging
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone

import itsdangerous

from webapp.backend.config import (
    GOOGLE_MOBILE_CLIENT_IDS,
    MOBILE_ACCESS_MAX_AGE,
    MOBILE_REFRESH_MAX_AGE_DAYS,
    SESSION_SECRET,
)

log = logging.getLogger("webapp.mobile_auth")

# Salt diferente do cookie ("makima-session") de propósito: tokens de contextos diferentes
# assinados com o mesmo segredo nunca se confundem.
_access_serializer = itsdangerous.URLSafeTimedSerializer(SESSION_SECRET, salt="makima-mobile")

# Cache curto de "este aparelho ainda está ativo?" para não consultar o banco em TODA requisição.
_ACTIVE_CACHE_TTL = 60  # segundos
_active_cache: dict[str, tuple[bool, float]] = {}


class MobileAuthError(Exception):
    """Falha de autenticação do app, já com o código HTTP que o router deve devolver.

    Attributes:
        status: Código HTTP (401, 403 ou 503).
        message: Texto seguro para mostrar ao usuário.
    """

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


# ─── Google ID token ──────────────────────────────────────────────────────────

def verify_google_id_token(raw_token: str) -> dict:
    """Validar um ID token do Google e devolver as informações (claims) do usuário.

    Args:
        raw_token: ID token recebido do login nativo do Google no app.

    Returns:
        Claims do token (`email`, `email_verified`, `name`, `aud`, ...).

    Raises:
        MobileAuthError: 503 se o login mobile não está configurado; 401 se o token for
            inválido, expirado ou emitido para outro app (audiência errada).
    """
    if not GOOGLE_MOBILE_CLIENT_IDS:
        raise MobileAuthError(503, "Login mobile não configurado no servidor.")

    # Import tardio: o site não precisa carregar a biblioteca do Google se ninguém usa o app.
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    try:
        # Confere assinatura (chaves públicas do Google), expiração e a audiência (`aud`).
        return id_token.verify_oauth2_token(
            raw_token, google_requests.Request(), audience=GOOGLE_MOBILE_CLIENT_IDS
        )
    except ValueError as exc:
        log.warning("ID token do Google recusado: %s", exc)
        raise MobileAuthError(401, "Token do Google inválido ou expirado.") from exc


# ─── Token de acesso (curto) ──────────────────────────────────────────────────

def issue_access_token(email: str, name: str, device_id: str) -> str:
    """Gerar o token de acesso assinado do app.

    Args:
        email: E-mail do usuário.
        name: Nome do usuário.
        device_id: Aparelho dono do token (permite revogar sem esperar expirar).

    Returns:
        Token assinado (string segura para usar em URL/cabeçalho).
    """
    return _access_serializer.dumps({"email": email, "name": name, "did": device_id})


def read_access_token(token: str) -> dict:
    """Validar o token de acesso e devolver os dados do usuário.

    Args:
        token: Valor depois de `Bearer ` no cabeçalho `Authorization`.

    Returns:
        Dicionário com `email`, `name` e `did` (id do aparelho).

    Raises:
        MobileAuthError: 401 se o token estiver expirado, adulterado ou o aparelho revogado.
    """
    try:
        payload: dict = _access_serializer.loads(token, max_age=MOBILE_ACCESS_MAX_AGE)
    except itsdangerous.SignatureExpired as exc:
        raise MobileAuthError(401, "Token expirado.") from exc
    except itsdangerous.BadData as exc:  # cobre assinatura inválida e payload corrompido
        raise MobileAuthError(401, "Token inválido.") from exc

    device_id = payload.get("did", "")
    if not device_id or not is_device_active(device_id):
        raise MobileAuthError(401, "Aparelho desconectado. Faça login novamente.")
    return payload


# ─── Refresh token (longo, rotativo) ──────────────────────────────────────────

def hash_refresh(refresh_token: str) -> str:
    """Calcular o SHA-256 do refresh token (é o que fica no banco).

    Args:
        refresh_token: Token completo `"<device_id>.<segredo>"`.

    Returns:
        Hash em hexadecimal.

    Example:
        >>> len(hash_refresh("abc.def"))
        64
    """
    return hashlib.sha256(refresh_token.encode()).hexdigest()


def new_refresh_token(device_id: str) -> str:
    """Criar um refresh token novo: o id do aparelho + um segredo aleatório de 384 bits.

    Embutir o `device_id` evita varrer a tabela inteira para achar de quem é o token.
    """
    return f"{device_id}.{secrets.token_urlsafe(48)}"


def split_refresh_token(refresh_token: str) -> str:
    """Extrair o `device_id` de um refresh token.

    Raises:
        MobileAuthError: 401 se o formato for inválido.
    """
    device_id, sep, secret = refresh_token.partition(".")
    if not sep or not device_id or not secret:
        raise MobileAuthError(401, "Refresh token inválido.")
    return device_id


# ─── Banco de dados (funções finas, fáceis de simular nos testes) ─────────────

def _db_insert_device(device_id: str, email: str, name: str, refresh_hash: str) -> None:
    from agents.db import get_conn

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO mobile_devices (id, email, name, refresh_hash) VALUES (%s, %s, %s, %s)",
            (device_id, email, name, refresh_hash),
        )


def _db_get_device(device_id: str) -> dict | None:
    import psycopg2.extras

    from agents.db import get_conn

    with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT id, email, name, refresh_hash, last_used_at, revoked_at "
            "FROM mobile_devices WHERE id = %s",
            (device_id,),
        )
        row = cur.fetchone()
    return dict(row) if row else None


def _db_update_refresh(device_id: str, refresh_hash: str) -> None:
    from agents.db import get_conn

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE mobile_devices SET refresh_hash = %s, last_used_at = NOW() WHERE id = %s",
            (refresh_hash, device_id),
        )


def _db_revoke(device_id: str) -> None:
    from agents.db import get_conn

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE mobile_devices SET revoked_at = NOW() WHERE id = %s AND revoked_at IS NULL",
            (device_id,),
        )


def _db_list_devices(email: str) -> list[dict]:
    import psycopg2.extras

    from agents.db import get_conn

    with get_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT id, name, created_at, last_used_at FROM mobile_devices "
            "WHERE email = %s AND revoked_at IS NULL ORDER BY last_used_at DESC",
            (email,),
        )
        return [dict(r) for r in cur.fetchall()]


# ─── Operações de alto nível ──────────────────────────────────────────────────

def create_device(email: str, name: str, device_name: str) -> tuple[str, str]:
    """Registrar um aparelho novo (primeiro login) e gerar seu primeiro refresh token.

    Args:
        email: E-mail já validado contra `ALLOWED_EMAIL`.
        name: Nome do usuário (vai no token de acesso).
        device_name: Nome amigável do aparelho.

    Returns:
        Tupla `(device_id, refresh_token)`.
    """
    device_id = uuid.uuid4().hex
    refresh = new_refresh_token(device_id)
    # `name` aqui é o nome do APARELHO; o nome da pessoa só circula no token de acesso.
    _db_insert_device(device_id, email, device_name[:80] or "Android", hash_refresh(refresh))
    return device_id, refresh


def rotate_refresh(refresh_token: str) -> dict:
    """Trocar um refresh token válido por um novo (rotação) e devolver os dados do aparelho.

    Args:
        refresh_token: Refresh token atual do app.

    Returns:
        Dicionário com `device_id`, `email` e `refresh_token` (o novo).

    Raises:
        MobileAuthError: 401 se o aparelho não existe, foi revogado, o token expirou por
            inatividade ou **já foi usado** (reuso => aparelho revogado por segurança).
    """
    device_id = split_refresh_token(refresh_token)
    device = _db_get_device(device_id)
    if device is None or device["revoked_at"] is not None:
        raise MobileAuthError(401, "Aparelho desconectado. Faça login novamente.")

    # Expiração deslizante: sem abrir o app por 90 dias, o refresh morre.
    limite = datetime.now(timezone.utc) - timedelta(days=MOBILE_REFRESH_MAX_AGE_DAYS)
    if device["last_used_at"] < limite:
        raise MobileAuthError(401, "Sessão expirada. Faça login novamente.")

    # compare_digest evita ataque de tempo (descobrir o hash letra por letra pela demora).
    if not hmac.compare_digest(device["refresh_hash"], hash_refresh(refresh_token)):
        # Alguém apresentou um refresh que já foi trocado: ou o app antigo ou um ladrão.
        # Na dúvida, derruba o aparelho — o usuário só precisa logar de novo.
        log.warning("Reuso de refresh token detectado — aparelho %s revogado.", device_id)
        revoke_device(device_id)
        raise MobileAuthError(401, "Sessão inválida. Faça login novamente.")

    novo = new_refresh_token(device_id)
    _db_update_refresh(device_id, hash_refresh(novo))
    return {"device_id": device_id, "email": device["email"], "refresh_token": novo}


def revoke_device(device_id: str) -> None:
    """Desconectar um aparelho e esquecer o cache de "ativo"."""
    _db_revoke(device_id)
    _active_cache.pop(device_id, None)


def list_devices(email: str) -> list[dict]:
    """Listar os aparelhos ativos de um e-mail (para a tela "aparelhos conectados")."""
    return _db_list_devices(email)


def is_device_active(device_id: str) -> bool:
    """Dizer se o aparelho existe e não foi revogado (com cache de `_ACTIVE_CACHE_TTL` s)."""
    agora = time.monotonic()
    cached = _active_cache.get(device_id)
    if cached and agora - cached[1] < _ACTIVE_CACHE_TTL:
        return cached[0]

    device = _db_get_device(device_id)
    ativo = device is not None and device["revoked_at"] is None
    _active_cache[device_id] = (ativo, agora)
    return ativo
