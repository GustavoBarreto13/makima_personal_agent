## Módulo: webapp

Painel web do Makima — FastAPI (backend) + React (frontend) servidos por um único container.
A API importa diretamente as tools dos agentes (`agents/nami/`, `agents/frieren/`), lendo e escrevendo
nas mesmas tabelas BigQuery usadas pelo bot do Telegram.

---

### Stack

**Backend:** Python 3.12 · FastAPI + uvicorn · Authlib (Google OIDC) · itsdangerous (cookies)
**Frontend:** React 19 + TypeScript + Tailwind CSS 3 + Vite 6 · react-router-dom 7

---

### Arquitetura interna

```
webapp/
├── backend/
│   ├── main.py        # app FastAPI: registra routers, CORS (dev), SessionMiddleware, serve dist/
│   ├── config.py      # todas as env vars do módulo (SESSION_SECRET, ALLOWED_EMAIL, etc.)
│   ├── deps.py        # require_user() → valida cookie makima_session via itsdangerous
│   └── routers/
│       ├── auth.py    # /auth/login → /auth/callback → cookie ; /auth/logout ; /auth/me
│       └── finances.py # /api/finances/* → wraps tools da Nami
└── frontend/
    └── src/
        ├── lib/api.ts  # fetch tipado, envia cookie automaticamente
        └── pages/      # uma página por domínio financeiro
```

---

### Padrão dos routers de backend

Todo router que expõe tools de agente segue este padrão:

```python
from agents.nami.tools import create_transaction  # importa a tool diretamente

def _check_result(result: dict) -> dict:
    # tools retornam {"status": "ok"|"error", ...}
    # converte "error" em HTTP 400; deixa "ok" passar
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result

@router.post("/transactions", status_code=201)
def create_tx(body: CreateTransactionBody, user: dict = Depends(require_user)):
    return _check_result(create_transaction(**body.model_dump()))
```

Regras obrigatórias:
- `Depends(require_user)` em **todas** as rotas `/api/*` — sem exceção
- Nunca lançar HTTP 500 por dados inválidos; usar `_check_result` (400) ou validação Pydantic (422)
- Modelos Pydantic para todos os bodies de POST/PATCH — não aceitar `dict` cru

---

### Autenticação

Fluxo: `GET /auth/login` → Google OIDC → `GET /auth/callback` → cookie `makima_session`

- **SessionMiddleware** (Starlette): guarda o `state` CSRF do OAuth em `request.session`; deve ser adicionado **antes** do CORSMiddleware em `main.py`
- **Cookie `makima_session`**: payload `{"email", "name"}` assinado pelo `itsdangerous.URLSafeTimedSerializer` (salt `"makima-session"`, 7 dias). Assinar/validar usa o mesmo salt e `SESSION_SECRET` em `auth.py` e `deps.py` — nunca mudar o salt
- **Allowlist**: só o email em `ALLOWED_EMAIL` passa; comparação case-insensitive
- **`require_user()`** em `deps.py`: extrai o cookie via `Cookie(default=None)`, valida com o serializer, lança 401 para ausente/expirado/inválido

---

### Variáveis de ambiente

| Variável | Obrigatório | Descrição |
|---|---|---|
| `SESSION_SECRET` | sim | Chave para assinar cookies (gerar com `secrets.token_hex(32)`) |
| `ALLOWED_EMAIL` | sim | Único email autorizado (ex.: `gustavobarreto1304@gmail.com`) |
| `GOOGLE_OAUTH_CLIENT_ID` | sim | Client ID do app OAuth no GCP |
| `GOOGLE_OAUTH_CLIENT_SECRET` | sim | Client Secret do app OAuth no GCP |
| `OAUTH_REDIRECT_URL` | sim | URL de callback (dev: `http://localhost:8080/auth/callback`) |
| `GCP_PROJECT_ID` | sim | Herdado do bot — necessário para as tools de BigQuery |
| `GCP_CREDENTIALS_JSON` | sim | Herdado do bot — credenciais de serviço GCP |

As variáveis de BigQuery/GCP são lidas pelas tools dos agentes diretamente do ambiente — `config.py` não as reexporta.

---

### Como rodar localmente

```bash
# Backend (na raiz do repositório)
uvicorn webapp.backend.main:app --reload --port 8080

# Frontend (em webapp/frontend/)
npm install
npm run dev          # dev server em localhost:5173

# Build de produção do frontend (necessário para servir via FastAPI)
npm run build        # gera webapp/frontend/dist/
```

Em desenvolvimento o CORS libera `localhost:5173`. Em produção (container), o FastAPI monta
`frontend/dist/` como estático e CORS não é necessário (mesma origem).

---

### Fatias de implementação

| Fatia | Status |
|---|---|
| 0 — Esqueleto (main.py, Dockerfile, healthz) | ✅ |
| 1 — Autenticação Google OAuth | ✅ |
| 2 — Finanças (Nami) — todas as pages | ✅ |
| 3 — Livros (Frieren) | ✅ |
| 4 — Tarefas/Agenda (Kaguya) | — |
| 5 — Painel de chat (Makima) | — |

---

### O que NÃO fazer aqui

- **Nunca modificar** `agents/nami/`, `agents/frieren/`, `mcp_servers/` ou `coordinator/` — são importados como estão
- **Não instanciar** o ADK (`InMemoryRunner`, `Agent`) fora da Fatia 5 (chat) — os routers 2/3/4 chamam tools Python puras
- **Não registrar** routers sem o `Depends(require_user)` em todas as rotas — vazamento de dados financeiros
- **`create_installment()` não aceita `card_id`** — compras parceladas de cartão de crédito precisam ser criadas com `create_transaction` por parcela individualmente
- **Não usar `git add .`** ao commitar — `webapp/frontend/dist/` (build) não vai para o git (está no `.gitignore`)
- **Não expor `SESSION_SECRET` em logs** — nunca fazer `logging.info(config.SESSION_SECRET)`
