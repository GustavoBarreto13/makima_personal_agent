# Implementation Plan: Akane — agente de Filmes (experiência tipo Letterboxd)

**Branch**: `015-akane-filmes` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-akane-filmes/spec.md`

## Summary

Hoje o domínio **filmes** não existe no Makima (o `agents/media/` planejado para "séries+filmes+anime"
nunca foi construído, e o `n8n-python-scripts/gustavoboxd` é só referência externa). Esta fatia cria um
agente próprio — **Akane** — com foco no **webapp estilo Letterboxd**, mantendo o **Letterboxd como
fonte** do histórico (RSS + CSV). A **referência visual definitiva** é o protótipo hi-fi em
`specs/015-akane-filmes/design_handoff_akane_filmes/` (HTML/CSS/JSX + `data.js`), do "Claude Design".

São **cinco entregas (= cinco user stories)**, executadas em **ondas** na ordem de dependência,
**webapp-first**. O **schema inteiro (7 tabelas) nasce na Onda 1** (barato); as features mais ricas têm a
UI/endpoints faseados nas Ondas 4–5 (mesmo padrão de `movie_lists`: tabela cedo, tela depois):

- **Onda 1 (US1)** — schema novo `agents/akane/schema_pg.sql` (**7 tabelas**), camada de lógica única
  `agents/akane/tools.py` (CRUD do catálogo + log de sessão + watchlist + rating/like + notas + busca/
  enriquecimento TMDB + agregações), router `webapp/backend/routers/movies.py` e o Shell
  `webapp/frontend/src/pages/akane/` (grid de pôsteres com fallback tipográfico, diário, watchlist, página
  do filme com Cofre/Notas/Pessoas, stats). Entrega um "Letterboxd pessoal" funcional.
- **Onda 2 (US2)** — `scripts/sync_letterboxd.py` (RSS, idempotente, `--yesterday` no cron + endpoint
  `POST /api/movies/sync-letterboxd` para o botão "Sincronizar agora") e `scripts/import_letterboxd_csv.py`
  (carga histórica da exportação oficial — o usuário roda depois).
- **Onda 3 (US3)** — `agents/akane/agent.py` (`akane_agent`, ADK singleton sem MCP) roteado pela Makima +
  tool cross-agent que cria lembrete/sessão via Kaguya.
- **Onda 4 (US4)** — tela **Início** (hero + stat cards + Favoritos editáveis + atividade + histograma),
  **Rewind** (year-in-review) e **Heatmap**; endpoints `home`/`rewind`/`heatmap`/`favorites`.
- **Onda 5 (US5)** — **Listas** (CRUD + UI), **Etiquetas** (nuvem + filtro), **Cofre de conteúdos** e
  **Pessoas** (local; `person_id` reservado p/ 014); endpoints `lists*`/`tags`/`vault`/`people`.

Tudo segue o padrão do repo: camada de lógica única (`tools.py`), Telegram e router como fachadas finas,
soft delete, fuso `America/Sao_Paulo`, single-user. A seção webapp tem **tema claro/escuro + acento OKLCH
trocável** (base rosa, **default de fábrica teal**; estrelas em verde Letterboxd), escopo `.akane-shell`;
**pôster real do TMDB com fallback tipográfico** (14 paletas).

## Technical Context

**Language/Version**: Python 3.12 (backend/agentes), TypeScript 5.8 + React 19 (frontend)

**Primary Dependencies**: google-adk (Agent — singleton, **sem** McpToolset), python-telegram-bot,
FastAPI + Pydantic, psycopg2-binary (síncrono), `requests` (TMDB + RSS), Vite 6 (frontend). **Nenhuma
dependência nova** — TMDB e Letterboxd RSS são HTTP via `requests`.

**Storage**: PostgreSQL existente (mesmo banco de Nami/Frieren/Journal/Kaguya), acesso via `agents/db.py`
(`get_conn`, `run_select`, `run_dml`). Schema novo: `agents/akane/schema_pg.sql` (7 tabelas), aplicado por
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

**Scale/Scope**: 1 usuário; centenas a milhares de filmes/sessões; **7 tabelas**; **~22 tools** da Akane
(CRUD catálogo/diário/watchlist + notas/favoritos/vault/people + agregações home/rewind/heatmap/tags +
TMDB/sync); **~24 endpoints REST** (inclui sync, favoritos, vault, listas US5); **~9 telas** de frontend
(Home, Films, Diary, Watchlist, MovieDetail, Stats, Rewind, Lists, Tags) + modais (LogModal, AddToWatchlist,
FavPicker) + painel de tweaks + 1 entrada na sidebar global.

## Constitution Check

*GATE: verificado antes do Phase 0 e re-verificado pós-design.*

| Princípio | Avaliação |
|---|---|
| **I. Agent Specialization** | ✅ **Akane** é um domínio genuinamente novo (filmes) — nenhum agente atual o cobre; o `agents/media/` planejado é redefinido para séries+anime. Makima só delega. A tool cross-agent (lembrete via Kaguya) é fluxo real e MUST ser documentada no `agents/akane/CLAUDE.md`. |
| **II. Hybrid Batch + Agentic** | ✅ A ingestão Letterboxd (RSS/CSV) é **batch** (cron + script), no espírito do `gustavoboxd`; a camada interativa (agente + webapp) é agêntica. Sem migração de workflow n8n existente. |
| **III. Self-Contained Agents** | ✅ `agents/akane/` nasce no padrão: `__init__.py`, `tools.py`, `agent.py`, `CLAUDE.md` **e** `schema_pg.sql`. Importável/testável isolado. Cross-domain (Kaguya) via chamada explícita. |
| **IV. Portuguese-First UX** | ✅ Akane responde em português, confirma ações com os dados salvos, sem stacktrace. Webapp pt-BR. |
| **V. Minimal Footprint** | ✅ Zero dependência nova. **7 tabelas** justificadas por features de domínio do protótipo (catálogo+diário, Cofre, Pessoas, Favoritos, Listas N:N) — não colunas-array espalhadas. Pôster tipográfico e tweaks são CSS/JS no front (sem lib). TMDB único (não TMDB+OMDB). |
| **Constraints arquiteturais** | ✅ `gemini-2.5-flash`; Akane **singleton sem MCP** (Nami/Frieren); psycopg2 síncrono; novo domínio "filmes" no coordinator; router FastAPI no padrão dos existentes. |

**Resultado**: PASS. Akane é domínio aditivo. A tabela de domínios do `CLAUDE.md` raiz é atualizada
(housekeeping factual): Akane → filmes; `media` → séries+anime.

## Project Structure

### Documentation (this feature)

```text
specs/015-akane-filmes/
├── spec.md              # especificação (pronta)
├── plan.md              # este arquivo
├── research.md          # Phase 0 — decisões técnicas (TMDB, RSS, CSV, Shell, pôster, acento, pessoas)
├── data-model.md        # Phase 1 — as 7 tabelas + retornos das tools (home/rewind/heatmap/tags)
├── quickstart.md        # Phase 1 — guia de validação end-to-end (por onda)
├── design-guide.md      # guia de porte do frontend (alinhado ao protótipo)
├── design_handoff_akane_filmes/   # PROTÓTIPO hi-fi do "Claude Design" — referência visual definitiva
│   └── akane/{styles.css,data.js,ui.jsx,screens-a.jsx,screens-b.jsx,logmodal.jsx,app.jsx,akane-hero.png}
└── contracts/
    └── movies-api.md    # contrato REST /api/movies/*
```

### Source Code (repository root)

```text
agents/akane/                       # NOVO agente (padrão Nami/Frieren — singleton, sem MCP)
├── __init__.py                     # docstring de pacote
├── schema_pg.sql                   # NOVO — 7 tabelas: movies, diary_entries, movie_vault_items,
│                                   #   movie_people, movie_favorites, movie_lists, movie_list_items
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
├── components/Layout.tsx           # entrada "Filmes" na sidebar global (acento Akane)
└── pages/akane/                    # NOVO shell (padrão pages/frieren, pages/kaguya)
    ├── AkaneShell.tsx              # estado {view, id?}; sidebar (2 grupos); NextBar; gerencia modais/tweaks
    ├── akane.css                   # PORTADO de design_handoff/.../styles.css — tokens .akane-shell
    │                               #   (claro/escuro + 4 acentos; default teal; estrelas verde Letterboxd)
    ├── akaneApi.ts                 # objeto API dos endpoints /api/movies/*
    ├── types.ts                    # Movie, DiaryEntry, Stats, Rewind, Tag, VaultItem, Person, SyncResult
    ├── screens/                    # US1: FilmsScreen, DiaryScreen, WatchlistScreen, MovieDetailScreen, StatsScreen
    │                               # US4: HomeScreen, RewindScreen   ·   US5: ListsScreen, ListView, TagsScreen
    ├── modals/                     # LogModal (busca-primária TMDB + nota/review/data/rewatch),
    │                               #   AddToWatchlistModal, FavPicker (US4)
    ├── components/                 # Poster (TMDB+tipográfico), Stars, RateInput, Heart, DiaryRow, Heatmap,
    │                               #   Spark, FavoriteFilms, RecentActivity, LbPanel, NextBar, Toast, BackdropHero
    ├── tweaks/                     # painel de tweaks (tema/acento/densidade/pôster/ordenação — localStorage)
    └── ui/                         # primitivos (Icon set, etc.)

tests/agents/
├── test_akane.py                   # NOVO — catálogo, log_watch, rewatch, stats, notas, favoritos, soft delete (US1/US4)
├── test_akane_letterboxd.py        # NOVO — parsing RSS, idempotência, import CSV (Onda 2, TMDB/RSS mockados)
└── test_akane_collections.py       # NOVO — listas, etiquetas, cofre, pessoas (Onda 5)
```

**Structure Decision**: web application sobre a estrutura real do repo. A **camada de lógica única**
(FR-016) é `agents/akane/tools.py` — o router FastAPI a importa e envelopa (como `routers/books.py`
envelopa a Frieren), o agente a expõe ao Gemini, e os scripts de sync a reusam para upsert. A integração
cross-agent (Onda 3) chama a lógica da Kaguya por helper explícito, sem inverter propriedade de domínio.

**Front-end**: o shell `pages/akane/` segue o vocabulário de design das seções existentes (`pages/frieren`,
`pages/kaguya`): tokens OKLCH escopados em `.akane-shell`, navegação interna por estado (sem React Router
aninhado), chamadas sempre via `akaneApi`. O detalhe visual está em `design-guide.md`, **portando** o
protótipo hi-fi em `specs/015-akane-filmes/design_handoff_akane_filmes/` (a referência definitiva). O CSS
real vem de `design_handoff_akane_filmes/akane/styles.css`.

## Ondas de execução (resumo)

| Onda | US | Entrega | Arquivos-núcleo |
|---|---|---|---|
| 1 | US1 | Schema (7 tabelas) + tools + router + Shell (Filmes, Diário, Watchlist, Detalhe[Cofre/Notas/Pessoas], Stats); pôster TMDB+fallback; tema/acento | `agents/akane/{schema_pg.sql,tools.py}`, `routers/movies.py`, `pages/akane/*` |
| 2 | US2 | Ingestão Letterboxd (RSS agendado+manual, import CSV) | `scripts/sync_letterboxd.py`, `scripts/import_letterboxd_csv.py`, endpoint sync |
| 3 | US3 | Agente Akane (Telegram) + cross-agent Kaguya | `agents/akane/agent.py`, `coordinator/*` |
| 4 | US4 | Início (hero+stats+Favoritos editáveis+atividade+histograma), Rewind, Heatmap | `pages/akane/screens/{HomeScreen,RewindScreen}`, tools `get_home/get_rewind/get_heatmap/*_favorites`, endpoints |
| 5 | US5 | Listas (CRUD+UI), Etiquetas (nuvem+filtro), Cofre, Pessoas (local) | `pages/akane/screens/{ListsScreen,ListView,TagsScreen}`, tools de lists/tags/vault/people, endpoints |

> As tabelas-satélite (`movie_vault_items`, `movie_people`, `movie_favorites`, `movie_lists`) nascem **na
> Onda 1** (schema único, barato); só a UI/endpoints são faseados (US4/US5) — evita migração de schema
> entre ondas.

## Complexity Tracking

Sem violações da constitution. **Princípio V (Minimal Footprint)**: as **3 tabelas-satélite novas**
(`movie_vault_items`, `movie_people`, `movie_favorites`) são justificadas por features de domínio reais do
protótipo (Cofre de conteúdos, créditos/top-pessoas, vitrine de favoritos) — não colunas-array espalhadas;
favoritos no servidor (em vez do `localStorage` do protótipo) é exigência de **paridade de canais**
(FR-016). **Zero dependência nova** (pôster tipográfico e tweaks são CSS/JS no front; TMDB/RSS via
`requests`). Nota de housekeeping (não bloqueante): a tabela de agentes do `CLAUDE.md` raiz passa a citar
**Akane → filmes** e restringe `media` a séries+anime — atualização factual, não redefinição de princípio.
