# Tasks — Marin Kitagawa (fatia 021)

Status: 0/18 concluídas

---

## Fase 1 — Backend

### Wave 1 · Sem bloqueio (paralelas)

- [ ] **#1** `scripts/setup_schemas.py` — adicionar `agents/marin/schema_pg.sql` à lista `SCHEMA_FILES`
- [ ] **#2** `scripts/authorize_mal.py` — PKCE OAuth bootstrap interativo (gera tokens → persiste em `mal_sync_state`)

### Wave 2 · Bloqueada por #1

- [ ] **#3** `agents/marin/tools.py` — 14 tools ADK (search_anime, add_anime, log_watch, get_currently_watching, get_watchlist, update_anime_status, rate_anime, get_anime_details, get_airing_schedule, get_stats, get_watch_history, sync_mal, delete_anime, delete_watch_log) ← **bloqueada por #1**
- [ ] **#4** `agents/marin/agent.py` — singleton ADK Marin Kitagawa, gemini-2.5-flash, personalidade HTML ← **bloqueada por #3**
- [ ] **#5** `agents/marin/CLAUDE.md` — documentação do agente ← **bloqueada por #3, #4**

### Wave 3 · Bloqueada por #4

- [ ] **#6** `coordinator/agent.py` — import + sub_agents + _MAKIMA_INSTRUCTION ← **bloqueada por #4**
- [ ] **#7** `CLAUDE.md` raiz + `coordinator/CLAUDE.md` — atualizar entradas da Marin ← **bloqueada por #6**

---

## Fase 2 — Frontend Foundation

### Wave 4 · Sem bloqueio (paralelas)

- [ ] **#8** `webapp/frontend/src/pages/marin/types.ts` — interfaces TypeScript (Status, PosterKey, MarinView, Anime, WatchLog, etc.)
- [ ] **#9** `webapp/frontend/src/pages/marin/marin.css` — tokens OKLCH escopados em `.marin-shell` (layout 244px+1fr, topbar 56px, NextBar 70px, `--st-{status}`, acento Neon default)
- [ ] **#10** `webapp/frontend/src/pages/marin/marinApi.ts` — 15 funções tipadas via `lib/api.ts` ← **bloqueada por #8**

---

## Fase 3 — Router FastAPI

### Wave 5 · Bloqueada por #3

- [ ] **#11** `webapp/backend/routers/animes.py` — 15 endpoints (`_check_result`, Pydantic, `require_user`) ← **bloqueada por #3**
- [ ] **#12** `webapp/backend/main.py` — registrar router `/api/animes` ← **bloqueada por #11**

---

## Fase 4 — Shell + UI

### Wave 6 · Bloqueada por #8, #9

- [ ] **#13** `components/` — 14 componentes primitivos (Icon, Heart, Stars, Score, RateInput, StatusChip, EpisodeProgress, PosterCard, MalStats, Heatmap, Spark, EpisodeLine, NextBar, Toast) ← **bloqueada por #8, #9**
- [ ] **#14** `AnimeDetail.tsx` — tela de detalhe (banner, episódios paginados 12/vez, logs recentes, caderno) ← **bloqueada por #13**

### Wave 7 · Bloqueada por #13, #14, #10

- [ ] **#15** `screens/` — 6 telas (HomeScreen, CatalogScreen, DiaryScreen, WatchlistScreen, ScheduleScreen, StatsScreen) ← **bloqueada por #13, #14, #10**

### Wave 8 · Bloqueada por #13, #10

- [ ] **#16** `modals/` — 3 modais (LogWatchModal, AddAnimeModal, MarinTweaks) ← **bloqueada por #13, #10**

### Wave 9 · Bloqueada por #13, #14, #15, #16

- [ ] **#17** `MarinShell.tsx` — shell raiz (state-based routing, sidebar 244px, topbar, sync MAL, tweaks) ← **bloqueada por #13, #14, #15, #16**

---

## Fase 5 — Wiring Final

### Wave 10 · Bloqueada por #17

- [ ] **#18** `webapp/frontend/src/App.tsx` — adicionar `<Route path="/animes/*" element={<MarinShell />} />` ← **bloqueada por #17**

---

## Grafo de dependências

```
#1 ──────────────────────────────────► #3 ──► #4 ──► #6 ──► #7
#2 (independente)                       │       │
                                        │       └──► #5
                                        └──────────────────► #11 ──► #12

#8 ──► #10 ──┐
#9 ──────┐   │
         └──► #13 ──► #14 ──► #15 ──┐
                  └──────────► #16 ──┤
                                     └──► #17 ──► #18
```

## Critérios de sucesso (SCs do spec.md)

| SC | Verificação | Task |
|----|------------|------|
| SC-001 | `add_anime(52701)` → linha em `anime` com `mal_id=52701` | #3 |
| SC-002 | `log_watch(...)` → `watch_logs` criado, `episodes_watched=3` | #3 |
| SC-003 | `sync_mal()` idempotente (0 upserts na 2ª chamada) | #3 |
| SC-004 | `refresh_token` diferente em `mal_sync_state` após refresh | #2 |
| SC-005 | One Piece → 0 linhas em `episodes` (blacklist séries longas) | #3 |
| SC-006 | `TMDB_TOKEN` ausente → enriquecimento sem erro | #3 |
| SC-007 | `get_stats()` banco vazio → zeros, sem erro | #3 |
| SC-008 | Makima roteia "anime" para marin_agent; resposta HTML com "Marin:" | #6 |
| SC-009 | `delete_anime()` → `deleted=True`; logs preservados | #3 |
