# Makima Personal Agent

Bot Telegram multi-agente construído com **Google ADK**. Recebe mensagens em linguagem natural e delega para agentes especialistas conforme o domínio — finanças, tarefas, agenda, livros, diário e base de conhecimento pessoal.

---

## Uso rápido

Envie mensagens pelo Telegram. Makima identifica o domínio e roteia automaticamente:

| Mensagem | Agente | O que acontece |
|---|---|---|
| "gastei 35 reais no almoço, débito Itaú" | Nami 💰 | Registra despesa no PostgreSQL |
| "quanto gastei essa semana?" | Nami 💰 | Consulta e resume as transações |
| "comprei no crédito em 12x, R$1200" | Nami 💰 | Cria parcelamento (12 transações) |
| "qual minha dívida no Nubank?" | Nami 💰 | Calcula dívida atual do cartão |
| "qual meu score de saúde financeira?" | Nami 💰 | Score 0-100 em 4 dimensões |
| "adiciona tarefa: revisar relatório até sexta" | Kaguya 📋 | Cria tarefa no TickTick |
| "o que tenho na agenda amanhã?" | Kaguya 📋 | Lista eventos do Google Calendar |
| "paguei a Netflix, 55 reais" | Kaguya + Nami | Completa tarefa e lança despesa |
| "o que é machine learning?" | Kurisu 🧠 | Busca no vault Obsidian via RAG |
| "adiciona o livro Duna" | Frieren 📚 | Busca metadados e adiciona ao catálogo |
| "li até a página 120" | Frieren 📚 | Registra sessão de leitura |

---

## Interface Web (webapp)

Painel web disponível em `makima.gusstavo42-vps.cloud` — acesso restrito ao e-mail do Gustavo via Google OAuth.

Compartilha os dados do bot: uma transação registrada pelo Telegram aparece na web e vice-versa.

**Páginas disponíveis:**

| Página | O que faz |
|---|---|
| Dashboard | Health score financeiro, gastos por categoria do mês |
| Transações | CRUD completo — filtro por mês, criação e exclusão |
| Contas | Listagem de contas bancárias, criação e consulta de saldo atual |
| Cartões | Dívida por cartão, barra de uso do limite, registrar pagamento |
| Empréstimos | Saldo devedor, parcelas restantes, registrar pagamento |
| Orçamentos | Envelopes por categoria com barra de progresso, definir novo limite |
| Assinaturas | Lista de assinaturas recorrentes com custo mensal total |
| Livros | Catálogo pessoal com filtros por status, wishlist com preço e link |
| Diário | Bullet journal com heatmap anual, `@pessoas`, `#tags` e busca full-text |

**Stack:** FastAPI (backend) + React 19 + TypeScript + Tailwind CSS (frontend) — servidos pelo mesmo container.

---

## Arquitetura

```
Telegram (usuário)
    ↓
coordinator/main.py  (python-telegram-bot)
    ↓
coordinator/agent.py  (Makima — Agent ADK)
    ├── Nami       → PostgreSQL (finanças)                      ✅ ativo
    ├── Kaguya     → TickTick via MCP + Google Calendar MCP     ✅ ativo
    ├── Kurisu     → Vertex AI RAG (vault Obsidian)             🔧 estrutura criada, pendente corpus
    ├── Frieren    → PostgreSQL + Google Books API (livros)     ✅ ativo
    ├── Lucy       → Gmail IMAP                                 — fase 4
    └── Media      → Notion (séries, filmes, anime)             — fase 5b
```

Makima não executa nenhuma ação diretamente — ela apenas roteia para o agente correto. Toda lógica de acesso a APIs fica nos agentes especialistas.

Todos os dados (finanças, livros, journal, sessões ADK) ficam no mesmo PostgreSQL gerenciado pelo Dokploy.

---

## Agentes

### Makima (coordinator)
Inspirada na Makima de Chainsaw Man. Calma, autoritária, nunca usa frases de subordinação. Enquadra limitações como decisões ("Esse recurso ainda não foi ativado.").

### Nami — finanças
Inspirada na Nami de One Piece. Acessa o PostgreSQL para registrar e consultar transações financeiras. Reage com fúria em despesas, comemora receitas.

**Funcionalidades:**
- Transações (gastos e receitas) com categorias e contas
- Compras parceladas — gera N transações automaticamente com datas mensais
- Cartões de crédito — dívida atual, simulação de quitação, custo do mínimo
- Empréstimos e financiamentos — sistemas PRICE e SAC, simulação de amortização
- Orçamento por categoria — alertas quando o limite está próximo
- Score de saúde financeira 0-100 em 4 dimensões (poupança, dívidas, orçamento, tendência)
- Contas financeiras — cadastro dinâmico (corrente, poupança, dinheiro, investimento)

**Armazenamento:** PostgreSQL — tabelas `transactions`, `accounts`, `credit_cards`, `loans`, `budgets`, `subscriptions`, `installment_groups`.

### Kaguya — tarefas e agenda
Inspirada na Kaguya Shinomiya de Kaguya-sama. Aristocrática e organizada. Gerencia tarefas no TickTick e eventos no Google Calendar via dois servidores MCP. Possui tools cross-agent para integrar com a Nami:

| Tool | O que faz |
|---|---|
| `complete_payment_task` | Completa tarefa no TickTick **e** lança despesa no PostgreSQL |
| `create_expense_reminder` | Cria lembrete de pagamento no TickTick (sem lançar despesa ainda) |

### Kurisu — knowledge base
Inspirada na Kurisu Makise de Steins;Gate. Neurocientista prodígio, direta e levemente sarcástica. Acessa o vault de notas do Obsidian via Vertex AI RAG para explicar conceitos, cruzar informações entre notas e responder sobre estudos e memória pessoal.

Opera em dois modos detectados automaticamente:
- **Tutora** — notas de estudo e técnicas: tom rigoroso, referencia fontes do vault, sarcasmo saudável
- **Amiga** — notas pessoais e diário: tom caloroso, linguagem natural, sem estrutura formal

### Frieren — livros
Inspirada em Frieren de *Frieren: Beyond Journey's End* — elfa maga milenar, contemplativa, paciente.

Gerencia o catálogo pessoal de livros e rastreia o progresso de leitura por páginas. Integra com a Google Books API para enriquecer automaticamente os metadados (capa, autor, ISBN, sinopse) ao adicionar um livro.

**Funcionalidades:**
- 7 status de leitura: `lendo`, `lido`, `quero_ler`, `estante`, `wishlist`, `pausado`, `abandonado`
- `estante` = livros físicos/Kindle que você possui mas ainda não leu
- `wishlist` = livros que quer comprar, com preço e link da loja
- Registrar sessões de leitura por página atual (calcula delta automaticamente)
- Menu interativo com botões inline: avaliar, trocar status, adicionar nota, marcar como lido
- Envio da capa do livro junto com o menu (via Google Books API)
- Estatísticas anuais: livros lidos, páginas totais, ritmo médio de leitura

**Armazenamento:** PostgreSQL — tabelas `books` e `reading_logs`.

### Journal — diário pessoal
Agente interno (sem personalidade própria). Gerencia o diário bullet journal com extração automática de menções (`@pessoa`, `#tag`) e busca full-text.

**Funcionalidades:**
- Uma página por dia, criada automaticamente
- Bullets numerados por posição (upsert por posição)
- Extração automática de `@pessoa` e `#tag` de cada bullet
- Busca full-text com dicionário português
- Heatmap anual de atividade (quantidade de bullets por dia)

**Armazenamento:** PostgreSQL — tabelas `journal_types`, `journal_pages`, `journal_bullets`, `journal_mentions`.

---

## Estrutura de arquivos

```
makima_personal_agent/
├── coordinator/
│   ├── main.py              # Telegram bot loop + sessões ADK + menu interativo
│   ├── agent.py             # Makima (Agent ADK) + sub_agents
│   └── Dockerfile
├── agents/
│   ├── db.py                # módulo compartilhado de conexão PostgreSQL (run_select/run_dml)
│   ├── nami/
│   │   ├── tools.py             # transações, assinaturas
│   │   ├── tools_accounts.py    # contas financeiras
│   │   ├── tools_installments.py # compras parceladas
│   │   ├── tools_credit_cards.py # cartões de crédito
│   │   ├── tools_loans.py       # empréstimos (PRICE/SAC)
│   │   ├── tools_budgets.py     # orçamento por categoria
│   │   ├── tools_health.py      # score de saúde financeira
│   │   ├── agent.py             # nami_agent (singleton)
│   │   └── schema_pg.sql        # schema PostgreSQL das tabelas financeiras
│   ├── kaguya/
│   │   ├── tools.py         # tools cross-agent (Kaguya+Nami)
│   │   └── agent.py         # create_kaguya_agent() — factory com dois McpToolsets
│   ├── kurisu/
│   │   └── agent.py         # kurisu_agent (singleton, VertexAiRagRetrieval)
│   ├── frieren/
│   │   ├── tools.py         # PostgreSQL (catálogo + logs) + Google Books API
│   │   ├── agent.py         # frieren_agent (singleton)
│   │   └── schema_pg.sql    # schema PostgreSQL (books, reading_logs)
│   └── journal/
│       ├── tools.py         # PostgreSQL (pages, bullets, mentions)
│       ├── agent.py         # journal_agent
│       └── schema_pg.sql    # schema PostgreSQL do diário
├── mcp_servers/
│   ├── ticktick/
│   │   └── server.py        # servidor MCP — tools genéricas do TickTick
│   └── calendar/
│       └── server.py        # servidor MCP — Google Calendar
├── webapp/
│   ├── backend/
│   │   ├── main.py          # FastAPI app — monta routers e serve o build do React
│   │   ├── config.py        # variáveis de ambiente (OAuth, sessão)
│   │   ├── deps.py          # dependência FastAPI que valida o cookie de sessão
│   │   └── routers/
│   │       ├── auth.py      # Google OAuth (callback, /auth/me, logout)
│   │       ├── finances.py  # /api/finances/* — tools da Nami
│   │       ├── books.py     # /api/books/*   — tools da Frieren
│   │       └── journal.py   # /api/journal/* — tools do Journal
│   ├── frontend/
│   │   └── src/
│   │       ├── App.tsx          # roteamento + verificação de sessão
│   │       ├── components/
│   │       │   └── Layout.tsx   # sidebar de navegação
│   │       ├── pages/           # Dashboard, Transactions, Accounts, Cards, Loans,
│   │       │                    # Budgets, Subscriptions, Books, BookDetail, Journal
│   │       └── lib/api.ts       # wrapper de fetch com cookie de sessão automático
│   └── Dockerfile               # multi-stage: Node 20 (build React) → Python 3.12 (uvicorn)
├── scripts/
│   ├── authorize_calendar.py  # gera credenciais OAuth do Google Calendar (rodar uma vez)
│   ├── setup_schemas.py       # cria tabelas PostgreSQL de todos os agentes
│   ├── migrate_bq_to_pg.py    # migração one-time: BigQuery → PostgreSQL
│   └── backup_postgres.py     # pg_dump → Google Cloud Storage (roda diariamente via Docker)
├── requirements.txt
├── PLAN.md                  # design completo, fases, schemas, custos
└── CLAUDE.md                # instruções do projeto para o Claude Code
```

---

## Comandos Telegram

| Comando | O que faz |
|---|---|
| `/limpar` | Reseta o contexto de todos os domínios (nova conversa do zero) |
| `/limpar financas` | Reseta só o contexto de finanças (Nami) |
| `/limpar livros` | Reseta só o contexto de livros (Frieren) |
| `/limpar tarefas` | Reseta só o contexto de tarefas/agenda (Kaguya) |
| `/limpar knowledge` | Reseta só o contexto de knowledge base (Kurisu) |
| `/tokens` | Exibe o total de tokens consumidos por domínio nesta sessão do container |

> O bot avisa automaticamente quando o contexto de um domínio está ficando grande e sugere o `/limpar <dominio>`.
> O contador de `/tokens` reseta ao reiniciar o container.

---

## Pré-requisitos

- Python 3.11+
- PostgreSQL (gerenciado pelo Dokploy no VPS)
- Google Cloud com Calendar API habilitada
- App OAuth 2.0 (tipo Desktop) no Google Cloud Console para o Calendar
- App OAuth 2.0 (tipo Web Application) no Google Cloud Console para a webapp
- Bot Telegram criado via [@BotFather](https://t.me/BotFather)
- App TickTick com credenciais OAuth

---

## Instalação local

```bash
# Clonar e criar ambiente virtual
git clone https://github.com/Gusstavo42/makima_personal_agent
cd makima_personal_agent
python -m venv .venv

# Ativar e instalar dependências
.venv\Scripts\activate         # Windows
# source .venv/bin/activate    # Linux/Mac
pip install -r requirements.txt
```

---

## Variáveis de ambiente

Crie um arquivo `.env` na raiz com as variáveis abaixo (ou configure no Dokploy para o VPS):

```env
# Telegram
TELEGRAM_BOT_TOKEN=

# Google AI
GEMINI_API_KEY=

# PostgreSQL — banco compartilhado para todos os agentes e sessões ADK
DATABASE_URL=postgresql://user:pass@host:5432/db

# Google Cloud Storage — backup automático do PostgreSQL
GCP_CREDENTIALS_JSON=     # conteúdo JSON do service account como string (não path)
GCP_PROJECT_ID=
GCS_BACKUP_BUCKET=        # nome do bucket GCS para backups (ex: makima-backups)

# TickTick OAuth
TICKTICK_ACCESS_TOKEN=
TICKTICK_CLIENT_ID=
TICKTICK_CLIENT_SECRET=
TICKTICK_REFRESH_TOKEN=
TICKTICK_EXPIRES_AT=               # ISO 8601

# Google Calendar OAuth
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_ACCESS_TOKEN=
GOOGLE_CALENDAR_REFRESH_TOKEN=
GOOGLE_CALENDAR_TOKEN_EXPIRY=      # ISO 8601
GOOGLE_CALENDAR_MAIN_CALENDAR_ID=  # geralmente o email Gmail

# Frieren — Google Books API (opcional)
# Sem a chave o limite é ~1.000 req/dia; com ela sobe para 10.000 req/dia
GOOGLE_BOOKS_API_KEY=

# Kurisu — Vertex AI RAG (fase 3)
VERTEX_RAG_CORPUS=             # projects/{PROJECT_ID}/locations/us-central1/ragCorpora/{ID}

# Webapp (interface web)
ALLOWED_EMAIL=                     # e-mail Google autorizado a logar na webapp
SESSION_SECRET=                    # segredo para assinar cookies (gerar: python -c "import secrets; print(secrets.token_hex(32))")
GOOGLE_OAUTH_CLIENT_ID=            # client ID do app OAuth tipo Web Application
GOOGLE_OAUTH_CLIENT_SECRET=        # client secret do mesmo app
OAUTH_REDIRECT_URL=                # URL de callback (ex: https://makima.seudominio.com/auth/callback)
```

---

## Setup inicial

### 1. Criar tabelas no PostgreSQL

```bash
DATABASE_URL=... python scripts/setup_schemas.py
```

### 2. Cadastrar contas bancárias (Nami)

Antes de registrar transações, cadastre as contas via Telegram:

```
"Nami, cria uma conta chamada Itau, tipo corrente, início 2026-01-01"
```

Depois cadastre os cartões de crédito:

```
"Nami, cadastra meu cartão Nubank, conta Itau, limite 1600, taxa 16.1% ao mês, fechamento dia 6, vencimento dia 13"
```

> Cartões de crédito não são contas — não crie conta do tipo "cartão de crédito". O cartão rastreia a dívida separadamente.

### 3. Autorizar o Google Calendar

1. Google Cloud Console → **APIs → Biblioteca** → habilitar **Google Calendar API**
2. Criar credencial **OAuth 2.0 tipo Desktop app** → baixar JSON → salvar como `scripts/client_secret.json`
3. Executar:

```bash
python scripts/authorize_calendar.py
```

O script abre o browser, solicita permissão e imprime os valores para copiar ao `.env`.

---

## Rodar localmente

```bash
python -m coordinator.main
```

Os agentes usam `gemini-2.5-flash`. A chave é lida de `GEMINI_API_KEY` (Google AI Studio). Para usar Vertex AI, definir `GOOGLE_GENAI_USE_VERTEXAI=1`.

Para rodar a webapp localmente:

```bash
# Backend
uvicorn webapp.backend.main:app --reload --port 8080

# Frontend (em webapp/frontend/)
npm install && npm run dev   # dev server em localhost:5173
```

---

## Deploy (VPS com Dokploy)

- Host: Hostinger com Dokploy
- Dois containers no mesmo Docker Compose: `makima` (bot Telegram) e `web` (FastAPI + React)
- Porta interna `8080` — exposta pelo proxy reverso do Dokploy como HTTPS
- Variáveis configuradas no painel do Dokploy
- Deploy automático via push para o GitHub

---

## Fases de implementação

| Fase | Descrição | Status |
|---|---|---|
| 1 | Nami (finanças): tools PostgreSQL + agente | ✅ |
| 2 | Kaguya (tarefas + agenda): MCP TickTick + MCP Calendar + tools cross-agent | ✅ |
| 3 | Kurisu (knowledge base): Vertex AI RAG sobre vault Obsidian — estrutura criada, pendente corpus GCP | 🔧 |
| 4 | Lucy (email): tools Gmail IMAP + agente | — |
| 5a | Frieren (livros): PostgreSQL + Google Books API + menu interativo Telegram | ✅ |
| 5b | Media (séries, filmes, anime): Notion + morning briefing completo | — |

**Fase atual: 3 🔧** — Kurisu com estrutura criada. Próximo passo: setup do Data Store no Vertex AI Agent Builder (ver `agents/kurisu/CLAUDE.md`).

---

## Dependências

```
google-adk               # framework de agentes (Agent, InMemoryRunner, McpToolset)
python-telegram-bot      # bot Telegram
python-dotenv            # carrega variáveis do arquivo .env
requests                 # HTTP para APIs externas
asyncpg                  # driver async PostgreSQL (ADK DatabaseSessionService)
sqlalchemy               # ORM usado internamente pelo ADK
psycopg2-binary          # driver síncrono PostgreSQL (tools dos agentes)
google-cloud-storage     # backup automático para GCS
mcp                      # Model Context Protocol (servidores MCP TickTick e Calendar)
google-auth              # OAuth do Google Calendar
google-auth-oauthlib     # fluxo OAuth desktop
google-api-python-client # Google Calendar API v3
fastapi                  # backend web
uvicorn[standard]        # servidor ASGI
authlib                  # Google OAuth (OIDC) para a webapp
itsdangerous             # assina cookies de sessão
```
