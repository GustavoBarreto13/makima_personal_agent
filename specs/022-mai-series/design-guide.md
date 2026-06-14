# Guia de Design — Séries de TV (Mai Sakurajima) · fatia 022

> **Revisão 2026-06-13 (handoff)** — Esta versão incorpora o protótipo hi-fi em
> `design_handoff_mai_series/` como **fonte de verdade visual**. Os tokens, componentes e layouts
> descritos aqui saem diretamente do código do protótipo (`styles.css`, `ui.jsx`, `screens-a.jsx`,
> `screens-b.jsx`, `logmodal.jsx`, `data.js`, `app.jsx`). Recriar pixel-a-pixel.

Este documento guia o Claude Design (ou qualquer implementador de front-end) na criação do Shell
React da seção **Séries**. O back-end e o agente Telegram já existem (fatia 022); este guia é para
a fatia futura que implementa a UI. Siga este documento como fonte de verdade visual.

> **Stack**: React 19 + TypeScript + Vite 6. Padrão Shell do projeto: cada domínio em
> `webapp/frontend/src/pages/<domain>/`. Chamadas de API sempre via `maiApi.ts` sobre `lib/api.ts`
> (nunca `fetch` direto). Tokens CSS escopados em `.mai-shell`. Rotas em `App.tsx`:
> `<Route path="/series/*" element={<MaiShell />} />` antes do catch-all `/*`.
>
> O protótipo usa React + Babel no browser com dados mock em memória. No app real, mapear o estado
> para as chamadas de API por usuário (ver §8). Os pôsteres usam fallback teatral (gradiente dusk
> + título Fraunces) porque não há `poster_url` no mock — ao plugar o TMDB, trocar por
> `<img src={poster_url}>` mantendo a proporção 2:3 e chips/score sobrepostos.

---

## 1. Conceito visual — identidade da Mai

**Referência**: Mai Sakurajima (*Seishun Buta Yarou wa Bunny Girl Senpai*) — atriz célebre,
serena, elegante, de humor seco e afeto contido. A UI reflete isso: **elegante, contida, teatral**.

**Princípio central**:

> **Camarim de uma atriz célebre ao entardecer** — crepúsculo azul-violeta com luz âmbar quente
> vazando pelas janelas. Entre um press kit de série de prestígio (estética HBO/Apple TV+) e o
> espelho iluminado de um camarim. Distinto da Marin (quarto kawaii néon) e da Akane (noir de
> projeção).

**Princípios concretos**:
- **Séries têm temporadas** — diferencial vs. Akane/Marin: o `SeasonAccordion` é a peça central
  da tela de Detalhe. Não existe em nenhum outro shell.
- **Acervo ≠ Diário** — mesma filosofia Letterboxd: `SERIES` (um card por série + progresso) vs.
  `LOGS` (registro cronológico de sessões por temporada/ep).
- **Estrelas 0.5–5.0** (Letterboxd): 5 estrelas com meia, cor pérola/dourada **fixa** — não
  acompanha o acento. Distinto da Marin (0–10 MAL).
- **Emojis com parcimônia**: 🐰 (assinatura, sidebar + modal), 📺, 🌙, 🎬, 🎭, 📖, 📅, 📊.
  Contraponto à explosão kawaii ✨🎀 da Marin.
- **Status visual**: chips por estado do usuário — cores fixas por status (não pelo acento).

**Citação da sidebar** (manter exata):
> *"Toda série é uma performance de longo curso."*

---

## 2. Tokens OKLCH — escopo `.mai-shell`

Todos os tokens dentro de `.mai-shell { }`. **Dark mode é o padrão**; light sobrescreve em
`[data-theme='light']`. Acento trocável via `[data-accent]`.

### 2.1 Superfícies, tinta, linhas (escuro base — "dusk violeta")

```css
.mai-shell {
  /* superfícies */
  --paper:   oklch(0.12 0.022 285);   /* fundo principal */
  --paper-2: oklch(0.16 0.024 283);   /* sidebar, topbar */
  --card:    oklch(0.19 0.020 285);   /* cards */
  --card-2:  oklch(0.225 0.020 283);  /* hover, inputs, card interno */

  /* tinta */
  --ink:   oklch(0.95 0.008 285);
  --ink-2: oklch(0.72 0.014 284);
  --ink-3: oklch(0.54 0.016 282);
  --ink-4: oklch(0.40 0.015 280);

  /* linhas */
  --line:   oklch(0.28 0.022 284);
  --line-2: oklch(0.225 0.018 283);

  /* sombras */
  --shadow-sm: 0 1px 3px oklch(0 0 0 / 0.45);
  --shadow-md: 0 4px 12px oklch(0 0 0 / 0.50), 0 2px 4px oklch(0 0 0 / 0.4);
  --shadow-lg: 0 18px 48px oklch(0 0 0 / 0.62);
  --shadow-poster: 0 6px 20px oklch(0 0 0 / 0.70);  /* pôster dramático */

  /* topbar/footbar semi-transparentes */
  --topbar-bg:  oklch(0.16 0.024 283 / 0.82);
  --footbar-bg: oklch(0.16 0.024 283 / 0.92);
}
```

### 2.2 Luz âmbar quente do camarim

```css
.mai-shell {
  --warm:      oklch(0.80 0.12 68);            /* borda ativa, próximo ep, glow */
  --warm-deep: oklch(0.84 0.11 70);            /* texto âmbar (mais visível) */
  --warm-tint: oklch(0.80 0.12 68 / 0.16);    /* fundo sutil âmbar */
}
```

### 2.3 Acento — default periwinkle, 4 variantes via `[data-accent]`

```css
/* padrão de fábrica — periwinkle */
.mai-shell {
  --mai:        oklch(0.66 0.17 270);
  --mai-deep:   oklch(0.78 0.14 272);   /* texto-acento sobre escuro (mais claro) */
  --mai-bright: oklch(0.82 0.12 270);
  --mai-tint:   oklch(0.66 0.17 270 / 0.16);
  --mai-tint-2: oklch(0.66 0.17 270 / 0.30);
  --accent-h:   270;
}

/* rosa — "lado suave" da Mai */
.mai-shell[data-accent='rosa'] {
  --mai: oklch(0.71 0.19 350); --mai-deep: oklch(0.82 0.15 352); --mai-bright: oklch(0.86 0.13 350);
  --mai-tint: oklch(0.71 0.19 350 / 0.16); --mai-tint-2: oklch(0.71 0.19 350 / 0.30);
  --heat-1: oklch(0.40 0.10 350); --heat-2: oklch(0.52 0.15 350);
  --heat-3: oklch(0.64 0.19 350); --heat-4: oklch(0.76 0.20 350);
  --accent-h: 350;
}

/* ouro — award season, série de prestígio */
.mai-shell[data-accent='ouro'] {
  --mai: oklch(0.78 0.14 80); --mai-deep: oklch(0.86 0.12 82); --mai-bright: oklch(0.89 0.11 82);
  --mai-tint: oklch(0.78 0.14 80 / 0.16); --mai-tint-2: oklch(0.78 0.14 80 / 0.30);
  --heat-1: oklch(0.44 0.08 80); --heat-2: oklch(0.56 0.11 80);
  --heat-3: oklch(0.68 0.13 80); --heat-4: oklch(0.80 0.14 80);
  --accent-h: 80;
}

/* noir — monocromático bunny */
.mai-shell[data-accent='noir'] {
  --mai: oklch(0.62 0.012 285); --mai-deep: oklch(0.80 0.010 285); --mai-bright: oklch(0.86 0.008 285);
  --mai-tint: oklch(0.62 0.012 285 / 0.18); --mai-tint-2: oklch(0.62 0.012 285 / 0.32);
  --heat-1: oklch(0.34 0.008 285); --heat-2: oklch(0.46 0.008 285);
  --heat-3: oklch(0.58 0.008 285); --heat-4: oklch(0.70 0.008 285);
  --accent-h: 285;
}
```

### 2.4 Estrelas, coração, heatmap e status

```css
.mai-shell {
  /* estrelas — 5, meia. Pérola/dourado suave FIXO (não segue acento) */
  --star:       oklch(0.86 0.11 80);
  --star-deep:  oklch(0.88 0.10 82);
  --star-empty: oklch(0.36 0.018 285 / 0.7);

  /* coração */
  --heart: oklch(0.68 0.22 12);

  /* heatmap — acompanha acento (periwinkle padrão) */
  --heat-0: var(--line-2);
  --heat-1: oklch(0.38 0.10 270);
  --heat-2: oklch(0.50 0.14 270);
  --heat-3: oklch(0.62 0.18 270);
  --heat-4: oklch(0.74 0.20 270);

  /* glow do anel de foco */
  --glow: 0 0 0 3px var(--mai-tint), 0 0 24px var(--mai-tint);

  /* chips de status */
  --st-assistindo:     var(--mai);
  --st-concluida:      oklch(0.72 0.16 150);
  --st-quero_assistir: oklch(0.76 0.13 72);
  --st-pausada:        oklch(0.60 0.012 285);
  --st-abandonada:     oklch(0.56 0.14 20);
}
```

### 2.5 Tema claro `[data-theme='light']` — "camarim com luz natural do dia"

```css
.mai-shell[data-theme='light'] {
  --paper:   oklch(0.975 0.005 285);
  --paper-2: oklch(0.945 0.010 283);
  --card:    oklch(1 0 0);
  --card-2:  oklch(0.965 0.008 285);

  --ink:   oklch(0.18 0.018 285);
  --ink-2: oklch(0.40 0.016 283);
  --ink-3: oklch(0.56 0.012 282);
  --ink-4: oklch(0.70 0.012 282);

  --line:   oklch(0.885 0.012 284);
  --line-2: oklch(0.925 0.008 283);

  --warm: oklch(0.66 0.13 62); --warm-deep: oklch(0.58 0.13 60);
  --warm-tint: oklch(0.66 0.13 62 / 0.12);

  --mai: oklch(0.54 0.18 270); --mai-deep: oklch(0.48 0.18 272); --mai-bright: oklch(0.62 0.18 270);
  --mai-tint: oklch(0.54 0.18 270 / 0.10); --mai-tint-2: oklch(0.54 0.18 270 / 0.20);

  --star: oklch(0.72 0.13 76); --star-deep: oklch(0.62 0.13 72);
  --star-empty: oklch(0.86 0.012 285);
  --heart: oklch(0.58 0.22 12);

  --heat-0: var(--line-2);
  --heat-1: oklch(0.86 0.05 270); --heat-2: oklch(0.76 0.11 270);
  --heat-3: oklch(0.66 0.16 270); --heat-4: oklch(0.54 0.18 270);

  --st-pausada: oklch(0.62 0.010 285);

  --topbar-bg:  oklch(0.975 0.005 285 / 0.84);
  --footbar-bg: oklch(0.945 0.010 283 / 0.94);

  --shadow-sm: 0 1px 2px oklch(0.3 0.03 285 / 0.07);
  --shadow-md: 0 4px 14px oklch(0.3 0.03 285 / 0.10), 0 1px 3px oklch(0.3 0.03 285 / 0.06);
  --shadow-lg: 0 16px 44px oklch(0.3 0.03 285 / 0.16);
  --shadow-poster: 0 6px 18px oklch(0.3 0.03 285 / 0.18);
}
/* acentos em light seguem a mesma lógica — ver styles.css linhas 134-136 */
```

### 2.6 Tipografia

```css
.mai-shell {
  --display: 'Fraunces', 'Newsreader', Georgia, serif;   /* títulos, números grandes, pôster */
  --sans:    'DM Sans', system-ui, -apple-system, sans-serif;  /* UI, corpo, botões */
  --mono:    'DM Mono', ui-monospace, 'SF Mono', monospace;   /* TxEy, datas, contagens */
}
```

Importar via Google Fonts no `<head>`: `Fraunces:ital,wght@0,400;0,600;1,400` + `DM+Sans:wght@400;600;700` + `DM+Mono:wght@400;500`.

### 2.7 Raios, densidade e proporção do pôster

```css
.mai-shell {
  --r-sm: 6px;   /* chips, badges pequenos */
  --r-md: 12px;  /* cards menores, inputs, nav items */
  --r-lg: 18px;  /* cards pôster, painéis, modais */
  --r-xl: 28px;  /* hero, detail-banner */

  --poster-w: 136px;   /* variável controlada por [data-density] */
}

.mai-shell[data-density='large']   { --poster-w: 180px; }
.mai-shell[data-density='medium']  { --poster-w: 136px; }
.mai-shell[data-density='compact'] { --poster-w: 96px;  }
/* compact também reduz gap do grid e font-size de .pm-sub */
```

Proporção pôster: **2:3** (portrait, `aspect-ratio: 2 / 3`). Backdrop/hero/still: **16:9**.

---

## 3. Layout do Shell (`.mai-shell`)

```
.mai-shell — display: grid, grid-template-columns: 240px 1fr, grid-template-rows: 1fr auto
┌──────────────────────────────────────────────────────────┐
│ .mai-side (col 1, row 1)       │ .mai-main (col 2, row 1) │
│  240px                         │  flex column             │
│  ──────────────────────        │  .mai-topbar (56px)      │
│  [marca + mai-hero.png]        │  .mai-scroll (flex:1)    │
│  [btn "Logar sessão" primário] ├──────────────────────────┤
│  ──────────────────────        │                          │
│  nav grupo "Acervo"            │  CONTEÚDO DA TELA        │
│   📺 Início                   │  .page (max-width 1180px) │
│   🗂 Catálogo         [N]     │                          │
│   📖 Diário           [N]     │                          │
│   🌙 Quero assistir   [N]     │                          │
│  nav grupo "Descobrir"         │                          │
│   📅 Próximos eps     [N]     │                          │
│   📊 Estatísticas             │                          │
│  ──────────────────────        │                          │
│  [quote itálica Fraunces]      │                          │
│  ← Voltar à Makima             │                          │
└────────────────────────────────┴──────────────────────────┘
│ .footbar (col 1/3, row 2) — 70px, backdrop-filter blur    │
└──────────────────────────────────────────────────────────┘
```

### Sidebar (`.mai-side`)

- **Marca** (`.side-brand`): avatar circular 46px com `mai-hero.png` (`object-position: 50% 8%`),
  glow `var(--glow)`. Nome "Mai" em Fraunces 23px + emoji 🐰 como prefixo menor. Role "Séries"
  em DM Mono 9.5px uppercase.
- **Botão CTA** (`.side-log-btn`): `gradient(135deg, --mai, --mai-deep)`, largura quase toda,
  texto "Logar sessão" — abre `LogWatchModal` sem série pré-selecionada.
- **Nav groups**: labels "Acervo" e "Descobrir" em DM Mono 9px uppercase. Items com emoji (15px)
  + texto + contador monospace à direita. Ativo: `background: var(--mai-tint)`, texto
  `--mai-deep`, peso 700.
- **Rodapé**: quote itálica em Fraunces + link "Voltar à Makima" com dot vermelho (`.back-makima`).
- **Collapse responsivo**: sidebar reduz a 64px a `<900px` — apenas ícone (texto e contadores
  somem via `display: none` em media query).

### Topbar (`.mai-topbar`)

56px, `sticky top:0`, fundo `--topbar-bg` com `backdrop-filter: blur(12px)`. Título da tela
em Fraunces 21px + emoji à esquerda. Busca full-text (`min-width: 240px`, pill `border-radius:
999px`). Botão `+` circular 36px — abre `AddSeriesModal`.

Detalhe de busca: ao digitar, empurra navegação para o Catálogo e filtra por título/rede/gênero.

### Footbar (`.footbar`)

`grid-column: 1 / 3`, `height: 70px`, `--footbar-bg` backdrop blur. Só aparece se `UPCOMING.length > 0`.
Layout (left → right): label "Próximo ep" em DM Mono uppercase âmbar → still 62×38px → info
(`footbar-title` Fraunces 17px + `footbar-sub` mono âmbar) → botões switch ‹ › → "Já vi" (primário).

---

## 4. Paleta de pôsteres (fallback teatral)

Quando não há `poster_url`, o pôster é gerado por gradiente `linear-gradient(155deg, a, b)` em tom
dusk, com título em Fraunces e network abaixo de uma régua. 12 paletas nomeadas:

```js
const POSTER = {
  periwinkle: { a:'oklch(0.42 0.13 270)', b:'oklch(0.22 0.07 280)', ink:'oklch(0.96 0.02 270)' },
  dusk:       { a:'oklch(0.38 0.10 290)', b:'oklch(0.20 0.06 295)', ink:'oklch(0.95 0.02 290)' },
  amber:      { a:'oklch(0.48 0.11 62)',  b:'oklch(0.24 0.07 48)',  ink:'oklch(0.97 0.03 70)'  },
  slate:      { a:'oklch(0.40 0.05 250)', b:'oklch(0.21 0.03 255)', ink:'oklch(0.95 0.01 250)' },
  wine:       { a:'oklch(0.40 0.13 12)',  b:'oklch(0.22 0.08 8)',   ink:'oklch(0.96 0.02 14)'  },
  teal:       { a:'oklch(0.42 0.08 200)', b:'oklch(0.22 0.05 210)', ink:'oklch(0.95 0.02 200)' },
  moss:       { a:'oklch(0.42 0.08 150)', b:'oklch(0.22 0.05 160)', ink:'oklch(0.95 0.02 150)' },
  rose:       { a:'oklch(0.46 0.11 350)', b:'oklch(0.24 0.07 345)', ink:'oklch(0.96 0.02 350)' },
  indigo:     { a:'oklch(0.36 0.12 285)', b:'oklch(0.19 0.07 290)', ink:'oklch(0.95 0.02 285)' },
  sand:       { a:'oklch(0.50 0.07 78)',  b:'oklch(0.27 0.05 64)',  ink:'oklch(0.97 0.02 80)'  },
  steel:      { a:'oklch(0.44 0.04 235)', b:'oklch(0.23 0.03 240)', ink:'oklch(0.95 0.01 235)' },
  plum:       { a:'oklch(0.38 0.12 320)', b:'oklch(0.21 0.07 318)', ink:'oklch(0.96 0.02 320)' },
}
```

O pôster teatral tem overlay radial no topo + gradiente escuro embaixo + kicker (gênero mono 8px)
+ título Fraunces (tamanho adaptativo: 27px para títulos curtos → 16px para longos) + régua + network.

Ao plugar TMDB: `<img src={poster_url} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />`
mantendo todos os chips e badges sobrepostos (`position: absolute`).

---

## 5. Componentes

### 5.1 Ícones (`Icon`)

SVG inline, `viewBox="0 0 24 24"`, `stroke="currentColor"`, `strokeWidth="1.8"`, `strokeLinecap="round"`,
`strokeLinejoin="round"`, `fill="none"`. Paths disponíveis:

```js
const ICONS = {
  inicio, catalogo, diario, watchlist, calendar, stats,
  plus, search, x, arrowLeft, chevL, chevR,
  check, play, tv, star, edit, heart, moon, clock, layers,
}
```

Uso: `<Icon name="plus" />` — sem dependência de biblioteca externa.

### 5.2 Estrelas estáticas (`Stars`)

Exibe de 0 a 5 estrelas preenchidas usando SVG clipPath (via `overflow: hidden` + `width: pct%`).
A implementação usa duas camadas superpostas: fundo de estrelas vazias (`--star-empty`) +
camada preenchida (`--star`) com `width = value/5 * 100%`.

```tsx
<Stars value={4.5} />      // normal (14px)
<Stars value={4.5} sm />   // pequeno (12px)
<Stars value={4.5} lg />   // grande (21px) — usado no detail-banner
```

Tooltip: `"4.5 / 5"`.

### 5.3 Score compacto (`Score`)

Uma estrela preenchida + número em DM Mono. `null` exibe `—` em `--ink-4`.

```tsx
<Score value={4.5} />   // ★ 4.5
<Score value={null} />  // —
```

### 5.4 Rating interativo (`RateInput`)

5 estrelas clicáveis; cada estrela tem duas metades invisíveis (`.rate-half.l` / `.rate-half.r`)
que capturam hover e clique para meia estrela. Exibe valor atual + botão "limpar".

```tsx
<RateInput value={score} onChange={setScore} />
```

`onChange(0)` limpa. Hover via `setHover(n)` ou `setHover(n - 0.5)`. Valor fixo ao clicar.

### 5.5 Chip de Status (`StatusChip`)

```tsx
<StatusChip status="assistindo" />        // inline
<StatusChip status="concluida" md />      // maior (padding 5/12px)
<StatusChip status="quero_assistir" onPoster />  // sobre pôster com backdrop-filter
```

- Normal: texto `var(--st-{status})`, fundo `color-mix(in oklch, var(--st-{status}) 16%, transparent)`.
- `onPoster`: texto `oklch(0.99 0.01 90)`, fundo `color-mix(in oklch, var(--st-{status}) 78%, oklch(0.1 0.02 285))`.

Labels: `{ assistindo: 'Assistindo', concluida: 'Concluída', quero_assistir: 'Quero assistir', pausada: 'Pausada', abandonada: 'Abandonada' }`.

### 5.6 Barra de Progresso (`EpisodeProgress`)

```tsx
<EpisodeProgress series={series} />
<EpisodeProgress series={series} compact />  // sem linha "Próximo TxEy"
```

- Barra 7px `border-radius: 999px`. Progresso em `linear-gradient(90deg, --mai, --mai-bright)`.
  Concluída: `linear-gradient(90deg, --st-concluida, oklch(0.82 0.14 150))`.
- Linha inferior: posição atual (`<span class="pos">T2E4</span> · watched / total eps`) ou
  "Concluída ✓" em verde.
- Ponto âmbar pulsante (`.pulse`, `animation: pulse 2.2s infinite`) antes de "Próximo TxEy".
- `total=null` (em exibição): barra usa `(watched % 12) / 12 * 100%`.

### 5.7 Card de Pôster (`PosterCard`)

```tsx
<PosterCard series={series} />
<PosterCard series={series} badge showStatus showScore showProgress />
```

- `badge` → mostra coração se `series.fav`.
- `showStatus` → `<StatusChip onPoster />` canto inferior esquerdo.
- `showScore` → score compacto canto inferior direito (backdrop-filter pill).
- `showProgress` → barra amber 4px na base (só quando `watched > 0` e `watched < total`).
- Hover (no `poster-link` pai): `transform: translateY(-5px) scale(1.015)`, 200ms cubic-bezier(.3,.7,.4,1).

### 5.8 Heatmap (`Heatmap`)

Grade mensal (7 linhas × colunas por semana), `grid-auto-flow: column`. Células 10×10px, `border-radius: 3px`,
cor `var(--heat-{0|1|2|3|4})`. Tooltip na célula. Legenda "menos → mais" abaixo.

Nível: `count=0 → 0`, `1 → 1`, `2 → 2`, `3 → 3`, `≥4 → 4`.

### 5.9 Sparkline (`Spark`)

21 barras flexíveis 24px de altura. Barras com `count ≥ 70%` do max ficam com cor
`var(--mai)` (`.hot`); demais `var(--mai-tint-2)`.

### 5.10 Widget de Acervo (`ListStats`)

Barra empilhada (12px, `--st-{status}`) + duas colunas abaixo: status com contagem (coluna
esquerda) + totais (Total de séries / Episódios vistos / Sessões) em `--mai-deep` (coluna direita).

### 5.11 Acordeão de Temporadas (`SeasonAccordion`) ⭐ *exclusivo Mai*

Componente central da tela de Detalhe. **Não existe em nenhum outro shell**.

```tsx
<SeasonAccordion series={series} openLog={openLog} />
```

Estado inicial: temporada do `series.next` aberta; se sem próximo, a última temporada.

**Cada `SeasonRow`**:

```
.season-row (.open quando expandida)
  .season-head (onClick → toggle)   — grid: 22px 1fr auto
    .season-chev  [▶ → gira 90° quando open]
    .season-headmain
      .season-name  [Fraunces 18px — "Temporada N" + tag "T1" mono em accent]
      .season-sub   [mono 10.5px — "9 eps · 2022"]
    .season-prog-compact
      .spc-bar (84px, 5px)  [progresso compacto]
      .spc-n  [K/N ou ✓ K/N verde quando done]
  .season-body   [max-height:0 / opacity:0 → max-height:1600px / opacity:1]
    .season-body-inner  [border-top: --line-2, padding 2 14 14px]
      [lista de EpisodeLine, até epLimit=5]
      [botão "Carregar mais (+N)" → epLimit += 8]
```

**Lazy-load**: `[loaded, setLoaded] = useState(isOpen)` — `useEffect(() => { if (isOpen) setLoaded(true) })`.
Episódios só são construídos após a 1ª abertura.

**Transição**: `max-height` 0.26s ease-out + `opacity` 0.22s ease-out (sem JS de resize).

### 5.12 Linha de Episódio (`EpisodeLine`)

Grid `18px 96px 1fr auto`, clicar → `openLog(series.id, season.n, ep.number)`.

```
.epi-line (.watched | .next)
  .epi-dot  [9px círculo: --st-concluida (visto), --warm c/ glow (próximo), --ink-4 (padrão)]
  .epi-still [96×54px, border-radius 8px, gradiente dusk fallback]
    .es-ico  [emoji 📺]
    .es-num  [Fraunces "E5"]
  .epi-meta
    .em-title  [T2E5 · título — muted (--ink-3) se .watched]
    .em-sub    [mono 10.5px — data pt-BR curta]
  .epi-state
    .seen [verde, --st-concluida] + .epi-check [círculo check]
    .next [âmbar, "logar" ou "em breve"]
    agendado [📅 "agendado"]
```

Botão "Carregar mais": `font-size 12px`, `background: var(--mai-tint)`, `border: 1px solid --mai-tint-2`.

---

## 6. Modais

### 6.1 Modal: Logar Sessão (`LogWatchModal`)

**Gatilho**: botão "Logar sessão" (sidebar CTA, hero, detalhe), "Logar TxEy" (detalhe), clique
em EpisodeLine, botão "Já vi" no NextBar.

**Campos**:
```
[alvo: pôster + título + "vai para o seu diário"]
[<details> "Trocar de série ou adicionar uma nova"  (recolhível)
  — busca TMDB (debounce 440ms)
  — seriespick: scroll horizontal de miniaturas 52px]

Temporada e episódios  — grid 1fr 1fr 1fr:
  [<select> temporadas]   [ep inicial]   [ep final ≥ inicial]
  temporada              ep inicial      ep final

Quando você viu?
  [date input, max=hoje]

Sua nota · escala 0.5–5.0
  [RateInput]

Marcadores
  [toggle Favorita ❤]

Review · opcional
  [textarea "Uma cena que vai ficar. 🐰"]

[hint: ⌘ ↵ para logar]    [Cancelar]  [Logar ✓]
```

- `⌘/Ctrl+Enter` loga; `Esc` fecha.
- Ao salvar: atualiza `seasons[se.n].watched`, re-deriva progresso/next, promove status
  (`quero_assistir | pausada | abandonada → assistindo`; tudo done → `concluida`), atualiza heatmap.
- Toast: `"Sessão logada · N episódios 📺"` ou `"{Título} — concluída ✓"`.

### 6.2 Modal: Adicionar Série (`AddSeriesModal`)

**Gatilho**: botão `+` da topbar.

```
🐰 Adicionar série
[busca TMDB — debounce 440ms]
  resultados: pôster 42px + título (ano) + rede · temporadas + gênero
  [Adicionar] se não no catálogo | [já na lista] se já existe

(vazio) — "Digite para buscar na base do TMDB. A série entra como Quero assistir. 🌙"
```

Ao adicionar: série entra como `quero_assistir`, toast `"{Título} adicionada ao catálogo 📺"`,
navega para o Detalhe.

### 6.3 Seletor de Favoritas (`SeriesPicker`)

Modal aberto pelo botão "Adicionar" nos 4 slots de Favoritas (tela Início). Grid `auto-fill
minmax(98px, 1fr)` com pôsteres clicáveis do acervo. Busca por título/rede. `Esc` fecha.

### 6.4 Toast

```css
.toast {
  position: fixed; bottom: 92px; right: 24px; z-index: 200;
  background: linear-gradient(135deg, var(--mai), var(--mai-deep));
  border-radius: 999px; animation: toast-in 0.3s;
}
@keyframes toast-in { from { opacity: 0; transform: translateY(14px); } }
```

Duração: **2.8s**, então `setToast('')`. Ícone ✓ à esquerda.

---

## 7. Telas

### 7.1 Início (Home) — `screens/01-inicio.png`

```
.page (max-width 1180px, padding 0 32px 96px)
  ↓
.hero (border-radius: --r-xl=28px, min-height 280px, border: 1px --mai-tint-2)
  .hero-bg [gradiente dusk da série do último log]
  .hero-warmlight [radial âmbar 96% 8%, mix-blend: screen]
  .hero-inner (max-width 62%)
    .hero-eyebrow [🐰 Continue assistindo — mono uppercase --mai-deep]
    h1.hero-title [Fraunces clamp(30px, 3.6vw, 44px)]
    p.hero-line [StatusChip md · rede · "Última sessão: T2E4" · Score]
    .hero-cta [btn-primary "Logar sessão" + btn-ghost "Ver detalhe"]
  .hero-portrait [Mai img right bottom, halo radial blur, oculto <860px]
↓
.stat-row [grid auto-fit minmax(200px,1fr), gap 14px, mt 22px]
  [📺 Séries acompanhadas, barra --mai]
  [🎬 Episódios · 7 dias, barra --warm, sparkline]
  [⭐ Nota média / 5, barra --star]
  → cada stat-card tem faixa colorida 3px no topo (--accent-bar)
↓
.profile-split [grid 1.3fr 1fr, gap 22px, mt 44px]
  FavoriteSeries: 4 slots 2:3, localStorage 'mai.favorites', modo Editar (✕ + adicionar)
  Meu acervo: barra empilhada por status + colunas totais (ListStats)
↓
.section "Assistindo agora"
  .row-scroll [scroll-x, gap 18px, card 124px]
↓
.home-split [grid 1.5fr 1fr, gap 22px, mt 44px]
  .home-main
    "Em andamento" — .watch-grid [auto-fill minmax(132px,1fr)]
  .mai-panel
    "Atividade recente" — 5 últimos logs (mini-pôster 34px + título + T{s}E{e1–e2} + score)
    "Próximos episódios" — 4 itens (calendário data mini + título + TxEy + relFuture)
↓
.section "Esperando na fila"
  .row-scroll [scroll-x, want-card 124px]
```

### 7.2 Catálogo — `screens/02-catalogo.png`

```
.page
  .section-head [Catálogo · "N no acervo · M concluídas"]
  .cat-toolbar
    .chips [STATUS_FILTERS: Todas | Assistindo | Concluída | Quero assistir | Pausada | Abandonada]
    .toolbar-spacer
    .result-count [mono "N séries · por título"]
  .poster-grid [auto-fill minmax(--poster-w, 1fr), gap 28px 22px]
    poster-link → PosterCard(badge, showStatus, showProgress)
    .poster-meta
      .pm-title [2 linhas, -webkit-line-clamp: 2]
      .pm-sub [mono 10.5px — Score · "T2E4 / N eps" ou "N temps"]
```

Ordenação `sortSeries`: Atualizado (último log), Adicionado (ordem de inserção), Nota, Título,
Progresso (percentual watched/total).

Filtro por query: título, network, gênero (case-insensitive).

### 7.3 Detalhe da Série ⭐ — `screens/03-detalhe.png` + `screens/04-temporadas.png`

```
.page
  .detail-back [← Catálogo]
  .detail-banner (border-radius --r-xl, min-height 280px)
    .detail-banner-bg [gradiente dusk]
    .detail-warmlight [radial âmbar canto superior direito]
    .detail-hero [grid 160px 1fr, gap 28px, padding 28 32px]
      .detail-poster-wrap → PosterCard 160px badge
      .detail-info
        .detail-genre [mono 10px uppercase --mai-deep]
        h1.detail-title [Fraunces clamp(30px,4vw,46px)]
        p.detail-alt [título_original · rede · ano · N temporadas]
        .detail-rating-row [Stars lg · nota · Heart · StatusChip md]
  .detail-body
    .detail-actions
      [btn-primary "Logar sessão"]
      [btn-warm "Logar TxEy" — pré-preenche próximo ep]
      [icon-toggle "Favoritar / Favorita" — heart toggle]
    .detail-progress-card (card --r-lg)
      "Progresso geral" + ponto âmbar + "Próximo: T2E5 · título · data"
      EpisodeProgress
    .detail-grid [grid 1.35fr 1fr, <880px vira 1 col]
      col esquerda:
        "Sinopse" + .detail-synopsis
        [se notes] → .notes-block (borda esq --mai, tag "caderno da Mai 🐰")
        "Temporadas · N" → SeasonAccordion
        [se logs] → "Histórico de sessões" → .sess-log (timeline com bordalinha --mai)
      col direita:
        "Ficha" → .detail-meta-grid [grid 2 cols]
          Rede / Estreia / Temporadas / Episódios / Progresso / Sessões
        "Gêneros" → .chips [tag-chip por gênero + tag-chip.fav se favorita]
```

### 7.4 Diário — `screens/05-diario.png`

```
.page
  "Diário" · "N sessões · cada bloco de episódios que você assistiu"
  [agrupado por mês — .diary-month]
    .diary-month-label
      .dm-name [Fraunces 24px — "Junho 2026"]
      .dm-count [mono — "N sessões"]
    .diary-row [grid 52px 46px 1fr auto, hover fundo --card-2]
      .dr-day [.d-num Fraunces 24px + .d-wd mono abrev dia]
      .dr-poster [pôster 46px border-radius 8px]
      .dr-main
        .dr-title [sans 16px bold]
        .dr-eps [mono --mai-deep — "T1E7–E9 · 3 episódios"]
        .dr-note [itálico 13px entre aspas]
      .dr-marks [Score]
```

`<720px`: grid vira `44px 40px 1fr` (sem `.dr-marks`).

### 7.5 Quero Assistir (Watchlist) — `screens/06-quero-assistir.png`

```
.page
  "Quero assistir" · "N séries · ~M episódios na fila"
  .wl-list [flex column, gap 12px]
    .wl-item [flex, padding 14 18px, border --line, hover border --mai-tint-2]
      pôster 56px
      .wl-info
        .wl-title [Fraunces 20px, clique → detalhe]
        .wl-sub [mono 11px — rede · ano · N temporadas · N eps]
        .wl-genres [tags mono 9px uppercase --mai-deep, fundo --mai-tint]
      .wl-right
        [btn-warm "▶ Começar" → openLog(id, 1, 1)]
```

### 7.6 Próximos Episódios (Upcoming) — `screens/07-proximos.png`

```
.page
  "Próximos episódios" · "o que sai das séries que você está assistindo · 14 dias"
  [agrupado por data — .sched-day]
    .sched-day-label
      .sdl-name [Fraunces 21px — "Hoje, 13 jun" (âmbar) | "17 jun"]
      .sdl-rule [linha]
      .sdl-count [mono "N ep"]
    .sched-card [flex, gap 16px, hover border --warm-tint]
      .sched-still [96×54px, border-radius 8px, gradiente dusk + 📺]
      .sched-info
        .sched-title [sans 15px bold]
        .sched-ep [mono --warm-deep — "T2E5 · Woe's Hollow"]
        .sched-net [mono --ink-4 — "Apple TV+ · hoje"]
      .sched-badge [pill "novo ep", fundo --warm-tint, texto --warm-deep]
```

### 7.7 Estatísticas — `screens/08-estatisticas.png`

```
.page
  .year-switch
    [btn ◀ desativado] · [Fraunces clamp(40px,5vw,58px) "2026"] · [btn ▶] · yr-sub à direita
  .big-stat-row [grid 4 colunas, <900px vira 2]
    [N séries concluídas] [N episódios vistos] [Nh horas de série] [N.N nota média / 5]
    → valores em Fraunces 44px --mai-deep
  .section → .stat-panel "Episódios por mês"
    .bars [height 160px, flex, align-items flex-end]
      por mês: bar + barra-lbl + bar-val [mono]
  .stats-grid [grid 2×2, <880px vira 1 col]
    "Por status"    → barras horizontais por status (--st-{status})
    "Top gêneros"   → rank-row (nome + track --mai + número)
    "Top redes"     → rank-row (nome + track --warm + número)
    "Destaque do ano" → pôster 84px + título Fraunces + Stars + rede + "Maior maratona: N sessões"
  .section → .heat-card → Heatmap
    label "Heatmap de sessões · o ano inteiro, dia a dia"
```

---

## 8. Estado e navegação

### 8.1 Estado do app (`app.jsx`)

```ts
// roteamento interno (SPA, sem URL)
route: { view: 'home' | 'catalogo' | 'diario' | 'watchlist' | 'proximos' | 'stats' | 'detalhe',
         param: string | null }   // param = seriesId para 'detalhe'
query: string        // busca; limpa ao navegar (exceto no catálogo)
modal: { open, seriesId, season, ep }   // LogWatchModal
addOpen: boolean     // AddSeriesModal
toast: string        // mensagem ativa (limpa após 2.8s)
```

### 8.2 Tweaks (preferências client-only)

Persistidos no `localStorage` pelo host (`TweaksPanel`). Aplicados como `data-*` no `.mai-shell`.

| Key | Opções | Default | Aplica |
|-----|--------|---------|--------|
| `tema` | Escuro / Claro | Escuro | `data-theme='light'` |
| `acento` | Periwinkle / Rosa / Ouro / Noir | Periwinkle | `data-accent='rosa|ouro|noir'` |
| `densidade` | Grande / Médio / Compacto | Médio | `data-density='large|medium|compact'` |
| `ordenacao` | Atualizado / Adicionado / Nota / Título / Progresso | Atualizado | prop `sort` no Catalog |

Map interno: `{ 'Grande': 'large', 'Médio': 'medium', 'Compacto': 'compact' }` e
`{ 'Periwinkle': '', 'Rosa': 'rosa', 'Ouro': 'ouro', 'Noir': 'noir' }`.

### 8.3 Favoritas (localStorage)

Chave `mai.favorites`, array de `seriesId`. Máx. 4 slots. Persiste ao navegar. Editável
na tela Início — modo de edição exibe ✕ em cada slot e botão "+" para acionar `SeriesPicker`.

### 8.4 Enriquecimento da série (`enrich`)

Calculado localmente ao mudar qualquer sessão:

```ts
function enrich(series) {
  // soma watched de todas as temporadas → series.episodes_watched
  // soma eps (null = em exibição, não conta) → series.episodes_count (null se alguma aberta)
  // encontra primeira temporada com watched < cap → series.next = { season, number }
  // encontra última temporada com watched > 0 → series.pos = { season, ep }
}
```

Posição renderizada: `T${pos.season}E${pos.ep}`. "Próximo" = próximo ep não-assistido.

### 8.5 Regras de navegação

- Clique em pôster/linha → `navigate('detalhe', series.id)`.
- `detalhe` → nav ativo = `catalogo`.
- Navegar → `scrollRef.current.scrollTop = 0`.
- Digitar busca → empurra para Catálogo (se não já lá).
- Sair do Catálogo → limpa query.
- `Esc` fecha modais; `⌘/Ctrl+Enter` loga.

---

## 9. Animações e interações

| Elemento | Animação |
|----------|----------|
| Hover no pôster | `translateY(-5px) scale(1.015)` + shadow-lg — 200ms cubic-bezier(.3,.7,.4,1) |
| Accordeão expand | `max-height` 0 → 1600px em 0.26s ease-out + `opacity` 0 → 1 em 0.22s |
| Chev accordeão | `rotate(90deg)` 0.2s ease + cor `--ink-3 → --mai-deep` |
| Hover nav-item | `background: --mai-tint`, `color: --ink` — 0.12s |
| Modal entrada | `opacity: 0, translateY(12px) scale(0.98)` → nominal — 0.22s cubic-bezier(.2,.8,.3,1) |
| Scrim entrada | `opacity: 0 → 1` — 0.18s |
| Toast entrada | `opacity: 0, translateY(14px)` → nominal — 0.3s |
| Ponto âmbar ("próximo ep") | `pulse 2.2s infinite` — `box-shadow 0 → 6px` âmbar |
| `.side-log-btn` hover | `brightness(1.08) translateY(-1px)` — 0.15s |
| Botão primário hover | `brightness(1.08) translateY(-1px)` |
| Botão warm hover | `brightness(1.05) translateY(-1px)` |
| `.search:focus-within` | `border-color: --mai + box-shadow: 0 0 0 3px --mai-tint` |
| `.brand-mark` | `box-shadow: --glow` permanente |

---

## 10. Responsividade

| Breakpoint | Mudanças |
|------------|----------|
| `< 900px` | Sidebar 64px (só ícones, textos/contadores `display:none`); `side-log-btn` padding `12px 0`; `stat-row` e `big-stat-row` viram 2 colunas; `detail-hero` grid `128px 1fr` |
| `< 880px` | `detail-grid` vira 1 coluna; `stats-grid` vira 1 coluna |
| `< 860px` | `.hero-portrait` `display:none` |
| `< 720px` | `hero-inner max-width: 100%`; `footbar-info display:none`; `diary-row` grid `44px 40px 1fr` (sem marcas); `season-head` grid `20px 1fr` (sem prog-compact); `epi-line` grid `16px 1fr auto` (sem still) |

---

## 11. Contrato de dados por tela

| Tela | Endpoints |
|------|-----------|
| Início | `GET /api/series?status=assistindo` + `GET /api/series/stats` + `GET /api/series/upcoming?days=14` + `GET /api/series/diary?limit=5` |
| Catálogo | `GET /api/series` (params: `status`, `genre`, `sort`, `limit`) |
| Diário | `GET /api/series/diary?limit=50` |
| Detalhe | `GET /api/series/{id}` + lazy `GET /api/series/{id}/seasons/{n}/episodes` |
| Quero Assistir | `GET /api/series?status=quero_assistir` |
| Próximos Eps | `GET /api/series/upcoming?days=14` |
| Estatísticas | `GET /api/series/stats?year={ano}` |
| Log de sessão | `POST /api/series/{id}/log` |
| Buscar TMDB | `GET /api/series/search?q={query}` |
| Adicionar série | `POST /api/series` |
| Sync metadados | `POST /api/series/{id}/sync-metadata` |

Para shapes completos de request/response, ver `contracts/api-series.md`.

---

## 12. Regras do projeto (não violar)

1. **Nunca `fetch` direto** — sempre via `maiApi.ts` (sobre `lib/api.ts`).
2. **CSS escopado** em `.mai-shell` — zero vazamento para outros shells.
3. **Rota antes do catch-all** em `App.tsx`:
   ```tsx
   <Route path="/series/*" element={<MaiShell />} />
   // depois o /* catch-all
   ```
4. **Sem lógica de domínio no front** — fuzzy match, validação, sync no backend.
5. **Proporção 2:3** para pôsteres (portrait TMDB). Backdrop/hero/still 16:9.
6. **Escala 0.5–5.0** — 5 estrelas com meia. **Não confundir com Marin (0–10)**.
7. **`SeasonAccordion` é lazy** — episódios só buscados ao expandir pela 1ª vez.
8. **Rotas fixas antes de `/{series_id}`** no router FastAPI (`/watchlist`, `/diary`, etc.).
9. **`[data-accent]` sem valor** = periwinkle padrão (não `data-accent="periwinkle"`).
10. **Auth**: sessão via cookie existente (`require_user` em todas as rotas `/api/series/*`).

---

## 13. Entregáveis esperados do porte

```
webapp/frontend/src/pages/mai/
├── MaiShell.tsx               # shell root: sidebar + topbar + router interno + footbar
├── maiApi.ts                  # client: todos os endpoints /api/series/*
├── types.ts                   # Series, Season, Episode, WatchLog, Stats, Upcoming, PosterKey
├── mai.css                    # tokens OKLCH em .mai-shell + tema claro + 4 acentos + densidade
├── screens/
│   ├── HomeScreen.tsx         # Início (hero + stats + favoritas + assistindo + home-split + fila)
│   ├── CatalogScreen.tsx      # Catálogo (chips de filtro + grid de pôsteres + ordenação)
│   ├── DiaryScreen.tsx        # Diário (agrupado por mês, diary-row)
│   ├── DetailScreen.tsx       # Detalhe (banner + accordeão + histórico)
│   ├── WatchlistScreen.tsx    # Quero Assistir (wl-list)
│   ├── UpcomingScreen.tsx     # Próximos Episódios (timeline por dia)
│   └── StatsScreen.tsx        # Estatísticas (big-stats + barras + heatmap)
├── components/
│   ├── PosterCard.tsx         # 2:3 com fallback teatral + badges
│   ├── SeasonAccordion.tsx    # ⭐ exclusivo — com lazy-load e paginação de eps
│   ├── EpisodeLine.tsx        # grid 18px 96px 1fr auto + estados watched/next/scheduled
│   ├── EpisodeProgress.tsx    # barra + posição TxEy + ponto âmbar pulsante
│   ├── StatusChip.tsx         # 5 estados, variante onPoster
│   ├── Stars.tsx              # estáticas (sm/md/lg) + Score compacto
│   ├── RateInput.tsx          # interativo, meia-estrela via halves
│   ├── Heatmap.tsx            # grade mensal 7 linhas
│   ├── Spark.tsx              # sparkline 24px
│   ├── ListStats.tsx          # barra empilhada + 2 colunas
│   └── Icon.tsx               # SVG inline, paths do ICONS object
├── modals/
│   ├── LogWatchModal.tsx      # season select + ep-range 1fr/1fr/1fr + rate + review
│   ├── AddSeriesModal.tsx     # busca TMDB debounce 440ms → quero_assistir
│   ├── SeriesPicker.tsx       # seletor de favoritas (grid 98px)
│   └── NextBar.tsx            # footbar com UPCOMING[idx], switch ‹ ›, "Já vi"
└── ui/
    └── Toast.tsx              # pill gradient bottom-right, 2.8s
```

**Backend** (quando implementado junto):
```
webapp/backend/routers/series.py    # fachada fina sobre agents/mai/tools.py
```
Registrar em `webapp/backend/main.py` **antes** do SPA catch-all:
```python
from webapp.backend.routers import series as series_router
app.include_router(series_router.router, prefix="/api/series", tags=["series"])
```

**`Layout.tsx`** (`DOMAINS` array): adicionar entrada:
```tsx
{ character: 'Mai', label: 'Séries', mainPath: '/series', activePaths: ['/series'],
  color: 'var(--c-mai)', colorDim: 'var(--c-mai-dim)' }
```

**`index.css`** (`:root`): adicionar tokens globais:
```css
--c-mai:     oklch(0.66 0.17 270);   /* periwinkle */
--c-mai-dim: oklch(0.66 0.17 270 / 0.16);
```

---

## 14. Checklist de entrega

- [ ] Tokens OKLCH completos em `.mai-shell` (§2), sem vazamento.
- [ ] Tema claro + 4 acentos funcionando via `data-theme`/`data-accent`.
- [ ] `data-density` controla `--poster-w` (180/136/96px).
- [ ] Fontes Fraunces + DM Sans + DM Mono importadas do Google Fonts.
- [ ] Todas as 7 telas renderizando (Home, Catálogo, Diário, Detalhe, Watchlist, Upcoming, Stats).
- [ ] `maiApi.ts` com os 16 endpoints tipados (ver `contracts/api-series.md`).
- [ ] `types.ts` cobrindo `Series`, `Season`, `Episode`, `WatchLog`, `Stats`, `Upcoming`.
- [ ] `PosterCard` com fallback teatral (12 paletas POSTER) quando `poster_url=null`.
- [ ] `Stars` (3 tamanhos) + `Score` compacto + `RateInput` interativo meia-estrela.
- [ ] `StatusChip` com 5 cores de status + variante `onPoster`.
- [ ] `EpisodeProgress` com ponto âmbar pulsante, posição TxEy, estado concluída.
- [ ] `SeasonAccordion` com lazy-load (só após 1ª abertura) + paginação "Carregar mais (+N)".
- [ ] `EpisodeLine` com still 96×54 + 4 estados (watched/next/scheduled/default).
- [ ] `Icon` com todos os paths SVG do ICONS object.
- [ ] `Heatmap` por mês, grade 7 linhas, `--heat-0…4`.
- [ ] Hero com luz âmbar (`radial-gradient` mix-blend screen) + retrato Mai + eyebrow 🐰.
- [ ] Acordeão: chevron gira 90°, `max-height/opacity` transição, ativo padrão = temporada do `next`.
- [ ] `LogWatchModal`: `<select>` de temporadas + ep-range grid `1fr 1fr 1fr` + `⌘↵` atalho.
- [ ] `AddSeriesModal`: busca debounce 440ms, "já na lista" vs. "+ Adicionar".
- [ ] `NextBar` (footbar): aparece só quando `UPCOMING.length > 0`, switch ‹ › cíclico.
- [ ] Toast: pill gradient, bottom-right, 2.8s, `toast-in` 0.3s.
- [ ] Sidebar colapsa para 64px `<900px`; portrait some `<860px`.
- [ ] Rota `/series/*` em `App.tsx` antes do `/*` catch-all.
- [ ] Entry `Mai` em `Layout.tsx` + `--c-mai` / `--c-mai-dim` em `index.css`.
- [ ] FavoriteSeries: 4 slots, localStorage `'mai.favorites'`, modo edição (✕ + picker).
