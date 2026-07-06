# CLAUDE.md — makima_personal_agent

## O que é este repo

**Makima** é um coordinator multi-agente construído com Google ADK. Roda como bot Telegram autônomo no VPS, recebendo mensagens e delegando para agentes especialistas conforme o domínio do pedido.

O status das fases vive no **`ROADMAP.md`** (fonte única da verdade). O design original — arquitetura, fases iniciais, schemas, custos — está arquivado em `docs/arquivo/PLAN.md` (**documento histórico**: bom para entender o porquê das decisões, não para status). O mapa da pasta de documentação está em `docs/README.md`.

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
| `agents/kaguya/` | Tarefas + Agenda (PostgreSQL próprio + Calendar via MCP) + Calendar Hub (019) + Meu Dia (016) + Kanban views (024) + Tiny Experiments (029) + Metas (030) | ✅ Fases 2, 011–020, 024–026, 029–030 | `agents/kaguya/CLAUDE.md` |
| `agents/kurisu/` | Knowledge base (Vertex AI RAG — corpus ativo) + memória unificada | ✅ Fase 027 · 🔧 028 parcial | `agents/kurisu/CLAUDE.md` |
| `agents/frieren/` | Livros (PostgreSQL + Google Books) | ✅ Fase 5a | `agents/frieren/CLAUDE.md` |
| `agents/akane/` | Filmes (PostgreSQL + TMDB + Letterboxd) | ✅ Fase 015 | `agents/akane/CLAUDE.md` |
| `agents/marin/` | Animes (PostgreSQL + Jikan/AniList + MAL OAuth) | ✅ Fase 021 | `agents/marin/CLAUDE.md` |
| `agents/mai/` | Séries de TV (PostgreSQL + TMDB API v3) | ✅ Fase 022 | `agents/mai/CLAUDE.md` |
| `agents/komi/` | Pessoas e contatos (PostgreSQL) | ✅ Fase 014 | `agents/komi/CLAUDE.md` |
| `agents/journal/` | Diário (Violet) — **módulo de tools, não é sub-agente ADK**: sem `agent.py`, consumido só pelo router `/api/journal/*` do webapp | ✅ web | `agents/journal/CLAUDE.md` |
| `agents/lucy/` | Email (Gmail) — agente somente leitura (IMAP) + digest matinal agendado | ✅ Fase 4 / 032 | `agents/lucy/CLAUDE.md` |

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
from agents.lucy.agent import lucy_agent              # email (Gmail), somente leitura (spec 032)
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
    ├── kurisu_agent    → Vertex AI RAG (vault Obsidian)             [agents/kurisu]   (corpus ativo — spec 027)
    ├── frieren_agent   → PostgreSQL (livros)                        [agents/frieren]
    ├── akane_agent     → PostgreSQL (filmes) + TMDB + Letterboxd    [agents/akane]
    ├── marin_agent     → PostgreSQL (animes) + Jikan + AniList + MAL [agents/marin]
    ├── mai_agent       → PostgreSQL (séries) + TMDB API v3          [agents/mai]
    ├── komi_agent      → PostgreSQL (pessoas + vínculos)            [agents/komi]
    └── lucy_agent      → Gmail via IMAP, somente leitura            [agents/lucy]

scheduler/  (makima-scheduler — jobs agendados)
    └── lucy_digest     → digest matinal 08:00 (classificação Gemini + labels/arquivo + Telegram + histórico) [agents/lucy + scripts/send_lucy_digest.py]
```

**Makima não tem tools próprias** — ela só delega. Toda lógica de acesso a APIs fica nas tools dos agents especialistas em `agents/`.

> O diário (Violet) **não aparece no diagrama de propósito**: `agents/journal/` é um módulo de tools sem `agent.py`, consumido apenas pelo webapp (`/api/journal/*`). A personalidade Violet e o rename `journal → violet` estão planejados em `docs/planos/PLANO_VIOLET_EVERGARDEN.md`.

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
│   ├── kaguya/          # agente de tarefas + agenda — Fases 2, 011–020, 024–026, 029–030 ✅
│   │   ├── __init__.py
│   │   ├── schema_tasks_pg.sql # schema do sistema de tarefas (spec 011+) + calendar_prefs
│   │   ├── tools_tasks.py      # camada de lógica: CRUD de tarefas/subtarefas, posições + Meu Dia
│   │   ├── tools_projects.py   # camada de lógica: listas, grupos, colunas (Kanban)
│   │   ├── tools_tags.py       # tags N:N — fatia 013
│   │   ├── tools_filters.py    # smart-lists (filtros salvos via DSL) — fatia 013
│   │   ├── tools_calendar.py   # consultas por intervalo + ocorrências recorrentes — fatia 013
│   │   ├── tools_habits.py     # hábitos + check-ins — fatia 014
│   │   ├── tools_kanban_views.py # views configuráveis do Kanban — spec 024
│   │   ├── tools_experiments.py  # Tiny Experiments (CRUD + log + pausa + revisão) — spec 029
│   │   ├── tools_goals.py      # Metas (áreas, marcos, vínculos, progresso) — spec 030
│   │   ├── recurrence.py       # motor PURO de recorrência (RRULE) — fatia 012
│   │   ├── habit_strength.py   # motor PURO da "força" do hábito (EMA) — fatia 014
│   │   ├── capacity.py         # motor PURO (sem banco): compute_capacity() — fatia 016
│   │   ├── experiment_adherence.py # motor PURO de aderência dos experimentos — spec 029
│   │   ├── goal_progress.py    # motor PURO de progresso das metas — spec 030
│   │   ├── komi_sync.py        # sync bidirecional de aniversários com a Komi — spec 026
│   │   ├── gcal.py             # cliente Google Calendar (read all / write main) — fatia 019
│   │   ├── gcal_sync.py        # espelho best-effort de tarefas → GCal "Kaguya — Tarefas" — fatia 019
│   │   ├── calendar_prefs.py   # CRUD da tabela calendar_prefs — fatia 019
│   │   ├── calendar_hub.py     # agregador fan-out: register/list_sources/aggregate — fatia 019
│   │   ├── tools.py            # fachada: re-exporta a lógica + cross-agent (Nami) + Calendar Hub
│   │   ├── agent.py     # create_kaguya_agent() — factory (só o McpToolset do Calendar)
│   │   └── CLAUDE.md    # camada de lógica, tools, Calendar Hub, gcal_sync, personalidade
│   ├── kurisu/          # agente de knowledge base — Fase 027 ✅ (corpus ativo) + 028 🔧 parcial
│   │   ├── __init__.py
│   │   ├── agent.py     # kurisu_agent — singleton
│   │   ├── tools.py     # buscar_na_base() — busca no corpus Vertex AI RAG
│   │   ├── recency.py   # ponderação por recência dos resultados
│   │   ├── memory/      # memória unificada (spec 028): exporters.py, render.py, store.py, sync.py
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
│   ├── akane/           # agente de filmes — Fase 015 ✅
│   │   ├── __init__.py
│   │   ├── tools.py     # PostgreSQL + TMDB + sync Letterboxd (RSS/CSV)
│   │   ├── agent.py     # akane_agent — singleton
│   │   ├── schema_pg.sql # schema das 7 tabelas PostgreSQL
│   │   └── CLAUDE.md    # tools, schema, TMDB/Letterboxd, personalidade
│   ├── marin/           # agente de animes — Fase 021 ✅
│   │   ├── __init__.py
│   │   ├── tools.py     # PostgreSQL (anime, watch_logs, episodes, mal_sync_state)
│   │   ├── metadata.py  # search/enrich via Jikan + AniList + ARM
│   │   ├── mal_auth.py  # OAuth2 PKCE do MyAnimeList (refresh automático)
│   │   ├── mal_sync.py  # pull delta/full do MAL para o PostgreSQL
│   │   ├── agent.py     # marin_agent — singleton
│   │   ├── schema_pg.sql # schema das 4 tabelas PostgreSQL
│   │   └── CLAUDE.md    # tools, schema, MAL OAuth, personalidade
│   ├── lucy/            # agente de email (Gmail) — Fase 4 / 032 ✅
│   │   ├── __init__.py
│   │   ├── gmail_imap.py # camada IMAP pura: connect/fetch/parse/label/archive
│   │   ├── tools.py     # 3 tools read-only + classify_emails() (Gemini) + persist_classified()
│   │   ├── agent.py     # lucy_agent — singleton, somente leitura
│   │   ├── schema_pg.sql # schema da tabela lucy_emails
│   │   └── CLAUDE.md    # tools, schema, digest, personalidade
│   ├── mai/             # agente de séries de TV — Fase 022 ✅
│   │   ├── __init__.py
│   │   ├── tools.py     # PostgreSQL (series, seasons, series_episodes, series_watch_logs)
│   │   ├── metadata.py  # TMDB API v3 (api_key) + retry + skip-logic incremental
│   │   ├── agent.py     # mai_agent — singleton
│   │   ├── schema_pg.sql # schema das 4 tabelas PostgreSQL
│   │   └── CLAUDE.md    # tools, schema, TMDB Bearer, personalidade
│   └── journal/         # diário (Violet) — módulo de tools, SEM agent.py (só webapp)
│       ├── __init__.py
│       ├── tools.py     # PostgreSQL (pages, bullets, mentions, emoções) — cria tabelas sob demanda
│       └── CLAUDE.md    # tools, schema, integração com o webapp
├── mcp_servers/
│   ├── __init__.py
│   └── calendar/
│       ├── __init__.py
│       └── server.py    # servidor MCP FastMCP — Google Calendar (leitura todos, escrita só principal)
├── scheduler/           # agendador de jobs recorrentes (container makima-scheduler) — APScheduler
│   ├── __init__.py
│   ├── registry.py      # lista declarativa JOBS + ScheduledJob + helpers daily_at()/every()
│   ├── jobs.py          # wrappers dos scripts (backup, kurisu-sync, letterboxd, lucy_digest)
│   ├── runner.py        # execute_with_logging(): cronometra, grava scheduler_runs, alerta em falha
│   ├── notify.py        # send_telegram_alert() — POST na Bot API do Telegram
│   ├── main.py          # entrypoint: BlockingScheduler + modos --run / --list
│   ├── schema_pg.sql    # tabela scheduler_runs (histórico de execuções)
│   ├── Dockerfile       # base do webapp + postgresql-client + gzip (backup precisa de pg_dump)
│   └── CLAUDE.md        # o padrão + passo a passo "como adicionar um job novo"
├── scripts/
│   ├── authorize_calendar.py  # gera credenciais OAuth do Google Calendar (rodar uma vez)
│   ├── authorize_mal.py       # gera tokens OAuth do MyAnimeList (rodar uma vez)
│   ├── setup_schemas.py       # cria tabelas PostgreSQL de todos os agentes (rodar uma vez no VPS)
│   ├── setup_kurisu_rag.py    # cria o corpus Vertex AI RAG e ingere o vault — spec 027
│   ├── sync_kurisu_memory.py  # sync incremental da memória unificada — spec 028
│   ├── sync_letterboxd.py     # sync RSS do Letterboxd (Akane)
│   ├── import_letterboxd_csv.py # importação one-time do CSV histórico do Letterboxd
│   ├── backup_postgres.py     # pg_dump → Google Cloud Storage (agendado pelo scheduler/ — job diário)
│   ├── send_lucy_digest.py    # digest matinal de emails (Lucy) — agendado pelo scheduler/ (spec 032)
│   ├── migrate_*.py           # migrações one-time já executadas (BQ→PG, shelves, aniversários, timezone…)
│   └── .gitignore             # exclui client_secret.json do git
├── docs/                    # organizada por tipo — ver docs/README.md (mapa completo)
│   ├── README.md            # índice: o que é vivo, o que é plano, o que é histórico
│   ├── referencia/          # docs VIVAS: POSTGRES.md (54 tabelas), BACKUP_POSTGRES.md, KURISU_BASE_CONHECIMENTO.md (leiga)
│   ├── planos/              # planos FUTUROS: PLANO_VIOLET_EVERGARDEN.md, PLANO_INTEGRACAO_VIOLET_KOMI.md
│   ├── arquivo/             # HISTÓRICO: PLAN.md original, MIGRACAO_POSTGRES.md, persistencia-sessao, setup-hook, superpowers/
│   └── claude_design/       # design handoffs (HTML/CSS de referência) dos shells
├── requirements.txt
├── ROADMAP.md           # fonte única da verdade: fases, status atual e pendências
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

**A fonte única da verdade para fases e status é o [`ROADMAP.md`](ROADMAP.md)** — ao entregar
uma fase, atualize lá (não duplique tabelas de status aqui nem no README).

Resumo: fases 001–027, 029, 030, 031 e 032 (Lucy/email, scheduler) entregues; 028
(memória unificada da Kurisu) parcial.

---

## Como manter a documentação (guia da estrutura)

A estrutura foi reorganizada em jul/2026 para eliminar duplicação — a regra geral é:
**cada informação vive em UM lugar; os outros apontam**. Doc desatualizada é pior que ausente.

### Onde cada coisa vive

| Informação | Único lugar onde é mantida | Quem aponta para lá |
|---|---|---|
| Status de fases / roadmap / pendências | `ROADMAP.md` | README.md e este arquivo (só resumo de 1 linha) |
| Árvore de arquivos detalhada | este `CLAUDE.md` | README.md (só o mapa de topo) |
| Schema do banco (tabelas coluna a coluna) | `docs/referencia/POSTGRES.md` | CLAUDE.md dos agentes (só nomes de tabelas) |
| Tools e regras de cada agente | `agents/<nome>/CLAUDE.md` | tabela de agentes deste arquivo |
| Rotas da API do webapp | `webapp/docs/API.md` | webapp/CLAUDE.md |
| Shells do frontend | `webapp/docs/FRONTEND.md` | webapp/frontend/src/pages/CLAUDE.md |
| Visão geral leiga do projeto | `README.md` | — |

### Onde criar um doc novo (`docs/`)

- **Descreve o sistema como ele É hoje** → `docs/referencia/` (e manter atualizado junto com o código)
- **Plano aprovado mas NÃO executado** → `docs/planos/` (com linha `Status: planejado, não executado` no topo)
- **Registro do passado** (plano executado, checklist concluído, doc obsoleta) → `docs/arquivo/`
- Sempre adicionar a linha correspondente no índice `docs/README.md`

### Checklist ao entregar uma fase nova

1. Atualizar a linha da fase no `ROADMAP.md` (status + seção "Status atual"/"Pendências")
2. Se criou/alterou tabelas: atualizar `docs/referencia/POSTGRES.md` (formato coluna a coluna)
3. Se criou/alterou tools de agente: atualizar o `agents/<nome>/CLAUDE.md`
4. Se criou rotas ou telas: atualizar `webapp/docs/API.md` e/ou `webapp/docs/FRONTEND.md`
5. Se criou módulos novos: adicioná-los à árvore de arquivos deste `CLAUDE.md`
6. Se a feature aparece para o usuário: 1 linha na tabela de páginas/funcionalidades do `README.md`

### Ciclo de vida de um doc

- Plano em `docs/planos/` foi **executado**? → mover para `docs/arquivo/` (`git mv`, preserva histórico) + banner `✅ IMPLEMENTADO` no topo + atualizar `docs/README.md`
- Doc ficou **obsoleta** (feature aposentada)? → mover para `docs/arquivo/` + banner `⚠️ OBSOLETO` explicando o porquê — **não deletar** (o arquivo é o registro)
- Nunca documentar comportamento que o código ainda não implementa

### O que NÃO tocar

- `specs/` — artefatos do Spec Kit, imutáveis após gerados (mudança de escopo = editar o SPEC e re-rodar o fluxo)
- `docs/arquivo/` — conteúdo congelado; só se adiciona banner/nota, não se reescreve

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
at `specs/032-lucy-gmail/plan.md`.
<!-- SPECKIT END -->
