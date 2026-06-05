# Makima Personal Agent

Bot Telegram multi-agente construído com **Google ADK**. Recebe mensagens e delega para agentes especialistas conforme o domínio — finanças, tarefas, agenda, email, mídia, livros e base de conhecimento pessoal.

---

## Uso rápido

Envie mensagens em linguagem natural pelo Telegram. Makima identifica o domínio e roteia automaticamente:

| Mensagem | Agente | O que acontece |
|---|---|---|
| "gastei 35 reais no almoço, débito Itaú" | Nami 💰 | Registra despesa no BigQuery |
| "quanto gastei essa semana?" | Nami 💰 | Consulta e resume as transações |
| "comprei no crédito em 12x, R$1200" | Nami 💰 | Cria parcelamento (12 transações) |
| "qual minha dívida no Nubank?" | Nami 💰 | Calcula dívida atual do cartão |
| "qual meu score de saúde financeira?" | Nami 💰 | Score 0-100 em 4 dimensões |
| "quanto posso gastar em lazer esse mês?" | Nami 💰 | Verifica orçamento da categoria |
| "adiciona tarefa: revisar relatório até sexta" | Kaguya 📋 | Cria tarefa no TickTick |
| "o que tenho na agenda amanhã?" | Kaguya 📋 | Lista eventos do Google Calendar |
| "paguei a Netflix, 55 reais" | Kaguya + Nami | Completa tarefa e lança despesa |
| "o que é machine learning?" | Kurisu 🧠 | Busca no vault Obsidian via RAG |
| "adiciona o livro Duna" | Frieren 📚 | Busca metadados e adiciona ao catálogo |
| "li até a página 120" | Frieren 📚 | Registra sessão de leitura |

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
    ├── Kurisu     → Vertex AI RAG (vault Obsidian)           🔧 estrutura criada, pendente corpus
    ├── Frieren    → BigQuery + Google Books API (livros)     ✅ ativo
    ├── Lucy       → Gmail IMAP                               — fase 4
    └── Media      → Notion (séries, filmes, anime)           — fase 5b
```

Makima não executa nenhuma ação diretamente — ela apenas roteia para o agente correto. Toda lógica de API fica nos agentes especialistas.

---

## Agentes

### Makima (coordinator)
Inspirada na Makima de Chainsaw Man. Calma, autoritária, nunca usa frases de subordinação. Enquadra limitações como decisões ("Esse recurso ainda não foi ativado.").

### Nami — finanças
Inspirada na Nami de One Piece. Acessa o BigQuery para registrar e consultar transações financeiras. Reage com fúria em despesas, comemora receitas.

**Funcionalidades:**
- Transações (gastos e receitas) com categorias e contas
- Compras parceladas — gera N transações automaticamente com datas mensais
- Cartões de crédito — dívida atual, simulação de quitação, custo do mínimo
- Empréstimos e financiamentos — sistemas PRICE e SAC, simulação de amortização
- Orçamento por categoria — alertas quando o limite está próximo
- Score de saúde financeira 0-100 em 4 dimensões (poupança, dívidas, orçamento, tendência)
- Contas financeiras — cadastro dinâmico (corrente, poupança, dinheiro, investimento)

**Armazenamento:** BigQuery — dataset `nami_finance_agent`.

### Kaguya — tarefas e agenda
Inspirada na Kaguya Shinomiya de Kaguya-sama. Aristocrática e organizada. Gerencia tarefas no TickTick e eventos no Google Calendar via dois servidores MCP. Possui tools cross-agent para integrar com a Nami:

| Tool | O que faz |
|---|---|
| `complete_payment_task` | Completa tarefa no TickTick **e** lança despesa no BigQuery |
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
- Adicionar livros com status: lendo, lido, quero\_ler, pausado, abandonado
- Registrar sessões de leitura por página atual (calcula delta automaticamente)
- Menu interativo com botões inline: avaliar, trocar status, adicionar nota, marcar como lido
- Envio da capa do livro junto com o menu (via Google Books API)
- Estatísticas anuais: livros lidos, páginas totais, ritmo médio de leitura
- Histórico cronológico de sessões por livro

**Armazenamento:** BigQuery — dataset `frieren_books_agent`, tabelas `books` e `reading_logs`.

---

## Estrutura de arquivos

```
makima_personal_agent/
├── coordinator/
│   ├── main.py              # Telegram bot loop + sessões ADK + menu interativo (botões inline)
│   ├── agent.py             # Makima (Agent ADK) + sub_agents
│   └── Dockerfile
├── agents/
│   ├── nami/
│   │   ├── tools.py             # transações, assinaturas, helpers BigQuery
│   │   ├── tools_accounts.py    # contas financeiras (create/list/balance)
│   │   ├── tools_installments.py # compras parceladas
│   │   ├── tools_credit_cards.py # cartões de crédito
│   │   ├── tools_loans.py       # empréstimos e financiamentos (PRICE/SAC)
│   │   ├── tools_budgets.py     # orçamento por categoria
│   │   ├── tools_health.py      # score de saúde financeira
│   │   ├── agent.py             # nami_agent (singleton, 32 tools)
│   │   └── schema.sql           # schema das tabelas BigQuery
│   ├── kaguya/
│   │   ├── tools.py         # tools cross-agent (Kaguya+Nami)
│   │   ├── agent.py         # create_kaguya_agent() — factory com dois McpToolsets
│   │   └── PLAN.md          # documentação do agente
│   ├── kurisu/
│   │   ├── agent.py         # kurisu_agent (singleton, VertexAiRagRetrieval)
│   │   └── PLAN.md          # documentação + checklist de setup do Vertex AI
│   └── frieren/
│       ├── tools.py         # BigQuery (catálogo + logs) + Google Books API
│       ├── agent.py         # frieren_agent (singleton)
│       ├── schema.sql       # schema das tabelas BigQuery (books, reading_logs)
│       └── CLAUDE.md        # documentação completa do agente
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
# Conteúdo completo do JSON do service account como string (não path de arquivo)
# Necessário para Nami (finanças) e Frieren (livros)
GCP_CREDENTIALS_JSON=
GCP_PROJECT_ID=

# Sessões ADK — PostgreSQL externo (gerenciado pelo Dokploy)
# Formato: postgresql://user:pass@host:5432/db (o código normaliza para +asyncpg automaticamente)
DATABASE_URL=

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

# Uso futuro
NOTION_TOKEN=
```

---

## Setup inicial da Nami (primeira vez)

Antes de registrar qualquer transação, cadastre as contas bancárias via Telegram:

```
"Nami, cria uma conta chamada Itau, tipo corrente, instituição Itaú, início 2026-01-01"
```

Depois, cadastre os cartões de crédito vinculando a uma conta corrente ou poupança:

```
"Nami, cadastra meu cartão Nubank, conta Itau, limite 1600, taxa 16.1% ao mês, fechamento dia 6, vencimento dia 13"
```

> Cartões de crédito não são contas — não crie conta do tipo "cartão de crédito".
> O cartão rastreia a dívida separadamente; o vínculo com uma conta corrente indica de onde a fatura será paga.

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

Os agentes usam `gemini-2.5-flash`. A chave Gemini é lida de `GEMINI_API_KEY` (Google AI Studio). Para usar Vertex AI em vez do AI Studio, definir `GOOGLE_GENAI_USE_VERTEXAI=1`.

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
| 3 | Kurisu (knowledge base): Vertex AI RAG sobre vault Obsidian — estrutura criada, pendente corpus GCP | 🔧 |
| 4 | Lucy (email): tools Gmail IMAP + agente | — |
| 5a | Frieren (livros): BigQuery + Google Books API + menu interativo Telegram | ✅ |
| 5b | Media (séries, filmes, anime): Notion + morning briefing completo | — |

**Fase atual: 3 🔧** — Kurisu com estrutura criada. Próximo passo: setup do Data Store no Vertex AI Agent Builder (ver `agents/kurisu/CLAUDE.md`).

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
