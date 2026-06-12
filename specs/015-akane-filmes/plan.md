# Implementation Plan: Akane — agente de Filmes (experiência tipo Letterboxd)

**Branch**: `015-akane-filmes` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-akane-filmes/spec.md`

## Summary

Hoje o domínio **filmes** não existe no Makima (o `agents/media/` planejado para "séries+filmes+anime"
nunca foi construído, e o `n8n-python-scripts/gustavoboxd` é só referência externa). Esta fatia cria um
agente próprio — **Akane** — com foco no **webapp estilo Letterboxd**, mantendo o **Letterboxd como
fonte** do histórico (RSS + CSV). São três entregas (= três user stories), executadas em **ondas** na
ordem de dependência, **webapp-first**:

- **Onda 1 (US1)** — schema novo `agents/akane/schema_pg.sql` (4 tabelas), camada de lógica única
  `agents/akane/tools.py` (CRUD do catálogo + log de sessão + watchlist + rating/like + busca/enriquecimento
  TMDB + agregações), router `webapp/backend/routers/movies.py` e o Shell `webapp/frontend/src/pages/akane/`
  (grid de pôsteres, diário, watchlist, página do filme, stats). Entrega um "Letterboxd pessoal" funcional.
- **Onda 2 (US2)** — `scripts/sync_letterboxd.py` (RSS, idempotente, `--yesterday` no cron + endpoint
  `POST /api/movies/sync-letterboxd` para o botão "Sincronizar agora") e `scripts/import_letterboxd_csv.py`
  (carga histórica da exportação oficial — o usuário roda depois).
- **Onda 3 (US3)** — `agents/akane/agent.py` (`akane_agent`, ADK singleton sem MCP) roteado pela Makima +
  tool cross-agent que cria lembrete/sessão via Kaguya.

Tudo segue o padrão do repo: camada de lógica única (`tools.py`), Telegram e router como fachadas finas,
soft delete, fuso `America/Sao_Paulo`, single-user. Acento OKLCH da seção webapp: **cinema escuro + vermelho/
estrela** (Oshi no Ko), escopo `.akane-shell`.

## Technical Context

**Language/Version**: Python 3.12 (backend/agentes), TypeScript 5.8 + React 19 (frontend)

**Primary Dependencies**: google-adk (Agent — singleton, **sem** McpToolset), python-telegram-bot,
FastAPI + Pydantic, psycopg2-binary (síncrono), `requests` (TMDB + RSS), Vite 6 (frontend). **Nenhuma
dependência nova** — TMDB e Letterboxd RSS são HTTP via `requests`.

**Storage**: PostgreSQL existente (mesmo banco de Nami/Frieren/Journal/Kaguya), acesso via `agents/db.py`
(`get_conn`, `run_select`, `run_dml`). Schema novo: `agents/akane/schema_pg.sql` (4 tabelas), aplicado por
`scripts/setup_schemas.py` (executado **de dentro do container `makima-web`** no VPS).

**External APIs**: TMDB (`https://api.themoviedb.org/3`, Bearer v4 `TMDB_TOKEN`, imagens em
`https://image.tmdb.org/t/p/`); Letterboxd RSS (`https://letterboxd.com/{username}/rss/`, sem auth,
User-Agent obrigatório). Retry/backoff em torno das chamadas; falha → retorno gracioso.

**Testing**: pytest. Testes de **integração** contra PostgreSQL real, no molde de
`tests/agents/test_kaguya_tasks.py` (skip sem `DATABASE_URL`; fixture dropa+recria as tabelas a partir do
`.sql`). TMDB/RSS **mockados** nos testes (sem rede). Validação end-to-end manual via `quickstart.md`.

**Target Platform**: VPS Linux (Docker/Dokploy) — container `makima-web` (webapp + cron de sync) e bot
coordinator; frontend buildado pelo Vite e servido pelo backend.

**Project Type**: Web application (backend FastAPI + frontend React) + agente conversacional (Telegram/ADK)
sobre a mesma camada de lógica + scripts batch de ingestão.

**Performance Goals**: `get_stats`/`get_diary`/`list_movies` resolvem em **uma** query cada (sem N+1);
interações CRUD do webapp percebidas como instantâneas (<300ms por mutação em rede local); resposta da
Akane limitada pela latência do Gemini; sync diário processa o feed (≤ ~50 itens) em segundos.

**Constraints**: single-user; soft delete em `movies`; paridade total de canais (nenhuma regra de negócio
fora da camada de lógica — FR-016); fuso fixo `America/Sao_Paulo`; idempotência do Letterboxd por índice
único parcial; `rating` ∈ [0.5, 5.0]; TMDB é a fonte única (sem OMDB).

**Scale/Scope**: 1 usuário; centenas a milhares de filmes/sessões; ~14 tools da Akane; ~13 endpoints REST
(inclui sync); ~6 telas de frontend (FilmsScreen, DiaryScreen, WatchlistScreen, MovieDetailScreen,
StatsScreen + modais) + 1 entrada na sidebar global.

## Constitution Check

*GATE: verificado antes do Phase 0 e re-verificado pós-design.*

| Princípio | Avaliação |
|---|---|
| **I. Agent Specialization** | ✅ **Akane** é um domínio genuinamente novo (filmes) — nenhum agente atual o cobre; o `agents/media/` planejado é redefinido para séries+anime. Makima só delega. A tool cross-agent (lembrete via Kaguya) é fluxo real e MUST ser documentada no `agents/akane/CLAUDE.md`. |
| **II. Hybrid Batch + Agentic** | ✅ A ingestão Letterboxd (RSS/CSV) é **batch** (cron + script), no espírito do `gustavoboxd`; a camada interativa (agente + webapp) é agêntica. Sem migração de workflow n8n existente. |
| **III. Self-Contained Agents** | ✅ `agents/akane/` nasce no padrão: `__init__.py`, `tools.py`, `agent.py`, `CLAUDE.md` **e** `schema_pg.sql`. Importável/testável isolado. Cross-domain (Kaguya) via chamada explícita. |
| **IV. Portuguese-First UX** | ✅ Akane responde em português, confirma ações com os dados salvos, sem stacktrace. Webapp pt-BR. |
| **V. Minimal Footprint** | ✅ Zero dependência nova. 4 tabelas justificadas por domínio novo. Listas via N:N (não colunas array espalhadas). TMDB único (não TMDB+OMDB). |
| **Constraints arquiteturais** | ✅ `gemini-2.5-flash`; Akane **singleton sem MCP** (Nami/Frieren); psycopg2 síncrono; novo domínio "filmes" no coordinator; router FastAPI no padrão dos existentes. |

**Resultado**: PASS. Akane é domínio aditivo. A tabela de domínios do `CLAUDE.md` raiz é atualizada
(housekeeping factual): Akane → filmes; `media` → séries+anime.

## Project Structure

### Documentation (this feature)

```text
specs/015-akane-filmes/
├── spec.md              # especificação (pronta)
├── plan.md              # este arquivo
├── research.md          # Phase 0 — decisões técnicas (TMDB, RSS, CSV, Shell)
├── data-model.md        # Phase 1 — as 4 tabelas + retornos das tools
├── quickstart.md        # Phase 1 — guia de validação end-to-end
├── design-guide.md      # guia de frontend para o "claude design" construir a UI
└── contracts/
    └── movies-api.md    # contrato REST /api/movies/*
```

### Source Code (repository root)

```text
agents/akane/                       # NOVO agente (padrão Nami/Frieren — singleton, sem MCP)
├── __init__.py                     # docstring de pacote
├── schema_pg.sql                   # NOVO — movies, diary_entries, movie_lists, movie_list_items
├── tools.py                        # NOVO — camada de lógica única (CRUD + TMDB + sync helpers)
│                                   #   (dividir em tools_tmdb.py se passar de ~1500 linhas)
├── agent.py                        # NOVO — akane_agent (Agent ADK; personalidade Akane Kurokawa) [Onda 3]
└── CLAUDE.md                       # NOVO — tools, schema, TMDB, Letterboxd, cross-agent, personalidade

scripts/
├── sync_letterboxd.py              # NOVO — RSS → upsert PostgreSQL (Onda 2; --yesterday p/ cron)
├── import_letterboxd_csv.py        # NOVO — exportação CSV → PostgreSQL (Onda 2; idempotente)
└── setup_schemas.py                # SCHEMA_FILES += "agents/akane/schema_pg.sql"

coordinator/agent.py                # importa akane_agent; sub_agents += akane; _MAKIMA_INSTRUCTION [Onda 3]
coordinator/main.py                 # domínio "filmes" no roteamento [Onda 3]

webapp/backend/routers/movies.py    # NOVO — router /api/movies/* (molde routers/books.py)
webapp/backend/main.py              # registra o router (prefix /api/movies)
webapp/backend/config.py            # (se necessário) expor TMDB_TOKEN / LETTERBOXD_USERNAME

webapp/frontend/src/
├── App.tsx                         # rota /movies/* antes do catch-all
├── components/Layout.tsx           # entrada "Filmes" na sidebar global (acento vermelho)
└── pages/akane/                    # NOVO shell (padrão pages/frieren, pages/kaguya)
    ├── AkaneShell.tsx              # estado {view, id?}; sidebar; gerencia modais
    ├── akane.css                   # tokens OKLCH escopados .akane-shell (cinema escuro + vermelho/estrela)
    ├── akaneApi.ts                 # objeto API dos endpoints /api/movies/*
    ├── types.ts                    # Movie, DiaryEntry, Stats, SyncResult
    ├── screens/                    # FilmsScreen, DiaryScreen, WatchlistScreen, MovieDetailScreen, StatsScreen
    ├── modals/                     # LogWatchModal (busca TMDB + nota/review/data/rewatch), AddToWatchlistModal
    ├── components/                 # MovieCard, RatingStars, DiaryRow, ReviewCard, BackdropHero
    └── ui/                         # primitivos (Icons, etc.) se necessário

tests/agents/
├── test_akane.py                   # NOVO — catálogo, log_watch, rewatch, stats, soft delete (Onda 1)
└── test_akane_letterboxd.py        # NOVO — parsing RSS, idempotência, import CSV (Onda 2, TMDB/RSS mockados)
```

**Structure Decision**: web application sobre a estrutura real do repo. A **camada de lógica única**
(FR-016) é `agents/akane/tools.py` — o router FastAPI a importa e envelopa (como `routers/books.py`
envelopa a Frieren), o agente a expõe ao Gemini, e os scripts de sync a reusam para upsert. A integração
cross-agent (Onda 3) chama a lógica da Kaguya por helper explícito, sem inverter propriedade de domínio.

**Front-end**: o shell `pages/akane/` segue o vocabulário de design das seções existentes (`pages/frieren`,
`pages/kaguya`): tokens OKLCH escopados em `.akane-shell`, navegação interna por estado (sem React Router
aninhado), chamadas sempre via `akaneApi`. O detalhe visual está em `design-guide.md` (handoff para o
"claude design", no molde de `docs/claude_design/design_handoff_frieren_livros/`).

## Ondas de execução (resumo)

| Onda | US | Entrega | Arquivos-núcleo |
|---|---|---|---|
| 1 | US1 | Schema + tools + router + Shell (catálogo, diário, watchlist, detalhe, stats) | `agents/akane/{schema_pg.sql,tools.py}`, `routers/movies.py`, `pages/akane/*` |
| 2 | US2 | Ingestão Letterboxd (RSS agendado+manual, import CSV) | `scripts/sync_letterboxd.py`, `scripts/import_letterboxd_csv.py`, endpoint sync |
| 3 | US3 | Agente Akane (Telegram) + cross-agent Kaguya | `agents/akane/agent.py`, `coordinator/*` |

## Complexity Tracking

Sem violações da constitution. Nota de housekeeping (não bloqueante): a tabela de agentes do `CLAUDE.md`
raiz passa a citar **Akane → filmes** e restringe `media` a séries+anime — atualização factual, não
redefinição de princípio.
