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
from webapp.backend.routers import tasks as tasks_router
from webapp.backend.routers import movies as movies_router  # Akane — catálogo de filmes (spec 015)
from webapp.backend.routers import animes as animes_router  # Marin — catálogo de animes (spec 021)
from webapp.backend.routers import series as series_router  # Mai — catálogo de séries de TV (spec 022)
from webapp.backend.routers import pessoas as pessoas_router  # Komi — identidade de pessoas (spec 014)
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

# --- Router de tarefas (Kaguya) ---
# Registra todos os endpoints do sistema de tarefas próprio sob /api/tasks
# Ex.: GET /api/tasks/sidebar, POST /api/tasks, POST /api/tasks/{id}/complete, etc.
app.include_router(tasks_router.router, prefix="/api/tasks", tags=["tasks"])

# --- Router de filmes (Akane) ---
# Registra todos os endpoints do catálogo de filmes sob /api/movies (spec 015)
# Ex.: GET /api/movies, POST /api/movies, POST /api/movies/{id}/watch, etc.
app.include_router(movies_router.router, prefix="/api/movies", tags=["movies"])

# --- Router de animes (Marin) ---
# Registra todos os endpoints do catálogo de animes sob /api/animes (spec 021)
# Ex.: GET /api/animes, POST /api/animes, POST /api/animes/{id}/log, POST /api/animes/sync, etc.
app.include_router(animes_router.router, prefix="/api/animes", tags=["animes"])

# --- Router de séries de TV (Mai) ---
# Registra todos os endpoints do catálogo de séries sob /api/series (spec 022)
# Ex.: GET /api/series, POST /api/series, POST /api/series/{id}/log, GET /api/series/upcoming, etc.
app.include_router(series_router.router, prefix="/api/series", tags=["series"])

# --- Router de pessoas (Komi) ---
# Registra todos os endpoints do cadastro de pessoas sob /api/people (spec 014)
# Ex.: GET /api/people, GET /api/people/search, POST /api/people, GET /api/people/{id}/summary, etc.
app.include_router(pessoas_router.router, prefix="/api/people", tags=["people"])

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

# Diretório de uploads de ícones enviados pela webapp (contas, assinaturas).
# Criado em runtime se não existir; arquivos são acessíveis via GET /uploads/icons/<nome>.
_UPLOADS_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "uploads")
)
os.makedirs(os.path.join(_UPLOADS_DIR, "icons"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_UPLOADS_DIR), name="uploads")

if os.path.isdir(_FRONTEND_DIST):
    # Monta apenas o diretório /assets (JS, CSS gerados pelo Vite) em /assets.
    # Não montamos o dist inteiro em "/" porque StaticFiles com html=True NÃO serve
    # index.html para rotas do React Router como /journal ou /books — retorna 404.
    _ASSETS_DIR = os.path.join(_FRONTEND_DIST, "assets")
    if os.path.isdir(_ASSETS_DIR):
        app.mount("/assets", StaticFiles(directory=_ASSETS_DIR), name="assets")

    # Catch-all SPA: qualquer rota não reconhecida pela API passa por aqui.
    # O React Router no navegador assume o controle e renderiza a página correta.
    # Esta rota deve ficar APÓS todos os routers de API para não interceptá-los.
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str) -> FileResponse:
        """Servir arquivo estático do dist se existir; senão, devolver o index.html (SPA).

        O Vite copia a pasta public/ para a raiz do dist/ sem renomear os arquivos.
        Isso inclui imagens de personagens como /nami.jpg, /violet.png, /frieren.png etc.
        O FastAPI só monta /assets e /uploads como estáticos, então esses arquivos da raiz
        do dist nunca seriam encontrados pelo servidor — retornaria index.html (HTML) no
        lugar do binário, quebrando todos os <img> que referenciam caminhos absolutos.
        Esta função resolve isso verificando se o caminho pedido corresponde a um arquivo
        real antes de cair no fallback do React Router.
        """
        # Monta o caminho candidato dentro do dist e normaliza (resolve "..", barras duplas, etc.)
        candidate = os.path.normpath(os.path.join(_FRONTEND_DIST, full_path))

        # Segurança contra path traversal: só serve se o caminho resolvido continuar
        # DENTRO do dist. Sem isso, um pedido como /../../etc/passwd poderia escapar
        # para fora do dist e expor arquivos sensíveis do sistema.
        # Usamos _FRONTEND_DIST + os.sep para evitar casar prefixos parciais de pastas irmãs
        # (ex.: um dist chamado "dist2" não casaria com dist + "/").
        dentro_do_dist = candidate.startswith(_FRONTEND_DIST + os.sep)

        # Se o caminho é um arquivo real dentro do dist (ex.: /nami.jpg, /violet.png),
        # devolvemos o binário com o Content-Type correto (FileResponse infere pelo nome).
        if dentro_do_dist and os.path.isfile(candidate):
            return FileResponse(candidate)

        # Qualquer outra rota (ex.: /journal, /books, /nami) é do React Router:
        # devolve o index.html para que o SPA inicialize e navegue para a rota correta.
        return FileResponse(os.path.join(_FRONTEND_DIST, "index.html"))
