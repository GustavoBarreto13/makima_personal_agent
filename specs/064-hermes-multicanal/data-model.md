# Phase 1 Data Model: Hermes Agent — multicanal, memória e mídia

Esta feature não introduz tabelas novas no PostgreSQL de domínio — nenhum schema
existente (`agents/*/schema_pg.sql`) muda. As "entidades" aqui são estruturas de
configuração/registro que atravessam o código novo, não linhas de banco.

## Registro de tools por domínio (`agents/<nome>/toolset.py`)

```python
TOOLS: list[Callable]
```

- Um por domínio migrado. Extraído diretamente da lista hoje inline em
  `Agent(tools=[...])` de cada `agents/<nome>/agent.py`.
- **Exclui** as variantes `*_on_cursor` (recebem cursor `psycopg2` aberto, não
  serializáveis por MCP) — essas seguem privadas, chamadas internamente pelas fachadas
  públicas (ex.: `create_transaction` chama `create_transaction_on_cursor` por dentro).
- Contrato: cada `Callable` MUST ter type hints completos e docstring no padrão Google já
  usado no repo — é a partir daí que tanto o ADK (hoje) quanto o FastMCP (`mcp.tool()(fn)`)
  inferem o schema JSON exposto ao modelo. Não há schema duplicado em lugar nenhum.

## Registro de domínios (`mcp_servers/makima/registry.py`)

```python
DOMAINS: dict[str, list[Callable]]
# {"nami": nami.toolset.TOOLS, "kaguya": kaguya.toolset.TOOLS, ...}
```

- Ponto único de verdade sobre quais domínios estão expostos via MCP no momento. Cresce um
  item por vez conforme a migração avança (Etapas E1 e E6).
- `app.py` itera esse dict para criar um `FastMCP(nome)` por entrada e montar sob
  `/mcp/<nome>` no host Starlette.

## Servidor MCP montado (`mcp_servers/makima/app.py`)

Conceitualmente, por domínio:

| Campo | Descrição |
|---|---|
| `path` | `/mcp/<domínio>` (ex.: `/mcp/nami`) |
| `tools` | lista de tools do domínio, registradas em loop |
| `auth` | bearer token único (`MAKIMA_MCP_TOKEN`), aplicado a todos os paths igualmente |

O domínio `calendar` é um caso especial: não vem de um `toolset.py` de agente, e sim do
objeto `FastMCP` já existente em `mcp_servers/calendar/server.py`, montado sob
`/mcp/calendar` sem alteração de tools — só de transporte (stdio → HTTP).

O domínio `legacy` (Etapa E2) expõe uma única tool
(`perguntar_makima_legado(mensagem: str, chat_id: str) -> str`) que internamente instancia
o `Runner` ADK atual. Não tem `toolset.py` — vive só em `mcp_servers/makima/legacy.py`.
Encolhe conforme domínios migram para seu próprio `toolset.py`, e é removido por completo
na Etapa E7 quando `DOMAINS` cobre todos os 10 domínios.

## Configuração do Hermes (`hermes/config.yaml`)

Não é dado de aplicação, mas é o "modelo" que liga tudo:

```yaml
mcp_servers:
  <domínio>:
    url: "http://makima-mcp:8090/mcp/<domínio>"
    headers:
      Authorization: "Bearer ${MAKIMA_MCP_TOKEN}"
    tools:
      include: ["<glob por domínio>"]
```

Uma entrada por item de `DOMAINS` (mais `calendar` e, enquanto existir, `legacy`) —
mantida manualmente em paralelo ao registro Python; não há geração automática nesta
feature (poderia ser um item de QoL futuro, fora de escopo aqui).

## Memória e sessão (interna ao Hermes, fora do schema do repo)

`$HERMES_HOME` (volume Docker nomeado `hermes_data:/data/hermes`):

- `SOUL.md` — persona (estático, versionado no repo, copiado no boot)
- `MEMORY.md` / `USER.md` — fatos aprendidos (dinâmico, vive só no volume, não versionado)
- `sessions.db` (SQLite + FTS5) — histórico de conversa por usuário/canal
- `skills/<domínio>/SKILL.md` — regras de domínio (estático, versionado, copiado no boot)
- `platforms/whatsapp/session/` — sessão Baileys pareada (dinâmico, só volume)

Nada disso é acessado por fora do container do Hermes — é opaco ao resto do sistema, por
design (é exatamente o que substitui a necessidade de o repo gerenciar sessão).
