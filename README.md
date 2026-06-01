# Makima Personal Agent

Bot Telegram multi-agente construído com **Google ADK**. Recebe mensagens e delega para agentes especialistas conforme o domínio — finanças, tarefas, agenda, email, mídia, livros e base de conhecimento pessoal.

---

## Arquitetura

```
Telegram (usuário)
    ↓
coordinator/main.py  (python-telegram-bot)
    ↓
coordinator/agent.py  (Makima — Agent ADK)
    ├── Nami       → BigQuery (finanças)                      ✅ ativo
    ├── Kaguya     → TickTick via MCP + Google Calendar MCP   ✅ ativo
    ├── Lucy       → Gmail IMAP                               — fase 3
    ├── Media      → Notion (séries, filmes, anime)           — fase 4
    ├── Books      → Notion (livros)                          — fase 4
    └── knowledge  → Vertex AI RAG (vault Obsidian)          — fase 5
```

Makima não executa nenhuma ação diretamente — ela apenas roteia para o agente correto. Toda lógica de API fica nos agentes especialistas.

---

## Agentes

### Makima (coordinator)
Inspirada na Makima de Chainsaw Man. Calma, autoritária, nunca usa frases de subordinação. Enquadra limitações como decisões ("Esse recurso ainda não foi ativado.").

### Nami — finanças
Inspirada na Nami de One Piece. Acessa o BigQuery para registrar e consultar transações financeiras. Reage com fúria em despesas, comemora receitas.

### Kaguya — tarefas e agenda
Inspirada na Kaguya Shinomiya de Kaguya-sama. Aristocrática e organizada. Gerencia tarefas no TickTick e eventos no Google Calendar via dois servidores MCP. Possui tools cross-agent para integrar com a Nami:

| Tool | O que faz |
|---|---|
| `complete_payment_task` | Completa tarefa no TickTick **e** lança despesa no BigQuery |
| `create_expense_reminder` | Cria lembrete de pagamento no TickTick (sem lançar despesa ainda) |

---

## Estrutura de arquivos

```
makima_personal_agent/
├── coordinator/
│   ├── main.py              # Telegram bot loop + sessões ADK
│   ├── agent.py             # Makima (Agent ADK) + sub_agents
│   └── Dockerfile
├── agents/
│   ├── nami/
│   │   ├── tools.py         # acesso ao BigQuery
│   │   ├── agent.py         # nami_agent
│   │   └── schema.sql       # schema das tabelas BigQuery
│   └── kaguya/
│       ├── tools.py         # tools cross-agent (Kaguya+Nami)
│       └── agent.py         # create_kaguya_agent() — factory com dois McpToolsets
├── mcp_servers/
│   ├── ticktick/
│   │   └── server.py        # servidor MCP — tools genéricas do TickTick
│   └── calendar/
│       └── server.py        # servidor MCP — Google Calendar
├── scripts/
│   └── authorize_calendar.py  # gera credenciais OAuth do Google Calendar (rodar uma vez)
├── requirements.txt
├── PLAN.md                  # design completo, fases, schemas, custos
└── CLAUDE.md                # instruções do projeto para o Claude Code
```

---

## Pré-requisitos

- Python 3.11+
- Conta Google com BigQuery e Google Calendar API habilitados
- App OAuth 2.0 (tipo Desktop) no Google Cloud Console
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

# Google Cloud / BigQuery
GOOGLE_APPLICATION_CREDENTIALS=   # path do service account JSON
GCP_PROJECT_ID=

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

# Uso futuro
NOTION_TOKEN=
VERTEX_RAG_CORPUS=
```

---

## Autorizar o Google Calendar (primeira vez)

1. Google Cloud Console → projeto do BigQuery → **APIs e Serviços → Biblioteca** → habilitar **Google Calendar API**
2. Criar credencial **OAuth 2.0 tipo Desktop app** → baixar JSON → salvar como `scripts/client_secret.json`
3. Executar o script de autorização:

```bash
python scripts/authorize_calendar.py
```

O script abre o browser, solicita permissão e imprime os valores das variáveis de ambiente. Copiar para o `.env`.

---

## Rodar

```bash
python -m coordinator.main
```

Os agentes usam `gemini-2.0-flash`. A chave Gemini é lida de `GEMINI_API_KEY` (Google AI Studio). Para usar Vertex AI em vez do AI Studio, definir `GOOGLE_GENAI_USE_VERTEXAI=1`.

---

## Deploy (VPS com Dokploy)

- Host: Hostinger com Dokploy
- Container separado no mesmo Docker Compose do n8n
- Porta interna `8080` (não exposta externamente)
- Variáveis configuradas no painel do Dokploy

---

## Fases de implementação

| Fase | Descrição | Status |
|---|---|---|
| 1 | Nami (finanças): tools BigQuery + agente | ✅ |
| 2 | Kaguya (tarefas + agenda): MCP TickTick + MCP Calendar + tools cross-agent | ✅ |
| 3 | Lucy (email): tools Gmail IMAP + agente | — |
| 4 | Media + Books: entretenimento + morning briefing completo | — |
| 5 | Knowledge: Vertex AI RAG sobre vault Obsidian (Google Drive) | — |

**Fase atual: 2** — Nami e Kaguya ativas, deploy feito no VPS.

---

## Dependências

```
google-adk               # framework de agentes (Agent, InMemoryRunner, McpToolset)
python-telegram-bot      # bot Telegram
google-cloud-bigquery    # BigQuery (Nami)
requests                 # HTTP para APIs externas
mcp[cli]                 # FastMCP — servidores MCP do TickTick e Calendar
google-auth              # OAuth do Google Calendar
google-auth-oauthlib     # fluxo OAuth desktop (script de autorização)
google-api-python-client # Google Calendar API v3
```
