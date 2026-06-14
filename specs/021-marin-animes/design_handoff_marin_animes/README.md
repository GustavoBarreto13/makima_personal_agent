# Handoff: Marin — Animes

> Seção de organização de **animes** do app **Makima**. Protótipo hi-fi em HTML/CSS/React (JSX transpilado no cliente). Curadora: **Marin Kitagawa**. Esta pasta é a **referência de design** — o objetivo é recriar o visual e o comportamento no ambiente real do projeto (React 19 + TS + Vite), não copiar o HTML para produção.

---

## 1. Overview

O **Makima** é um app pessoal de gestão de vida onde cada seção é "curada" por uma personagem de anime. A **Marin Kitagawa** (de *My Dress-Up Darling*) cura a seção de **animes** — um acompanhador de animes no espírito do **MyAnimeList/AniList**, dentro do sistema visual do app, mas com identidade própria **kawaii e vibrante**.

```
App Makima
├── Makima  (dashboard)
├── Nami    → Finanças
├── Frieren → Livros
├── Kaguya  → Tarefas
├── Violet  → Diário
├── Akane   → Filmes
└── Marin   → Animes   ← este handoff
```

A seção herda a estrutura de shell dos outros agents (sidebar + topbar + barra inferior + grid), com identidade própria.

### Princípio central — Acervo ≠ Diário
Igual ao padrão da Akane (Letterboxd), há **duas entidades distintas**:
- **Acervo (`ANIMES`)** — a lista única. **Um card por anime**, com status, nota, progresso (X/Y eps) e a sinopse/notas.
- **Diário (`LOGS`)** — o registro **cronológico de sessões**. Cada entrada referencia um anime e cobre um **bloco de episódios** (`ep_start`–`ep_end`) numa data, com nota e nota textual próprias. Um anime aparece várias vezes.

O **heatmap** e as **Estatísticas** são **derivados** do diário.

---

## 2. About the Design Files

Os arquivos desta pasta são **referências de design criadas em HTML** — protótipos do visual e do comportamento pretendidos, **não** código de produção. A tarefa é **recriar estes designs no codebase-alvo** (React 19 + TypeScript + Vite 6, padrão Shell do projeto: `webapp/frontend/src/pages/<domain>/`), usando os padrões e bibliotecas já estabelecidos — chamadas de API via `marinApi.ts` sobre `lib/api.ts` (nunca `fetch` direto), tokens CSS escopados em `.marin-shell`, rota `/animes/*` antes do catch-all em `App.tsx`.

> O JSX do protótipo usa React via Babel no browser e dados mock em memória. No app real, mapear o estado para a API por usuário (ver §8).

---

## 3. Fidelity

**Hi-fi (pixel-perfect).** Recriar cores, tipografia, espaçamento, raios, sombras, estados de hover/foco e animações exatamente como no protótipo. Os tokens OKLCH (§7) são a fonte de verdade.

---

## 4. Screens / Views

> Capturas de referência em `screens/` (1920×1080, tema **Neon** padrão):
> `01-inicio.png` · `02-catalogo.png` · `03-detalhe.png` · `04-diario.png` · `05-quero-assistir.png` · `06-lancamentos.png` · `07-estatisticas.png`.

Roteamento por estado em `app.jsx` (`route = {view, param}`); `navigate(view, param)` zera o scroll. Telas:

### 4.1 Início (`Home`)
- **Hero "continue assistindo"**: fundo em gradiente da paleta do último anime logado (`hero-bg` + overlay + `hero-spark` de pontilhado), eyebrow "✨ Continue assistindo", título (DM Serif Display), linha com `StatusChip` + "Último: Ep X / Y" + nota, CTAs **Logar episódio** / **Ver detalhe**, e o **retrato da Marin** flutuante à direita (halo + drop-shadow).
- **3 stat cards**: Animes acompanhados (assistindo/completos), Episódios · 7 dias (sparkline + Δ vs. semana anterior), Nota média (/10).
- **`profile-split`** (2 colunas ≥ 980px): **`FavoriteAnimes`** (4 favoritos editáveis) + **menu "Minha lista no MAL"** (`MalStats`).
- **`home-split`** (2 colunas): "Assistindo agora" (grade de pôsteres com barra de progresso) + painel lateral (Atividade recente + Próximos episódios).
- **Carrossel "Esperando na fila"** (status `quero_assistir`).

### 4.2 Catálogo (`Catalog`) — o ACERVO
Grade de pôsteres (`auto-fill minmax(--poster-w, 1fr)`). Chips de filtro por status: **Todos / Assistindo / Completo / Quero assistir / Pausado / Abandonado** (cada chip com bolinha da cor do status). Ordenação (tweak): Atualizado / Adicionado / Nota / Título / Progresso. Cada card: pôster (chip de status sobreposto + faixa de progresso fina) + título + "⭐ nota · X/Y eps".

### 4.3 Diário (`Diary`) — cronológico
Agrupado por **mês/ano**. Cada linha: dia + dia-da-semana, mini-pôster, título, "Ep X–Y · N episódios", nota textual em itálico, e a nota (`Score`).

### 4.4 Detalhe do anime (`AnimeDetail`)
- **Banner** com gradiente da paleta + pôster flutuante; título (Display), título JP · estúdio · temporada · formato, linha de nota (10 estrelas MAL + valor + coração + `StatusChip`).
- **Ações**: Logar episódio, Favoritar (toggle).
- **Card de progresso** (`EpisodeProgress`) com "Próximo: Ep N · data".
- **Grid 2 col**: esquerda = Sinopse + bloco de notas ("caderno da Marin") + **lista de episódios** (paginada, 12 por vez; ✓ assistido, ▶ próximo, 📅 agendado); direita = Ficha (metadados), Gêneros (chips), Histórico de sessões (timeline).

### 4.5 Quero assistir (`Watchlist`)
Lista vertical: pôster, título, estúdio·temporada·eps, chips de gênero, botão **Começar** (▶, loga o ep 1 e move para `assistindo`).

### 4.6 Lançamentos (`Schedule`)
Timeline por dia (próximos 14 dias). Agrupa episódios futuros dos animes `assistindo`. Card: pôster + título + "Ep N · título" + horário JST/BRT + badge "novo ep".

### 4.7 Estatísticas (`Stats`)
Year switch (2026); 4 totais (completos, eps vistos, horas, nota média); Episódios por mês (barras); Por status (barras coloridas); Top gêneros; Top estúdios; Destaque do ano (pôster + maior maratona); Heatmap do ano inteiro.

---

## 5. Components

| Componente | Descrição |
|---|---|
| `Icon({name})` | Ícones de linha (stroke 1.8) Lucide-style. |
| `Heart({filled})` | Coração (favoritar). |
| `Stars({value, lg, sm})` | **Estrelas MAL** — 10 estrelas, escala 0–10, **meia via clip** (`width: value/10*100%`). |
| `Score({value})` | Nota compacta: 1 estrela + número (cards/listas). |
| `RateInput({value, onChange})` | Rating interativo MAL — 10 estrelas, **meio-passo** (2 metades clicáveis por estrela), hover-preview, "limpar". |
| `StatusChip({status, md, onPoster})` | Chip por status; cor via `--st-{status}`; `onPoster` = fundo translúcido com blur. |
| `EpisodeProgress({watched, total, next, compact})` | Barra (preenchida `--marin`; `done` em verde) + "X / Y eps" + linha "próximo ep" (cyan, com pulso). `total=null` → "X / ? eps". |
| `PosterCard({anime, badge, showStatus, showScore, showProgress})` | **Pôster kawaii** 2:3 (sem imagem): gradiente da paleta, kicker (gênero·formato), título Display dimensionado pelo comprimento, estúdio+temporada no rodapé. `badge`=coração; faixa de progresso/chip/score opcionais. |
| `MalStats({profile})` | **Menu da lista MAL**: barra empilhada (segmentos proporcionais por status) + 2 colunas (status com bolinhas + totais). |
| `Heatmap({data})` | Grade de sessões/dia por mês. |
| `Spark({data})` | Mini sparkline. |
| `FavoriteAnimes` / `AnimePicker` | 4 favoritos editáveis (remover/adicionar via busca no acervo); persiste em `localStorage['marin.favorites']`. |
| `LogWatchModal` | Logar bloco de episódios (alvo + busca p/ adicionar + faixa ep_start/ep_end + data + nota + favorito + notas). ⌘↵ loga, Esc fecha. |
| `AddAnimeModal` | Busca rápida (topbar +) → adiciona como `quero_assistir`. |
| `NextBar` | Barra inferior "próximo episódio" (do `SCHEDULE`), setas + "Já vi". |
| `Toast` | Confirmação flutuante (some em 2,8s). |

### Paletas de pôster (`POSTER`)
12 gradientes vibrantes: `magenta, violet, cyan, emerald, amber, sunset, indigo, rose, teal, lime, plum, sky` — cada uma `{a, b, ink}` (gradiente 155° de `a`→`b`, texto `ink`).

---

## 6. Interactions & Behavior

- **Logar episódio** (`addLog`): cria entrada no `LOGS`, ordena por data; `episodes_watched = max(atual, ep_end)`; grava nota/favorito; `quero_assistir|pausado|abandonado → assistindo`; ao atingir o total → `completo` (zera `next`); incrementa o heatmap; dispara toast.
- **Adicionar anime**: `addAnimeFromCatalog` (mock Jikan) insere como `quero_assistir` e navega ao detalhe.
- **Sync MAL**: botão na sidebar → estado `syncing` (spinner) → toast "Sync concluído ✨ · N criados · M atualizados". (Mock: `POST /api/animes/sync-mal`.)
- **Favoritos**: editar → remover/adicionar via `AnimePicker` → persiste em `localStorage`.
- **Hover**: pôsteres sobem (`translateY(-5px) scale(1.015)`) + sombra; chips/nav com `--marin-tint`.
- **Animações**: `pulse` (próximo ep), `spin` (sync), `modal-in`/`scrim-in`, `toast-in`. Transições 0.12–0.4s.
- **Responsivo**: ≤ 900px sidebar colapsa para 64px (só emojis); ≤ 820px esconde o retrato do hero; ≤ 720px ajusta diário/footbar.

---

## 7. Design Tokens (escopo `.marin-shell`)

Tema **escuro por padrão** (quarto de otaku); claro em `[data-theme='light']`. Acento trocável em `[data-accent]`. Densidade em `[data-density]`.

**Acento padrão de fábrica: `Neon` (cyan, `data-accent='neon'`).** Demais: Rosa-Magenta (nenhum/base), Sakura, Gold.

### Superfícies / tinta / linhas (escuro)
| Token | Valor |
|---|---|
| `--paper` | `oklch(0.14 0.018 300)` |
| `--paper-2` | `oklch(0.17 0.020 298)` |
| `--card` | `oklch(0.205 0.022 302)` |
| `--card-2` | `oklch(0.245 0.020 298)` |
| `--mist` | `oklch(0.27 0.045 320)` |
| `--ink` … `--ink-4` | `0.96 → 0.45` (hue ~300) |
| `--line` / `--line-2` | `0.31` / `0.25` (hue ~300) |

### Acento (base rosa-magenta / Neon padrão)
| Token | Rosa-Magenta | Neon (padrão) |
|---|---|---|
| `--marin` | `oklch(0.68 0.25 350)` | `oklch(0.74 0.16 210)` |
| `--marin-deep` | `oklch(0.80 0.18 352)` | `oklch(0.84 0.14 208)` |
| `--marin-bright` | `oklch(0.84 0.16 350)` | `oklch(0.88 0.13 206)` |
| `--marin-tint` / `-2` | marin @ 0.16 / 0.28 | idem |

`--cyan oklch(0.74 0.15 210)` (secundário fixo) · `--star oklch(0.85 0.15 86)` (estrelas MAL) · `--heart oklch(0.70 0.22 8)`.

### Chips de status
`--st-assistindo oklch(0.74 0.15 210)` · `--st-completo oklch(0.74 0.16 150)` · `--st-quero_assistir oklch(0.72 0.17 296)` · `--st-pausado oklch(0.78 0.14 70)` · `--st-abandonado oklch(0.62 0.13 18)`.

### Heatmap `--heat-0..4`
`var(--line-2)` → `oklch(0.74 0.25 350)` (acompanha o acento).

### Tipografia
| Função | Família | Uso |
|---|---|---|
| Display | `DM Serif Display` | Títulos, hero, pôster, números de stat |
| Sans | `DM Sans` | UI, botões, corpo |
| Mono | `DM Mono` | Datas, contagens, "Ep X/Y", metadados |

> Diferente da Akane (Newsreader em reviews), a Marin **não** usa serif de texto — o caráter kawaii vem das cores e dos emojis (✨ ⭐ 💖 🎌 📺).

### Raios / densidade / sombras
`--r-sm 9` · `--r-md 14` · `--r-lg 22` · `--r-xl 32`. Pôster **2:3**, `--poster-w` 184/150/108 (grande/médio/compacto). Sombras `--shadow-sm/md/lg/poster`. Sidebar 244px · topbar 56px · barra inferior 70px.

---

## 8. State Management

Estado local (`useState`/`useReducer`); no app real, **SWR/React Query** para cache (sem Redux/Zustand). Endpoints por tela (todos via `marinApi.ts`):

| Tela | Endpoint(s) |
|---|---|
| Início | `GET /api/animes?status=assistindo` + `/stats` + `/schedule?days=14` + `/logs?limit=5` |
| Catálogo | `GET /api/animes` (status, sort, genre) |
| Diário | `GET /api/animes/logs?limit=50` |
| Detalhe | `GET /api/animes/{id}` (+ episodes + logs) |
| Quero assistir | `GET /api/animes?status=quero_assistir` |
| Lançamentos | `GET /api/animes/schedule?days=14` |
| Estatísticas | `GET /api/animes/stats?year={ano}` |
| Logar ep | `POST /api/animes/{id}/log` |
| Buscar | `GET /api/animes/search?q={query}` (Jikan) |
| Adicionar | `POST /api/animes` |
| Sync MAL | `POST /api/animes/sync-mal` |

**Persistência client-only:** favoritos (`localStorage['marin.favorites']`) e tweaks (tema/acento/densidade/ordenação). Escala de nota **MAL 0–10** (meia estrela) — não confundir com a Akane (0,5–5,0). Pôster **2:3**.

### Modelo de dados (mock → mapear para API)
```ts
type Status = 'assistindo'|'completo'|'quero_assistir'|'pausado'|'abandonado';
interface Anime { id; title; title_jp; year; season; studio; media_type;
  genres: string[]; poster: PosterKey; status: Status; score: number|null; // 0–10, .5
  fav: boolean; episodes_watched: number; episodes_total: number|null;     // null = em exibição
  next?: { number; title?; aired? }; synopsis; notes; episodes: Episode[]; }
interface WatchLog { id; date; animeId; ep_start; ep_end; score: number|null; note: string|null; }
interface Episode { number; title; aired; watched: boolean; }
```

---

## 9. Assets

| Asset | Arquivo | Uso |
|---|---|---|
| Retrato Marin (transparente) | `marin/marin-hero.png` (500×499) | Hero (halo + drop-shadow) e marca na sidebar |

Pôsteres são **tipográficos** (gradiente + texto) — sem imagens, resistentes a link quebrado. Para pôster real no futuro: adicionar `poster_url` ao `Anime` e renderizar `<img>` sobre o gradiente.

---

## 10. Files

```
Marin - Animes.html      ← shell (carrega fontes, React, Babel e os módulos)
marin/
  styles.css             ← design system (tokens claro/escuro + acentos + componentes)
  data.js                ← modelo, seed, STATS, SCHEDULE, MAL_PROFILE, busca mock (Jikan)
  ui.jsx                 ← Icon, Stars(MAL), Score, RateInput, StatusChip, EpisodeProgress,
                            PosterCard, MalStats, Heatmap, Spark, helpers de data
  screens-a.jsx          ← Home, FavoriteAnimes, AnimePicker, Catalog, AnimeDetail
  screens-b.jsx          ← Diary, Watchlist, Schedule, Stats
  logmodal.jsx           ← LogWatchModal, AddAnimeModal, SearchResults, NextBar, Toast
  app.jsx                ← shell, nav, roteamento, tweaks, addLog, sync
  marin-hero.png         ← retrato
tweaks-panel.jsx         ← painel de tweaks (compartilhado, na raiz)
```

Ordem de carregamento: `data.js` (plain) → `ui.jsx` → `tweaks-panel.jsx` → `screens-a.jsx` → `screens-b.jsx` → `logmodal.jsx` → `app.jsx`. Componentes expostos em `window` via `Object.assign` ao fim de cada arquivo (escopos Babel separados).

---

## 11. Entregáveis do porte (React) + checklist

```
webapp/frontend/src/pages/marin/
├── MarinShell.tsx        # shell + sidebar + topbar + router interno
├── marinApi.ts           # client: todos os endpoints /api/animes/*
├── types.ts              # Anime, WatchLog, Episode, Stats, Schedule, SyncResult
├── marin.css             # tokens OKLCH em .marin-shell + temas/acentos
├── screens/  HomeScreen · CatalogScreen · DiaryScreen · WatchlistScreen · ScheduleScreen · StatsScreen
├── components/ PosterCard · EpisodeProgress · StatusChip · StarRating · EpisodeLine · MalStats · AnimeDetail
└── modals/   LogWatchModal · AddAnimeModal · MarinTweaks
```

- [ ] Tokens OKLCH em `.marin-shell`, sem vazamento para outros shells.
- [ ] 7 telas renderizando (mesmo com dados mock).
- [ ] `marinApi.ts` com os 11 endpoints tipados.
- [ ] `StarRating`: 10 estrelas, meia estrela, escala 0–10.
- [ ] `StatusChip` com as 5 cores de status.
- [ ] `PosterCard` com fallback tipográfico (gradiente + título) quando `poster_url=null`.
- [ ] Tema claro/escuro + acento trocável (**Neon padrão**) via `data-*` + localStorage.
- [ ] Rota `/animes/*` antes do catch-all em `App.tsx`.
- [ ] `POST /api/animes/sync-mal` com feedback de progresso na sidebar.
- [ ] Menu de stats do MAL (`MalStats`) e bloco de 4 favoritos (persistente) na Início.
