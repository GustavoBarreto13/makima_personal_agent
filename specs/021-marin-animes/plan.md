# Plano de Implementação — Marin Kitagawa (fatia 021)

**Status:** Pronto para executar  
**Ambiguidade:** 0.102 (gate ≤ 0.20 ✓)  
**Estimativa:** ~46 arquivos · ~5.850 LOC  

---

## Contexto

A infraestrutura de dados da Marin já existe e está commitada:

| Arquivo | O que tem |
|---------|-----------|
| `agents/marin/schema_pg.sql` | 4 tabelas: `anime`, `watch_logs`, `episodes`, `mal_sync_state` |
| `agents/marin/metadata.py` | Clientes Jikan, AniList, ARM, TMDB — `search_anime()`, `enrich_anime()` |
| `agents/marin/mal_auth.py` | MALAuth — OAuth2 PKCE, rotação de token via PostgreSQL |
| `agents/marin/mal_sync.py` | Delta pull do MAL → upsert em `anime` |

**O que falta:**
1. Backend: `tools.py` + `agent.py` + `authorize_mal.py` + wiring no coordinator
2. Frontend completo: CSS + tipos + API client + router FastAPI + shell + 15 componentes + 6 telas + 3 modais

---

## Referências críticas (ler antes de implementar)

| Arquivo | Papel |
|---------|-------|
| `specs/021-marin-animes/spec.md` | FR-001–018, 9 SCs, edge cases — define "done" |
| `specs/021-marin-animes/design-guide.md` | Fonte de verdade visual: tokens OKLCH, dimensões, componentes, telas |
| `specs/021-marin-animes/data-model.md` | DDL completo + mapeamentos de enums |
| `specs/021-marin-animes/design_handoff_marin_animes/marin/ui.jsx` | Componentes primitivos: Icon, Stars, RateInput, PosterCard, etc. |
| `specs/021-marin-animes/design_handoff_marin_animes/marin/app.jsx` | Shell, sidebar, roteamento, TWEAK_DEFAULTS, addLog, doSync |
| `specs/021-marin-animes/design_handoff_marin_animes/marin/data.js` | Paletas POSTER, estrutura de dados, STATUS_VAR |
| `agents/marin/metadata.py` | `search_anime()`, `enrich_anime()` — chamar em tools.py |
| `agents/marin/mal_sync.py` | `sync_mal()` — chamar em tools.py |
| `agents/akane/tools.py` | Padrão de tools: pure functions, `{"status": "ok"|"error", ...}` |
| `webapp/backend/routers/movies.py` | Padrão de router: `_check_result()`, Pydantic, `require_user` |
| `webapp/frontend/src/pages/akane/AkaneShell.tsx` | Padrão de shell: state-based routing, tweaks localStorage |
| `webapp/frontend/src/lib/api.ts` | `api.get<T>`, `api.post<T>` etc — usar em marinApi.ts |

---

## Fase 1 — Backend

### Wave 1 · Paralelas

#### 1.1 `scripts/setup_schemas.py` — registrar schema da Marin

**Ação:** Adicionar `"agents/marin/schema_pg.sql"` à lista `SCHEMA_FILES`.  
**Ler primeiro:** `scripts/setup_schemas.py` (ver como akane/frieren estão listados).  
**Critério:** `setup_schemas.py` contém `agents/marin/schema_pg.sql` na lista; rodando `python -m scripts.setup_schemas` dentro do container cria as 4 tabelas sem erro.

#### 1.2 `scripts/authorize_mal.py` — PKCE OAuth bootstrap

**Ação:** Script interativo que gera `code_verifier` + `code_challenge`, abre URL de autorização, captura o `code` de callback, troca por access+refresh token via POST para `https://myanimelist.net/v1/oauth2/token`, persiste em `mal_sync_state` via INSERT ON CONFLICT DO UPDATE. Imprime os 3 valores gerados: `MAL_ACCESS_TOKEN`, `MAL_REFRESH_TOKEN`, `MAL_TOKEN_EXPIRY`.  
**Ler primeiro:** `scripts/authorize_calendar.py` (padrão de fluxo OAuth interativo), `agents/marin/mal_auth.py` (MALAuth — entender a estrutura esperada em `mal_sync_state`), `specs/021-marin-animes/research.md` §R1 (endpoints MAL OAuth2).  
**Critério:** `python -m scripts.authorize_mal` completa sem erro; linha em `mal_sync_state` com `access_token`, `refresh_token`, `token_expiry` não nulos; tokens nunca escritos em arquivo (FR-012).

---

### Wave 2 · Depende de 1.1

#### 1.3 `agents/marin/tools.py` — 14 tools ADK

**Ação:** Implementar as 14 tools abaixo como pure functions que retornam `{"status": "ok"|"error", ...}`. Incluir helper `_norm(s)` para fuzzy match e `_find_anime_by_query(query, conn)` análogo ao `_find_movie_by_query` de akane. Retornar HTML formatado para Telegram no campo `message`; campos estruturados usados pelo router FastAPI.

| Tool | Assinatura | O que faz |
|------|-----------|-----------|
| `search_anime` | `(query: str, limit: int = 5)` | Busca Jikan por título — chama `metadata.search_anime()` |
| `add_anime` | `(mal_id: int)` | Enriquece + upserta em `anime` — chama `metadata.enrich_anime()` |
| `log_watch` | `(anime_id_or_query: str, ep_start: int, ep_end: int, watched_date: str = None, rating: float = None, notes: str = None)` | Insere `watch_logs`, avança `episodes_watched`, marca `episodes.watched=True`, infere `date_started`/`date_finished` |
| `get_currently_watching` | `()` | SELECT anime WHERE status='assistindo' ORDER BY updated_at DESC |
| `get_watchlist` | `()` | SELECT anime WHERE status='quero_assistir' ORDER BY updated_at DESC |
| `update_anime_status` | `(query: str, status: str)` | UPDATE anime.status (valida enum: assistindo/completo/quero_assistir/pausado/abandonado) |
| `rate_anime` | `(query: str, score: float)` | UPDATE anime.score — valida 0–10, passo 0.5 (FR-005) |
| `get_anime_details` | `(query: str)` | anime + next_episode + últimos 5 watch_logs |
| `get_airing_schedule` | `(days: int = 14)` | episodes WHERE aired ≤ today+N AND anime.status='assistindo' |
| `get_stats` | `(year: int = None)` | total animes, eps, horas, avg_score, top_genres/studios, monthly, by_status — zeros se vazio (SC-007) |
| `get_watch_history` | `(query: str = None, limit: int = 50)` | watch_logs todos ou filtrados por anime |
| `sync_mal` | `(full: bool = False)` | Chama `mal_sync.sync_mal(full=full)` — retorna contagens criados/atualizados |
| `delete_anime` | `(query: str)` | UPDATE anime SET deleted=TRUE WHERE id=... (soft delete — preserva logs) |
| `delete_watch_log` | `(log_id: str)` | DELETE FROM watch_logs WHERE id=log_id |

**Ler primeiro:** `agents/akane/tools.py` (padrão de tools, `_find_movie_by_query`, conexão PostgreSQL), `agents/marin/metadata.py`, `agents/marin/mal_sync.py`, `specs/021-marin-animes/spec.md` §FR e §SC, `agents/marin/schema_pg.sql`.  
**Critério:** `from agents.marin.tools import search_anime, add_anime, log_watch, get_stats` sem ImportError; `search_anime("Dungeon Meshi")` retorna lista com `mal_id=52701` (SC-001); `log_watch(...)` insere linha em `watch_logs` e avança `episodes_watched` (SC-002); `get_stats()` com banco vazio retorna zeros sem erro (SC-007).

#### 1.4 `agents/marin/agent.py` — singleton ADK

**Ação:** Singleton (não factory — padrão Akane/Frieren). Modelo `gemini-2.5-flash`. Sem MCP. `_MARIN_INSTRUCTION` em português, personalidade Marin Kitagawa de "Sua Conduta Foi Adorável" — gyaru entusiasta de anime/cosplay. Toda resposta começa com "Marin:". Formato HTML (não markdown). Emojis: ✨🎀💖📺🌸🎌⭐. Tools: as 14 de `tools.py`.

```python
marin_agent = Agent(
    name="marin",
    model="gemini-2.5-flash",
    description="Cuida do catálogo de animes e diário de sessões de episódios.",
    instruction=_MARIN_INSTRUCTION,
    tools=[search_anime, add_anime, log_watch, get_currently_watching,
           get_watchlist, update_anime_status, rate_anime, get_anime_details,
           get_airing_schedule, get_stats, get_watch_history,
           sync_mal, delete_anime, delete_watch_log],
)
```

**Ler primeiro:** `agents/akane/agent.py` (padrão singleton), `agents/frieren/agent.py` (padrão singleton sem MCP), `agents/marin/tools.py`.  
**Critério:** `from agents.marin.agent import marin_agent` sem erro; `marin_agent.name == "marin"`; `len(marin_agent.tools) == 14`.

#### 1.5 `agents/marin/CLAUDE.md` — documentação do agente

**Ação:** Documentar: tools disponíveis (tabela nome → o que faz), schema PostgreSQL (4 tabelas), personalidade e emojis, formatação HTML, como fazer smoke test. Seguir estrutura de `agents/akane/CLAUDE.md`.  
**Ler primeiro:** `agents/akane/CLAUDE.md` (template de estrutura), `agents/marin/tools.py` (quando implementado).  
**Critério:** Arquivo existe em `agents/marin/CLAUDE.md`; tem seções: Tools, Schema, Personalidade, Smoke test.

---

### Wave 3 · Depende de 1.4

#### 1.6 `coordinator/agent.py` — wiring Marin

**Ação:** Adicionar `from agents.marin.agent import marin_agent` no bloco de imports. Adicionar `marin_agent` à lista `sub_agents`. Adicionar linha ao `_MAKIMA_INSTRUCTION` descrevendo o domínio da Marin: "Marin: catálogo de animes, diário de episódios, sync MAL, schedule de lançamentos, watchlist." Keywords de roteamento: anime, animes, episódio, temporada, watchlist, MAL, assistindo, watch.  
**Ler primeiro:** `coordinator/agent.py` (estrutura atual: imports, sub_agents, _MAKIMA_INSTRUCTION).  
**Critério:** `coordinator/agent.py` contém `from agents.marin.agent import marin_agent`; `marin_agent` na lista `sub_agents`; `_MAKIMA_INSTRUCTION` menciona "Marin" com keywords de roteamento; bot Telegram roteia "Marin, quero ver Dungeon Meshi" para marin_agent e responde em HTML com "Marin:" (SC-008).

#### 1.7 Docs raiz — atualizar entradas da Marin

**Ação:** Em `CLAUDE.md` raiz: atualizar tabela de agentes (Marin: status `✅ Fase 021`, link `agents/marin/CLAUDE.md`), estrutura de arquivos (adicionar `agents/marin/` com todos os arquivos). Em `coordinator/CLAUDE.md`: adicionar `marin_agent` na lista de imports e na tabela de sub-agentes.  
**Ler primeiro:** `CLAUDE.md` (tabela de agentes atual), `coordinator/CLAUDE.md` (lista de imports).  
**Critério:** `CLAUDE.md` raiz lista Marin como ✅; `coordinator/CLAUDE.md` menciona marin_agent.

---

## Fase 2 — Frontend: Foundation

### Wave 4 · Paralelas (não depende de fase 1)

#### 2.1 `webapp/frontend/src/pages/marin/types.ts` — interfaces TypeScript

**Ação:** Definir todas as interfaces conforme `design-guide.md` §8 e `data-model.md`:

```ts
// Enums
type Status = 'assistindo' | 'completo' | 'quero_assistir' | 'pausado' | 'abandonado'
type PosterKey = 'magenta' | 'sakura' | 'cyan' | 'gold' | 'violet' | 'emerald' |
                 'amber' | 'rose' | 'indigo' | 'teal' | 'crimson' | 'slate'
type MarinView = 'home' | 'catalogo' | 'diario' | 'watchlist' | 'lancamentos' | 'stats' | 'detalhe'
type Density = 'Grande' | 'Médio' | 'Compacto'
type Accent = 'Rosa-Magenta' | 'Sakura' | 'Neon' | 'Gold'

// Entidades
interface Anime { id, mal_id, title, title_en, synopsis, poster_url, poster_key, status,
                  episodes_watched, episodes_total, score, genres, studios, season, year,
                  is_airing, fav, deleted, created_at, updated_at, next_episode }
interface Episode { id, anime_id, number, title, aired, watched, thumbnail_url }
interface WatchLog { id, anime_id, anime_title, ep_start, ep_end, watched_date, score, notes }
interface MalProfile { username, avatar_url, stats: { watching, completed, on_hold, dropped, plan_to_watch, days_watched, mean_score } }
interface Stats { total_animes, total_episodes, total_hours, avg_score, by_status, top_genres, top_studios, monthly, highlight_anime }
interface ScheduleItem { anime_id, anime_title, episode_number, episode_title, airs_at_jst, airs_at_brt, thumbnail_url }
interface SyncResult { created, updated, deleted, last_sync }
interface HomeData { last_session, currently_watching, recent_logs, schedule_today, stats_quick }
interface Tweaks { tema: 'Escuro'|'Claro', acento: Accent, densidade: Density, ordenacao: string }
```

**Ler primeiro:** `specs/021-marin-animes/data-model.md`, `specs/021-marin-animes/design-guide.md` §8, `webapp/frontend/src/pages/akane/types.ts` (se existir — padrão de interface).  
**Critério:** `npx tsc --noEmit` passa; todas as interfaces exportadas usadas sem erro de tipo em marinApi.ts e componentes.

#### 2.2 `webapp/frontend/src/pages/marin/marin.css` — tokens OKLCH

**Ação:** Tokens escopados em `.marin-shell`. Nunca vazar para fora. Seguir `design-guide.md` §2 exatamente. Nomes de variáveis críticos:

- Superfícies: `--paper`, `--paper-2`, `--card`, `--card-2`, `--mist`
- Texto: `--ink`, `--ink-2`, `--ink-3`, `--ink-4`
- Bordas: `--line`, `--line-2`
- Sombras: `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-poster`
- Acento padrão (Neon/cyan): `--marin`, `--marin-deep`, `--marin-bright`, `--marin-tint`, `--marin-tint-2`
- Acento alternativo fixo: `--cyan`, `--cyan-tint`
- Accents via `[data-accent]`: base rosa-magenta (sem atributo), `[data-accent='neon']`, `[data-accent='sakura']`, `[data-accent='gold']`
- Gamificação: `--star`, `--star-empty`, `--heart`
- Heatmap: `--heat-0`, `--heat-1`, `--heat-2`, `--heat-3`, `--heat-4`
- Status (crítico — não usar `--status-*`): `--st-assistindo`, `--st-completo`, `--st-quero_assistir`, `--st-pausado`, `--st-abandonado`
- Radii: `--r-sm`, `--r-md`, `--r-lg`, `--r-xl`
- Poster: `--poster-w` (184px large / 150px medium / 108px compact por density)
- Layout: `.mr-app { display: grid; grid-template-columns: 244px 1fr; }` com `.mr-side` (244px) e `.mr-main`
- Topbar: `.mr-topbar { height: 56px; }`
- NextBar: `.mr-nextbar { height: 70px; }`
- Tema claro: `[data-theme='light']` sobreescreve variáveis de superfície/texto
- Hover pôster: `.poster-card:hover { transform: translateY(-5px) scale(1.015); box-shadow: var(--shadow-poster); }`
- Animações: `@keyframes pulse`, `spin`, `modal-in`, `scrim-in`, `toast-in`
- Responsivo: `@media (max-width: 900px)` sidebar colapsa para 64px; `820px`, `720px`, `600px`

**Ler primeiro:** `specs/021-marin-animes/design-guide.md` (completo), `specs/021-marin-animes/design_handoff_marin_animes/marin/data.js` (paletas POSTER, STATUS_VAR), `webapp/frontend/src/pages/akane/akane.css` (padrão de CSS escopado).  
**Critério:** `.marin-shell` existe no CSS; `--st-assistindo` definido (não `--status-assistindo`); `--marin` = Neon/cyan no acento padrão; sidebar 244px; topbar 56px; NextBar 70px; poster 184/150/108px por density; `npm run dev` não emite erro de CSS.

#### 2.3 `webapp/frontend/src/pages/marin/marinApi.ts` — client de API tipado

**Ação:** 15 funções tipadas usando `api.get<T>()`, `api.post<T>()`, `api.patch<T>()`, `api.put<T>()` de `lib/api.ts`. Base path: `/api/animes`.

```ts
export const marinApi = {
  // Leitura
  home: ()                                      => api.get<HomeData>('/api/animes/home'),
  list: (p?: { status?: Status; sort?: string; genre?: string })
                                                => api.get<Anime[]>('/api/animes', p),
  watchlist: ()                                 => api.get<Anime[]>('/api/animes/watchlist'),
  diary: (limit = 50)                           => api.get<WatchLog[]>(`/api/animes/diary?limit=${limit}`),
  detail: (id: string)                          => api.get<AnimeDetail>(`/api/animes/${id}`),
  stats: (year?: number)                        => api.get<Stats>(`/api/animes/stats${year ? `?year=${year}` : ''}`),
  schedule: (days = 14)                         => api.get<ScheduleItem[]>(`/api/animes/schedule?days=${days}`),
  search: (q: string)                           => api.get<AnimeSearchResult[]>(`/api/animes/search?q=${encodeURIComponent(q)}`),
  favorites: ()                                 => api.get<Anime[]>('/api/animes/favorites'),

  // Mutação
  add: (body: { mal_id: number })               => api.post<Anime>('/api/animes', body),
  logWatch: (animeId: string, body: LogWatchBody) => api.post<WatchLog>(`/api/animes/${animeId}/log`, body),
  updateStatus: (animeId: string, status: Status) => api.patch<Anime>(`/api/animes/${animeId}/status`, { status }),
  rate: (animeId: string, score: number)        => api.patch<Anime>(`/api/animes/${animeId}/rating`, { score }),
  deleteAnime: (id: string)                     => api.del<void>(`/api/animes/${id}`),
  syncMal: ()                                   => api.post<SyncResult>('/api/animes/sync'),
  setFavorites: (ids: string[])                 => api.put<void>('/api/animes/favorites', { ids }),
}
```

**Ler primeiro:** `webapp/frontend/src/lib/api.ts` (assinaturas de `api.get`, `api.post`, etc.), `webapp/frontend/src/pages/akane/akaneApi.ts` (padrão de api client), `specs/021-marin-animes/types.ts` (quando implementado).  
**Critério:** `npx tsc --noEmit` sem erro de tipo; todas as 15 funções exportadas; nenhum `fetch()` direto.

---

## Fase 3 — Router FastAPI

### Wave 5 · Depende de wave 2 (tools.py)

#### 3.1 `webapp/backend/routers/animes.py` — 15 endpoints

**Ação:** Padrão idêntico a `movies.py`. Importar tools de `agents.marin.tools`. `_check_result()` helper (cópia de movies.py). `require_user` em todos. Pydantic models: `AddAnimeBody(mal_id: int)`, `LogWatchBody(ep_start, ep_end, watched_date, score, notes)`, `StatusBody(status)`, `RatingBody(score: float)`, `FavoritesBody(ids: list[str])`.

Endpoints (prefix `/api/animes`):
```
GET  /home              → home data agregada
GET  /search?q=         → search_anime()
GET  /                  → list com filtros opcionais
GET  /watchlist         → get_watchlist()
GET  /diary?limit=      → get_watch_history()
GET  /stats?year=       → get_stats()
GET  /schedule?days=    → get_airing_schedule()
GET  /favorites         → lista favoritos (IDs de localStorage via cookie/header)
PUT  /favorites         → setFavorites
POST /                  → add_anime()
POST /sync              → sync_mal()
GET  /{id}              → get_anime_details()
POST /{id}/log          → log_watch()
PATCH /{id}/status      → update_anime_status()
PATCH /{id}/rating      → rate_anime()
DELETE /{id}            → delete_anime()
```

**Ler primeiro:** `webapp/backend/routers/movies.py` (estrutura completa: `_check_result`, Pydantic, `require_user`), `agents/marin/tools.py` (assinaturas das 14 tools), `webapp/backend/main.py` (como movies.py está registrado).  
**Critério:** `GET /api/animes/search?q=Dungeon` retorna 200 com lista; `POST /api/animes` com `{"mal_id": 52701}` retorna 200 com anime criado; todas as rotas com `Depends(require_user)`; nenhuma lógica de domínio no router (só delegação).

#### 3.2 `webapp/backend/main.py` — registrar router

**Ação:** Adicionar import e `app.include_router(animes_router.router, prefix="/api/animes", tags=["animes"])`.  
**Ler primeiro:** `webapp/backend/main.py` (ver onde movies router está registrado — replicar padrão).  
**Critério:** `main.py` contém `include_router(..., prefix="/api/animes")`; `/api/animes/search?q=test` responde (não 404).

---

## Fase 4 — Shell + UI

### Wave 6 · Componentes primitivos (paralelas, depende de wave 4)

#### 4.1 Componentes primitivos — `webapp/frontend/src/pages/marin/components/`

Criar os 14 componentes abaixo. **Cada um deve ler `ui.jsx` antes de implementar.**

| Arquivo | Baseado em ui.jsx | Notas |
|---------|-------------------|-------|
| `Icon.tsx` | `Icon` | Todos os paths SVG do handoff; props: `name`, `size?` |
| `Heart.tsx` | `Heart` | Toggle favorito; preenche ao clicar |
| `Stars.tsx` | `Stars` | 10 estrelas, método clip; prop `value: float` |
| `Score.tsx` | `Score` | Badge compacto com valor numérico; cor por faixa |
| `RateInput.tsx` | `RateInput` | 10 estrelas interativas, meio-passo, hover preview |
| `StatusChip.tsx` | `StatusChip` | Usa `--st-{status}` para cor; variante `onPoster` |
| `EpisodeProgress.tsx` | `EpisodeProgress` | Barra fill, texto "X/? eps", pulse no next_episode |
| `PosterCard.tsx` | `PosterCard` | Gradiente POSTER (12 paletas de data.js) quando sem poster_url; kicker; fontSize dinâmico; hover translateY(-5px) scale(1.015) |
| `MalStats.tsx` | `MalStats` | Barra empilhada horizontal + 2 colunas de métricas |
| `Heatmap.tsx` | `Heatmap` | Agrupado por mês, lead cells de alinhamento, legenda |
| `Spark.tsx` | `Spark` | Barras de altura proporcional; prop `data: number[]` |
| `EpisodeLine.tsx` | design-guide §5 | Ícone status + thumbnail + "Ep N · título · data" |
| `NextBar.tsx` | design-guide §3 + app.jsx | Barra inferior 70px fixa, setas ◀▶, botão "Já vi" → abre LogModal |
| `Toast.tsx` | akane/components/Toast.tsx | timeout 2800ms; animação `toast-in` |

Paletas POSTER (copiar de data.js, adaptar para TypeScript):
```ts
export const POSTER: Record<PosterKey, { a: string; b: string; ink: string }> = {
  magenta: { a: 'oklch(0.50 0.22 350)', b: 'oklch(0.30 0.16 320)', ink: 'oklch(0.97 0.03 350)' },
  sakura:  { a: 'oklch(0.72 0.18 355)', b: 'oklch(0.45 0.14 330)', ink: 'oklch(0.15 0.05 330)' },
  cyan:    { a: 'oklch(0.62 0.18 200)', b: 'oklch(0.35 0.14 220)', ink: 'oklch(0.97 0.03 200)' },
  gold:    { a: 'oklch(0.78 0.18  85)', b: 'oklch(0.48 0.16  70)', ink: 'oklch(0.15 0.04  80)' },
  violet:  { a: 'oklch(0.55 0.22 290)', b: 'oklch(0.30 0.18 270)', ink: 'oklch(0.97 0.03 285)' },
  emerald: { a: 'oklch(0.62 0.17 155)', b: 'oklch(0.35 0.14 145)', ink: 'oklch(0.97 0.03 150)' },
  amber:   { a: 'oklch(0.73 0.18  65)', b: 'oklch(0.44 0.14  55)', ink: 'oklch(0.15 0.04  60)' },
  rose:    { a: 'oklch(0.60 0.21  10)', b: 'oklch(0.33 0.15 355)', ink: 'oklch(0.97 0.03   5)' },
  indigo:  { a: 'oklch(0.50 0.20 265)', b: 'oklch(0.28 0.16 250)', ink: 'oklch(0.97 0.03 260)' },
  teal:    { a: 'oklch(0.63 0.16 182)', b: 'oklch(0.36 0.13 175)', ink: 'oklch(0.97 0.03 180)' },
  crimson: { a: 'oklch(0.48 0.22  25)', b: 'oklch(0.28 0.16  15)', ink: 'oklch(0.97 0.03  20)' },
  slate:   { a: 'oklch(0.42 0.06 245)', b: 'oklch(0.25 0.05 240)', ink: 'oklch(0.97 0.02 245)' },
}
```

**Ler primeiro (para todos):** `specs/021-marin-animes/design_handoff_marin_animes/marin/ui.jsx` (implementação de referência), `specs/021-marin-animes/design-guide.md` §3–§5 (spec de cada componente), `specs/021-marin-animes/design_handoff_marin_animes/marin/data.js` (paletas e STATUS_VAR).  
**Critério:** `npx tsc --noEmit` passa; todos os 14 componentes exportados de `index.ts`; PosterCard renderiza gradiente quando `poster_url=null`; StatusChip usa `--st-{status}` (verificar no DevTools); NextBar aparece na viewport; Toast some após 2800ms.

#### 4.2 `AnimeDetail.tsx` — tela de detalhe (componente/tela)

**Ação:** Banner com gradient overlay, BRT air time, chip de status, progress bar, 2 colunas (info + logs recentes), lista de episódios paginada (12 por vez) com `EpisodeLine`, caderno de notas (textarea). Botões: "Logar episódio", "Editar status", toggle favorito.  
**Ler primeiro:** `specs/021-marin-animes/design-guide.md` §4.4 (spec completo de AnimeDetail), `specs/021-marin-animes/design_handoff_marin_animes/marin/app.jsx` (AnimeDetail component — confirmar se existe), componentes implementados em 4.1.  
**Critério:** Navegando para detalhe de um anime (via `navigate('detalhe', id)`): banner visível; episódios aparecem em lista paginada (12/vez); botão "Logar" abre LogWatchModal.

---

### Wave 7 · Telas (paralelas, depende de wave 6)

#### 4.3 Telas — `webapp/frontend/src/pages/marin/screens/`

6 telas + AnimeDetail. **Cada tela deve ler `design-guide.md` §4 (tela correspondente) antes de implementar.**

| Arquivo | Endpoint principal | Destaques de implementação |
|---------|-------------------|---------------------------|
| `HomeScreen.tsx` | `marinApi.home()` | Hero com `hero-spark` (Spark component), retrato Marin flutuante, 3 stat cards, `profile-split` (FavoriteAnimes + MalStats), `home-split` (Assistindo + lateral panel), carrossel Watchlist |
| `CatalogScreen.tsx` | `marinApi.list(params)` | Grid auto-fill de PosterCards, chips de filtro por status com bolinhas `--st-{status}`, sort via prop `sort` de tweaks |
| `DiaryScreen.tsx` | `marinApi.diary(50)` | Grupos por mês (separadores), mini-pôster, dia + dia-da-semana, nota textual, Score, FAB "Logar" |
| `WatchlistScreen.tsx` | `marinApi.watchlist()` | Lista vertical, botão "▶ Começar" que chama `updateStatus` → `assistindo` e abre LogModal com ep=1 |
| `ScheduleScreen.tsx` | `marinApi.schedule(14)` | Timeline por dia, horário JST + BRT, badge "novo ep", thumbnail via EpisodeLine |
| `StatsScreen.tsx` | `marinApi.stats(year)` | Year switcher, 4 totais (animes/eps/horas/média), barras por mês (Spark), por status, top gêneros/estúdios, Destaque do ano, Heatmap anual |

**Ler primeiro:** `specs/021-marin-animes/design-guide.md` §4 (cada subseção), `specs/021-marin-animes/design_handoff_marin_animes/marin/app.jsx` (renderView + cada screen component), `specs/021-marin-animes/design_handoff_marin_animes/marin/data.js` (estrutura de dados mock — entender os campos esperados).  
**Critério:** Navegando para cada tela via shell: renderiza sem erro de console; dados do endpoint aparecem na UI; CatalogScreen filtra por status ao clicar no chip; StatsScreen muda o ano ao clicar nos botões; ScheduleScreen mostra horário em BRT.

---

### Wave 8 · Modais (paralelas, depende de wave 6)

#### 4.4 Modais — `webapp/frontend/src/pages/marin/modals/`

| Arquivo | Campos-chave | Comportamento |
|---------|-------------|---------------|
| `LogWatchModal.tsx` | busca anime (se não pré-selecionado), ep_start, ep_end, data (default hoje), RateInput 0–10, textarea notas, checkbox favoritar | ⌘↵ ou Ctrl↵ submete; Esc fecha; `marinApi.logWatch()` → toast 2.8s; validação: ep_end ≥ ep_start |
| `AddAnimeModal.tsx` | input busca → `marinApi.search(q)` → lista com mini-pôster; debounce 300ms | Já na lista = chip "Já na lista" + `navigate('detalhe', id)`; Novo = `marinApi.add({ mal_id })` → toast → `navigate('detalhe', id)` |
| `MarinTweaks.tsx` (painel) | TweakRadio: Tema (Escuro/Claro); TweakRadio: Acento (Rosa-Magenta/Sakura/Neon/Gold); TweakRadio: Densidade (Grande/Médio/Compacto); TweakSelect: Ordenação (Atualizado/Adicionado/Nota/Título/Progresso) | localStorage 'mr-tweaks'; defaults: `{ tema: 'Escuro', acento: 'Neon', densidade: 'Médio', ordenacao: 'Atualizado' }` |

**Ler primeiro:** `specs/021-marin-animes/design-guide.md` §6 (modais), `specs/021-marin-animes/design_handoff_marin_animes/marin/app.jsx` (addLog, onAddAnime, TWEAK_DEFAULTS, TweaksPanel), `webapp/frontend/src/pages/akane/` (modais de referência se existirem).  
**Critério:** LogWatchModal: ⌘↵ submete; Esc fecha; toast aparece 2.8s e some; AddAnimeModal: debounce funciona (máx 1 chamada por 300ms); TweaksPanel: mudar acento → `data-accent` atualiza imediatamente; tweaks persistem após reload (localStorage).

---

### Wave 9 · Shell (depende de waves 6, 7, 8)

#### 4.5 `webapp/frontend/src/pages/marin/MarinShell.tsx` — shell raiz

**Ação:** Componente raiz. State-based routing (não React Router interno). Estado:
```ts
const [view, setView] = useState<MarinView>('home')
const [animeId, setAnimeId] = useState<string | null>(null)
const [tweaks, setTweaks] = useTweaks('mr-tweaks', TWEAK_DEFAULTS)
const [query, setQuery] = useState('')
const [logModal, setLogModal] = useState({ open: false, animeId?: string, ep?: number })
const [addOpen, setAddOpen] = useState(false)
const [syncing, setSyncing] = useState(false)
const [toast, setToast] = useState('')
```

Sidebar (244px): retrato Marin (imagem em `public/marin/marin-hero.png` ou asset), CTA "Logar episódio" (→ abre LogWatchModal), 2 grupos nav (Acervo: Início/Catálogo/Diário/Quero assistir; Descobrir: Lançamentos/Estatísticas) com contagens via hooks, botão Sync MAL com estado syncing (`marinApi.syncMal()`), link "Voltar à Makima" (→ `window.location.href = '/'`).

Topbar (56px): emoji + título da tela ativa, busca (→ navega para Catálogo com query), botão "+" (→ abre AddAnimeModal).

Responsivo: sidebar colapsa para 64px (só ícones/emojis) em `max-width: 900px`.

Defaults TWEAK_DEFAULTS: `{ tema: 'Escuro', acento: 'Neon', densidade: 'Médio', ordenacao: 'Atualizado' }`.

`data-accent` mapeamento: `{ 'Rosa-Magenta': undefined, 'Sakura': 'sakura', 'Neon': 'neon', 'Gold': 'gold' }`.

**Ler primeiro:** `specs/021-marin-animes/design_handoff_marin_animes/marin/app.jsx` (App completo — referência direta), `webapp/frontend/src/pages/akane/AkaneShell.tsx` (padrão de shell), componentes e telas (quando implementados).  
**Critério:** Shell renderiza sem erro; sidebar mostra 6 nav items com contagens; acento Neon aplicado no primeiro load (`data-accent="neon"` no `.marin-shell`); sidebar colapsa em viewport < 900px; tweaks mudam UI imediatamente; "Voltar à Makima" navega para `/`.

---

## Fase 5 — Wiring Final

### Wave 10 · Depende de wave 9

#### 5.1 `webapp/frontend/src/App.tsx` — rota `/animes/*`

**Ação:** Adicionar import `MarinShell` e rota `<Route path="/animes/*" element={<MarinShell />} />` antes do catch-all `/*`.  
**Ler primeiro:** `webapp/frontend/src/App.tsx` (estrutura atual de rotas — ver onde AkaneShell está registrado, replicar padrão).  
**Critério:** Navegando para `http://localhost:5173/animes` no browser: MarinShell renderiza sem erro de console; navegação entre telas funciona; ao recarregar `/animes/catalogo`, não redireciona para 404.

---

## Regras de implementação (não violar)

1. **Tools:** pure functions, sem side effects externos além de PostgreSQL, retornam `{"status": "ok"|"error", ...}`. HTML formatado no campo `message`; campos estruturados para o router.
2. **Router:** toda rota com `Depends(require_user)`. Mutações com `_check_result()`. Nunca lógica de domínio no router.
3. **CSS:** todos tokens em `.marin-shell {}`. Nomes de variáveis de status: `--st-{status}` (não `--status-*`). Acento padrão = Neon/cyan via `data-accent="neon"`.
4. **Shell:** state-based routing (não React Router interno). Tweaks em localStorage `'mr-tweaks'`.
5. **API client:** todos os calls via `marinApi.ts` → `lib/api.ts`. Nunca `fetch()` direto.
6. **Pôster:** proporção 2:3. Gradiente POSTER quando `poster_url=null`.
7. **Nota:** escala 0–10, passo 0.5. Validar em tools.py (FR-005).
8. **Tokens MAL:** nunca em arquivo — sempre em `mal_sync_state` (PostgreSQL) (FR-012).
9. **Sem branch nova:** commitar direto em master conforme CLAUDE.md.

---

## Verificação end-to-end

### Backend

```bash
# 1. Aplicar schema (dentro do container)
docker exec makima-web sh -c "cd /app && python -m scripts.setup_schemas"

# 2. Autorizar MAL (interativo, uma vez)
python -m scripts.authorize_mal

# 3. Smoke test das tools
python -c "
from agents.marin.tools import search_anime, add_anime, log_watch, get_stats
print(search_anime('Dungeon Meshi'))
print(add_anime(52701))
print(log_watch('Dungeon Meshi', 1, 3, '2026-06-13'))
print(get_stats())
"

# 4. Sync MAL
python -c "from agents.marin.tools import sync_mal; print(sync_mal())"

# 5. Telegram: mandar "Marin, quero ver Dungeon Meshi"
# Esperado: roteamento para marin_agent, resposta HTML com "Marin:"
```

### Frontend

```bash
cd webapp/frontend && npm run dev
# Navegar para /animes

# Checklist:
# [ ] Hero com retrato Marin + Spark visível na HomeScreen
# [ ] Sidebar colapsa para 64px em viewport < 900px
# [ ] Acento Neon (cyan) aplicado no primeiro load (inspecionar: data-accent="neon")
# [ ] Catálogo com grid de PosterCards (gradiente quando sem poster_url)
# [ ] Filtros de status com bolinhas coloridas (--st-{status})
# [ ] LogWatchModal: ⌘↵ submete, Esc fecha, toast 2.8s
# [ ] Toast some após 2800ms
# [ ] FavoriteAnimes persiste em localStorage após reload
# [ ] AnimeDetail: episódios paginados (12 por vez)
# [ ] StatsScreen: Heatmap + Destaque do ano renderizando
# [ ] ScheduleScreen: horário JST + BRT visível
# [ ] NextBar visível fixo na parte inferior com próximo ep
# [ ] Tweaks: trocar acento → data-accent muda, UI atualiza imediatamente
# [ ] Tema claro/escuro: sem vazamento de tokens para outros shells (inspecionar fora de .marin-shell)

npm run type-check   # ou: npx tsc --noEmit
```

### Critérios de sucesso (SCs do spec.md)

| SC | Verificação |
|----|------------|
| SC-001 | `add_anime(52701)` → linha em `anime` com `mal_id=52701` |
| SC-002 | `log_watch(...)` → `watch_logs` criado, `episodes_watched=3` |
| SC-003 | `sync_mal()` idempotente (0 upserts na 2ª chamada sem mudanças no MAL) |
| SC-004 | `refresh_token` diferente em `mal_sync_state` após refresh automático |
| SC-005 | One Piece (`mal_id=21`) → 0 linhas em `episodes` (blacklist de séries longas) |
| SC-006 | `TMDB_TOKEN` ausente → `enrich_anime()` completa sem erro (campos TMDB = null) |
| SC-007 | `get_stats()` com banco vazio → zeros em todos os campos, sem erro |
| SC-008 | Makima roteia "anime" para `marin_agent`; resposta em HTML com "Marin:" |
| SC-009 | `delete_anime()` → `deleted=True`; watch_logs preservados (soft delete) |

---

## Estimativa de esforço

| Fase | Arquivos | LOC est. |
|------|---------|---------|
| 1 — Backend (tools, agent, scripts, wiring, docs) | ~7 | ~650 |
| 2 — Foundation (types, CSS, api client) | 3 | ~900 |
| 3 — Router FastAPI | 2 | ~300 |
| 4 — Shell + 14 componentes + AnimeDetail | ~17 | ~1.800 |
| 4 — 6 telas | 6 | ~1.400 |
| 4 — 3 modais | 3 | ~700 |
| 5 — App.tsx wiring | 1 | ~10 |
| **Total** | **~39–46** | **~5.760** |
