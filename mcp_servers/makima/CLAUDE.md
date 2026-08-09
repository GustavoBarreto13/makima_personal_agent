# CLAUDE.md — mcp_servers/makima

## O que é

**`makima-mcp`** — host HTTP único que expõe as tools de domínio (Nami, Kaguya,
Calendar, e os domínios ainda não migrados via a ponte legada) pelo protocolo MCP, para
qualquer cliente MCP consumir — hoje o cliente real é o `Runner` ADK interno (via a
ponte legada); a partir da Etapa E3 da spec 064, o cliente será o Hermes Agent.

Status: **Etapas E1 e E2 entregues e verificadas em produção** (não só testadas
localmente — validadas com `curl` real contra a VPS, ver "Verificação em produção"
abaixo). Ver `ROADMAP.md` (linha da fase 064) para o estado das etapas seguintes.

---

## Arquitetura

```
mcp_servers/makima/
├── registry.py   # DOMAINS: dict[str, list[Callable]] — nami, kaguya (cresce na E6)
├── app.py        # host Starlette: monta um FastMCP por domínio sob /mcp/<domínio>
├── auth.py       # middleware bearer token (MAKIMA_MCP_TOKEN)
├── legacy.py     # tool perguntar_makima_legado() — Etapa E2, roda o Runner ADK
│                 # restrito aos domínios ainda não migrados
└── Dockerfile    # base Python 3.12-slim + uvicorn
```

Cada domínio é um `FastMCP` independente (tools registradas via `.tool()(fn)`),
montado como sub-app Starlette sob `/mcp/<domínio>`:

| Path | Origem das tools | Etapa |
|---|---|---|
| `/mcp/nami` | `agents/nami/toolset.py` | E1 |
| `/mcp/kaguya` | `agents/kaguya/toolset.py` | E1 |
| `/mcp/calendar` | `mcp_servers/calendar/server.py` (reaproveitado — só muda transporte, stdio→HTTP) | E1 |
| `/mcp/legacy` | `legacy.py` — 1 tool (`perguntar_makima_legado`) | E2, some na E7 |
| `/mcp/<domínio>` | `agents/<nome>/toolset.py`, um por vez | E6 (Frieren→Akane→Komi→Marin→Mai→Lucy→Kurisu) |

`registry.py` é o ponto único de verdade sobre quais domínios têm `toolset.py` próprio
— `app.py` itera `DOMAINS` para montá-los; `calendar` e `legacy` são casos especiais,
montados à parte (não vêm de um `toolset.py` de agente).

### `agents/<nome>/toolset.py`

Cada domínio migrado ganha um `toolset.py` com `TOOLS: list[Callable]` — extraído
diretamente da lista que já existia inline em `Agent(tools=[...])` no `agent.py` do
domínio (puramente extrativo, nenhuma tool mudou de comportamento). `agent.py` passou a
importar de lá, então o bot Telegram (ADK) e o `makima-mcp` (FastMCP) leem a MESMA lista
— zero duplicação. Exclui variantes `*_on_cursor` (recebem cursor `psycopg2` aberto, não
serializáveis por MCP) — seguem privadas, chamadas internamente pelas fachadas públicas.

### Lifespan composto (`app.py`)

Cada `FastMCP.streamable_http_app()` carrega seu próprio *session manager* via
lifespan — mas Starlette **não propaga lifespan automaticamente** para apps montados
via `Mount()`. `app.py` compõe manualmente o lifespan de todos os sub-apps num único
`AsyncExitStack` (padrão documentado do SDK oficial para hospedar múltiplos servidores
MCP num só processo). Sem isso, o handshake MCP falha com
`RuntimeError: Task group is not initialized` (é exatamente o motivo pelo qual o teste
`test_domain_apps_disable_dns_rebinding_protection` usa `TestClient` como context
manager — fora dele, o lifespan não dispara).

### Ponte legada (`legacy.py`) — construção lazy

`_get_runner()` constrói o `Runner` ADK da ponte legada só na **primeira chamada** da
tool (memoizado), não no import do módulo. Motivo: os `sub_agents` passados a
`create_makima(sub_agents=_LEGACY_DOMAIN_AGENTS)` são instâncias **singleton**
(importadas de `agents/<nome>/agent.py`, as mesmas que `coordinator/main.py` usa). O ADK
rejeita atribuir um segundo "pai" ao mesmo agente se `coordinator.main` (que monta sua
PRÓPRIA `Makima` com a lista completa) e `mcp_servers.makima.app` (via `legacy.py`)
forem importados no mesmo processo Python — nunca acontece em produção (cada um roda no
seu próprio container, `makima-bot` vs. `makima-mcp`), mas a construção lazy elimina o
risco em qualquer cenário que importe os dois módulos juntos (testes, scripts de debug).

`_LEGACY_DOMAIN_AGENTS` encolhe manualmente a cada domínio migrado (Etapa E6) — remover
uma entrada no mesmo commit em que o domínio ganha seu `toolset.py`.

---

## Autenticação (`auth.py`)

`BearerAuthMiddleware` envolve o app Starlette inteiro — roda **antes** de qualquer
sub-app de domínio ser alcançado. Toda requisição precisa do header
`Authorization: Bearer ${MAKIMA_MCP_TOKEN}`; ausente ou incorreto → `401`.

Cadastro do token: painel **Environment** do Dokploy (é o mesmo `.env` compartilhado por
`makima`/`mcp`/`web`/`scheduler` — não é por serviço). Gerar com
`python3 -c "import secrets; print(secrets.token_urlsafe(32))"`. Precisa de **redeploy**
para o container novo ler o valor (env var só é lida na inicialização).

---

## Gotchas conhecidos (achados e corrigidos em produção — ago/2026)

### 1. Pin exato de `mcp==1.29.0`

`mcp>=2.0` reestruturou a API interna: remove `mcp.server.fastmcp.FastMCP` (quebra o
host HTTP deste pacote) **e** remove módulos que
`google.adk.tools.mcp_tool.mcp_toolset` importa (quebra o `McpToolset` da Kaguya no bot
Telegram com `ModuleNotFoundError: mcp.shared.session` ou similar). `google-adk`
instalado exige `mcp>=1.24,<2` — `1.29.0` é a última 1.x, compatível com os dois lados.

**Nunca deixar `mcp` sem pin em `requirements.txt`** — foi exatamente isso que causou o
crash loop de produção corrigido no commit `a381fc8` (`makima-bot` em
`ModuleNotFoundError` após um redeploy que resolveu `mcp==2.0.0` do zero).

### 2. Proteção anti-DNS-rebinding do FastMCP

O `FastMCP` do SDK liga por padrão uma checagem de `Host` header que só aceita
`127.0.0.1`/`localhost`/`[::1]` (`TransportSecuritySettings` default,
`enable_dns_rebinding_protection=True`). Em produção, o handshake `initialize` via
`http://makima-mcp:8090` (o hostname real do Docker Compose que qualquer cliente na
`dokploy-network` usa) devolvia **421 "Invalid Host header"**.

`app.py` desliga essa proteção em todo domínio (`_INSECURE_TRANSPORT =
TransportSecuritySettings(enable_dns_rebinding_protection=False)`) — a defesa que ela
oferece (impedir que uma página maliciosa no navegador force requisições autenticadas a
um servidor interno via DNS rebinding) já é coberta por duas camadas mais fortes aqui:
rede (`makima-mcp` só existe na `dokploy-network`, nunca tem porta publicada) e
aplicação (`BearerAuthMiddleware`, que roda antes de qualquer domínio ser alcançado).
Nenhum cliente deste servidor é um navegador.

Se algum domínio novo for montado com seu próprio `FastMCP(...)` fora de
`_build_domain_app`/`_build_calendar_app`/`_build_legacy_app`, lembrar de passar
`transport_security=_INSECURE_TRANSPORT` também — senão o `421` volta.

---

## Testes (`tests/test_mcp_makima.py`, `tests/test_mcp_makima_legacy.py`)

Cobrem: `registry.DOMAINS` (tools são callables, exclui `*_on_cursor`), `auth.py`
(401 sem token / token errado / 200 com token certo), montagem de rotas (`app.py`), a
proteção DNS-rebinding desligada (regressão do gotcha #2, via `TestClient` como context
manager) e o schema da tool da ponte legada. Não testam contra Postgres/Gemini reais —
isso é feito manualmente (ver abaixo).

`tests/test_runner_utils.py` cobre `coordinator/runner_utils.py` (extraído de
`coordinator/main.py::handle_message` — consumo de eventos do Runner ADK, fallback de
sub_agents, retry em `SessionNotFoundError`), reaproveitado tanto pelo bot Telegram
quanto por `legacy.py`.

`conftest.py` (raiz do repo) faz *prime* de `google.adk`/`google.genai` em
`sys.modules` antes do mock de `google.cloud.bigquery` — sem isso, os testes deste
pacote (que precisam do ADK real) quebram porque o mock global substitui
`sys.modules["google"]` inteiro.

---

## Verificação em produção (não só local)

Diferente da maioria das specs deste repo, a Etapa E1/E2 foi validada com `curl` real
contra a VPS (não só localmente), via um container `curlimages/curl` efêmero na
`dokploy-network` (a rede é overlay/Swarm — não é diretamente roteável do host, por isso
o teste não pode ser um `curl` simples do host):

```bash
docker run --rm --network dokploy-network curlimages/curl \
  -H "Authorization: Bearer $MAKIMA_MCP_TOKEN" \
  -H "Accept: application/json, text/event-stream" -H "Content-Type: application/json" \
  -X POST http://makima-mcp:8090/mcp/nami/ \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}'
```

Confirmado (ago/2026): `tools/list` retorna 60 tools em `/mcp/nami`, 46 em
`/mcp/kaguya`, 8 em `/mcp/calendar`, 1 em `/mcp/legacy`; 401 sem token/com token errado.

---

## Como adicionar um domínio novo (Etapa E6)

1. Criar `agents/<nome>/toolset.py` com `TOOLS: list[Callable]` (extrair da lista de
   `agent.py`, mesmo padrão de `agents/nami/toolset.py`).
2. Adicionar a entrada em `registry.py::DOMAINS`.
3. Remover o agente correspondente de `_LEGACY_DOMAIN_AGENTS` em `legacy.py`.
4. Adicionar o bloco `mcp_servers:` correspondente em `hermes/config.yaml`.
5. Testar `tools/list` em `/mcp/<nome>` (local e, se possível, em produção como acima).
