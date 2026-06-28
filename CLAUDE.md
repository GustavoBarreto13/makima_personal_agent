# CLAUDE.md — makima_personal_agent

## O que é este repo

**Makima** é um coordinator multi-agente construído com Google ADK. Roda como bot Telegram autônomo no VPS, recebendo mensagens e delegando para agentes especialistas conforme o domínio do pedido.

O design completo — arquitetura, fases, schemas PostgreSQL, custos — está em `PLAN.md`.

---

## Convenções globais

### Fuso horário — tudo em UTC-3 (America/Sao_Paulo)

O usuário está em **UTC-3**. Qualquer cálculo de data ou hora deve usar o horário local, nunca UTC puro.

**Frontend (TypeScript/React):**
- Nunca usar `new Date().toISOString().slice(0,10)` para obter "hoje" — `toISOString()` retorna UTC e após as 21h local já aponta para o dia seguinte.
- Usar sempre `getFullYear() / getMonth() / getDate()` (partes locais do navegador).
- O helper canônico está em `webapp/frontend/src/pages/violet/dateUtils.ts` → `todayLocalISO()`. Reutilizá-lo em vez de reinventar.

**Backend (Python/PostgreSQL):**
- Timestamps armazenados como `TIMESTAMPTZ` (correto — guarda o instante absoluto).
- Para derivar a **data local** de um timestamp, sempre converter: `created_at AT TIME ZONE 'America/Sao_Paulo'`.
- Nunca usar `CURRENT_DATE`, `datetime.date.today()` ou `NOW()::date` em contexto de UI/relatório — esses retornam a data do servidor (UTC no container). Usar `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`.
- Em queries de estatísticas que agrupam por hora do dia, usar `EXTRACT(HOUR FROM col AT TIME ZONE 'America/Sao_Paulo')`.

**Histórico:** o bug foi descoberto na Violet (diário) em jun/2026 — bullets escritos após as 21h caíam no dia seguinte porque o frontend usava `toISOString()`. Corrigido em `fix(violet): corrige fuso horário UTC vs UTC-3`. Script de migração dos dados antigos: `scripts/fix_journal_bullet_timezone.py`.

---

## Relação com n8n-python-scripts

Os dois repositórios são **independentes**. O `makima_personal_agent` é self-contained: não importa nada do [`n8n-python-scripts`](https://github.com/Gusstavo42/n8n-python-scripts) (local: `C:\Users\gusta\Documents\GitHub\n8n-python-scripts`) em runtime.

O `n8n-python-scripts` serve apenas como **referência**: lá ficam os scripts batch (chamados pelo n8n) cuja lógica de acesso às APIs (Notion, Gmail, etc.) usamos como modelo ao escrever as tools dos agentes aqui. Os IDs e schemas são **copiados, não importados** — o custo dessa independência é manter essas constantes em sincronia manualmente se a fonte mudar.

### Onde vivem os agentes (neste repo)

Cada agente especialista é um pacote local em `agents/`. Cada um tem seu próprio `CLAUDE.md`:

| Agente | Domínio | Status | Documentação |
|---|---|---|---|
| `agents/nami/` | Finanças (PostgreSQL) | ✅ Fase 1 | `agents/nami/CLAUDE.md` |
| `agents/kaguya/` | Tarefas + Agenda (PostgreSQL próprio + Calendar via MCP) + Calendar Hub (fatia 019) | ✅ Fase 2 + 019 | `agents/kaguya/CLAUDE.md` |
| `agents/kurisu/` | Knowledge base (Vertex AI RAG) | 🔧 Fase 3 | `agents/kurisu/CLAUDE.md` |
| `agents/frieren/` | Livros (PostgreSQL + Google Books) | ✅ Fase 5a | `agents/frieren/CLAUDE.md` |
| `agents/akane/` | Filmes (PostgreSQL + TMDB + Letterboxd) | ✅ Fase 015 | `agents/akane/CLAUDE.md` |
| `agents/marin/` | Animes (PostgreSQL + Jikan/AniList + MAL OAuth) | ✅ Fase 021 | `agents/marin/CLAUDE.md` |
| `agents/mai/` | Séries de TV (PostgreSQL + TMDB API v4) | ✅ Fase 022 | `agents/mai/CLAUDE.md` |
| `agents/komi/` | Pessoas e contatos (PostgreSQL) | ✅ Fase 014 | `agents/komi/CLAUDE.md` |
| `agents/lucy/` | Email (Gmail IMAP) | — Fase 4 | — |

### Como o coordinator importa

```python
# coordinator/agent.py
from agents.nami.agent import nami_agent
from agents.kaguya.agent import create_kaguya_agent   # factory (só o McpToolset do Calendar)
from agents.frieren.agent import frieren_agent
from agents.kurisu.agent import kurisu_agent
from agents.akane.agent import akane_agent            # cinemateca de filmes (spec 015)
from agents.marin.agent import marin_agent            # catálogo de animes (spec 021)
from agents.mai.agent import mai_agent                # catálogo de séries de TV (spec 022)
from agents.komi.agent import komi_agent              # identidade de pessoas (spec 014)
# from agents.lucy.agent import lucy_agent
```

Imports locais — nada de `PYTHONPATH` apontando para outro repo.

---

## Arquitetura

```
Telegram (usuário)
    ↓
coordinator/main.py  (python-telegram-bot, sessões por domínio)
    ↓
coordinator/agent.py  (Makima — Agent ADK)
    ├── nami_agent      → PostgreSQL (finanças)                      [agents/nami]
    ├── kaguya_agent    → PostgreSQL (tarefas) + /api/tasks/*        [agents/kaguya + webapp]
    │                  → Google Calendar via MCP stdio               [mcp_servers/calendar]
    ├── kurisu_agent    → Vertex AI RAG (vault Obsidian)             [agents/kurisu]   (estrutura criada, pendente corpus)
    ├── frieren_agent   → PostgreSQL (livros)                        [agents/frieren]
    ├── akane_agent     → PostgreSQL (filmes) + TMDB + Letterboxd    [agents/akane]
    ├── marin_agent     → PostgreSQL (animes) + Jikan + AniList + MAL [agents/marin]
    ├── mai_agent       → PostgreSQL (séries) + TMDB API v4          [agents/mai]
    ├── komi_agent      → PostgreSQL (pessoas + vínculos)            [agents/komi]
    └── lucy_agent      → Gmail IMAP                                 [agents/lucy]     (ainda não ativada)
```

**Makima não tem tools próprias** — ela só delega. Toda lógica de acesso a APIs fica nas tools dos agents especialistas em `agents/`.

Para detalhes do coordinator (infraestrutura, sessões, env vars, parse_mode), ver `coordinator/CLAUDE.md`.

---

## Integração cross-agent: Kaguya + Nami

Kaguya possui duas tools especiais em `agents/kaguya/tools.py` que cruzam domínios:

| Tool | O que faz |
|---|---|
| `complete_payment_task` | Completa a tarefa **e** lança a despesa (tools da Nami) na **mesma transação PostgreSQL** — atômico, tudo-ou-nada |
| `create_expense_reminder` | Cria tarefa de lembrete de pagamento no PostgreSQL próprio (sem lançar despesa ainda) |

Makima conhece os fluxos duplos e roteia corretamente:

- Usuário pagou algo com tarefa → Kaguya (`complete_payment_task`)
- Despesa futura com data → Nami (lança) + Kaguya (lembrete)
- Morning briefing → Nami (resumo financeiro) + Kaguya (tarefas do dia)

---

## Integração cross-agent: Komi — vínculo de pessoas (spec 014)

**Komi** gerencia a identidade canônica de pessoas. Qualquer agente pode vincular uma pessoa
a um item criado, usando `link_person_on_cursor` na **mesma transação** — atomicidade tudo-ou-nada.

### `link_person_on_cursor(cur, person_id, entity_type, entity_id)`

Import lazy (dentro da função) para evitar ciclos:

```python
from agents.komi.tools import link_person_on_cursor  # lazy — evita ciclo
```

Idempotente: `INSERT … ON CONFLICT (person_id, entity_type, entity_id) DO NOTHING`.
`entity_id` é sempre coercido para `str` (UUIDs e SERIALs ficam como TEXT na tabela).

### Agentes com suporte a `person_ids`

| Agente | Função | entity_type |
|---|---|---|
| Nami | `create_transaction` / `create_transaction_on_cursor` | `"transaction"` |
| Kaguya | `create_task` | `"task"` |
| Frieren | `add_book` | `"book"` |
| Journal | `upsert_bullet` | `"journal_bullet"` (+ auto-link @menções único) |
| Journal | `create_letter` / `update_letter` | `"journal_letter"` (cartas da Violet) |

### Regra de smart-match antes de vincular

Antes de passar `person_ids`, o agente deve chamar `find_people(query)`:
- 0 matches → oferecer cadastro (`create_person`)
- 1 match → usar diretamente; confirmar: "encontrei [Nome]"
- 2+ matches → pedir disambiguação; NUNCA vincular sem confirmação

---

## Estrutura de arquivos

```
makima_personal_agent/
├── coordinator/
│   ├── main.py          # Telegram bot loop + sessões (ADK)
│   ├── agent.py         # Makima (Agent ADK) + sub_agents
│   ├── Dockerfile
│   └── CLAUDE.md        # infraestrutura, env vars, sessões, MCP Calendar, notas técnicas
├── agents/
│   ├── __init__.py
│   ├── nami/            # agente de finanças — Fase 1 ✅
│   │   ├── __init__.py
│   │   ├── tools.py     # tools de acesso ao PostgreSQL
│   │   ├── agent.py     # nami_agent
│   │   ├── schema_pg.sql # schema das tabelas PostgreSQL
│   │   └── CLAUDE.md    # tools, categorias, formatação, personalidade
│   ├── kaguya/          # agente de tarefas + agenda + Calendar Hub — Fase 2 ✅ + Fase 019 ✅
│   │   ├── __init__.py
│   │   ├── schema_tasks_pg.sql # schema do sistema de tarefas (spec 011) + calendar_prefs
│   │   ├── tools_tasks.py      # camada de lógica: CRUD de tarefas/subtarefas, posições + Meu Dia
│   │   ├── tools_projects.py   # camada de lógica: listas, grupos, colunas (Kanban)
│   │   ├── capacity.py         # motor PURO (sem banco): compute_capacity() — fatia 016
│   │   ├── gcal.py             # cliente Google Calendar (read all / write main) — fatia 019
│   │   ├── gcal_sync.py        # espelho best-effort de tarefas → GCal "Kaguya — Tarefas" — fatia 019
│   │   ├── calendar_prefs.py   # CRUD da tabela calendar_prefs — fatia 019
│   │   ├── calendar_hub.py     # agregador fan-out: register/list_sources/aggregate — fatia 019
│   │   ├── tools.py            # fachada: re-exporta a lógica + cross-agent (Nami) + Calendar Hub
│   │   ├── agent.py     # create_kaguya_agent() — factory (só o McpToolset do Calendar)
│   │   └── CLAUDE.md    # camada de lógica, tools, Calendar Hub, gcal_sync, personalidade
│   ├── kurisu/          # agente de knowledge base — Fase 3 🔧 (pendente corpus Vertex AI)
│   │   ├── __init__.py
│   │   ├── agent.py     # kurisu_agent — singleton com VertexAiRagRetrieval
│   │   └── CLAUDE.md    # arquitetura RAG, setup Vertex AI, checklist de ativação
│   ├── frieren/         # agente de livros — Fase 5a ✅
│   │   ├── __init__.py
│   │   ├── tools.py     # PostgreSQL + Google Books API
│   │   ├── agent.py     # frieren_agent
│   │   ├── schema_pg.sql # schema das tabelas PostgreSQL
│   │   └── CLAUDE.md    # tools, schema PostgreSQL, menu interativo, personalidade
│   ├── komi/            # agente de pessoas e contatos — Fase 014 ✅
│   │   ├── __init__.py
│   │   ├── tools.py     # PostgreSQL (people, aliases, dates, links) + smart-match + hub
│   │   ├── agent.py     # komi_agent — singleton
│   │   ├── schema_pg.sql # schema das 4 tabelas PostgreSQL
│   │   └── CLAUDE.md    # tools, schema, cross-agent, personalidade
│   └── mai/             # agente de séries de TV — Fase 022 ✅
│       ├── __init__.py
│       ├── tools.py     # PostgreSQL (series, seasons, series_episodes, series_watch_logs)
│       ├── metadata.py  # TMDB API v4 Bearer + retry + skip-logic incremental
│       ├── agent.py     # mai_agent — singleton
│       ├── schema_pg.sql # schema das 4 tabelas PostgreSQL
│       └── CLAUDE.md    # tools, schema, TMDB Bearer, personalidade
├── mcp_servers/
│   ├── __init__.py
│   └── calendar/
│       ├── __init__.py
│       └── server.py    # servidor MCP FastMCP — Google Calendar (leitura todos, escrita só principal)
├── scripts/
│   ├── authorize_calendar.py  # gera credenciais OAuth do Google Calendar (rodar uma vez)
│   ├── setup_schemas.py       # cria tabelas PostgreSQL de Nami e Frieren (rodar uma vez no VPS)
│   ├── migrate_bq_to_pg.py    # migração one-time: BigQuery → PostgreSQL
│   ├── backup_postgres.py     # pg_dump → Google Cloud Storage (roda diariamente via Docker)
│   ├── Dockerfile.backup      # imagem do serviço de backup (Python + postgresql-client + gzip)
│   └── .gitignore             # exclui client_secret.json do git
├── docs/
│   ├── MIGRACAO_POSTGRES.md  # checklist de deploy da migração BigQuery → PostgreSQL
│   └── BACKUP_POSTGRES.md    # backup do Postgres: como roda sozinho, verificar e restaurar
├── requirements.txt
├── PLAN.md              # design completo, fases, schemas, custos
└── CLAUDE.md            # este arquivo — visão geral e guia de navegação
```

---

## Dependências

```
google-adk               # Agent, InMemoryRunner, McpToolset, VertexAiRagRetrieval
python-telegram-bot      # bot Telegram
psycopg2-binary          # driver PostgreSQL síncrono (Nami, Frieren, Journal)
google-cloud-storage     # backup automático do PostgreSQL para GCS
requests                 # acesso HTTP às APIs externas (Google Books, etc.) nas tools dos agentes
mcp[cli]                 # FastMCP — servidor MCP do Google Calendar
google-auth              # OAuth para Google Calendar
google-auth-oauthlib     # fluxo OAuth desktop (script de autorização)
google-api-python-client # cliente da Google Calendar API v3
```

Ambiente local: `.venv` própria do makima.

---

## Fases de implementação

| Fase | O que fazer | Onde | Status |
|---|---|---|---|
| **1** | Nami (finanças): tools PostgreSQL + agent. | `agents/nami/` | ✅ |
| **2** | Kaguya (tarefas): sistema próprio em PostgreSQL (camada de lógica + router `/api/tasks/*` + shell webapp) + Calendar via MCP + cross-agent atômico Kaguya+Nami. TickTick aposentado (spec 011). | `agents/kaguya/` + `webapp/` | ✅ |
| **3** | Kurisu (knowledge base): Vertex AI RAG sobre vault Obsidian. Estrutura criada, pendente setup do corpus no GCP. | `agents/kurisu/` + GCP Console | 🔧 |
| **4** | Lucy (email): tools IMAP/Gmail + agent. | `agents/lucy/` (ref.: `n8n-python-scripts/lucy_email_agent/`) | — |
| **5a** | Frieren (livros): PostgreSQL + Google Books API + log de leitura por páginas. | `agents/frieren/` | ✅ |
| **022** | Mai (séries de TV): PostgreSQL (4 tabelas) + TMDB API v4 + shell React `/series/*`. | `agents/mai/` | ✅ |
| **014** | Komi (pessoas): PostgreSQL (4 tabelas) + vínculos cross-agent + router `/api/people/*`. Frontend pendente. | `agents/komi/` | ✅ backend |
| **5b** | Lucy (email): tools IMAP/Gmail. | `agents/lucy/` | — |

**Fase atual: 014 ✅ (backend)** — Komi implementada (schema + tools + agent + coordinator + REST router + testes). Frontend pendente. Próximo passo: fase 3 (Kurisu) ou frontend da Komi.

---

## Como adicionar um novo sub-agent

1. Criar o pacote `agents/<dominio>/` com `__init__.py`, `tools.py` e `agent.py`
2. Se o agente precisar de servidor MCP: criar `mcp_servers/<servico>/server.py` e usar `McpToolset` como o Kaguya faz
3. Descomentar/adicionar o import em `coordinator/agent.py`
4. Adicionar o agent à lista `sub_agents` do Makima
5. Atualizar `_MAKIMA_INSTRUCTION` com o novo especialista
6. Criar `agents/<dominio>/CLAUDE.md` seguindo o padrão dos outros agentes
7. Testar: enviar mensagem no Telegram que acione o novo domínio

---

## Como rodar localmente

```bash
# criar venv e instalar dependências
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt   # Windows
# source .venv/bin/activate && pip install -r requirements.txt  # Linux/Mac

# variáveis mínimas necessárias (ver coordinator/CLAUDE.md para lista completa):
# TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, GCP_CREDENTIALS_JSON, GCP_PROJECT_ID
# DATABASE_URL (PostgreSQL)
# Calendar Hub (fatia 019) — necessário no container makima-web (gcal.py + gcal_sync.py):
# GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET
# GOOGLE_CALENDAR_ACCESS_TOKEN, GOOGLE_CALENDAR_REFRESH_TOKEN, GOOGLE_CALENDAR_TOKEN_EXPIRY
# GOOGLE_CALENDAR_MAIN_CALENDAR_ID
# GCAL_SYNC_ENABLED=true  (default; "false" desativa o espelho sem desativar o CRUD)

python -m coordinator.main
```

> Os agentes usam o modelo `gemini-2.5-flash`. O ADK lê a chave do Gemini de `GEMINI_API_KEY` (Google AI Studio) ou usa Vertex se `GOOGLE_GENAI_USE_VERTEXAI=1` estiver setado.

---

## Executar scripts no VPS

O hostname do PostgreSQL (`personal-agent-makimadb-k3bxg9`) é um nome de serviço Docker Swarm — **não é resolvível na shell do host**. Rodar `python -m scripts.algo` diretamente no VPS falha com `Temporary failure in name resolution`.

**Sempre executar scripts de migração / manutenção de dentro do container `makima-web`:**

```bash
# Copiar o script para dentro do container (se ainda não estiver lá)
docker cp scripts/meu_script.py makima-web:/app/scripts/meu_script.py

# Executar
docker exec makima-web sh -c "cd /app && python -m scripts.meu_script"
```

Scripts que já estão no container (imagem inclui `scripts/`) não precisam do `docker cp`.

---

## Documentação no Obsidian

Assim como no `n8n-python-scripts`, alterações significativas neste repo devem ser refletidas no vault do Obsidian.
Use a skill `obsidian-vault` para consultar os caminhos corretos e atualizar a documentação lá.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at `specs/025-task-list-rework/plan.md`.
<!-- SPECKIT END -->
