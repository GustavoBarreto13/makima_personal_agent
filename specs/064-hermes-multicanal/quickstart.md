# Quickstart: validação end-to-end

Guia de validação por etapa. Ver `spec.md` para os critérios de aceite de cada user story e
`contracts/mcp-servers.md` para o formato dos endpoints.

## Pré-requisitos

- `.env` local com `DATABASE_URL`, `GEMINI_API_KEY`, `MAKIMA_MCP_TOKEN` (novo, gerar um
  valor aleatório), `TELEGRAM_BOT_TOKEN`
- Docker + Docker Compose
- Node.js instalado localmente se for testar o instalador do Hermes fora de container

## Etapa E1 — Porta MCP (Nami + Kaguya)

```bash
docker compose up -d web mcp
curl -H "Authorization: Bearer $MAKIMA_MCP_TOKEN" http://localhost:8090/mcp/nami
curl http://localhost:8090/mcp/nami   # sem header — MUST retornar 401
npx @modelcontextprotocol/inspector http://localhost:8090/mcp/kaguya
```

**Esperado**: `tools/list` retorna as ~35 tools da Kaguya; criar uma tarefa pelo Inspector
e conferir que ela aparece em `http://localhost:5173` (webapp, tela de tarefas). O bot do
Telegram (`makima-bot`, ainda no ar nesta etapa) continua respondendo normalmente — nada
mudou para o usuário.

## Etapa E2 — Ponte legada

```bash
curl -H "Authorization: Bearer $MAKIMA_MCP_TOKEN" -X POST \
  http://localhost:8090/mcp/legacy/tools/call \
  -d '{"name":"perguntar_makima_legado","arguments":{"mensagem":"quantas páginas li esse mês?","chat_id":"test-user"}}'
```

**Esperado**: resposta coerente vinda da Frieren (domínio ainda não migrado), via o
`Runner` ADK por baixo.

## Etapa E3 — Hermes no Telegram (MVP)

```bash
docker compose up -d mcp hermes
docker exec -it makima-hermes hermes   # chat CLI — confirma modelo e MCP conectados
```

No Telegram (mesmo bot de sempre, token já movido para o Hermes):
1. "gastei 30 no mercado" → confere transação criada no webapp (via `/mcp/nami`)
2. "quantas páginas li esse mês?" → confere resposta via `/mcp/legacy`
3. `docker restart makima-hermes` → perguntar "do que a gente falou?" → histórico e
   `MEMORY.md` sobreviveram
4. Buscar por uma conversa antiga por conteúdo (não por rolagem) → `session_search` funciona

**Rollback se algo falhar**: `docker compose up -d makima` (o `coordinator/` antigo volta a
responder no mesmo token assim que o Hermes for parado).

## Etapa E4 — WhatsApp e Discord

1. `hermes whatsapp` dentro do container → parear via QR code com o número dedicado
2. Configurar app Discord (Message Content Intent + Server Members Intent ligados),
   convidar o bot, setar `DISCORD_BOT_TOKEN` + `DISCORD_ALLOWED_USERS`
3. Mandar a mesma pergunta nos três canais → comparar resposta
4. Criar uma tarefa pelo WhatsApp → conferir no webapp que só uma foi criada
5. Dizer um fato pessoal no Discord ("prefiro respostas curtas") → confirmar que o
   comportamento no Telegram reflete isso depois

## Etapa E5 — Voz e imagem

1. Mandar um áudio de ~10s contando o que fez no dia → confere bullet criado no diário
   (via `/mcp/journal`)
2. Mandar foto de um recibo/nota fiscal legível → confere que o valor extraído bate, e que
   o sistema pede confirmação antes de gravar a transação
3. Mandar um áudio ilegível/ruído → confere que o sistema avisa, não inventa dado

## Etapa E6 — Migração dos domínios restantes (repetir por domínio)

Para cada domínio da lista (Frieren → Akane → Komi → Marin → Mai → Lucy → Kurisu):

```bash
curl -H "Authorization: Bearer $MAKIMA_MCP_TOKEN" http://localhost:8090/mcp/<domínio>
```

1. Uma operação de escrita e uma de leitura pelo canal preferido
2. Mesma operação repetida pela ponte legada antes da migração, para comparar resposta
3. Após migrar, confirmar que o domínio some da lista `sub_agents` da ponte legada

## Etapa E7 — Aposentadoria do ADK

```bash
grep -ri "google.adk" --include="*.py" -r . | grep -v ".venv"   # MUST retornar vazio
```

- Digest matinal da Lucy chega nos três canais (`deliver="all"`)
- Simular falha de um job do scheduler → alerta chega no Telegram mesmo com
  `makima-hermes` parado (`docker stop makima-hermes`)

## Etapa E8 — QoL

- `GET /api/finances/transactions/export` entregue como anexo no chat (`MEDIA:/path`)
- Criar um cron via linguagem natural no chat ("todo domingo 20h...") e confirmar
  execução na data
- Mandar um e-mail para o endereço configurado do Hermes e receber resposta
