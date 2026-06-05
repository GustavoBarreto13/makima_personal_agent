# PLAN.md — Interface Web do Makima

> Painel web para gerenciar todos os dados do Makima, compartilhando o máximo de backend
> possível com o bot do Telegram. O bot e a web são **duas faces dos mesmos dados**.

---

## Contexto — por que isto existe

Gerenciar dados pelo Telegram é lento para qualquer coisa estruturada: criar contas, cartões
de crédito, editar transações, revisar empréstimos. A ideia é uma **aplicação web num
subdomínio da VPS** que gerencie tudo o que o Makima toca, reaproveitando o backend para que
uma alteração feita na web apareça no Telegram e vice-versa, automaticamente.

### O que a exploração do código mostrou

- **Não existe nenhum código web/HTTP ainda** — campo aberto (green field).
- **As tools da Nami (finanças) e da Frieren (livros) são CRUD puro no BigQuery** — sem
  acoplamento com o ADK, podem ser chamadas diretamente. Padrão canônico em
  `agents/nami/tools.py`: singleton `_client()` + helpers parametrizados `_run_select()` /
  `_run_dml()`.
- **A Kaguya (tarefas/agenda)** fala com TickTick + Google Calendar via HTTP. Esses clientes
  vivem em `mcp_servers/ticktick/server.py` e `mcp_servers/calendar/server.py` como funções
  comuns por trás de decoradores FastMCP — dá para importar.
- **Os dados ficam no BigQuery** (datasets `nami_finance_agent` e `frieren_books_agent`). O
  `DATABASE_URL` (Postgres) guarda só as sessões de conversa do ADK, não os dados de domínio.
- **Deploy** é via Dokploy na VPS, rede `dokploy-network`, configuração por variáveis de
  ambiente, hoje um único container (`makima-bot`).

### Decisões confirmadas com o usuário

| Tema | Decisão |
|---|---|
| **Escopo** | Todos os domínios ativos (Nami, Frieren, Kaguya) + espaço para os futuros (Lucy e-mail, Media). Construído em fatias — finanças primeiro. |
| **Autenticação** | Google OAuth, restrito ao e-mail do Gustavo. |
| **Integração** | Dados compartilhados no BigQuery **e** um painel de chat que conversa com a Makima. |
| **Reaproveitamento** | A API web importa as funções das tools dos agentes diretamente. Sem refatoração grande no bot que já roda. |
| **Frontend** | Funcional primeiro, visual refinado depois ("o front final a gente pensa depois"). |

---

## Arquitetura

Um pacote novo `webapp/` no mesmo repositório. **Um container**: o FastAPI serve a API JSON em
`/api/*` e os arquivos estáticos do React (build do Vite) para todo o resto. Um subdomínio, um
certificado TLS, uma aplicação no Dokploy.

```
Navegador (subdomínio)
   │  login Google OAuth  →  cookie de sessão (e-mail na allowlist)
   ▼
FastAPI (webapp/backend)
   ├── /api/finances/*   → importa agents/nami/tools*.py          (BigQuery)
   ├── /api/books/*      → importa agents/frieren/tools.py        (BigQuery)
   ├── /api/tasks/*      → importa mcp_servers/ticktick + calendar (TickTick/Calendar)
   ├── /api/chat         → ADK Runner + create_makima()           (sessões no mesmo Postgres)
   └── /*                → serve o build do React (Vite)
```

A web e o bot do Telegram continuam sendo **processos/containers separados**, mas chamam as
mesmas funções de tool e as mesmas tabelas do BigQuery — por isso as edições se propagam nas
duas direções sozinhas. O painel de chat reutiliza `create_makima()` + um `Runner` com
`DatabaseSessionService` no mesmo Postgres: **o mesmo cérebro do Telegram, transporte
diferente.**

### Estrutura de arquivos proposta

```
webapp/
├── PLAN.md               # este arquivo
├── backend/
│   ├── __init__.py
│   ├── main.py           # app FastAPI: monta routers, estáticos do front, CORS, /healthz
│   ├── config.py         # carregamento central de env (OAuth, allowlist, segredo de sessão)
│   ├── auth.py           # Google OAuth (Authlib) + cookie de sessão + allowlist de e-mail
│   ├── deps.py           # dependência require_user() que protege as rotas /api
│   ├── Dockerfile        # multi-stage: build do React, depois uvicorn servindo API + estáticos
│   └── routers/
│       ├── __init__.py
│       ├── finances.py   # embrulha as tools da Nami (transações, contas, cartões, empréstimos…)
│       ├── books.py      # embrulha as tools da Frieren
│       ├── tasks.py      # embrulha os clientes TickTick/Calendar (leitura + ações básicas)
│       └── chat.py       # POST mensagem → resposta da Makima (SSE/streaming como evolução)
└── frontend/             # Vite + React + TypeScript + Tailwind
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── lib/api.ts    # wrapper de fetch tipado, envia o cookie de sessão
        ├── pages/        # Dashboard, Finanças, Livros, Tarefas, Chat
        └── components/   # tabelas, formulários, shell de layout, ChatPanel
```

`webapp/backend/config.py` é o único código "novo compartilhado" — um lugar central enxuto para
as configurações da própria web. As tools dos agentes continuam lendo env diretamente; importá-las
funciona sem mudança, então **o bot que já roda não é tocado**.

### Escolhas de tecnologia (recomendadas)

- **Backend:** FastAPI + uvicorn + Authlib (Google OIDC) + cookie de sessão assinado
  (itsdangerous/JWT).
- **Frontend:** Vite + React + TypeScript + Tailwind. Conjunto mínimo de componentes agora; o
  refino visual é uma etapa posterior, conforme pedido.
- **Servir:** o FastAPI monta o `dist/` do Vite como estático e expõe `/api/*` — mesma origem,
  sem dor de cabeça com CORS em produção.

---

## Fatias de construção (cada uma é entregável de forma independente)

**Fatia 0 — Esqueleto e casca de deploy.**
`webapp/backend/main.py` com `/api/healthz`, `config.py`, `Dockerfile` multi-stage, um serviço
`web` novo no `docker-compose.yml` na `dokploy-network`, e um build placeholder do React.
Objetivo: casca vazia (sem auth) acessível no subdomínio com TLS.

**Fatia 1 — Autenticação.**
`auth.py` + `deps.py`: fluxo de login Google OAuth, callback verifica `email == ALLOWED_EMAIL`
(env), emite cookie de sessão assinado; `require_user()` protege todas as `/api/*`. Página de
login mínima em React. Novas envs: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`ALLOWED_EMAIL`, `SESSION_SECRET`, `OAUTH_REDIRECT_URL`.

**Fatia 2 — Finanças (Nami) — o núcleo.**
`routers/finances.py` embrulhando as funções já existentes em `agents/nami/tools.py`,
`tools_accounts.py`, `tools_credit_cards.py`, `tools_loans.py`, `tools_installments.py`,
`tools_budgets.py`, `tools_health.py` (ex.: `create_transaction`, `query_expenses`,
`update_transaction`, `delete_transaction`, `list_accounts`, `get_account_balance`,
`register_credit_card`, `get_card_debt_summary`, `list_loans`, `get_budget_status`,
`get_financial_health_score`). Páginas React: dashboard (score de saúde financeira, resumo de
gastos, compromissos futuros), tabela de transações com criar/editar/excluir, contas, cartões,
empréstimos, assinaturas, orçamentos. Entrega os fluxos de maior valor e mais difíceis pelo
Telegram.

**Fatia 3 — Livros (Frieren).**
`routers/books.py` embrulhando `agents/frieren/tools.py` (`search_book`, `add_book`,
`log_reading`, `get_reading_list`, `finish_book`, `get_reading_stats`, `get_book_history`, além
do `get_book_by_id`/`update_book_by_id` já usados pelo coordinator). React: lista de leitura,
detalhe do livro com linha do tempo dos logs, adicionar livro via busca no Google Books.

**Fatia 4 — Tarefas/Agenda (Kaguya) — visualizações.**
`routers/tasks.py` importando as funções de cliente do TickTick + Calendar de
`mcp_servers/ticktick/server.py` e `mcp_servers/calendar/server.py`. Foco em leitura (tarefas
de hoje, projetos, próximos eventos) + criar/concluir básico. Edição pesada de tarefas
permanece nos apps nativos; o painel de chat cobre o resto.

**Fatia 5 — Painel de chat (Makima).**
`routers/chat.py` reutiliza `create_makima()` + `Runner(session_service=DatabaseSessionService(...))`
no mesmo Postgres. `POST /api/chat` roda um turno e devolve a resposta (streaming via SSE como
evolução). `ChatPanel` em React fixo no layout, disponível em todas as páginas — o "trabalhar
em conjunto" de forma literal.

**Futuro — Lucy (e-mail) / Media (Notion).** Adicionar um router + páginas para cada um quando
esses agentes existirem. O formato "um router por domínio" já acomoda isso.

---

## Arquivos críticos

**Novos:** tudo dentro de `webapp/` (ver layout acima); edições em `docker-compose.yml`
(adicionar serviço `web`) e `requirements.txt` (adicionar `fastapi`, `uvicorn[standard]`,
`authlib`, `itsdangerous`).

**Ler/reaproveitar, NÃO modificar (importados como estão):**
- `agents/nami/tools.py` + `tools_accounts.py` + `tools_credit_cards.py` +
  `tools_installments.py` + `tools_loans.py` + `tools_budgets.py` + `tools_health.py`
- `agents/frieren/tools.py`
- `mcp_servers/ticktick/server.py`, `mcp_servers/calendar/server.py`
- `coordinator/agent.py` (`create_makima`) para o painel de chat
- Padrão do cliente BigQuery `_client()` em `agents/nami/tools.py` (âncora de reaproveitamento)

**Apenas referência:** `coordinator/main.py` (como `DatabaseSessionService` + `Runner` são
montados — espelhar em `routers/chat.py`), `coordinator/Dockerfile` e `docker-compose.yml`
(padrão de deploy a copiar para o serviço `web`).

---

## Deploy

- `webapp/backend/Dockerfile` multi-stage: estágio 1 builda o React (`npm ci && npm run build`),
  estágio 2 é `python:3.12-slim` rodando `uvicorn webapp.backend.main:app` e servindo o `dist/`.
- Serviço `web` novo no `docker-compose.yml`, na `dokploy-network`, `restart: unless-stopped`,
  porta interna 8080.
- No Dokploy: aplicação nova vinculada ao subdomínio (proxy reverso + TLS), variáveis de
  ambiente = o conjunto GCP/Telegram/Gemini que já existe **mais** as novas vars de OAuth.
  Reutiliza o mesmo `DATABASE_URL` (Postgres) e `GCP_CREDENTIALS_JSON` / `GCP_PROJECT_ID`.
- O Gustavo cria um **cliente OAuth 2.0 do tipo Web** no projeto GCP que já existe e registra a
  URL de callback do subdomínio; client id/secret vão para as envs do Dokploy.

---

## Verificação (ponta a ponta)

1. **Local:** `uvicorn webapp.backend.main:app --reload`; acessar `/api/healthz` → 200.
2. **Auth:** abrir a raiz sem login → redireciona para o Google; logar com o e-mail da
   allowlist → entra no app; um e-mail fora da allowlist → recusado.
3. **Ida e volta de finanças:** criar uma transação na web → conferir a linha no BigQuery
   (`bq query` em `nami_finance_agent.transactions`) → perguntar à Makima no Telegram "quanto
   gastei hoje?" e ver o mesmo valor. Editar + excluir pela web e reconferir.
4. **Livros:** adicionar um livro via busca no Google Books, registrar uma sessão de leitura,
   conferir que aparece tanto na lista da web quanto via Frieren no Telegram.
5. **Painel de chat:** enviar "gastei 50 no mercado" no chat da web → Makima roteia para a Nami
   → linha cai no BigQuery → aparece na tabela de finanças após atualizar.
6. **Deploy:** push, Dokploy builda o serviço `web`, subdomínio serve por HTTPS, callback do
   OAuth funciona contra a URL de produção, `/healthz` verde.

Os routers do backend ganham testes leves (FastAPI `TestClient`) com as funções de tool do
BigQuery mockadas, para verificar a ligação das rotas sem bater no BigQuery na CI.

---

## Fora de escopo (v1)

- Multiusuário / particionamento de dados por usuário (ferramenta de um usuário só; allowlist
  OAuth de um e-mail).
- Sistema de design visual final — UI funcional agora, refino depois, conforme instrução.
- Migração do bot do Telegram para webhook (continua em polling, intocado).
- UI de gerenciamento da Kurisu (RAG) — exposta só pelo painel de chat por enquanto.
```
