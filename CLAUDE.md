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
│   ├── nami/        # finanças (Notion)        ← Fase 1 ✅
│   │   ├── tools.py     # acesso ao Notion (ref.: n8n nami_finance_agent/main.py)
│   │   └── agent.py     # nami_agent (Agent ADK)
│   ├── lucy/        # email (Gmail IMAP)        — Fase 2
│   ├── tasks/       # TickTick/Notion           — Fase 4
│   ├── media/       # séries+filmes+anime       — Fase 4
│   └── books/       # livros                    — Fase 4
```

### Como o coordinator importa

```python
# coordinator/agent.py
from agents.nami.agent import nami_agent
# from agents.lucy.agent import lucy_agent
# from agents.tasks.agent import tasks_agent
# from agents.media.agent import media_agent
# from agents.books.agent import books_agent
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
    ├── nami_agent      → Notion (finanças)      [agents/nami]
    ├── lucy_agent      → Gmail IMAP             [agents/lucy]
    ├── tasks_agent     → TickTick / Notion tasks [agents/tasks]
    ├── media_agent     → Notion (séries + filmes + anime) [agents/media]
    ├── books_agent     → Notion (livros)        [agents/books]
    └── knowledge_tool  → Vertex AI RAG (Obsidian vault via Google Drive)
```

**Makima não tem tools próprias** — ela só delega. Toda lógica de acesso a APIs fica nas tools dos agents especialistas em `agents/`.

---

## Infraestrutura

### VPS
- **Host**: `n8n.gusstavo42-vps.cloud` (Hostinger, Dokploy)
- Container separado no mesmo Docker Compose do n8n
- Porta interna: `8080` (não exposta externamente)

### Variáveis de ambiente (configurar no Dokploy)

```
TELEGRAM_BOT_TOKEN              # token do bot da Makima (diferente do bot atual do Nami)
GEMINI_API_KEY                 # chave do Google AI Studio (modelo Gemini dos agentes)
NOTION_TOKEN                   # token da integração Notion (usado pelas tools do Nami)
NOTION_DB_TRANSACTIONS         # opcional: override do ID do database 💰 Transações
GOOGLE_APPLICATION_CREDENTIALS # path do service account GCP (Fase 5 / Vertex)
GCP_PROJECT_ID                 # projeto GCP (mesmo do BigQuery)
VERTEX_RAG_CORPUS              # ID do corpus Vertex AI RAG (após Fase 5)
```

As credenciais de domínio (Notion, Gmail, TickTick, TMDB, etc.) são as mesmas já configuradas no Dokploy para o `n8n-python-scripts`. Como os repos são independentes, o container da Makima precisa receber essas env vars explicitamente (mesmo `.env` compartilhado ou repassadas no docker-compose) — não há código compartilhado entre os dois.

### Sessão Telegram

`InMemoryRunner` (cria os serviços de sessão/memória em memória) — uma sessão por `chat_id`. Memória persiste entre mensagens mas reinicia com o container. Aceitável para começar; evoluir para SQLite ou Firestore se reinicializações frequentes forem problema.

---

## Estrutura de arquivos

```
makima_personal_agent/
├── coordinator/
│   ├── main.py          # Telegram bot loop + sessões (ADK)
│   ├── agent.py         # Makima (Agent ADK) + sub_agents + knowledge_tool
│   └── Dockerfile
├── agents/
│   ├── __init__.py
│   └── nami/            # agente de finanças (Fase 1)
│       ├── __init__.py
│       ├── tools.py     # tools de acesso ao Notion
│       └── agent.py     # nami_agent
├── requirements.txt
├── PLAN.md              # design completo, fases, schemas, custos
└── CLAUDE.md            # este arquivo
```

---

## Dependências

```
google-adk          # Agent, InMemoryRunner, sessões em memória, (Fase 5) VertexAiRagRetrieval
python-telegram-bot # bot Telegram
requests            # acesso HTTP às APIs (Notion etc.) nas tools dos agentes
```

Como o repo é self-contained, **não há dependência do `n8n-python-scripts`**. Ambiente local: `.venv` própria do makima.

---

## Fases de implementação

| Fase | O que fazer | Onde |
|---|---|---|
| **1** | Criar `agents/nami/` (tools + agent) com base no Nami. Ligar ao coordinator. Testar via Telegram. | `agents/nami/` (ref.: `n8n-python-scripts/nami_finance_agent/`) |
| **2** | Criar `agents/lucy/` (tools IMAP/Gmail + agent). Adicionar ao coordinator. | `agents/lucy/` (ref.: `n8n-python-scripts/lucy_email_agent/`) |
| **3** | Adicionar `upsert_bigquery()` nos scripts de sync de mídia/livros. | `n8n-python-scripts/series_sync/`, `gustavoboxd/`, etc. (batch — fica lá) |
| **4** | Criar `agents/tasks`, `agents/media`, `agents/books`. Adicionar ao coordinator. Ativar morning briefing. | `agents/` + `coordinator/agent.py` |
| **5** | Configurar Vertex AI RAG (Google Drive → Data Store). Adicionar `knowledge_tool`. | GCP Console + `coordinator/agent.py` |

**Fase atual: 1 ✅** — `agents/nami/` criado (tools + agent), Nami ligado ao coordinator e validado: imports OK contra `google-adk` e `query_expenses` testado read-only no Notion real. Próximos passos: deploy (substituir o workflow Telegram do Nami no n8n pela Makima) e Fase 2 (Lucy).

---

## Como adicionar um novo sub-agent

1. Criar o pacote `agents/<dominio>/` com `__init__.py`, `tools.py` e `agent.py` (use os scripts do `n8n-python-scripts` apenas como referência da lógica de API)
2. Descomentar/adicionar o import em `coordinator/agent.py`
3. Adicionar o agent à lista `sub_agents` do Makima
4. Testar: enviar mensagem no Telegram que acione o novo domínio

---

## Como rodar localmente

```bash
# criar venv e instalar dependências
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt   # Windows
# source .venv/bin/activate && pip install -r requirements.txt  # Linux/Mac

# variáveis necessárias: TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, NOTION_TOKEN
python -m coordinator.main
```

> Os agentes usam o modelo `gemini-2.0-flash`. O ADK lê a chave do Gemini de `GEMINI_API_KEY` (Google AI Studio) ou usa Vertex se `GOOGLE_GENAI_USE_VERTEXAI=1` estiver setado.

---

## Knowledge (Obsidian via Vertex AI RAG)

O vault do Obsidian já está sincronizado com o Google Drive. Na Fase 5:

1. Criar Data Store no Vertex AI Agent Builder apontando para a pasta do vault no Drive
2. Aguardar indexação inicial
3. Copiar o corpus ID e definir em `VERTEX_RAG_CORPUS`
4. Descomentar `knowledge_tool` em `coordinator/agent.py`

**Plano B**: se o custo do Vertex AI Search (~US$4/1.000 queries) for relevante, substituir por ChromaDB self-hosted no mesmo VPS. A interface de `search_knowledge` é idêntica — só troca a implementação sem mudar o coordinator.

Ver seção "Estrutura ideal das notas para RAG" no `PLAN.md` antes de indexar — frontmatter, headings e títulos de arquivo afetam diretamente a qualidade das respostas.

---

## Documentação no Obsidian

Assim como no `n8n-python-scripts`, alterações significativas neste repo devem ser refletidas no vault do Obsidian.
Use a skill `obsidian-vault` para consultar os caminhos corretos e atualizar a documentação lá.
