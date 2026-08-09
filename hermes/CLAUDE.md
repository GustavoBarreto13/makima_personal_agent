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
`mcp_servers/makima/CLAUDE.md`. O que falta é só instalar o Hermes de verdade e apontar
o `config.yaml` dele pra `http://makima-mcp:8090/mcp/<domínio>`.

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
mesma API do Telegram) — isso não mudou com a troca de profile para app separada. Siga a
ordem do runbook abaixo: pare o `makima` (coordinator) ANTES de subir a app do Hermes com
o mesmo token, e tenha o rollback pronto (parar Hermes, religar `makima`) caso algo
falhe.

## Como ativar o Hermes via Dokploy (app separada)

1. No mesmo projeto Dokploy que já hospeda a stack principal (`makima`, `mcp`, `web`,
   `scheduler`), criar uma nova aplicação do tipo **Docker Compose**, apontando para
   este repositório, com o caminho do compose file setado para
   `docker-compose.hermes.yml` (não o `docker-compose.yml` da raiz).
2. Na aba **Environment** dessa nova app, configurar `TELEGRAM_BOT_TOKEN`,
   `GEMINI_API_KEY`, `MAKIMA_MCP_TOKEN` (e `DISCORD_BOT_TOKEN` quando a Etapa E4
   começar) — reusando as **Shared Variables** do projeto, se já estiverem populadas
   para a stack principal, ou colando os valores direto.
3. **O cutover em si** (ação em tempo real, não automatizável): no Dokploy, **parar a
   app `makima`** (stack principal) primeiro, confirmar que parou, **só então iniciar**
   a nova app do Hermes. Nunca os dois rodando ao mesmo tempo com o mesmo
   `TELEGRAM_BOT_TOKEN`.
4. Validar seguindo os 4 passos da Etapa E3 em
   `specs/064-hermes-multicanal/quickstart.md` contra o Telegram real.
5. **Rollback**: parar a app do Hermes, religar a app `makima` — mesmo mecanismo de
   antes, só que pelos botões do Dokploy em vez de `docker compose up -d makima`.

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

Também confirmado pela doc oficial: interpolação `${VAR}` funciona diretamente dentro de
qualquer valor do `config.yaml`, inclusive `api_key` — por isso o `config.yaml` agora
seta `api_key: "${GEMINI_API_KEY}"` explicitamente no bloco `model`, em vez de depender
de um pickup implícito via `OPENAI_API_KEY` (que era uma suposição, nunca confirmada).

## ⚠️ Verificação pendente (não testável neste ambiente de desenvolvimento)

Nenhum destes arquivos foi validado contra uma instância real do Hermes — este ambiente
não tem Docker nem acesso à imagem oficial. Antes do primeiro boot em produção:

1. ~~Confirmar o schema exato de `config.yaml`~~ — **schema de `model`/`mcp_servers`/
   `platforms` confirmado** contra a doc oficial (ver changelog acima). Ainda pendente:
   os blocos `tools.terminal` e `profile: default` (não cobertos pela doc consultada) e
   a nidificação de `whatsapp`/`discord` sob `platforms:` (inferida, não confirmada
   linha a linha) — checar com `hermes config get` / `hermes --help` no primeiro boot.
2. **Validar cedo o tool-calling do Gemini Flash através do endpoint OpenAI-compatible**
   com a superfície completa de tools do MCP `nami`+`kaguya` (~106 tools) — research.md
   chama isso de "o maior risco técnico do plano inteiro". Se não funcionar de forma
   confiável, os planos B (OpenRouter, Nous Portal) descritos em
   `specs/064-hermes-multicanal/research.md` são o próximo passo, não uma reescrita.
3. ~~Gerar um `MAKIMA_MCP_TOKEN` novo~~ — **feito**: gerado e cadastrado no Environment
   do Dokploy (compartilhado por todos os serviços da stack), confirmado funcionando em
   produção (`401` sem token, `200` com token correto). O `config.yaml` deste diretório
   já referencia `${MAKIMA_MCP_TOKEN}` — a interpolação `${VAR}` dentro do `config.yaml`
   é suportada pela doc oficial, então só falta confirmar na prática no primeiro boot.
4. **`allowed_users` do Telegram ainda é placeholder** (`platforms.telegram.allowed_users`
   em `config.yaml`) — preencher com o chat_id real antes do cutover. Descobrir pelo
   mesmo truque já documentado em `scheduler/CLAUDE.md` para `TELEGRAM_ALERT_CHAT_ID`:
   mandar uma mensagem ao bot e ler `https://api.telegram.org/bot<TOKEN>/getUpdates`.
5. WhatsApp: parear via QR code (`hermes whatsapp` ou `hermes gateway setup` dentro do
   container) com um número dedicado — não o número pessoal do usuário.
6. Discord: criar o app/bot, ligar "Message Content Intent" + "Server Members Intent",
   convidar o bot, configurar `DISCORD_BOT_TOKEN` + a allowlist em `config.yaml`.

Ver `specs/064-hermes-multicanal/quickstart.md` (Etapas E3/E4) para o roteiro completo
de validação manual.
