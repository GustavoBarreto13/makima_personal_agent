# Arquitetura do Webapp

## Visão geral

```
Navegador
    │
    │  HTTP (cookie makima_session)
    ▼
webapp/backend/main.py          ← FastAPI (uvicorn, porta 8080)
    ├── /auth/*                 ← auth.py   — Google OIDC
    ├── /api/finances/*         ← finances.py
    ├── /api/books/*            ← books.py
    ├── /api/journal/*          ← journal.py
    ├── /assets/*               ← StaticFiles (JS/CSS do Vite)
    ├── /uploads/*              ← StaticFiles (ícones enviados pelo usuário)
    └── /{any}                  ← SPA catch-all → index.html
            │
            │  importação Python direta (sem HTTP, sem ADK)
            ▼
    agents/nami/tools*.py       ─┐
    agents/frieren/tools.py      ├─→  PostgreSQL compartilhado
    agents/journal/tools.py      │      (mesmo DATABASE_URL do bot)
    agents/db.py                ─┘
```

O webapp é um processo separado do bot do Telegram — dois containers Docker no mesmo Compose
(`makima-web` e `makima-bot`) — mas **leem e escrevem as mesmas tabelas PostgreSQL**. Uma
edição no webapp aparece instantaneamente no Telegram e vice-versa.

## Relação com o coordinator (bot Telegram)

O webapp **não instancia o ADK** (`InMemoryRunner`, `Agent`, `DatabaseSessionService`).
Ele importa as tools dos agentes como funções Python puras:

```python
# finances.py — exemplo de importação direta
from agents.nami.tools import create_transaction, list_transactions
```

O ADK só entra em cena no `coordinator/` (bot). Qualquer futuro painel de chat (Fatia 6)
precisaria instanciar o coordinator — mas isso ainda não está construído.

## Padrão dos routers de backend

Cada router segue o mesmo padrão. Ponto de entrada é sempre o arquivo em `webapp/backend/routers/`.

```python
from agents.nami.tools import create_transaction  # importa a tool diretamente

def _check_result(result: dict) -> dict:
    """Converte {"status": "error"} em HTTP 400; deixa {"status": "ok"} passar."""
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result

@router.post("/transactions", status_code=201)
def create_tx(body: CreateTransactionBody, user: dict = Depends(require_user)):
    return _check_result(create_transaction(**body.model_dump()))
```

**Regras obrigatórias:**
- `Depends(require_user)` em **todas** as rotas `/api/*` — sem exceção
- Pydantic para todos os bodies de POST/PATCH — sem `dict` cru
- Nunca levantar HTTP 500 por dados inválidos; usar `_check_result` (→ 400) ou Pydantic (→ 422)

**Atenção — divergência no router de journal:** algumas tools do journal **não** retornam o campo
`"status"`, então `_check_result` não pode ser usado nelas. Veja a seção
[Camada de dados](#camada-de-dados) e a documentação em `webapp/CLAUDE.md`.

## Autenticação

Fluxo completo:

```
1. GET /auth/login
   → gera state CSRF, salva em request.session (SessionMiddleware/Starlette)
   → redireciona para Google OIDC

2. GET /auth/callback?code=...&state=...
   → valida state CSRF
   → troca code por id_token com Google
   → verifica email == ALLOWED_EMAIL (case-insensitive)
   → assina payload {"email", "name"} com itsdangerous (URLSafeTimedSerializer)
   → grava cookie makima_session (httponly, samesite=lax, max_age=7 dias)
   → redireciona para /

3. Qualquer GET/POST /api/*
   → require_user() em deps.py extrai o cookie
   → valida assinatura + expiração
   → 401 se ausente/expirado/inválido
```

**Importante:** `SessionMiddleware` **precisa ser adicionado antes** do `CORSMiddleware` em
`main.py` — caso contrário o `state` CSRF do OAuth não é persistido e o login quebra.

O salt do cookie é `"makima-session"` — se mudar, todos os logins ativos ficam inválidos.

## Camada de dados

**Módulo compartilhado:** `agents/db.py`
- Usa `psycopg2-binary` (driver síncrono).
- `get_conn()` — gerenciador de contexto: commit automático no sucesso, rollback na exceção.
- `run_select(sql, params)` → `list[dict]` via `RealDictCursor`. Normaliza `Decimal` → `float`.
- `run_dml(sql, params)` → `int` (linhas afetadas).
- Strip automático de sufixos assíncronos do DSN (`+asyncpg`, `+pg8000`) — o ADK acrescenta esses
  sufixos para sua sessão assíncrona, mas o psycopg2 precisa do DSN puro.

**Tabelas por domínio:**

| Domínio | Tabelas |
|---|---|
| Finanças (Nami) | `transactions`, `accounts`, `credit_cards`, `subscriptions`, `personal_loans`, `financings`, `loans`, `installment_groups`, `installment_transactions` |
| Livros (Frieren) | `books`, `reading_logs`, `book_shelves`, `book_shelf_members` |
| Diário (Journal/Violet) | `journal_types`, `journal_pages`, `journal_bullets`, `journal_mentions` |

**Acoplamento especial do journal:** `agents/journal/tools.py` importa `DATABASE_URL` diretamente
de `webapp.backend.config` (não usa `agents/db.py`). Além disso, ele **cria as tabelas do journal
automaticamente ao ser importado** — tolerante a banco indisponível no momento da importação.

## Servir o SPA

Em produção, o FastAPI serve o build do Vite (`webapp/frontend/dist/`) como estático:

1. **`/assets/*`** → `StaticFiles(directory=dist/assets)` — JS e CSS compilados pelo Vite.
2. **`/uploads/*`** → `StaticFiles(directory=webapp/uploads)` — ícones enviados pelo usuário.
3. **`GET /{full_path:path}` (catch-all)** → verifica se o caminho é um arquivo real dentro do
   `dist/` (ex.: `/nami.jpg`, `/violet.png`). Se for, serve o binário. Senão, devolve `index.html`
   para o React Router tomar conta.

O catch-all tem **guarda de path traversal**: valida que o caminho resolvido ainda está dentro do
diretório `dist/` antes de servi-lo (impede ataques do tipo `GET /../../etc/passwd`).

**Por que não usar `StaticFiles(html=True)` na raiz?** Porque esse modo devolve 404 para rotas do
React Router como `/journal` ou `/books` — o SPA precisaria de um arquivo `journal/index.html` que
não existe. O catch-all manual resolve isso corretamente.

## Nota sobre PLAN.md

`webapp/PLAN.md` é o documento de intenção original do webapp. Ele menciona **BigQuery** como
storage e um endpoint `/api/chat` — ambos **nunca foram implementados**. O storage real desde o
início é PostgreSQL. Trate o `PLAN.md` como registro histórico, não como fonte da verdade do
código atual.

Docstrings em `webapp/backend/routers/finances.py` e `books.py` também contêm menções a "BigQuery"
por herança dos comentários iniciais — o código real usa psycopg2 + PostgreSQL.
