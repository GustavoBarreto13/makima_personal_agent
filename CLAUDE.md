# CLAUDE.md — makima_personal_agent

## O que é este repo

**Makima** é um coordinator multi-agente construído com Google ADK. Roda como bot Telegram autônomo no VPS, recebendo mensagens e delegando para agentes especialistas conforme o domínio do pedido.

O design completo — arquitetura, fases, schemas BigQuery, custos — está em `PLAN.md`.

---

## Relação com n8n-python-scripts

Este repo **depende** do [`n8n-python-scripts`](https://github.com/Gusstavo42/n8n-python-scripts) C:\Users\gusta\Documents\GitHub\n8n-python-scripts como base de implementação. Lá ficam os scripts batch (chamados pelo n8n) e os agentes ADK (importados aqui).

### O que vem de lá

Cada módulo do `n8n-python-scripts` expõe dois arquivos para este repo:

```
n8n-python-scripts/
├── nami_finance_agent/
│   ├── main.py      ← batch, usado pelo n8n (não importamos)
│   ├── tools.py     ← funções puras de acesso ao Notion
│   └── agent.py     ← nami_agent (Agent ADK) — importamos aqui
├── lucy_email_agent/
│   ├── tools.py     ← funções IMAP/Gmail
│   └── agent.py     ← lucy_agent
├── ticktick_notion_sync/
│   └── agent.py     ← tasks_agent
├── series_sync/ + gustavoboxd/ + anime_sync/
│   └── agent.py     ← media_agent (unifica os três)
└── books_sync/
    └── agent.py     ← books_agent
```

### Como o coordinator importa

```python
# coordinator/agent.py
from nami_finance_agent.agent import nami_agent
from lucy_email_agent.agent import lucy_agent
from tasks_agent.agent import tasks_agent
from media_agent.agent import media_agent
from books_agent.agent import books_agent
```

Isso funciona porque o `n8n-python-scripts` é montado no `PYTHONPATH` do container (ver Dockerfile e docker-compose).

---

## Arquitetura

```
Telegram (usuário)
    ↓
coordinator/main.py  (python-telegram-bot, sessão por chat_id)
    ↓
coordinator/agent.py  (Makima — Agent ADK)
    ├── nami_agent      → Notion (finanças)
    ├── lucy_agent      → Gmail IMAP
    ├── tasks_agent     → TickTick / Notion tasks
    ├── media_agent     → Notion (séries + filmes + anime)
    ├── books_agent     → Notion (livros)
    └── knowledge_tool  → Vertex AI RAG (Obsidian vault via Google Drive)
```

**Makima não tem tools próprias** — ela só delega. Toda lógica de acesso a APIs fica nos agents especialistas do `n8n-python-scripts`.

---

## Infraestrutura

### VPS
- **Host**: `n8n.gusstavo42-vps.cloud` (Hostinger, Dokploy)
- Container separado no mesmo Docker Compose do n8n
- Porta interna: `8080` (não exposta externamente)

### Variáveis de ambiente (configurar no Dokploy)

```
TELEGRAM_BOT_TOKEN              # token do bot da Makima (diferente do bot atual do Nami)
GOOGLE_APPLICATION_CREDENTIALS  # path do service account GCP (mesmo do n8n-python-scripts)
GCP_PROJECT_ID                  # projeto GCP (mesmo do BigQuery)
VERTEX_RAG_CORPUS               # ID do corpus Vertex AI RAG (após Fase 5)
```

As credenciais de domínio (Notion, Gmail, TickTick, TMDB, etc.) são as mesmas env vars já configuradas no Dokploy para o `n8n-python-scripts` — o docker-compose compartilha o mesmo `.env` ou as repassa para o container da Makima.

### Sessão Telegram

`InMemorySessionService` — uma sessão por `chat_id`. Memória persiste entre mensagens mas reinicia com o container. Aceitável para começar; evoluir para SQLite ou Firestore se reinicializações frequentes forem problema.

---

## Estrutura de arquivos

```
makima_personal_agent/
├── coordinator/
│   ├── main.py          # Telegram bot loop + sessões
│   ├── agent.py         # Makima (Agent ADK) + sub_agents + knowledge_tool
│   └── Dockerfile
├── requirements.txt
├── PLAN.md              # design completo, fases, schemas, custos
└── CLAUDE.md            # este arquivo
```

---

## Dependências

```
google-adk          # Agent, InMemoryRunner, InMemorySessionService, VertexAiRagRetrieval
python-telegram-bot # bot Telegram
```

O `n8n-python-scripts` também precisa estar instalável no ambiente — via bind mount no docker-compose ou `pip install -e /path/to/n8n-python-scripts`.

---

## Fases de implementação

| Fase | O que fazer | Onde |
|---|---|---|
| **1** | Extrair `tools.py` + `agent.py` do Nami. Ligar ao coordinator. Testar via Telegram. | `n8n-python-scripts/nami_finance_agent/` |
| **2** | Extrair `tools.py` + `agent.py` do Lucy. Adicionar ao coordinator. | `n8n-python-scripts/lucy_email_agent/` |
| **3** | Adicionar `upsert_bigquery()` nos scripts de sync de mídia/livros. | `n8n-python-scripts/series_sync/`, `gustavoboxd/`, etc. |
| **4** | Criar agents de tasks, media e books. Adicionar ao coordinator. Ativar morning briefing. | `n8n-python-scripts/` + `coordinator/agent.py` |
| **5** | Configurar Vertex AI RAG (Google Drive → Data Store). Adicionar `knowledge_tool`. | GCP Console + `coordinator/agent.py` |

**Fase atual: 1** — scaffold criado, sub-agents comentados aguardando `tools.py` no `n8n-python-scripts`.

---

## Como adicionar um novo sub-agent

1. No `n8n-python-scripts`, criar `modulo/tools.py` e `modulo/agent.py`
2. Neste repo, descomentar o import em `coordinator/agent.py`
3. Adicionar o agent à lista `sub_agents` do Makima
4. Testar: enviar mensagem no Telegram que acione o novo domínio

---

## Como rodar localmente

```bash
# instalar dependências
pip install -r requirements.txt
pip install -e /caminho/para/n8n-python-scripts  # para os imports funcionarem

# rodar
TELEGRAM_BOT_TOKEN=xxx python -m coordinator.main
```

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
