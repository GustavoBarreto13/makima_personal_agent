# CLAUDE.md — mcp_servers/makima

## O que é

**`makima-mcp`** — host HTTP único que expõe as tools dos 11 domínios de agente
(Nami, Kaguya, Frieren, Akane, Komi, Marin, Mai, Lucy, Kurisu, Journal/Violet, Yato) mais
Calendar pelo protocolo MCP, para qualquer cliente MCP consumir — o cliente real em
produção é o Hermes Agent (`hermes/config.yaml::mcp_servers`).

Status: **Etapas E1, E2 e E6 entregues**, mais a ativação da Violet (fora do roteiro
original da spec 064, feita a pedido do usuário logo depois da E6) — os 11 domínios de
agente (os 10 originais + a Yato, spec 066) têm `toolset.py` próprio e estão em `registry.py::DOMAINS`; `legacy.py` (ponte
ADK, Etapa E2) segue montada mas com `_LEGACY_DOMAIN_AGENTS` vazia, sem nenhum domínio
pra rotear — só é removida de fato na Etapa E7. Ver `ROADMAP.md` (linha da fase 064)
para o estado das demais etapas.

---

## Arquitetura

```
mcp_servers/makima/
├── registry.py   # DOMAINS: dict[str, list[Callable]] — os 11 domínios de agente
├── app.py        # host Starlette: monta um FastMCP por domínio sob /mcp/<domínio>
├── auth.py       # middleware bearer token (MAKIMA_MCP_TOKEN)
├── legacy.py     # tool perguntar_makima_legado() — Etapa E2, _LEGACY_DOMAIN_AGENTS
│                 # vazia desde a E6; removido de vez só na E7
└── Dockerfile    # base Python 3.12-slim + uvicorn
```

Cada domínio é um `FastMCP` independente (tools registradas via `.tool()(fn)`),
montado como sub-app Starlette sob `/mcp/<domínio>`:

| Path | Origem das tools | Etapa |
|---|---|---|
| `/mcp/nami` | `agents/nami/toolset.py` | E1 |
| `/mcp/kaguya` | `agents/kaguya/toolset.py` | E1 |
| `/mcp/frieren` | `agents/frieren/toolset.py` | E6 |
| `/mcp/akane` | `agents/akane/toolset.py` | E6 |
| `/mcp/komi` | `agents/komi/toolset.py` | E6 |
| `/mcp/marin` | `agents/marin/toolset.py` | E6 |
| `/mcp/mai` | `agents/mai/toolset.py` | E6 |
| `/mcp/lucy` | `agents/lucy/toolset.py` | E6 |
| `/mcp/kurisu` | `agents/kurisu/toolset.py` | E6 (só 1 tool, `buscar_na_base`) |
| `/mcp/journal` | `agents/journal/toolset.py` (`violet_agent` — pacote continua `journal`, personalidade Violet) | Ativação da Violet, fora da E6 |
| `/mcp/calendar` | `mcp_servers/calendar/server.py` (reaproveitado — só muda transporte, stdio→HTTP) | E1 |
| `/mcp/legacy` | `legacy.py` — 1 tool (`perguntar_makima_legado`), sem domínio pra rotear | E2, some na E7 |

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

`_LEGACY_DOMAIN_AGENTS` está vazia desde a Etapa E6 — `create_makima(sub_agents=[])`
monta uma Makima sem nenhum sub-agente (o fallback dos 9 domínios completos só entra
quando `sub_agents` é `None`, não quando é lista vazia). `perguntar_makima_legado`
continua registrada e responde, mas não tem mais domínio pra rotear — o módulo inteiro
só é removido na Etapa E7.

---

## Autenticação (`auth.py`)

`BearerAuthMiddleware` envolve o app Starlette inteiro — roda **antes** de qualquer
sub-app de domínio ser alcançado. Toda requisição (exceto `GET /healthz`) precisa do
header `Authorization: Bearer <token>`. Dois tipos de token, escopos diferentes:

| Token | Env var | Escopo | Quem usa |
|---|---|---|---|
| Interno | `MAKIMA_MCP_TOKEN` | **Todos** os domínios | Hermes (rede interna, `dokploy-network`) |
| Externo | `MAKIMA_MCP_EXTERNAL_TOKENS` (lista separada por vírgula) | Só os domínios em `MAKIMA_MCP_EXTERNAL_DOMAINS` (lista separada por vírgula, default `kaguya`) | Clientes MCP externos pela porta pública (ver seção abaixo) |

Sem token, ou token que não bate com nenhum dos dois → `401`. Token externo válido mas
fora do domínio liberado → `403` (não `401` — o token em si é válido, só não alcança
aquele path). O match do domínio é feito pelo segmento do path (`/mcp/<domínio>` ou
`/mcp/<domínio>/...`) — `/mcp/kaguyaX` não conta como `kaguya` (sem confusão de prefixo).

Isso dá **duas camadas** de restrição para o token externo, independentes: a rede (o
domínio público do Dokploy só roteia o path `/mcp/kaguya`, qualquer outro dá 404 do
Traefik antes de chegar aqui) e a aplicação (mesmo que a config de rede seja alargada
por engano, `auth.py` ainda bloqueia qualquer domínio fora de
`MAKIMA_MCP_EXTERNAL_DOMAINS`). Liberar outro domínio no futuro = acrescentar o nome
nessa env var + um path a mais no domínio do Dokploy — sem mudar código.

Cadastro dos tokens: painel **Environment** do Dokploy (é o mesmo `.env` compartilhado
por `makima`/`mcp`/`web`/`scheduler` — não é por serviço). Gerar com
`python3 -c "import secrets; print(secrets.token_urlsafe(32))"`. Precisa de **redeploy**
para o container novo ler o valor (env var só é lida na inicialização). Rotação: trocar
`MAKIMA_MCP_EXTERNAL_TOKENS` e redeployar invalida só os clientes externos, sem afetar o
Hermes (`MAKIMA_MCP_TOKEN` é independente).

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
um servidor interno via DNS rebinding) é coberta por duas outras camadas aqui: o `Host`
header de qualquer requisição que chega ao container (interna via `dokploy-network`, ou
pública via o domínio `/mcp/kaguya` roteado pelo Traefik do Dokploy) é determinado pela
infraestrutura, não por um atacante arbitrário; e `BearerAuthMiddleware` roda antes de
qualquer domínio ser alcançado, bloqueando qualquer requisição sem o token certo
independente do `Host`. Nenhum cliente deste servidor é um navegador — a classe de
ataque que essa proteção previne (CSRF via DNS rebinding contra um servidor que confia na
origem) não se aplica aqui.

Se algum domínio novo for montado com seu próprio `FastMCP(...)` fora de
`_build_domain_app`/`_build_calendar_app`/`_build_legacy_app`, lembrar de passar
`transport_security=_INSECURE_TRANSPORT` também — senão o `421` volta.

---

## Testes (`tests/test_mcp_makima.py`, `tests/test_mcp_makima_legacy.py`)

Cobrem: `registry.DOMAINS` — desde a Etapa E6, `test_registry_has_all_migrated_domains_with_callables`
itera genericamente `DOMAINS.items()` conferindo que os 9 domínios existem, com pelo
menos uma tool cada, todas callables (exclui `*_on_cursor`); `auth.py` (401 sem token /
token errado / 200 com token certo); montagem de rotas (`app.py`); a proteção
DNS-rebinding desligada (regressão do gotcha #2, via `TestClient` como context manager);
e o schema da tool da ponte legada. Não testam contra Postgres/Gemini reais — isso é
feito manualmente (ver abaixo).

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
  -X POST http://makima-mcp:8090/mcp/<domínio>/ \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}'
```

Confirmado (ago/2026, Etapa E1/E2): `tools/list` retorna 60 tools em `/mcp/nami`, 46 em
`/mcp/kaguya`, 8 em `/mcp/calendar`, 1 em `/mcp/legacy`; 401 sem token/com token errado.
`/mcp/kaguya` cresceu desde então — 53 tools no código atual: `set_time_block`/
`clear_time_block` (time-blocking, para o Hermes agendar compromissos na Kaguya em vez de
escrever no Google Calendar) e `get_current_datetime` (data/hora atual em
America/Sao_Paulo — o Hermes congela a data na criação da sessão, ver `hermes/CLAUDE.md`).

**Etapa E6 (validado localmente, ainda não repetido contra a VPS)**: subindo
`uvicorn mcp_servers.makima.app:app` localmente, o handshake `initialize` responde 200
com `serverInfo.name` correto nos 9 domínios de agente + `calendar` (`google_calendar`)
+ `legacy` — confirma que a montagem das 7 rotas novas (Frieren, Akane, Komi, Marin,
Mai, Lucy, Kurisu) não quebrou nada. `pytest` completo: os 9 testes de
`tests/test_mcp_makima*.py` passam, incluindo o teste generalizado de `registry.DOMAINS`;
as 57 falhas restantes da suíte são pré-existentes (dependem de Postgres real — mesma
contagem já documentada na Etapa E1). Falta repetir o `curl` via container efêmero contra
a VPS depois do deploy do `makima-mcp` com as mudanças desta etapa, como foi feito na E1.

---

## Conectar um cliente MCP externo (Claude Code, Cursor, VS Code, Claude Desktop…)

Desde a exposição pública da Kaguya (out/2026), a Kaguya tem um domínio HTTPS próprio no
Dokploy (`https://mcp.gusstavo42-vps.cloud/mcp/kaguya/`, roteado pelo Traefik — só esse
path, nenhum outro domínio responde por ele) e aceita o token externo
(`MAKIMA_MCP_EXTERNAL_TOKENS`, escopado por `MAKIMA_MCP_EXTERNAL_DOMAINS` — ver
"Autenticação" acima). Qualquer cliente MCP com suporte a header customizado conecta
direto, sem túnel:

```text
Cliente MCP ─► https://mcp.gusstavo42-vps.cloud/mcp/kaguya/ ─► Traefik ─► makima-mcp ─► PostgreSQL
```

**Importante**: isto só cobre clientes que aceitam um bearer fixo. **claude.ai** (web/app)
e **ChatGPT** (conectores/GPTs) só aceitam servidores MCP com OAuth 2.1 (DCR + PKCE) — não
conectam aqui. Dar suporte a eles exigiria implementar um servidor de autorização OAuth
no `makima-mcp`, fora do escopo desta exposição.

### Claude Code

Registro (escopo user, uma vez):

```bash
claude mcp add --scope user --transport http kaguya \
  https://mcp.gusstavo42-vps.cloud/mcp/kaguya/ \
  --header "Authorization: Bearer <token externo>"
```

A **barra final** é obrigatória por convenção: os sub-apps usam
`streamable_http_path="/"`, então `/mcp/kaguya` responde 307 para `/mcp/kaguya/`.
Verificar com `claude mcp list` → `kaguya √ Connected`. **Nunca `claude mcp get`**: ele
imprime o header `Authorization` em texto puro (o `add` redige, o `get` não).

### Cursor / VS Code (via `mcp.json`)

Cursor e VS Code (extensão oficial do Claude ou GitHub Copilot) leem `http`/`headers`
nativamente num `mcp.json`:

```json
{
  "mcpServers": {
    "kaguya": {
      "url": "https://mcp.gusstavo42-vps.cloud/mcp/kaguya/",
      "headers": { "Authorization": "Bearer <token externo>" }
    }
  }
}
```

### Claude Desktop (via `mcp-remote`)

Claude Desktop ainda não fala HTTP streamável nativo com headers customizados — usar o
proxy `mcp-remote` (`npx mcp-remote`) no `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kaguya": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.gusstavo42-vps.cloud/mcp/kaguya/",
        "--header", "Authorization:Bearer <token externo>"
      ]
    }
  }
}
```

### Liberar outro domínio além da Kaguya

1. Acrescentar o nome do domínio em `MAKIMA_MCP_EXTERNAL_DOMAINS` (Environment do
   Dokploy) e redeployar.
2. No painel **Domains** do serviço `mcp`, adicionar um path novo (`/mcp/<domínio>`) ao
   mesmo domínio público (ou um domínio/path dedicado).
3. Nenhuma mudança de código — `auth.py` já lê a lista do env.

### Fallback: túnel SSH (loopback do VPS)

Antes da exposição pública, o único caminho era túnel SSH para o loopback do VPS
(`docker-compose.yml`, serviço `mcp`: `127.0.0.1:8090:8090`, ainda mantido). Continua
funcionando como fallback se o domínio público cair, ou para testar com o token interno:

```text
Cliente MCP ─► localhost:8090 ══ ssh -N makima-tunnel ══► 127.0.0.1:8090 (VPS) ─► makima-mcp
```

- **Aliases** no `~/.ssh/config` da máquina cliente: `makima-vps` (comandos avulsos) e
  `makima-tunnel` (só o túnel: `LocalForward 8090 127.0.0.1:8090` + `ExitOnForwardFailure yes`).
  São dois de propósito: com o forward no mesmo alias dos comandos avulsos, qualquer
  `ssh makima-vps "<cmd>"` falharia (exit 255) enquanto o túnel estivesse de pé. Ambos usam o
  IP do VPS, `User root` e a chave `id_ed25519`.
- **Registro** apontando para `http://localhost:8090/mcp/<domínio>/` em vez da URL
  pública — os outros detalhes (barra final, `claude mcp list`, nunca `claude mcp get`)
  são os mesmos de cima.
- **Túnel manual**: `ssh -N makima-tunnel` numa janela aberta. Sem ele o servidor aparece
  "Failed to connect". Não há túnel automático — decisão do usuário.
- **Keepalive**: o `Host *` do `~/.ssh/config` do usuário usa `ServerAliveInterval 60` ×
  `ServerAliveCountMax 30`, então o ssh leva até 30 min para perceber que a conexão caiu
  (túnel "aberto" mas morto depois de suspender o PC). No `ssh_config` o primeiro valor
  vence: um override precisa vir antes do `Host *` ou na linha de comando.
- Conferir que a porta NÃO está pública diretamente: de fora do VPS,
  `Test-NetConnection <ip> -Port 8090` deve falhar; no VPS, `ss -ltn | grep :8090` deve
  mostrar só `127.0.0.1:8090`.

### Outras notas

- **Só a Kaguya tem tools de domínio externo** — `list_events_today` (que vive em
  `/mcp/calendar`) não existe nessas sessões. A skill global `kaguya-tarefas`
  (`~/.claude/skills/`, fora deste repo) já considera isso e roteia compromissos para
  `create_task(type="event")` — sem ela, um agente frio criava a reunião direto no Google
  Calendar (medido em set/2026: 2 de 2; com a skill, 0 de 3).
- **Memória do VPS**: 3,9 GB. Em 2026-09-21 o host ficou sem memória e reiniciou logo depois
  de um push na `master` (causa não determinada); foi criado um `/swapfile` de 2 GB.
  Todo push na `master` dispara o deploy automático do compose (rebuild + recriação dos
  containers), e como o build context é a raiz do repo (`COPY . .`), até mudança só de doc
  reconstrói as camadas finais das imagens.

---

## Como adicionar um domínio novo (histórico da Etapa E6 — os 9 já estão migrados)

Passo a passo usado para migrar Nami/Kaguya (E1) e depois Frieren, Akane, Komi, Marin,
Mai, Lucy, Kurisu (E6) — só relevante de novo se algum domínio futuro for adicionado ao
projeto:

1. Criar `agents/<nome>/toolset.py` com `TOOLS: list[Callable]` (extrair da lista de
   `agent.py`, mesmo padrão de `agents/nami/toolset.py`).
2. Adicionar a entrada em `registry.py::DOMAINS`.
3. Remover o agente correspondente de `_LEGACY_DOMAIN_AGENTS` em `legacy.py`.
4. Adicionar o bloco `mcp_servers:` correspondente em `hermes/config.yaml`.
5. Testar `tools/list` em `/mcp/<nome>` (local e, se possível, em produção como acima).
