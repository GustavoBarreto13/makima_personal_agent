"""Dependências FastAPI para rotas protegidas da webapp Makima.

Este módulo fornece a dependência `require_user`, que valida o cookie de sessão
e retorna os dados do usuário autenticado. Use com `Depends()` em qualquer rota
que exija autenticação.

Usage:
    from webapp.backend.deps import require_user
    from fastapi import Depends

    @router.get("/endpoint-protegido")
    async def endpoint(user: dict = Depends(require_user)):
        return {"email": user["email"], "name": user["name"]}
"""

import itsdangerous  # Biblioteca de assinatura segura de dados (mesmo usado em auth.py)
from fastapi import Cookie, HTTPException, Request  # Cookie lê o cookie; Request dá acesso aos cabeçalhos

# Importa as constantes compartilhadas com o módulo de autenticação
from webapp.backend.config import ALLOWED_EMAIL, SESSION_COOKIE_NAME, SESSION_MAX_AGE, SESSION_SECRET
from webapp.backend.mobile_auth import MobileAuthError, read_access_token  # Login do app Android

# --- Serializer para validar os cookies de sessão ---

# Deve usar os MESMOS parâmetros usados em auth.py para assinar.
# Se qualquer parâmetro diferir (segredo, salt), a validação falhará.
_serializer = itsdangerous.URLSafeTimedSerializer(SESSION_SECRET, salt="makima-session")

# Aliases locais — SESSION_MAX_AGE e SESSION_COOKIE_NAME são fonte única de verdade (config.py)
_COOKIE_MAX_AGE = SESSION_MAX_AGE    # 7 dias em segundos
_COOKIE_NAME = SESSION_COOKIE_NAME   # "makima_session"


def user_from_bearer(authorization: str) -> dict:
    """Validar um cabeçalho `Authorization: Bearer ...` do app Android.

    Args:
        authorization: Valor completo do cabeçalho (ex.: "Bearer abc123").

    Returns:
        Dicionário com `email`, `name` e `did` (id do aparelho).

    Raises:
        HTTPException: 401 se o token for inválido/expirado/revogado; 403 se o e-mail
            do token não for mais o autorizado.
    """
    # Corta o prefixo "Bearer " (6 letras + espaço) e tira espaços sobrando
    token = authorization[7:].strip()
    try:
        payload = read_access_token(token)
    except MobileAuthError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message)

    # Se o ALLOWED_EMAIL mudar, tokens antigos de outro e-mail deixam de valer na hora.
    if ALLOWED_EMAIL and payload.get("email", "").lower() != ALLOWED_EMAIL.lower():
        raise HTTPException(status_code=403, detail="Acesso negado.")
    return payload


def require_user(request: Request, makima_session: str | None = Cookie(default=None)) -> dict:
    """Validar a sessão (bearer do app OU cookie do site) e retornar o usuário autenticado.

    Esta função é usada como dependência FastAPI (`Depends(require_user)`).
    Se a requisição trouxer `Authorization: Bearer ...` (app Android), valida o token do app.
    Caso contrário, o FastAPI extrai o cookie `makima_session` e valida como sempre.
    Se nada for válido, a requisição é interrompida com HTTP 401 (Unauthorized).

    Args:
        request: Requisição HTTP (para ler o cabeçalho Authorization).
        makima_session: Valor do cookie de sessão assinado, ou None se ausente.

    Returns:
        Dicionário com os dados do usuário:
        - "email" (str): Email do usuário autenticado.
        - "name" (str): Nome do usuário autenticado.

    Raises:
        HTTPException: 401 se o cookie estiver ausente, expirado ou com assinatura inválida.

    Example:
        >>> # Em uma rota protegida:
        >>> @router.get("/dados")
        >>> async def dados(user: dict = Depends(require_user)):
        >>>     return {"mensagem": f"Olá, {user['name']}!"}
    """
    # App Android: o token vem no cabeçalho, não em cookie. Tem prioridade para que um
    # token ruim dê 401 claro em vez de cair silenciosamente no caminho do cookie.
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        return user_from_bearer(authorization)

    # Se o cookie não foi enviado na requisição, o usuário não está autenticado
    if makima_session is None:
        raise HTTPException(
            status_code=401,
            detail="Não autenticado: cookie de sessão ausente. Faça login em /auth/login.",
        )

    try:
        # Tenta desserializar e verificar o cookie.
        # O itsdangerous confere:
        # 1. A assinatura HMAC (garante que não foi adulterado)
        # 2. O timestamp embutido (garante que não expirou)
        payload: dict = _serializer.loads(makima_session, max_age=_COOKIE_MAX_AGE)

    except itsdangerous.SignatureExpired:
        # A assinatura é válida, mas o token está velho (mais de 7 dias)
        raise HTTPException(
            status_code=401,
            detail="Sessão expirada: faça login novamente em /auth/login.",
        )

    except itsdangerous.BadSignature:
        # O token foi modificado após ser assinado, ou foi criado com outro segredo
        raise HTTPException(
            status_code=401,
            detail="Sessão inválida: cookie corrompido ou adulterado.",
        )

    except itsdangerous.BadData:
        # Catch-all para qualquer outro erro de desserialização do itsdangerous:
        # payload corrompido, encoding inválido, formato inesperado, etc.
        # BadPayload (subclasse de BadData) não é capturado pelos blocos acima,
        # então sem este bloco ele propagaria como erro 500 interno.
        raise HTTPException(
            status_code=401,
            detail="Sessão inválida.",
        )

    # Retorna o payload decodificado com os dados do usuário
    return payload
