# Guia de Design — Filmes (Akane) · handoff para o "claude design"

Este documento é **autossuficiente**: descreve a UI da seção **Filmes** (estilo Letterboxd) com detalhe
suficiente para um agente de design construir o frontend sem precisar de mais contexto. Ele define
**tema, telas, componentes, estados, interações e o contrato de dados** de cada tela.

> **Convenção de handoff do repo**: o protótipo visual deve nascer em
> `docs/claude_design/design_handoff_akane_filmes/` (HTML/CSS estático, como
> `docs/claude_design/design_handoff_frieren_livros/` que originou `pages/frieren/frieren.css`). Depois
> o CSS é **portado** para `webapp/frontend/src/pages/akane/akane.css` (tokens OKLCH escopados em
> `.akane-shell`). O React consome o contrato de dados de `contracts/movies-api.md` via `akaneApi`.

---

## 1. Conceito visual

**Referência**: Letterboxd — mas no vocabulário visual do projeto (Shells Frieren/Nami/Violet).
A diferença essencial entre filmes e livros é que **o pôster é o herói absoluto**: a UI é uma galeria de
pôsteres densa, escura, "de cinema". A personalidade é a **Akane Kurokawa** (*Oshi no Ko*): analítica,
elegante, intensa — luz baixa de sala de projeção, acento vermelho de palco/estrela.

**Princípios**:
- **Pôster em primeiro lugar**: grids densos de capas; texto é secundário, aparece no hover/detalhe.
- **Escuro por padrão** (cinema), com opção de tema claro (paridade com os outros Shells que têm claro/escuro).
- **Nota = meia-estrela** (0.5–5.0), nunca número solto no card; coração para "liked".
- **Backdrop cinematográfico** na página do filme (hero horizontal largo, com gradiente para o conteúdo).
- **Calmo e preciso**: tipografia limpa, muito respiro, micro-interações discretas.

## 2. Tema e tokens (OKLCH) — escopo `.akane-shell`

Declarar todos os tokens dentro de `.akane-shell` (isolamento por domínio — ver
`webapp/frontend/src/pages/CLAUDE.md`). Espelhar a estrutura de `frieren.css` (superfícies, tinta, linhas,
acentos, sombras, raios, tipografia) e suportar `[data-theme='dark']` / claro.

**Paleta sugerida (cinema escuro + vermelho/estrela)** — valores de partida, o design pode refinar:

```css
.akane-shell {
  /* superfícies (escuro = padrão "sala de cinema") */
  --screen:   oklch(0.16 0.015 285);   /* fundo app */
  --screen-2: oklch(0.20 0.018 285);   /* painéis */
  --card:     oklch(0.235 0.02 285);   /* cartões */
  --card-2:   oklch(0.27 0.022 285);

  /* tinta */
  --ink:   oklch(0.96 0.01 285);
  --ink-2: oklch(0.80 0.012 285);
  --ink-3: oklch(0.64 0.012 285);

  /* linhas */
  --line:   oklch(0.34 0.02 285);
  --line-2: oklch(0.29 0.018 285);

  /* acentos Akane (vermelho de palco + estrela dourada) */
  --crimson:      oklch(0.58 0.20 18);     /* vermelho B-Komachi / Oshi no Ko */
  --crimson-deep: oklch(0.50 0.19 18);
  --crimson-tint: oklch(0.58 0.20 18 / 0.16);
  --star:         oklch(0.82 0.16 85);     /* dourado das estrelas/nota */
  --star-dim:     oklch(0.50 0.04 85);     /* estrela vazia */

  /* tipografia (sugestão; design pode escolher) */
  --serif: 'Newsreader', Georgia, serif;   /* títulos editoriais, como Frieren */
  --sans:  'DM Sans', system-ui, sans-serif;
  --mono:  'DM Mono', ui-monospace, monospace;  /* datas/números do diário */

  --r-sm: 7px; --r-md: 11px; --r-lg: 18px;
  --poster-w: 150px;  /* densidade do grid; sobrescrito por [data-density] */
  --poster-ratio: 2/3; /* proporção padrão de pôster de filme */
}
```

`[data-theme='light']`: inverter superfícies para "papel" claro mantendo os acentos `--crimson`/`--star`.

## 3. Layout do Shell

```
┌───────────────────────────────────────────────────────────┐
│ sidebar (Akane)      │           área principal             │
│  ◦ Filmes  (grid)    │   topbar (título da view + ações)    │
│  ◦ Diário            │                                       │
│  ◦ Watchlist         │   <conteúdo da tela ativa>            │
│  ◦ Estatísticas      │                                       │
│  ─────────           │                                       │
│  [+ Logar filme]     │                                       │
│  [↻ Sincronizar]     │                                       │
│  [tema claro/escuro] │                                       │
└───────────────────────────────────────────────────────────┘
```

- Sidebar própria (sem `Layout` global), no padrão `FrierenShell`/`KaguyaShell`.
- Navegação por **estado** (`view: 'films' | 'diary' | 'watchlist' | 'stats' | 'detail'`), sem React
  Router aninhado. `detail` guarda também o `movieId`.
- Botões de ação no rodapé da sidebar: **Logar filme** (abre `LogWatchModal`), **Sincronizar agora**
  (chama `POST /api/movies/sync-letterboxd`, mostra spinner + toast com o resumo), **alternar tema**.

## 4. Telas

### 4.1 FilmsScreen — grid de pôsteres (view padrão)

- **Conteúdo**: grade densa de `MovieCard` (pôster) dos filmes `watched`. Responsiva (auto-fill,
  `--poster-w`). Controle de **densidade** opcional (`[data-density]` muda `--poster-w`, como o
  `--cover-w` da Frieren).
- **Ordenação/filtro** na topbar: `recent` (default, por `last_watched_date`), `rating`, `title`; filtro
  por `genre`.
- **Hover do card**: leve elevação + revela título/ano e a nota em estrelas; coração se `liked`.
- **Clique**: abre `MovieDetailScreen` daquele filme.
- **Estados**: vazio ("Nenhum filme ainda — logue um ou sincronize o Letterboxd"); carregando (skeletons
  de pôster); erro (mensagem + botão "tentar de novo").
- **Dados**: `GET /api/movies/?status=watched&sort=recent` (`akaneApi.listMovies`).

### 4.2 DiaryScreen — diário cronológico

- **Conteúdo**: lista vertical de `DiaryRow`, agrupada por mês (cabeçalho de mês). Cada linha: mini-pôster,
  título + ano, **data** (mono), nota em estrelas, glyph de **rewatch** (↻) quando `rewatch=true`, e o
  início da review (truncado).
- **Clique na linha**: abre a página do filme (detalhe), com a sessão destacada.
- **Estados**: vazio; carregando; erro.
- **Dados**: `GET /api/movies/diary?limit=50` (`akaneApi.getDiary`).

### 4.3 WatchlistScreen — grid da watchlist

- **Conteúdo**: grid de `MovieCard` dos filmes `status='watchlist'` (visual igual ao FilmsScreen, mas sem
  nota — ainda não assistidos). Ação por card: **"Logar"** (abre `LogWatchModal` pré-preenchido) e
  **remover da watchlist**.
- **Estados**: vazio ("Sua watchlist está vazia — busque um filme para adicionar"); carregando; erro.
- **Dados**: `GET /api/movies/watchlist` (`akaneApi.getWatchlist`).

### 4.4 MovieDetailScreen — página do filme

Layout em duas faixas:

```
┌──────────────────────────────────────────────┐
│  BackdropHero (backdrop_url, gradiente p/ baixo)│
│     pôster grande │ título · ano · runtime      │
│                   │ diretor · gêneros           │
│                   │ ★★★★½  ♥   [Logar de novo]   │
├──────────────────────────────────────────────┤
│  Sinopse (overview)                            │
│  Histórico de sessões (diary[]):               │
│   • data · ★ nota · ↻rewatch · review · tags   │
└──────────────────────────────────────────────┘
```

- **Hero**: `BackdropHero` usa `backdrop_url` (fallback: gradiente sólido do tema se ausente). Pôster
  sobreposto à esquerda.
- **Ações**: dar/editar nota (`RatingStars` interativo → `PATCH /rating`), like (`PATCH /like`), "Logar de
  novo" (abre `LogWatchModal` para um rewatch), mudar status, excluir (com confirmação).
- **Histórico**: lista de sessões (`diary`), mais recente no topo; cada uma deletável (`DELETE /diary/{id}`).
- **Estados**: carregando (skeleton do hero); 404 → "Filme não encontrado".
- **Dados**: `GET /api/movies/{id}` (`akaneApi.getMovie`).

### 4.5 StatsScreen — estatísticas do ano

- **Conteúdo**: seletor de ano; cards de resumo (**total de filmes**, **total de sessões**, **média de
  nota**); **histograma de notas** (0.5→5.0); **top gêneros** e **top diretores** (barras horizontais).
- **Estados**: ano sem dados → cards zerados + "Nenhum filme em {ano}" (sem erro — SC-006).
- **Dados**: `GET /api/movies/stats?year=YYYY` (`akaneApi.getStats`).

## 5. Componentes

| Componente | Responsabilidade | Props (entrada) |
|---|---|---|
| `MovieCard` | pôster + overlay (título/ano no hover) + nota (estrelas) + coração | `movie`, `onOpen`, `onQuickAction?` |
| `RatingStars` | exibe/edita nota em **meia-estrela** (0.5–5.0) | `value`, `editable?`, `onChange?` |
| `DiaryRow` | linha do diário (mini-pôster, título, data, nota, rewatch, trecho) | `entry`, `onOpen` |
| `ReviewCard` | bloco de review (texto + tags + data) no detalhe | `entry`, `onDelete?` |
| `BackdropHero` | faixa de backdrop com gradiente + pôster + meta | `movie` |
| `PosterSearch` | busca TMDB nos modais (input → resultados com pôster) | `onPick` |
| `EmptyState` / `Skeleton` | estados vazio/carregando reutilizáveis | — |

**Regra**: componentes recebem **callbacks** por props e **nunca** chamam `fetch`/`akaneApi` diretamente —
quem busca/escreve é o Shell ou a tela. Estado só com hooks (sem Redux/Zustand).

## 6. Modais

### `LogWatchModal` (logar uma sessão)
1. (se sem filme escolhido) `PosterSearch` no TMDB → escolher resultado.
2. Campos: **data** (default hoje), **nota** (`RatingStars` editável), **review** (textarea), **tags**
   (chips), **rewatch** (checkbox; pré-marcado se o filme já tem sessões).
3. Confirmar → `POST /api/movies/{id}/watch` (ou `add_movie` + `watch` para filme novo). Toast de sucesso.

### `AddToWatchlistModal`
1. `PosterSearch` no TMDB → escolher.
2. Confirmar → `POST /api/movies/` com `status='watchlist'`. Toast.

## 7. Interações e micro-detalhes

- **Nota em meia-estrela**: clicar na metade esquerda da estrela = .5; metade direita = inteiro. Hover
  mostra preview da nota.
- **"Sincronizar agora"**: botão vira spinner; ao concluir, toast "↻ {created} novos, {updated} atualizados".
  Em erro, toast vermelho com a mensagem (sem travar a UI).
- **Pôster ausente**: placeholder consistente (silhueta + título) — nunca quebra o grid (SC-005).
- **Hover/transições**: discretas (120–180ms), sem exageros; respeitar `prefers-reduced-motion`.
- **Acessibilidade**: alt nos pôsteres (título + ano), foco visível, estrelas operáveis por teclado.

## 8. Contrato de dados por tela (resumo)

| Tela | Endpoint | `akaneApi` | Campos consumidos |
|---|---|---|---|
| FilmsScreen | `GET /api/movies/?status=watched&sort=` | `listMovies` | `id, title, year, poster_url, rating, liked, times_watched` |
| WatchlistScreen | `GET /api/movies/watchlist` | `getWatchlist` | `id, title, year, poster_url` |
| DiaryScreen | `GET /api/movies/diary?limit=` | `getDiary` | `movie_id, movie_title, poster_url, watched_date, rating, rewatch, review, tags` |
| MovieDetailScreen | `GET /api/movies/{id}` | `getMovie` | `movie{...}` + `diary[]` (ver `data-model.md`) |
| StatsScreen | `GET /api/movies/stats?year=` | `getStats` | `total_films, total_sessions, avg_rating, top_genres, top_directors, rating_histogram` |
| LogWatchModal | `GET /api/movies/tmdb/search?q=` + `POST .../watch` | `searchTmdb`, `logWatch` | resultado TMDB; body de sessão |
| AddToWatchlistModal | `GET .../tmdb/search` + `POST /api/movies/` | `searchTmdb`, `addMovie` | idem |

(Shapes completos em `contracts/movies-api.md` e `data-model.md`.)

## 9. Regras do projeto (não violar)

- **Rota `/movies/*` em `App.tsx` ANTES do catch-all `/*`** — senão o Layout global captura.
- **Tokens só do próprio domínio**: usar apenas o que está em `akane.css` (`.akane-shell`); não importar
  `frieren.css`/`nami.css`. Tokens globais (`--ink-*` etc.) vêm do CSS raiz.
- **Nunca `fetch` cru** em componente — sempre `akaneApi.*` (que usa `api.*` de `lib/api.ts`, com
  `credentials: 'include'`).
- **Imagens/estáticos** em `frontend/public/` (ex.: `akane.png` para a sidebar), **nunca** em `dist/`.
- **`akaneApi.ts`** fica em `pages/akane/` (API mais volumosa, como `namiApi.ts`); `types.ts` espelha o
  backend (`contracts/`).
- **Sem estado global** entre Shells — dados compartilhados passam pela API.

## 10. Entregáveis esperados do "claude design"

1. Protótipo estático em `docs/claude_design/design_handoff_akane_filmes/` (HTML + `styles.css`) cobrindo
   as 5 telas + 2 modais nos estados (cheio/vazio/carregando), tema escuro (e claro se possível).
2. `akane.css` final (tokens `.akane-shell` + classes das telas/componentes) pronto para portar.
3. Inventário de componentes (lista da seção 5) com as classes CSS correspondentes.
