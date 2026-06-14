# Plano de Implementação — Mai Sakurajima (fatia 022)

**Status:** Pronto para executar
**Ambiguidade:** 0.13 (gate ≤ 0.20 ✓)
**Estimativa:** ~43 arquivos · ~3.800 LOC

---

## Contexto

`agents/mai/` não existe. `webapp/frontend/src/pages/mai/` não existe.
`webapp/backend/routers/series.py` não existe. Tudo a criar do zero.

O que existe de referência:
| Arquivo | Papel |
|---------|-------|
| `specs/022-mai-series/spec.md` | FR-001–FR-013, 9 SCs, edge cases |
| `specs/022-mai-series/data-model.md` | DDL completo das 4 tabelas |
| `specs/022-mai-series/research.md` | Bearer v4, skip-logic, retry, decisões R1–R8 |
| `specs/022-mai-series/design-guide.md` | **Fonte de verdade visual**: tokens OKLCH, dimensões, componentes, telas |
| `specs/022-mai-series/design_handoff_mai_series/` | Protótipo hi-fi (styles.css, ui.jsx, screens-a/b.jsx, logmodal.jsx, data.js, app.jsx) |
| `agents/akane/tools.py` | Padrão tools: `_norm()`, fuzzy match, retry TMDB, Bearer v4 |
| `agents/akane/agent.py` | Padrão singleton ADK sem MCP |
| `agents/frieren/tools.py` | `_find_book_by_query` — fuzzy match a replicar |
| `webapp/backend/routers/movies.py` | Padrão router: `_check_result`, Pydantic, `require_user` |
| `webapp/frontend/src/pages/akane/AkaneShell.tsx` | Padrão shell: state-based routing, tweaks localStorage |
| `webapp/frontend/src/lib/api.ts` | `api.get<T>`, `api.post<T>` — usar em maiApi.ts |
| `n8n-python-scripts/series_sync/main.py` | Lógica TMDB TV: `/search/tv`, `/tv/{id}`, `/tv/{id}/season/{n}`, skip-logic |

---

## Fase 1 — Schema e pacote (backend)

### Wave 1 · Sem bloqueio

#### 1.1 `agents/mai/__init__.py`
Arquivo vazio. **Critério:** `from agents.mai import tools` sem ModuleNotFoundError.

#### 1.2 `agents/mai/schema_pg.sql`
DDL das 4 tabelas `IF NOT EXISTS` conforme `data-model.md`. Especials excluídos na constraint `CHECK (season_number > 0)` ou documentados na skip-logic (não criar `season_number=0` na inserção).

```sql
-- series      — catálogo (tmdb_id, status usuário, rating 0.5–5.0, soft delete)
-- seasons     — cache por temporada UNIQUE(series_id, season_number)
-- episodes    — cache por episódio UNIQUE(series_id, season_number, episode_number)
-- watch_logs  — diário (sem UNIQUE — rewatches intencionais)
```

**Ler primeiro:** `specs/022-mai-series/data-model.md`, `agents/frieren/schema_pg.sql` (formato padrão do repo).
**Critério:** 4 tabelas criadas idempotentemente; `\d series` em psql mostra colunas corretas.

#### 1.3 `scripts/setup_schemas.py` — registrar schema
Adicionar `"agents/mai/schema_pg.sql"` à lista `SCHEMA_FILES`.
**Critério:** `python -m scripts.setup_schemas` dentro do container aplica as 4 tabelas da Mai sem erro.

---

## Fase 2 — Enriquecimento TMDB

### Wave 2 · Depende de 1.2

#### 2.1 `agents/mai/metadata.py`
Port da lógica de `n8n-python-scripts/series_sync/main.py` com 3 adaptações: (a) auth Bearer v4 (`Authorization: Bearer {TMDB_TOKEN}`) em vez de v3 query-param; (b) sink PostgreSQL em vez de Notion; (c) `language=pt-BR` em todas as chamadas.

Funções públicas:

| Função | Endpoint TMDB |
|--------|--------------|
| `search_series(query, year=None)` | `GET /search/tv?query=...` — retorna lista de candidatos (max 5) |
| `enrich_series(conn, series_id, tmdb_id)` | `GET /tv/{id}` + loop por temporada |
| `_fetch_season_episodes(tmdb_id, n)` | `GET /tv/{id}/season/{n}` |
| `_http_get(url, params)` | Bearer v4 + retry 3× backoff 2s→4s→8s (429/5xx/rede) |

**Skip-logic incremental (FR-008):** pular upsert de episódio quando existe no banco AND `air_date IS NOT NULL` AND `still_url IS NOT NULL` AND `air_date < NOW()::DATE`.
Imagens: `/w500` (pôster), `/w1280` (backdrop), `/w780` (still de episódio).
Temporada `season_number=0` ("Specials"): **jamais inserir** em `seasons`.

**Ler primeiro:** `n8n-python-scripts/series_sync/main.py`, `agents/akane/tools.py` (padrão `_http_get` Bearer v4 + retry), `specs/022-mai-series/research.md`.
**Critério:** `search_series("Severance")` → `tmdb_id=95396`; `enrich_series()` popula `seasons` e `episodes`; re-rodar → episódios antigos com still são pulados (SC-003); `TMDB_TOKEN` ausente → erro claro sem traceback (SC-004); `season_number=0` não criada (SC-009).

---

## Fase 3 — Tools ADK

### Wave 3 · Depende de 2.1

#### 3.1 `agents/mai/tools.py` — 15 tools

Pure functions retornando `{"status": "ok"|"error", ...}`. HTML formatado no campo `message`.
Helpers internos: `_norm(s)`, `_find_series_by_query(query, conn)`, `_today()`.

| Tool | Assinatura | O que faz |
|------|-----------|-----------|
| `search_series` | `(query, limit=5)` | Busca TMDB sem criar entrada |
| `add_series` | `(title=None, tmdb_id=None, status="quero_assistir", year=None)` | Cria em `series` + chama `enrich_series()` se `tmdb_id` |
| `log_watch` | `(query, season_number=None, ep_start=None, ep_end=None, watched_date=None, rating=None, review=None)` | Insere `watch_logs`; atualiza `episodes_watched`; marca `episodes.watched=TRUE`; infere `date_started`/`date_finished` |
| `get_currently_watching` | `()` | SELECT WHERE status='assistindo' ORDER BY updated_at DESC |
| `get_watchlist` | `()` | SELECT WHERE status='quero_assistir' |
| `update_series_status` | `(query, status)` | UPDATE — valida enum 5 valores |
| `rate_series` | `(query, rating)` | UPDATE rating — valida ∈ {0.5, 1.0, …, 5.0} (FR-004) |
| `set_notes` | `(query, notes)` | UPDATE series.notes |
| `get_series_detail` | `(query)` | série + seasons[] + next_episode + 5 watch_logs recentes |
| `get_upcoming` | `(days=14)` | episodes WHERE air_date BETWEEN hoje E hoje+N AND status='assistindo' |
| `get_stats` | `(year=None)` | total, eps, horas, avg_rating, top_genres, top_networks, monthly[12], by_status — zeros se vazio (SC-005) |
| `get_watch_history` | `(query=None, limit=50)` | watch_logs, opcionalmente filtrado por série |
| `sync_metadata` | `(query)` | Chama `metadata.enrich_series()` — retorna contagens |
| `delete_series` | `(query)` | UPDATE SET deleted=TRUE — watch_logs preservados (SC-008) |
| `delete_watch_log` | `(log_id)` | DELETE FROM watch_logs; recalcula episodes_watched |

**Ler primeiro:** `agents/akane/tools.py` (padrão completo), `agents/frieren/tools.py` (fuzzy match), `agents/mai/metadata.py`, `agents/mai/schema_pg.sql`, `specs/022-mai-series/spec.md §FR e §SC`.
**Critério:** SC-001 (`add_series tmdb_id=95396`), SC-002 (`log_watch ep_start=1 ep_end=2 → episodes_watched=2`), SC-005 (`get_stats` banco vazio → zeros), SC-008 (soft delete); nota 3.7 rejeitada.

---

## Fase 4 — Agente, docs e router

### Wave 4a · Depende de 3.1 (backend)

#### 4.1 `agents/mai/agent.py` — singleton ADK

```python
mai_agent = Agent(
    name="mai",
    model="gemini-2.5-flash",
    description="Cuida do catálogo de séries de TV e diário de sessões de episódios.",
    instruction=_MAI_INSTRUCTION,
    tools=[search_series, add_series, log_watch, get_currently_watching,
           get_watchlist, update_series_status, rate_series, set_notes,
           get_series_detail, get_upcoming, get_stats, get_watch_history,
           sync_metadata, delete_series, delete_watch_log],
)
```

`_MAI_INSTRUCTION`: serena, madura, analítica, humor seco. "Mai:". HTML. Emojis 🐰 📺 🌙 ✨ 🎬.
Nunca inventa dados — sempre chama a tool antes de responder.

**Ler primeiro:** `agents/akane/agent.py`, `agents/frieren/agent.py`.
**Critério:** `from agents.mai.agent import mai_agent` sem erro; `len(mai_agent.tools) == 15`.

#### 4.2 `agents/mai/CLAUDE.md`
Seções: Tools (tabela), Schema (4 tabelas), Personalidade, Variáveis de ambiente, Smoke test.
**Ler primeiro:** `agents/akane/CLAUDE.md` (template mais completo do repo).

### Wave 4b · Depende de 3.1 (paralela com 4a)

#### 4.3 `webapp/backend/routers/series.py` — 16 endpoints

Padrão idêntico a `movies.py`. `_check_result()`. `require_user` em todas.
Pydantic models: `AddSeriesBody`, `LogWatchBody`, `StatusBody`, `RatingBody`, `NotesBody`.

Endpoints (prefix `/api/series`):
```
GET  /                         → list_series() + filtros
GET  /watchlist                → get_watchlist()
GET  /diary                    → get_watch_history()
GET  /upcoming                 → get_upcoming()
GET  /stats                    → get_stats()
GET  /search                   → search_series()
POST /                   201   → add_series()
GET  /{id}                     → get_series_detail()
POST /{id}/log           201   → log_watch()
PATCH/{id}/status              → update_series_status()
PATCH/{id}/rating              → rate_series()
PATCH/{id}/notes               → set_notes()
POST /{id}/sync-metadata 202   → sync_metadata()
DELETE/{id}                    → delete_series()
DELETE/{id}/logs/{log_id}      → delete_watch_log()
GET  /{id}/seasons/{n}/episodes → episódios da temporada
```

**CRÍTICO:** rotas fixas (`/watchlist`, `/diary`, `/upcoming`, `/stats`, `/search`) declaradas **antes** de `/{id}` no router.

**Ler primeiro:** `webapp/backend/routers/movies.py` (estrutura completa), `agents/mai/tools.py`, `webapp/backend/main.py`, `specs/022-mai-series/contracts/api-series.md`.
**Critério:** `GET /api/series/search?q=Severance` → 200; `/watchlist` não é capturado como `/{id}`; todas as rotas com `Depends(require_user)`.

#### 4.4 `webapp/backend/main.py` — registrar router
Adicionar import + `app.include_router(series_router.router, prefix="/api/series", tags=["series"])`.
**Critério:** `GET /api/series/search?q=test` responde (não 404).

---

## Fase 5 — Coordinator e docs globais

### Wave 5 · Depende de 4.1

#### 5.1 `coordinator/agent.py` — wiring Mai
Import + `sub_agents` + `_MAKIMA_INSTRUCTION` (keywords: série, séries, episódio, temporada, assistindo, network, Mai).
**Critério:** bot Telegram roteia "Mai, quero assistir Severance" para `mai_agent` (SC-007).

#### 5.2 Docs — CLAUDE.md raiz + coordinator/CLAUDE.md
- `CLAUDE.md` raiz: atualizar tabela de agentes (Mai ✅ Fase 022), aposentar `agents/media/` placeholder, estrutura de arquivos `agents/mai/`.
- `coordinator/CLAUDE.md`: adicionar `mai_agent`.

---

## Fase 6 — Frontend: Foundation

### Wave 6 · Sem bloqueio (paralela com fases 1–5)

#### 6.1 `webapp/frontend/src/pages/mai/types.ts`

```ts
type MaiStatus     = 'quero_assistir' | 'assistindo' | 'concluida' | 'pausada' | 'abandonada'
type MaiView       = 'home' | 'catalogo' | 'diario' | 'detalhe' | 'watchlist' | 'proximos' | 'stats'
type PosterKey     = 'periwinkle' | 'dusk' | 'amber' | 'slate' | 'wine' | 'teal' |
                     'moss' | 'rose' | 'indigo' | 'sand' | 'steel' | 'plum'
type Density       = 'Grande' | 'Médio' | 'Compacto'
type Accent        = 'Periwinkle' | 'Rosa' | 'Ouro' | 'Noir'

interface Series { id, tmdb_id, imdb_id, title, title_original, network, first_air_year,
                   series_status, status, rating, episodes_watched, episodes_count,
                   seasons_count, poster_url, backdrop_url, overview, genres, tags, notes,
                   fav, date_started, date_finished, created_at, updated_at, next_episode, pos }
interface Season  { season_number, name, episode_count, watched_count, air_date, poster_url }
interface Episode { series_id, season_number, episode_number, title, air_date, still_url,
                    airing_status, watched, watched_date }
interface WatchLog { id, series_id, series_title, watched_date, season_number, ep_start, ep_end,
                     episodes_count, rating, review, poster_url }
interface SeriesDetail { series: Series; seasons: Season[]; next_episode: Episode | null;
                         recent_logs: WatchLog[] }
interface UpcomingEpisode { series_id, series_title, season_number, episode_number, title,
                             air_date, still_url, poster_url }
interface Stats { year, total_series, total_episodes, total_hours, avg_rating,
                  top_genres, top_networks, by_status, monthly: number[] }
interface Tweaks { tema: 'Escuro'|'Claro'; acento: Accent; densidade: Density; ordenacao: string }
```

**Ler primeiro:** `specs/022-mai-series/data-model.md`, `specs/022-mai-series/contracts/api-series.md`, `webapp/frontend/src/pages/akane/types.ts`.
**Critério:** `npx tsc --noEmit` passa; todas as interfaces exportadas.

#### 6.2 `webapp/frontend/src/pages/mai/mai.css` — tokens OKLCH

Tokens escopados em `.mai-shell { }`. Nunca vazar para fora.

Variáveis críticas (valores **exatos** do handoff — ver `design-guide.md §2`):
- Superfícies: `--paper` `--paper-2` `--card` `--card-2`
- Tinta: `--ink` `--ink-2` `--ink-3` `--ink-4`
- Bordas: `--line` `--line-2`
- Sombras: `--shadow-sm` `--shadow-md` `--shadow-lg` `--shadow-poster`
- Topbar/footbar: `--topbar-bg` `--footbar-bg`
- Âmbar: `--warm` `--warm-deep` `--warm-tint`
- Acento default periwinkle: `--mai` `--mai-deep` `--mai-bright` `--mai-tint` `--mai-tint-2` `--accent-h: 270`
- Estrelas (cor **fixa**, não segue acento): `--star` `--star-deep` `--star-empty`
- Coração: `--heart`
- Heatmap: `--heat-0..4`
- Glow: `--glow`
- Status: `--st-assistindo` `--st-concluida` `--st-quero_assistir` `--st-pausada` `--st-abandonada`
- Raios: `--r-sm` `--r-md` `--r-lg` `--r-xl`
- Pôster: `--poster-w: 136px`
- Fontes: `--display` (Fraunces) · `--sans` (DM Sans) · `--mono` (DM Mono)

Adicionalmente:
- `[data-accent='rosa']` `[data-accent='ouro']` `[data-accent='noir']` — overrides de `--mai`, `--mai-deep`, `--heat-*`, `--accent-h`
- `[data-theme='light']` — overrides completos de superfície/tinta/linha/âmbar/acento/estrelas
- `[data-density='large']` `'medium'` `'compact'` — `--poster-w: 180px | 136px | 96px`
- Shell grid: `display:grid; grid-template-columns: 240px 1fr; grid-template-rows: 1fr auto; height:100vh`
- `.mai-topbar { height: 56px; backdrop-filter: blur(12px); }`
- `.footbar { grid-column: 1/3; height: 70px; backdrop-filter: blur(16px); }`
- PosterCard hover: `transform: translateY(-5px) scale(1.015); transition: 200ms cubic-bezier(.3,.7,.4,1)`
- `@keyframes pulse` (dot âmbar do próximo ep), `modal-in`, `scrim-in`, `toast-in`
- Responsivo: `@media (max-width: 900px)` sidebar 64px; `860px` portrait oculto; `720px` footbar-info oculto

**Ler primeiro:** `specs/022-mai-series/design-guide.md` (§2 inteiro), `specs/022-mai-series/design_handoff_mai_series/mai/styles.css` (**fonte de verdade dos valores exatos**), `webapp/frontend/src/pages/akane/akane.css` (padrão de CSS escopado).
**Critério:** `.mai-shell` existe; `--mai-deep` = `oklch(0.78 0.14 272)` em dark mode (não `0.52`!); `--st-assistindo` definido (não `--status-assistindo`); sidebar 240px; topbar 56px; footbar 70px; `npm run dev` sem erro CSS.

#### 6.3 `webapp/frontend/src/pages/mai/maiApi.ts` — client tipado

```ts
export const maiApi = {
  // Leitura
  list:     (p?: { status?, genre?, sort?, limit? }) => api.get<{ series: Series[], total: number }>('/api/series', p),
  watchlist:()                                        => api.get<{ series: Series[] }>('/api/series/watchlist'),
  diary:    (limit = 50, series_id?: string)          => api.get<{ logs: WatchLog[] }>(`/api/series/diary?limit=${limit}${series_id ? `&series_id=${series_id}` : ''}`),
  upcoming: (days = 14)                               => api.get<{ episodes: UpcomingEpisode[] }>(`/api/series/upcoming?days=${days}`),
  stats:    (year?: number)                           => api.get<Stats>(`/api/series/stats${year ? `?year=${year}` : ''}`),
  search:   (q: string)                               => api.get<{ results: any[] }>(`/api/series/search?q=${encodeURIComponent(q)}`),
  detail:   (id: string)                              => api.get<SeriesDetail>(`/api/series/${id}`),
  episodes: (id: string, season: number)              => api.get<{ episodes: Episode[] }>(`/api/series/${id}/seasons/${season}/episodes`),

  // Mutação
  add:          (body: { title?: string; tmdb_id?: number; status?: MaiStatus; year?: number }) => api.post<{ series: Series }>('/api/series', body),
  logWatch:     (id: string, body: Partial<{ watched_date, season_number, ep_start, ep_end, episodes_count, rating, review }>) => api.post<{ log: WatchLog; series: Series }>(`/api/series/${id}/log`, body),
  updateStatus: (id: string, status: MaiStatus)       => api.patch<{ series: Series }>(`/api/series/${id}/status`, { status }),
  rate:         (id: string, rating: number)           => api.patch<{ series: Series }>(`/api/series/${id}/rating`, { rating }),
  setNotes:     (id: string, notes: string)            => api.patch<{ series: Series }>(`/api/series/${id}/notes`, { notes }),
  syncMetadata: (id: string)                           => api.post<any>(`/api/series/${id}/sync-metadata`, {}),
  deleteSeries: (id: string)                           => api.del<void>(`/api/series/${id}`),
  deleteLog:    (id: string, logId: string)            => api.del<void>(`/api/series/${id}/logs/${logId}`),
}
```

**Critério:** `npx tsc --noEmit` sem erro; nenhum `fetch()` direto.

---

## Fase 7 — Componentes

### Wave 7a · Depende de 6.1, 6.2 (componentes primitivos — paralelas)

Todos lêem `specs/022-mai-series/design_handoff_mai_series/mai/ui.jsx` antes de implementar.

#### 7.1 Componentes primitivos — `components/`

| Arquivo | Base em ui.jsx | Notas-chave |
|---------|---------------|-------------|
| `Icon.tsx` | `ICONS` object | 21 paths SVG inline; `stroke="currentColor"` `fill="none"` |
| `Stars.tsx` | `Stars` component | Overlay clip: camada vazia (`--star-empty`) + camada preenchida clipped (`--star`). 3 tamanhos: sm/md/lg |
| `Score.tsx` | `Score` | Uma ★ + número DM Mono; `null` → `—` em `--ink-4` |
| `RateInput.tsx` | `RateInput` | 5 estrelas interativas; cada uma com `.rate-half.l/.r` invisible para meia estrela; botão "limpar" |
| `StatusChip.tsx` | `StatusChip` | `--st-{status}` para cor; variante `onPoster` com `backdrop-filter: blur(6px)` |
| `EpisodeProgress.tsx` | `EpisodeProgress` | Barra 7px; âmbar pulsante (`.pulse`) quando `next_episode`; "Concluída ✓" quando done; variante `compact` |
| `PosterCard.tsx` | `PosterCard` | Fallback teatral: `POSTER[key]` gradiente `linear-gradient(155deg, a, b)`; kicker (gênero 8px mono); Fraunces tamanho adaptativo; `p-prog` bar âmbar 4px; chips sobrepostos |
| `Heatmap.tsx` | `Heatmap` | Grade mensal `grid-auto-flow: column`; células 10×10px `--heat-{0..4}`; lead cells para alinhamento |
| `Spark.tsx` | `Spark` | 21 barras 24px altura; `count ≥ 70% max` → `--mai` (`.hot`); demais `--mai-tint-2` |
| `ListStats.tsx` | `ListStats` | Barra empilhada horizontal por `--st-{status}` + 2 colunas abaixo (totais) |
| `FavoriteSeries.tsx` | `FavoriteSeries`+`SeriesPicker` | 4 slots 2:3; localStorage `'mai.favorites'`; modo edição: ✕ + slot "+" abre SeriesPicker modal |
| `Toast.tsx` | `Toast` | Pill gradient `--mai → --mai-deep`; bottom-right fixed; `toast-in 0.3s`; auto-dismiss 2.8s |

**Paletas POSTER** (copiar de `design_handoff_mai_series/mai/data.js`, adaptar para TS):
```ts
export const POSTER: Record<PosterKey, { a: string; b: string; ink: string }> = {
  periwinkle: { a: 'oklch(0.42 0.13 270)', b: 'oklch(0.22 0.07 280)', ink: 'oklch(0.96 0.02 270)' },
  dusk: ..., amber: ..., slate: ..., wine: ..., teal: ...,
  moss: ..., rose: ..., indigo: ..., sand: ..., steel: ..., plum: ...
}
```

#### 7.2 `SeasonAccordion.tsx` + `EpisodeLine.tsx` ⭐

`SeasonAccordion` — componente **exclusivo** da Mai, sem equivalente em outros shells:

- Abre na temporada do `series.next` (ou última temporada se sem próximo).
- `[loaded, setLoaded] = useState(isOpen)` — lazy: `useEffect(() => { if (isOpen) setLoaded(true) })`.
- Episódios só buscados via `maiApi.episodes()` após 1ª abertura.
- `epLimit = 5` inicial; botão "Carregar mais (+N)" → `epLimit += 8`.
- Chevron: `rotate(0deg)` → `rotate(90deg)` 0.2s. Cor `--ink-3 → --mai-deep`.
- Accordeão CSS: `max-height: 0 → 1600px` 0.26s ease-out + `opacity: 0 → 1` 0.22s.
- `.season-head` grid: `22px 1fr auto`. `.season-body-inner` borda `--line-2`.

`EpisodeLine` — grid `18px 96px 1fr auto`:
- `.epi-dot` 9px: verde (`--st-concluida`) se watched, âmbar com glow (`--warm`) se next, `--ink-4` default.
- `.epi-still` 96×54px `border-radius: 8px`; gradiente dusk fallback + 📺 + `E{n}` Fraunces.
- Clique → `openLog(series.id, season.n, ep.number)`.
- Estados: `.watched` (título muted + check), `.next` (âmbar + "logar"/"em breve"), agendado (📅 "agendado").

**Critério:** `SeasonAccordion` renderiza lista de temporadas; lazy-load só busca episódios ao expandir; "Carregar mais" adiciona 8 por vez; chevron anima; Toast some após 2.8s; PosterCard exibe gradiente teatral quando `poster_url=null`; StatusChip usa `--st-{status}`.

---

## Fase 8 — Telas

### Wave 8 · Depende de 7.1, 7.2, 6.3

Todas lêem `specs/022-mai-series/design-guide.md §7` (tela correspondente) e o JSX do handoff antes de implementar.

#### 8.1 Telas — `screens/`

| Arquivo | Endpoint principal | Destaques |
|---------|------------------|-----------|
| `HomeScreen.tsx` | `maiApi.list()` + `maiApi.diary()` + `maiApi.upcoming()` + `maiApi.stats()` | Hero (banner última série logada; warmlight âmbar radial mix-blend:screen; portrait `mai-hero.png` hidden <860px); stat-row 3 cards; profile-split `1.3fr 1fr` (FavoriteSeries + ListStats); carrossel "Assistindo agora"; home-split `1.5fr 1fr` (Em andamento + Painel atividade+próximos); carrossel "Esperando na fila" |
| `CatalogScreen.tsx` | `maiApi.list(params)` | Chips filtro por status; sort (Atualizado/Adicionado/Nota/Título/Progresso); grid `auto-fill minmax(--poster-w, 1fr)` de PosterCards; `.pm-sub` Score + "TxEy / N eps" |
| `DiaryScreen.tsx` | `maiApi.diary(50)` | Grupos por mês; diary-row grid `52px 46px 1fr auto`; `.dr-day` Fraunces 24px; `.dr-eps` mono âmbar; `.dr-note` itálico |
| `WatchlistScreen.tsx` | `maiApi.watchlist()` | `.wl-item` flex; pôster 56px; `.wl-right` btn-warm "▶ Começar" → openLog(id,1,1) |
| `UpcomingScreen.tsx` | `maiApi.upcoming(14)` | Agrupado por data; `.sdl-name` Fraunces; "Hoje" em `--warm-deep`; `.sched-card` still 96×54 + série + ep mono âmbar + badge "novo ep" |
| `StatsScreen.tsx` | `maiApi.stats(year)` | Year-switch Fraunces clamp(40-58px) + ◀▶; big-stat-row 4 colunas Fraunces 44px `--mai-deep`; barras por mês (bars chart 160px); stats-grid 2×2 (por status com `--st-*`, top gêneros `--mai`, top redes `--warm`, Destaque); Heatmap |
| `DetailScreen.tsx` | `maiApi.detail(id)` | `detail-banner` (poster 160px + título Fraunces clamp 30-46px + rating Stars lg + Heart + StatusChip md + ações); `detail-body` (detail-grid `1.35fr 1fr`; col esquerda: sinopse, notes-block `borda-left --mai` tag "🐰", **SeasonAccordion**, histórico timeline; col direita: ficha meta-grid 2×3, gêneros) |

**Critério:** Todas as 7 telas renderizam sem erro; CatalogScreen filtra por chip; StatsScreen muda ano; DetailScreen exibe SeasonAccordion; UpcomingScreen "Hoje" em âmbar.

---

## Fase 9 — Modais

### Wave 9 · Depende de 7.1, 6.3 (paralela com Wave 8)

#### 9.1 Modais — `modals/`

**`LogWatchModal.tsx`**
- Presets: `seriesId`, `season`, `ep` (pré-preenchidos quando aberto de EpisodeLine/botão "Logar TxEy").
- `<details class="pick-fold">` para trocar de série (busca TMDB debounce 440ms + seriespick scroll horizontal).
- Ep-range grid `1fr 1fr 1fr`: `<select>` temporada (labels "Temporada N" ou `se.name`), inputs `ep_start` / `ep_end` (valida `ep_end ≥ ep_start`).
- Date input `max=today`, `RateInput`, toggle Favorita, textarea Review.
- `⌘/Ctrl+Enter` → submete; `Esc` → fecha.
- Toast pós-log: `"Sessão logada · N episódios 📺"` ou `"{Título} — concluída ✓"`.

**`AddSeriesModal.tsx`**
- Busca TMDB debounce **440ms** → lista com pôster 42px + título + rede + ano.
- `in_catalog: true` → chip "já na lista" (não mostra "+ Adicionar").
- Ao adicionar: `status='quero_assistir'`, toast, navega para Detalhe.
- Texto estático: `"A série entra como Quero assistir. 🌙"`.

**`SeriesPicker.tsx`** (para FavoriteSeries)
- Grid `auto-fill minmax(98px, 1fr)` de pôsteres do catálogo local (não TMDB).
- Busca por título/rede; `Esc` fecha.

**`NextBar.tsx`** (footbar — sempre visível quando `upcoming.length > 0`)
- `grid-column: 1/3`, 70px, `--footbar-bg` backdrop blur 16px.
- Índice cíclico: botões `‹ ›` alternam episódio exibido.
- `.fb-label` "Próximo ep" mono âmbar; `.fb-still` 62×38 gradiente; `.footbar-title` Fraunces 17px; `.footbar-sub` mono âmbar.
- "Já vi" btn-primary → `openLog(seriesId, season, ep)`.
- Oculto em `< 720px` (`.footbar-info display:none`).

**Ler primeiro:** `specs/022-mai-series/design_handoff_mai_series/mai/logmodal.jsx` (implementação referência), `specs/022-mai-series/design-guide.md §6`, `webapp/frontend/src/pages/akane/modals/LogModal.tsx` (padrão de modal).
**Critério:** `⌘↵` submete LogWatchModal; `Esc` fecha; debounce 440ms em AddSeriesModal (máx 1 chamada/440ms); NextBar aparece quando upcoming > 0; FavoriteSeries persiste em localStorage após reload.

---

## Fase 10 — Shell

### Wave 10 · Depende de Waves 8 + 9

#### 10.1 `webapp/frontend/src/pages/mai/MaiShell.tsx`

State-based routing (não React Router interno). Estado:
```ts
const [route, setRoute]   = useState<{ view: MaiView; param: string | null }>({ view: 'home', param: null })
const [query, setQuery]   = useState('')
const [tweaks, setTweaks] = useTweaks('mai-tweaks', TWEAK_DEFAULTS)
const [modal, setModal]   = useState({ open: false, seriesId?: string, season?: number, ep?: number })
const [addOpen, setAddOpen] = useState(false)
const [toast, setToast]   = useState('')
```

`TWEAK_DEFAULTS = { tema: 'Escuro', acento: 'Periwinkle', densidade: 'Médio', ordenacao: 'Atualizado' }`

Map de acento → `data-accent`: `{ 'Periwinkle': '', 'Rosa': 'rosa', 'Ouro': 'ouro', 'Noir': 'noir' }`.

**Sidebar** (240px):
- `.side-brand`: avatar `mai-hero.png` 46px + `box-shadow: var(--glow)`; nome "🐰 Mai" Fraunces 23px; "Séries" DM Mono 9.5px uppercase.
- `.side-log-btn`: gradient `--mai → --mai-deep`; abre `LogWatchModal` sem pré-seleção.
- Nav grupos "Acervo" (Início / Catálogo / Diário / Quero assistir) e "Descobrir" (Próximos eps / Estatísticas) com contadores.
- Quote: *"Toda série é uma performance de longo curso."* Fraunces itálica.
- "Voltar à Makima" → `window.location.href = '/'`.
- Colapsa a 64px (só ícones) em `< 900px`.

**Topbar** (56px): emoji + título tela ativa (Fraunces 21px); busca pill (busca empurra para Catálogo; limpa ao navegar); botão `+` → AddSeriesModal.

**Regras de navegação:** clique em pôster → `navigate('detalhe', id)`; ao navegar → scroll to top; sair do Catálogo → limpa query; `detalhe` → nav ativo = `catalogo`.

**Ler primeiro:** `specs/022-mai-series/design_handoff_mai_series/mai/app.jsx` (**referência direta**), `webapp/frontend/src/pages/akane/AkaneShell.tsx` (padrão de shell), componentes e telas quando implementados.
**Critério:** Shell renderiza; sidebar 6 nav items com contadores; acento Periwinkle no 1º load (`data-accent` vazio); sidebar colapsa `< 900px`; NextBar visível quando há upcoming; tweaks persistem após reload.

---

## Fase 11 — Wiring final e assets

### Wave 11 · Depende de 10.1

#### 11.1 `webapp/frontend/src/App.tsx` — rota `/series/*`
```tsx
import { MaiShell } from './pages/mai/MaiShell'
// Antes do catch-all /*:
<Route path="/series/*" element={<MaiShell />} />
```
**Critério:** `http://localhost:5173/series` → MaiShell renderiza; recarregar `/series/catalogo` não redireciona para 404.

#### 11.2 `webapp/frontend/src/components/Layout.tsx` — entrada Mai
```ts
{
  character:   'Mai',
  label:       'Séries',
  mainPath:    '/series',
  activePaths: ['/series'],
  color:       'var(--c-mai)',
  colorDim:    'var(--c-mai-dim)',
}
```

#### 11.3 `webapp/frontend/src/index.css` — tokens globais
```css
--c-mai:     oklch(0.66 0.17 270);   /* periwinkle */
--c-mai-dim: oklch(0.66 0.17 270 / 0.16);
```

#### 11.4 Asset `mai-hero.png`
Copiar `specs/022-mai-series/design_handoff_mai_series/mai/mai-hero.png`
→ `webapp/frontend/public/mai/mai-hero.png`.
Referenciar em `MaiShell.tsx` como `<img src="/mai/mai-hero.png" />`.

---

## Regras de implementação (não violar)

1. **Tools:** pure functions, retornam `{"status": "ok"|"error"}`. HTML no campo `message`.
2. **Router FastAPI:** `Depends(require_user)` em **todas** as rotas. Rotas fixas **antes** de `/{id}`. Nenhuma lógica de domínio no router.
3. **CSS escopado:** tudo em `.mai-shell { }`. Nunca vazar. `--st-{status}` (nunca `--status-*`).
4. **Token `--mai-deep` em dark mode = `oklch(0.78 0.14 272)`** — é mais claro que `--mai` (contraste sobre escuro). Não confundir com light mode.
5. **Bearer v4** para TMDB: `Authorization: Bearer {TMDB_TOKEN}` — não v3 query-param.
6. **Temporada 0 ("Specials")** nunca inserida em `seasons` ou `episodes`.
7. **localStorage `'mai.favorites'`** (max 4). **localStorage `'mai-tweaks'`** para tweaks.
8. **SeasonAccordion é lazy** — episódios só buscados na 1ª abertura.
9. **Pôster 2:3** (`aspect-ratio: 2/3`). Still/hero 16:9.
10. **Escala 0.5–5.0** (não 0–10 da Marin). Cor de estrela **fixa** (não segue acento).
11. **Sem branch nova** — commitar direto em master.
12. **Singleton** (não factory) — padrão Akane/Frieren.

---

## Verificação end-to-end

### Backend

```bash
# 1. Aplicar schema
docker exec makima-web sh -c "cd /app && python -m scripts.setup_schemas"

# 2. Smoke test
python -c "
from agents.mai.tools import search_series, add_series, log_watch, get_stats, sync_metadata
print(add_series(tmdb_id=95396))        # SC-001
print(log_watch('Severance', 1, 1, 2)) # SC-002
print(sync_metadata('Severance'))       # SC-003
print(get_stats(year=2020))             # SC-005 — zeros sem erro
"

# 3. Telegram: "Mai, quero assistir Severance" → HTML com "Mai:"  (SC-007)
```

### Frontend

```bash
cd webapp/frontend && npm run dev
# Navegar para /series

# Checklist:
# [ ] Hero com portrait mai-hero.png + warmlight âmbar radial
# [ ] Sidebar colapsa para 64px em viewport < 900px
# [ ] Acento Periwinkle no 1º load (data-accent="" no .mai-shell)
# [ ] CatalogScreen: chips de status filtram; grid ajusta com densidade
# [ ] DetailScreen: SeasonAccordion abre na temporada do next_episode
# [ ] SeasonAccordion: lazy (episódios não buscados até expandir)
# [ ] SeasonAccordion: "Carregar mais" mostra mais 8 eps
# [ ] Chevron animado 90° ao expandir temporada
# [ ] LogWatchModal: ⌘↵ submete; Esc fecha; toast 2.8s
# [ ] AddSeriesModal: debounce 440ms; "já na lista" badge
# [ ] FavoriteSeries: 4 slots; persiste localStorage 'mai.favorites' após reload
# [ ] NextBar visível quando upcoming > 0; switch ‹ › cíclico
# [ ] Tema claro/escuro sem vazamento fora de .mai-shell
# [ ] Tweaks: trocar acento → data-accent atualiza imediatamente
# [ ] StatsScreen: year-switch muda ano; Heatmap renderiza

npm run type-check   # npx tsc --noEmit
```

### SCs mapeados por task

| SC | Verificação | Task |
|----|------------|------|
| SC-001 | `add_series(tmdb_id=95396)` → pôster, `quero_assistir` | #5 |
| SC-002 | `log_watch()` → `watch_logs` + `episodes_watched=2` | #5 |
| SC-003 | `sync_metadata()` 2× → eps antigos pulados | #4, #5 |
| SC-004 | `TMDB_TOKEN` ausente → erro claro, sem traceback | #4, #5 |
| SC-005 | `get_stats(year=2020)` → zeros sem erro | #5 |
| SC-006 | `get_upcoming(days=7)` → eps agendados com still | #5 |
| SC-007 | Makima roteia "séries" → `mai_agent`; resposta HTML "Mai:" | #8 |
| SC-008 | Soft delete → `watch_logs` preservados | #5 |
| SC-009 | `sync_metadata` → `season_number=0` não criada | #4, #5 |

---

## Estimativa de esforço

| Fase | Arquivos | LOC est. |
|------|---------|---------|
| 1 — Schema + pacote | 3 | ~110 |
| 2 — TMDB metadata | 1 | ~200 |
| 3 — Tools ADK | 1 | ~380 |
| 4 — Agent + router | 4 | ~280 |
| 5 — Coordinator + docs | 2 | ~40 |
| 6 — Foundation TS/CSS/API | 3 | ~420 |
| 7 — Componentes | ~15 | ~900 |
| 8 — Telas | 7 | ~950 |
| 9 — Modais | 4 | ~500 |
| 10 — Shell | 1 | ~280 |
| 11 — Wiring + asset | 4 | ~30 |
| **Total** | **~45** | **~4.090** |
