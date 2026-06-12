# Implementation Plan: Pessoas — identidade canônica integrada a todos os agentes

**Branch**: `014-pessoas` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-pessoas/spec.md`

## Summary

Hoje "pessoas" no Makima são strings soltas (nomes em transações da Nami, `journal_mentions.value`
no diário) sem identidade própria. Esta fatia **introduz** uma identidade canônica de pessoas e a
costura em todos os domínios. São três entregas que correspondem às três user stories, executadas
em **ondas** na ordem de dependência:

- **Onda 1 (US1)** — schema novo `agents/komi/schema_pg.sql` (4 tabelas), camada de lógica única
  em `agents/komi/tools.py` (CRUD + resolução **smart-match** case/acento-insensitive por nome e
  apelido), e o novo agente **Komi** (ADK, singleton, sem MCP) roteado pela Makima — uma agenda de
  contatos conversacional que já entrega valor sozinha.
- **Onda 2 (US2)** — tabela de vínculo **polimórfica N:N** `person_links` e integração
  cross-agent: `create_transaction` (Nami), `create_task` (Kaguya), `add_book` (Frieren) e
  `upsert_bullet` (Journal) ganham um `person_ids` opcional e gravam os vínculos **no mesmo
  cursor/transação** do item (padrão atômico de `complete_payment_task`).
- **Onda 3 (US3)** — hub de agregação `get_person_summary` (junta os vínculos por domínio) +
  seção **Pessoas** no webapp: grid de pessoas → página da pessoa (Dashboard de 4 cards) + modal
  CRUD, router FastAPI `/api/pessoas/*` paritário com o canal Telegram.

Tudo segue o padrão do repo: camada de lógica única (`tools.py`), Telegram e router como fachadas
finas, soft delete, fuso `America/Sao_Paulo`, single-user. Acento OKLCH da seção webapp: **lavanda/
roxo suave** (escopo `.km-app`).

## Technical Context

**Language/Version**: Python 3.12 (backend/agentes), TypeScript 5.8 + React 19 (frontend)

**Primary Dependencies**: google-adk (Agent — singleton, **sem** McpToolset), python-telegram-bot,
FastAPI + Pydantic, psycopg2-binary (síncrono), Vite 6 (frontend). **Nenhuma dependência nova** —
a captura em linguagem natural usa o `gemini-2.5-flash` já configurado.

**Storage**: PostgreSQL existente (mesmo banco de Nami/Frieren/Journal/Kaguya), acesso via
`agents/db.py` (`get_conn`, `run_select`, `run_dml`). Schema novo:
`agents/komi/schema_pg.sql` (4 tabelas), aplicado por `scripts/setup_schemas.py`
(executado **de dentro do container `makima-web`** no VPS — o hostname do Postgres é serviço
Docker Swarm, não resolve no host; ver CLAUDE.md raiz).

**Testing**: pytest. Testes de **integração** contra PostgreSQL real, no molde de
`tests/agents/test_kaguya_tasks.py` (skip do módulo inteiro sem `DATABASE_URL`; fixture dropa+recria
as tabelas a partir do `.sql`). Validação end-to-end manual via `quickstart.md`.

**Target Platform**: VPS Linux (Docker/Dokploy) — container `makima-web` (webapp) e bot
coordinator; frontend buildado pelo Vite e servido pelo backend.

**Project Type**: Web application (backend FastAPI + frontend React) + agente conversacional
(Telegram/ADK) sobre a mesma camada de lógica.

**Performance Goals**: `get_person_summary` resolve cada domínio em **uma** query (sem N+1);
interações CRUD do webapp percebidas como instantâneas (<300ms por mutação em rede local);
resposta da Komi limitada pela latência do Gemini.

**Constraints**: single-user; soft delete em `people`; paridade total de canais (nenhuma regra de
negócio fora da camada de lógica — FR-015); fuso fixo `America/Sao_Paulo`; `person_links` é
polimórfica **de propósito** (sem FK de banco para tabelas com tipos de id diferentes — integridade
na camada de aplicação); nome único por `normalizado` entre vivas, apelido único global.

**Scale/Scope**: 1 usuário; dezenas a centenas de pessoas; ~12 tools da Komi; 7 endpoints REST;
~5 telas/estados de frontend (GridScreen, PersonScreen com 4 cards, PersonModal, KomiShell,
TweaksPanel) + 1 nova entrada na sidebar global.

## Constitution Check

*GATE: constitution v1.0.1 — verificado antes do Phase 0 e re-verificado pós-design.*

| Princípio | Avaliação |
|---|---|
| **I. Agent Specialization** | ✅ **Komi** é um domínio genuinamente novo (identidade de pessoas/contatos) — nenhum agente atual o cobre. Makima só delega (ganha roteamento, não lógica). As tools cross-domain (gravar `person_links` dentro da transação de Nami/Kaguya/Frieren/Journal) são **fluxo de negócio real** ("paguei pro Fulano" = transação + vínculo são um ato só) e MUST ser documentadas no `agents/komi/CLAUDE.md` e nos CLAUDE.md dos agentes tocados, no padrão de `complete_payment_task`. A constitution lista os domínios existentes; **Komi é adição, não redefinição** — sem amendment necessário (ver Complexity Tracking). |
| **II. Hybrid Batch + Agentic** | ✅ Nenhum batch n8n é migrado. Esta fatia só adiciona camada interativa (agente + webapp). Lembretes proativos de aniversário (que seriam batch/agendado) ficam **fora** de escopo. |
| **III. Self-Contained Agents** | ✅ `agents/komi/` nasce no padrão exigido: `__init__.py`, `tools.py`, `agent.py`, `CLAUDE.md` **e** `schema_pg.sql`. Importável/testável isolado. Acesso cross-domain via helpers explícitos (`link_person_on_cursor`) chamados pelos outros agentes — declarados, não implícitos. |
| **IV. Portuguese-First UX** | ✅ Komi responde em português, confirma a resolução de nome antes de vincular (smart-match), comunica erros sem stacktrace. O webapp também é pt-BR. |
| **V. Minimal Footprint** | ✅ Zero dependência nova. 4 tabelas justificadas por domínio genuinamente novo (não havia onde guardar identidade de pessoa). `person_links` polimórfica evita 4 tabelas-ponte separadas. Novo agente justificado: nenhum agente existente é dono de "pessoas". |
| **Constraints arquiteturais** | ✅ `gemini-2.5-flash`; Komi é **singleton sem MCP** (não instancia subprocesso, como Nami/Frieren); psycopg2 síncrono; sessões por domínio no coordinator (novo domínio `"pessoas"`); router FastAPI no padrão dos existentes. |

**Resultado**: PASS. Sem amendment de constitution: Komi é um domínio aditivo. (A linha de domínios
da constitution pode ganhar `komi → pessoas` num PATCH futuro de housekeeping, mas não bloqueia
esta fase — não é redefinição de princípio.)

## Project Structure

### Documentation (this feature)

```text
specs/014-pessoas/
├── spec.md              # especificação (pronta)
├── plan.md              # este arquivo
├── research.md          # Phase 0 — decisões técnicas
├── data-model.md        # Phase 1 — as 4 tabelas + integridade na aplicação
├── quickstart.md        # Phase 1 — guia de validação end-to-end
└── contracts/
    ├── api-pessoas.md   # contrato REST /api/pessoas/*
    └── komi-tools.md    # contrato das tools do agente (paridade com a API)
```

### Source Code (repository root)

```text
agents/komi/                        # NOVO agente (padrão Nami/Frieren — singleton, sem MCP)
├── __init__.py                     # docstring de pacote
├── schema_pg.sql                   # NOVO — people, person_aliases, person_dates, person_links
├── tools.py                        # NOVO — camada de lógica única (CRUD + find_people + summary
│                                   #         + helpers *_on_cursor consumidos pela Onda 2)
├── agent.py                        # NOVO — komi_agent (Agent ADK; personalidade Komi-san)
└── CLAUDE.md                       # NOVO — tools, schema, smart-match, cross-agent, personalidade

agents/nami/tools.py                # create_transaction[_on_cursor] ganha person_ids (Onda 2)
agents/kaguya/tools_tasks.py        # create_task ganha person_ids (Onda 2)
agents/frieren/tools.py             # add_book ganha person_ids (Onda 2)
agents/journal/tools.py             # upsert_bullet: refator p/ link na mesma transação (Onda 2)

coordinator/agent.py                # importa komi_agent; sub_agents += komi; _MAKIMA_INSTRUCTION
coordinator/main.py                 # _DOMAINS += "pessoas"; keywords em _classify_domain()

scripts/setup_schemas.py            # SCHEMA_FILES += "agents/komi/schema_pg.sql"

webapp/backend/routers/pessoas.py   # NOVO — router /api/pessoas/* (molde routers/tasks.py)
webapp/backend/main.py              # registra o router (prefix /api/pessoas)

webapp/frontend/src/
├── App.tsx                         # rota /komi/* antes do catch-all
├── components/Layout.tsx           # entrada "Pessoas" na sidebar global (acento lavanda)
└── pages/komi/                     # NOVO shell (padrão pages/kaguya, pages/violet)
    ├── KomiShell.tsx               # estado {view:'grid'|'person', id?}; gerencia modal
    ├── komi.css                    # tokens OKLCH escopados .km-app (acento lavanda/roxo, claro/escuro)
    ├── komiApi.ts                  # objeto API dos 7 endpoints /api/pessoas/*
    ├── types.ts                    # Person, PersonSummary, PersonDate, Alias
    ├── screens/{GridScreen,PersonScreen}.tsx   # grid de cards; perfil + 4 cards por domínio
    └── modals/PersonModal.tsx      # criar/editar (contatos, apelidos, datas)

tests/agents/
├── test_komi.py                    # NOVO — identidade, find_people, soft delete, alias único (Onda 1)
└── test_komi_links.py             # NOVO — atomicidade, múltiplas pessoas, idempotência, journal (Onda 2)
```

**Structure Decision**: web application sobre a estrutura real do repo. A **camada de lógica única**
(FR-015) é `agents/komi/tools.py` — o router FastAPI a importa e envelopa (como `routers/tasks.py`
envelopa as tools da Kaguya) e o agente a expõe ao Gemini. A integração cross-agent **não** inverte
a propriedade: cada agente continua dono do SQL do seu domínio; a Komi só expõe
`link_person_on_cursor(cur, ...)` que os outros chamam dentro da própria transação (espelho de como
a Kaguya chama `create_transaction_on_cursor` da Nami).

**Front-end**: o shell `pages/komi/` segue o vocabulário de design das seções existentes
(`pages/violet`, `pages/kaguya`): tokens OKLCH escopados num prefixo de classe próprio (`.km-app`),
navegação interna por estado (sem React Router aninhado), chamadas sempre via objeto API
(`komiApi`, nunca `fetch` cru). A tela legada `pages/violet/screens/People.tsx` (que lê
`journal_mentions` cru) **não** é migrada nesta fatia.

## Complexity Tracking

Sem violações da constitution — tabela de violações não aplicável.

Nota de governança (não bloqueante): a seção "Core Principles I" da constitution lista os domínios
existentes e ainda não cita `komi → pessoas`. Como a adição de um domínio **novo** é exatamente o
que o Princípio V autoriza (domínio genuinamente novo), isto é uma atualização **factual** elegível
a um PATCH bump futuro (1.0.1 → 1.0.2) por housekeeping — registrável como tarefa, não como
pré-requisito desta fase.
