# Handoff: Mai — Séries

> Seção de organização de **séries de TV** do app **Makima**. Protótipo hi-fi em HTML/CSS/React (JSX transpilado no cliente). Curadora: **Mai Sakurajima**. Esta pasta é a **referência de design** — o objetivo é recriar o visual e o comportamento no ambiente real do projeto (React 19 + TS + Vite), não copiar o HTML para produção.

---

## 1. Overview

O **Makima** é um app pessoal de gestão de vida onde cada seção é "curada" por uma personagem de anime. A **Mai Sakurajima** (de *Seishun Buta Yarou wa Bunny Girl Senpai*) cura a seção de **séries de TV** — um acompanhador no espírito do **TMDB ⨯ Letterboxd**, dentro do sistema visual do app, mas com identidade própria **elegante, contida e teatral**.

```
App Makima
├── Makima  (dashboard)
├── Nami    → Finanças
├── Frieren → Livros
├── Kaguya  → Tarefas
├── Violet  → Diário
├── Akane   → Filmes
├── Marin   → Animes
└── Mai     → Séries   ← este handoff
```

A seção herda a estrutura de shell dos outros agents (sidebar + topbar + barra inferior + grid), com identidade própria.

### Princípio central — Acervo ≠ Diário, e Séries têm TEMPORADAS
Igual ao padrão da Akane/Marin (Letterboxd), há **duas entidades distintas** — mais uma dimensão exclusiva da Mai, a **temporada**:
- **Acervo (`SERIES`)** — a lista única. **Um card por série**, com status, nota (0.5–5.0), progresso (`TxEy / N eps`) e sinopse/notas. Cada série contém um array de **temporadas** (`seasons[]`), e o progresso é contado **por episódio dentro da temporada**.
- **Diário (`LOGS`)** — o registro **cronológico de sessões**. Cada entrada referencia uma série + **temporada** e cobre um **bloco de episódios** (`ep_start`–`ep_end`) numa data, com nota e review próprios. Uma série aparece várias vezes.

O **heatmap** e as **Estatísticas** são **derivados** do diário.

> **Componente exclusivo da Mai:** o **`SeasonAccordion`** (acordeão de temporadas) não existe em nenhum outro shell. É a peça central da tela de Detalhe.

---

## 2. About the Design Files

Os arquivos desta pasta são **referências de design criadas em HTML** — protótipos do visual e do comportamento pretendidos, **não** código de produção. A tarefa é **recriar estes designs no codebase-alvo** (React 19 + TypeScript + Vite 6, padrão Shell do projeto: `webapp/frontend/src/pages/mai/`), usando os padrões e bibliotecas já estabelecidos — chamadas de API via `maiApi.ts` sobre `lib/api.ts` (nunca `fetch` direto), tokens CSS escopados em `.mai-shell`, rota `/series/*` antes do catch-all em `App.tsx`.

> O JSX do protótipo usa React via Babel no browser e dados mock em memória. No app real, mapear o estado para a API por usuário (ver §7 e §8). Se nenhum ambiente existir ainda, escolher o framework mais adequado e implementar os designs nele.

---

## 3. Fidelity

**Hi-fi (alta fidelidade).** Cores, tipografia, espaçamento, raios, sombras e interações são finais. Recrie a UI **pixel-a-pixel** usando as bibliotecas/padrões do codebase. Os pôsteres usam um **fallback teatral** (gradiente dusk + título em Fraunces) porque não há `poster_url` real no mock — ao plugar o TMDB, troque por `<img src={poster_url}>` mantendo a proporção 2:3 e o chip/score/progresso sobrepostos.

---

## 4. Conceito visual — identidade da Mai

**Camarim de uma atriz célebre ao entardecer:** crepúsculo azul-violeta com luz âmbar quente vazando pelas janelas. Elegante, contido, teatral — entre um *press kit* de série de prestígio (estética HBO/Apple TV+) e o espelho iluminado de um camarim. Distinto da Marin (quarto kawaii néon) e da Akane (noir de projeção).

- **Tipografia teatral:** **Fraunces** para títulos/números de impacto e fallback de pôster; **DM Sans** para UI/corpo; **DM Mono** para dados (`T2E5 / 19 eps`, datas, contagens).
- **Estrelas 0.5–5.0** (Letterboxd): 5 estrelas com meia, cor pérola/dourada **fixa** (não acompanha o acento).
- **Emojis com parcimônia:** 🐰 (assinatura da Mai), 📺, 🌙, 🎬, 🎭. Contraponto à explosão kawaii da Marin.
- **Status visual:** chips coloridos por estado do usuário (assistindo = periwinkle/accent, concluída = verde, quero assistir = âmbar, pausada = cinza, abandonada = vermelho muted).

---

## 5. Screens / Views

> Capturas em `screens/` (924×540, tema escuro, acento periwinkle).

### 5.1 Início — `screens/01-inicio.png`
- **Propósito:** panorama do que está sendo assistido e o que sai em breve.
- **Layout:** `.page` (max-width 1180px, centralizado). De cima para baixo:
  1. **Hero** (`border-radius: 28px`, min-height 280px): fundo em gradiente dusk da série do último log, **luz âmbar** radial vazando do canto superior direito (`mix-blend: screen`), retrato da Mai à direita (escondido < 860px). Eyebrow `🐰 Continue assistindo` (mono, uppercase, periwinkle), título em Fraunces `clamp(30–44px)`, linha com `StatusChip` + rede + `Última sessão: T2E4` + `Score`. CTAs: `Logar sessão` (primário) e `Ver detalhe` (ghost).
  2. **3 stat cards** (`grid auto-fit minmax(200px)`): Séries acompanhadas / Episódios · 7 dias (com sparkline) / Nota média (`/ 5`). Barra de acento de 3px no topo (`--mai`, `--warm`, `--star`).
  3. **Perfil split** (`grid 1.3fr 1fr`): **Favoritas** (4 slots editáveis, persistem em `localStorage` chave `mai.favorites`) + **Meu acervo** (barra empilhada de status + colunas com totais).
  4. **Assistindo agora** (carrossel horizontal de pôsteres).
  5. **Em andamento** + painel lateral (**Atividade recente** = 5 últimos logs; **Próximos episódios** = 4).
  6. **Esperando na fila** (carrossel de `quero_assistir`).

### 5.2 Catálogo — `screens/02-catalogo.png`
- **Propósito:** acervo completo, filtrável.
- **Layout:** título + sub (`16 no acervo · 7 concluídas`); toolbar de chips de status (`Todas | Assistindo | Concluída | Quero assistir | Pausada | Abandonada`) + contagem por ordenação; **grid de pôsteres** `repeat(auto-fill, minmax(var(--poster-w), 1fr))`, gap `28px 22px`.
- **Card:** `PosterCard` (2:3) com chip de status (canto inf. esq.), score (canto inf. dir.), faixa de progresso âmbar (base). Abaixo: título (2 linhas) + `Score · TxEy / N eps`.

### 5.3 Detalhe da série — `screens/03-detalhe.png` + `screens/04-temporadas.png`
- **Propósito:** tudo sobre uma série. **Tela signature.**
- **Banner** (`border-radius: 28px`, min-height 280px): gradiente dusk + luz âmbar; pôster flutuante 160px à esquerda; gênero, título Fraunces `clamp(30–46px)`, `título_original · rede · ano · N temporadas`, linha com `Stars(lg)` + nota `/5` + coração + `StatusChip`.
- **Ações:** `Logar sessão` (primário), `Logar TxEy` (warm/âmbar — pré-preenche o próximo ep), `Favoritar` (toggle, coração).
- **Card de progresso geral:** barra + `Próximo: T2E5 · "Woe's Hollow" · 5 fev 2025`.
- **Grid 1.35fr / 1fr:**
  - Esquerda: **Sinopse** → **caderno da Mai 🐰** (bloco itálico, borda esquerda accent) → **`SeasonAccordion`** → **Histórico de sessões** (timeline).
  - Direita: **Ficha** (meta-grid 2-col: Rede, Estreia, Temporadas, Episódios, Progresso, Sessões) → **Gêneros** (tag-chips).

#### `SeasonAccordion` — ⭐ exclusivo Mai (ver `04-temporadas.png`)
- Uma **row por temporada** (`border-radius: 18px`, fundo `--card`). Clique expande/colapsa.
- **Header fechado:** `[▶] Temporada N · X eps · YYYY  [====░░ K/N]`. O chevron gira 90° ao abrir. Temporada concluída: barra verde + `✓ K/N`.
- **Body expandido:** lista de **`EpisodeLine`** (até 5; botão "Carregar mais (+N)"). Transição via `max-height` + `opacity` (sem JS de resize). **Lazy:** episódios só são construídos ao expandir pela 1ª vez.
- **`EpisodeLine`** (`grid 18px 96px 1fr auto`): `[● dot] [still 96×54] [TxEy · título · data] [estado]`.
  - Assistido: dot verde, título muted (`--ink-3`), check verde.
  - Próximo não-assistido: dot âmbar com **glow** (`box-shadow: 0 0 7px var(--warm)`), estado "logar".
  - Agendado (futuro): estado "agendado" (📅).
  - Clique em qualquer linha → abre `LogWatchModal` pré-preenchido com temporada + episódio.

### 5.4 Diário — `screens/05-diario.png`
- Lista cronológica decrescente **agrupada por mês** (separador `Junho 2026` em Fraunces + contagem). Cada `diary-row` (`grid 52px 46px 1fr auto`): dia (num+abrev), mini-pôster, título + `TxE… · N episódios` + review itálico, e `Score`.

### 5.5 Quero assistir — `screens/06-quero-assistir.png`
- Lista de cards (`wl-item`): mini-pôster, título Fraunces, `rede · ano · N temporadas · N eps`, tags de gênero, botão **Começar** (warm) que abre o log em T1E1.

### 5.6 Próximos episódios — `screens/07-proximos.png`
- Timeline **por dia** (`Hoje, 13 jun` / `17 jun` …). Cada `sched-card`: still 96×54, título, `TxEy · "título"`, `rede · quando`, badge "novo ep".

### 5.7 Estatísticas — `screens/08-estatisticas.png`
- **Year switch** (2026, Fraunces grande) + resumo (`17 sessões · 53 episódios · 42h em cena`).
- **4 big-stats:** concluídas / episódios / horas / nota média.
- **Episódios por mês** (gráfico de barras). Grid 2×2: **Por status**, **Top gêneros**, **Top redes** (barras warm), **Destaque do ano** (pôster + dados). **Heatmap de sessões** (52 semanas, calor em `--mai`).

### 5.8 LogWatchModal *(sem screenshot — descrição abaixo)*
Diferencial vs. Akane/Marin: tem **seletor de temporada**.
- Alvo (pôster + título) → `details` recolhível "Trocar de série ou adicionar uma nova" (busca TMDB mock + picker horizontal).
- Campos: **Temporada** (`<select>` das temporadas da série) · **Ep inicial** (number) · **Ep final** (number ≥ inicial) — em `grid 1fr 1fr 1fr`; **Data** (date, max=hoje); **Nota** (`RateInput` 0.5–5.0); **Marcadores** (Favorita toggle); **Review** (textarea, placeholder *"Uma cena que vai ficar. 🐰"*).
- Atalhos: `⌘/Ctrl+↵` loga, `Esc` fecha. Ao salvar: atualiza `seasons[].watched`, re-deriva progresso/`next`, promove status (`quero_assistir`/`pausada`/`abandonada` → `assistindo`; tudo assistido → `concluida`), incrementa o heatmap e dispara um toast.
- `AddSeriesModal` (botão `+` da topbar): busca TMDB → adiciona como `quero_assistir`.

---

## 6. Interactions & Behavior

- **Navegação:** sidebar troca de tela; clique em pôster/linha → Detalhe; `Catálogo` é o nav ativo enquanto se está no Detalhe; ao navegar, o scroll volta ao topo e a busca limpa (exceto no Catálogo).
- **Busca (topbar):** digitar empurra para o Catálogo e filtra por título/rede/gênero.
- **Favoritas:** "Editar" mostra remover (✕) / adicionar (picker); máx. 4; persiste em `localStorage`.
- **Acordeão:** expand/collapse por clique; lazy-load de episódios; "Carregar mais" pagina de 8 em 8.
- **Barra inferior "Próximo ep":** alterna entre os próximos episódios (‹ ›) e tem ação "Já vi".
- **Transições:** pôster `transform: translateY(-5px) scale(1.015)` no hover (200ms); acordeão `max-height/opacity` (260ms); modal `modal-in` (220ms); toast `toast-in` (300ms); pulso âmbar no "próximo ep".
- **Toasts:** canto inferior direito, 2.8s, fade-out.
- **Responsivo:** sidebar colapsa para 64px (só ícones) < 900px; grids de detalhe/stats viram 1 coluna; retrato do hero some < 860px.

---

## 7. State Management

Estado local (no protótipo, `useState` + mutação dos arrays mock; no app real, mapear para API/cache):
- `route { view, param }`, `query`, `modal { open, seriesId, season, ep }`, `addOpen`, `toast`, `favorites[]` (localStorage `mai.favorites`).
- **Tweaks** (`tema`, `acento`, `densidade`, `ordenacao`) persistidos pelo host (bloco `EDITMODE`), aplicados como `data-theme` / `data-accent` / `data-density` no `.mai-shell`.
- **Derivações:** `episodes_watched/count`, `next`, `pos (TxEy)` por série (`enrich()`); `UPCOMING`, `HEATMAP`, `STATS` a partir de `SERIES` + `LOGS`.

### Modelo de dados (resumo)
```ts
Series {
  id, title, title_original, network, first_air_year,
  genres: string[], poster: PosterKey,
  status: 'assistindo'|'concluida'|'quero_assistir'|'pausada'|'abandonada',
  score: number|null,        // 0.5–5.0 (passo 0.5)
  fav: boolean,
  seasons: { n, name?, eps: number|null, year, watched }[],
  synopsis, notes,
  // derivados: episodes_watched, episodes_count, next{season,number}, pos{season,ep}
}
WatchLog { id, date, seriesId, season, ep_start, ep_end, score, note }
Episode  { season, number, title, aired, watched }
```

### Endpoints sugeridos (mesma estrutura do guia da fatia 022)
`GET /api/series` (status, genre, sort) · `GET /api/series/{id}` · `GET /api/series/{id}/seasons/{n}/episodes` (lazy) · `GET /api/series/diary` · `GET /api/series/upcoming?days=14` · `GET /api/series/stats?year=` · `POST /api/series/{id}/log` · `GET /api/series/search?q=` · `POST /api/series`.

---

## 8. Design Tokens

Todos escopados em `.mai-shell` (ver `mai/styles.css`). Escuro é o padrão; `[data-theme='light']` sobrescreve; `[data-accent]` troca o acento.

**Superfícies (dusk, escuro):** `--paper oklch(0.12 0.022 285)` · `--paper-2 0.16/0.024/283` · `--card 0.19/0.020/285` · `--card-2 0.225/0.020/283`.
**Tinta:** `--ink 0.95` · `--ink-2 0.72` · `--ink-3 0.54` · `--ink-4 0.40` (hue ~284).
**Linhas:** `--line 0.28` · `--line-2 0.225`.
**Acento (periwinkle, default):** `--mai oklch(0.66 0.17 270)` · `--mai-deep 0.78/0.14/272` · `--mai-bright 0.82/0.12/270` · tints 16%/30%.
**Acentos alternativos:** `rosa` (hue 350), `ouro` (hue 80), `noir` (cinza-azulado, chroma ~0.01).
**Luz âmbar (camarim):** `--warm oklch(0.80 0.12 68)` · `--warm-deep 0.84/0.11/70` · `--warm-tint 16%`.
**Estrelas (fixas):** `--star oklch(0.86 0.11 80)` · `--star-empty 0.36/0.018/285`. **Heart:** `oklch(0.68 0.22 12)`.
**Status:** assistindo=`--mai` · concluida=`oklch(0.72 0.16 150)` · quero_assistir=`oklch(0.76 0.13 72)` · pausada=`oklch(0.60 0.012 285)` · abandonada=`oklch(0.56 0.14 20)`.
**Heatmap:** `--heat-1…4` (periwinkle escuro→vivo).
**Raios:** `--r-sm 6 · --r-md 12 · --r-lg 18 · --r-xl 28`. **Pôster:** proporção **2:3**, `--poster-w` 180/136/96 (Grande/Médio/Compacto). Backdrop/hero/still **16:9**.
**Sombras:** `--shadow-sm/md/lg` + `--shadow-poster` (dramática). `--glow` (anel + halo accent).
**Tipo:** `--display 'Fraunces'` · `--sans 'DM Sans'` · `--mono 'DM Mono'`. Import Google Fonts no `<head>` do HTML.

---

## 9. Assets

- `mai/mai-hero.png` — retrato da Mai (PNG transparente 500×500), usado na marca da sidebar (`object-position: 50% 8%`) e no hero do Início. Substituir pelo asset oficial no app.
- **Ícones:** SVG inline (stroke 1.8) em `mai/ui.jsx` (objeto `ICONS`). Sem dependência externa.
- **Pôsteres:** sem imagens — fallback gerado por gradiente (paletas dusk em `POSTER`, `mai/data.js`). Trocar por `poster_url` do TMDB quando disponível.
- **Fontes:** Fraunces, DM Sans, DM Mono via Google Fonts.

---

## 10. Files

```
design_handoff_mai_series/
├── Mai - Séries.html         # entry: carrega fontes, React/Babel, e os módulos abaixo
├── mai/
│   ├── styles.css            # tokens .mai-shell + todos os componentes (inclui SeasonAccordion)
│   ├── data.js               # SERIES (com seasons), LOGS, UPCOMING, HEATMAP, STATS, TMDB mock, helpers
│   ├── ui.jsx                # Icon, Stars(0.5–5), Score, RateInput, StatusChip, EpisodeProgress,
│   │                         #   PosterCard, Heatmap, Spark, ListStats, helpers de data pt-BR
│   ├── screens-a.jsx         # Home, FavoriteSeries, SeriesPicker, Catalog, SeasonAccordion, SeriesDetail
│   ├── screens-b.jsx         # Diary, Watchlist, Upcoming, Stats
│   ├── logmodal.jsx          # LogWatchModal (temporada+ep), AddSeriesModal, NextBar, Toast
│   ├── app.jsx               # shell, sidebar, roteamento, tweaks, addLog
│   └── mai-hero.png
├── tweaks-panel.jsx          # painel de Tweaks (host protocol) — infra compartilhada
└── screens/                  # capturas de referência (924×540)
    ├── 01-inicio.png
    ├── 02-catalogo.png
    ├── 03-detalhe.png
    ├── 04-temporadas.png     # o SeasonAccordion em foco
    ├── 05-diario.png
    ├── 06-quero-assistir.png
    ├── 07-proximos.png
    └── 08-estatisticas.png
```

**Regras do projeto (não violar):** API só via `maiApi.ts`; CSS escopado em `.mai-shell`; rota `/series/*` antes do catch-all; sem lógica de domínio no frontend; proporção 2:3 nos pôsteres; escala **0.5–5.0** (≠ Marin 0–10); `SeasonAccordion` com lazy-load; rotas fixas antes de `/{series_id}` no router.
