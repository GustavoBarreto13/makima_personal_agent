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
from fastapi import Cookie, HTTPException  # Cookie extrai o valor do cookie; HTTPException retorna erros HTTP

# Importa as constantes compartilhadas com o módulo de autenticação
from webapp.backend.config import SESSION_COOKIE_NAME, SESSION_MAX_AGE, SESSION_SECRET

# --- Serializer para validar os cookies de sessão ---

# Deve usar os MESMOS parâmetros usados em auth.py para assinar.
# Se qualquer parâmetro diferir (segredo, salt), a validação falhará.
_serializer = itsdangerous.URLSafeTimedSerializer(SESSION_SECRET, salt="makima-session")

# Aliases locais — SESSION_MAX_AGE e SESSION_COOKIE_NAME são fonte única de verdade (config.py)
_COOKIE_MAX_AGE = SESSION_MAX_AGE    # 7 dias em segundos
_COOKIE_NAME = SESSION_COOKIE_NAME   # "makima_session"


def require_user(makima_session: str | None = Cookie(default=None)) -> dict:
    """Validar o cookie de sessão e retornar os dados do usuário autenticado.

    Esta função é usada como dependência FastAPI (`Depends(require_user)`).
    O FastAPI extrai automaticamente o cookie `makima_session` da requisição
    e passa como argumento. Se o cookie for inválido ou ausente, a requisição
    é interrompida com HTTP 401 (Unauthorized).

    Args:
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

    # Retorna o payload decodificado com os dados do usuário
    return payload
