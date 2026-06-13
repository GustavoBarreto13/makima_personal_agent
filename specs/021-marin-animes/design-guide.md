# Guia de Design — Animes (Marin Kitagawa) · fatia 021

Este documento guia o Claude Design (ou qualquer implementador de front-end) na criação do Shell
React da seção **Animes**. O back-end e o agente Telegram já existem (fatia 021); este guia é para
a fatia futura que implementa a UI. Siga este documento como fonte de verdade visual.

> **Stack**: React 19 + TypeScript + Vite 6. Padrão Shell do projeto: cada domínio em
> `webapp/frontend/src/pages/<domain>/`. Chamadas de API sempre via `marinApi.ts` sobre `lib/api.ts`
> (nunca `fetch` direto). Tokens CSS escopados em `.marin-shell`. Rotas em `App.tsx`:
> `<Route path="/animes/*" element={<MarinShell />} />` antes do catch-all `/*`.

---

## 1. Conceito visual — identidade da Marin

**Referência**: Marin Kitagawa (*My Dress-Up Darling / Sua Conduta Foi Adorável*) — gyaru
apaixonada por anime, mangá e cosplay. Ela é explosiva, entusiasta, fashionista. A UI deve
refletir isso: **kawaii e vibrante, mas organizada**.

**Princípios**:
- **Não é cinema**: diferente da Akane (escuro noir), a Marin é **quarto de otaku iluminado por
  luzes de néon** — roxo/índigo profundo com detalhes rosa-magenta e cyan brilhantes.
- **Episódio em foco**: o progresso importa (X/24 eps), o próximo episódio deve ser imediato.
- **Estrelas MAL (0–10)**: escala de 10 estrelas com meia estrela, diferente da Akane (0.5–5.0).
- **Energia kawaii**: cantos arredondados generosos, sparkles ✨ nos detalhes, tipografia display
  de impacto para números grandes, animações suaves (não pesadas).
- **Pôster de anime**: proporção tipicamente 2:3 (portrait), diferente do cinema (2.39:1).
- **Status visual**: chips coloridos por status (assistindo = cyan, completo = verde, etc.).

**Analogias visuais**: entre um app de anime como AniList e a estética de um quarto de gyaru
com poster wall, luzes LED roxas e adesivos kawaii. Não é um Letterboxd; é uma **revista de moda
otaku digital**.

---

## 2. Tema e tokens OKLCH — escopo `.marin-shell`

Todos os tokens declarados dentro de `.marin-shell { }`. **Dark mode é o padrão** (quarto de
otaku); light mode sobrescreve em `[data-theme='light']`. O acento é trocável via `[data-accent]`.

### 2.1 Superfícies, tinta, linhas (tema escuro base)

```css
.marin-shell {
  /* --- Fundo --- */
  --paper:      oklch(0.14 0.018 300);   /* fundo do app: escuro levemente roxo/índigo */
  --paper-2:    oklch(0.17 0.020 298);   /* sidebar, header */
  --card:       oklch(0.20 0.022 302);   /* cards de anime, modais */
  --card-2:     oklch(0.23 0.018 298);   /* cards secundários, hover */

  /* --- Tinta --- */
  --ink:        oklch(0.96 0.005 300);   /* texto primário */
  --ink-2:      oklch(0.75 0.010 300);   /* subtítulo, metadados */
  --ink-3:      oklch(0.55 0.012 298);   /* texto muted, placeholder */
  --ink-4:      oklch(0.40 0.014 296);   /* texto muito muted */

  /* --- Linhas --- */
  --line:       oklch(0.30 0.022 300);   /* bordas */
  --line-2:     oklch(0.25 0.018 298);   /* divisórias sutis */

  /* --- Sombras --- */
  --shadow-sm:  0 1px 3px oklch(0 0 0 / 0.4);
  --shadow-md:  0 4px 12px oklch(0 0 0 / 0.5);
  --shadow-lg:  0 8px 24px oklch(0 0 0 / 0.6);
  --shadow-poster: 0 6px 20px oklch(0 0 0 / 0.7);  /* sombra dramática para pôsteres */
}
```

**Tema claro** `[data-theme='light']` — "quarto de dia com luz natural":
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

### 2.2 Acento trocável — default = rosa-magenta

A **base** é rosa-magenta (identidade da Marin). Alternativos sobrescrevem via `[data-accent]`.

```css
/* Base: rosa-magenta (padrão de fábrica) */
.marin-shell {
  --marin:       oklch(0.68 0.25 350);   /* rosa-magenta principal */
  --marin-deep:  oklch(0.55 0.22 350);   /* versão mais profunda */
  --marin-bright:oklch(0.78 0.22 350);   /* versão mais clara (hover, hover text) */
  --marin-tint:  oklch(0.20 0.040 350);  /* fundo tintado (badge, highlight) */
  --marin-tint-2:oklch(0.17 0.030 350); /* tint mais suave */
}

/* Alternativo: Sakura (rosa suave — modo romântico) */
.marin-shell[data-accent='sakura'] {
  --marin:       oklch(0.78 0.16 355);
  --marin-deep:  oklch(0.62 0.14 355);
  --marin-bright:oklch(0.86 0.12 355);
  --marin-tint:  oklch(0.20 0.025 355);
  --marin-tint-2:oklch(0.17 0.018 355);
}

/* Alternativo: Neon (cyan brilhante — modo hacker/cyberpunk) */
.marin-shell[data-accent='neon'] {
  --marin:       oklch(0.72 0.16 210);
  --marin-deep:  oklch(0.58 0.14 210);
  --marin-bright:oklch(0.82 0.14 210);
  --marin-tint:  oklch(0.20 0.035 210);
  --marin-tint-2:oklch(0.17 0.025 210);
}

/* Alternativo: Gold (dourado — modo award season) */
.marin-shell[data-accent='gold'] {
  --marin:       oklch(0.78 0.16 86);
  --marin-deep:  oklch(0.64 0.14 86);
  --marin-bright:oklch(0.88 0.13 86);
  --marin-tint:  oklch(0.21 0.030 86);
  --marin-tint-2:oklch(0.18 0.022 86);
}
```

**Acento secundário** (cyan — contraste e destaque, fixo em todos os temas):
```css
.marin-shell {
  --cyan:       oklch(0.72 0.16 210);   /* highlight, próximo ep, "novo" */
  --cyan-tint:  oklch(0.20 0.030 210);
}
```

### 2.3 Estrelas MAL (0–10), corações e heatmap de sessões

```css
.marin-shell {
  /* Estrelas MAL — escala 0–10, meia estrela */
  --star:       oklch(0.85 0.14 86);    /* estrela preenchida (dourada) */
  --star-empty: oklch(0.35 0.020 296);  /* estrela vazia */

  /* Coração — "curtir" */
  --heart:      oklch(0.68 0.22 12);    /* vermelho-rosa */

  /* Heatmap de sessões (cal.heatmap) */
  --heat-0:     var(--line-2);           /* 0 sessões */
  --heat-1:     oklch(0.40 0.12 350);   /* 1 sessão */
  --heat-2:     oklch(0.52 0.18 350);   /* 2 sessões */
  --heat-3:     oklch(0.62 0.22 350);   /* 3 sessões */
  --heat-4:     oklch(0.72 0.25 350);   /* 4+ sessões */
}
```

**Chips de status** (cores por estado):
```css
.marin-shell {
  --status-assistindo:     oklch(0.72 0.16 210);   /* cyan — em progresso */
  --status-completo:       oklch(0.70 0.18 145);   /* verde — concluído */
  --status-quero_assistir: oklch(0.68 0.20 296);   /* roxo-lavanda — fila */
  --status-pausado:        oklch(0.72 0.15 66);    /* âmbar — em espera */
  --status-abandonado:     oklch(0.55 0.12 20);    /* vermelho muted — dropped */
}
```

### 2.4 Tipografia

| Função | Família (`--var`) | Uso |
|--------|-------------------|-----|
| **Display** | `DM Serif Display` (`--display`) | Títulos grandes, pôsteres, números de stat |
| **Sans** | `DM Sans` (`--sans`) | UI, botões, corpo, labels |
| **Mono** | `DM Mono` (`--mono`) | Episódio "Ep 12 / 24", datas, contagens |
| **Decorativo** | *(emoji nativo)* | Sparkles ✨, estrelas ⭐, corações 💖 nos detalhes |

> Nota: ao contrário da Akane (que usa Newsreader para reviews cinematográficas), a Marin não
> tem uma fonte serif pesada — reviews e notas usam DM Sans regular. O caráter kawaii vem das
> cores e dos emojis, não da tipografia clássica.

### 2.5 Raios, densidade e proporção do pôster

```css
.marin-shell {
  --r-sm:  8px;    /* chips de status, badges */
  --r-md:  14px;   /* cards menores, inputs */
  --r-lg:  22px;   /* cards grandes, modais, pôster */
  --r-xl:  32px;   /* telas de detalhe, hero */

  /* Pôster de anime: proporção 2:3 (portrait) */
  --poster-w:     140px;   /* largura padrão do card de pôster */
  --poster-ratio: 2/3;     /* CSS aspect-ratio */

  /* Density tweaks via [data-density] */
  /* large:   --poster-w: 180px  */
  /* medium:  --poster-w: 140px (padrão) */
  /* compact: --poster-w: 100px */
}
```

---

## 3. Layout do Shell (`.marin-shell`)

```
┌──────────────────────────────────────────────────────────┐
│ SIDEBAR (240px, sticky)       │ MAIN CONTENT (scroll)     │
│                               │                           │
│  ✨ Marin                     │ TOPBAR (48px, sticky)     │
│  ──────────────────           │  título da tela + busca   │
│  📺 Início                    ├───────────────────────────┤
│  🎌 Catálogo                  │                           │
│  📖 Diário                    │  CONTEÚDO DA TELA         │
│  ⭐ Quero Assistir            │                           │
│  📅 Lançamentos               │                           │
│  📊 Estatísticas              │                           │
│  ──────────────────           │                           │
│  ⚙ Tweaks                    │                           │
│                               │                           │
│  [SYNC MAL]  🔄               │                           │
└──────────────────────────────────────────────────────────┘
```

**Sidebar**:
- Fundo `--paper-2`, largura fixa 240px no desktop.
- Marca "✨ Marin" no topo com ícone de anime/estrela.
- Nav items com ícone emoji + label texto; item ativo com `--marin-tint` e `--marin` no ícone.
- Botão "🔄 Sync MAL" na base da sidebar (dispara `POST /api/animes/sync-mal`).
- Collapse em mobile (hamburger menu, drawer lateral).

**Topbar**:
- Sticky, fundo `--paper-2`, 48px de altura.
- Título da tela atual à esquerda.
- Busca rápida à direita (abre modal de busca/adição de anime).
- Ícone de loading durante sync.

---

## 4. Telas

### 4.1 Início (Home)

**Propósito**: panorama rápido do que está sendo assistido e o que sai em breve.

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│ HERO: último anime logado                           │
│  banner_url como fundo (blur + gradient overlay)    │
│  título, últimos eps assistidos, nota               │
├─────────────────────────────────────────────────────┤
│ STATS CARDS (3 cards horizontais)                   │
│  [📺 X animes]  [🎌 Y eps/semana]  [⭐ Z média]    │
├─────────────────────────────────────────────────────┤
│ ASSISTINDO AGORA (scroll horizontal de pôsteres)    │
│  cada card: pôster + título + "Ep X/Y"              │
├─────────────────────────────────────────────────────┤
│ PRÓXIMOS LANÇAMENTOS (3-4 cards com data)           │
│  anime + ep nº + data + thumbnail                   │
├─────────────────────────────────────────────────────┤
│ ATIVIDADE RECENTE (últimas 5 sessões)               │
│  data | anime | Ep X–Y | nota                       │
└─────────────────────────────────────────────────────┘
```

**Contratos de dados**:
- Hero: `GET /api/animes/stats` → `last_session` (ou `GET /api/animes/{id}` do último logado)
- Stats cards: `GET /api/animes/stats?year=atual`
- Assistindo agora: `GET /api/animes?status=assistindo`
- Próximos lançamentos: `GET /api/animes/schedule?days=14`
- Atividade recente: `GET /api/animes/logs?limit=5` (global)

---

### 4.2 Catálogo

**Propósito**: acervo completo, filtrável por status, gênero, temporada.

**Layout**: grid de pôsteres (responsive, `auto-fill minmax(140px, 1fr)`).

**Chips de filtro** (topo, scroll horizontal):
`Todos | Assistindo | Completo | Quero Assistir | Pausado | Abandonado`

**Cada card de pôster**:
```
┌──────────┐
│          │  ← poster_url (2:3) ou fallback com gradiente + título
│  PÔSTER  │
│          │
│ [status] │  ← chip colorido no canto inferior
└──────────┘
título (2 linhas max)
⭐ 8.5  •  Ep 12/24
```

**Busca/adição**: clique no "+" abre modal de busca por nome → resultado do Jikan → confirma →
`POST /api/animes` (cria anime com metadados).

**Sort**: `Adicionado | Atualizado | Nota | Título | Progresso`

---

### 4.3 Diário

**Propósito**: registro cronológico de todas as sessões (equivalente ao diário do Letterboxd,
mas para episódios).

**Layout**: lista cronológica decrescente, agrupada por mês.

**Cada entrada de diário**:
```
┌────────┬───────────────────────────────────────────┐
│ PÔSTER │  Dungeon Meshi                            │
│ (mini) │  10 de junho · Ep 7–9 (3 eps)            │
│        │  ⭐ 9.5  "Episódio do Marcille foi top"   │
└────────┴───────────────────────────────────────────┘
```

**Separadores**: `─── Junho 2026 ───` entre meses.

**Log rápido**: FAB (+) no canto inferior direito abre o modal de log de episódio.

---

### 4.4 Detalhe do Anime

**Propósito**: tudo sobre um anime — metadados, progresso, próximo ep, histórico de sessões.

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│ BANNER (banner_url, 360px alt, blur lateral)         │
│  pôster flutuante à esquerda                        │
│  título (DM Serif Display, grande)                  │
│  título EN/JP | studio | season | media_type        │
│  ⭐ 9.0   [chip status]   Ep 12/24                  │
│  [Logar Episódio] [Atualizar Status] [Editar Nota]  │
├─────────────────────────────────────────────────────┤
│ BARRA DE PROGRESSO                                  │
│  ████████████░░░░░░░░  12 / 24 episódios            │
│  Próximo: Ep 13 "Dumplings" · 04 abr 2024           │
├──────────────────────┬──────────────────────────────┤
│ SINOPSE              │ GÊNEROS / TAGS               │
│ (colapsável)         │ [Fantasy] [Comedy] [#favorito]│
├──────────────────────┴──────────────────────────────┤
│ EPISÓDIOS (lista paginada, 12 por vez)              │
│  Ep 1 · "A Corpse That Won't Rot" · 04 jan 2024 ✓  │
│  Ep 2 · "Tart"                    · 11 jan 2024 ✓  │
│  ...                                               │
│  Ep 13 · "Dumplings"              · 04 abr 2024    │
│  [Carregar mais]                                   │
├─────────────────────────────────────────────────────┤
│ HISTÓRICO DE SESSÕES                               │
│  10 jun 2026 · Ep 10–12 · ⭐ 9.5 · "Arco do kraken"│
│  05 jun 2026 · Ep 7–9  · ⭐ 9.0                    │
└─────────────────────────────────────────────────────┘
```

**Episódio marcado como assistido**: ícone ✓ verde, título em `--ink-2` (mais muted).
**Próximo episódio não assistido**: destaque com `--cyan` e seta "▶ Assistir agora".

---

### 4.5 Quero Assistir (Watchlist)

**Propósito**: fila de animes a assistir, ordenável.

**Layout**: igual ao Catálogo mas filtrado por `status='quero_assistir'`. Card levemente diferente:
sem barra de progresso (0 eps), destaque no gênero/temporada.

**Ação rápida por card**: "➕ Começar a assistir" muda status para `assistindo` e abre modal de log.

---

### 4.6 Calendário de Lançamentos

**Propósito**: quais episódios dos animes "assistindo" saem nos próximos dias.

**Layout**: timeline por dia, próximos 14 dias.

```
── Hoje, 13 jun ────────────────────────────────
  📺 Frieren · Ep 28 · "Retorno ao Passado"
     [thumbnail]  Às 23:00 JST (15:00 BRT)

── Amanhã, 14 jun ──────────────────────────────
  📺 Dungeon Meshi · Ep 13 · "Dumplings"
     [thumbnail]  Às 23:00 JST
```

**Dados**: `GET /api/animes/schedule?days=14`. Episódios com `aired` no futuro.
Mostrar thumbnail quando disponível. Horário JST convertido para horário do usuário (BRT = JST-12h).

---

### 4.7 Estatísticas

**Propósito**: visão anual do progresso de anime.

**Layout**:
```
┌──────────────────────────────────────────────────────┐
│  2026   [◀ 2025]                                     │
├──────────────────────────────────────────────────────┤
│  12 animes   ·   156 eps   ·   65h   ·   ⭐ 8.3     │
├────────────────────────┬─────────────────────────────┤
│  POR STATUS            │  TOP GÊNEROS                │
│  Assistindo    4       │  Fantasy         8          │
│  Completo      7       │  Action          5          │
│  Watchlist    10       │  Slice of Life   4          │
│  Pausado       1       │                             │
├────────────────────────┼─────────────────────────────┤
│  EPISÓDIOS POR MÊS     │  TOP ESTÚDIOS               │
│  [gráfico de barras]   │  TRIGGER         3          │
│  jan feb mar ...       │  MAPPA           2          │
│                        │  ufotable        1          │
├────────────────────────┴─────────────────────────────┤
│  HEATMAP DE SESSÕES (ano inteiro)                    │
│  [grid de quadradinhos, 52 semanas × 7 dias]         │
└──────────────────────────────────────────────────────┘
```

**Dados**: `GET /api/animes/stats?year=2026`.

---

## 5. Componentes

### 5.1 Card de Pôster (`PosterCard`)

```tsx
interface PosterCardProps {
  anime: AnimeSummary;  // id, title, poster_url, status, score, episodes_watched, episodes_total
  size?: 'compact' | 'medium' | 'large';
  onClick?: () => void;
}
```

- Proporção 2:3 (`aspect-ratio: 2/3`), `border-radius: var(--r-lg)`, `overflow: hidden`.
- `poster_url` real → `<img>`. Sem pôster → fallback com gradiente `--marin-tint` para `--paper`
  + título em DM Serif Display centralizado (pôster tipográfico simples).
- Hover: leve scale-up (1.03) + sombra `--shadow-poster`. Transição 200ms ease.
- Chip de status no canto inferior (`--r-sm`, fundo translúcido com `--status-{status}`).
- Clique navega para `AnimeDetail`.

### 5.2 Barra de Progresso de Episódios (`EpisodeProgress`)

```tsx
interface EpisodeProgressProps {
  watched: number;
  total: number | null;  // null = episódios indefinidos (em exibição)
  nextEpisode?: { number: number; title?: string; aired?: string };
}
```

- Barra horizontal, altura 6px, `--marin` para preenchido, `--line` para vazio.
- Texto: `"12 / 24 episódios"` (bold 12px, `--ink-2`). Se `total=null`: `"12 / ? episódios"`.
- Abaixo: `Próximo: Ep 13 "Dumplings" · 04 abr` em `--ink-3`, `--mono`.
- Quando `watched >= total`: `"Completo ✓"` em verde (`--status-completo`), sem barra.

### 5.3 Chip de Status (`StatusChip`)

```tsx
interface StatusChipProps {
  status: 'assistindo' | 'completo' | 'quero_assistir' | 'pausado' | 'abandonado';
  size?: 'sm' | 'md';
}
```

- Fundo: `--status-{status}` com 15% opacidade; cor do texto: `--status-{status}`.
- Texto: `'assistindo'` → "Assistindo", etc. (capitalizado em PT-BR).
- `border-radius: var(--r-sm)`, padding `2px 8px`, `font-size: 11px`, `font-weight: 600`.

### 5.4 Estrelas MAL (`StarRating`)

```tsx
interface StarRatingProps {
  score: number | null;     // 0.0–10.0, meia estrela
  onChange?: (score: number) => void;  // se undefined: read-only
  size?: 'sm' | 'md' | 'lg';
}
```

- 10 estrelas (escala MAL), com meia estrela via SVG clipPath ou `::after`.
- Cor preenchida: `--star`. Cor vazia: `--star-empty`.
- Modo interativo: hover anima preenchimento; clique chama `onChange`.
- Modo read-only: opacidade 0.9, cursor default.
- Ao lado do componente, o número: `"9.0"` em `--mono`, `--ink-2`.

### 5.5 Linha de Episódio (`EpisodeLine`)

```tsx
interface EpisodeLineProps {
  episode: Episode;  // number, title, aired, thumbnail_url, airing_status, watched
}
```

- Layout: `[ícone watched/agendado] [thumbnail 80×45px] [Ep N · título · data]`
- Thumbnail ausente: retângulo `--card-2` com ícone de câmera.
- Episódio assistido: ícone ✓ verde, texto `--ink-3`.
- Episódio agendado: ícone 📅 cyan, data com `--cyan`.
- Clique: abre modal de log pré-preenchido com o número do episódio.

### 5.6 Modal de Log (`LogWatchModal`)

```tsx
interface LogWatchModalProps {
  animeId: string;
  animeTitle: string;
  defaultEpStart?: number;
  onClose: () => void;
  onSuccess: (log: WatchLog) => void;
}
```

**Campos**:
- Episódio inicial (number input, mínimo 1)
- Episódio final (number input, ≥ ep_start)
- Data assistida (date picker, default hoje)
- Nota (StarRating interativo, 0–10)
- Notas livres (textarea, placeholder "O que você achou? ✨")

**Ação**: `POST /api/animes/{id}/log` → fecha modal → toast "Logado! 🎀".

---

## 6. Modais e interações

### 6.1 Modal de Busca/Adição de Anime

**Gatilho**: ícone "+" na topbar ou botão "Adicionar anime" na Watchlist.

**Fluxo**:
1. Input de busca → debounce 300ms → `GET /api/animes/search?q={query}` (Jikan)
2. Lista de resultados: `[pôster 40×56px] [título EN + tipo + ano]`
3. Clique em resultado → `POST /api/animes` (body: `{ mal_id }`) → feedback toast

**Toast de sucesso**: `"Dungeon Meshi adicionado! ✨ Status: Quero assistir"`.
**Anime já no catálogo**: mostrar chip "Já na lista" no resultado, clique navega ao detalhe.

### 6.2 Modal de Sync MAL

**Gatilho**: botão "🔄 Sync MAL" na sidebar.

**Estados**:
- Idle: botão normal
- Syncing: spinner + "Sincronizando com o MAL..." (não bloqueia a UI)
- Sucesso: toast `"Sync concluído ✨ · 3 criados · 7 atualizados"`
- Erro (sem credenciais): `"Credenciais MAL não configuradas. Configure MAL_CLIENT_ID."` (sem modal, só toast)

---

## 7. Tweaks (painel de preferências)

Painel lateral (ativado por ⚙ na sidebar). Preferências client-only (localStorage), sem endpoint.

| Preferência | Opções | Default |
|-------------|--------|---------|
| Tema | Escuro / Claro | Escuro |
| Cor de acento | Rosa-Magenta / Sakura / Neon / Gold | Rosa-Magenta |
| Densidade do catálogo | Grande / Médio / Compacto | Médio |
| Ordenação padrão | Adicionado / Atualizado / Nota / Título | Atualizado |

**Implementação**: componente `MarinTweaks.tsx`, lê/grava em `localStorage` sob a chave
`marin-prefs`. Ao montar, aplica `data-accent`, `data-theme`, `data-density` no elemento raiz
`.marin-shell`.

---

## 8. Contrato de dados por tela

| Tela | Endpoint(s) |
|------|-------------|
| Início | `GET /api/animes?status=assistindo` + `GET /api/animes/stats` + `GET /api/animes/schedule?days=14` + `GET /api/animes/logs?limit=5` |
| Catálogo | `GET /api/animes` (com params: status, sort, genre) |
| Diário | `GET /api/animes/logs?limit=50` (global) |
| Detalhe do Anime | `GET /api/animes/{id}` (+ episodes + logs) |
| Quero Assistir | `GET /api/animes?status=quero_assistir` |
| Calendário | `GET /api/animes/schedule?days=14` |
| Estatísticas | `GET /api/animes/stats?year={ano}` |
| Logar episódio | `POST /api/animes/{id}/log` |
| Buscar anime | `GET /api/animes/search?q={query}` |
| Adicionar anime | `POST /api/animes` |
| Sync MAL | `POST /api/animes/sync-mal` |

Para shapes completos de request/response, ver `contracts/api-anime.md`.

---

## 9. Regras do projeto (não violar)

1. **Nunca `fetch` direto no componente** — sempre via `marinApi.ts` (sobre `lib/api.ts`).
2. **CSS escopado** em `.marin-shell` — nenhum token vaza para outros shells.
3. **Rota antes do catch-all** em `App.tsx`:
   ```tsx
   <Route path="/animes/*" element={<MarinShell />} />
   // ... depois o /* catch-all
   ```
4. **Sem Redux/Zustand** — estado local com `useState`/`useReducer` + SWR ou React Query para cache.
5. **Sem lógica de domínio no frontend** — toda regra (fuzzy match, validação, sync) fica no backend.
6. **Auth**: toda chamada passa pelo cookie de sessão existente (mesmo `require_user` dos outros shells).
7. **HTML, não markdown** — respostas do Telegram são HTML; a UI React é JSX (nunca dangerouslySetInnerHTML com markdown).
8. **Proporção 2:3 para pôsteres de anime** — diferente dos filmes (2:3 também, mas atentar para imagens do MAL que podem ser 225×318px).
9. **Escala de nota 0–10** (MAL) — não confundir com a Akane (0.5–5.0 Letterboxd). 10 estrelas, meia estrela.
10. **Calendar Hub fora** — não implementar integração com `calendar_hub.py` nem lançamentos de episódios no Calendar aqui.

---

## 10. Entregáveis esperados do porte

Quando o Claude Design (ou implementador) executar este guia, deve entregar:

```
webapp/frontend/src/pages/marin/
├── MarinShell.tsx          # shell root com sidebar + topbar + router interno
├── marinApi.ts             # client: todos os endpoints de /api/animes/*
├── types.ts                # Anime, WatchLog, Episode, Stats, Schedule, SyncResult
├── marin.css               # tokens OKLCH em .marin-shell + overrides de tema/acento
├── screens/
│   ├── HomeScreen.tsx      # tela Início
│   ├── CatalogScreen.tsx   # catálogo com grid de pôsteres
│   ├── DiaryScreen.tsx     # diário cronológico
│   ├── WatchlistScreen.tsx # quero assistir
│   ├── ScheduleScreen.tsx  # calendário de lançamentos
│   └── StatsScreen.tsx     # estatísticas anuais
├── components/
│   ├── PosterCard.tsx
│   ├── EpisodeProgress.tsx
│   ├── StatusChip.tsx
│   ├── StarRating.tsx
│   ├── EpisodeLine.tsx
│   └── AnimeDetail.tsx     # tela de detalhe do anime
├── modals/
│   ├── LogWatchModal.tsx
│   ├── AddAnimeModal.tsx   # busca + adição
│   └── MarinTweaks.tsx     # painel de preferências
└── ui/
    └── Toast.tsx           # toasts de confirmação (reusar do projeto se existir)
```

**Backend** (quando implementado junto):
```
webapp/backend/routers/animes.py    # router FastAPI, fachada fina sobre agents/marin/tools.py
```
Registrar em `webapp/backend/main.py`:
```python
app.include_router(animes_router.router, prefix="/api/animes", tags=["animes"])
```

**Checklist de entrega**:
- [ ] Tokens OKLCH em `.marin-shell`, sem vazamento para outros shells.
- [ ] Todas as 7 telas renderizando (mesmo com dados mockados).
- [ ] `marinApi.ts` com todos os 11 endpoints tipados.
- [ ] `types.ts` cobrindo `Anime`, `WatchLog`, `Episode`, `Stats`, `Schedule`.
- [ ] PosterCard com fallback (gradiente + título) quando `poster_url=null`.
- [ ] StarRating: 10 estrelas, meia estrela, escala 0–10.
- [ ] StatusChip com todas as 5 cores de status.
- [ ] Tema claro/escuro + acento trocável funcionando via `data-*` e localStorage.
- [ ] Rota `/animes/*` em `App.tsx` antes do catch-all.
- [ ] `POST /api/animes/sync-mal` com feedback de progresso na sidebar.
