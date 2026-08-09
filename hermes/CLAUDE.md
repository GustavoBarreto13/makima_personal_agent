# CLAUDE.md — hermes/

Arquivos versionados do Hermes Agent (Etapa E3/E4 da spec 064). **Nenhum destes arquivos
é lido automaticamente** — são templates copiados/mesclados manualmente em
`$HERMES_HOME` (`/opt/data` dentro do container `makima-hermes`, volume nomeado
`hermes_data`) na primeira configuração, ou montados como bind mount read-only via
`docker-compose.yml` (ver serviço `hermes`, perfil `hermes`).

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

## ⚠️ Antes de ativar o serviço `hermes`

O serviço está atrás do perfil `hermes` do Docker Compose — **não inicia** com um
`docker compose up -d` comum, só com `docker compose --profile hermes up -d hermes`.
Isso é proposital: ativar o Hermes com o MESMO `TELEGRAM_BOT_TOKEN` que o bot antigo
(`makima`/coordinator) ainda está usando causa **conflito real** (dois processos
disputando `getUpdates` da mesma API do Telegram). Siga a ordem do `quickstart.md`
(Etapa E3): pare o `makima` (coordinator) ANTES de subir o `hermes` com o mesmo token, e
tenha o rollback pronto (`docker compose up -d makima`) caso algo falhe.

## O que está aqui

| Arquivo | Papel | Estático/dinâmico |
|---|---|---|
| `config.yaml` | mcp_servers (nami/kaguya/calendar/legacy), model provider (Gemini via endpoint OpenAI-compatible), canais (telegram/whatsapp/discord) | Estático — versionado |
| `SOUL.md` | Persona da Makima, portada de `coordinator/agent.py::_MAKIMA_INSTRUCTION` | Estático — versionado |
| `skills/nami-financas/SKILL.md` | Regras de comportamento do domínio Nami | Estático — versionado |
| `skills/kaguya-tarefas/SKILL.md` | Regras de comportamento do domínio Kaguya | Estático — versionado |
| `MEMORY.md`, `USER.md`, `sessions.db`, `platforms/whatsapp/session/` | Memória de longo prazo, sessões, pareamento WhatsApp | **Não existem aqui** — vivem só no volume `hermes_data`, nunca versionados |

## ⚠️ Verificação pendente (não testável neste ambiente de desenvolvimento)

Nenhum destes arquivos foi validado contra uma instância real do Hermes — este ambiente
não tem Docker nem acesso à imagem oficial. Antes do primeiro boot em produção:

1. Confirmar o schema exato de `config.yaml` da versão instalada (`hermes config get`
   ou `hermes --help`) — a documentação pública pode ter mudado desde que este arquivo
   foi escrito.
2. **Validar cedo o tool-calling do Gemini Flash através do endpoint OpenAI-compatible**
   com a superfície completa de tools do MCP `nami`+`kaguya` (~106 tools) — research.md
   chama isso de "o maior risco técnico do plano inteiro". Se não funcionar de forma
   confiável, os planos B (OpenRouter, Nous Portal) descritos em
   `specs/064-hermes-multicanal/research.md` são o próximo passo, não uma reescrita.
3. ~~Gerar um `MAKIMA_MCP_TOKEN` novo~~ — **feito**: gerado e cadastrado no Environment
   do Dokploy (compartilhado por todos os serviços da stack), confirmado funcionando em
   produção (`401` sem token, `200` com token correto). O `config.yaml` deste diretório
   já referencia `${MAKIMA_MCP_TOKEN}` — só falta interpolar de verdade quando o Hermes
   subir (verificar se o `config.yaml` do Hermes suporta essa sintaxe de env var; se
   não, substituir pelo valor literal ao copiar o template pro volume).
4. WhatsApp: parear via QR code (`hermes whatsapp` ou `hermes gateway setup` dentro do
   container) com um número dedicado — não o número pessoal do usuário.
5. Discord: criar o app/bot, ligar "Message Content Intent" + "Server Members Intent",
   convidar o bot, configurar `DISCORD_BOT_TOKEN` + a allowlist em `config.yaml`.

Ver `specs/064-hermes-multicanal/quickstart.md` (Etapas E3/E4) para o roteiro completo
de validação manual.
