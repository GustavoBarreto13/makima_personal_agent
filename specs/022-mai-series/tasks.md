# Tasks — Mai Sakurajima (fatia 022)

Status: 0/21 concluídas

---

## Fase 1 — Schema e pacote

### Wave 1 · Sem bloqueio (paralelas)

- [ ] **#1** `agents/mai/__init__.py` + `agents/mai/schema_pg.sql` — pacote Python + DDL das 4 tabelas (`series`, `seasons`, `episodes`, `watch_logs`) conforme `data-model.md`
- [ ] **#2** `scripts/setup_schemas.py` — adicionar `"agents/mai/schema_pg.sql"` à lista `SCHEMA_FILES`

---

## Fase 2 — Enriquecimento TMDB

### Wave 2 · Bloqueada por #1

- [ ] **#3** `agents/mai/metadata.py` — `search_series()`, `enrich_series()`, `_fetch_season_episodes()`, `_http_get()` Bearer v4, retry 3× backoff 2s→4s→8s, skip-logic incremental (FR-008), temporada 0 excluída ← **bloqueada por #1**

---

## Fase 3 — Tools ADK

### Wave 3 · Bloqueada por #3

- [ ] **#4** `agents/mai/tools.py` — 15 tools ADK (`search_series`, `add_series`, `log_watch`, `get_currently_watching`, `get_watchlist`, `update_series_status`, `rate_series`, `set_notes`, `get_series_detail`, `get_upcoming`, `get_stats`, `get_watch_history`, `sync_metadata`, `delete_series`, `delete_watch_log`); helpers `_norm`, `_find_series_by_query`, `_today` ← **bloqueada por #3**

---

## Fase 4 — Agente, docs e router

### Wave 4a · Bloqueada por #4

- [ ] **#5** `agents/mai/agent.py` — singleton ADK `mai_agent`, `gemini-2.5-flash`, 15 tools, `_MAI_INSTRUCTION` personalidade Mai Sakurajima (serena, HTML, "Mai:", emojis 🐰 📺 🌙 ✨ 🎬) ← **bloqueada por #4**
- [ ] **#6** `agents/mai/CLAUDE.md` — tools (tabela), schema (4 tabelas), personalidade, variáveis, smoke test ← **bloqueada por #4, #5**

### Wave 4b · Bloqueada por #4 (paralela com 4a)

- [ ] **#7** `webapp/backend/routers/series.py` + `webapp/backend/main.py` — 16 endpoints fachada fina (rotas fixas **antes** de `/{id}`; `_check_result`; Pydantic; `require_user`) + registrar router `/api/series` ← **bloqueada por #4**

---

## Fase 5 — Coordinator e docs globais

### Wave 5 · Bloqueada por #5

- [ ] **#8** `coordinator/agent.py` — import + `sub_agents` + `_MAKIMA_INSTRUCTION` keywords séries ← **bloqueada por #5**
- [ ] **#9** `CLAUDE.md` raiz + `coordinator/CLAUDE.md` — atualizar tabela de agentes (Mai ✅ 022), aposentar `agents/media/`, estrutura de arquivos ← **bloqueada por #8**

---

## Fase 6 — Frontend Foundation

### Wave 6 · Sem bloqueio (paralela com fases 1–5)

- [ ] **#10** `webapp/frontend/src/pages/mai/types.ts` — interfaces: `MaiStatus`, `MaiView`, `PosterKey`, `Density`, `Accent`, `Series`, `Season`, `Episode`, `WatchLog`, `SeriesDetail`, `UpcomingEpisode`, `Stats`, `Tweaks`
- [ ] **#11** `webapp/frontend/src/pages/mai/mai.css` — tokens OKLCH **exatos** do handoff em `.mai-shell`: superfícies, tinta, âmbar, acento periwinkle default, acentos alternativos `[data-accent]`, tema claro `[data-theme='light']`, densidade `[data-density]`, shell grid `240px 1fr`, topbar 56px, footbar 70px `grid-col 1/3`, PosterCard hover, `@keyframes pulse/modal-in/scrim-in/toast-in`, responsivo 900/860/720px ← **bloqueada por #10**
- [ ] **#12** `webapp/frontend/src/pages/mai/maiApi.ts` — 16 funções tipadas via `lib/api.ts` (`list`, `watchlist`, `diary`, `upcoming`, `stats`, `search`, `detail`, `episodes`, `add`, `logWatch`, `updateStatus`, `rate`, `setNotes`, `syncMetadata`, `deleteSeries`, `deleteLog`) ← **bloqueada por #10**

---

## Fase 7 — Componentes

### Wave 7a · Bloqueada por #10, #11 (paralelas)

- [ ] **#13** Componentes primitivos (`components/`): `Icon.tsx` (21 SVG paths), `Stars.tsx` (clip-based 3 tamanhos), `Score.tsx`, `RateInput.tsx` (meia-estrela via `.rate-half.l/.r`), `StatusChip.tsx` (`--st-{status}`, variante `onPoster`), `EpisodeProgress.tsx` (pulse âmbar, "Concluída ✓"), `PosterCard.tsx` (12 paletas POSTER, fallback teatral Fraunces, p-prog âmbar 4px), `Heatmap.tsx` (grade mensal `--heat-0..4`), `Spark.tsx` (barras, `.hot ≥ 70%`), `ListStats.tsx` (barra empilhada + 2 colunas), `FavoriteSeries.tsx` (4 slots, localStorage `'mai.favorites'`, SeriesPicker), `Toast.tsx` (pill gradient, 2.8s) ← **bloqueada por #10, #11**

### Wave 7b · Bloqueada por #13

- [ ] **#14** `components/SeasonAccordion.tsx` + `components/EpisodeLine.tsx` ← **bloqueada por #13, #12**
  - `SeasonAccordion`: lazy-load (`loaded` state), `epLimit=5` + "+8", abre na temporada do `next_episode`, chevron `rotate(90deg)` 0.2s, `max-height` 0.26s + `opacity` 0.22s
  - `EpisodeLine`: grid `18px 96px 1fr auto`, still 96×54px, 4 estados (watched/next/agendado/default), clique → `openLog()`

---

## Fase 8 — Telas

### Wave 8 · Bloqueada por #13, #14, #12

- [ ] **#15** Telas regulares — `screens/` (paralelas entre si): `HomeScreen.tsx` (hero + warmlight + stat-row + profile-split + carrosséis + home-split), `CatalogScreen.tsx` (chips de filtro + sort + grid PosterCards), `DiaryScreen.tsx` (grupos por mês, diary-row grid `52px 46px 1fr auto`), `WatchlistScreen.tsx` (wl-item + btn-warm "▶ Começar"), `UpcomingScreen.tsx` (timeline por dia, "Hoje" âmbar), `StatsScreen.tsx` (year-switch + big-stat-row Fraunces 44px + bars + stats-grid 2×2 + Heatmap) ← **bloqueada por #13, #14, #12**
- [ ] **#16** `screens/DetailScreen.tsx` — detail-banner (poster 160px + título Fraunces + Stars lg + Heart + StatusChip md + ações); detail-body (detail-grid `1.35fr 1fr`; col esquerda: sinopse, notes-block borda-esq `--mai` tag "🐰", SeasonAccordion, histórico; col direita: ficha meta-grid 2×3, gêneros) ← **bloqueada por #14, #12**

---

## Fase 9 — Modais

### Wave 9 · Bloqueada por #13, #12 (paralela com Wave 8)

- [ ] **#17** Modais — `modals/`: `LogWatchModal.tsx` (`<details>` fold, `<select>` temporadas, ep-range grid `1fr 1fr 1fr`, date, RateInput, Favorita toggle, review textarea, `⌘↵` submete, `Esc` fecha), `AddSeriesModal.tsx` (debounce 440ms, `in_catalog` badge "já na lista"), `SeriesPicker.tsx` (grid 98px do catálogo local), `NextBar.tsx` (footbar `grid-col 1/3` 70px, índice cíclico ‹›, "Já vi" → openLog, oculto `< 720px`) ← **bloqueada por #13, #12**

---

## Fase 10 — Shell

### Wave 10 · Bloqueada por #15, #16, #17

- [ ] **#18** `webapp/frontend/src/pages/mai/MaiShell.tsx` — state-based routing, sidebar (mai-hero.png avatar glow, `.side-log-btn` gradient, 2 grupos nav com contadores, quote Fraunces itálica, "Voltar à Makima"), topbar (busca → Catálogo), tweaks `'mai-tweaks'` TWEAK_DEFAULTS Periwinkle/Médio/Escuro, `data-accent` map, colapso sidebar 64px `< 900px` ← **bloqueada por #15, #16, #17**

---

## Fase 11 — Wiring final

### Wave 11 · Bloqueada por #18

- [ ] **#19** `webapp/frontend/src/App.tsx` — `<Route path="/series/*" element={<MaiShell />} />` **antes** do catch-all `/*` ← **bloqueada por #18**
- [ ] **#20** `webapp/frontend/src/components/Layout.tsx` — entrada Mai no array `DOMAINS` (`character: 'Mai'`, `label: 'Séries'`, `mainPath: '/series'`, `color: 'var(--c-mai)'`, `colorDim: 'var(--c-mai-dim)'`) ← **bloqueada por #18**
- [ ] **#21** `webapp/frontend/src/index.css` — tokens globais `--c-mai: oklch(0.66 0.17 270)` + `--c-mai-dim: oklch(0.66 0.17 270 / 0.16)`; copiar `design_handoff_mai_series/mai/mai-hero.png` → `webapp/frontend/public/mai/mai-hero.png` ← **bloqueada por #18**

---

## Grafo de dependências

```
#1 ──────────────► #3 ──► #4 ──► #5 ──► #8 ──► #9
#2 (independente)          │       │
                           │       └──► #6
                           └──────────────────► #7

#10 ──► #11 ──┐
#10 ──► #12 ──┤
              └──► #13 ──► #14 ──► #15 ──┐
                       └──────────► #16 ──┤
                       └──────────► #17 ──┤
                                          └──► #18 ──► #19
                                                    ──► #20
                                                    ──► #21
```

**Paralelas seguras:**
- Fase 6 (#10–#12) pode começar imediatamente, em paralelo com Fases 1–5.
- #7 (router FastAPI) pode correr em paralelo com #5+#6.
- #13 e #14 podem correr em paralelo com Fase 5.
- Wave 8 (#15+#16) e Wave 9 (#17) são paralelas entre si.

---

## Critérios de sucesso por task

| SC | Verificação | Task |
|----|------------|------|
| SC-001 | `add_series(tmdb_id=95396)` → `series` com pôster, `quero_assistir` | #4 |
| SC-002 | `log_watch("Severance", 1, 1, 2)` → `watch_logs` + `episodes_watched=2` | #4 |
| SC-003 | `sync_metadata()` 2× → eps antigos com still pulados | #3, #4 |
| SC-004 | `TMDB_TOKEN` ausente → erro claro, sem traceback | #3, #4 |
| SC-005 | `get_stats(year=2020)` → zeros sem erro | #4 |
| SC-006 | `get_upcoming(days=7)` → eps agendados com data, título, still | #4 |
| SC-007 | Makima roteia "séries" → `mai_agent`; HTML com "Mai:" | #8 |
| SC-008 | `delete_series()` → `deleted=TRUE`; `watch_logs` preservados | #4 |
| SC-009 | `sync_metadata` → `season_number=0` não criada | #3, #4 |
