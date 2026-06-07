<!--
SYNC IMPACT REPORT
Version change: (template) → 1.0.0
Added sections: Core Principles (I–V), Agent Architecture Constraints, Development Workflow, Governance
Modified principles: N/A (initial ratification)
Templates updated:
  ✅ spec-template.md — generic, no changes needed
  ✅ plan-template.md — Constitution Check section already present, will reference these principles
  ✅ tasks-template.md — generic, no changes needed
Deferred TODOs: none
-->

# Makima Personal Agent — Constitution

## Core Principles

### I. Agent Specialization (NON-NEGOTIABLE)

Each sub-agent owns exactly one domain. Makima (the coordinator) MUST NOT implement
domain logic — she only delegates. Domain logic lives in the agent's `tools.py`.

- nami → finanças (PostgreSQL)
- kaguya → tarefas + agenda (TickTick + Google Calendar via MCP)
- kurisu → knowledge base (Vertex AI RAG)
- frieren → livros (PostgreSQL + Google Books)
- lucy → email (Gmail)
- media → séries, filmes, anime (Notion)

Cross-domain tools (e.g., `complete_payment_task` em kaguya que também escreve no
PostgreSQL) MUST be explicitly documented no `CLAUDE.md` do agente e justificados
como fluxo de negócio real — não conveniência técnica.

### II. Hybrid Batch + Agentic

O que funciona como batch automação em n8n MUST NOT ser migrado para ADK. O ADK
adiciona a camada interativa; os scripts batch existentes continuam intactos.

- Novas features de interação conversacional → ADK agent tool
- Automações agendadas ou em volume → script Python direto (n8n)
- Briefing matinal → n8n chama coordinator via HTTP (mantém o batch)

### III. Self-Contained Agents

Cada agent package (`agents/<nome>/`) MUST ser importável e testável de forma
independente. Não deve depender de outro agent em runtime — exceto via tools
cross-domain explicitamente declaradas.

- IDs e schemas de APIs externas são copiados, não importados de outros repos
- Cada agente tem seu próprio `CLAUDE.md` documentando tools, personalidade e
  decisões técnicas locais
- Um novo agente MUST seguir o padrão: `__init__.py`, `tools.py`, `agent.py`,
  `CLAUDE.md` (e `schema_pg.sql` se usar PostgreSQL)

### IV. Portuguese-First UX

Todas as respostas ao usuário via Telegram MUST ser em português. Tom: direto,
sem floreios, sem confirmações desnecessárias. Respostas longas usam formatação
Markdown (listas, negrito) — nunca blocos de texto corrido.

- Erros são comunicados ao usuário em português claro — nunca stacktraces raw
- O coordinator nunca expõe detalhes de implementação na resposta final

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

- **Modelo**: `gemini-2.5-flash` para todos os agentes (via `GEMINI_API_KEY`)
- **MCP**: apenas via `McpToolset` com stdio — não HTTP MCP
- **Sessões**: gerenciadas pelo coordinator por domínio, com `InMemoryRunner`
- **Dockerfile**: apenas o coordinator tem container; agentes são pacotes Python locais
- **PostgreSQL**: driver `psycopg2-binary` síncrono — não async
- **Bot Telegram**: `python-telegram-bot`; parse_mode Markdown; sem webhooks externos

## Development Workflow

1. Toda feature começa com uma spec (`/speckit-specify`) antes de qualquer código
2. Specs ficam em `specs/<###-feature-name>/` na raiz do repo
3. O `Constitution Check` no `plan.md` MUST ser preenchido e passar antes de implementar
4. Cada agente novo MUST ter seu `CLAUDE.md` criado junto com o `agent.py`
5. Scripts de setup one-time (schema, migração, auth) ficam em `scripts/` — nunca
   acoplados ao runtime do bot

## Governance

Esta constitution supersede qualquer prática ad-hoc documentada em outros arquivos.
Conflito com um `CLAUDE.md` de agente → a constitution vence.

**Amendments**: qualquer alteração de princípio MUST ser feita aqui primeiro,
com bump de versão e data. Princípios novos → MINOR bump. Remoção ou redefinição
incompatível → MAJOR bump. Clarificações → PATCH bump.

**Compliance**: todo `plan.md` gerado via `/speckit-plan` MUST incluir um
"Constitution Check" verificando os cinco princípios antes de prosseguir.

**Version**: 1.0.0 | **Ratified**: 2026-06-07 | **Last Amended**: 2026-06-07
