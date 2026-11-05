"""Router de autenticação Google OAuth para a webapp do Makima.

Implementa o fluxo OIDC (OpenID Connect) do Google em três etapas:
1. /auth/login → redireciona o navegador para a página de login do Google
2. /auth/callback → o Google devolve o código aqui; validamos o token e emitimos o cookie
3. /auth/logout → apaga o cookie e redireciona para a página inicial

Usage:
    # Em main.py:
    from webapp.backend.routers import auth as auth_router
    app.include_router(auth_router.router, prefix="/auth", tags=["auth"])
"""

import itsdangerous  # Biblioteca para assinar dados de forma segura (evita falsificação de cookies)
from authlib.integrations.starlette_client import OAuth  # Cliente OAuth para Starlette/FastAPI
from fastapi import APIRouter, HTTPException, Request  # APIRouter agrupa rotas; Request representa a requisição HTTP
from fastapi.responses import JSONResponse, RedirectResponse  # Tipos de resposta HTTP
from pydantic import BaseModel  # Valida o corpo JSON das rotas do app

from webapp.backend import mobile_auth  # Tokens e aparelhos do app Android
from webapp.backend.deps import user_from_bearer  # Valida o cabeçalho Authorization

# Importa as configurações centrais da aplicação
from webapp.backend.config import (
    ALLOWED_EMAIL,  # Email autorizado a usar a webapp
    MOBILE_ACCESS_MAX_AGE,  # Vida do token de acesso do app
    GOOGLE_OAUTH_CLIENT_ID,  # ID do app no Google Cloud Console
    GOOGLE_OAUTH_CLIENT_SECRET,  # Segredo do app no Google Cloud Console
    OAUTH_REDIRECT_URL,  # URL para onde o Google redireciona após o login
    SESSION_COOKIE_NAME,  # Nome do cookie de sessão (fonte única de verdade)
    SESSION_MAX_AGE,  # Expiração do cookie em segundos (fonte única de verdade)
    SESSION_SECRET,  # Chave para assinar os cookies de sessão
)

# --- Configuração do cliente OAuth do Google ---

# Cria a instância central do OAuth (gerencia as configurações do provedor)
oauth = OAuth()

# Registra o Google como provedor OAuth.
# "server_metadata_url" aponta para o documento de descoberta do Google — ele descreve
# os endpoints de autorização, token, e JWKS automaticamente (padrão OpenID Connect Discovery).
oauth.register(
    name="google",  # Nome interno para referenciar o provedor
    client_id=GOOGLE_OAUTH_CLIENT_ID,
    client_secret=GOOGLE_OAUTH_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={
        # "openid" → habilita o OIDC (recebemos o id_token com dados do usuário)
        # "email" → pede permissão para ver o email do usuário
        # "profile" → pede permissão para ver nome e foto
        "scope": "openid email profile",
    },
)

# --- Serializer para assinar os cookies de sessão ---

# O URLSafeTimedSerializer gera tokens assinados + timestamp.
# Ao validar, ele verifica se a assinatura é válida E se não expirou.
# "makima-session" é o "salt" — diferencia tokens de contextos diferentes com o mesmo segredo.
_serializer = itsdangerous.URLSafeTimedSerializer(SESSION_SECRET, salt="makima-session")

# Aliases locais para as constantes de config — facilita leitura interna do módulo
_COOKIE_MAX_AGE = SESSION_MAX_AGE  # 7 dias em segundos (definido em config.py)
_COOKIE_NAME = SESSION_COOKIE_NAME  # "makima_session" (definido em config.py)


# --- Criação do router FastAPI ---

# O APIRouter agrupa as rotas de autenticação. O prefixo "/auth" é adicionado em main.py.
router = APIRouter()


@router.get("/login")
async def login(request: Request) -> RedirectResponse:
    """Iniciar o fluxo OAuth redirecionando o usuário para o Google.

    O Authlib gera automaticamente o parâmetro `state` (proteção contra CSRF)
    e o armazena em `request.session` (via SessionMiddleware do Starlette).
    Quando o Google chamar /auth/callback, o `state` será comparado.

    Args:
        request: Requisição HTTP com acesso à sessão Starlette.

    Returns:
        Redirecionamento HTTP 302 para a página de autorização do Google.
    """
    # Delega ao Authlib a criação da URL de autorização do Google.
    # O Authlib salva o `state` CSRF em request.session automaticamente.
    redirect = await oauth.google.authorize_redirect(request, OAUTH_REDIRECT_URL)
    return redirect


@router.get("/callback")
async def callback(request: Request) -> RedirectResponse:
    """Receber o callback do Google, validar o token, emitir cookie de sessão.

    O Google redireciona para esta rota após o usuário autorizar (ou negar) o login.
    O Authlib:
    1. Troca o `code` por um token de acesso
    2. Verifica a assinatura do id_token
    3. Retorna os dados do usuário (email, name, etc.)

    Se o email não for o permitido, retorna 403. Caso o token seja inválido, 401.

    Args:
        request: Requisição HTTP com o parâmetro `code` do Google na query string.

    Returns:
        Redirecionamento para "/" com o cookie de sessão definido.

    Raises:
        JSONResponse: 403 se o email não for autorizado.
        JSONResponse: 401 se o token for inválido.
        JSONResponse: 500 se ALLOWED_EMAIL não estiver configurado.
    """
    # Verifica se ALLOWED_EMAIL está configurado — se não, é um erro de configuração
    if not ALLOWED_EMAIL:
        return JSONResponse(
            status_code=500,
            content={
                "error": "Configuração incompleta: ALLOWED_EMAIL não está definido no servidor."
            },
        )

    try:
        # Troca o código de autorização do Google por um token de acesso.
        # O Authlib também valida o state CSRF comparando com o que foi salvo em request.session.
        token = await oauth.google.authorize_access_token(request)
    except Exception as exc:
        # Pode acontecer se o state CSRF não bater, se o código expirou, etc.
        return JSONResponse(
            status_code=401,
            content={"error": f"Falha ao validar token do Google: {str(exc)}"},
        )

    # Extrai os dados do usuário do id_token (JWT assinado pelo Google)
    # userinfo contém: email, name, picture, sub (Google user ID), etc.
    userinfo = token.get("userinfo")
    if not userinfo:
        return JSONResponse(
            status_code=401,
            content={"error": "Token do Google não contém dados de usuário (userinfo ausente)."},
        )

    # Extrai o email e o nome retornados pelo Google
    email: str = userinfo.get("email", "")
    name: str = userinfo.get("name", "")

    # Valida se o email é o permitido (comparação case-insensitive)
    if email.lower() != ALLOWED_EMAIL.lower():
        return JSONResponse(
            status_code=403,
            content={
                "error": f"Acesso negado: o email '{email}' não está autorizado para usar esta aplicação."
            },
        )

    # --- Emite o cookie de sessão assinado ---

    # Serializa os dados do usuário em um token seguro.
    # O itsdangerous assina o payload com HMAC usando SESSION_SECRET — impossível falsificar sem o segredo.
    session_payload = {"email": email, "name": name}
    signed_cookie = _serializer.dumps(session_payload)

    # Decide se o cookie deve ser "secure" (só enviado em HTTPS) com base na URL de callback
    # Em produção (HTTPS), o cookie só trafega por conexão criptografada
    is_secure = OAUTH_REDIRECT_URL.startswith("https://")

    # Cria a resposta de redirecionamento para a página inicial
    response = RedirectResponse(url="/")

    # Define o cookie de sessão na resposta
    response.set_cookie(
        key=_COOKIE_NAME,
        value=signed_cookie,
        max_age=_COOKIE_MAX_AGE,  # 7 dias em segundos
        httponly=True,  # JavaScript do cliente não pode ler o cookie (proteção contra XSS)
        samesite="lax",  # Protege contra CSRF: cookie não é enviado em requisições cross-site arbitrárias
        secure=is_secure,  # Só envia por HTTPS se a URL de callback for HTTPS
    )

    return response


@router.get("/logout")
async def logout() -> RedirectResponse:
    """Encerrar a sessão do usuário apagando o cookie.

    Não há "logout" no Google — apenas removemos o cookie local.
    O usuário continuará logado na conta Google, mas perderá o acesso à webapp.

    Returns:
        Redirecionamento para "/" sem o cookie de sessão.
    """
    # Determina se a aplicação está rodando em HTTPS (produção).
    # Em produção, o cookie foi criado com Secure=True; para deletá-lo, o request
    # de deleção também precisa incluir Secure=True — caso contrário, o browser ignora
    # a instrução de deleção e o logout falha silenciosamente.
    is_secure = OAUTH_REDIRECT_URL.startswith("https://")

    # Cria a resposta de redirecionamento para a página inicial
    response = RedirectResponse(url="/")

    # Remove o cookie apagando-o (define expiração imediata).
    # Os atributos (httponly, samesite, secure) devem ser idênticos aos usados ao criar
    # o cookie em /callback — browsers só sobrescrevem/deletam cookies com atributos iguais.
    response.delete_cookie(
        key=_COOKIE_NAME,
        httponly=True,
        samesite="lax",
        secure=is_secure,
    )

    return response


@router.get("/me")
async def me(request: Request) -> JSONResponse:
    """Retornar dados do usuário autenticado, ou 401 se não autenticado.

    Esta rota é usada pelo frontend para descobrir se o usuário está logado
    e quais dados exibir (nome, email). Se o cookie for inválido ou ausente,
    retorna 401 para que o frontend exiba a tela de login.

    Args:
        request: Requisição HTTP com os cookies do cliente.

    Returns:
        JSON com "email" e "name" do usuário autenticado.
        JSON com "error" e status 401 se o cookie estiver ausente, expirado ou inválido.
    """
    # App Android: autentica pelo cabeçalho Authorization em vez do cookie
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        try:
            user = user_from_bearer(authorization)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})
        return JSONResponse(
            status_code=200, content={"email": user.get("email", ""), "name": user.get("name", "")}
        )

    # Lê o cookie de sessão do cabeçalho da requisição
    signed_cookie = request.cookies.get(_COOKIE_NAME)

    # Se o cookie não existe, o usuário não está autenticado
    if not signed_cookie:
        return JSONResponse(
            status_code=401,
            content={"error": "Não autenticado: cookie de sessão ausente."},
        )

    try:
        # Verifica a assinatura e a expiração do cookie.
        # max_age=_COOKIE_MAX_AGE garante que tokens com mais de 7 dias sejam rejeitados.
        payload: dict = _serializer.loads(signed_cookie, max_age=_COOKIE_MAX_AGE)
    except itsdangerous.SignatureExpired:
        # O token é válido mas já expirou (mais de 7 dias)
        return JSONResponse(
            status_code=401,
            content={"error": "Sessão expirada: faça login novamente."},
        )
    except itsdangerous.BadSignature:
        # O token foi adulterado ou criado com um segredo diferente
        return JSONResponse(
            status_code=401,
            content={"error": "Sessão inválida: cookie corrompido ou adulterado."},
        )
    except itsdangerous.BadData:
        # Catch-all para qualquer outro erro de desserialização do itsdangerous:
        # payload corrompido, encoding inválido, formato inesperado, etc.
        # BadPayload (subclasse de BadData) não é capturado pelos blocos acima,
        # então sem este bloco ele propagaria como erro 500 interno.
        return JSONResponse(
            status_code=401,
            content={"error": "Sessão inválida."},
        )

    # Retorna os dados do usuário armazenados no cookie
    return JSONResponse(
        status_code=200,
        content={"email": payload.get("email", ""), "name": payload.get("name", "")},
    )


# ─── Login do app Android (Etapa 2 do docs/planos/app_android) ───────────────
# O site continua usando /auth/login + cookie. Estas rotas existem só para o app, que
# troca o ID token do login nativo do Google por um token de acesso + refresh token.


class MobileLoginBody(BaseModel):
    """Corpo de `POST /auth/mobile`.

    Attributes:
        id_token: ID token devolvido pelo login nativo do Google.
        device_name: Nome amigável do aparelho (aparece em "aparelhos conectados").
    """

    id_token: str
    device_name: str = "Android"


class RefreshBody(BaseModel):
    """Corpo de `POST /auth/mobile/refresh` e `/auth/mobile/logout`.

    Attributes:
        refresh_token: Refresh token atual do app.
    """

    refresh_token: str


def _mobile_tokens(email: str, name: str, device_id: str, refresh_token: str) -> dict:
    """Montar a resposta padrão com o par de tokens e os dados do usuário."""
    return {
        "access_token": mobile_auth.issue_access_token(email, name, device_id),
        "refresh_token": refresh_token,
        "token_type": "Bearer",
        "expires_in": MOBILE_ACCESS_MAX_AGE,
        "device_id": device_id,
        "user": {"email": email, "name": name},
    }


@router.post("/mobile")
def mobile_login(body: MobileLoginBody) -> dict:
    """Trocar o ID token do Google por tokens do app (primeiro login do aparelho).

    É `def` (não `async def`) de propósito: a validação do token faz rede para buscar as
    chaves do Google, e o FastAPI roda rotas síncronas em thread separada.

    Args:
        body: ID token + nome do aparelho.

    Returns:
        `access_token`, `refresh_token`, `expires_in`, `device_id` e `user`.

    Raises:
        HTTPException: 503 se o login mobile não está configurado; 401 se o token do Google
            for inválido; 403 se o e-mail não for o autorizado; 500 se `ALLOWED_EMAIL` faltar.
    """
    if not ALLOWED_EMAIL:
        raise HTTPException(status_code=500, detail="ALLOWED_EMAIL não está definido no servidor.")

    try:
        claims = mobile_auth.verify_google_id_token(body.id_token)
    except mobile_auth.MobileAuthError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message)

    email: str = claims.get("email", "")
    # Um e-mail não verificado poderia ser de outra pessoa que só "declarou" ser o dono.
    if not claims.get("email_verified"):
        raise HTTPException(status_code=401, detail="E-mail do Google não verificado.")
    if email.lower() != ALLOWED_EMAIL.lower():
        raise HTTPException(status_code=403, detail="Acesso negado: e-mail não autorizado.")

    name: str = claims.get("name", "")
    device_id, refresh = mobile_auth.create_device(email, name, body.device_name)
    return _mobile_tokens(email, name, device_id, refresh)


@router.post("/mobile/refresh")
def mobile_refresh(body: RefreshBody) -> dict:
    """Renovar o par de tokens usando o refresh token (que é descartado e substituído).

    Raises:
        HTTPException: 401 se o refresh for inválido, expirado, revogado ou reutilizado.
    """
    try:
        info = mobile_auth.rotate_refresh(body.refresh_token)
    except mobile_auth.MobileAuthError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message)

    # O nome da pessoa não fica no banco; o app já o conhece. Mantemos o do e-mail para o token.
    return _mobile_tokens(info["email"], "", info["device_id"], info["refresh_token"])


@router.post("/mobile/logout")
def mobile_logout(body: RefreshBody) -> dict:
    """Desconectar o aparelho (revoga o refresh e o acesso). Idempotente: sempre responde ok."""
    try:
        device_id = mobile_auth.split_refresh_token(body.refresh_token)
    except mobile_auth.MobileAuthError:
        return {"status": "ok"}  # token malformado: não há o que revogar
    mobile_auth.revoke_device(device_id)
    return {"status": "ok"}
