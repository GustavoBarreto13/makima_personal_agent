# Kaguya — Integração MCP do TickTick

**Data:** 2026-05-31
**Status:** Aprovado

---

## Contexto

A Kaguya é o agente de tarefas da Makima, responsável por interagir com o TickTick via API REST OAuth 2.0. Atualmente, todas as 16 tools estão implementadas manualmente em `agents/kaguya/tools.py`, incluindo lógica de autenticação, cache de projetos e chamadas HTTP.

O objetivo é migrar as 14 tools genéricas do TickTick para um servidor MCP Python hospedado no mesmo VPS, reduzindo o código mantido manualmente no agente e tornando as tools reutilizáveis por outros contextos no futuro. As 2 tools específicas do projeto (`complete_payment_task`, `create_expense_reminder`) permanecem em `tools.py` por dependerem de lógica cross-agent com a Nami.

---

## Arquitetura

```
Makima (coordinator)
    ↓ sub_agent
Kaguya (agents/kaguya/agent.py)
    ├── MCPToolset → stdio → mcp_servers/ticktick/server.py → TickTick API
    └── tools.py → complete_payment_task, create_expense_reminder
```

O servidor MCP roda como **processo filho via stdio** — iniciado automaticamente pelo ADK quando o agente é criado. Não é um serviço separado; não requer porta exposta nem configuração Docker extra.

A Kaguya enxerga todas as tools (MCP + Python) no mesmo namespace. O modelo Gemini decide qual usar com base no contexto sem distinção de origem.

---

## Componentes

### 1. `mcp_servers/ticktick/server.py` — novo

Servidor MCP Python usando o SDK oficial (`mcp` PyPI). Implementa as 14 tools genéricas do TickTick.

A lógica de autenticação OAuth (refresh de token, margem de 5 minutos), cache de projetos (TTL 5 min) e formatação de respostas é **migrada do `tools.py` atual** — não reescrita.

**Tools que migram para o servidor MCP:**

| Categoria | Tools |
|---|---|
| Leitura | `list_projects`, `list_tasks_today`, `list_overdue_tasks`, `list_tasks_by_project`, `search_tasks`, `get_task_detail`, `list_subtasks` |
| Escrita | `create_task`, `update_task`, `complete_task`, `delete_task`, `create_subtask` |
| Checklist | `add_checklist_item`, `complete_checklist_item` |

Variáveis de ambiente lidas: `TICKTICK_ACCESS_TOKEN`, `TICKTICK_REFRESH_TOKEN`, `TICKTICK_EXPIRES_AT` — as mesmas já configuradas no Dokploy. O servidor herda o ambiente do processo pai.

### 2. `agents/kaguya/tools.py` — reduzido

Mantém apenas:
- `complete_payment_task(task_id, project_id, amount, category, account, transaction_name)` — completa tarefa no TickTick + registra transação no BigQuery via Nami
- `create_expense_reminder(title, due_date, project_name, amount, description)` — wrapper de `create_task` com contexto financeiro

Toda a lógica HTTP genérica do TickTick (helpers `_api_get`, `_api_post`, `_api_delete`, cache de projetos) é removida — passa a ser responsabilidade do servidor MCP.

### 3. `agents/kaguya/agent.py` — refatorado

Muda de objeto direto para função async, necessário para inicializar `MCPToolset`:

```python
async def create_kaguya_agent():
    tools, exit_stack = await MCPToolset.from_server(
        connection_params=StdioServerParameters(
            command="python",
            args=["mcp_servers/ticktick/server.py"]
        )
    )
    agent = Agent(
        name="kaguya",
        model="gemini-2.0-flash",
        tools=[*tools, complete_payment_task, create_expense_reminder],
        instruction="..."  # personalidade Kaguya — sem alteração
    )
    return agent, exit_stack
```

### 4. `coordinator/agent.py` — ajustado

Inicializa a Kaguya de forma async antes de criar o agente Makima:

```python
kaguya_agent, kaguya_exit_stack = await create_kaguya_agent()

makima = Agent(
    name="makima",
    sub_agents=[nami_agent, kaguya_agent],
    ...
)
```

O `exit_stack` é retornado ao `main.py` para ser fechado no shutdown.

### 5. `coordinator/main.py` — ajustado

- Setup: chama `create_kaguya_agent()` dentro do contexto async do bot
- Shutdown: fecha `kaguya_exit_stack` junto com o shutdown do python-telegram-bot

### 6. `requirements.txt` — +1 linha

```
mcp    # SDK oficial para criar servidores MCP em Python
```

---

## O que não muda

- Personalidade e instruction da Kaguya
- Integração cross-agent com Nami (`complete_payment_task`)
- Formato de respostas para o Telegram (emojis, hierarquia de subtasks, seção de atrasados)
- Variáveis de ambiente no Dokploy
- Dockerfile

---

## Verificação

1. **Local:** `python mcp_servers/ticktick/server.py` deve iniciar sem erro
2. **Integração:** enviar mensagem no Telegram pedindo tarefas de hoje → Kaguya responde via MCP
3. **Cross-agent:** pedir para completar uma tarefa de pagamento → Kaguya chama `complete_payment_task` (tools.py) e Nami registra a transação
4. **Shutdown:** parar o bot não deixa processo filho do servidor MCP órfão
