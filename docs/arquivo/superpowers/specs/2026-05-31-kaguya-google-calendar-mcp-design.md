# Kaguya + Google Calendar MCP — Design Spec

**Data:** 2026-05-31  
**Status:** Aprovado

---

## Contexto

A Kaguya é o agente de tarefas do sistema Makima. Atualmente ela acessa o TickTick via MCP server stdio. O objetivo é adicionar acesso ao Google Calendar pessoal do usuário, permitindo que a Kaguya consulte a agenda e gerencie eventos diretamente pelo Telegram.

A motivação é unificar gestão de tarefas (TickTick) e agenda (Google Calendar) em um único agente, mantendo a arquitetura MCP já estabelecida no projeto.

---

## Arquitetura

A integração segue exatamente o padrão do TickTick: um novo servidor MCP FastMCP rodando como processo filho stdio, instanciado por um segundo `McpToolset` dentro de `create_kaguya_agent()`.

```
Kaguya Agent
├── McpToolset #1 → mcp_servers/ticktick/server.py   (já existe)
├── McpToolset #2 → mcp_servers/calendar/server.py   (novo)
├── complete_payment_task   (tool Python direta)
└── create_expense_reminder (tool Python direta)
```

O coordinator (`coordinator/agent.py`) não é alterado — ainda chama `create_kaguya_agent()`.

---

## Credenciais OAuth

OAuth 2.0 pessoal (não service account), com refresh automático igual ao TickTick.

**Novas env vars:**
```
GOOGLE_CALENDAR_CLIENT_ID
GOOGLE_CALENDAR_CLIENT_SECRET
GOOGLE_CALENDAR_ACCESS_TOKEN
GOOGLE_CALENDAR_REFRESH_TOKEN
GOOGLE_CALENDAR_TOKEN_EXPIRY        # ISO 8601
GOOGLE_CALENDAR_MAIN_CALENDAR_ID    # ID do calendário principal (para writes)
```

Configurar no `.env` local e no Dokploy para o VPS.

---

## Novo Servidor MCP — `mcp_servers/calendar/server.py`

### Tools expostas

| Tool | Descrição | Calendários |
|---|---|---|
| `list_calendars` | Lista todos os calendários disponíveis | — |
| `list_events` | Lista eventos por calendário e intervalo de datas | Todos (leitura) |
| `list_events_today` | Eventos do dia corrente em todos os calendários | Todos (leitura) |
| `get_event` | Detalhe de um evento específico | Todos (leitura) |
| `create_event` | Cria evento (título, data/hora, descrição, convidados) | Só principal |
| `update_event` | Edita evento existente | Só principal |
| `delete_event` | Remove evento | Só principal |
| `find_free_slots` | Verifica horários livres num intervalo | Todos (leitura) |

### Proteção de escrita

Antes de executar `create_event`, `update_event` ou `delete_event`, o servidor verifica se o `calendar_id` alvo é igual ao `GOOGLE_CALENDAR_MAIN_CALENDAR_ID`. Se não for, retorna erro descritivo sem executar a operação.

### Refresh automático de token

Antes de cada chamada à API, verifica se o `access_token` está próximo de expirar (margem de 5 minutos). Se sim, renova via `CLIENT_ID` + `CLIENT_SECRET` + `REFRESH_TOKEN` e atualiza as variáveis em memória.

### Dependências adicionais (`requirements.txt`)

```
google-auth
google-auth-oauthlib
google-api-python-client
```

---

## Mudanças em `agents/kaguya/agent.py`

A factory `create_kaguya_agent()` instancia um segundo `McpToolset`:

```python
calendar_env = {
    **get_default_environment(),
    "GOOGLE_CALENDAR_CLIENT_ID": os.environ.get("GOOGLE_CALENDAR_CLIENT_ID", ""),
    "GOOGLE_CALENDAR_CLIENT_SECRET": os.environ.get("GOOGLE_CALENDAR_CLIENT_SECRET", ""),
    "GOOGLE_CALENDAR_ACCESS_TOKEN": os.environ.get("GOOGLE_CALENDAR_ACCESS_TOKEN", ""),
    "GOOGLE_CALENDAR_REFRESH_TOKEN": os.environ.get("GOOGLE_CALENDAR_REFRESH_TOKEN", ""),
    "GOOGLE_CALENDAR_TOKEN_EXPIRY": os.environ.get("GOOGLE_CALENDAR_TOKEN_EXPIRY", ""),
    "GOOGLE_CALENDAR_MAIN_CALENDAR_ID": os.environ.get("GOOGLE_CALENDAR_MAIN_CALENDAR_ID", ""),
}

mcp_calendar = McpToolset(
    connection_params=StdioConnectionParams(
        server_params=StdioServerParameters(
            command="python",
            args=[calendar_server_path],
            env=calendar_env,
        ),
        timeout=30.0,
    )
)
```

`tools=` passa a ser:
```python
tools=[mcp_ticktick, mcp_calendar, complete_payment_task, create_expense_reminder]
```

A instrução do agente recebe um parágrafo descrevendo as capacidades do Calendar e reforçando a regra de escrita apenas no calendário principal.

---

## Script de Autorização OAuth — `scripts/authorize_calendar.py`

Script auxiliar para gerar as credenciais OAuth na primeira vez:

1. Lê `client_secret.json` (baixado do Google Cloud Console)
2. Abre o browser para autorização
3. Imprime `access_token`, `refresh_token` e `token_expiry` para copiar nas env vars

Não faz parte do agente em si — roda localmente uma única vez.

---

## Arquivos Criados/Alterados

| Arquivo | Ação |
|---|---|
| `mcp_servers/calendar/__init__.py` | Novo (vazio) |
| `mcp_servers/calendar/server.py` | Novo (~250 linhas) |
| `agents/kaguya/agent.py` | Adiciona segundo McpToolset + atualiza instrução |
| `requirements.txt` | Adiciona 3 dependências google |
| `scripts/authorize_calendar.py` | Novo — geração de credenciais OAuth |
| `CLAUDE.md` | Atualiza seção da Kaguya com Calendar |

---

## Verificação End-to-End

1. **Configurar OAuth no Google Cloud Console** — criar projeto, habilitar Calendar API, criar credenciais OAuth 2.0 tipo "Desktop app", baixar `client_secret.json`
2. **Rodar `scripts/authorize_calendar.py`** — autorizar via browser, obter tokens
3. **Configurar env vars** — adicionar as 6 variáveis `GOOGLE_CALENDAR_*` no `.env` local e no Dokploy
4. **Testar servidor MCP isolado** — rodar `mcp_servers/calendar/server.py` e verificar `list_calendars`
5. **Testar via Telegram:**
   - "Kaguya, o que tenho hoje na agenda?"
   - "Kaguya, cria um evento amanhã às 15h chamado Reunião"
   - "Kaguya, quando estou livre na próxima semana?"
   - Tentar editar evento em calendário secundário — deve retornar erro de proteção
