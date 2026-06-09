# Handoff: Violet · Diário

> **Estes arquivos são protótipos de design em HTML** — referências visuais de alta fidelidade,
> não código de produção. A tarefa é recriar estas telas no ambiente real do projeto
> (React, Next.js, etc.) usando seus padrões e bibliotecas existentes.

---

## Visão geral

**Violet · Diário** é um app de bullet journal pessoal, temático com a personagem Violet Evergarden
(*Auto Memory Doll* — escreve cartas que traduzem o que as pessoas sentem).
É um dos agentes do hub **Makima**, ao lado de Nami (Finanças) e Frieren (Livros).

### Arquivos de referência

| Arquivo | Descrição |
|---|---|
| `Violet - Diário.html` | Entry point — carrega todos os módulos |
| `violet/styles.css` | Sistema visual completo (tokens, tema claro/escuro, layouts) |
| `violet/data.js` | Dados e agregações (entradas, coleções, heatmap, estatísticas) |
| `violet/ui.jsx` | Primitivos React: `Icon`, `RichText`, `HeatmapRow`, `AreaChart`, helpers de data |
| `violet/screens-write.jsx` | Telas: Write (home), WriteFoot, Journal, Reflect |
| `violet/screens-collections.jsx` | Telas: Collection, Tags, People |
| `violet/screens-insights.jsx` | Tela: Insights + InsightsJournal + InsightsCollection |
| `violet/app.jsx` | Shell: sidebar, roteamento, topbar, Tweaks |
| `violet/violet.png` | PNG da personagem (fundo transparente) |
| `tweaks-panel.jsx` | Componente compartilhado do painel de tweaks |

---

## Fidelidade

**Alta fidelidade (hifi).** As telas são mockups pixel-accurate com cores, tipografia,
espaçamentos e interações finais. O desenvolvedor deve recriar pixel-a-pixel usando as
bibliotecas do projeto.

---

## Arquitetura

```
Violet - Diário.html
│
├── data.js           (dados globais, sem React)
├── ui.jsx            (primitivos compartilhados → window.*)
├── tweaks-panel.jsx  (painel de tweaks → window.{TweaksPanel, useTweaks, ...})
├── screens-write.jsx (Write, WriteFoot, Journal, Reflect → window.*)
├── screens-collections.jsx (Collection, Tags, People → window.*)
├── screens-insights.jsx    (Insights → window.*)
└── app.jsx           (App root — monta tudo, ReactDOM.createRoot)
```

Cada arquivo `.jsx` exporta componentes para `window` via `Object.assign(window, {...})`.
A ordem de carregamento dos `<script>` importa.

---

## Design System

### Tipografia

| Variável | Fonte | Uso |
|---|---|---|
| `--serif` | Newsreader (Google Fonts) | Títulos, data-dia, bullets de sabedoria/sonho, h1s |
| `--sans` | DM Sans | Todo o restante (UI, corpo, nav) |
| `--mono` | DM Mono | Timestamps, contadores, labels de dados, eyebrows |

```
font-size base: 14px
line-height base: 1.5
```

### Paleta de tokens (tema claro — padrão)

```css
/* Superfícies */
--paper:    oklch(0.989 0.004 250)   /* fundo principal (marfim frio) */
--paper-2:  oklch(0.975 0.005 250)   /* sidebar */
--card:     oklch(1 0 0)             /* cards */
--card-2:   oklch(0.978 0.005 250)   /* card hover / alternado */
--mist:     oklch(0.958 0.012 250)   /* fundos sutis */

/* Tinta (texto) */
--ink:   oklch(0.255 0.020 258)      /* texto principal */
--ink-2: oklch(0.45 0.018 258)       /* texto secundário */
--ink-3: oklch(0.595 0.014 258)      /* texto terciário */
--ink-4: oklch(0.715 0.012 258)      /* placeholder / muted */
--ink-5: oklch(0.82 0.010 258)       /* linha / divisor */

/* Linhas */
--line:   oklch(0.912 0.008 255)
--line-2: oklch(0.948 0.006 255)

/* Acento principal — Safira (olhos da Violet) */
--sapphire:        oklch(0.55 0.135 250)
--sapphire-deep:   oklch(0.45 0.135 252)
--sapphire-bright: oklch(0.70 0.130 246)
--sapphire-tint:   oklch(0.55 0.135 250 / 0.10)
--sapphire-tint-2: oklch(0.55 0.135 250 / 0.16)

/* Acentos secundários por tipo de bullet */
--gold:        oklch(0.70 0.105 78)   /* sonhos (moon) */
--gold-deep:   oklch(0.585 0.098 72)
--gold-tint:   oklch(0.70 0.105 78 / 0.16)
--emerald:     oklch(0.585 0.105 165) /* menções @pessoa */
--emerald-tint:oklch(0.585 0.105 165 / 0.14)
--garnet:      oklch(0.535 0.165 18)  /* destaques (heart) */
--garnet-tint: oklch(0.535 0.165 18 / 0.13)
--amber:       oklch(0.74 0.135 70)   /* ideias (bulb) */
--violet-c:    oklch(0.585 0.140 300) /* sabedoria (gem) */
--violet-tint: oklch(0.585 0.140 300 / 0.13)

/* Heatmap (palavras escritas: nenhum → muito) */
--heat-0: var(--line-2)
--heat-1: oklch(0.86 0.052 250)
--heat-2: oklch(0.75 0.090 250)
--heat-3: oklch(0.63 0.120 250)
--heat-4: oklch(0.50 0.135 251)
```

### Tema escuro

Ativado via `data-theme="dark"` no `<html>`. Todas as variáveis são sobrescritas no seletor
`[data-theme='dark']` em `styles.css` (ver arquivo para valores completos).
Fundo principal escuro: `oklch(0.165 0.014 262)`.

### Acento intercambiável

O acento (safira por padrão) é sobrescrito via CSS custom properties no runtime pelos tweaks.
As variáveis `--accent`, `--accent-deep`, `--accent-bright`, `--accent-tint`, `--accent-tint-2`
controlam todo o acento da UI e são atualizadas via `style.setProperty` no `App`.

Paletas disponíveis:
- Safira `oklch(0.55 0.135 250)` — padrão
- Ouro `oklch(0.625 0.105 78)`
- Esmeralda `oklch(0.585 0.105 165)`
- Granada `oklch(0.535 0.165 18)`

### Border radius

```css
--r-sm: 7px
--r-md: 11px
--r-lg: 18px
```

### Sombras

```css
--shadow-sm: 0 1px 2px oklch(0.4 0.02 258 / 0.05), 0 1px 1px oklch(0.4 0.02 258 / 0.04)
--shadow-md: 0 2px 6px oklch(0.4 0.02 258 / 0.06), 0 8px 28px oklch(0.4 0.02 258 / 0.07)
--shadow-lg: 0 14px 44px oklch(0.35 0.02 258 / 0.16)
```

---

## Layout do Shell

```
┌──────────────────────────────────────────────────────────┐
│  244px sidebar  │  flex:1 main                           │
│  ─────────────  │  ─────────────────────────────────     │
│  brand (avatar  │  topbar (54px, sticky)                 │
│  + nome/role)   │  ─────────────────────────────────     │
│  [Escrever hoje]│  scroll area (flex:1, overflow-y auto) │
│  nav items      │    → tela ativa                        │
│  ─ divider ─    │                                        │
│  collections    │  footer fixo (Write): 52px             │
│  ─────────────  │                                        │
│  back + collapse│                                        │
└──────────────────────────────────────────────────────────┘
```

Grid: `grid-template-columns: 244px 1fr`, `height: 100vh`, `overflow: hidden`.

---

## Sidebar

### Cabeçalho (brand)
- Avatar circular 40×40px, borda `oklch(0.55 0.135 250 / 0.32)`, foto da Violet cortada em `object-position: 50% 6%`
- Nome: Newsreader 19px/500, letra `-0.01em`
- Role: DM Mono 9px uppercase, `letter-spacing: 0.16em`, cor `--accent-deep`

### Botão "Escrever hoje"
- Largura total, `background: var(--accent)`, texto branco, `font-weight: 600`
- Hover: `--accent-deep` + `translateY(-1px)`
- Box-shadow dupla: cor com 40% + 20% de opacidade
- Margem: `6px 16px 12px`

### Itens de navegação

Dois grupos separados por `<div class="nav-divider">`:

**Grupo principal** (sem contadores):
| ID | Label | Ícone |
|---|---|---|
| `write` | Write | pena |
| `journal` | Journal | livro aberto |
| `reflect` | Reflect | relógio / reflexão |
| `insights` | Insights | barras |

**Grupo de coleções** (com contadores à direita em DM Mono 10.5px):
| ID | Label | Ícone | Cor da ficha |
|---|---|---|---|
| `dreams` | Dreams | lua | `--gold` |
| `highlights` | Highlights | coração | `--garnet` |
| `tags` | Tags | hash | `--sapphire` |
| `people` | People | @ | `--emerald` |
| `notes` | Notes | pin | `--ink-3` |
| `wisdom` | Wisdom | gem | `--violet-c` |
| `ideas` | Ideas | lâmpada | `--amber` |

**Ficha de ícone (nav-chip):**
- Círculo 28×28px, `background: var(--ink)` (inativo) / `var(--accent)` (ativo)
- Ícone SVG 15×15px, linha 1.8px, `color: oklch(0.97 0.005 250)` (branco)
- Ativo: `box-shadow: 0 2px 7px oklch(0.45 0.135 252 / 0.4)`

### Rodapé
- Link "Voltar à Makima" com ponto vermelho (`oklch(0.66 0.145 5)`) 6px
- Botão collapse (ícone chevsL), `26×26px`, borda-radius `var(--r-sm)`

---

## Topbar

- `height: 54px`, `border-bottom: 1px solid var(--line)`
- Background translúcido `oklch(0.989 0.004 250 / 0.82)` + `backdrop-filter: blur(12px)`
- Título: Newsreader 18px/500
- Search pill: `border-radius: 999px`, `min-width: 210px`, foco com `box-shadow: 0 0 0 3px var(--accent-tint)`
- Icon buttons: 34×34px, `border: 1px solid var(--line)`

---

## Tela: Write (página inicial)

Área de escrita centralizada. `max-width: 600px`, `margin: 0 auto`, `padding: 60px 24px 40px`.

### Cabeçalho de data
```
MES DIA          ← DM Sans 15px/600, cor --accent-deep
Quarta           ← Newsreader 56px/700, letter-spacing -0.03em (--w-day)
#132 / Hoje      ← DM Sans 13.5px, #132 em 600, "Hoje" em --accent-deep/600
```

### Prompt de sonho
- Linha com ícone lua (fundo `--gold-tint`) + texto em Newsreader itálico 17px cor `--ink-4`
- Ao ter sonho registrado, texto muda para `--ink-2`

### Lista de bullets
Cada bullet = grupo `(marcador | corpo)`:

**Marcador por tipo:**
| Tipo | Glifo | Cor |
|---|---|---|
| `bullet` | ponto 6px | `--ink-4` |
| `highlight` | coração preenchido | `--garnet` |
| `dream` | lua preenchida | `--gold` |
| `idea` | lâmpada | `--amber` |
| `wisdom` | gem | `--violet-c` |
| `note` | pin | `--ink-3` |

**Highlight** recebe fundo lateral: `linear-gradient(90deg, var(--garnet-tint), transparent 70%)`,
`border-radius: var(--r-sm)`, `margin: 2px -10px`, `padding-left: 10px`.

**Texto do bullet:**
- DM Sans 15.5px, `font-weight: 300`, `line-height: 1.68`
- Sapiência: Newsreader itálico 16.5px
- Timestamp: DM Mono 10.5px, `color: --ink-4`, `letter-spacing: 0.03em`

**Menções inline:**
- `@pessoa` → `color: --emerald`, `font-weight: 500`, cursor pointer
- `#tag` → `color: --accent-deep`, `font-weight: 500`, cursor pointer

**Novo bullet (placeholder):**
- Ponto + texto Newsreader itálico 15.5px `--ink-3`
- `opacity: 0.4`, hover `opacity: 0.7`

### Chips de tipo (barra inferior do Write)
6 chips: Bullet, Destaque, Ideia, Sabedoria, Nota, Sonho.
Cada chip: `padding: 7px 13px 7px 9px`, `border-radius: 999px`,
ícone colorido + label DM Sans 12.5px.
Hover: `translateY(-1px)`, borda mais escura.

### Barra de navegação (WriteFoot)
Posição absoluta no fundo do main, `height: 52px`, `backdrop-filter: blur(14px)`.
Botões: `«` (primeira), `‹` (anterior), `Lista`, `●` (hoje), `›` (próximo), `»` (última).
Estilo: `height: 32px`, `border: 1px solid var(--line)`, `border-radius: 8px`.
Botão "hoje": `color: --accent-deep`, borda accent.

---

## Tela: Journal (arquivo)

Stream de cards por mês. `max-width: 720px`, centralizado, `padding: 36px 24px 60px`.

### Cabeçalho de mês
DM Mono uppercase `letter-spacing: 0.14em`, `color: --ink-3`, `margin: 30px 0 14px`.

### Card de entrada
```
┌────────────────────────────────────────────────┐
│  DAY  │  corpo                                 │
│  56px │  #num · "x dias atrás"                 │
│  DOW  │  Excerpt (2 linhas, -webkit-line-clamp) │
│       │  x bullets  ♥ x  🌙 sonho              │
└────────────────────────────────────────────────┘
```
- `display: flex; gap: 18px; padding: 20px 22px`
- `background: var(--card)`, `border: 1px solid var(--line)`, `border-radius: var(--r-md)`
- Hover: `box-shadow: --shadow-md`, `translateY(-2px)`, borda accent 30% opacidade
- Data: número Newsreader 30px/600 + dia da semana DM Mono 9.5px uppercase
- Excerpt: DM Sans 14px/1.62, `--ink-2`, `-webkit-line-clamp: 2`
- Footer: DM Mono 10.5px, `--ink-4`; pills de destaque (garnet) e sonho (gold)

---

## Tela: Reflect

`max-width: 700px`, centralizado, `padding: 14px 24px 60px`.

### Card de pergunta
```css
background: linear-gradient(150deg, var(--mist), var(--card) 64%);
border: 1px solid oklch(0.55 0.135 250 / 0.18);
border-radius: var(--r-lg);
padding: 34px 36px;
```
- Eyebrow: DM Mono 10px uppercase `--accent-deep`
- Pergunta: Newsreader 30px/500, `letter-spacing: -0.02em`, `line-height: 1.18`
- Assinatura: Newsreader itálico 13.5px `--ink-3`
- Botões: "Responder hoje" (accent) + "Outra pergunta" (neutro)
- "Outra pergunta" cicla pelas 4 perguntas pré-definidas via estado `pi`

### Seção "Releia-se"
Um item de cada tipo (Sabedoria → Destaque → Sonho → Ideia), selecionados via semente determinística
derivada do dia do ano (muda todo dia, mas é estável — mesmo dia = mesmos itens).

Layout de cada item: `display: flex; gap: 16px; border-bottom: 1px solid var(--line-2)`.
- Lado esquerdo: círculo 32px com ícone colorido do tipo
- Corpo: texto + meta (`Tipo · data · entrada #N`)
- Sabedoria/Sonho: Newsreader itálico

---

## Tela: Insights

`max-width: 1120px`, padding `0 36px 80px`.

### Hero (Violet em destaque)
```
grid-template-columns: 1fr 248px;
gap: 32px;
align-items: center;
min-height: 320px;
```

**Lado esquerdo (copy):**
- Eyebrow: DM Mono 10.5px uppercase `--accent-deep`
- H1 Newsreader 52px/600 + badge "Pro" (DM Sans 11px/600, fundo `--gold-tint`, cor `--gold-deep`, `border-radius: 999px`, `padding: 4px 9px`)
- Parágrafo: Newsreader itálico 17px, `--ink-2`, `max-width: 40ch`, texto de boas-vindas com dados

**Lado direito (retrato):**
- `width: 248px`, auto alinhado ao fim
- Halo: `position: absolute`, `left: 50%`, `top: 48%`, `transform: translate(-50%, -50%)`,
  `width: 128%`, `aspect-ratio: 1`, `border-radius: 50%`,
  `background: radial-gradient(circle, oklch(0.70 0.130 246 / 0.30), oklch(0.70 0.105 78 / 0.14) 46%, transparent 70%)`,
  `filter: blur(3px)`
- Imagem: `max-height: 340px`, `drop-shadow(0 20px 34px oklch(0.45 0.135 252 / 0.26))`,
  máscara gradiente `linear-gradient(to bottom, black 88%, transparent)`

### Abas dos Insights
7 abas: Diário | Sonhos | Destaques | Tags | Pessoas | Sabedoria | Ideias.
`border-bottom: 1px solid var(--line)`, aba ativa: `border-bottom: 2px solid var(--ink)`, `font-weight: 600`.
Cada aba tem ícone colorido + label.

### Aba Diário — conteúdo

**Heatmap anual** (`ins-heatcard`):
- `background: var(--card)`, `border: 1px solid var(--line)`, `border-radius: var(--r-md)`, `padding: 22px 24px`
- Grade 7 linhas × colunas por mês, células 9×9px, `border-radius: 2px`, `gap: 3px`
- Cor de cada célula: `--heat-0` (0 palavras) → `--heat-4` (≥190 palavras)
- Rodapé: chips de "dias escritos", "entradas", "maior sequência" + legenda do gradiente

**Chips de contagem** (4 chips): Destaques (garnet), Tags (sapphire), Menções (emerald), Sonhos (gold).
- `display: inline-flex; gap: 9px; padding: 9px 16px 9px 9px; border-radius: 999px`
- Ícone circular 30px + número 17px/700 + label 13px

**Linhas de stat** (5 linhas):
- Label 14px min-width 150px + valor negrito + barra de progresso (max-width 200px, 6px height, `background: var(--accent)`)

**Gráfico de palavras por mês** (AreaChart SVG):
- Caminho suave (Catmull-Rom → Bezier), gradiente de área `--accent` 22%→2%
- Linha `stroke: var(--accent)`, `strokeWidth: 2`
- Labels dos meses em DM Mono 9px

**Distribuição por hora** (12 barras, 0h–22h, pares):
- `display: flex; align-items: flex-end; height: 150px`
- Barras: `background: linear-gradient(to top, var(--accent), var(--accent-bright))`
- `border-radius: 4px 4px 0 0`, largura `flex: 1`, `max-width: 26px`
- Labels: DM Mono 9px `--ink-4`

**Grandes números** (grid 3 colunas):
- Número: Newsreader 48px/400 `--accent-deep`, DM Sans 13px label, DM Mono 10.5px sub

---

## Telas de coleção

Padrão compartilhado: `max-width: 760px`, `padding: 30px... 0 36px`.

### Cabeçalho
Ícone circular 46px (fundo tint da cor) + H1 Newsreader 40px + blurb Newsreader itálico 16px `--ink-3`.

### Grid de cards (`col-grid`)
`grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`, `gap: 16px`.

Cada card:
- `padding: 20px`, `border-radius: var(--r-md)`, `border: 1px solid var(--line)`
- Accent bar: `position: absolute; left: 0; top/bottom: 0; width: 3px; background: COR_DO_TIPO`
- Texto: DM Sans 15px / Newsreader itálico 18px (wisdom/dreams)
- Footer: data + link para entrada de origem
- Hover: `--shadow-md`, `translateY(-2px)`

### Tipos e cores das collections

| ID | Cor da accent bar | Tipografia |
|---|---|---|
| `dreams` | `--gold` | Newsreader itálico |
| `highlights` | `--garnet` | Sans |
| `ideas` | `--amber` | Sans |
| `wisdom` | `--violet-c` | Newsreader itálico |
| `notes` | `--ink-3` | Sans |

### Tags
Nuvem de tags com tamanho proporcional à frequência (`font-size: 0.92em + (count/max) * 0.55em`).
Cada tag: `padding: 8px 15px`, `border-radius: 999px`, hover `background: --accent-tint`.

### People
Grid 4 colunas (`minmax(220px, 1fr)`).
Cada card: avatar circular 42px (inicial, fundo `--emerald-tint`) + nome 14.5px/600 + meta DM Mono 10.5px.

---

## Modelo de dados

### Entrada diária (Entry)
```typescript
interface Entry {
  num: number;           // número sequencial (#132)
  date: string;          // "YYYY-MM-DD"
  dream: string | null;  // texto do sonho ou null
  bullets: Bullet[];
}
```

### Bullet
```typescript
interface Bullet {
  kind: 'bullet' | 'highlight' | 'dream' | 'idea' | 'wisdom' | 'note';
  time: string;   // "HH:MM"
  text: string;   // pode conter @pessoa e #tag inline
}
```

### Menções inline (parseadas no render)
- `@NomePessoa` → componente clicável `color: --emerald`
- `#tag-nome` → componente clicável `color: --accent-deep`

### Coleções derivadas (agregadas dos bullets)
- `DREAMS` → `ENTRIES.filter(e => e.dream)`
- `HIGHLIGHTS` → bullets onde `kind === 'highlight'`
- `IDEAS`, `WISDOM`, `NOTES` → idem por kind
- `TAGS` → todos os tokens `#X` dos bullets, com contagem
- `PEOPLE` → todos os tokens `@X` dos bullets, com contagem

### Heatmap
Array de `{ date: "YYYY-MM-DD", words: number }` para cada dia do ano.
Gerado deterministicamente com semente fixa (entradas reais sobrescrevem a estimativa).

### Estatísticas (`STATS`)
```typescript
{
  entries: 132,
  bullets: 348,
  daysWritten: number,    // dias com words > 0 no heatmap
  totalWords: number,
  perDay: number,         // média de palavras/dia escrito
  highlights: 11,
  tags: 54,
  mentions: 96,
  dreams: 38,
  highlightRate: 8,       // % de entradas com highlight
  freqPerWeek: 3.4,
  longestStreak: 14,
  currentStreak: 5,
}
```

---

## Estado e roteamento

### Estado do App
```typescript
view: string                 // ID da tela ativa (write, journal, reflect, insights, dreams, ...)
entryIdx: number             // índice da entrada ativa em ENTRIES[] (0 = hoje)
query: string                // busca (exibida em topbar quando view !== 'write')
```

### Navegação
```typescript
navigate(view: string, param?: string)
// param "#132" abre a entrada #132 na view write
// após navegar: scrollRef.current.scrollTop = 0

openEntry(num: number)
// atalho: acha o índice de num em ENTRIES e seta entryIdx + view='write'
```

### Navegação do Write (WriteFoot)
```typescript
onFootNav(action: 'prev' | 'next' | 'first' | 'latest' | 'today' | 'list')
// prev: entryIdx++  (mais antigo)
// next: entryIdx--  (mais recente)
// first: entryIdx = ENTRIES.length - 1
// latest / today: entryIdx = 0
// list: navigate('journal')
```

---

## Tweaks (painel de controles)

| Tweak | Tipo | Opções | Efeito |
|---|---|---|---|
| Tema | Radio | Claro / Escuro | `data-theme` no `<html>` |
| Acento da Violet | Color | 4 swatches | Sobrescreve `--accent-*` no `:root` |
| Modo | Radio | Normal / Amplo / Foco | Classes no `.vl-app` |
| Tipografia | Radio | Clássica / Técnica | Classe `.tipo-tecnica` no `.vl-app` |

### Modo Foco
```css
.modo-foco .vl-side { width: 0; overflow: hidden; }
.modo-foco .vl-app  { grid-template-columns: 0 1fr; }
.modo-foco .write-wrap { max-width: 680px; padding-top: 72px; }
.modo-foco .w-day { font-size: 68px; }
```

### Modo Amplo
```css
.modo-amplo .write-wrap { max-width: 720px; }
.modo-amplo .bline .b-text { font-size: 16.5px; line-height: 1.78; }
```

### Tipografia Técnica
```css
.tipo-tecnica .w-day { font-family: var(--sans); font-size: 42px; font-weight: 700; }
.tipo-tecnica .bline .b-text { font-family: var(--mono); font-size: 13.5px; line-height: 1.85; }
```

---

## Responsividade

Em viewports `≤ 900px`:
- Grid muda para `64px 1fr`
- Sidebar colapsa: esconde labels de texto, mostra só os chips de ícone
- Insights hero: coluna do retrato some, fica single-column
- Big stats: 1 coluna

---

## Assets

| Arquivo | Formato | Uso |
|---|---|---|
| `violet/violet.png` | PNG transparente | Avatar sidebar + retrato Insights |

**Fontes (Google Fonts):**
```
Newsreader: opsz 6..72, weights 400/500/600/700, normal + italic
DM Sans: opsz 9..40, weights 300/400/500/600/700
DM Mono: weights 400/500
```

---

## Integração com o hub Makima

O botão "Voltar à Makima" no rodapé da sidebar linka para `Makima Diário.html`.

No hub, a entrada da Violet na sidebar é:
```html
<div class="nav-section nav-active expanded" id="sec-violet">
  <div class="sec-trigger" onclick="toggleSec('sec-violet')">
    <div class="avatar av-journal">V</div>
    <div class="sec-info">
      <span class="sec-name">Violet</span>
      <span class="sec-role">Diário</span>
    </div>
  </div>
  <div class="sec-items">
    <a class="sub-item" href="Violet - Diário.html">Escrever</a>
    <a class="sub-item" href="Violet - Diário.html">Arquivo</a>
    <a class="sub-item" href="Violet - Diário.html">Reflexão</a>
    <a class="sub-item" href="Violet - Diário.html">Insights</a>
  </div>
</div>
```

Avatar: `background: oklch(0.70 0.088 253 / 0.11)`, `color: oklch(0.70 0.088 253)`,
`border: 1px solid oklch(0.70 0.088 253 / 0.42)`.

---

## Ícones

Todos os ícones são SVG inline, traço 1.8px, `strokeLinecap: round`, `strokeLinejoin: round`.
Exceto `heart`, `moon`, `gem` que são preenchidos (`fill: currentColor`).

Tamanhos usados: 15px (nav), 16px (topbar), 24px (coleções).

Paths principais:
```js
write:    'M3 21c1.5-3 4-9 7.5-12.5C13.5 5.5 17 3.5 20.5 3.5c0 3.5-1.8 7-4.8 10C12 17 6 19.5 3 21z'
journal:  'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v18H6.5A1.5 1.5 0 0 1 5 19.5z M9 3v18 M9 8h7 M9 12h7'
reflect:  'M3.5 9A9 9 0 1 1 3 13M3 4v5h5M12 8v4l3 2'
insights: 'M5 20V11M12 20V4M19 20v-6'
moon:     'M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z'
heart:    'M12 20S4 15 4 8.8A4.2 4.2 0 0 1 12 6a4.2 4.2 0 0 1 8 2.8C20 15 12 20 12 20z'
gem:      'M6 3h12l3 6-9 12L3 9zM3 9h18M9 3 7.5 9 12 21M15 3l1.5 6L12 21'
bulb:     'M9 18h6M10 21h4M8.5 14a6 6 0 1 1 7 0c-.7.6-1 1.2-1 2.2H9.5c0-1-.3-1.6-1-2.2z'
hash:     'M9 3 7 21M17 3l-2 18M4 8.5h16M3 15.5h16'
at:       'M16 12a4 4 0 1 0-1.2 2.9M16 8v5a2.5 2.5 0 0 0 5 0v-1a9 9 0 1 0-3 6.7'
pin:      'M9.5 3h5l-1 6 3.5 3v2H7v-2l3.5-3zM12 14v7'
```

---

## Notas para o desenvolvedor

1. **Dados fictícios** — todo o conteúdo das entradas é de exemplo. Em produção substituir por dados reais do usuário.

2. **Persistência** — o protótipo usa arrays em memória. Implementar com banco real (Supabase, Firebase, etc.).

3. **Tweaks** — o painel usa `localStorage` para persistir preferências. Em produção salvar no perfil do usuário.

4. **Heatmap** — a lógica de geração em `data.js` (`_buildHeatmap()`) usa pseudorandomização para demonstração. Em produção derivar dos dados reais de timestamps das entradas.

5. **Seleção do "Releia-se"** — a semente baseada em "dia do ano" é uma heurística. Em produção pode-se usar um algoritmo de spaced repetition real.

6. **`oklch()`** — todos os tokens de cor usam OKLCH. Verificar suporte no target (todos os browsers modernos suportam; Safari ≥ 15.4, Chrome ≥ 111, Firefox ≥ 113).

7. **`text-wrap: pretty`** — CSS moderno para justificação de parágrafo. Fallback gracioso em browsers antigos (ignora e usa wrap normal).
