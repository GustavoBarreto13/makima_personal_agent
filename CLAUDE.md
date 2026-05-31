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
│   ├── nami/        # finanças (BigQuery)           ← Fase 1 ✅
│   │   ├── tools.py     # acesso ao BigQuery (ref.: n8n nami_finance_agent/main.py)
│   │   └── agent.py     # nami_agent (Agent ADK)
│   ├── kaguya/      # tarefas (TickTick via MCP)    ← Fase 2 ✅
│   │   ├── tools.py     # tools cross-agent (complete_payment_task, create_expense_reminder)
│   │   └── agent.py     # create_kaguya_agent() — factory que instancia o McpToolset
│   ├── lucy/        # email (Gmail IMAP)             — Fase 3
│   ├── media/       # séries+filmes+anime            — Fase 4
│   └── books/       # livros                         — Fase 4
├── mcp_servers/
│   └── ticktick/
│       └── server.py    # servidor MCP stdio — tools genéricas do TickTick (list, create, update, complete, delete...)
```

### Como o coordinator importa

```python
# coordinator/agent.py
from agents.nami.agent import nami_agent
from agents.kaguya.agent import create_kaguya_agent   # factory (instancia McpToolset)
# from agents.lucy.agent import lucy_agent
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
    ├── nami_agent      → BigQuery (finanças)             [agents/nami]
    ├── kaguya_agent    → TickTick via MCP stdio          [agents/kaguya + mcp_servers/ticktick]
    ├── lucy_agent      → Gmail IMAP                      [agents/lucy]     (ainda não ativada)
    ├── media_agent     → Notion (séries + filmes + anime)[agents/media]    (ainda não ativada)
    ├── books_agent     → Notion (livros)                 [agents/books]    (ainda não ativada)
    └── knowledge_tool  → Vertex AI RAG (Obsidian vault via Google Drive)   (ainda não ativada)
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

### Kaguya (agente de tarefas)

Inspirada na Kaguya Shinomiya de Kaguya-sama — aristocrática, organizada, levemente condescendente.

- Sempre começa a resposta com `Kaguya:`
- Tom de quem faz um favor — nunca admite diretamente que admira o usuário (escapa em "...")
- Sempre chama a tool PRIMEIRO, depois responde com o resultado (nunca manda "aguarde...")
- Confirma título, projeto e data de vencimento após criar/editar
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

## MCP Server — TickTick

As tools genéricas do TickTick (list, create, update, complete, delete, search, projetos, subtasks, checklist...) vivem em `mcp_servers/ticktick/server.py` como um servidor MCP FastMCP.

- Roda como **processo filho** (stdio) iniciado pelo ADK via `McpToolset`
- O ADK gerencia o ciclo de vida — não precisa de `exit_stack` manual
- Timeout configurado para 60s (list_tasks_today faz N+1 GETs, um por projeto)
- Credenciais OAuth do TickTick passadas via `env` no `StdioConnectionParams`
- Cache de projetos em memória com TTL de 5 minutos (dentro do processo servidor)

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
GOOGLE_APPLICATION_CREDENTIALS # path do service account GCP (BigQuery + Fase 5 Vertex)
GCP_PROJECT_ID                 # projeto GCP (mesmo do BigQuery)
TICKTICK_ACCESS_TOKEN          # token OAuth do TickTick
TICKTICK_CLIENT_ID             # client ID do app TickTick
TICKTICK_CLIENT_SECRET         # client secret do app TickTick
TICKTICK_REFRESH_TOKEN         # refresh token OAuth
TICKTICK_EXPIRES_AT            # ISO 8601 — data de expiração do access token
VERTEX_RAG_CORPUS              # ID do corpus Vertex AI RAG (após Fase 5)
```

### Sessão Telegram

`InMemoryRunner` — uma sessão por `chat_id`. Memória persiste entre mensagens mas reinicia com o container. Aceitável para começar; evoluir para SQLite ou Firestore se reinicializações frequentes forem problema.

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
│   ├── nami/            # agente de finanças — Fase 1 ✅
│   │   ├── __init__.py
│   │   ├── tools.py     # tools de acesso ao BigQuery
│   │   ├── agent.py     # nami_agent
│   │   └── schema.sql   # schema das tabelas BigQuery
│   └── kaguya/          # agente de tarefas — Fase 2 ✅
│       ├── __init__.py
│       ├── tools.py     # tools cross-agent (complete_payment_task, create_expense_reminder)
│       └── agent.py     # create_kaguya_agent() — factory com McpToolset
├── mcp_servers/
│   ├── __init__.py
│   └── ticktick/
│       ├── __init__.py
│       └── server.py    # servidor MCP FastMCP — tools genéricas do TickTick
├── requirements.txt
├── PLAN.md              # design completo, fases, schemas, custos
└── CLAUDE.md            # este arquivo
```

---

## Dependências

```
google-adk          # Agent, InMemoryRunner, McpToolset, (Fase 5) VertexAiRagRetrieval
python-telegram-bot # bot Telegram
google-cloud-bigquery # acesso ao BigQuery (Nami)
requests            # acesso HTTP às APIs (TickTick, etc.) nas tools dos agentes
mcp[cli]            # FastMCP — servidor MCP do TickTick
```

Ambiente local: `.venv` própria do makima.

---

## Fases de implementação

| Fase | O que fazer | Onde | Status |
| --- | --- | --- | --- |
| **1** | Nami (finanças): tools BigQuery + agent. Ligar ao coordinator. | `agents/nami/` | ✅ |
| **2** | Kaguya (tarefas): MCP server TickTick + tools cross-agent + agent. Ligar ao coordinator. Integração dupla Kaguya+Nami. | `agents/kaguya/` + `mcp_servers/ticktick/` | ✅ |
| **3** | Lucy (email): tools IMAP/Gmail + agent. Adicionar ao coordinator. | `agents/lucy/` (ref.: `n8n-python-scripts/lucy_email_agent/`) | — |
| **4** | Media + Books: agentes de entretenimento + morning briefing completo. | `agents/media/`, `agents/books/` | — |
| **5** | Vertex AI RAG: Google Drive → Data Store. Adicionar `knowledge_tool`. | GCP Console + `coordinator/agent.py` | — |

**Fase atual: 2 ✅** — Nami e Kaguya ativas. Deploy pendente (substituir workflow Telegram do Nami no n8n pela Makima). Próximos passos: deploy + Fase 3 (Lucy).

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
# TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, GOOGLE_APPLICATION_CREDENTIALS (BigQuery)
# TICKTICK_ACCESS_TOKEN, TICKTICK_CLIENT_ID, TICKTICK_CLIENT_SECRET,
# TICKTICK_REFRESH_TOKEN, TICKTICK_EXPIRES_AT

python -m coordinator.main
```

> Os agentes usam o modelo `gemini-2.0-flash`. O ADK lê a chave do Gemini de `GEMINI_API_KEY` (Google AI Studio) ou usa Vertex se `GOOGLE_GENAI_USE_VERTEXAI=1` estiver setado.

**Telegram parse_mode:** Não use `parse_mode` no `reply_text`. Os agentes geram texto com emojis e caracteres especiais (!, ?, R$) que quebram o parser do Telegram. As respostas são enviadas como texto plano (o HTML formatado pelos agentes é exibido corretamente pelo Telegram sem parse_mode).

---

## Knowledge (Obsidian via Vertex AI RAG)

O vault do Obsidian já está sincronizado com o Google Drive. Na Fase 5:

1. Criar Data Store no Vertex AI Agent Builder apontando para a pasta do vault no Drive
2. Aguardar indexação inicial
3. Copiar o corpus ID e definir em `VERTEX_RAG_CORPUS`
4. Descomentar `knowledge_tool` em `coordinator/agent.py`

**Plano B**: se o custo do Vertex AI Search (~US$4/1.000 queries) for relevante, substituir por ChromaDB self-hosted no mesmo VPS.

Ver seção "Estrutura ideal das notas para RAG" no `PLAN.md` antes de indexar.

---

## Documentação no Obsidian

Assim como no `n8n-python-scripts`, alterações significativas neste repo devem ser refletidas no vault do Obsidian.
Use a skill `obsidian-vault` para consultar os caminhos corretos e atualizar a documentação lá.
