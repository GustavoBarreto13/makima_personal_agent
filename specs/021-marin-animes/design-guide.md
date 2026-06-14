# Guia de Design — Animes (Marin Kitagawa) · fatia 021

Este documento guia o implementador de front-end na criação do Shell React da seção **Animes**.
O back-end e o agente Telegram já existem (fatia 021); este guia é para a fatia futura que
implementa a UI. **O protótipo hi-fi está em `design_handoff_marin_animes/`** — abra o
`Marin - Animes.html` no browser para ver o visual e o comportamento exatos. Este documento
especifica tudo que precisa ser portado para o codebase-alvo.

> **Stack**: React 19 + TypeScript + Vite 6. Padrão Shell do projeto: cada domínio em
> `webapp/frontend/src/pages/<domain>/`. Chamadas de API sempre via `marinApi.ts` sobre
> `lib/api.ts` (nunca `fetch` direto). Tokens CSS escopados em `.marin-shell`. Rotas em
> `App.tsx`: `<Route path="/animes/*" element={<MarinShell />} />` antes do catch-all `/*`.

---

## 1. Conceito visual — identidade da Marin

**Referência**: Marin Kitagawa (*My Dress-Up Darling / Sua Conduta Foi Adorável*) — gyaru
apaixonada por anime, mangá e cosplay. Explosiva, entusiasta, fashionista. A UI deve refletir
isso: **kawaii e vibrante, mas organizada**.

**Princípios**:
- **Não é cinema**: diferente da Akane (escuro noir), a Marin é **quarto de otaku iluminado por
  luzes de néon** — roxo/índigo profundo com detalhes rosa-magenta e cyan brilhantes.
- **Episódio em foco**: o progresso importa (X/24 eps), o próximo episódio deve ser imediato.
- **Estrelas MAL (0–10)**: escala de 10 estrelas com meia estrela — diferente da Akane (0.5–5.0).
- **Energia kawaii**: cantos arredondados generosos, sparkles ✨ nos detalhes, tipografia display
  de impacto para números grandes, animações suaves (não pesadas).
- **Pôster de anime**: proporção 2:3 (portrait), sem imagem — **pôster tipográfico** (gradiente
  kawaii + título + kicker de gênero). `poster_url` real substitui o gradiente quando disponível.
- **Status visual**: chips coloridos por status com bolinhas e `--st-{status}` vars.
- **Emojis como elemento de design**: ✨ ⭐ 💖 🎌 📺 nos detalhes, títulos, nawigação.
- **Acento padrão de fábrica: Neon (cyan)** (`data-accent='neon'`). Não Rosa-Magenta.

**Analogia visual**: entre um app de anime como AniList e a estética de um quarto de gyaru
com poster wall, luzes LED roxas e adesivos kawaii. Não é um Letterboxd; é uma **revista de
moda otaku digital**.

### Princípio central — Acervo ≠ Diário

Igual ao padrão da Akane (Letterboxd), há **duas entidades distintas**:
- **Acervo (catálogo)** — lista única. **Um card por anime**, com status, nota, progresso (X/Y eps).
- **Diário (logs)** — registro **cronológico de sessões**. Cada entrada cobre um **bloco de
  episódios** (`ep_start`–`ep_end`) numa data, com nota e nota textual próprias. Um anime aparece
  várias vezes.

O heatmap e as Estatísticas são **derivados** do diário.

---

## 2. Tema e tokens OKLCH — escopo `.marin-shell`

Todos os tokens declarados dentro de `.marin-shell { }`. **Dark mode é o padrão** (quarto de
otaku); light mode sobrescreve em `[data-theme='light']`. O acento é trocável via `[data-accent]`.

### 2.1 Superfícies, tinta, linhas (tema escuro base)

```css
.marin-shell {
  /* --- Fundo --- */
  --paper:      oklch(0.14 0.018 300);   /* fundo do app: escuro levemente roxo/índigo */
  --paper-2:    oklch(0.17 0.020 298);   /* sidebar, topbar */
  --card:       oklch(0.205 0.022 302);  /* cards de anime, modais */
  --card-2:     oklch(0.245 0.020 298);  /* cards secundários, hover */
  --mist:       oklch(0.27 0.045 320);   /* superfície destaque (hero overlay, badge) */

  /* --- Tinta --- */
  --ink:        oklch(0.96 0.005 300);   /* texto primário */
  --ink-2:      oklch(0.75 0.010 300);   /* subtítulo, metadados */
  --ink-3:      oklch(0.55 0.012 298);   /* texto muted, placeholder */
  --ink-4:      oklch(0.45 0.014 296);   /* texto muito muted */

  /* --- Linhas --- */
  --line:       oklch(0.31 0.022 300);   /* bordas */
  --line-2:     oklch(0.25 0.018 298);   /* divisórias sutis */

  /* --- Sombras --- */
  --shadow-sm:    0 1px 3px oklch(0 0 0 / 0.4);
  --shadow-md:    0 4px 12px oklch(0 0 0 / 0.5);
  --shadow-lg:    0 8px 24px oklch(0 0 0 / 0.6);
  --shadow-poster: 0 6px 20px oklch(0 0 0 / 0.7);
}
```

**Tema claro** `[data-theme='light']`:
```css
.marin-shell[data-theme='light'] {
  --paper:   oklch(0.97 0.005 300);
  --paper-2: oklch(0.93 0.010 300);
  --card:    oklch(0.99 0.003 300);
  --ink:     oklch(0.20 0.015 300);
  --ink-2:   oklch(0.40 0.015 298);
  --ink-3:   oklch(0.60 0.010 296);
  --line:    oklch(0.85 0.012 300);
  --line-2:  oklch(0.90 0.008 298);
}
```

### 2.2 Acento trocável — default = Neon (cyan)

**O padrão de fábrica é Neon**. Rosa-Magenta é o tema "base" (sem `data-accent`), mas o default
aplicado via localStorage/`TWEAK_DEFAULTS` é Neon. Demais acentos sobrescrevem via `[data-accent]`.

```css
/* Base: rosa-magenta (quando data-accent está ausente ou "") */
.marin-shell {
  --marin:        oklch(0.68 0.25 350);
  --marin-deep:   oklch(0.80 0.18 352);
  --marin-bright: oklch(0.84 0.16 350);
  --marin-tint:   color-mix(in oklch, var(--marin) 16%, transparent);
  --marin-tint-2: color-mix(in oklch, var(--marin) 28%, transparent);
}

/* Neon — PADRÃO DE FÁBRICA (data-accent='neon') */
.marin-shell[data-accent='neon'] {
  --marin:        oklch(0.74 0.16 210);
  --marin-deep:   oklch(0.84 0.14 208);
  --marin-bright: oklch(0.88 0.13 206);
  --marin-tint:   color-mix(in oklch, var(--marin) 16%, transparent);
  --marin-tint-2: color-mix(in oklch, var(--marin) 28%, transparent);
}

/* Sakura — rosa suave */
.marin-shell[data-accent='sakura'] {
  --marin:        oklch(0.78 0.16 355);
  --marin-deep:   oklch(0.62 0.14 355);
  --marin-bright: oklch(0.86 0.12 355);
  --marin-tint:   color-mix(in oklch, var(--marin) 16%, transparent);
  --marin-tint-2: color-mix(in oklch, var(--marin) 28%, transparent);
}

/* Gold — dourado */
.marin-shell[data-accent='gold'] {
  --marin:        oklch(0.78 0.16 86);
  --marin-deep:   oklch(0.84 0.14 86);
  --marin-bright: oklch(0.88 0.13 86);
  --marin-tint:   color-mix(in oklch, var(--marin) 16%, transparent);
  --marin-tint-2: color-mix(in oklch, var(--marin) 28%, transparent);
}
```

**Acento secundário** (cyan — fixo em todos os temas, destaque de "próximo ep" e "novo"):
```css
.marin-shell {
  --cyan:      oklch(0.74 0.15 210);
  --cyan-tint: color-mix(in oklch, var(--cyan) 20%, transparent);
}
```

### 2.3 Estrelas MAL, corações e heatmap

```css
.marin-shell {
  --star:       oklch(0.85 0.15 86);    /* estrela preenchida (dourada) */
  --star-empty: oklch(0.35 0.020 296);  /* estrela vazia */
  --heart:      oklch(0.70 0.22 8);     /* coração (favoritar) */

  /* Heatmap de sessões — segue o acento via hue 350 (rosa) */
  --heat-0:  var(--line-2);
  --heat-1:  oklch(0.40 0.12 350);
  --heat-2:  oklch(0.52 0.18 350);
  --heat-3:  oklch(0.62 0.22 350);
  --heat-4:  oklch(0.72 0.25 350);
}
```

**Chips de status** — nome da variável é `--st-{status}` (não `--status-`):
```css
.marin-shell {
  --st-assistindo:     oklch(0.74 0.15 210);   /* cyan — em progresso */
  --st-completo:       oklch(0.74 0.16 150);   /* verde — concluído */
  --st-quero_assistir: oklch(0.72 0.17 296);   /* roxo-lavanda — fila */
  --st-pausado:        oklch(0.78 0.14 70);    /* âmbar — em espera */
  --st-abandonado:     oklch(0.62 0.13 18);    /* vermelho muted — dropped */
}
```

### 2.4 Tipografia

| Função | Família | Uso |
|--------|---------|-----|
| **Display** | `DM Serif Display` | Títulos, hero, pôster (title), números stat |
| **Sans** | `DM Sans` | UI, botões, corpo, labels |
| **Mono** | `DM Mono` | "Ep 12/24", datas, contagens |
| **Decorativo** | emoji nativo | ✨ ⭐ 💖 🎌 📺 nos detalhes |

> Diferente da Akane (Newsreader para reviews), a Marin **não** usa serif de texto — o caráter
> kawaii vem das cores e dos emojis, não da tipografia clássica.

### 2.5 Raios, densidade e pôster

```css
.marin-shell {
  --r-sm:  9px;    /* chips, badges */
  --r-md:  14px;   /* cards menores, inputs */
  --r-lg:  22px;   /* cards grandes, modais, pôster */
  --r-xl:  32px;   /* detalhe hero */

  /* Pôster: proporção 2:3 (portrait) */
  --poster-w:     150px;   /* médio (padrão) */

  /* [data-density='large']   → --poster-w: 184px */
  /* [data-density='medium']  → --poster-w: 150px (padrão) */
  /* [data-density='compact'] → --poster-w: 108px */
}
```

**Paletas de pôster** (`POSTER`) — 12 gradientes vibrantes kawaii, cada uma com `{ a, b, ink }`:
`magenta · violet · cyan · emerald · amber · sunset · indigo · rose · teal · lime · plum · sky`

O pôster tipográfico usa `background: linear-gradient(155deg, p.a, p.b)` e `color: p.ink`.
O título no pôster usa DM Serif Display com tamanho dimensionado pelo comprimento:
- `> 30 chars` → 15px · `> 22` → 17px · `> 14` → 21px · `≤ 14` → 26px

---

## 3. Layout do Shell (`.marin-shell`)

```
┌─────────────────────────────────────────────────────────────────┐
│ SIDEBAR (244px, sticky)        │ MAIN CONTENT                    │
│                                │                                 │
│  [retrato Marin]  Marin        │ TOPBAR (56px, sticky)           │
│                  Animes        │  [emoji] Título · [busca] [+]   │
│  [Logar episódio]  (CTA)       ├─────────────────────────────────┤
│  ──────────────────            │                                 │
│  ACERVO                        │  CONTEÚDO DA TELA               │
│  📺 Início                     │  (scroll)                       │
│  🎌 Catálogo      N            │                                 │
│  📖 Diário        N            │                                 │
│  ⭐ Quero assistir N           │                                 │
│  DESCOBRIR                     │                                 │
│  📅 Lançamentos   N            │                                 │
│  📊 Estatísticas               │                                 │
│  ──────────────────            │                                 │
│  [🔄 Sync MAL]                 │                                 │
│  · Voltar à Makima             │                                 │
└─────────────────────────────────────────────────────────────────┘
│ NEXT BAR (70px) — barra inferior: próximo episódio + "Já vi"    │
└─────────────────────────────────────────────────────────────────┘
```

**Sidebar** (244px, fundo `--paper-2`):
- Marca: retrato `marin-hero.png` (40×40px) + "Marin" em negrito + "Animes" em `--ink-3`.
- Botão **"Logar episódio"** (CTA primário, logo abaixo da marca — `--marin` background).
- Nav em dois grupos — label "Acervo" e "Descobrir" — cada item: emoji + label + badge de
  contagem (`--card-2`, `--ink-3`). Item ativo: `--marin-tint` de fundo, `--marin` no emoji.
- Botão "🔄 Sync MAL" (ícone de sync + label) com estado `syncing` (classe `.syncing`, spinner).
- Link "· Voltar à Makima" discreto (`--ink-3`, `·` em `--marin`).
- **Responsivo ≤ 900px**: colapsa para 64px (só emojis, labels/counts somem).

**Topbar** (56px, fundo `--paper-2`, sticky):
- Título da tela: `[emoji] Nome` em `--ink`, fonte medium.
- Campo de busca: abre o catálogo filtrado ao digitar (nav automaticamente para Catálogo).
- Botão `+` à direita: abre `AddAnimeModal`.

**NextBar** (70px, barra inferior fixa):
- Mostra o próximo episódio dos animes "assistindo" com data mais próxima.
- Setas para navegar entre múltiplos próximos episódios.
- Botão "Já vi" abre `LogWatchModal` pré-preenchido.
- Ocultar quando não houver próximo episódio.

---

## 4. Telas

> **Capturas de referência em `design_handoff_marin_animes/screens/`** (1920×1080, tema Neon):
> `01-inicio.png` · `02-catalogo.png` · `03-detalhe.png` · `04-diario.png` · `05-quero-assistir.png` · `06-lancamentos.png` · `07-estatisticas.png`

### 4.1 Início (`Home`)

**Hero "continue assistindo"** (último anime logado):
- Fundo: gradiente da paleta POSTER do anime (`hero-bg`) + overlay escuro + padrão de pontilhado
  (`hero-spark` — subtle dot grid com `--marin-tint`).
- Eyebrow: "✨ Continue assistindo" em `--marin`, `--mono` uppercase.
- Título do anime em DM Serif Display (grande).
- Linha de metadados: `StatusChip` + "Último: Ep X / Y" + nota (Score).
- CTAs: **Logar episódio** (`--marin` background) + **Ver detalhe** (outline).
- **Retrato da Marin** flutuante à direita — `marin/marin-hero.png` (500×499px) com halo em
  `--marin-tint` e `drop-shadow` dramático. Ocultar em `≤ 820px`.

**3 stat cards** (horizontais abaixo do hero):
- 📺 Animes acompanhados (assistindo + completos) — número em DM Serif Display.
- 🎌 Episódios · 7 dias — número + sparkline (`Spark`) + Δ vs. semana anterior.
- ⭐ Nota média — número com 1 decimal + "/10".

**`profile-split`** (2 colunas em ≥ 980px):
- **`FavoriteAnimes`**: 4 pôsteres favoritos editáveis (remover/adicionar via `AnimePicker`).
  Persiste em `localStorage['marin.favorites']`.
- **`MalStats`**: menu da lista MAL — barra empilhada proporcional + 2 colunas (status com
  bolinhas + totais: total de títulos, rewatches, episódios).

**`home-split`** (2 colunas):
- **Assistindo agora**: grade de `PosterCard` com barra de progresso (`EpisodeProgress compact`).
- **Painel lateral**: Atividade recente (últimas 5 sessões do `LOGS`) + Próximos episódios
  (3–4 cards compactos do `SCHEDULE` mais próximos).

**Carrossel "Esperando na fila"** (scroll horizontal):
- Animes com `status = 'quero_assistir'` em cards de pôster menores.

---

### 4.2 Catálogo (`Catalog`)

Grade de `PosterCard` (`auto-fill minmax(--poster-w, 1fr)`).

**Chips de filtro** (topo, scroll horizontal com bolinhas de cor):
`Todos | Assistindo | Completo | Quero assistir | Pausado | Abandonado`
Cada chip com bolinha `--st-{status}`.

**Cada card de pôster**:
- Gradiente POSTER ou `poster_url` real.
- Kicker no topo: `gênero · media_type` (media_type só se ≠ TV).
- Título em DM Serif Display (tamanho pelo comprimento — ver §2.5).
- Rodapé: linha separadora + estúdio + temporada.
- Chip de status sobreposto no canto inferior (`StatusChip onPoster` — fundo translúcido + blur).
- Score compacto sobreposto (⭐ + número).
- Faixa de progresso fina na borda inferior (`episodes_watched / episodes_total`).
- Hover: `translateY(-5px) scale(1.015)` + `--shadow-poster`. Transição 0.2s.

**Sort** (via Tweaks ou parâmetro): Atualizado / Adicionado / Nota / Título / Progresso.

**Busca via topbar**: filtra por título, estúdio ou gênero em tempo real.

---

### 4.3 Diário (`Diary`)

Lista cronológica decrescente, agrupada por mês.

**Separadores**: `─── Junho 2026 ───` entre meses (com `--line`, fonte mono).

**Cada entrada**:
```
[mini-pôster 48px]  [dia] [dia-da-semana]   Dungeon Meshi
                                             Ep 10–12 · 3 episódios
                                             "Episódio do Marcille foi top!!"
                                             ⭐ 9.0
```
- Mini-pôster: `PosterCard` compacto (2:3, 48px de largura) ou gradiente.
- Dia: número do dia, dia-da-semana em `--ink-3`.
- Nota textual em itálico (`--ink-2`).
- `Score` à direita.

**FAB (+)** no canto inferior direito: abre `LogWatchModal` sem pré-seleção.

---

### 4.4 Detalhe do Anime (`AnimeDetail`)

**Banner + identidade**:
- Banner: `banner_url` (360px alt, blur lateral + gradiente overlay) ou gradiente POSTER.
- Pôster flutuante à esquerda (2:3, `--shadow-poster`).
- Título em DM Serif Display (grande), `title_jp · estúdio · temporada · media_type` em `--ink-3`.
- Linha de nota: 10 estrelas MAL (`Stars`) + valor + coração (`Heart`) + `StatusChip`.
- Ações: **Logar episódio** + **Favoritar** (toggle coração).

**Barra de progresso** (`EpisodeProgress`):
- Barra + "X / Y eps" + "Próximo: Ep N · título · data" em `--cyan` com pulsação.

**Grid 2 colunas**:
- **Esquerda**:
  - Sinopse (colapsável após 3 linhas, botão "ver mais").
  - **Caderno da Marin** (`anime.notes`): bloco com fundo `--mist`, fonte DM Sans italic, ícone
    ✏️, título "Notas da Marin" — as anotações do usuário em voz da Marin.
  - **Lista de episódios** (paginada, 12 por vez):
    - Ep N · título · data · ícone de status:
      - ✓ verde = assistido (texto `--ink-3`)
      - ▶ cyan = próximo ep não assistido (destaque `--cyan`)
      - 📅 = agendado (data em `--cyan`)
    - Botão "Carregar mais" ao final de cada página.
- **Direita**:
  - Ficha: metadados (estúdio, temporada, total de eps, gêneros, source).
  - Chips de gênero.
  - **Histórico de sessões** (timeline): últimas 5–10 sessões do `watch_logs`.

---

### 4.5 Quero Assistir (`Watchlist`)

Lista vertical: mini-pôster + título + `estúdio · temporada · eps` + chips de gênero.

**Botão por item**: "▶ Começar" — ao clicar:
1. Move o status do anime para `'assistindo'`.
2. Abre `LogWatchModal` pré-preenchido com `ep_start=1` e `ep_end=1`.

Sem barra de progresso (0 eps assistidos, destaque no gênero/temporada).

---

### 4.6 Lançamentos (`Schedule`)

Timeline por dia (próximos 14 dias), filtrado por `anime.status = 'assistindo'`.

```
── Hoje, 13 jun ───────────────────────────────────────
  📺 Frieren · Ep 25 · "Aura, a Ceifadora"
     [mini-pôster]  23:00 JST (11:00 BRT)  [badge NOVO EP]

── Amanhã, 14 jun ─────────────────────────────────────
  📺 Dungeon Meshi · Ep 13 · "Dumplings"
     [mini-pôster]  23:00 JST (11:00 BRT)
```

- Horário JST + conversão BRT (JST − 12h).
- Badge "novo ep" em `--cyan` no mesmo dia ou já lançado.
- Thumbnail do episódio quando disponível (`thumbnail_url`).
- Dados: `GET /api/animes/schedule?days=14`.

**Responsivo ≤ 720px**: layout de coluna única, thumbnails menores.

---

### 4.7 Estatísticas (`Stats`)

Year switch (2026 ◀ 2025 ▶); dados de `GET /api/animes/stats?year={ano}`.

```
┌─────────────────────────────────────────────────────┐
│  12 animes · 156 eps · 65h · ⭐ 8.3                │
├──────────────────────┬──────────────────────────────┤
│  EPISÓDIOS POR MÊS   │  POR STATUS                  │
│  [gráfico de barras] │  Assistindo   4  ████         │
│  jan fev mar …       │  Completo     7  ████████     │
│                      │  Watchlist   10  ██████████   │
├──────────────────────┼──────────────────────────────┤
│  TOP GÊNEROS         │  TOP ESTÚDIOS                │
│  Fantasy    8        │  TRIGGER     3               │
│  Action     5        │  MAPPA       2               │
│  Slice of…  4        │  ufotable    1               │
├──────────────────────┴──────────────────────────────┤
│  DESTAQUE DO ANO                                    │
│  [pôster do anime com maior nota do ano]            │
│  título · maior maratona (N eps num dia)            │
├─────────────────────────────────────────────────────┤
│  HEATMAP DO ANO INTEIRO (52 semanas × 7 dias)       │
└─────────────────────────────────────────────────────┘
```

---

## 5. Componentes

### 5.1 `Icon({ name })`
Ícones de linha (stroke 1.8, strokeLinecap round, strokeLinejoin round), viewBox 0 0 24 24.
Nomes disponíveis: `inicio, catalogo, diario, watchlist, calendar, stats, plus, search, x,
arrowLeft, chevL, chevR, check, play, sync, cam, clock, star, edit, heart, tv`.

### 5.2 `Heart({ filled, className })`
SVG de coração. `filled` = preenchido com `currentColor` (cor herdada — use `--heart`).

### 5.3 `Stars({ value, lg?, sm? })`
**Estrelas MAL estáticas** — 10 estrelas, meia via clip (overlapped filled + clip width%). Escala
0–10. `lg` = tamanho grande (detalhe), `sm` = compacto (cards).

```tsx
<Stars value={9.0} />       // 10 estrelas, 90% preenchidas
<Stars value={9.0} sm />    // versão compacta
```

### 5.4 `Score({ value, className? })`
Nota compacta: 1 estrela + número (ex.: ⭐ 9.0). Para uso em cards e listas. `null` → "— / 10"
em `--ink-4`.

### 5.5 `RateInput({ value, onChange })`
**Rating interativo MAL** — 10 estrelas, meio-passo. Cada estrela tem 2 metades clicáveis
(`rate-half l` / `r`). Hover anima preenchimento. Botão "limpar" aparece quando `value > 0`.

```tsx
<RateInput value={score} onChange={(v) => setScore(v)} />
```

### 5.6 `StatusChip({ status, md?, onPoster? })`
Chip de status PT-BR. Cor via `--st-{status}`. `onPoster` = fundo translúcido +
`color-mix(in oklch, var(--st-{status}) 78%, oklch(0.1 0.02 300))` com texto quase branco.
Ponto (`.sc-dot`) da cor do status + label textual capitalizado.

```tsx
<StatusChip status="assistindo" />        // fundo 16% opacity
<StatusChip status="completo" onPoster /> // versão sobre pôster
```

### 5.7 `EpisodeProgress({ watched, total, next?, compact? })`
Barra horizontal (6px, `--marin` preenchido, `--line` vazio). Texto: "12 / 24 eps" ou "12 / ? eps"
quando `total = null`. `done` (`watched >= total`): barra verde + "Completo ✓". Linha abaixo:
`Próximo: Ep N · título` em `--cyan` + ícone de pulso (`pulse` animation). `compact` omite o
próximo ep.

### 5.8 `PosterCard({ anime, badge?, showStatus?, showScore?, showProgress? })`
**Pôster kawaii** 2:3. Sem `poster_url` → gradiente POSTER; com → `<img>` sobre gradiente.
- `badge` = mostra coração se `anime.fav`.
- Kicker no topo: `gênero · media_type` (omite ` · TV`).
- Título em DM Serif Display (tamanho dinâmico pelo comprimento).
- Rodapé: linha horizontal + estúdio + temporada.
- `showStatus` → `StatusChip onPoster` no canto inferior.
- `showScore` → Score compacto sobreposto.
- `showProgress` → faixa de progresso fina na borda inferior (só quando parcialmente assistido).
- Hover: `translateY(-5px) scale(1.015)` + `--shadow-poster`, transição 0.2s ease.

### 5.9 `MalStats({ profile? })`
Menu da lista MAL. `profile = { rows, total, rewatched, episodes }`.
- **Barra empilhada**: segmentos proporcionais coloridos por `--st-{status}`, com `title`.
- **2 colunas abaixo**:
  - Col 1: status com bolinha colorida + label + contagem.
  - Col 2 (totals): Total de títulos, Rewatches, Episódios.

### 5.10 `FavoriteAnimes` + `AnimePicker`
**`FavoriteAnimes`**: grade de 4 pôsteres favoritos editáveis. Botão de remoção (×) sobre cada
pôster. Botão (+) na 4ª posição quando há slot vazio — abre `AnimePicker`.
Persiste em `localStorage['marin.favorites']` (array de IDs).

**`AnimePicker`**: modal de busca dentro do acervo (não Jikan) — input de texto, lista de
resultados com mini-pôster + título. Clique adiciona aos favoritos e fecha.

### 5.11 `Heatmap({ data })`
Grade de sessões/dia agrupada por mês. Cada mês: cabeçalho `[nome] [total]` + grid de células
com `--heat-0..4` baseado no count. Lead de células vazias para alinhar ao dia da semana.
Legenda "menos ◼◼◼◼◼ mais" no rodapé.

### 5.12 `Spark({ data })`
Mini sparkline vertical (barras de altura proporcional ao max). Barras com `count >= 70% do max`
ganham classe `.hot` (cor `--marin`).

### 5.13 `NextBar`
**Barra inferior fixa** (70px) com o próximo episódio dos animes "assistindo" cuja data é mais
próxima. Layout: pôster mini + título + "Ep N · data" + setas (chevron L/R para navegar entre
próximos) + botão "Já vi" (abre `LogWatchModal`). Oculta quando `SCHEDULE.length === 0`.

### 5.14 `LogWatchModal`
Modal de log de episódios. Campos:
- Pré-seleção de anime (busca no acervo se não pré-preenchido).
- `ep_start` / `ep_end` (number inputs; ep_end ≥ ep_start, default: próximo ep).
- Data assistida (date picker, default: hoje).
- `RateInput` 0–10 MAL.
- Textarea de notas ("O que você achou? ✨").
- Checkbox "Favoritar" (coração).

`⌘↵` (ou Ctrl+Enter) submete; `Esc` fecha. `POST /api/animes/{id}/log` → fecha → toast.

Toast ao concluir: `"${title} completo! 🎉"` ou `"Logado! N episódio(s) 🎀"` (2.8s).

### 5.15 `AddAnimeModal`
Busca rápida (gatilho: botão `+` na topbar). Input → debounce → `GET /api/animes/search?q=`.
Resultados: mini-pôster + título + tipo + ano. Anime já no acervo: chip "Já na lista", clique
navega ao detalhe sem criar. Anime novo: `POST /api/animes` → toast "Título adicionado! ✨" →
navega ao detalhe.

### 5.16 `Toast`
Notificação flutuante no canto inferior. Aparece com animação `toast-in` (slide up). Some após
**2.8s** automaticamente. Uma toast por vez (nova substitui a anterior).

---

## 6. Interações e Comportamento

### 6.1 Logar episódio (`addLog`)
1. Cria entrada no `watch_logs` (POST).
2. `anime.episodes_watched = max(atual, ep_end)`.
3. Grava nota/favorito se fornecidos.
4. Status `quero_assistir | pausado | abandonado` → `assistindo`.
5. Ao atingir `episodes_total` → `completo`, zera `next`.
6. Incrementa heatmap do dia.
7. Dispara toast.

### 6.2 Adicionar anime
- `GET /api/animes/search?q=` (Jikan) → lista de candidatos.
- Confirmação do usuário → `POST /api/animes` (body: `{ mal_id }`) → status `quero_assistir`.
- Toast + navega ao detalhe.

### 6.3 Sync MAL
- Botão na sidebar → estado `syncing` (ícone gira com `.syncing` + `spin` animation).
- `POST /api/animes/sync-mal` → toast "Sync concluído ✨ · N criados · M atualizados".
- Sem credenciais → toast de erro direto (sem modal).

### 6.4 Hover padrão
- `PosterCard`: `translateY(-5px) scale(1.015)` + `--shadow-poster`. 0.2s ease.
- `nav-item`: fundo `--marin-tint`. 0.12s.
- Chips/botões: fundo 10% mais claro. 0.15s.

### 6.5 Animações CSS
| Nome | Uso |
|------|-----|
| `pulse` | Indicador de "próximo ep" na `EpisodeProgress` (loop, 2s) |
| `spin` | Ícone de sync na sidebar |
| `modal-in` | Entrada de modais (scale + opacity, 0.2s) |
| `scrim-in` | Fundo dos modais (opacity, 0.2s) |
| `toast-in` | Toast slide-up (translateY + opacity, 0.3s) |

Transições gerais: 0.12s (nav/chips) a 0.4s (modais grandes).

### 6.6 Responsivo

| Breakpoint | Comportamento |
|------------|---------------|
| ≤ 900px | Sidebar colapsa para 64px (só emojis, labels/counts somem) |
| ≤ 820px | Retrato da Marin no hero some |
| ≤ 720px | Diário em coluna única; NextBar reduzido |
| ≤ 600px | Topbar compactada; grade do catálogo força 2 colunas |

---

## 7. Tweaks (painel de preferências)

Painel flutuante `TweaksPanel` (ativado por ⚙ na sidebar). Preferências client-only via
`localStorage` sob `marin-prefs`. Ao montar: aplica `data-accent`, `data-theme`, `data-density`
no `.marin-shell`. **Defaults de fábrica**:

| Preferência | Opções | **Default** |
|-------------|--------|-------------|
| Tema | Escuro / Claro | **Escuro** |
| Cor de acento | Rosa-Magenta / Sakura / **Neon** / Gold | **Neon** |
| Densidade do catálogo | Grande / **Médio** / Compacto | **Médio** |
| Ordenação padrão | **Atualizado** / Adicionado / Nota / Título / Progresso | **Atualizado** |

Mapeamentos para `data-*`:
```ts
const ACCENT_MAP  = { 'Rosa-Magenta': '', 'Sakura': 'sakura', 'Neon': 'neon', 'Gold': 'gold' };
const DENSITY_MAP = { 'Grande': 'large', 'Médio': 'medium', 'Compacto': 'compact' };
```

---

## 8. Contrato de dados por tela

| Tela | Endpoint(s) |
|------|-------------|
| Início | `GET /api/animes?status=assistindo` + `/stats` + `/schedule?days=14` + `/logs?limit=5` |
| Catálogo | `GET /api/animes` (status, sort, genre) |
| Diário | `GET /api/animes/logs?limit=50` |
| Detalhe | `GET /api/animes/{id}` (+ episodes + logs) |
| Quero assistir | `GET /api/animes?status=quero_assistir` |
| Lançamentos | `GET /api/animes/schedule?days=14` |
| Estatísticas | `GET /api/animes/stats?year={ano}` |
| Logar episódio | `POST /api/animes/{id}/log` |
| Buscar anime | `GET /api/animes/search?q={query}` |
| Adicionar anime | `POST /api/animes` |
| Sync MAL | `POST /api/animes/sync-mal` |

Para shapes completos de request/response, ver `contracts/api-anime.md`.

**Persistência client-only**: `localStorage['marin.favorites']` (IDs dos favoritos) e
`localStorage['marin-prefs']` (tweaks).

### Modelo de dados (interface TypeScript)

```ts
type Status = 'assistindo' | 'completo' | 'quero_assistir' | 'pausado' | 'abandonado';
type PosterKey = 'magenta' | 'violet' | 'cyan' | 'emerald' | 'amber' | 'sunset' |
                 'indigo' | 'rose' | 'teal' | 'lime' | 'plum' | 'sky';

interface Anime {
  id: string;
  title: string;
  title_jp?: string;
  year: number;
  season: string;          // "Inverno 2024"
  studio: string;
  media_type: 'TV' | 'Movie' | 'OVA' | 'Special' | 'ONA';
  genres: string[];
  poster: PosterKey;       // chave da paleta tipográfica
  poster_url?: string;     // URL real (substitui gradiente)
  banner_url?: string;
  status: Status;
  score: number | null;    // 0–10, passo 0.5 (MAL)
  fav: boolean;
  episodes_watched: number;
  episodes_total: number | null;  // null = em exibição
  next?: { number: number; title?: string; aired?: string };
  synopsis: string;
  notes?: string;          // anotações do usuário (voz da Marin)
  episodes: Episode[];
}

interface Episode {
  number: number;
  title?: string;
  aired?: string;          // ISO date
  thumbnail_url?: string;
  airing_status?: 'lancado' | 'agendado';
  watched: boolean;
}

interface WatchLog {
  id: string;
  date: string;            // ISO date
  animeId: string;
  anime_title?: string;
  ep_start: number;
  ep_end: number;
  score: number | null;
  note: string | null;
}

interface MalProfile {
  rows: Array<{ status: Status; label: string; n: number }>;
  total: number;
  rewatched: number;
  episodes: number;
}
```

---

## 9. Regras do projeto (não violar)

1. **Nunca `fetch` direto** — sempre via `marinApi.ts` (sobre `lib/api.ts`).
2. **CSS escopado** em `.marin-shell` — nenhum token vaza para outros shells.
3. **Rota antes do catch-all** em `App.tsx`:
   ```tsx
   <Route path="/animes/*" element={<MarinShell />} />
   // depois o /* catch-all
   ```
4. **Sem Redux/Zustand** — `useState`/`useReducer` local + SWR/React Query para cache.
5. **Sem lógica de domínio no frontend** — fuzzy match, validação e sync vivem no backend.
6. **Auth**: toda chamada passa pelo cookie de sessão existente (`require_user`).
7. **Escala 0–10 MAL** (não 0.5–5.0 da Akane). 10 estrelas, meia estrela.
8. **Proporção 2:3 para pôsteres** de anime.
9. **Calendar Hub fora** — não integrar `calendar_hub.py`.
10. **Nomes de var CSS**: `--st-{status}` (não `--status-{status}`).
11. **Padrão Neon** — `data-accent='neon'` é o default persistido, não Rosa-Magenta.

---

## 10. Entregáveis esperados do porte

```
webapp/frontend/src/pages/marin/
├── MarinShell.tsx          # shell root: sidebar + topbar + NextBar + router interno
├── marinApi.ts             # client: todos os 11 endpoints de /api/animes/*
├── types.ts                # Anime, WatchLog, Episode, Stats, Schedule, SyncResult, MalProfile
├── marin.css               # tokens OKLCH em .marin-shell + temas/acentos
├── screens/
│   ├── HomeScreen.tsx      # Início (hero + stats + profile-split + home-split + carrossel)
│   ├── CatalogScreen.tsx   # catálogo com grid de pôsteres + filtros + sort
│   ├── DiaryScreen.tsx     # diário cronológico por mês
│   ├── WatchlistScreen.tsx # quero assistir + botão Começar
│   ├── ScheduleScreen.tsx  # lançamentos por dia
│   └── StatsScreen.tsx     # estatísticas anuais
├── components/
│   ├── PosterCard.tsx
│   ├── EpisodeProgress.tsx
│   ├── StatusChip.tsx
│   ├── StarRating.tsx      # Stars (static) + RateInput (interactive)
│   ├── Score.tsx
│   ├── EpisodeLine.tsx
│   ├── MalStats.tsx
│   ├── FavoriteAnimes.tsx  # + AnimePicker interno
│   ├── Heatmap.tsx
│   ├── Spark.tsx
│   ├── AnimeDetail.tsx     # tela de detalhe (banner + progress + episodes + history)
│   └── NextBar.tsx         # barra inferior próximo episódio
├── modals/
│   ├── LogWatchModal.tsx
│   ├── AddAnimeModal.tsx
│   └── MarinTweaks.tsx     # painel de preferências (tweaks)
└── ui/
    └── Toast.tsx
```

**Backend** (quando implementado junto):
```
webapp/backend/routers/animes.py    # router FastAPI, fachada fina sobre agents/marin/tools.py
```

**Checklist de entrega**:
- [ ] Tokens OKLCH em `.marin-shell` com `--st-{status}` (não `--status-`), sem vazamento.
- [ ] Acento padrão Neon (`data-accent='neon'`) aplicado no mount.
- [ ] 7 telas renderizando (mesmo com dados mock).
- [ ] `marinApi.ts` com os 11 endpoints tipados.
- [ ] `types.ts` cobrindo `Anime`, `WatchLog`, `Episode`, `Stats`, `Schedule`, `MalProfile`.
- [ ] `PosterCard` com fallback tipográfico (gradiente POSTER + kicker + título + rodapé) quando `poster_url=null`.
- [ ] `StarRating` (`Stars` + `RateInput`): 10 estrelas, meia estrela, escala 0–10.
- [ ] `StatusChip` com as 5 cores via `--st-{status}`, variante `onPoster`.
- [ ] `MalStats` com barra empilhada + 2 colunas (status + totals).
- [ ] `FavoriteAnimes` + `AnimePicker` com persistência em `localStorage['marin.favorites']`.
- [ ] `NextBar` funcional com setas e "Já vi".
- [ ] `LogWatchModal` com ⌘↵ submit, Esc fecha, toast 2.8s.
- [ ] Hover nos pôsteres: `translateY(-5px) scale(1.015)`.
- [ ] Animations: `pulse`, `spin`, `modal-in`, `scrim-in`, `toast-in`.
- [ ] Tema claro/escuro + acento trocável via `data-*` + `localStorage['marin-prefs']`.
- [ ] Sidebar colapsa para 64px (só emojis) em ≤ 900px.
- [ ] Retrato Marin some em ≤ 820px.
- [ ] Rota `/animes/*` em `App.tsx` antes do catch-all.
- [ ] `POST /api/animes/sync-mal` com feedback de progresso (spinner) na sidebar.
- [ ] `--mist` token presente (hero overlay, badge highlight).
