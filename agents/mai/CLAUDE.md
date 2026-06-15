# CLAUDE.md — agents/mai

## O que é este agente

**Mai** é o agente de séries de TV do sistema Makima.
Inspirada em Mai Sakurajima de *Seishun Buta Yarou wa Bunny Girl Senpai no Yume wo Minai* —
atriz serena, madura, elegante, de humor seco. Trata séries como performances de longo curso:
analisa arcos de personagem, estrutura de temporada, ritmo.

Responsabilidades:
- Gerenciar catálogo pessoal de séries (watchlist + diário de assistência)
- Registrar sessões por temporada e intervalo de episódios
- Enriquecer metadados via TMDB API v4 Bearer (pôsteres, elenco, episódios, still frames)
- Manter cache incremental de temporadas e episódios (`seasons` + `series_episodes`)
- Gerar estatísticas, próximos episódios e resumo do que está assistindo agora
- Soft delete com histórico preservado nos `series_watch_logs`

---

## Arquitetura

```
Telegram (usuário)
    ↓
Makima (coordinator)
    ↓
mai_agent (Agent ADK — singleton, sem MCP)
    ├── tools.py      → PostgreSQL (catálogo, seasons, episodes, watch_logs)
    └── metadata.py   → TMDB API v4 Bearer (metadados, episódios, skip-logic)

Webapp (/series/*)
    ↓
webapp/backend/routers/series.py  (fachada fina)
    └── agents/mai/tools.py       (ÚNICA dona da lógica de negócio)
```

**Mai é singleton** — não usa `McpToolset`, então não precisa de factory function.
Instância global `mai_agent` em `agent.py`, importada em `coordinator/agent.py`.

---

## Banco de dados PostgreSQL

Schema completo em `agents/mai/schema_pg.sql`. Aplicar via:
```bash
docker exec makima-web sh -c "cd /app && python -m scripts.setup_schemas"
```

### Tabela `series`

Catálogo principal de séries.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | TEXT (UUID) | PK gerada com `str(uuid.uuid4())` |
| `tmdb_id` | INTEGER | ID do TMDB — chave de dedup; UNIQUE |
| `imdb_id` | TEXT | IMDb ID (opcional) |
| `title` | TEXT | Título em português (ou original) |
| `title_original` | TEXT | Título original (idioma de origem) |
| `normalizado` | TEXT | lowercase sem acentos — para fuzzy match |
| `first_air_date` | DATE | Data de estreia |
| `last_air_date` | DATE | Data do último episódio |
| `series_status` | TEXT | no_ar / finalizada / cancelada |
| `network` | TEXT | Canal/streaming principal |
| `seasons_count` | INTEGER | Total de temporadas (exc. Specials) |
| `episodes_count` | INTEGER | Total de episódios |
| `episodes_watched` | INTEGER | Contador de episódios assistidos |
| `status` | TEXT | quero_assistir / assistindo / concluida / pausada / abandonada |
| `rating` | NUMERIC(2,1) | Nota 0.5–5.0, step 0.5 (Letterboxd-style) |
| `poster_url` | TEXT | Caminho do pôster no TMDB (ex.: `/abc123.jpg`) |
| `backdrop_url` | TEXT | Caminho do backdrop no TMDB |
| `overview` | TEXT | Sinopse em português |
| `genres` | TEXT[] | Lista de gêneros |
| `tags` | TEXT[] | Tags personais |
| `notes` | TEXT | Anotações livres |
| `date_started` | DATE | Quando começou a assistir |
| `date_finished` | DATE | Quando concluiu |
| `source` | TEXT | telegram / webapp |
| `deleted` | BOOLEAN | Soft delete — não remove o registro |
| `created_at` | TIMESTAMPTZ | Timestamp de criação |
| `updated_at` | TIMESTAMPTZ | Atualizado pelo trigger `set_updated_at` |

### Tabela `seasons`

Cache de metadados de temporadas (skip se season_number = 0 "Specials").

| Campo | Tipo | Descrição |
|---|---|---|
| `series_id` | TEXT (FK) | FK → `series.id` CASCADE DELETE |
| `season_number` | INTEGER | Número da temporada (≥ 1) |
| `name` | TEXT | Nome da temporada |
| `episode_count` | INTEGER | Total de episódios nessa temporada |
| `air_date` | DATE | Data de estreia da temporada |
| `overview` | TEXT | Sinopse da temporada |
| `poster_url` | TEXT | Pôster da temporada |
| UNIQUE | — | `(series_id, season_number)` |

### Tabela `series_episodes`

Cache best-effort de episódios. Skip-logic incremental:
`EXISTS AND air_date IS NOT NULL AND still_url IS NOT NULL AND air_date < hoje` → não sobrescreve.

| Campo | Tipo | Descrição |
|---|---|---|
| `series_id` | TEXT (FK) | FK → `series.id` CASCADE DELETE |
| `season_number` | INTEGER | Número da temporada |
| `episode_number` | INTEGER | Número do episódio dentro da temporada |
| `title` | TEXT | Título do episódio |
| `air_date` | DATE | Data de exibição |
| `overview` | TEXT | Sinopse do episódio |
| `still_url` | TEXT | Frame still do TMDB (ex.: `/xyz.jpg`) |
| `airing_status` | TEXT | lancado / agendado |
| `watched` | BOOLEAN | Marcado como assistido |
| `watched_date` | DATE | Quando foi marcado como assistido |
| UNIQUE | — | `(series_id, season_number, episode_number)` |

### Tabela `series_watch_logs`

Diário de sessões. Sem índice UNIQUE — permite rewatch.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | TEXT (UUID) | PK |
| `series_id` | TEXT (FK) | FK → `series.id` |
| `series_title` | TEXT | Denormalizado para historização |
| `watched_date` | DATE | Data da sessão |
| `season_number` | INTEGER | Temporada assistida (opcional) |
| `ep_start` | INTEGER | Episódio inicial (opcional) |
| `ep_end` | INTEGER | Episódio final (opcional) |
| `episodes_count` | INTEGER | Calculado: `ep_end - ep_start + 1` |
| `rating` | NUMERIC(2,1) | Nota da sessão (0.5–5.0, opcional) |
| `review` | TEXT | Impressões livres (opcional) |
| `source` | TEXT | telegram / webapp |
| `created_at` | TIMESTAMPTZ | Timestamp de criação |

---

## Tools disponíveis

Implementadas em `agents/mai/tools.py`. Todas retornam `{"status": "ok"|"error", ...}`.

| Tool | Descrição |
|---|---|
| `search_series` | Busca no TMDB por título (passa por `metadata.search_tv`) |
| `add_series` | Adiciona ao catálogo com metadados do TMDB |
| `log_watch` | Registra sessão (data, T/EP range, nota, review) |
| `update_status` | Altera status (quero_assistir/assistindo/…) |
| `rate_series` | Define nota 0.5–5.0 (ou null para remover) |
| `set_notes` | Salva anotações livres |
| `list_series` | Lista catálogo com filtro opcional por status |
| `get_series_detail` | Detalhes completos + seasons + episódios + logs recentes |
| `get_watchlist` | Séries com status quero_assistir |
| `get_currently_watching` | Séries com status assistindo + próximo episódio |
| `get_diary` | Histórico de sessões com paginação |
| `get_upcoming` | Próximos episódios de séries "assistindo" (data futura ou hoje) |
| `get_stats` | Estatísticas por ano (episódios, horas, nota média, top gêneros) |
| `delete_series` | Soft delete (deleted=TRUE; watch_logs preservados) |
| `sync_metadata` | Atualiza TMDB + temporadas + episódios (skip-logic) |
| `get_episodes_for_season` | Lista episódios de uma temporada específica |

---

## Módulo metadata.py

Acesso à TMDB API com retry exponencial.

```python
# Auth: Bearer v4 — NÃO usar query-param v3
headers = {"Authorization": f"Bearer {TMDB_TOKEN}", "Accept": "application/json"}

# Retry: 3x, delays [2, 4, 8] segundos
# 404 → None imediatamente (não retenta)
# 429/5xx → retenta com backoff
```

Funções principais:
- `search_tv(query, page=1)` → lista de resultados
- `get_show(tmdb_id)` → metadados completos do show
- `get_season(tmdb_id, season_number)` → episódios da temporada
- `sync_seasons(conn, series_id, tmdb_id, seasons_count)` → upsert de seasons+episodes com skip-logic

**Temporada 0 ("Specials")** — nunca inserida no banco.

---

## Personalidade e instruções de resposta

```
Você é Mai Sakurajima — atriz serena, madura, de humor seco e afiado.
Trata séries como performances de longo curso.

- Inicia TODA resposta com "Mai:"
- Usa HTML puro (nunca markdown)
- Emojis com parcimônia: 🐰 📺 🌙 ✨ 🎬
- Tom elegante mas acessível — análise de arcos e estrutura quando relevante
- Não usa: ✨ em excesso, "Otaku", comparações desnecessárias com anime
```

---

## Variáveis de ambiente

| Variável | Obrigatório | Descrição |
|---|---|---|
| `TMDB_TOKEN` | sim | Bearer token v4 do TMDB (reusa o mesmo da Akane) |
| `DATABASE_URL` | sim | PostgreSQL compartilhado |

---

## Webapp: /series/*

Router em `webapp/backend/routers/series.py`. Segue o padrão dos outros routers:
- `_check_result()` converte `status=error` em HTTP 400
- `Depends(require_user)` em todas as rotas
- Rotas fixas registradas ANTES de `/{series_id}`:
  - `GET /api/series/search`
  - `GET /api/series` (lista)
  - `GET /api/series/watchlist`
  - `GET /api/series/diary`
  - `GET /api/series/upcoming`
  - `GET /api/series/stats`

---

## Frontend: /series/*

Shell em `webapp/frontend/src/pages/mai/MaiShell.tsx`.
CSS OKLCH em `mai.css`, escopado em `.mai-shell`.

**Telas (7):** Home, Catálogo, Diário, Watchlist, Próximos, Stats, Detail (com SeasonAccordion exclusivo).

**Componentes (12):**

| Arquivo | O que faz |
|---|---|
| `SeasonAccordion.tsx` | Acordeão de temporadas com lazy-load de episódios via TMDB |
| `Stars.tsx` + `RateInput` | Estrelas 0.5–5.0 (meia via clip-path) + input interativo |
| `NextBar.tsx` | Footbar com próximo episódio agendado |
| `PosterCard.tsx` | Pôster 2:3 — imagem TMDB ou fallback tipográfico Fraunces |
| `EpisodeLine.tsx` | Linha de episódio no SeasonAccordion |
| `StatusChip.tsx` | Badge colorido de status (assistindo/concluída/etc.) |
| `MaiIcons.tsx` | Ícones SVG inline (sem dependência externa) |
| `Toast.tsx` | Toast de feedback efêmero |
| `Spark.tsx` | Sparkline de barras para stat-cards (últimos N dias) |
| `Heatmap.tsx` | Grade mensal de 52 semanas com intensidade de sessões |
| `ListStats.tsx` | "Meu acervo" — barra empilhada de status + tabela de totais |
| `FavoriteSeries.tsx` | 4 slots de favoritas editáveis (localStorage `mai.favorites`) + SeriesPicker embutido |

**HomeScreen** (`screens/HomeScreen.tsx`) — paridade total com design handoff:
- Carrega em paralelo: `maiApi.list()` + `maiApi.stats()` + `maiApi.upcoming()` + `maiApi.diary(21)`
- Hero com a última série logada (gradient, StatusChip, CTAs)
- stat-row: 3 cards (Séries acompanhadas / Episódios 7 dias + Spark / Nota média)
- profile-split: `FavoriteSeries` (esq.) + `ListStats` (dir.)
- "Assistindo agora" — carrossel `.row-scroll`
- home-split: watch-grid + painel lateral (atividade recente + próximos episódios)
- "Esperando na fila" — carrossel de `quero_assistir`

**StatsScreen** (`screens/StatsScreen.tsx`) — com Destaque do ano + Heatmap:
- year-switch → `get_stats(year)` → `daily` + `highlight` (adicionados na Parte A)
- `.yr-highlight` card: pôster + título + rede + estrelas + métricas do ano
- `<Heatmap data={stats.daily} />` em largura cheia (oculto se sem dados)

Rota registrada em `App.tsx` ANTES do catch-all `/*`:
```tsx
<Route path="/series/*" element={<MaiShell />} />
```

Token global em `index.css`: `--c-mai: #8b8cdb`, `--c-mai-dim: #221f40`.
Entry em `Layout.tsx` DOMAINS: personagem "Mai", label "Séries", path `/series`.
