<!--
SYNC IMPACT REPORT
Version change: 1.0.1 → 2.0.0 (MAJOR)
Modified sections:
  - Principle I (Agent Specialization) — lista de agentes atualizada para bater com o
    ROADMAP.md real: adicionados akane, marin, mai, komi, journal (Violet); removido
    "media" (nunca implementado — o domínio real acabou virando akane+marin+mai
    separados, não um agente único de Notion). Nenhuma mudança normativa de princípio.
  - Agent Architecture Constraints — reescrita para refletir a migração ADK → Hermes
    Agent (spec 064-hermes-multicanal), motivadora deste bump:
      - MCP: "apenas stdio, não HTTP" → HTTP servido por um serviço dedicado
        (makima-mcp), consumido pelo Hermes; stdio permanece só como transporte
        interno de um servidor MCP individual (ex.: Calendar dentro do makima-mcp).
        BREAKING: contradiz a garantia anterior ("não HTTP MCP").
      - Framework do coordenador: ADK (google-adk + sub_agents + python-telegram-bot)
        → Hermes Agent como gateway multicanal (Telegram/WhatsApp/Discord) e cérebro
        único. Durante a migração incremental, o coordinator ADK sobrevive
        temporariamente como "ponte legada" atrás de uma tool MCP — não é mais a
        arquitetura-alvo. BREAKING: troca de framework do gateway.
      - Sessões/memória: corrigido "InMemoryRunner" (já não batia com o código real,
        que usa DatabaseSessionService) e substituído pelo modelo de memória do
        Hermes (SOUL.md/MEMORY.md/USER.md + sessões SQLite com FTS5 + compressão
        automática), aposentando o padrão session_id={chat_id}_{domínio}.
      - Dockerfile: corrigido "apenas o coordinator tem container" (já desatualizado
        — webapp e scheduler já tinham Dockerfile próprio) para: cada serviço
        long-running tem seu próprio Dockerfile; agentes de domínio continuam sendo
        pacotes Python locais sem container.
      - Bot Telegram: removida a linha de framework fixo (python-telegram-bot,
        parse_mode Markdown — que já estava errado, o real é HTML) — o transporte de
        canal passa a ser responsabilidade do Hermes, não escolha direta do repo.
Templates updated: nenhum (o gate "Constitution Check" do plan-template.md já é
  genérico o bastante para acomodar a nova arquitetura sem mudança de estrutura)
Deferred TODOs: nenhum

--- Histórico anterior ---
Version change: (template) → 1.0.0
Added sections: Core Principles (I–V), Agent Architecture Constraints, Development Workflow, Governance
Modified principles: N/A (initial ratification)
Templates updated:
  ✅ spec-template.md — generic, no changes needed
  ✅ plan-template.md — Constitution Check section already present, will reference these principles
  ✅ tasks-template.md — generic, no changes needed
Deferred TODOs: none

Version change: 1.0.0 → 1.0.1 (PATCH)
Modified principles: Principle I (Agent Specialization) — atualização factual do backend do
  domínio kaguya: "TickTick + Google Calendar via MCP" → "PostgreSQL próprio + Google Calendar
  via MCP" (spec 011-tasks-mvp aposentou o TickTick). Nenhuma mudança normativa de princípio.
Templates updated: nenhum (mudança factual; os princípios e gates seguem iguais)
Deferred TODOs: none
-->

# Makima Personal Agent — Constitution

## Core Principles

### I. Agent Specialization (NON-NEGOTIABLE)

Each sub-agent owns exactly one domain. Makima (the coordinator) MUST NOT implement
domain logic — she only delegates. Domain logic lives in the agent's `tools.py`.

- nami → finanças (PostgreSQL)
- kaguya → tarefas + agenda (PostgreSQL próprio + Google Calendar via MCP)
- kurisu → knowledge base (Vertex AI RAG)
- frieren → livros (PostgreSQL + Google Books)
- akane → filmes (PostgreSQL + TMDB + Letterboxd)
- marin → animes (PostgreSQL + Jikan/AniList + MAL OAuth)
- mai → séries de TV (PostgreSQL + TMDB API v3)
- komi → pessoas e contatos (PostgreSQL)
- journal (Violet) → diário — módulo de tools sem agente coordenador próprio,
  consumido pelo webapp e, a partir da spec 064, também pelo gateway multicanal
- lucy → email (Gmail, somente leitura)

Cross-domain tools (e.g., `complete_payment_task` em kaguya que também escreve no
PostgreSQL) MUST be explicitly documented no `CLAUDE.md` do agente e justificados
como fluxo de negócio real — não conveniência técnica.

### II. Hybrid Batch + Agentic

O que funciona como batch automação MUST NOT ser migrado para o agente interativo.
A camada conversacional cobre o que precisa de contexto e decisão em tempo real; os
scripts batch existentes (backup, syncs, jobs agendados) continuam intactos.

- Novas features de interação conversacional → tool exposta ao agente coordenador
- Automações agendadas ou em volume → script Python direto (`makima-scheduler`)
- Briefings e digests agendados → gerados por script/job, entregues pelo gateway
  multicanal (mantém o batch; só o canal de entrega passa a ser multi-plataforma)

### III. Self-Contained Agents

Cada agent package (`agents/<nome>/`) MUST ser importável e testável de forma
independente. Não deve depender de outro agent em runtime — exceto via tools
cross-domain explicitamente declaradas.

- IDs e schemas de APIs externas são copiados, não importados de outros repos
- Cada agente tem seu próprio `CLAUDE.md` documentando tools, personalidade e
  decisões técnicas locais
- Um novo agente MUST seguir o padrão: `__init__.py`, `tools.py`, `CLAUDE.md` (e
  `schema_pg.sql` se usar PostgreSQL), com as tools exportadas de forma que possam
  ser registradas tanto por um servidor MCP quanto importadas diretamente pelo webapp

### IV. Portuguese-First UX

Todas as respostas ao usuário, em qualquer canal, MUST ser em português. Tom: direto,
sem floreios, sem confirmações desnecessárias. Respostas longas usam formatação
apropriada ao canal (listas, negrito) — nunca blocos de texto corrido.

- Erros são comunicados ao usuário em português claro — nunca stacktraces raw
- O coordinator nunca expõe detalhes de implementação na resposta final
- A formatação visual (HTML, Markdown etc.) é responsabilidade do transporte/gateway,
  não deve estar cozida na instrução de personalidade do agente

### V. Minimal Footprint

Antes de adicionar uma dependência, uma tabela, ou um novo agente: questionar se
o que existe já resolve. Complexidade MUST ser justificada por necessidade real,
não por antecipação de uso futuro (YAGNI).

- Novos agentes só são criados quando há domínio genuinamente novo
- Tools novas num agente existente são preferíveis a um novo agente para o mesmo domínio
- PostgreSQL é o storage padrão para dados estruturados persistentes — não criar
  nova infra de storage sem justificativa forte

## Agent Architecture Constraints

Decisões arquiteturais que MUST ser respeitadas em toda spec e plano:

- **Modelo**: `gemini-2.5-flash` para todos os agentes, via `GEMINI_API_KEY` (ou
  endpoint OpenAI-compatible apontando para o mesmo, quando o gateway exigir)
- **MCP**: servido via **HTTP** por um serviço dedicado (`makima-mcp`), autenticado
  por bearer token, consumido pelo gateway do agente coordenador. Transporte stdio
  continua permitido apenas como processo filho interno de um servidor MCP
  individual (ex.: o Google Calendar dentro do `makima-mcp`) — nunca como o
  transporte entre o coordenador e o mundo externo
- **Gateway do coordenador**: Hermes Agent — gateway multicanal (Telegram, WhatsApp,
  Discord) e cérebro único, consumindo as tools de domínio via MCP. Durante migração
  incremental de um domínio, um caminho de transição temporário (ponte legada) MUST
  manter esse domínio respondendo em todos os canais até a migração terminar
- **Sessões e memória**: geridas pelo gateway (SOUL.md/MEMORY.md/USER.md + sessões
  persistentes pesquisáveis + compressão automática de contexto) — não reinventar
  gerenciamento de sessão por domínio dentro do repo
- **Dockerfile**: cada serviço long-running tem seu próprio Dockerfile (gateway, MCP,
  webapp, scheduler); agentes de domínio continuam sendo pacotes Python locais sem
  container próprio
- **PostgreSQL**: driver `psycopg2-binary` síncrono — não async
- **Formatação de canal**: nenhuma instrução de formato específico de plataforma
  (HTML, Markdown de um canal em particular) MUST estar cozida na personalidade ou
  nas tools de um agente — isso é responsabilidade exclusiva do gateway

## Development Workflow

1. Toda feature começa com uma spec (`/speckit-specify`) antes de qualquer código
2. Specs ficam em `specs/<###-feature-name>/` na raiz do repo
3. O `Constitution Check` no `plan.md` MUST ser preenchido e passar antes de implementar
4. Cada agente novo MUST ter seu `CLAUDE.md` criado junto com o `tools.py`
5. Scripts de setup one-time (schema, migração, auth) ficam em `scripts/` — nunca
   acoplados ao runtime do gateway

## Governance

Esta constitution supersede qualquer prática ad-hoc documentada em outros arquivos.
Conflito com um `CLAUDE.md` de agente → a constitution vence.

**Amendments**: qualquer alteração de princípio MUST ser feita aqui primeiro,
com bump de versão e data. Princípios novos → MINOR bump. Remoção ou redefinição
incompatível → MAJOR bump. Clarificações → PATCH bump.

**Compliance**: todo `plan.md` gerado via `/speckit-plan` MUST incluir um
"Constitution Check" verificando os cinco princípios antes de prosseguir.

**Version**: 2.0.0 | **Ratified**: 2026-06-07 | **Last Amended**: 2026-08-07
