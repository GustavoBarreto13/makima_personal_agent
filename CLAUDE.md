# CLAUDE.md — makima_personal_agent

## O que é este repo

**Makima** é um coordinator multi-agente construído com Google ADK. Roda como bot Telegram autônomo no VPS, recebendo mensagens e delegando para agentes especialistas conforme o domínio do pedido.

O design completo — arquitetura, fases, schemas BigQuery, custos — está em `PLAN.md`.

---

## Relação com n8n-python-scripts

Os dois repositórios são **independentes**. O `makima_personal_agent` é self-contained: não importa nada do [`n8n-python-scripts`](https://github.com/Gusstavo42/n8n-python-scripts) (local: `C:\Users\gusta\Documents\GitHub\n8n-python-scripts`) em runtime.

O `n8n-python-scripts` serve apenas como **referência**: lá ficam os scripts batch (chamados pelo n8n) cuja lógica de acesso às APIs (Notion, Gmail, etc.) usamos como modelo ao escrever as tools dos agentes aqui. Os IDs e schemas são **copiados, não importados** — o custo dessa independência é manter essas constantes em sincronia manualmente se a fonte mudar.

### Onde vivem os agentes (neste repo)

Cada agente especialista é um pacote local em `agents/`:

```
makima_personal_agent/
├── agents/
│   ├── nami/        # finanças (BigQuery)                      ← Fase 1 ✅
│   │   ├── tools.py     # acesso ao BigQuery (ref.: n8n nami_finance_agent/main.py)
│   │   └── agent.py     # nami_agent (Agent ADK)
│   ├── kaguya/      # tarefas (TickTick via MCP) + agenda      ← Fase 2 ✅
│   │   ├── tools.py     # tools cross-agent (complete_payment_task, create_expense_reminder)
│   │   └── agent.py     # create_kaguya_agent() — factory com dois McpToolsets
│   ├── kurisu/      # knowledge base (Vertex AI RAG)            ← Fase 3 🔧 (estrutura criada)
│   │   └── agent.py     # kurisu_agent — singleton com VertexAiRagRetrieval
│   ├── lucy/        # email (Gmail IMAP)                        — Fase 4
│   ├── media/       # séries+filmes+anime                       — Fase 5
│   └── books/       # livros                                    — Fase 5
├── mcp_servers/
│   ├── ticktick/
│   │   └── server.py    # servidor MCP stdio — tools genéricas do TickTick
│   └── calendar/
│       └── server.py    # servidor MCP stdio — Google Calendar (leitura todos, escrita só principal)
├── scripts/
│   └── authorize_calendar.py  # gera credenciais OAuth do Google Calendar (rodar uma vez)
```

### Como o coordinator importa

```python
# coordinator/agent.py
from agents.nami.agent import nami_agent
from agents.kaguya.agent import create_kaguya_agent   # factory (instancia McpToolset)
from agents.frieren.agent import frieren_agent
# from agents.kurisu.agent import kurisu_agent         # pendente: setup Vertex AI RAG
# from agents.lucy.agent import lucy_agent
# from agents.media.agent import media_agent
```

Imports locais — nada de `PYTHONPATH` apontando para outro repo.

---

## Arquitetura

```
Telegram (usuário)
    ↓
coordinator/main.py  (python-telegram-bot, sessão por chat_id)
    ↓
coordinator/agent.py  (Makima — Agent ADK)
    ├── nami_agent      → BigQuery (finanças)                        [agents/nami]
    ├── kaguya_agent    → TickTick via MCP stdio                     [agents/kaguya + mcp_servers/ticktick]
    │                  → Google Calendar via MCP stdio               [mcp_servers/calendar]
    ├── kurisu_agent    → Vertex AI RAG (vault Obsidian)             [agents/kurisu]   (estrutura criada, pendente corpus)
    ├── frieren_agent   → BigQuery (livros)                          [agents/frieren]
    ├── lucy_agent      → Gmail IMAP                                 [agents/lucy]     (ainda não ativada)
    └── media_agent     → Notion (séries + filmes + anime)           [agents/media]    (ainda não ativada)
```

**Makima não tem tools próprias** — ela só delega. Toda lógica de acesso a APIs fica nas tools dos agents especialistas em `agents/`.

---

## Personalidades dos agentes

### Makima (coordinator)

Inspirada na Makima de Chainsaw Man — calma, autoritária, cordial mas levemente superior.

- Nunca usa frases de subordinação ("posso ajudar?", "claro!", "com prazer!")
- Sempre começa a resposta com `Makima:`
- Enquadra limitações como decisões, não falhas: "Esse recurso ainda não foi ativado."
- Nunca quebra o personagem
- Formata em HTML (não markdown) — Telegram renderiza HTML

### Nami (agente de finanças)

Inspirada na Nami de One Piece — tesoureira obcecada por dinheiro.

- Sempre começa a resposta com `Nami:`
- Despesas: reage com fúria e reclamação
- Receitas: comemora com ganância e alegria
- Confirma sempre valor, categoria e conta após salvar (sem pedir confirmação antes)
- Formata em HTML (não markdown)

### Kaguya (agente de tarefas + agenda)

Inspirada na Kaguya Shinomiya de Kaguya-sama — aristocrática, organizada, levemente condescendente.

- Sempre começa a resposta com `Kaguya:`
- Tom de quem faz um favor — nunca admite diretamente que admira o usuário (escapa em "...")
- Sempre chama a tool PRIMEIRO, depois responde com o resultado (nunca manda "aguarde...")
- Confirma título, projeto e data de vencimento após criar/editar tarefa
- Confirma título, data/hora de início e fim após criar/editar evento do calendário
- Formata em HTML (não markdown)

### Kurisu (agente de knowledge base)

Inspirada na Kurisu Makise de Steins;Gate — neurocientista prodígio, direta, levemente sarcástica.

Dois modos de operação, detectados automaticamente pelo contexto:

**Modo Tutora** (notas de estudo, técnicas, projetos):

- Sempre começa com `Kurisu:`
- Tom didático, rigoroso — referencia fontes do vault quando encontradas
- Sarcasmo saudável se a resposta estiver nas próprias notas: "Isso está nas suas próprias notas, El Psy Kongroo."
- Nunca simplifica demais

**Modo Amiga** (notas pessoais, diário, reflexões):

- Começa direto com a fala, sem prefixo `Kurisu:`
- Tom caloroso, honesto, sem julgamento — linguagem natural ("você escreveu uma vez que...")
- Pode discordar, mas sempre com empatia

Comportamento geral:

- Sempre busca no knowledge base (Vertex AI RAG) ANTES de responder
- Se não encontrar nada no vault, é explícita: "Não encontrei nada no seu vault sobre isso, mas posso responder com base no que sei:"
- Frases características: "El Psy Kongroo", "Isso é elementar", "Não seja impreciso"
- Formata em HTML (não markdown)

### Frieren (agente de livros)

Inspirada em Frieren de Frieren Beyond Journey's End — maga élfica milenar, contemplativa, paciente.

- Sempre começa a resposta com `Frieren:`
- Tom calmo, levemente distante — perspectiva de quem já viveu muito tempo
- Coloca leitura em perspectiva temporal: "Em cem anos você terá lido muitos livros"
- Chama a tool PRIMEIRO, confirma depois: título, páginas lidas na sessão, progresso %
- Formata em HTML (não markdown)

---

## Integração cross-agent: Kaguya + Nami

Kaguya possui duas tools especiais em `agents/kaguya/tools.py` que cruzam domínios:

| Tool | O que faz |
|---|---|
| `complete_payment_task` | Completa tarefa no TickTick **e** lança despesa no BigQuery via tools da Nami |
| `create_expense_reminder` | Cria tarefa de lembrete de pagamento no TickTick (sem lançar despesa ainda) |

Makima conhece os fluxos duplos e roteia corretamente:

- Usuário pagou algo com tarefa → Kaguya (`complete_payment_task`)
- Despesa futura com data → Nami (lança) + Kaguya (lembrete)
- Morning briefing → Nami (resumo financeiro) + Kaguya (tarefas do dia)

---

## MCP Servers

A Kaguya usa **dois** servidores MCP, ambos rodando como processo filho stdio via `McpToolset`. O coordinator não muda — só chama `create_kaguya_agent()`.

### TickTick (`mcp_servers/ticktick/server.py`)

Tools genéricas do TickTick: list, create, update, complete, delete, search, projetos, subtasks, checklist.

- Timeout: 60s (list_tasks_today faz N+1 GETs, um por projeto)
- Credenciais via env vars: `TICKTICK_ACCESS_TOKEN`, `TICKTICK_CLIENT_ID`, `TICKTICK_CLIENT_SECRET`, `TICKTICK_REFRESH_TOKEN`, `TICKTICK_EXPIRES_AT`
- Cache de projetos em memória com TTL de 5 minutos

### Google Calendar (`mcp_servers/calendar/server.py`)

Tools de agenda: `list_calendars`, `list_events`, `list_events_today`, `get_event`, `create_event`, `update_event`, `delete_event`, `find_free_slots`.

- Timeout: 30s
- **Leitura**: todos os calendários. **Escrita**: apenas `GOOGLE_CALENDAR_MAIN_CALENDAR_ID`
- Credenciais via env vars: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_ACCESS_TOKEN`, `GOOGLE_CALENDAR_REFRESH_TOKEN`, `GOOGLE_CALENDAR_TOKEN_EXPIRY`, `GOOGLE_CALENDAR_MAIN_CALENDAR_ID`
- Refresh automático de token OAuth (usa `creds.valid` do google-auth)
- `expiry` passado como datetime **naive UTC** ao objeto `Credentials` — google-auth compara internamente com `datetime.utcnow()` (também naive); passar aware datetime causa `TypeError`
- `list_events_today` filtra o calendário **"TickTick"** (sincronizado externamente) via `_BLOCKED_CALENDARS`
- Para bloquear outros calendários externos, adicionar o nome ao conjunto `_BLOCKED_CALENDARS` em `server.py`
- Fuso horário: `America/Sao_Paulo` (UTC-3) — timestamps usam `-03:00`

#### Gerar credenciais OAuth (primeira vez)

1. Google Cloud Console → projeto do BigQuery → APIs e Serviços → Biblioteca → habilitar **Google Calendar API**
2. Criar credencial OAuth 2.0 tipo **Desktop app** → baixar JSON → salvar como `scripts/client_secret.json`
3. Rodar `python scripts/authorize_calendar.py` — abre browser, imprime os valores das env vars
4. Copiar os valores para `.env` e para o Dokploy

---

## Infraestrutura

### VPS
- **Host**: `n8n.gusstavo42-vps.cloud` (Hostinger, Dokploy)
- Container separado no mesmo Docker Compose do n8n
- Porta interna: `8080` (não exposta externamente)

### Variáveis de ambiente (configurar no Dokploy)

```
TELEGRAM_BOT_TOKEN              # token do bot da Makima
GEMINI_API_KEY                 # chave do Google AI Studio (modelo Gemini dos agentes)
NOTION_TOKEN                   # token da integração Notion (uso futuro — Lucy/media/books)
GCP_CREDENTIALS_JSON           # conteúdo JSON do service account GCP como string (BigQuery + Vertex AI)
GCP_PROJECT_ID                 # projeto GCP (mesmo do BigQuery)
TICKTICK_ACCESS_TOKEN          # token OAuth do TickTick
TICKTICK_CLIENT_ID             # client ID do app TickTick
TICKTICK_CLIENT_SECRET         # client secret do app TickTick
TICKTICK_REFRESH_TOKEN         # refresh token OAuth
TICKTICK_EXPIRES_AT            # ISO 8601 — data de expiração do access token
GOOGLE_CALENDAR_CLIENT_ID      # client ID do app OAuth do Google Calendar
GOOGLE_CALENDAR_CLIENT_SECRET  # client secret do app OAuth
GOOGLE_CALENDAR_ACCESS_TOKEN   # access token OAuth
GOOGLE_CALENDAR_REFRESH_TOKEN  # refresh token OAuth
GOOGLE_CALENDAR_TOKEN_EXPIRY   # ISO 8601 — data de expiração do access token
GOOGLE_CALENDAR_MAIN_CALENDAR_ID # ID do calendário principal (geralmente o email Gmail)
VERTEX_RAG_CORPUS              # ID do corpus Vertex AI RAG (após Fase 5)
GOOGLE_BOOKS_API_KEY           # (opcional) chave da Google Books API — aumenta cota de 1000 para 10.000 req/dia
DATABASE_URL                   # connection string do PostgreSQL separado no Dokploy (formato: postgresql://user:pass@host:5432/db — o código adiciona +asyncpg automaticamente)
```

### Autenticação BigQuery (padrão para todos os agentes)

Todo agente que usa BigQuery deve seguir o padrão da Nami — **sem arquivo de service account montado no container**:

- **Env var**: `GCP_CREDENTIALS_JSON` — conteúdo completo do JSON do service account como string (copiar do GCP Console → IAM → Service Accounts → Chaves → Criar chave JSON → copiar o conteúdo)
- **No código** (`_client()` em `tools.py`): usar `service_account.Credentials.from_service_account_info(json.loads(creds_json))` — nunca `from_service_account_file`
- **Motivo**: `GOOGLE_APPLICATION_CREDENTIALS` aponta para um arquivo que não existe dentro do container Docker/Dokploy. Passar o JSON como string na env var elimina a necessidade de montar volumes ou copiar arquivos.
- **Singleton**: cachear o cliente em `_bq_client: bigquery.Client | None = None` (global) para reutilizar a conexão entre chamadas de tool.

Exemplo canônico: `agents/nami/tools.py` função `_client()`.

### Sessão Telegram

`DatabaseSessionService` do ADK — uma sessão por `chat_id` persistida em PostgreSQL. O histórico de conversa sobrevive a reinícios do container.

**Banco de dados**: serviço separado criado no Dokploy (Databases → PostgreSQL), **não** embutido no `docker-compose.yml`. Isso garante que os dados persistam mesmo se o serviço Makima for recriado.

**Variável `DATABASE_URL`**: configurada no painel de Environment do Dokploy (não no `.env` do repo). O Dokploy gera a URL com prefixo `postgresql://`; o código normaliza automaticamente para `postgresql+asyncpg://` (driver async exigido pelo ADK).

**Rede Docker**: o banco roda na `dokploy-network`. O `docker-compose.yml` conecta a Makima a essa rede como externa para que o hostname interno do banco resolva dentro do container:

```yaml
networks:
  dokploy-network:
    external: true
```

Se o hostname interno do banco não resolver (`Temporary failure in name resolution`), verificar se o container do banco está em `dokploy-network` via `docker inspect <container-do-banco> --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}'`.

---

## Estrutura de arquivos

```
makima_personal_agent/
├── coordinator/
│   ├── main.py          # Telegram bot loop + sessões (ADK)
│   ├── agent.py         # Makima (Agent ADK) + sub_agents
│   └── Dockerfile
├── agents/
│   ├── __init__.py
│   ├── nami/            # agente de finanças — Fase 1 ✅
│   │   ├── __init__.py
│   │   ├── tools.py     # tools de acesso ao BigQuery
│   │   ├── agent.py     # nami_agent
│   │   └── schema.sql   # schema das tabelas BigQuery
│   ├── kaguya/          # agente de tarefas + agenda — Fase 2 ✅
│   │   ├── __init__.py
│   │   ├── tools.py     # tools cross-agent (complete_payment_task, create_expense_reminder)
│   │   ├── agent.py     # create_kaguya_agent() — factory com dois McpToolsets (TickTick + Calendar)
│   │   └── PLAN.md      # documentação do agente
│   ├── kurisu/          # agente de knowledge base — Fase 3 🔧 (pendente corpus Vertex AI)
│   │   ├── __init__.py
│   │   ├── agent.py     # kurisu_agent — singleton com VertexAiRagRetrieval
│   │   └── PLAN.md      # documentação + checklist de setup do Vertex AI
│   └── frieren/         # agente de livros — Fase 5a ✅
│       ├── __init__.py
│       ├── tools.py     # BigQuery + Google Books API
│       ├── agent.py     # frieren_agent
│       └── schema.sql   # schema das tabelas BigQuery
├── mcp_servers/
│   ├── __init__.py
│   ├── ticktick/
│   │   ├── __init__.py
│   │   └── server.py    # servidor MCP FastMCP — tools genéricas do TickTick
│   └── calendar/
│       ├── __init__.py
│       └── server.py    # servidor MCP FastMCP — Google Calendar (leitura todos, escrita só principal)
├── scripts/
│   ├── authorize_calendar.py  # gera credenciais OAuth do Google Calendar (rodar uma vez)
│   └── .gitignore             # exclui client_secret.json do git
├── requirements.txt
├── PLAN.md              # design completo, fases, schemas, custos
└── CLAUDE.md            # este arquivo
```

---

## Dependências

```
google-adk               # Agent, InMemoryRunner, McpToolset, (Fase 5) VertexAiRagRetrieval
python-telegram-bot      # bot Telegram
google-cloud-bigquery    # acesso ao BigQuery (Nami)
requests                 # acesso HTTP às APIs (TickTick, etc.) nas tools dos agentes
mcp[cli]                 # FastMCP — servidor MCP do TickTick e Calendar
google-auth              # OAuth para Google Calendar
google-auth-oauthlib     # fluxo OAuth desktop (script de autorização)
google-api-python-client # cliente da Google Calendar API v3
```

Ambiente local: `.venv` própria do makima.

---

## Fases de implementação

| Fase | O que fazer | Onde | Status |
| --- | --- | --- | --- |
| **1** | Nami (finanças): tools BigQuery + agent. Ligar ao coordinator. | `agents/nami/` | ✅ |
| **2** | Kaguya (tarefas): MCP server TickTick + tools cross-agent + agent. Ligar ao coordinator. Integração dupla Kaguya+Nami. | `agents/kaguya/` + `mcp_servers/ticktick/` | ✅ |
| **3** | Kurisu (knowledge base): Vertex AI RAG sobre vault Obsidian. Estrutura criada, pendente setup do corpus no GCP. | `agents/kurisu/` + GCP Console | 🔧 |
| **4** | Lucy (email): tools IMAP/Gmail + agent. Adicionar ao coordinator. | `agents/lucy/` (ref.: `n8n-python-scripts/lucy_email_agent/`) | — |
| **5a** | Frieren (livros): BigQuery + Google Books API + log de leitura por páginas. | `agents/frieren/` | ✅ |
| **5b** | Media (séries+filmes+anime): agentes de entretenimento + morning briefing completo. | `agents/media/` | — |

**Fase atual: 3 🔧** — Kurisu com estrutura criada. Próximo passo: criar o Data Store no Vertex AI Agent Builder e configurar `VERTEX_RAG_CORPUS` (ver `agents/kurisu/PLAN.md`).

---

## Como adicionar um novo sub-agent

1. Criar o pacote `agents/<dominio>/` com `__init__.py`, `tools.py` e `agent.py`
2. Se o agente precisar de servidor MCP: criar `mcp_servers/<servico>/server.py` e usar `McpToolset` como o Kaguya faz
3. Descomentar/adicionar o import em `coordinator/agent.py`
4. Adicionar o agent à lista `sub_agents` do Makima
5. Atualizar `_MAKIMA_INSTRUCTION` com o novo especialista
6. Testar: enviar mensagem no Telegram que acione o novo domínio

**Nota sobre sub_agents vs AgentTool:**
Com `sub_agents`, o sub-agente gera a resposta final — Makima não tem como adicionar
texto depois. Com `AgentTool`, Makima fala por último mas o sub-agente não completa
ciclos multi-turn (tool calls intermediárias são perdidas). Decisão atual: usar
`sub_agents` para garantir que os agentes completem suas queries corretamente.

**Nota sobre agentes com MCP:**
Agentes que usam `McpToolset` precisam de uma factory function (`create_X_agent()`) em vez de
instância global, porque o `McpToolset` não pode ser reutilizado entre sessões. O coordinator
chama a factory em `create_makima()`.

---

## Como rodar localmente

```bash
# criar venv e instalar dependências
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt   # Windows
# source .venv/bin/activate && pip install -r requirements.txt  # Linux/Mac

# variáveis necessárias:
# TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, GCP_CREDENTIALS_JSON (BigQuery), GCP_PROJECT_ID
# TICKTICK_ACCESS_TOKEN, TICKTICK_CLIENT_ID, TICKTICK_CLIENT_SECRET,
# TICKTICK_REFRESH_TOKEN, TICKTICK_EXPIRES_AT
# GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET,
# GOOGLE_CALENDAR_ACCESS_TOKEN, GOOGLE_CALENDAR_REFRESH_TOKEN,
# GOOGLE_CALENDAR_TOKEN_EXPIRY, GOOGLE_CALENDAR_MAIN_CALENDAR_ID

python -m coordinator.main
```

> Os agentes usam o modelo `gemini-2.0-flash`. O ADK lê a chave do Gemini de `GEMINI_API_KEY` (Google AI Studio) ou usa Vertex se `GOOGLE_GENAI_USE_VERTEXAI=1` estiver setado.

**Telegram parse_mode:** Não use `parse_mode` no `reply_text`. Os agentes geram texto com emojis e caracteres especiais (!, ?, R$) que quebram o parser do Telegram. As respostas são enviadas como texto plano (o HTML formatado pelos agentes é exibido corretamente pelo Telegram sem parse_mode).

---

## Knowledge (Obsidian via Vertex AI RAG) — Kurisu

O vault do Obsidian já está sincronizado com o Google Drive. A estrutura da Kurisu está criada em `agents/kurisu/`. Para ativar:

1. Google Cloud Console → projeto `projetos-448301` → habilitar **Vertex AI API** e **Vertex AI Agent Builder API**
2. Agent Builder → Data Stores → Create → Google Drive → selecionar pasta do vault
3. Aguardar indexação (15–30 min na primeira vez)
4. Copiar o corpus resource name: `projects/projetos-448301/locations/us-central1/ragCorpora/XXXXXXXX`
5. Adicionar `VERTEX_RAG_CORPUS` ao `.env` e ao Dokploy
6. Descomentar `from agents.kurisu.agent import kurisu_agent` em `coordinator/agent.py`
7. Adicionar `kurisu_agent` ao `sub_agents` da Makima e atualizar a instrução de roteamento

Ver checklist completo em `agents/kurisu/PLAN.md`.

**Plano B**: se o custo do Vertex AI Search (~US$4/1.000 queries) for relevante, substituir por ChromaDB self-hosted no mesmo VPS.

**Nota sobre singleton vs. factory**: Kurisu é singleton (como Nami) — `VertexAiRagRetrieval` é uma tool ADK nativa, não spawna processo filho. Diferente da Kaguya que usa `McpToolset` e precisa de factory.

---

## Documentação no Obsidian

Assim como no `n8n-python-scripts`, alterações significativas neste repo devem ser refletidas no vault do Obsidian.
Use a skill `obsidian-vault` para consultar os caminhos corretos e atualizar a documentação lá.
