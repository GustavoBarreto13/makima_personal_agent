# Contrato: servidores MCP expostos pelo `makima-mcp`

Interface entre o gateway (Hermes) e as tools de domínio deste repo. Consumida por
qualquer cliente MCP compatível — não só o Hermes (o MCP Inspector é usado na verificação
manual da Etapa E1).

## Transporte

- Protocolo: MCP sobre HTTP streamável (`streamable_http_app()` da lib `mcp`)
- Host: um único processo Starlette/uvicorn, container `makima-mcp`, porta 8090
- Rede: apenas `dokploy-network` — nenhuma porta publicada para a internet
- Autenticação: header `Authorization: Bearer ${MAKIMA_MCP_TOKEN}` obrigatório em toda
  requisição; ausência ou token incorreto MUST resultar em `401`

## Endpoints (um por domínio, montados sob `/mcp/<domínio>`)

| Path | Origem das tools | Disponível a partir de |
|---|---|---|
| `/mcp/nami` | `agents/nami/toolset.py` | Etapa E1 |
| `/mcp/kaguya` | `agents/kaguya/toolset.py` | Etapa E1 |
| `/mcp/calendar` | `mcp_servers/calendar/server.py` (reaproveitado) | Etapa E1 |
| `/mcp/legacy` | `mcp_servers/makima/legacy.py` | Etapa E2, removido na E7 |
| `/mcp/frieren`, `/mcp/akane`, `/mcp/komi`, `/mcp/marin`, `/mcp/mai`, `/mcp/lucy`, `/mcp/kurisu` | `agents/<nome>/toolset.py` | Etapa E6, um por vez |
| `/mcp/journal` | `agents/journal/tools.py` | Etapa E5 |

Cada endpoint segue o protocolo MCP padrão: `tools/list` enumera as tools do domínio (nome,
descrição, JSON schema de parâmetros — inferidos de signature + docstring, sem definição
paralela); `tools/call` executa uma tool e retorna o resultado.

## Contrato de retorno das tools de domínio (já vigente, não muda)

Toda tool de escrita segue o padrão já estabelecido no repo:

```json
{"status": "ok", "...": "..."}
```
ou
```json
{"status": "error", "message": "..."}
```

Este contrato é anterior a esta feature (documentado em `webapp/CLAUDE.md`) e é reutilizado
sem alteração — é o que garante que a mesma função sirva ADK, FastAPI e agora MCP sem
adaptação.

## Contrato da tool da ponte legada (`/mcp/legacy`)

```
perguntar_makima_legado(mensagem: str, chat_id: str) -> str
```

- `mensagem`: texto do usuário, repassado como está para o `Runner` ADK
- `chat_id`: identificador estável do usuário (não necessariamente o chat_id literal do
  Telegram — qualquer string estável por usuário serve, já que o ADK só usa isso como
  `user_id`/parte do `session_id`)
- Retorno: texto de resposta consolidado (mesma lógica de "juntar texto de todos os
  eventos por autor" hoje em `coordinator/main.py:950–1012`, extraída para função
  reaproveitável)
- Só cobre os domínios ainda não presentes em `DOMAINS` (registry.py) — a lista de
  `sub_agents` passada a `create_makima()` encolhe a cada domínio migrado
