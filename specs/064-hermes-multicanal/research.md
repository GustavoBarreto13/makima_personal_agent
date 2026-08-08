# Phase 0 Research: Hermes Agent — multicanal, memória e mídia

## 1. Transporte MCP: HTTP streamável vs. stdio

**Decision**: montar cada domínio como um servidor `FastMCP` independente, exposto via
HTTP streamável (`streamable_http_app()`), hospedado num único processo Starlette/uvicorn
(`mcp_servers/makima/app.py`), atrás de bearer token, só na rede interna.

**Rationale**: o Hermes só fala MCP como cliente — não spawna processos filhos arbitrários
do repo. O padrão stdio atual (`mcp_servers/calendar/server.py`, spawnado pelo ADK via
`McpToolset`) só funciona porque o ADK e o servidor MCP vivem no mesmo processo/host
Python. Com o Hermes rodando em container próprio, o transporte precisa cruzar a rede —
HTTP é a opção suportada.

**Alternatives considered**:
- *Manter stdio e rodar o Hermes no mesmo container que os agentes*: rejeitado — acopla o
  runtime do Hermes (Node + Python + instalador próprio) ao runtime dos agentes,
  contrariando o padrão de 1 serviço = 1 Dockerfile já estabelecido no repo (scheduler,
  webapp).
- *Expor cada domínio como processo MCP separado (10 containers)*: rejeitado por
  overhead operacional desproporcional ao ganho — um único processo host com N objetos
  `FastMCP` montados sob paths diferentes atende ao mesmo isolamento lógico
  (`tools.include` por servidor) sem multiplicar containers.

## 2. Versão da lib `mcp` e API HTTP streamável

**Decision**: pinar `mcp>=1.9` em `requirements.txt` e confirmar a assinatura de
`streamable_http_app()` (ou equivalente da versão instalada) antes de escrever
`mcp_servers/makima/app.py` — não assumir a API sem checar o changelog da versão exata
resolvida pelo pip no momento da implementação.

**Rationale**: a biblioteca `mcp` (SDK oficial do protocolo) evoluiu rápido; a extensão
HTTP streamável é relativamente recente em relação ao transporte stdio já usado no repo.
Pinning explícito evita quebra silenciosa em redeploy.

**Alternatives considered**: usar SSE (Server-Sent Events) em vez de HTTP streamável —
descartado porque o Hermes documenta suporte a `url` + `headers` no `mcp_servers:` do seu
`config.yaml`, compatível com o modo HTTP padrão; SSE é o transporte anterior, mantido só
por compatibilidade retroativa em parte do ecossistema MCP.

## 3. Modelo: Gemini via endpoint OpenAI-compatible

**Decision**: `model.provider: custom`, `base_url: https://generativelanguage.googleapis.com/v1beta/openai/`,
`OPENAI_API_KEY=${GEMINI_API_KEY}` no `.env` do Hermes.

**Rationale**: mantém o custo e a chave já existentes (decisão do usuário). O maior risco
técnico do plano inteiro é se o tool-calling do Gemini Flash funciona de forma confiável
através dessa camada de compatibilidade OpenAI, com um número grande de tools (~85 no
piloto Nami+Kaguya). Por isso a Etapa E3 valida isso cedo, com uma única tool de escrita,
antes de investir nas skills dos outros domínios.

**Alternatives considered**: OpenRouter (provider nativo do Hermes, mais confiável para
tool-calling, mas custo novo) e Nous Portal (login OAuth do próprio Hermes, caminho mais
curto mas dependente dos limites da Nous). Ambos ficam como plano B explícito — trocar é
uma linha de config, não uma mudança estrutural.

## 4. Superfície de tools num único contexto

**Decision**: usar `tools.include` com glob por servidor MCP no `config.yaml` do Hermes
para conter a superfície, e medir com o piloto de ~85 tools (Nami+Kaguya) antes de escalar
para os ~150 totais.

**Rationale**: o ADK atual diluía as ~150 tools em 9 agentes com contexto separado
(`sub_agents`), cada sub-agente só via as tools do próprio domínio. O Hermes, como cérebro
único, precisa decidir entre todas de uma vez (ou usar `delegate_task` para isolar). Não
há dado prévio de quão bem o Gemini Flash lida com isso — é risco real, não hipotético.

**Alternatives considered**: usar `delegate_task` (subagentes do Hermes) para replicar o
isolamento por domínio que o ADK tinha — viável e documentado no Hermes, mas adicionado ao
escopo como item de QoL (Etapa E8) em vez de dependência do MVP, para não acoplar a
validação inicial a uma segunda camada de indireção ainda não testada.

## 5. WhatsApp: Baileys vs. Cloud API oficial

**Decision**: aceitar o conector Baileys (sessão WhatsApp Web) do Hermes, com número de
telefone dedicado e allowlist restrita ao próprio usuário.

**Rationale**: é a única opção que o Hermes oferece nativamente sem processo de aprovação
de negócio da Meta. Uso pessoal, de um usuário só — o risco de restrição de conta é
aceitável e mitigado por não expor o número para terceiros.

**Alternatives considered**: WhatsApp Cloud API oficial — descartada por exigir conta
Business verificada e não ser o que o Hermes suporta nativamente (integração custom fora
de escopo desta feature).

## 6. Voz e imagem: qual backend de transcrição

**Decision**: adiada para a Etapa E5, com a decisão final (Whisper local vs. Groq vs.
OpenAI) tomada ali com base em latência observada — Whisper local evita chave nova mas é
mais lento na VPS; Groq/OpenAI são mais rápidos mas adicionam uma chave e um custo.

**Rationale**: não é uma decisão bloqueante para o MVP (E1–E3) nem para abrir os canais
(E4) — só passa a importar quando mídia entra em cena.

**Alternatives considered**: nenhuma eliminada agora; registrado como decisão em aberto
intencional, não uma lacuna.

## 7. Lucy / e-mail: Himalaya não substitui a Lucy

**Decision**: `agents/lucy/tools.py` migra para MCP como qualquer outro domínio (Etapa
E6); o conector Email do Hermes é adotado apenas como quarta superfície de entrada (QoL,
Etapa E8) — mandar e-mail para a Makima e receber resposta.

**Rationale**: confirmado via documentação do Hermes que (a) o conector Email nativo é
só superfície (usa `imaplib`/`smtplib` para receber e responder, não gerencia caixa), (b)
não há tools de e-mail entre as ~60 built-in, e (c) a skill bundled `himalaya` opera uma
caixa de verdade mas via CLI através da tool `terminal` — que este projeto mantém
desabilitada por política de segurança (Technical Context, Constraints). O valor real da
Lucy (digest matinal com classificação Gemini, labels, arquivamento, histórico idempotente
em `lucy_emails`) não é reproduzido por nenhuma dessas alternativas.

**Alternatives considered**: habilitar `terminal` só para a skill Himalaya — rejeitado,
o custo de segurança (agente com acesso a finanças ganhando shell) excede o ganho (3 tools
read-only já existentes).

## 8. Multi-profile do Hermes

**Decision**: não usar. Um único profile (`$HERMES_HOME` padrão) para todos os canais e
domínios.

**Rationale**: `hermes -p <nome>` isola memória por profile, não só contexto — usar um
profile por área da vida (trabalho/pessoal, ecoando a spec 038 da Kaguya) fragmentaria
exatamente a memória unificada que é o objetivo central desta feature.

**Alternatives considered**: profile por canal — mesma objeção, rejeitado pelo mesmo
motivo.
