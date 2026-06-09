# CLAUDE.md — makima_personal_agent

## O que é este repo

**Makima** é um coordinator multi-agente construído com Google ADK. Roda como bot Telegram autônomo no VPS, recebendo mensagens e delegando para agentes especialistas conforme o domínio do pedido.

O design completo — arquitetura, fases, schemas PostgreSQL, custos — está em `PLAN.md`.

---

## Relação com n8n-python-scripts

Os dois repositórios são **independentes**. O `makima_personal_agent` é self-contained: não importa nada do [`n8n-python-scripts`](https://github.com/Gusstavo42/n8n-python-scripts) (local: `C:\Users\gusta\Documents\GitHub\n8n-python-scripts`) em runtime.

O `n8n-python-scripts` serve apenas como **referência**: lá ficam os scripts batch (chamados pelo n8n) cuja lógica de acesso às APIs (Notion, Gmail, etc.) usamos como modelo ao escrever as tools dos agentes aqui. Os IDs e schemas são **copiados, não importados** — o custo dessa independência é manter essas constantes em sincronia manualmente se a fonte mudar.

### Onde vivem os agentes (neste repo)

Cada agente especialista é um pacote local em `agents/`. Cada um tem seu próprio `CLAUDE.md`:

| Agente | Domínio | Status | Documentação |
|---|---|---|---|
| `agents/nami/` | Finanças (PostgreSQL) | ✅ Fase 1 | `agents/nami/CLAUDE.md` |
| `agents/kaguya/` | Tarefas + Agenda (TickTick + Calendar via MCP) | ✅ Fase 2 | `agents/kaguya/CLAUDE.md` |
| `agents/kurisu/` | Knowledge base (Vertex AI RAG) | 🔧 Fase 3 | `agents/kurisu/CLAUDE.md` |
| `agents/frieren/` | Livros (PostgreSQL + Google Books) | ✅ Fase 5a | `agents/frieren/CLAUDE.md` |
| `agents/lucy/` | Email (Gmail IMAP) | — Fase 4 | — |
| `agents/media/` | Séries + filmes + anime (Notion) | — Fase 5b | — |

### Como o coordinator importa

```python
# coordinator/agent.py
from agents.nami.agent import nami_agent
from agents.kaguya.agent import create_kaguya_agent   # factory (instancia McpToolset)
from agents.frieren.agent import frieren_agent
from agents.kurisu.agent import kurisu_agent
# from agents.lucy.agent import lucy_agent
# from agents.media.agent import media_agent
```

Imports locais — nada de `PYTHONPATH` apontando para outro repo.

---

## Arquitetura

```
Telegram (usuário)
    ↓
coordinator/main.py  (python-telegram-bot, sessões por domínio)
    ↓
coordinator/agent.py  (Makima — Agent ADK)
    ├── nami_agent      → PostgreSQL (finanças)                      [agents/nami]
    ├── kaguya_agent    → TickTick via MCP stdio                     [agents/kaguya + mcp_servers/ticktick]
    │                  → Google Calendar via MCP stdio               [mcp_servers/calendar]
    ├── kurisu_agent    → Vertex AI RAG (vault Obsidian)             [agents/kurisu]   (estrutura criada, pendente corpus)
    ├── frieren_agent   → PostgreSQL (livros)                        [agents/frieren]
    ├── lucy_agent      → Gmail IMAP                                 [agents/lucy]     (ainda não ativada)
    └── media_agent     → Notion (séries + filmes + anime)           [agents/media]    (ainda não ativada)
```

**Makima não tem tools próprias** — ela só delega. Toda lógica de acesso a APIs fica nas tools dos agents especialistas em `agents/`.

Para detalhes do coordinator (infraestrutura, sessões, env vars, parse_mode), ver `coordinator/CLAUDE.md`.

---

## Integração cross-agent: Kaguya + Nami

Kaguya possui duas tools especiais em `agents/kaguya/tools.py` que cruzam domínios:

| Tool | O que faz |
|---|---|
| `complete_payment_task` | Completa tarefa no TickTick **e** lança despesa no PostgreSQL via tools da Nami |
| `create_expense_reminder` | Cria tarefa de lembrete de pagamento no TickTick (sem lançar despesa ainda) |

Makima conhece os fluxos duplos e roteia corretamente:

- Usuário pagou algo com tarefa → Kaguya (`complete_payment_task`)
- Despesa futura com data → Nami (lança) + Kaguya (lembrete)
- Morning briefing → Nami (resumo financeiro) + Kaguya (tarefas do dia)

---

## Estrutura de arquivos

```
makima_personal_agent/
├── coordinator/
│   ├── main.py          # Telegram bot loop + sessões (ADK)
│   ├── agent.py         # Makima (Agent ADK) + sub_agents
│   ├── Dockerfile
│   └── CLAUDE.md        # infraestrutura, env vars, sessões, MCP Calendar, notas técnicas
├── agents/
│   ├── __init__.py
│   ├── nami/            # agente de finanças — Fase 1 ✅
│   │   ├── __init__.py
│   │   ├── tools.py     # tools de acesso ao PostgreSQL
│   │   ├── agent.py     # nami_agent
│   │   ├── schema_pg.sql # schema das tabelas PostgreSQL
│   │   └── CLAUDE.md    # tools, categorias, formatação, personalidade
│   ├── kaguya/          # agente de tarefas + agenda — Fase 2 ✅
│   │   ├── __init__.py
│   │   ├── tools.py     # tools cross-agent (complete_payment_task, create_expense_reminder)
│   │   ├── agent.py     # create_kaguya_agent() — factory com dois McpToolsets
│   │   └── CLAUDE.md    # MCP TickTick + Calendar, tools cross-agent, OAuth, personalidade
│   ├── kurisu/          # agente de knowledge base — Fase 3 🔧 (pendente corpus Vertex AI)
│   │   ├── __init__.py
│   │   ├── agent.py     # kurisu_agent — singleton com VertexAiRagRetrieval
│   │   └── CLAUDE.md    # arquitetura RAG, setup Vertex AI, checklist de ativação
│   └── frieren/         # agente de livros — Fase 5a ✅
│       ├── __init__.py
│       ├── tools.py     # PostgreSQL + Google Books API
│       ├── agent.py     # frieren_agent
│       ├── schema_pg.sql # schema das tabelas PostgreSQL
│       └── CLAUDE.md    # tools, schema PostgreSQL, menu interativo, personalidade
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
│   ├── setup_schemas.py       # cria tabelas PostgreSQL de Nami e Frieren (rodar uma vez no VPS)
│   ├── migrate_bq_to_pg.py    # migração one-time: BigQuery → PostgreSQL
│   ├── backup_postgres.py     # pg_dump → Google Cloud Storage (roda diariamente via Docker)
│   └── .gitignore             # exclui client_secret.json do git
├── docs/
│   └── MIGRACAO_POSTGRES.md  # checklist de deploy da migração BigQuery → PostgreSQL
├── requirements.txt
├── PLAN.md              # design completo, fases, schemas, custos
└── CLAUDE.md            # este arquivo — visão geral e guia de navegação
```

---

## Dependências

```
google-adk               # Agent, InMemoryRunner, McpToolset, VertexAiRagRetrieval
python-telegram-bot      # bot Telegram
psycopg2-binary          # driver PostgreSQL síncrono (Nami, Frieren, Journal)
google-cloud-storage     # backup automático do PostgreSQL para GCS
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
|---|---|---|---|
| **1** | Nami (finanças): tools PostgreSQL + agent. | `agents/nami/` | ✅ |
| **2** | Kaguya (tarefas): MCP server TickTick + tools cross-agent + agent. Integração dupla Kaguya+Nami. | `agents/kaguya/` + `mcp_servers/ticktick/` | ✅ |
| **3** | Kurisu (knowledge base): Vertex AI RAG sobre vault Obsidian. Estrutura criada, pendente setup do corpus no GCP. | `agents/kurisu/` + GCP Console | 🔧 |
| **4** | Lucy (email): tools IMAP/Gmail + agent. | `agents/lucy/` (ref.: `n8n-python-scripts/lucy_email_agent/`) | — |
| **5a** | Frieren (livros): PostgreSQL + Google Books API + log de leitura por páginas. | `agents/frieren/` | ✅ |
| **5b** | Media (séries+filmes+anime). | `agents/media/` | — |

**Fase atual: 3 🔧** — Kurisu com estrutura criada. Próximo passo: criar o Data Store no Vertex AI Agent Builder e configurar `VERTEX_RAG_CORPUS` (ver `agents/kurisu/CLAUDE.md`).

---

## Como adicionar um novo sub-agent

1. Criar o pacote `agents/<dominio>/` com `__init__.py`, `tools.py` e `agent.py`
2. Se o agente precisar de servidor MCP: criar `mcp_servers/<servico>/server.py` e usar `McpToolset` como o Kaguya faz
3. Descomentar/adicionar o import em `coordinator/agent.py`
4. Adicionar o agent à lista `sub_agents` do Makima
5. Atualizar `_MAKIMA_INSTRUCTION` com o novo especialista
6. Criar `agents/<dominio>/CLAUDE.md` seguindo o padrão dos outros agentes
7. Testar: enviar mensagem no Telegram que acione o novo domínio

---

## Como rodar localmente

```bash
# criar venv e instalar dependências
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt   # Windows
# source .venv/bin/activate && pip install -r requirements.txt  # Linux/Mac

# variáveis mínimas necessárias (ver coordinator/CLAUDE.md para lista completa):
# TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, GCP_CREDENTIALS_JSON, GCP_PROJECT_ID
# DATABASE_URL (PostgreSQL)

python -m coordinator.main
```

> Os agentes usam o modelo `gemini-2.5-flash`. O ADK lê a chave do Gemini de `GEMINI_API_KEY` (Google AI Studio) ou usa Vertex se `GOOGLE_GENAI_USE_VERTEXAI=1` estiver setado.

---

## Executar scripts no VPS

O hostname do PostgreSQL (`personal-agent-makimadb-k3bxg9`) é um nome de serviço Docker Swarm — **não é resolvível na shell do host**. Rodar `python -m scripts.algo` diretamente no VPS falha com `Temporary failure in name resolution`.

**Sempre executar scripts de migração / manutenção de dentro do container `makima-web`:**

```bash
# Copiar o script para dentro do container (se ainda não estiver lá)
docker cp scripts/meu_script.py makima-web:/app/scripts/meu_script.py

# Executar
docker exec makima-web sh -c "cd /app && python -m scripts.meu_script"
```

Scripts que já estão no container (imagem inclui `scripts/`) não precisam do `docker cp`.

---

## Documentação no Obsidian

Assim como no `n8n-python-scripts`, alterações significativas neste repo devem ser refletidas no vault do Obsidian.
Use a skill `obsidian-vault` para consultar os caminhos corretos e atualizar a documentação lá.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at `specs/003-violet-diario/plan.md`.
<!-- SPECKIT END -->
