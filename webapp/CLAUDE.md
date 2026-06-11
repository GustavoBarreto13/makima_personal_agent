## Módulo: webapp

Painel web do Makima — FastAPI (backend) + React (frontend) servidos por um único container.
A API importa diretamente as tools dos agentes (`agents/nami/`, `agents/frieren/`, `agents/journal/`),
lendo e escrevendo nas mesmas tabelas PostgreSQL usadas pelo bot do Telegram.

---

### Stack

**Backend:** Python 3.12 · FastAPI + uvicorn · Authlib (Google OIDC) · itsdangerous (cookies)
**Frontend:** React 19 + TypeScript + Tailwind CSS 3 + Vite 6 · react-router-dom 7

---

### Arquitetura interna

```
webapp/
├── backend/
│   ├── main.py         # app FastAPI: registra routers, CORS (dev), SessionMiddleware, serve dist/
│   ├── config.py       # todas as env vars do módulo (SESSION_SECRET, ALLOWED_EMAIL, etc.)
│   ├── deps.py         # require_user() → valida cookie makima_session via itsdangerous
│   └── routers/
│       ├── auth.py     # /auth/login → /auth/callback → cookie ; /auth/logout ; /auth/me
│       ├── finances.py # /api/finances/* → wraps tools da Nami (PostgreSQL)
│       ├── books.py    # /api/books/*   → wraps tools da Frieren (PostgreSQL)
│       └── journal.py  # /api/journal/* → wraps tools do Journal (PostgreSQL)
└── frontend/
    └── src/
        ├── lib/api.ts  # fetch tipado, envia cookie automaticamente
        └── pages/      # uma página por domínio
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

### Domínio: Journal (Diário pessoal)

Router: `routers/journal.py` · Tools: `agents/journal/tools.py` · Storage: **PostgreSQL** (não BigQuery)

Todos os domínios (finanças, livros e journal) usam o mesmo PostgreSQL compartilhado com o ADK.

**Modelo de dados:**
- `journal_types` — tipos de diário (ex.: id=1 → "personal"); extensível
- `journal_pages` — uma página por (type_id, date); criada sob demanda pelo `get_or_create_page`
- `journal_bullets` — bullets numerados por posição dentro da página; cada bullet tem conteúdo livre
- `journal_mentions` — extração automática de `@pessoa` e `#tag` de cada bullet

**Endpoints disponíveis:**
| Endpoint | Método | Descrição |
|---|---|---|
| `/api/journal/page?date=YYYY-MM-DD&type_id=1` | GET | Busca/cria página para uma data |
| `/api/journal/bullets` | POST | Upsert de bullet (por page_id + position) |
| `/api/journal/bullets/{id}` | DELETE | Remove bullet (cascade apaga menções) |
| `/api/journal/heatmap?year=2026` | GET | Contagem de bullets por dia (para o heatmap) |
| `/api/journal/mentions?kind=person\|tag` | GET | Lista menções distintas com count DESC |
| `/api/journal/filter?kind=person\|tag&value=X` | GET | Bullets que mencionam uma pessoa ou tag |
| `/api/journal/search?q=texto` | GET | Full-text search com dicionário `portuguese` |
| `/api/journal/emotions` | GET | Lista o vocabulário de emoções (predefinidas + custom) |
| `/api/journal/emotions` | POST | Cria emoção custom (idempotente, dedupe por `LOWER(name)`) |
| `/api/journal/emotion-logs?page_id=N` | GET | Registros emocionais (TCC) de um dia |
| `/api/journal/emotion-logs` | POST | Cria registro emocional |
| `/api/journal/emotion-logs/{id}` | PATCH | Atualização parcial de um registro |
| `/api/journal/emotion-logs/{id}` | DELETE | Remove um registro emocional |
| `/api/journal/emotion-stats?year=2026` | GET | Agregações para a aba Emoções dos Insights |
| `/api/journal/bullets/{id}/favorite` | PATCH | Define favorito de um bullet `{favorite: bool}` (Feature 007) |
| `/api/journal/favorite-days?year=N` | GET | Lista datas do ano com ao menos um bullet favorito (Feature 007) |

**Registro Emocional (TCC) — Feature 006.** Tabelas `journal_emotions` + `journal_emotion_logs`.
Os registros são **ortogonais aos bullets** (não contam palavras nem afetam heatmap/coleções).
Regra de negócio validada no router: `reappraised_intensity` só é aceita com `adaptive_response`
não-vazia (senão HTTP 400). `list_emotions`, `list_emotion_logs` e `emotion-stats` retornam
lista/dict direto — **não** usar `_check_result` neles.

**Diferença na validação de resultado:**
`list_heatmap`, `list_mentions`, `get_bullets_by_mention` e `search_bullets` retornam listas/dicts diretamente — **sem** campo `"status"`, então **não** usar `_check_result` neles.
`get_or_create_page` retorna `{"error": "..."}` (não `{"status": "error"}`) quando `type_id` não existe — verificar `result.get("error")` explicitamente antes de chamar `_check_result`.

---

### Variáveis de ambiente

| Variável | Obrigatório | Descrição |
|---|---|---|
| `SESSION_SECRET` | sim | Chave para assinar cookies (gerar com `secrets.token_hex(32)`) |
| `ALLOWED_EMAIL` | sim | Único email autorizado (ex.: `gustavobarreto1304@gmail.com`) |
| `GOOGLE_OAUTH_CLIENT_ID` | sim | Client ID do app OAuth no GCP |
| `GOOGLE_OAUTH_CLIENT_SECRET` | sim | Client Secret do app OAuth no GCP |
| `OAUTH_REDIRECT_URL` | sim | URL de callback (dev: `http://localhost:8080/auth/callback`) |
| `GCP_PROJECT_ID` | sim | Necessário para o GCS backup (e Vertex AI RAG do Kurisu) |
| `GCP_CREDENTIALS_JSON` | sim | Credenciais de serviço GCP (GCS backup + Vertex AI) |
| `DATABASE_URL` | sim | PostgreSQL compartilhado — usado por todas as tools (finanças, livros, journal) |

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

### Padrões do frontend

#### Roteamento — Shell pattern

Cada domínio com UI própria é um **Shell**: componente raiz com sidebar/navegação interna, desacoplado do `Layout` global. O roteamento usa wildcard para o Shell assumir o controle total das sub-rotas.

```tsx
// App.tsx — ordem importa: Shells específicos antes do catch-all /*
<Route path="/books/*"   element={<FrierenShell />} />   // src/pages/frieren/
<Route path="/journal/*" element={<VioletShell />} />    // src/pages/violet/
<Route path="/nami/*"    element={<NamiShell />} />      // src/pages/nami/
<Route path="/*"         element={<Layout>...</Layout>} /> // rotas legadas
```

Ao criar um novo domínio: criar o Shell **antes** de adicionar a Route, e colocá-la **antes do `/*`**.

#### Estrutura de pasta por domínio

```
pages/<dominio>/
├── <Dominio>Shell.tsx     # raiz — sidebar, navegação, TweaksPanel
├── TweaksPanel.tsx        # painel lateral de configurações do domínio
├── <dominio>Api.ts        # wrapper tipado dos endpoints /api/<dominio>/*
├── types.ts               # interfaces TypeScript espelhando o schema do backend
├── <dominio>.css          # tokens CSS / variáveis OKLCH isoladas do domínio
├── screens/               # uma tela por seção do shell (ex.: Dashboard, Transactions)
├── modals/                # modais de criação/edição (ex.: AddModal, FormModal)
├── components/            # componentes reutilizados dentro do domínio
└── ui/                    # primitivos visuais (Charts, Icons, ProgressBar, etc.)
```

#### API client — padrão por domínio

Cada domínio tem seu próprio objeto de API que centraliza URLs e tipos. **Componentes nunca fazem `fetch` diretamente** — usam o objeto da camada de API.

```ts
// src/pages/nami/namiApi.ts — wraps /api/finances/*
import { api } from '../../lib/api'
export const namiApi = {
  getStats: (month: string) => api.get(`/api/finances/stats?month=${month}`),
  createTransaction: (body: ...) => api.post('/api/finances/transactions', body),
  // ...
}

// src/lib/api.ts — booksApi e violetApi ficam aqui (domínios sem pasta própria de API)
export const booksApi = { list: () => api.get<{ books: ApiBook[] }>('/api/books'), ... }
export const violetApi = { page: (date) => api.get(`/api/journal/page?date=${date}`), ... }
```

#### `lib/api.ts` — wrapper base

`api.get / api.post / api.patch / api.put / api.del` — todos incluem `credentials: 'include'` (envia cookie de sessão) e lançam `Error` para status não-2xx. Nunca usar `fetch` nu nos componentes.

---

### Domínio: Violet (Diário pessoal — frontend)

Shell: `pages/violet/VioletShell.tsx` · Rota: `/journal/*`

Telas disponíveis: `Write` (editor de bullets), `Journal` (arquivo), `Reflect` (heatmap + insights), `People`, `Tags`, `Collection`, `Insights`.

O diário usa bullets com parsing de `@pessoa` e `#tag`. O componente `RichText.tsx` faz o highlight visual. A API é `violetApi` em `lib/api.ts`.

---

### Fatias de implementação

| Fatia | Descrição | Status |
|---|---|---|
| 0 | Esqueleto (main.py, Dockerfile, healthz) | ✅ |
| 1 | Autenticação Google OAuth | ✅ |
| 2 | Finanças (Nami) — todas as páginas | ✅ |
| 3 | Livros (Frieren) | ✅ |
| 4 | Journal/Diário pessoal (PostgreSQL) | ✅ |
| 5 | Tarefas/Agenda (Kaguya) — shell `/tasks` (router `/api/tasks/*`); Fase 1 lista/Kanban/Hoje + Fase 2 **datas e recorrência** (quick-add com datas pt-BR, controle de recorrência no TaskModal, glyph de repetição, exclusão escopada só-esta/série). Spec: `specs/011-tasks-mvp/` + `specs/012-tasks-recurrence/`. | ✅ |
| 6 | Painel de chat (Makima) | — |

---

### O que NÃO fazer aqui

- **Nunca modificar** `agents/nami/`, `agents/frieren/`, `agents/journal/`, `mcp_servers/` ou `coordinator/` — são importados como estão
- **Não instanciar** o ADK (`InMemoryRunner`, `Agent`) fora da Fatia 6 (chat) — os routers 2/3/4/5 chamam tools Python puras
- **Não registrar** routers sem o `Depends(require_user)` em todas as rotas — vazamento de dados financeiros
- **`create_installment()` não aceita `card_id`** — compras parceladas de cartão de crédito precisam ser criadas com `create_transaction` por parcela individualmente
- **Não usar `git add .`** ao commitar — `webapp/frontend/dist/` (build) não vai para o git (está no `.gitignore`)
- **Não expor `SESSION_SECRET` em logs** — nunca fazer `logging.info(config.SESSION_SECRET)`
- **Não usar `_check_result`** nos endpoints do journal que retornam lista/dict diretamente (`list_heatmap`, `list_mentions`, `get_bullets_by_mention`, `search_bullets`) — essas tools não têm campo `"status"`
- **Não confundir o schema de erro do journal**: `get_or_create_page` retorna `{"error": "..."}`, não `{"status": "error"}` — verificar `result.get("error")` explicitamente
- **Não fazer `fetch` diretamente em componentes React** — usar `namiApi`, `booksApi`, `violetApi` ou `api.*` de `lib/api.ts`
- **Não adicionar rotas de novo Shell após o `/*`** em `App.tsx` — o catch-all capturaria a rota antes do Shell
- **Não criar arquivos em `frontend/dist/`** — é artefato de build; tudo que precisa ser servido deve ir em `frontend/public/` (imagens de personagens, ícones) ou em `/uploads/icons/` (ícones de conta enviados via webapp)
