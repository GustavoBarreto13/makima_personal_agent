# CLAUDE.md — agents/kaguya

## O que é este agente

**Kaguya** é o agente especialista em gestão de tarefas. Usa o TickTick como backend via
um servidor MCP stdio dedicado (`mcp_servers/ticktick/server.py`). Também possui duas
tools cross-agent que integram Kaguya com Nami para fluxos financeiros+tarefas.

---

## Estrutura de arquivos

```
agents/kaguya/
├── __init__.py
├── agent.py     # create_kaguya_agent() — factory com McpToolset
└── tools.py     # tools cross-agent: complete_payment_task, create_expense_reminder

mcp_servers/ticktick/
└── server.py    # servidor MCP FastMCP — tools genéricas do TickTick
```

---

## Como o agente é criado

Kaguya usa **factory function** (`create_kaguya_agent()`), não instância global.
O `McpToolset` instancia um novo processo filho a cada criação — por isso não pode ser
compartilhado. O coordinator chama a factory dentro de `create_makima()`.

```python
# coordinator/agent.py
from agents.kaguya.agent import create_kaguya_agent

def create_makima() -> Agent:
    kaguya_agent = create_kaguya_agent()  # instancia McpToolset aqui
    return Agent(..., sub_agents=[nami_agent, kaguya_agent])
```

---

## MCP Server (mcp_servers/ticktick/server.py)

Processo filho stdio iniciado pelo ADK via `McpToolset`. O ADK gerencia ciclo de vida.

### Tools expostas pelo servidor MCP

| Tool | Descrição |
| --- | --- |
| `list_projects` | Lista todos os projetos do TickTick |
| `list_tasks_today` | Tarefas de hoje + atrasadas agrupadas por projeto |
| `list_overdue_tasks` | Apenas tarefas atrasadas |
| `list_tasks_by_project` | Tarefas de um projeto específico (por nome ou ID) |
| `create_task` | Cria uma tarefa com título, projeto, data e prioridade |
| `update_task` | Atualiza campos de uma tarefa existente |
| `complete_task` | Marca uma tarefa como concluída |
| `delete_task` | Remove uma tarefa (irreversível — confirmar com usuário antes) |
| `search_tasks` | Busca tarefas por nome/texto |
| `create_subtask` | Cria uma sub-tarefa filha de outra tarefa |
| `list_subtasks` | Lista sub-tarefas de uma tarefa pai |
| `add_checklist_item` | Adiciona item de checklist (sem data/ID) a uma tarefa |
| `complete_checklist_item` | Marca item de checklist como concluído |

### Configuração do McpToolset

```python
McpToolset(
    connection_params=StdioConnectionParams(
        server_params=StdioServerParameters(
            command="python",
            args=[server_path],   # caminho absoluto para mcp_servers/ticktick/server.py
            env=mcp_env,          # herda get_default_environment() + vars TICKTICK_*
        ),
        timeout=60.0,  # list_tasks_today faz N+1 GETs — 5s padrão estoura com 10+ projetos
    )
)
```

### Cache de projetos

O servidor MCP mantém um cache em memória dos projetos com TTL de 5 minutos.
Isso reduz chamadas à API quando múltiplas tools precisam resolver IDs de projetos
na mesma sessão.

---

## Tools cross-agent (agents/kaguya/tools.py)

Estas tools têm acesso tanto ao TickTick (via requests direto) quanto à Nami
(via import de `agents.nami.tools`).

### `complete_payment_task`

Fluxo: usuário pagou uma conta que tinha tarefa associada.

1. Chama `POST /project/{project_id}/task/{task_id}/complete` no TickTick
2. Importa e chama `create_transaction()` da Nami para lançar a despesa no BigQuery
3. Retorna status agregado (`ok` / `partial`) com detalhes de cada etapa

**Parâmetros obrigatórios:** `task_id`, `project_id`, `amount`, `category`, `account`
**Kaguya deve confirmar** esses valores com o usuário antes de chamar — sem defaults financeiros.

### `create_expense_reminder`

Fluxo: usuário quer lembrete para pagar algo no futuro.

1. Resolve o projeto no TickTick pelo nome (fuzzy match por prefixo)
2. Cria tarefa com prioridade Alta e data de vencimento informada
3. **Não lança despesa** — o lançamento ocorre quando o usuário realmente pagar

**Parâmetros:** `title`, `due_date` (YYYY-MM-DD), `project_name` (padrão: "Finanças"),
`amount` (opcional — vai na descrição), `description` (opcional)

---

## OAuth do TickTick

As credenciais são passadas via variáveis de ambiente:

```
TICKTICK_ACCESS_TOKEN    # token atual
TICKTICK_CLIENT_ID       # client ID do app
TICKTICK_CLIENT_SECRET   # client secret do app
TICKTICK_REFRESH_TOKEN   # para renovar automaticamente
TICKTICK_EXPIRES_AT      # ISO 8601 — quando o access token expira
```

O servidor MCP renova o token automaticamente via refresh quando detecta expiração
(margem de 5 minutos). As tools cross-agent em `tools.py` têm um cache mínimo próprio
para as chamadas diretas (não MCP).

---

## Regras importantes de comportamento

- **Chame a tool PRIMEIRO**, depois responda. Nunca mande "aguarde..." antes de chamar.
- `list_tasks_today` já inclui atrasadas no campo `overdue` — não chame `list_overdue_tasks` junto.
- `delete_task` é irreversível — sempre confirme com o usuário antes de executar.
- Para `complete_payment_task`: confirme valor, categoria e conta antes de chamar. Sem defaults.
- Projetos são buscados dinamicamente — não assuma nomes fixos no código ou na instrução.

---

## Formatação

O Telegram renderiza HTML. Kaguya usa HTML + emojis em todas as respostas.
Nunca usar markdown (`*`, `_`, `~`). Ver instrução completa em `agent.py` para os templates
de cada tipo de resposta (lista de tarefas, confirmação de criação, erros, etc.).

---

## Personalidade

Kaguya Shinomiya — aristocrática, organizada, levemente condescendente.

- Sempre começa com `Kaguya:`
- Tom de quem faz um favor; admira o usuário mas nunca admite diretamente (escapa em `...`)
- Quando tudo funciona: "Como esperado."
- Quando cria: "Registrei isso para você. ...Apenas desta vez."
- Quando completa: "Concluído. Era o mínimo esperado. ...Não que eu esperasse menos de você."
- Quando há erro: "Houve um problema. Não foi culpa sua, desta vez."
- Nunca quebra o personagem
