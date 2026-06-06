"""Ponto de entrada da aplicação web da Makima.

Este módulo cria a aplicação FastAPI, configura CORS (permissão de acesso
cross-origin para o dev do Vite), define a rota de health check, e serve
os arquivos estáticos do build do React.

Usage:
    uvicorn webapp.backend.main:app --host 0.0.0.0 --port 8080
"""

import os  # Para verificar se o diretório de build do frontend existe

from fastapi import FastAPI  # Framework web — define rotas e lida com requisições HTTP
from fastapi.middleware.cors import CORSMiddleware  # Middleware que libera requisições cross-origin
from fastapi.responses import FileResponse  # Retorna um arquivo do disco como resposta HTTP
from fastapi.staticfiles import StaticFiles  # Serve arquivos estáticos (HTML, CSS, JS do React)
from starlette.middleware.sessions import SessionMiddleware  # Middleware de sessão Starlette — necessário para o fluxo CSRF do OAuth

# Importa os routers registrados na aplicação e o segredo de sessão
from webapp.backend.routers import auth as auth_router
from webapp.backend.routers import finances as finances_router
from webapp.backend.routers import books as books_router
from webapp.backend.routers import journal as journal_router
from webapp.backend.config import SESSION_SECRET

# Cria a instância principal da aplicação FastAPI.
# Tudo (rotas, middleware, static files) é registrado neste objeto.
app = FastAPI(title="Makima Web Interface")

# --- SessionMiddleware (obrigatório para o fluxo OAuth) ---
# O Authlib precisa de request.session para armazenar o `state` CSRF durante o fluxo OAuth.
# O `state` é um token aleatório gerado no /auth/login e verificado no /auth/callback,
# garantindo que o callback veio do mesmo navegador que iniciou o login.
# IMPORTANTE: este middleware deve ser adicionado ANTES do CORSMiddleware.
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET)

# --- Router de autenticação ---
# Registra as rotas /auth/login, /auth/callback, /auth/logout e /auth/me
app.include_router(auth_router.router, prefix="/auth", tags=["auth"])

# --- Router de finanças ---
# Registra todos os endpoints da Nami sob /api/finances
# Ex.: GET /api/finances/transactions, POST /api/finances/accounts, etc.
app.include_router(finances_router.router, prefix="/api/finances", tags=["finances"])

# --- Router de livros ---
# Registra todos os endpoints da Frieren sob /api/books
# Ex.: GET /api/books, GET /api/books/stats, POST /api/books, etc.
app.include_router(books_router.router, prefix="/api/books", tags=["books"])

# --- Router do journal ---
# Registra todos os endpoints do diário pessoal sob /api/journal
# Ex.: GET /api/journal/page, POST /api/journal/bullets, GET /api/journal/heatmap, etc.
app.include_router(journal_router.router, prefix="/api/journal", tags=["journal"])

# --- CORS (Cross-Origin Resource Sharing) ---
# O navegador bloqueia requisições entre origens diferentes por segurança.
# Em desenvolvimento, o Vite roda em localhost:5173 e a API em localhost:8000 —
# origens diferentes. Esse middleware libera as requisições do Vite para a API.
# Em produção (container), o frontend é servido pela própria FastAPI (mesma origem),
# então esse CORS só importa para dev local.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Apenas o dev server do Vite
    allow_credentials=True,  # Permite enviar cookies (necessário para sessões OAuth)
    allow_methods=["*"],  # Permite todos os verbos HTTP (GET, POST, etc.)
    allow_headers=["*"],  # Permite todos os cabeçalhos HTTP
)


# --- Rota de health check ---
@app.get("/api/healthz")
async def healthz() -> dict[str, str]:
    """Verificar se a aplicação está rodando corretamente.

    Rota simples usada por orquestradores (Dokploy, Docker, load balancers) para
    saber se o container está vivo. Retorna 200 OK com JSON de status.

    Returns:
        Dicionário com o campo "status" igual a "ok".

    Example:
        >>> # Ao chamar GET /api/healthz você recebe:
        >>> # {"status": "ok"}
    """
    # Retorna um JSON simples confirmando que a API está no ar
    return {"status": "ok"}


# --- Servir frontend React (build do Vite) ---
# Caminho onde o Vite salva o build de produção (npm run build).
# Em desenvolvimento, este diretório pode não existir se o frontend não foi compilado.
_FRONTEND_DIST = os.path.join(
    os.path.dirname(__file__),  # Diretório deste arquivo (webapp/backend/)
    "..",  # Sobe um nível (webapp/)
    "frontend",  # Entra em frontend/
    "dist",  # Diretório de saída do Vite
)

# Normaliza o caminho (resolve os ".." para um caminho absoluto limpo)
_FRONTEND_DIST = os.path.normpath(_FRONTEND_DIST)

if os.path.isdir(_FRONTEND_DIST):
    # Monta apenas o diretório /assets (JS, CSS gerados pelo Vite) em /assets.
    # Não montamos o dist inteiro em "/" porque StaticFiles com html=True NÃO serve
    # index.html para rotas do React Router como /journal ou /books — retorna 404.
    _ASSETS_DIR = os.path.join(_FRONTEND_DIST, "assets")
    if os.path.isdir(_ASSETS_DIR):
        app.mount("/assets", StaticFiles(directory=_ASSETS_DIR), name="assets")

    # Catch-all SPA: qualquer rota não reconhecida pela API devolve o index.html.
    # O React Router no navegador assume o controle e renderiza a página correta.
    # Esta rota deve ficar APÓS todos os routers de API para não interceptá-los.
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str) -> FileResponse:
        """Redirecionar rotas do React Router para o index.html do build."""
        return FileResponse(os.path.join(_FRONTEND_DIST, "index.html"))
