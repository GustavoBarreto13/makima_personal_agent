# CLAUDE.md — hermes/

Arquivos versionados do Hermes Agent (Etapa E3/E4 da spec 064). **Nenhum destes arquivos
é lido automaticamente** — são templates copiados/mesclados manualmente em
`$HERMES_HOME` (`/opt/data` dentro do container `makima-hermes`, volume nomeado
`hermes_data`) na primeira configuração, ou montados como bind mount read-only via
`docker-compose.hermes.yml` (ver serviço `hermes` nesse arquivo, separado do
`docker-compose.yml` principal — ver seção abaixo sobre o porquê).

**O backend que o Hermes vai consumir (Etapas E1/E2, `makima-mcp`) já está em produção
e verificado** — `tools/list` correto nos 4 domínios (`nami`/`kaguya`/`calendar`/`legacy`),
`401` sem token, handshake `initialize` completo testado com `curl` real contra a VPS.
Detalhes e os 3 bugs de produção achados/corrigidos no processo:
`mcp_servers/makima/CLAUDE.md`.

**Etapa E3 iniciada**: o Hermes de verdade já está instalado e deployado (app própria no
Dokploy, `docker-compose.hermes.yml`, sem `TELEGRAM_BOT_TOKEN` configurado de propósito —
não conflita com o `makima` em produção). Conectividade MCP, tool-calling e a escolha de
modelo já foram validados ao vivo — ver "Validação de tool-calling em produção" abaixo.
O que falta é só o cutover real do Telegram (parar `makima`, ligar o token no Hermes).

## Desvio do plan.md original: sem `hermes/Dockerfile`

O `plan.md` original previa um `hermes/Dockerfile` próprio. Pesquisa feita durante a
implementação (E1/E2) mostrou que o projeto já publica uma imagem oficial
(`nousresearch/hermes-agent:latest`, também em `ghcr.io/nousresearch/hermes-agent`) que
não precisa de nenhum código deste repo — só dos arquivos de configuração. Por isso o
serviço `hermes` no `docker-compose.yml` usa `image:` diretamente, sem `build:`. Mais
simples e com menos superfície de erro do que reconstruir a imagem oficial (que usa
s6-overlay, um build de SQLite patched, etc. — não vale a pena reimplementar).

Se a versão instalada exigir uma imagem custom no futuro, criar `hermes/Dockerfile`
como `FROM nousresearch/hermes-agent:<tag>` + ajustes mínimos, não do zero.

## Desvio do plan.md original: `docker-compose.hermes.yml` em vez de profile

O plano original gateava o serviço `hermes` atrás de um profile do Docker Compose
(`profiles: ["hermes"]`) dentro do `docker-compose.yml` principal — a ideia era que ele
só subisse com `docker compose --profile hermes up -d hermes`, nunca por acidente junto
com o resto da stack.

Pesquisa feita ao preparar a Etapa E3 mostrou que isso **não funcionaria pelo Dokploy**:
a plataforma só consegue ajustar flags que vêm **depois** de `up` no comando de deploy —
não consegue injetar `--profile hermes`, que precisa vir **antes**
(github.com/Dokploy/dokploy/issues/2327 e #540, ambas abertas/confirmadas). Ou seja, o
gate nunca seria ativável pelo botão de deploy normal do Dokploy.

Fix: o serviço `hermes` virou um arquivo próprio, **`docker-compose.hermes.yml`**, na
raiz do repo (irmão do `docker-compose.yml`, não dentro de `hermes/`). Ele é registrado
como uma **segunda aplicação "Docker Compose" no Dokploy**, dentro do mesmo projeto da
stack principal — start/stop pelos botões nativos do Dokploy, sem depender de profiles.
Continua 100% "deploy só pelo Dokploy": só muda qual botão liga o quê.

## ⚠️ Antes de ativar o serviço `hermes`

Ativar o Hermes com o MESMO `TELEGRAM_BOT_TOKEN` que o bot antigo (`makima`/coordinator)
ainda está usando causa **conflito real** (dois processos disputando `getUpdates` da
mesma API do Telegram). Siga a ordem do runbook abaixo: pare o `makima` (coordinator)
ANTES de subir a app do Hermes com o mesmo token, e tenha o rollback pronto caso algo
falhe.

### Desvio: comentar o serviço em vez de parar a app inteira

`makima`, `mcp`, `web`, `adminer` e `scheduler` vivem no MESMO `docker-compose.yml`, ou
seja, na MESMA aplicação Dokploy — confirmado que o Dokploy **não** tem controle de
start/stop por serviço dentro de uma app Compose, só a app inteira. Parar essa app pra
tirar o `makima` do ar derrubaria o `mcp` (do qual o Hermes depende o tempo todo, não só
durante o cutover) e o `web`/`scheduler`/`adminer` sem necessidade.

Fix: o bloco do serviço `makima` em `docker-compose.yml` fica **comentado** (não
apagado) até a Etapa E7. Redeployar essa app nesse estado recria `mcp`/`web`/
`adminer`/`scheduler` normalmente e não recria o `makima-bot` — mas **não para
sozinho** o container que já está rodando: `docker compose up -d` (o comando padrão do
Dokploy) só gerencia os serviços que estão no arquivo, não remove containers "órfãos" de
serviços que saíram dele (isso só acontece com a flag `--remove-orphans`, que o Dokploy
não adiciona por padrão). Duas formas de resolver isso depois de redeployar com o bloco
comentado:

- Adicionar `--remove-orphans` no comando de deploy dessa app, em Advanced → Custom
  Command do Dokploy (fica permanente, resolve isso e qualquer caso futuro parecido); ou
- Remover o container órfão manualmente uma vez (`docker stop makima-bot` /
  `docker rm makima-bot` via SSH) — não é um "deploy", é limpeza pontual de um container
  que o Dokploy já não gerencia mais depois do redeploy, mas ainda assim só fazer com
  confirmação explícita antes.

**Rollback**: descomentar o bloco `makima` em `docker-compose.yml` e redeployar essa
app de novo.

## Como ativar o Hermes via Dokploy (app separada)

1. No mesmo projeto Dokploy que já hospeda a stack principal (`makima`, `mcp`, `web`,
   `scheduler`), criar uma nova aplicação do tipo **Docker Compose**, apontando para
   este repositório, com o caminho do compose file setado para
   `docker-compose.hermes.yml` (não o `docker-compose.yml` da raiz).
2. Na aba **Environment** dessa nova app, configurar `TELEGRAM_BOT_TOKEN`,
   `GEMINI_API_KEY`, `MAKIMA_MCP_TOKEN`, `TELEGRAM_HERMES_ALLOWED_USER_ID` (e, desde a
   Etapa E4, `DISCORD_BOT_TOKEN` + `DISCORD_HERMES_ALLOWED_USER_ID` — ver seção "Etapa E4"
   abaixo) — reusando as **Shared Variables** do projeto, se já estiverem populadas para
   a stack principal, ou colando os valores direto.
3. **O cutover em si** (ação em tempo real, não automatizável): comentar o serviço
   `makima` em `docker-compose.yml` (ver seção acima) e redeployar a app principal —
   confirmar que o `makima-bot` realmente parou (incl. limpar o órfão se necessário) —
   **só então** iniciar/redeployar a app do Hermes com `TELEGRAM_BOT_TOKEN` configurado.
   Nunca os dois rodando ao mesmo tempo com o mesmo token.
4. Validar seguindo os 4 passos da Etapa E3 em
   `specs/064-hermes-multicanal/quickstart.md` contra o Telegram real.
5. **Rollback**: parar a app do Hermes, descomentar o bloco `makima` em
   `docker-compose.yml` e redeployar a app principal de novo.

## O que está aqui

| Arquivo | Papel | Estático/dinâmico |
|---|---|---|
| `config.yaml` | mcp_servers (nami/kaguya/calendar/legacy), model provider (Gemini via endpoint OpenAI-compatible), canais (telegram/whatsapp/discord) | Estático — versionado |
| `SOUL.md` | Persona da Makima, portada de `coordinator/agent.py::_MAKIMA_INSTRUCTION` | Estático — versionado |
| `skills/nami-financas/SKILL.md` | Regras de comportamento do domínio Nami | Estático — versionado |
| `skills/kaguya-tarefas/SKILL.md` | Regras de comportamento do domínio Kaguya | Estático — versionado |
| `MEMORY.md`, `USER.md`, `sessions.db`, `platforms/whatsapp/session/` | Memória de longo prazo, sessões, pareamento WhatsApp | **Não existem aqui** — vivem só no volume `hermes_data`, nunca versionados |

## Changelog de correções de schema (`config.yaml`)

Ao preparar a Etapa E3, busquei a documentação pública oficial
(hermes-agent.nousresearch.com, consultada em 09/ago/2026) e encontrei 3 divergências
entre o template original e o schema real — corrigidas no `config.yaml` deste diretório:

1. `mcp_servers` era uma **lista** de `{name, url, headers}` — o schema real é um
   **dict chaveado por nome** (`mcp_servers.nami.url`, `mcp_servers.nami.headers`, ...).
2. O campo do identificador do modelo dentro de `model:` era `name:` — o campo real é
   `model:` (nome da chave igual ao do bloco pai, mas aninhado: `model.model`).
3. `telegram`/`whatsapp`/`discord` estavam soltos no top-level — o schema real aninha
   os três sob um wrapper `platforms:` (`platforms.telegram`, `platforms.whatsapp`,
   `platforms.discord`). A nidificação de `whatsapp`/`discord` especificamente é
   inferida por convenção a partir do schema confirmado do `telegram` — não checada
   linha a linha na doc.

**4ª divergência, achada só depois do cutover** (a doc pública não bate com o código
instalado — a própria doc do Hermes admite inconsistência nisso): o campo de allowlist
por canal era `allowed_users:` — o código real (`plugins/platforms/telegram|discord|
whatsapp/adapter.py` dentro do container, lido diretamente em produção) espera
`allow_from:`. `allowed_users:` era ignorado **silenciosamente**, sem erro — só um
WARNING genérico no boot ("No env user allowlists configured"). Consequência real: o
Telegram ficou "✓ configured" (token certo) mas **negando todo mundo**, inclusive o
próprio usuário, até essa correção — nunca abriu acesso indevido, porque o fallback do
Hermes sem allowlist é fail-closed por padrão (comentário explícito no código-fonte:
"Fail-closed: no allowlist means deny by default... must not silently allow everyone",
referência a um fix de bug anterior deles, #24457).

**5ª divergência, achada testando de verdade no Telegram (⚠️ conclusão CORRIGIDA depois —
ver abaixo)**: mesmo com `allow_from:` direto sob `telegram:`, o usuário real foi
bloqueado. Na hora, concluí (errado) que `allow_from:` precisava ficar aninhado sob
`extra:`. Isso não é falso — as duas formas funcionam (`gateway/config.py`,
`_merge_platform_map`, faz o bridge automático do nível de cima pro `.extra` em
runtime) — mas **não era a causa do bloqueio**. Deixei o `config.yaml` com
`platforms.telegram.extra.allow_from` porque é a forma mais explícita, mas a raiz real
do problema era outra (ver "causa raiz" abaixo).

**6ª divergência — investigação longa que terminou em conclusão ERRADA, corrigida depois
de subir o dashboard web (ver seção própria mais abaixo)**. Documentei aqui, por um bom
tempo, que `allow_from`/pairing "continuavam não funcionando" mesmo com config, env var
e pareamento aprovado todos corretos — e cheguei a suspeitar de bug no produto
(`NousResearch/hermes-agent`) ou de uma migração de config nunca aplicada (aviso
"Config version outdated (v0 → v33)"). **Essa suspeita estava errada.**

### Causa raiz real do bloqueio (confirmada)

`plugins/platforms/telegram/adapter.py`, `_is_user_authorized_from_message`:

```python
adapter_allow_from = self.config.extra.get("allow_from")
if adapter_allow_from is not None:
    allowed = _coerce_allow_set(adapter_allow_from)
    authorized = user_id in allowed or "*" in allowed   # ← autoridade ÚNICA
```

Quando `allow_from` **existe** no config (não é `None`), ele é a autoridade **única** —
o código nem chega a olhar `TELEGRAM_ALLOWED_USERS` (env var) nem o resultado do
pareamento. Isso por si só já explica por que testar cada peça isoladamente (o que fiz
exaustivamente, rodando `_platform_gate_env`, `_coerce_allow_set`, etc. direto no
container) sempre dava "certo": elas nunca eram sequer consultadas.

A causa raiz de verdade, achada lendo `hermes config get platforms.telegram --json` em
produção:

```json
{"extra": {"allow_from": ["${TELEGRAM_HERMES_ALLOWED_USER_ID}"]}}
```

**`TELEGRAM_HERMES_ALLOWED_USER_ID` nunca foi cadastrada no Environment da app Hermes no
Dokploy.** Sem a env var, `${TELEGRAM_HERMES_ALLOWED_USER_ID}` não interpola — vira uma
string literal, que não é `None`, então `allow_from` continua sendo a autoridade única,
mas agora contendo um valor que nunca vai bater com nenhum `user_id` real. Resultado:
nega todo mundo, silenciosamente, incluindo o próprio dono do bot — exatamente o sintoma
observado (`[Telegram] Blocked unauthorized user 352608961`), mesmo com
`TELEGRAM_ALLOWED_USERS` certo e pareamento aprovado, porque nenhum dos dois chega a ser
consultado.

Confirmado com um teste direto (a variável setada manualmente no `docker exec`, não no
Dokploy, só pra validar a interpolação):

```bash
docker exec -e TELEGRAM_HERMES_ALLOWED_USER_ID=352608961 makima-hermes \
  hermes config get platforms.telegram --json
# → {"extra": {"allow_from": ["352608961"]}}   ✅
```

**Fix aplicado**: `TELEGRAM_HERMES_ALLOWED_USER_ID=352608961` cadastrada no Environment
real da app Hermes no Dokploy; `GATEWAY_ALLOW_ALL_USERS` removida. Nenhuma mudança de
`config.yaml` foi necessária — o arquivo já estava certo, só faltava a env var que ele
referenciava.

**Lição pra não repetir**: quando um valor `${VAR}` no `config.yaml` não interpola
porque a env var está ausente, o Hermes **não erra nem avisa** — ele segue com a string
literal como se fosse um valor válido. Ao adicionar qualquer `${VAR}` novo em
`config.yaml`, checar com `hermes config get <caminho> --json` que ele virou o valor
esperado, não a string `${...}` — esse é o sintoma silencioso a procurar primeiro da
próxima vez, antes de qualquer investigação de código.

**Workaround antigo, agora desligado**: `GATEWAY_ALLOW_ALL_USERS=true` ficou em produção
por um tempo como bypass de emergência (bypassava toda a lógica de allow_from/pairing/env
var, autorizando qualquer remetente) enquanto a causa raiz acima não tinha sido
encontrada — documentado então como uma lacuna de segurança real (o Hermes mexe em
finanças e email pessoal). Removida assim que `TELEGRAM_HERMES_ALLOWED_USER_ID` foi
cadastrada e o allowlist de verdade confirmado funcionando (ver Verificação pendente).

Também confirmado pela doc oficial: interpolação `${VAR}` funciona diretamente dentro de
qualquer valor do `config.yaml`, inclusive `api_key` — por isso o `config.yaml` agora
seta `api_key: "${GEMINI_API_KEY}"` explicitamente no bloco `model`, em vez de depender
de um pickup implícito via `OPENAI_API_KEY` (que era uma suposição, nunca confirmada).

## Validação de tool-calling em produção (09/ago/2026)

Com a app Hermes deployada no Dokploy (sem `TELEGRAM_BOT_TOKEN` — não conflita com o
`makima` em produção), testei ao vivo via `docker exec makima-hermes hermes chat -q "..."
-Q` (modo não-interativo, sem tocar no Telegram real, só perguntas de leitura pra não
arriscar gravar dado errado no Postgres de produção).

**Conectividade confirmada**: `hermes mcp test nami/kaguya/calendar/legacy` — os 4
domínios `✓ Connected`; Nami descobriu as 60 tools esperadas (mesmo número já verificado
em `mcp_servers/makima/CLAUDE.md`). `hermes config get tools` confirma
`tools.terminal.enabled: false` respeitado (o aviso do `hermes doctor` sobre "terminal ✓
available" é só sobre disponibilidade técnica do módulo, não sobre estar habilitado pro
agente — falso alarme).

**Achado principal — o maior risco técnico do plano (research.md) era real**: o Hermes
usa um sistema próprio de "tool_search" com carregamento adiado — de ~166 tools totais,
só 28-31 "core" ficam no schema nativo de function-calling enviado ao modelo; o resto
(todas as nossas tools MCP) fica atrás de uma tool genérica `tool_call(name, arguments)`,
e o modelo precisa consultar (`tool_describe`) ou lembrar o schema exato em vez de ter
validação de schema nativa forçada pela API. Com **`gemini-2.5-flash`**: tools sem
argumento (`list_accounts`) sempre funcionaram; a única tool testada com 2 argumentos
obrigatórios (`perguntar_makima_legado`, a ponte legada) falhou em 3 de 5 tentativas —
1x nem tentou chamar (alucinou resposta), 2x chamou com nome de argumento errado e não
tentou de novo mesmo o erro dizendo exatamente o que corrigir.

**Comparação de modelos** (mesmas perguntas, `-m <modelo>`): `gemini-3.5-flash` foi
**pior** nesse teste — 0 de 3 tentativas chamou a ponte legada, preferindo responder
direto (às vezes com números batendo com uma chamada bem-sucedida anterior, sugerindo uso
da memória persistente do Hermes em vez de reinvocar a tool). **`gemini-3.6-flash`**
(mais novo, GA desde jul/2026) foi **consistentemente melhor**: 2 de 2 chamadas à ponte
legada funcionaram (filmes via Akane, livros via Frieren — ambos com dado real,
prefixados com a persona certa), e um trace verboso confirmou o motivo — antes de chamar
`get_account_balance`, ele **consultou o schema com `tool_describe`** e **resolveu o
nome da conta ("Itaú") via `list_accounts()` primeiro**, exatamente o comportamento
documentado em `skills/nami-financas/SKILL.md` ("use list_accounts() para resolver
nomes"). Resultado real do banco (`saldo_atual: 0.0`) confirmado via trace, não chute.

**Decisão**: `hermes/config.yaml` usa `model.model: gemini-3.6-flash`, não
`gemini-2.5-flash` — mais confiável nos testes acima, e evita de quebra a migração
forçada do 2.5-flash, que **desliga em 16/out/2026** (achado à parte da pesquisa —
afeta o projeto inteiro, não só o Hermes; migrar os agentes ADK do `coordinator/` é uma
frente separada, fora do escopo desta spec).

Amostra pequena (n=5 no pior caso) — se depois do cutover real aparecerem falhas
recorrentes de tool-calling mesmo com `gemini-3.6-flash`, os planos B (OpenRouter, Nous
Portal, incl. o próprio modelo "Hermes" da Nous Research — família de LLM diferente do
"Hermes Agent", o gateway) descritos em `specs/064-hermes-multicanal/research.md` são o
próximo passo, não uma reescrita.

## ⚠️ Verificação pendente

1. ~~Confirmar o schema exato de `config.yaml`~~ — **schema de `model`/`mcp_servers`/
   `platforms` confirmado** contra a doc oficial e validado ao vivo (ver acima). Ainda
   pendente: os blocos `tools.terminal` e `profile: default` (não cobertos pela doc
   consultada) e a nidificação de `whatsapp`/`discord` sob `platforms:` (inferida, não
   testada ao vivo ainda — só `telegram`/nenhum canal foi exercitado até agora).
2. ~~Validar cedo o tool-calling do Gemini Flash~~ — **feito, ver acima**. Resultado:
   `gemini-2.5-flash` não é confiável o suficiente para tools com argumentos obrigatórios
   nesta arquitetura; `gemini-3.6-flash` foi. Reavaliar se surgirem falhas recorrentes
   após o cutover real.
3. ~~Gerar um `MAKIMA_MCP_TOKEN` novo~~ — **feito**: gerado e cadastrado no Environment
   do Dokploy (compartilhado por todos os serviços da stack), confirmado funcionando em
   produção (`401` sem token, `200` com token correto, e agora também confirmado
   funcionando de dentro do próprio Hermes via `hermes mcp test`).
4. ~~`allowed_users`/`allow_from`/pairing~~ — **resolvido**: causa raiz era
   `TELEGRAM_HERMES_ALLOWED_USER_ID` ausente do Environment da app Hermes no Dokploy (ver
   "Causa raiz real do bloqueio" acima). chat_id real (`352608961`) descoberto lendo a
   tabela `sessions` do Postgres — `SELECT DISTINCT user_id, COUNT(*), MAX(update_time)
   FROM sessions GROUP BY user_id ORDER BY MAX(update_time) DESC;` — `user_id` é o
   `chat_id` puro, ver `coordinator/CLAUDE.md` (método melhor que `getUpdates`: com o
   `makima` fazendo long-polling o tempo todo, `getUpdates` manual sempre volta vazio).
   Fix: variável cadastrada, `GATEWAY_ALLOW_ALL_USERS` removida, confirmado com mensagem
   real no Telegram sem bloqueio.
5. WhatsApp: parear via QR code (`hermes whatsapp` dentro do container) com um número
   dedicado — não o número pessoal do usuário. Ver seção "Etapa E4" abaixo.
6. Discord: criar o app/bot, ligar "Message Content Intent" + "Server Members Intent",
   convidar o bot, configurar `DISCORD_BOT_TOKEN` + a allowlist. Ver seção "Etapa E4"
   abaixo.

Ver `specs/064-hermes-multicanal/quickstart.md` (Etapas E3/E4) para o roteiro completo
de validação manual.

## Etapa E4 — WhatsApp e Discord

Pesquisado lendo o código real dentro do container (mesma abordagem que destravou o
Telegram — a doc pública não é confiável). **Achado principal**: WhatsApp e Discord têm
modelos de autorização **diferentes entre si**, e diferentes do Telegram.

### WhatsApp — conector Baileys (sessão WhatsApp Web)

Sem token declarativo — autenticação é uma sessão pareada por QR code, persistida em
`$HERMES_HOME/whatsapp/session/creds.json` (dentro do volume `hermes_data`, sobrevive a
redeploy). O bridge Node (Baileys) roda dentro do próprio container `makima-hermes` (a
imagem já traz Node/npm); na primeira execução ele se auto-instala (`npm install` do
`scripts/whatsapp-bridge/`), mirrorando pra `$HERMES_HOME/scripts/whatsapp-bridge` se
`/opt/hermes` estiver read-only.

**Mesmo risco de autoridade única do Telegram, confirmado no código-fonte**
(`plugins/platforms/whatsapp/adapter.py`): `config.extra.allow_from`, quando a CHAVE
existe (mesmo vazia), tem precedência sobre `WHATSAPP_ALLOWED_USERS` (env var) — mesmo
comentário do próprio código, "select by key *presence*". **Decisão**: `config.yaml`
deste repo **não declara `extra.allow_from` para o whatsapp de propósito** — evita
repetir o lockout silencioso que aconteceu no Telegram por um `${VAR}` não interpolado.
A allowlist do WhatsApp é definida só pelo wizard interativo (abaixo), que grava
`WHATSAPP_ALLOWED_USERS` direto no `$HERMES_HOME/.env` do volume — nunca precisa de
`${VAR}` no `config.yaml`, então não tem essa classe de bug pra acontecer.

`dm_policy` (padrão `"pairing"`) mantém o fail-closed-com-pareamento mesmo sem allowlist
nenhuma configurada — mesmo comportamento seguro por padrão que o Telegram tinha antes
do `allow_from` entrar em cena.

**Como parear (passo manual, interativo — requer TTY real e a câmera do celular; não dá
pra automatizar por aqui)**:

```bash
ssh <vps>
docker exec -it makima-hermes hermes whatsapp
```

1. Escolher modo **1 — Separate bot number** (recomendado pelo `research.md` desta spec —
   número dedicado, nunca o pessoal do usuário; WhatsApp Business no celular do número
   dedicado, "Aparelhos conectados" funciona igual ao WhatsApp Web comum).
2. Informar o número autorizado a falar com o bot (o número PESSOAL do usuário, formato
   internacional sem símbolos, ex. `5511999999999`) — grava `WHATSAPP_ALLOWED_USERS`.
3. Instala as dependências do bridge (só na primeira vez, alguns minutos).
4. Mostra o QR code em ASCII no terminal — escanear pelo WhatsApp do número DEDICADO
   (Aparelhos conectados → Conectar um aparelho) dentro de ~60s antes de expirar.
5. Confirma "WhatsApp is configured and paired!" e grava `WHATSAPP_ENABLED=true`.

**Depois de parear**: `docker restart makima-hermes` — o wizard roda como um processo
`docker exec` separado do `gateway run` principal (que já estava de pé), e o
`gateway run` só lê `$HERMES_HOME/.env` uma vez, no próprio boot (`gateway/run.py`,
`load_hermes_dotenv`). Sem o restart, o `WHATSAPP_ENABLED`/`WHATSAPP_ALLOWED_USERS`
recém-gravados não são vistos pelo processo já rodando (mesma classe de "config muda,
container não recarrega sozinho" já documentada acima para o `config.yaml`).

**Verificar**: `hermes status` → `WhatsApp ✓ configured`; mandar mensagem de teste do
número autorizado pro número do bot.

### Discord — bot via API oficial

Token declarativo (`DISCORD_BOT_TOKEN`), sem CLI de pareamento — a maior parte da
configuração é externa, no Discord Developer Portal (não automatizável, ação do usuário):

1. **discord.com/developers/applications** → New Application → aba **Bot** → criar o
   bot, copiar o token (`DISCORD_BOT_TOKEN`).
2. Nessa mesma aba **Bot** → **Privileged Gateway Intents**: ligar **Message Content
   Intent** (obrigatório — confirmado em `plugins/platforms/discord/adapter.py`,
   `intents.message_content = True` incondicional) e **Server Members Intent** (só
   necessário se for usar allowlist por cargo/role em vez de user ID — opcional pro
   uso pessoal).
3. **OAuth2 → URL Generator**: scope `bot`, permissões mínimas (Send Messages, Read
   Message History) → gerar o link de convite e adicionar o bot num servidor próprio
   (ou usar DM direto com o bot, sem servidor).
4. Descobrir o próprio Discord user ID: no cliente Discord, Configurações → Avançado →
   Modo desenvolvedor (ligar) → clicar com o botão direito no seu nome → "Copiar ID".

**Autorização — modelo DIFERENTE do Telegram/WhatsApp, mais seguro por padrão**:
`plugins/platforms/discord/adapter.py::_is_allowed_user` usa semântica **OR**, não
autoridade única — o pareamento (`hermes pairing approve`) é checado **primeiro e
incondicionalmente**, antes até de olhar `allow_from`/`DISCORD_ALLOWED_USERS`. Ou seja,
mesmo que `${DISCORD_HERMES_ALLOWED_USER_ID}` fique sem interpolar por engano, o
pareamento continua disponível como rede de segurança — não é o mesmo risco de lockout
total do Telegram/WhatsApp. Ainda assim, `config.yaml` já declara
`platforms.discord.extra.allow_from: ["${DISCORD_HERMES_ALLOWED_USER_ID}"]` — cadastrar a
variável no Environment do Dokploy é o caminho normal (evita depender só do pareamento).

**Environment da app Hermes no Dokploy, a adicionar**:

| Variável | Valor |
|---|---|
| `DISCORD_BOT_TOKEN` | token copiado no passo 1 |
| `DISCORD_HERMES_ALLOWED_USER_ID` | seu Discord user ID (passo 4) |

Depois de cadastrar e redeployar: mandar uma DM pro bot ou mencioná-lo num canal do
servidor onde foi convidado. Se `DISCORD_HERMES_ALLOWED_USER_ID` ainda não tiver
propagado, o pareamento intercepta e oferece o fluxo normal (`hermes pairing approve`).

### Resumo do que é automatizável vs. manual

| Parte | Quem faz |
|---|---|
| `config.yaml` (schema, comentários, decisão de não usar `allow_from` no WhatsApp) | já feito neste repo |
| `docker-compose.hermes.yml` (nenhuma mudança extra necessária — token/allowlist são só env vars ou ficam no volume) | já feito neste repo |
| Criar o app/bot no Discord Developer Portal, copiar token, achar o próprio user ID | manual — só o usuário tem a conta Discord |
| Cadastrar `DISCORD_BOT_TOKEN` + `DISCORD_HERMES_ALLOWED_USER_ID` no Environment do Dokploy + redeploy | manual — mesma aba Environment já usada pro Telegram |
| Rodar `hermes whatsapp` e escanear o QR code | manual — precisa de TTY real + câmera do celular, não dá pra automatizar por SSH sem interação em tempo real |
| `docker restart makima-hermes` depois do pareamento do WhatsApp | pode ser feito por qualquer um dos dois, mediante confirmação (ação real, não é deploy) |

## Dashboard web

A imagem oficial já traz um dashboard web (React, servido pelo próprio processo
`gateway run` via um serviço s6 chamado `dashboard`, desligado por padrão). Não precisa
de build nem de outro container — só ligar por env var.

**Environment da app Hermes no Dokploy:**

| Variável | Valor |
|---|---|
| `HERMES_DASHBOARD` | `true` |
| `HERMES_DASHBOARD_BASIC_AUTH_USERNAME` | usuário do login |
| `HERMES_DASHBOARD_BASIC_AUTH_PASSWORD` | senha forte — é a **única** barreira num deploy com subdomínio público, ver aviso abaixo |
| `HERMES_DASHBOARD_BASIC_AUTH_SECRET` | 32+ bytes aleatórios — sem isso a sessão de login não sobrevive a um restart do container |
| `HERMES_DASHBOARD_PUBLIC_URL` | `https://hermes.<domínio>` — necessário atrás de reverse proxy pro dashboard montar as URLs certas |

**Acesso** — subdomínio via Traefik/Dokploy (mesmo caminho do `makima-web`, que já roda em
`makima.<domínio>`): registro DNS tipo A `hermes` → IP da VPS **precisa propagar antes**
do deploy, senão o Let's Encrypt falha a validação; depois, Dokploy → app Hermes → aba
**Domains** → Container Port `9119`. `docker-compose.hermes.yml` também publica
`127.0.0.1:9119:9119` como plano B via túnel SSH (`ssh -N -L 9119:127.0.0.1:9119 <vps>` →
`http://127.0.0.1:9119`), útil pra isolar se um problema é do Traefik/cert ou do Hermes.

⚠️ **O que expor publicamente muda**: o dashboard não é só um visualizador de log — as
páginas **Env**, **Config**, **Sessions** e **Chat** mostram variáveis de ambiente, a
config completa e o histórico de conversas, além de dar acesso ao agente. O gate de auth
é fail-closed (sem usuário+senha configurados, o servidor recusa subir em bind não-
loopback), então não tem como expor por acidente sem senha — mas senha fraca aqui
equivale a nenhuma. O próprio código do Hermes documenta o motivo do endurecimento
(jun/2026): dashboards públicos sem auth foram porta de entrada de uma campanha de
persistência via config de MCP.

⚠️ **`config.yaml` é bind mount `:ro`** — a página Config do dashboard mostra a config
real, mas qualquer tentativa de salvar por lá falha (de propósito). Mudança de config
continua sendo: editar `hermes/config.yaml` neste repo + deploy pelo Dokploy.

Páginas mais úteis pra depurar problemas de canal/autorização: **Logs** (agent/errors/
gateway, com filtro por nível e componente — o mesmo conteúdo de `hermes logs`, mas sem
precisar de SSH), **Channels**, **Pairing**, **MCP** (status de conexão dos 4 domínios).
