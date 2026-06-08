# Handoff: Frieren — Livros

> **Seção de biblioteca de leitura do app Makima.**  
> Protótipo hi-fi em HTML/CSS/React. Os arquivos deste pacote são **referências de design** — o objetivo é recriar este comportamento e visual no ambiente real do projeto (codebase existente com seus frameworks, bibliotecas e design system). Não copiar o HTML diretamente para produção.

---

## 1. Contexto do produto

O **Makima** é um app pessoal de gestão de vida onde cada seção é "curada" por uma personagem de anime. A **Frieren** é a curadoria da biblioteca de leitura.

```
App Makima
├── Makima (dashboard)
├── Nami → Finanças
├── Frieren → Livros  ← este handoff
├── Kaguya → Tarefas (fase 2)
└── Kurisu → Conhecimento (fase 3)
```

O shell do app (sidebar + topbar + layout em grid) já existe na `Makima Diário.html`. A seção Frieren herda a sidebar de navegação global com link de volta para o app principal.

---

## 2. Fidelidade

**Hi-fi.** Recriar pixel a pixel: cores exatas, tipografia, espaçamento, sombras, estados de hover/foco, animações. O protótipo é a referência definitiva de visual e comportamento.

---

## 3. Design tokens

### Cores (tema claro — padrão)

| Token | Valor | Uso |
|---|---|---|
| `--paper` | `oklch(0.985 0.004 95)` | Fundo do app |
| `--paper-2` | `oklch(0.972 0.006 215)` | Fundo sidebar / superfícies alt |
| `--card` | `oklch(1 0 0)` | Cards, modais |
| `--card-2` | `oklch(0.978 0.004 215)` | Cards secundários |
| `--mist` | `oklch(0.955 0.010 205)` | Hero bg |
| `--ink` | `oklch(0.27 0.014 240)` | Texto primário |
| `--ink-2` | `oklch(0.46 0.012 240)` | Texto secundário |
| `--ink-3` | `oklch(0.605 0.010 240)` | Texto terciário |
| `--ink-4` | `oklch(0.72 0.008 240)` | Texto muted / placeholders |
| `--line` | `oklch(0.905 0.006 220)` | Bordas |
| `--line-2` | `oklch(0.945 0.005 220)` | Divisórias suaves |
| `--teal` | `oklch(0.565 0.082 196)` | Acento primário (olhos da Frieren) |
| `--teal-deep` | `oklch(0.46 0.078 198)` | Teal escuro (texto de acento) |
| `--teal-bright` | `oklch(0.72 0.095 192)` | Teal brilhante (gradiente barra de progresso) |
| `--teal-tint` | `oklch(0.565 0.082 196 / 0.10)` | Fundo teal suave |
| `--teal-tint-2` | `oklch(0.565 0.082 196 / 0.16)` | Seleção de texto |
| `--gold` | `oklch(0.66 0.098 80)` | Ouro (manto da Frieren) — ratings/estrelas |
| `--gold-deep` | `oklch(0.56 0.092 72)` | Ouro escuro |
| `--gold-tint` | `oklch(0.66 0.098 80 / 0.14)` | Fundo gold suave |
| `--garnet` | `oklch(0.52 0.15 18)` | Grana (gema vermelha) — usar com parcimônia |
| `--silver` | `oklch(0.80 0.012 230)` | Prata (cabelo da Frieren) |

### Cores — tema escuro (toggle nos Tweaks)

| Token | Valor |
|---|---|
| `--paper` | `oklch(0.165 0.012 250)` |
| `--paper-2` | `oklch(0.198 0.014 250)` |
| `--card` | `oklch(0.218 0.014 250)` |
| `--card-2` | `oklch(0.192 0.012 250)` |
| `--mist` | `oklch(0.26 0.024 212)` |
| `--ink` | `oklch(0.93 0.010 230)` |
| `--ink-2` | `oklch(0.74 0.012 230)` |
| `--ink-3` | `oklch(0.585 0.012 235)` |
| `--ink-4` | `oklch(0.46 0.012 240)` |
| `--line` | `oklch(0.315 0.012 250)` |
| `--line-2` | `oklch(0.262 0.012 250)` |
| `--teal` | `oklch(0.64 0.094 193)` |
| `--teal-deep` | `oklch(0.80 0.088 190)` |
| `--gold` | `oklch(0.75 0.10 82)` |

A troca de tema deve ser feita via atributo `data-theme="dark"` no elemento raiz (`<html>`). Os tokens são sobrescritos como CSS custom properties.

### Escala de heatmap

| Nível | Claro | Escuro |
|---|---|---|
| 0 (sem leitura) | `var(--line-2)` | `oklch(0.255 0.012 250)` |
| 1 (< 18 págs) | `oklch(0.86 0.045 196)` | `oklch(0.40 0.058 196)` |
| 2 (< 38 págs) | `oklch(0.76 0.07 196)` | `oklch(0.52 0.078 195)` |
| 3 (< 62 págs) | `oklch(0.65 0.082 196)` | `oklch(0.64 0.090 193)` |
| 4 (≥ 62 págs) | `oklch(0.52 0.082 197)` | `oklch(0.78 0.102 190)` |

### Tipografia

| Função | Família | Tamanho | Peso |
|---|---|---|---|
| Display / títulos de livros | Newsreader (serif) | 19–52px | 400–500 |
| UI (rótulos, corpo, botões) | DM Sans | 12–16px | 400–600 |
| Dados / etiquetas / mono | DM Mono | 9–13px | 400–500 |

### Espaçamento e bordas

| Token | Valor |
|---|---|
| `--r-sm` | `7px` |
| `--r-md` | `11px` |
| `--r-lg` | `18px` |
| Sidebar width | `248px` |
| Now-playing bar height | `68px` |
| Topbar height | `56px` |

### Sombras

| Token | Valor |
|---|---|
| `--shadow-sm` | `0 1px 2px oklch(0.4 0.02 240 / 0.05), 0 1px 1px oklch(0.4 0.02 240 / 0.04)` |
| `--shadow-md` | `0 2px 6px oklch(0.4 0.02 240 / 0.06), 0 8px 28px oklch(0.4 0.02 240 / 0.07)` |
| `--shadow-lg` | `0 12px 40px oklch(0.35 0.02 240 / 0.14)` |
| `--shadow-cover` | `0 1px 2px oklch(0.3 0.02 240 / 0.18), 0 6px 18px oklch(0.3 0.02 240 / 0.16)` |

---

## 4. Layout do shell

```
┌──────────────────────────────────────────────────────┐
│ SIDEBAR (248px)  │  TOPBAR (56px, sticky)             │
│                  ├────────────────────────────────────┤
│  brand mark      │                                    │
│  + Registrar btn │  CONTEÚDO PRINCIPAL (scroll)       │
│  nav items       │                                    │
│                  │                                    │
│  ← Voltar Makima │                                    │
├──────────────────┴────────────────────────────────────┤
│  NOW-PLAYING BAR (68px, span full width)              │
└───────────────────────────────────────────────────────┘
```

Grid CSS:
- `grid-template-columns: 248px 1fr`
- `grid-template-rows: 1fr auto`
- Sidebar: `grid-column: 1; grid-row: 1`
- Main: `grid-column: 2; grid-row: 1`
- Now-playing bar: `grid-column: 1 / 3; grid-row: 2`

**Breakpoint responsivo**: ≤ 860px → sidebar colapsa para 64px (só ícones), labels e contagens somem.

---

## 5. Sidebar

### Brand mark
- Círculo 42×42px, borda `1px solid oklch(0.565 0.082 196 / 0.35)`
- Box-shadow glow: `0 0 0 3px oklch(0.565 0.082 196 / 0.08)`
- Imagem: `frieren.png` (retrato da Frieren, transparente), object-position `center 8%`
- Nome: `Frieren` — Newsreader 19px weight 500
- Subtítulo: `LIVROS` — DM Mono 9.5px uppercase letter-spacing 0.16em cor `--teal-deep`

### Botão "Registrar leitura"
- Fundo: `--teal`, texto branco `oklch(0.99 0.01 196)`
- Padding 11px 14px, border-radius `--r-md`
- Box-shadow: `0 1px 2px oklch(0.46 0.078 198 / 0.4), 0 6px 16px oklch(0.46 0.078 198 / 0.2)`
- Hover: fundo `--teal-deep` + `translateY(-1px)`
- Sempre visível — ação principal do app

### Nav items
Grupos: **Biblioteca** (Início, Biblioteca, Lendo agora, Quero ler, Wishlist) e **Coleção** (Estantes, Atividade, Resenhas, Estatísticas)

| Label | Rota | Ícone | Badge (contagem) |
|---|---|---|---|
| Início | `home` | casa | — |
| Biblioteca | `catalogo` | grade 2×2 | total de livros |
| Lendo agora | `lendo` | livro aberto | em leitura |
| Quero ler | `querler` | marcador | status `owned` |
| Wishlist | `wishlist` | sparkle | status `wishlist` |
| Estantes | `listas` | lista | nº de estantes |
| Atividade | `atividade` | pulso | — |
| Resenhas | `resenhas` | estrela | livros com review |
| Estatísticas | `stats` | barras | — |

Estado ativo: fundo `--teal-tint`, texto `--teal-deep`, font-weight 600, ícone `--teal`.

### Rodapé
- Link "← Voltar à Makima" com ponto colorido (`oklch(0.66 0.145 5)` — acento da Makima)

---

## 6. Topbar

- Altura 56px, sticky, backdrop-filter blur(12px)
- Fundo: `oklch(0.985 0.004 95 / 0.82)` (claro) / `oklch(0.165 0.012 250 / 0.82)` (escuro)
- Título da seção atual: Newsreader 18px weight 500, `white-space: nowrap`
- Search bar: pill, altura 34px, min-width 200px, fundo `--card`, borda `--line`
  - Focus: borda `--teal`, box-shadow `0 0 0 3px --teal-tint`
  - Ao digitar: navega para `catalogo` e filtra lista

---

## 7. Data model

```typescript
type BookStatus = 'reading' | 'read' | 'owned' | 'wishlist';
// owned = já tenho em casa, ainda não li (TBR pile)
// wishlist = quero comprar (tem storeLink)

interface Book {
  id: string;
  title: string;
  author: string;
  year: number;
  pages: number;
  genre: 'Ficção científica' | 'Fantasia' | 'Literatura' | 'Não-ficção';
  status: BookStatus;
  progress?: number;   // 0–1, só quando reading
  page?: number;       // página atual, quando reading
  started?: string;    // ISO date
  finished?: string;   // ISO date
  rating?: number;     // 0–5 em passos de 0.5
  review?: string;     // texto da resenha
  shelves: string[];   // ids das estantes
  storeLink?: string;  // URL da loja (só wishlist)
  cover: CoverKey;     // ver paletas de capa abaixo
}

interface Shelf {
  id: string;
  name: string;
  desc: string;
  accent: string;     // cor oklch da estante
}

interface ActivityEntry {
  id: string;
  date: string;        // ISO date YYYY-MM-DD
  bookId: string;
  type: 'progress' | 'finished' | 'started' | 'review';
  pages?: number;      // delta de páginas lidas
  page?: number;       // página atual após registro
  note?: string;
  rating?: number;
}

interface HeatmapDay {
  date: string;        // YYYY-MM-DD
  pages: number;
}
```

### Paletas de capa (CoverKey)

Capas são renderizadas em CSS — não há imagens. Cada paleta tem `bg` (cor de fundo), `ink` (texto), `edge` (filete interno).

| Chave | bg | ink |
|---|---|---|
| sand | `oklch(0.74 0.072 80)` | `oklch(0.27 0.04 60)` |
| teal | `oklch(0.50 0.072 200)` | `oklch(0.95 0.02 200)` |
| slate | `oklch(0.43 0.035 250)` | `oklch(0.93 0.015 250)` |
| sage | `oklch(0.62 0.055 150)` | `oklch(0.24 0.04 150)` |
| rose | `oklch(0.58 0.085 18)` | `oklch(0.96 0.02 30)` |
| plum | `oklch(0.42 0.075 320)` | `oklch(0.94 0.02 320)` |
| indigo | `oklch(0.40 0.082 270)` | `oklch(0.93 0.02 270)` |
| clay | `oklch(0.56 0.085 45)` | `oklch(0.97 0.02 60)` |
| fog | `oklch(0.80 0.018 230)` | `oklch(0.34 0.03 250)` |
| forest | `oklch(0.38 0.055 165)` | `oklch(0.92 0.03 150)` |
| ink | `oklch(0.30 0.018 250)` | `oklch(0.90 0.015 250)` |
| amber | `oklch(0.66 0.105 65)` | `oklch(0.26 0.05 50)` |

---

## 8. Componente: Capa tipográfica (Cover)

Elemento auto-contido sem imagens externas. Aspect-ratio 2:3.

```
┌──────────────────┐
│ [filete interno] │  ← borda inset 9px, opacity 0.35, currentColor
│ Título do livro  │  ← serif, tamanho dinâmico: 23px (≤13 chars) / 19px (≤22) / 16px (>22)
│                  │
│ ────────         │  ← linha 1px, currentColor, opacity 0.3, mx 14px
│ NOME DO AUTOR    │  ← mono 8.5px uppercase, opacity 0.82, mb 14px
└──────────────────┘
```

**Badges** (top-right, 8px): 
- Lendo: fundo `--teal`, texto branco, label "lendo"
- Wishlist: fundo branco/85%, texto `--teal-deep`, label "quero ler"

**Barra de progresso** (bottom, 3px): gradiente `--teal` → `--teal-bright`

**Sombra**: `--shadow-cover`  
**Hover** (quando dentro de `cover-link`): `translateY(-4px)` + `--shadow-lg`

---

## 9. Componente: Estrelas de avaliação

Método de renderização: duas camadas sobrepostas.
1. Camada base (5 estrelas vazias em cor `--line`)
2. Camada top (5 estrelas preenchidas em `--gold`), `overflow: hidden`, `width: rating/5 * 100%`

Isso suporta qualquer valor fracionário (meias estrelas, etc.) sem lógica por estrela.

**Tamanho padrão**: 13×13px  
**Tamanho lg**: 18×18px (usado na página de detalhe)

---

## 10. Telas

### 10.1 Início (Home)

#### Hero
Ocupa a largura total do conteúdo (max-width 1180px), border-radius `--r-lg`, gradiente de fundo:
```css
background:
  radial-gradient(120% 130% at 88% 30%, oklch(0.565 0.082 196 / 0.18), transparent 55%),
  radial-gradient(90% 120% at 12% 80%, oklch(0.66 0.098 80 / 0.10), transparent 60%),
  linear-gradient(150deg, var(--mist), var(--card) 60%);
```
Grain: dots pattern `7px × 7px`, `mix-blend-mode: multiply` (claro) / `screen` (escuro).

**3 variações de layout** (controlada por `data-layout` no elemento hero):

| Variação | Grid | Min-height | Greet size |
|---|---|---|---|
| `cinematico` | `1.08fr 0.92fr` | 340px | clamp(34px, 4vw, 52px) |
| `editorial` | `1fr 280px` | auto (align: center) | clamp(30px, 3.2vw, 42px) |
| `galeria` | `1fr` (retrato absoluto, right 4%) | 380px | clamp(30px, 3.4vw, 46px) |

Conteúdo da coluna esquerda:
- **Eyebrow**: mono 10.5px uppercase "BIBLIOTECA DE FRIEREN"
- **Saudação**: serif (clamp), e.g. "Boa tarde." — computada de `new Date().getHours()`
- **Linha de leitura atual**: "No meio de *O Nome do Vento* · pág. 407 de 656" — itálico teal no título
- **Quote**: bloco-citação serif itálico, border-left 2px `--teal`
- **CTAs**: "Registrar leitura" (btn-primary) + "Continuar [título]" (btn-ghost)

Retrato (Frieren): `frieren.png` com halo radial por trás (`oklch(0.72 0.095 192 / 0.28)` → transparente), filter `drop-shadow`. Na variação **galeria**: posicionado absolute, `right: 4%`, mask gradient bottom.

#### Stat cards (grid 4 colunas)

| Card | Dado | Detalhe |
|---|---|---|
| Páginas · 7 dias | soma últimos 7 dias do heatmap | sparkline de 14 dias + variação % vs. semana anterior |
| Sequência | dias consecutivos sem parar | Recorde do ano |
| Lidos · 2026 | contagem status = 'read' do ano | Meta (ex: 30 livros) |
| Média diária | soma/N dias do período | Dropdown: 7 dias / 30 dias / no ano |

Valor: Newsreader 38px weight 400 / unidade: DM Sans 13px `--ink-3`.  
Sparkline: 14 barras, altura proporcional, cor `--teal-tint-2` / barra "quente" (≥70% do max): `--teal`.

#### Heatmap "Constância de leitura"

Dividido em **blocos por mês** em flex-wrap:
- Cada bloco: rótulo do mês (mono 9.5px) + total de páginas do mês (mono 9px, direita)
- Grid de células: `grid-template-rows: repeat(7, 9px); grid-auto-flow: column; gap: 3px`
- Células: 9×9px, border-radius 2px, cor via nível (tabela no item 3)
- Alinhamento: começa no domingo da primeira semana do mês (preenche vazios iniciais com `transparent`)
- Hover na célula: `scale(1.35)`
- Legenda: "menos ← swatches → mais"

#### Seção "Lendo agora"
Scroll horizontal de cards (320px cada):
- Cover (84px) + corpo (título, autor, `pág X de Y`, progresso)
- Progresso: track 5px, fundo `--line-2`, fill gradiente `--teal` → `--teal-bright`
- Hover card: `translateY(-2px)` + shadow + borda teal

#### Atividade recente
Feed de 4 itens mais recentes, link "Ver diário completo →" para Atividade.

---

### 10.2 Biblioteca (Catálogo)

**Toolbar**: chips de filtro (Todos / Lendo / Lidos / Quero ler / Wishlist) + resultado-count + badge de ordenação.

**Grade de capas** (`cover-grid`):
- `grid-template-columns: repeat(auto-fill, minmax(var(--cover-w), 1fr))`
- Variável `--cover-w` controlada por densidade:

| Densidade | `--cover-w` |
|---|---|
| Grande | 200px |
| Médio (padrão) | 162px |
| Compacto | 122px — oculta `cm-author` |

**Ordenação** (passada via prop, lógica de sort):
- Recentes → por `finished` / `started` desc
- Avaliação → `rating` desc
- Título / Autor → localCompare pt-BR
- Progresso → `progress` desc

Abaixo de cada capa: título (serif 13px weight 600), autor (12px `--ink-3`), estrelas ou "X% lido" ou "na wishlist".

---

### 10.3 Detalhe do livro

Layout: `grid-template-columns: 248px 1fr; gap: 44px`. Coluna esquerda sticky (top: 20px).

**Coluna esquerda**: Cover (248px) + barra de progresso (se reading) + botão "Registrar leitura".

**Coluna direita**:
- Gênero: mono 10px uppercase `--teal-deep`
- Título: Newsreader 44px weight 500 letter-spacing -0.02em
- Autor: 16px "de **Nome** · Ano"
- Rating row: Stars lg + valor numérico + pill de status (cor: teal=lendo, gold-deep=lido, card=wishlist)
- Meta grid: `repeat(auto-fit, minmax(120px, 1fr))`, 1px gap, borda line — cada célula: label mono 9px + valor 15px
- Resenha: Newsreader 19px itálico, border-left 2px `--gold`
- Estantes: chips clicáveis com ponto colorido
- Diário do livro: feed filtrado por bookId, timeline com border-left 2px `--line`

---

### 10.4 Quero ler (status `owned` — já tenho, TBR pile)

Lista vertical (gap 10px). Cada item:
- Capa 58px (esquerda)
- Info: título Newsreader 18px, autor 12.5px, chip de gênero (teal pill)
- Direita: botão "Começar a ler" (btn-primary)
- Hover card: shadow-md + borda teal 30% alpha

---

### 10.5 Wishlist (status `wishlist` — quero comprar)

Mesma estrutura do Quero ler, com campo adicional para **link da loja**:

**Estado: sem link**
- Botão dashed "＋ Link da loja" — borda `1.5px dashed --line`, cor `--ink-4`
- Hover: borda `--teal`, cor `--teal-deep`, fundo `--teal-tint`

**Estado: editando (inline)**
- Input 34px altura, borda `--teal` + box-shadow `0 0 0 3px --teal-tint`
- Placeholder: "amazon.com.br/… ou cole qualquer link"
- `Enter` → salvar, `Esc` → cancelar
- Botão "Salvar" (teal) + botão "✕" (ghost)

**Estado: salvo**
- Badge com domínio extraído: mono 10.5px, fundo `--card-2`, borda `--line`, pill
- Link "Abrir →" (font-weight 600, cor `--teal-deep`)
- Lápis de editar (botão icon)

**Persistência**: salvar em `book.storeLink` (string da URL). Normalizar: adicionar `https://` se não tiver protocolo.

---

### 10.6 Estantes (Listas)

Grid `repeat(auto-fill, minmax(300px, 1fr))`, gap 18px.

Cada card:
- Spines empilhados: 5 capas (64px) com `margin-right: -22px`, `perspective: 600px`
- Hover: capas sobem `translateY(-3px)`
- Barra colorida 28×3px (cor da estante)
- Nome: Newsreader 20px weight 500
- Descrição: 13px `--ink-2`
- Contagem: mono 10.5px `--ink-4` uppercase

Ao clicar: abre ShelfView com grid de todas as capas da estante.

---

### 10.7 Atividade (Diário de leitura)

Feed agrupado por data:
- Label de data: mono 10px uppercase, cor `--ink-4`, formato "HOJE · 8 DE JUNHO"
- Cada entrada: Cover 52px + texto + nota em itálico + meta (data relativa, badge de tipo)
- Tipos: `progress` ("leu X · Y páginas"), `finished` (badge dourado "terminado"), `started` (badge teal "novo")
- Nota (se existir): serif 13.5px itálico `--ink-2`, aspas

---

### 10.8 Resenhas

Grid `repeat(auto-fill, minmax(340px, 1fr))`. Cada card:
- Cover 62px (esquerda)
- Título (Newsreader 17px), Stars + nota
- Resenha: 13.5px itálico `--ink-2`, aspas

---

### 10.9 Estatísticas (ano em revista)

**Hero**: eyebrow mono + "2026, até aqui" (Newsreader 44px weight 400)

**Big stats** (3 colunas): número em Newsreader 56px cor `--teal-deep`, label 13px `--ink-2`

**Barras mensais** (flex, `align-items: flex-end`, h: 180px): cada barra tem label do mês (mono 10px), valor (mono 10px), barra com gradiente `--teal` → `--teal-bright`, border-radius `4px 4px 0 0`

**Distribuição de notas** (por linha): Stars + barra `--gold` + contagem

**Destaques**: gênero favorito, autor mais lido, maior sequência, gêneros explorados — cada um: label mono, valor Newsreader 22px `--teal-deep`, sub 12px `--ink-3`

---

## 11. Modal: Registrar leitura

### Princípio de design
**Abrir → preencher → sair.** Deve ser o fluxo mais rápido do app. Book e página pré-preenchidos. Enter salva.

### Estrutura
```
┌─────────────────────────────────────┐
│ Registrar leitura              [✕]  │
│                                     │
│ Qual livro?                         │
│ [capa][capa][capa][capa]...         │  ← scroll horizontal, lendo primeiro
│                                     │
│ Você parou na página…               │
│ [  407  ]  de 656                   │  ← input numérico grande
│ [+10] [+25] [+50] [terminei]  62%   │  ← quick-add buttons
│                                     │
│ Uma linha sobre hoje · opcional     │
│ [O que ficou de hoje?         ]     │  ← textarea 60px
│                                     │
│ □ Terminei este livro               │
│   → (se checked) Sua nota: ★★★★★   │
│                                     │
│ ⌘↵ para salvar    [Cancelar][Salvar]│
└─────────────────────────────────────┘
```

### Comportamento
- **Seleção de livro**: scroll horizontal de capas (52px), reading books primeiro → read recentes → wishlist. Clique seleciona e atualiza o campo de página para o `book.page` atual.
- **Botões rápidos**: +10, +25, +50 somam ao valor atual. "terminei" vai para `book.pages`.
- **Porcentagem**: calculada em tempo real ao digitar.
- **Terminei checkbox**: ao marcar, revela seletor de estrelas (5 botões star, click individual). Botão "limpar" ao lado.
- **Scrim**: `oklch(0.3 0.02 240 / 0.32)` + `backdrop-filter: blur(4px)`. Click fora fecha.
- **Animações**: scrim fade-in 0.18s; modal slide-up + scale 0.22s `cubic-bezier(.2,.8,.3,1)`.
- **Após salvar** (onSave):
  1. Atualiza `book.page` e `book.progress`
  2. Se status era `wishlist` ou `owned`, muda para `reading`
  3. Se terminado: status → `read`, `book.finished` = hoje, rating se informado
  4. Insere entrada no início do feed de atividade
  5. Exibe toast de confirmação (2.6s)
  6. Fecha o modal

### Toast
- Posição: fixed, bottom 90px, centrado horizontalmente
- Fundo `--ink`, texto `--paper`, ícone check `--teal-bright`
- Padding 12px 20px, border-radius 999px
- Animação: slide-up de 14px + fade, 0.3s

---

## 12. Barra "Agora lendo" (Apple Music style)

Posição: grid-row 2, span full width. Altura 68px.

```
[Capa 44px] | [Título / Autor] | [pág X] ──── barra ──── [pág Y] | [← →] | [+ Registrar]
```

- Ao clicar na capa ou título: navega para detalhe do livro
- Setas ← →: alternam entre livros com status `reading` (visível só se >1 livro lendo)
- "+ Registrar": abre modal pré-selecionado no livro em exibição
- Barra de progresso: track full-width + fill gradiente teal

---

## 13. Tweaks (painel de personalização)

Painel flutuante (canto inferior direito) ativado pelo toolbar do host app.

| Tweak | Tipo | Opções |
|---|---|---|
| **Tema** | Radio | Claro / Escuro |
| **Layout do hero** | Radio | Cinemático / Editorial / Galeria |
| **Densidade da grade** | Radio | Grande / Médio / Compacto |
| **Ordenação** | Select | Recentes / Avaliação / Título / Autor / Progresso |

---

## 14. Assets

| Asset | Arquivo | Uso |
|---|---|---|
| Retrato da Frieren | `frieren/frieren.png` | Logo na sidebar (42px círculo) + hero da página inicial (transparente, 500×500px) |

A imagem tem fundo transparente (removido). Na sidebar, cropar e circular via `border-radius: 50%; overflow: hidden`. No hero, exibir com halo radial por trás e `filter: drop-shadow(0 18px 30px oklch(0.46 0.078 198 / 0.22))`.

---

## 15. Arquivos de referência

```
Frieren — Livros.html   ← protótipo principal (abrir no browser)
frieren/
  styles.css            ← design system completo (tokens + todos os componentes)
  data.js               ← modelo de dados e mock (20 livros, 5 estantes, activity feed)
  ui.jsx                ← primitivos: Cover, Stars, Heatmap, Spark, Progressbar, Icons
  screens-a.jsx         ← telas: Home, Catalog, BookDetail
  screens-b.jsx         ← telas: Lists, ShelfView, Activity, Reviews, Stats, ToRead, Wishlist
  logmodal.jsx          ← LogModal, NowBar, Toast
  app.jsx               ← shell, roteamento, Tweaks, lógica de addLog
  frieren.png           ← asset: retrato da Frieren (fundo transparente)
```

**Como rodar**: abrir `Frieren — Livros.html` num browser moderno. Babel transpila os JSX no cliente (apenas para desenvolvimento). Em produção, pré-compilar os arquivos JSX.

---

## 16. Notas de implementação

1. **Oklch**: todos os tokens de cor usam `oklch()`. Verificar suporte no browser target; se necessário, fornecer fallback hex. Chrome 111+, Firefox 113+, Safari 15.4+ suportam nativamente.

2. **Capa sem imagem**: a capa tipográfica é propositalmente sem imagens externas — resistente a broken links e coesa visualmente. Se no futuro quiser suportar capas reais (upload do usuário ou integração com Google Books API), adicionar uma prop `coverUrl` ao Book e renderizar como `<img>` sobre o fundo colorido quando presente.

3. **Persistência de dados**: atualmente tudo em memória (arrays JS). Para produção, mapear para a API/banco do app. O `storeLink` da Wishlist deve ser salvo junto com o livro no backend.

4. **Heatmap**: gerado a partir do ActivityFeed (somar páginas por dia). Não é calculado separadamente — agregar o log de atividade por data.

5. **Ordenação "Recentes"**: usa `finished` para livros lidos, `started` para em leitura/owned, sem data para wishlist (aparecem por último).

6. **Modal de login rápido**: a UX de "abrir, registrar, sair" é crítica. Priorizar carregamento rápido, auto-foco no input de página, e aceitar Enter para salvar sem tocar no mouse.

7. **Tema escuro**: aplicar `data-theme="dark"` no `<html>`. Todos os tokens CSS se atualizam automaticamente via cascata. O estado do tema deve persistir em `localStorage`.

8. **Tweaks**: o painel de Tweaks é um protocolo de comunicação via `postMessage` entre o protótipo e o host. Em produção, substitua por um sistema real de preferências (settings page ou localStorage). O estado de `layoutInicio`, `densidade` e `ordenacao` devem persistir por usuário.
