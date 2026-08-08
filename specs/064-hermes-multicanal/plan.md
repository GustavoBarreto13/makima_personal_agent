# Implementation Plan: Hermes Agent — multicanal, memória e mídia

**Branch**: `064-hermes-multicanal` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/064-hermes-multicanal/spec.md`

## Summary

Tornar o Hermes Agent (Nous Research) o gateway e cérebro único do Makima, substituindo o
coordinator ADK de forma incremental. As ~150 funções já existentes em
`agents/*/tools*.py` passam a ser expostas por um servidor MCP HTTP dedicado
(`makima-mcp`), reaproveitando o padrão FastMCP já usado em
`mcp_servers/calendar/server.py`. O Hermes consome esse MCP e ganha memória real
(SOUL.md/MEMORY.md/USER.md + sessões SQLite com FTS5 + compressão automática),
substituindo o padrão `session_id={chat_id}_{domínio}` do ADK. Migração por ondas: Nami +
Kaguya primeiro (piloto), Telegram assumido pelo Hermes com uma "ponte legada" mantendo os
7 domínios restantes vivos via uma única tool MCP que roda o `Runner` ADK atual, depois
WhatsApp e Discord (só configuração do mesmo gateway), depois voz/imagem, depois os 7
domínios restantes um a um, e por fim a remoção completa do `coordinator/`. O webapp não é
tocado — continua importando as mesmas funções de `tools.py` diretamente.

## Technical Context

**Language/Version**: Python 3.11+ (repo atual); Hermes exige Python 3.11+ e Node.js no
seu próprio container

**Primary Dependencies**:
- Novas: `mcp` (FastMCP, servidor HTTP), `starlette`/`uvicorn` (host dos servidores MCP
  montados), instalador oficial do Hermes Agent (Node + Python, imagem própria)
- Mantidas sem alteração: `psycopg2-binary`, `fastapi`, `google-cloud-aiplatform`
  (RAG da Kurisu), `apscheduler`
- Removidas ao final (Etapa E7): `google-adk`, `asyncpg`

**Storage**: PostgreSQL existente (inalterado — todo domínio continua no mesmo schema);
SQLite do Hermes para sessões/memória (`$HERMES_HOME`, volume Docker nomeado, não é
schema do repo)

**Testing**: `pytest` (padrão do repo, ver `conftest.py` e `tests/agents/`); esta feature
é majoritariamente infraestrutura/integração, então a validação primária é o
`quickstart.md` (fluxo ponta a ponta manual/scriptado por etapa), complementado por testes
unitários onde há lógica nova não trivial (ex.: o registro dinâmico de tools por domínio em
`mcp_servers/makima/app.py`, e a extração da lógica de consumo de eventos do ADK na ponte
legada)

**Target Platform**: Linux (VPS Dokploy, Docker Compose), mesma infraestrutura atual

**Project Type**: backend multi-serviço (Docker Compose) — adiciona 2 serviços novos
(`makima-mcp`, `makima-hermes`) ao já existente (`makima-web`, `makima-scheduler`); remove
1 ao final (`makima-bot`/`coordinator`)

**Performance Goals**: sem requisito de throughput — agente pessoal de um único usuário;
meta de latência é a mesma hoje percebida no Telegram (resposta em poucos segundos)

**Constraints**:
- A memória do Hermes MUST sobreviver a redeploy (volume nomeado, backup incluído)
- Tools de terminal/execução de código do Hermes MUST permanecer desabilitadas (agente
  mexe em finanças e e-mail pessoal)
- Nenhuma porta pública nova além das já existentes; `makima-mcp` só na rede interna
  (`dokploy-network`), autenticado por bearer token
- O tool-calling do Gemini via endpoint OpenAI-compatible precisa ser validado cedo
  (maior incerteza técnica do plano) antes de investir nas demais skills de domínio

**Scale/Scope**: 1 usuário autorizado por canal; ~150 tools distribuídas em 10 domínios;
3 canais-alvo (Telegram, WhatsApp, Discord)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

A constitution foi emendada para 2.0.0 nesta mesma sessão especificamente para acomodar
esta feature (ver Sync Impact Report em `.specify/memory/constitution.md`) — a seção
"Agent Architecture Constraints" agora descreve MCP HTTP + Hermes como gateway como a
arquitetura-alvo, em vez de proibi-la. Reavaliação dos 5 princípios:

| Princípio | Avaliação |
|---|---|
| I. Agent Specialization | ✅ Mantido. Nenhum domínio passa a ter lógica no coordenador; o Hermes só delega, como a Makima fazia. As tools continuam em `agents/*/tools*.py` |
| II. Hybrid Batch + Agentic | ✅ Mantido. Jobs pesados com efeito colateral (`pg_dump`, syncs, `mark_subscription_paid`) continuam no `makima-scheduler`, fora do agente conversacional (Etapa E7) |
| III. Self-Contained Agents | ✅ Mantido, reforçado. Cada domínio ganha um `toolset.py` explícito, tornando a superfície exportável ainda mais clara do que a lista inline em `Agent(tools=[...])` de hoje |
| IV. Portuguese-First UX | ✅ Mantido. `SOUL.md` e as skills MUST preservar a resposta em português; a formatação de canal deixa de estar cozida no prompt, o que é uma correção, não uma violação |
| V. Minimal Footprint | ✅ Avaliado com atenção — dois serviços novos (`makima-mcp`, `makima-hermes`) são adição real de complexidade. Justificativa: são substitutos de infraestrutura que teria que ser construída do zero para WhatsApp/Discord (gateway multicanal, pareamento, formatação por plataforma) — usar um projeto existente é o caminho de *menor* footprint, não maior. Ver Complexity Tracking abaixo |

**Gate**: PASSA. Nenhuma violação não justificada.

## Project Structure

### Documentation (this feature)

```text
specs/064-hermes-multicanal/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/            # Phase 1 output
│   └── mcp-servers.md
├── checklists/
│   └── requirements.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
agents/
├── nami/
│   ├── toolset.py         # NOVO (E1) — TOOLS: list[Callable], extraído de agent.py
│   └── agent.py           # passa a importar de toolset.py (sobrevive até E7)
├── kaguya/
│   ├── toolset.py         # NOVO (E1)
│   └── agent.py
├── frieren/ akane/ komi/ marin/ mai/ lucy/ kurisu/
│   └── toolset.py         # NOVO (E6, um domínio por vez, mesmo padrão do E1)
└── journal/
    └── tools.py            # já existe; ganha exposição MCP na E5 (sem toolset.py próprio
                             # necessário — é o único módulo sem agent.py hoje)

mcp_servers/
├── calendar/server.py      # já existe — reaproveitado, montado sob /mcp/calendar
└── makima/                 # NOVO pacote (E1)
    ├── registry.py         # DOMAINS: dict[str, list[Callable]]
    ├── app.py               # Starlette host, um FastMCP por domínio sob /mcp/<domínio>
    ├── auth.py              # middleware bearer token
    └── legacy.py            # NOVO (E2) — tool perguntar_makima_legado(mensagem, chat_id)

coordinator/
├── agent.py                 # E2: create_makima(sub_agents=...) recebe lista por parâmetro
├── main.py                  # lógica de consumo de eventos extraída para função reaproveitável
└── (removido inteiro na E7)

hermes/                      # NOVO diretório versionado (E3)
├── Dockerfile
├── config.yaml               # template; copiado para o volume se ausente
├── SOUL.md                   # persona Makima, portada de coordinator/agent.py
└── skills/
    ├── nami-financas/SKILL.md
    ├── kaguya-tarefas/SKILL.md
    └── <domínio>/SKILL.md     # um por domínio migrado (E6)

docker-compose.yml            # +makima-mcp (E1), +makima-hermes (E3), -makima (E7)
requirements.txt              # +mcp/starlette pin (E1); -google-adk/-asyncpg (E7)
```

**Structure Decision**: extensão do backend multi-serviço já existente (não um projeto
novo). `agents/*/toolset.py` é o único código Python novo que toca lógica de domínio —
puramente extrativo (mover uma lista, não reescrever tools). `mcp_servers/makima/` e
`hermes/` são infraestrutura nova, mas seguem o padrão já estabelecido por
`mcp_servers/calendar/` e pelos Dockerfiles de serviço existentes (`scheduler/Dockerfile`,
`webapp/backend/Dockerfile`).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| 2 serviços novos no compose (`makima-mcp`, `makima-hermes`), na balança do Princípio V | WhatsApp e Discord exigem gateway multicanal, pareamento de sessão, formatação por plataforma e memória de longo prazo — nenhuma dessas peças existe no repo hoje | Construir isso do zero (a alternativa "mais simples" no sentido de "menos serviços") significa reimplementar um gateway multicanal completo dentro do próprio `coordinator/`, multiplicando `main.py` (já com 1211 linhas) por 3 transportes — mais código, mais superfície de bug, e nenhuma memória de longo prazo de verdade no fim. Adotar um projeto existente e maduro é o caminho de menor footprint líquido, não maior |
