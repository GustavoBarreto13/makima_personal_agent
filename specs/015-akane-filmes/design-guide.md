# Guia de Design — Filmes (Akane) · porte do Design Handoff

Este documento descreve a UI da seção **Filmes** (estilo Letterboxd) para reconstruí-la no frontend real.
A **referência definitiva** é o protótipo hi-fi em `specs/015-akane-filmes/design_handoff_akane_filmes/`
(HTML/CSS/JSX + `data.js` + README de 352 linhas). Aqui consolidamos **tema, telas, componentes, estados,
interações e o contrato de dados** — alinhados ao protótipo — para guiar o porte.

> **Fluxo de porte**: o protótipo (`design_handoff_akane_filmes/akane/styles.css`) é a fonte dos tokens; o
> CSS é **portado** para `webapp/frontend/src/pages/akane/akane.css` (tokens OKLCH escopados em
> `.akane-shell`). O React consome o contrato de `contracts/movies-api.md` via `akaneApi`. **Copiar os
> valores OKLCH reais do `styles.css`** — não reinventar.
>
> **Estratégia de pôster (decisão da fatia)**: a UI usa a **imagem real do TMDB** (`poster_url`/
> `backdrop_url`) como primário; o **pôster tipográfico** do protótipo (campo de cor + título em Display)
> é o **fallback** quando `poster_url` é NULL. Ver §5 (`Poster`) e R9 em `research.md`.

---

## 1. Conceito visual

**Referência**: Letterboxd — no vocabulário visual do projeto (Shells Frieren/Nami/Violet). A diferença
essencial é que **o pôster é o herói absoluto**: a UI é uma galeria densa, escura, "de cinema". A
personalidade é a **Akane Kurokawa** (*Oshi no Ko*): analítica, elegante, intensa — luz baixa de sala de
projeção, acento de palco/estrela.

**Princípios**:
- **Pôster em primeiro lugar**: grids densos de capas; texto é secundário (hover/detalhe).
- **Escuro por padrão** (cinema), com **tema claro** no tweak (paridade com os outros Shells).
- **Lista ≠ Diário** (igual ao Letterboxd): a **Lista/Filmes** é o acervo (1 card por filme, nota/review/
  notas mais recentes); o **Diário** é o registro cronológico de **sessões** (o mesmo filme pode aparecer
  várias vezes — rewatches). Tudo "quando/quantas vezes/o que achei naquele dia" vive no Diário; "o filme
  em si" vive na Lista.
- **Nota = meia-estrela** (0.5–5.0) em **verde Letterboxd**, nunca número solto no card; **coração** para "liked".
- **Backdrop cinematográfico** na página do filme (hero horizontal largo, gradiente para o conteúdo).
- **Calmo e preciso**: tipografia limpa, muito respiro, micro-interações discretas.

## 2. Tema e tokens (OKLCH) — escopo `.akane-shell`

Declarar todos os tokens dentro de `.akane-shell`. **Tema escuro é o padrão** (`:root` do protótipo); o
**claro** sobrescreve em `[data-theme='light']`. O **acento** é trocável por `[data-accent]`.

### 2.1 Superfícies, tinta e linhas (tema escuro, base)
```css
--paper:   oklch(0.155 0.010 330);   /* fundo do app */
--paper-2: oklch(0.185 0.013 332);   /* sidebar / superfícies alt */
--card:    oklch(0.208 0.014 332);   /* cards, modais */
--card-2:  oklch(0.182 0.012 332);   /* cards secundários */
--mist:    oklch(0.255 0.030 345);   /* fundo do hero */
--ink … --ink-4: 0.95 → 0.475 (hue 330–336)   /* texto primário → muted */
--line / --line-2: 0.305 / 0.245 (hue 334)     /* bordas / divisórias */
```
`[data-theme='light']` inverte para "papel" claro (`--paper: oklch(0.985 …)`, `--ink: oklch(0.235 …)`)
mantendo os acentos. Sombras mais densas no escuro (`--shadow-sm/md/lg/poster`).

### 2.2 Acento (trocável) — **default de fábrica = teal**
A **base** (`:root`) é **rosa de palco** (hue 357). Os alternativos sobrescrevem em `[data-accent]`. O
**default de fábrica** (`TWEAK_DEFAULTS`) aplica `data-accent='teal'` no boot — **o app abre Verde-água**,
embora a base CSS seja rosa.

| Tweak "Cor de acento" | `data-accent` | `--rose` (base escuro) |
|---|---|---|
| Rosa de palco | *(nenhum)* | `oklch(0.655 0.205 357)` |
| Verde-água **(padrão)** | `teal` | `oklch(0.66 0.115 196)` |
| Carmim | `carmim` | `oklch(0.605 0.215 22)` |
| Âmbar | `ambar` | `oklch(0.74 0.155 66)` |

Cada acento redefine `--rose*` e a escala `--heat-*`. Tokens de acento: `--rose`, `--rose-deep` (texto-
acento sobre escuro — **mais claro** no dark), `--rose-bright`, `--rose-tint`/`--rose-tint-2`.

### 2.3 Estrela, coração e heatmap (independentes do acento)
```css
--gold:  oklch(0.815 0.135 86);   /* estrelas / notas — VERDE/ouro Letterboxd, NÃO acompanha o acento */
--heart: oklch(0.68 0.20 12);     /* coração (curtir) */
--heat-0..4: var(--line-2) → oklch(0.74 0.20 354)   /* 0 sessões → 4+ no dia; acompanha o acento */
```
> As **estrelas e o histograma de notas usam verde Letterboxd fixo**, independentemente do acento escolhido.

### 2.4 Tipografia (4 famílias)
| Função | Família (`--var`) | Uso |
|---|---|---|
| **Display** | `DM Serif Display` (`--display`) | Títulos grandes, pôsteres, hero, números de stat (marquise) |
| **Serif** | `Newsreader` ital (`--serif`) | Reviews, notas, citações, títulos de filme em listas |
| **Sans** | `DM Sans` (`--sans`) | UI, botões, corpo |
| **Mono** | `DM Mono` (`--mono`) | Rótulos, datas, contagens, metadados |

### 2.5 Raios, densidade, pôster
```css
--r-sm: 7px; --r-md: 11px; --r-lg: 18px;
--cover-w: 168px;   /* densidade do grid; [data-density] = 198 (grande) / 162 (médio) / 120 (compacto) */
--poster-ratio: 2/3;
```

## 3. Layout do Shell (`.akane-shell` ⇄ `.ak-app` no protótipo)

```
┌───────────────────────────────────────────────┐
│ SIDEBAR (252px) │ TOPBAR (56px, sticky)        │
│                 ├──────────────────────────────┤
│ marca Akane     │                              │
│ + Logar filme   │  CONTEÚDO (scroll)           │
│ nav (2 grupos)  │                              │
│ ← Voltar Makima │                              │
├─────────────────┴──────────────────────────────┤
│ BARRA "PRÓXIMA SESSÃO" (68px, full width)      │
└────────────────────────────────────────────────┘
```
Grid: `grid-template-columns: 252px 1fr; grid-template-rows: 1fr auto`. A barra inferior (NextBar) ocupa
`grid-column: 1/3; grid-row: 2` (some se a watchlist estiver vazia → `data-footbar='off'`).
**Responsivo**: ≤ 880px a sidebar colapsa para 64px (só ícones); ≤ 720px o hero vira coluna única e
esconde o retrato.

- **Sidebar própria** (sem `Layout` global), no padrão `FrierenShell`/`KaguyaShell`.
  - **Marca**: círculo 44px com `akane-hero.png` (retrato recortado) + glow do acento; "Akane" (Display
    20px) + "FILMES" (mono).
  - **Botão `Logar filme`** (ação principal, sempre visível) → abre o `LogModal`.
  - **Nav em 2 grupos** (cada item: ícone + label + badge de contagem):
    - *Cinemateca*: **Início · Filmes · Diário · Quero ver**
    - *Coleção*: **Listas · Etiquetas · Rewind**
  - **Rodapé**: "← Voltar à Makima".
- **Navegação por estado** (`view: 'home'|'films'|'diary'|'watchlist'|'lists'|'list'|'tags'|'rewind'|'detail'`),
  sem React Router aninhado; `detail`/`list` guardam o `id`/param. `navigate(view, param)` zera o scroll.
- **Topbar**: título da rota (Display) + busca pill (título ou diretor) — digitar leva para **Filmes** e filtra.
- **Ações no rodapé da sidebar / topbar**: **Logar filme** (`LogModal`), **Sincronizar agora**
  (`POST /api/movies/sync-letterboxd`, spinner + toast com o resumo), **alternar tema** (tweak).

## 4. Telas

### 4.1 Início (`Home`) — *Onda US4*
1. **Hero** — eyebrow "Cinemateca de Akane", saudação (por hora), "Última sessão · *filme* · nota", citação
   da Akane, CTAs **Logar filme** / **Abrir diário**. Retrato **transparente** (`akane-hero.png`) centralizado
   com halo + drop-shadow (tratamento estilo Frieren).
2. **2 stat cards** — *Filmes · {ano}* (com meta) e *Sessões · 7 dias* (sparkline + variação vs. semana anterior).
3. **`home-split`** (perfil Letterboxd, 2 colunas ≥ 980px; empilha abaixo):
   - **Coluna principal**: **Favoritos** (editável) + **Atividade recente**.
   - **Coluna lateral**: painel Letterboxd — **Diário** (entradas por mês) + **Notas** (histograma 0,5–5,0,
     meia-estrela verde à esquerda + 5 estrelas verdes à direita).
4. **Watchlist em destaque** — carrossel horizontal dos filmes "quero ver".
- **Dados**: `GET /api/movies/home` (uma query — ver `contracts`).

**Favoritos (editável)**: cabeçalho com link **Editar / Concluir**; 4 pôsteres. Em edição: cada slot ganha
**× (remover)**; havendo < 4, aparece **＋ Adicionar** → `FavPicker` (busca entre os **vistos**, exclui já
favoritos). Persiste via `PUT /api/movies/favorites` (servidor, não localStorage).
**Atividade recente**: 4 últimas entradas do diário como pôsteres, com marcadores abaixo (estrelas c/ meia,
coração, loop de revisão, ícone de anotação) + link **Tudo →** para o Diário.

### 4.2 Filmes (`Catalog`) — a LISTA (view padrão de "Filmes")
- Grade densa de `Poster` (auto-fill, `--cover-w`); densidade via `[data-density]`.
- **Chips de filtro**: **Todos / Vistos / Curtidos / Quero ver / Com nota** (`?filter=`).
- **Ordenação** (tweak): Recentes (`last_watched_date`) / Nota / Título / Diretor / Ano / Duração.
- Abaixo de cada pôster: título, diretor·ano, estrelas+coração ou "quero ver".
- **Modo etiqueta**: quando `tag` é passado (`?tag=`), header "#tag" + voltar.
- **Estados**: vazio ("Nenhum filme ainda — logue um ou sincronize o Letterboxd"); skeletons; erro.
- **Dados**: `GET /api/movies/?status=&sort=&filter=&tag=`.

### 4.3 Diário (`Diary`) — tabela cronológica
Estilo diário do Letterboxd, agrupado por **mês/ano**. Cada linha: **dia + dia-da-semana**, mini-pôster,
título·ano, anotação em itálico, marcadores (estrelas / coração / loop de revisão). Mostra **cada sessão**.
- **Dados**: `GET /api/movies/diary?limit=`.

### 4.4 Detalhe do filme (`FilmDetail`)
Coluna esquerda **sticky**: pôster grande (TMDB ou tipográfico) + ações **Logar filme** (modal pré-
selecionado), toggles **Curtir** e **Quero ver / Na lista**.
Coluna direita:
- Gênero (kicker), título (Display), "ano · dirigido por **X** · duração · país".
- **Linha de nota**: estrelas grandes + valor, coração, selo **via Letterboxd** (só se `rating_source==='letterboxd'`),
  pill de status (Visto/Quero ver).
- **Grade de metadados** (direção, ano, duração, país, sessões — backdrop hero usa `backdrop_url`).
- **Sua review** (Newsreader itálico, filete dourado) — texto da sessão.
- **Anotações** (`notes`) — bloco "caderno" (filete do acento), **separado** da review.
- **Cofre de conteúdos** (`vault[]`) — galeria de cards por tipo (**vídeo / artigo / ensaio / review**) com
  thumb colorida, ícone do tipo, título e domínio + "abrir →", mais um card **＋ Salvar conteúdo**
  (`VAULT_META` define rótulo/ícone/cor por tipo).
- **Etiquetas** — chips clicáveis (→ tela da etiqueta); etiquetas de pessoa ganham glifo de pessoa.
- **Pessoas** (`people[]`) — direção/elenco/equipe.
- **Diário deste filme** — timeline das sessões daquele filme (data, nota, revisão, nota textual).
- **Dados**: `GET /api/movies/{id}` (movie + people + vault + diary).

### 4.5 Quero ver (`Watchlist`)
Lista vertical: pôster, título/diretor/duração/país, chip de gênero, anotação, botão **Já vi** (→ loga).
Mostra total de horas "esperando". **Dados**: `GET /api/movies/watchlist`.

### 4.6 Listas (`Lists` / `ListView`) — *Onda US5*
Grid de coleções; cada card mostra **pilha de mini-pôsteres** (`Poster mini`), barra de `accent`, nome,
descrição e contagem. `ListView` abre a coleção como grade de pôsteres.
- **Dados**: `GET /api/movies/lists` / `GET /api/movies/lists/{id}` (endpoints da Onda US5).

### 4.7 Etiquetas (`Tags`) — *Onda US5*
Nuvem de chips com contagem. Etiquetas de **pessoa** recebem glifo (vão se conectar à base de pessoas da
014 em breve). Clicar filtra os Filmes por aquela etiqueta. **Dados**: `GET /api/movies/tags`.

### 4.8 Rewind (`Rewind`) — o ano em revista — *Onda US4*
- Hero "Rewind {ano}" + linha-resumo.
- **4 totais**: filmes vistos, sessões, horas assistidas, revisões.
- **Sessões por mês** (barras) + **histograma de notas** 0,5–5,0.
- **Destaques**: filme favorito, maior maratona (sessões no mesmo dia), década mais vista, nota média.
- **Top gêneros** e **Top diretores** (ranks). **Pessoas que marcaram o ano** (direção + elenco + equipe)
  — preparando o link com a base de pessoas.
- **Dados**: `GET /api/movies/rewind?year=` (+ `GET /api/movies/heatmap?year=` para a grade).

### 4.9 Estatísticas (`Stats`) — *Onda US1*
Versão enxuta do Rewind disponível desde a US1: seletor de ano; cards de resumo (total de filmes/sessões,
média de nota); histograma; top gêneros/diretores. Ano sem dados → zerado, sem erro (SC-006). O **Rewind**
(4.8) é a versão rica, na Onda US4. **Dados**: `GET /api/movies/stats?year=`.

## 5. Componentes

| Componente | Responsabilidade | Props (entrada) |
|---|---|---|
| `Poster` | **TMDB `<img>` quando `poster_url`**, senão **tipográfico** (paleta `poster_palette` + título Display + diretor·ano mono). `badge` (coração/quero-ver), `mini` (pilha de Listas) | `movie`, `badge?`, `showRating?`, `mini?`, `onOpen` |
| `Stars` | estrelas estáticas com **meia-estrela via clip** (`width: value/5*100%`), verde Letterboxd | `value`, `lg?` |
| `RateInput` | seletor **interativo meio-passo** (cada estrela = 2 metades clicáveis), hover-preview, "limpar" | `value`, `onChange` |
| `Heart` | coração preenchível (curtir) | `filled`, `onToggle?` |
| `DiaryRow` | linha do diário (mini-pôster, título, data mono, nota, rewatch ↻, trecho) | `entry`, `onOpen` |
| `Heatmap` | grade de sessões/dia por mês (Rewind) | `data` |
| `Spark` | mini sparkline (barras) — card "Sessões · 7 dias" | `data` |
| `FavoriteFilms` / `FavPicker` | vitrine editável + modal de escolha (busca entre vistos) | `favorites`, `onChange` |
| `RecentActivity` | 4 últimas sessões como pôsteres + marcadores | `onOpen` |
| `LbPanel` | painel lateral do Início (Diário + histograma de Notas) | `home` |
| `NextBar` | barra inferior "Próxima sessão" (watchlist + "Já vi") | `watchlist`, `onLog` |
| `Toast` | confirmação flutuante (2,6s) | `message` |
| `Icon` | ícones de linha (stroke) Lucide-style (conjunto `ICONS`) | `name` |
| `EmptyState` / `Skeleton` | estados vazio/carregando reutilizáveis | — |

**Paletas de pôster (`POSTER`)** — 14 colorgrades de cinema (`noir, ember, rose, neon, teal, gold, ink,
blood, forest, dusk, bone, slate, wine, sea`), cada uma `{bg, ink, accent}`. Usadas **só no fallback
tipográfico** (mapeadas a `movies.poster_palette`). Tweak `data-postyle='minimal'` esconde moldura/kicker.

**Regra**: componentes recebem **callbacks** por props e **nunca** chamam `fetch`/`akaneApi` diretamente —
quem busca/escreve é o Shell ou a tela. Estado só com hooks (sem Redux/Zustand).

## 6. Modais e interações

### `LogModal` (logar uma sessão) — busca-primária
Princípio: **abrir, logar, sair**. A **busca é o caminho principal** (quase todo filme logado é novo).
1. **Busca (primária)** — campo no topo em foco, placeholder de exemplo, **debounce ~480ms** + estado
   "buscando…" (spinner) chamando `GET /api/movies/tmdb/search`. Cada resultado: pôster + metadados +
   **Logar este** → adiciona à base (`POST /api/movies/`), seleciona e fecha a busca.
2. **Alvo do log** — card que mostra qual filme vai para o diário (atualiza ao buscar/escolher).
3. **Seletor secundário recolhível** — `<details>` "Ou escolha um que já está na sua base" (raro: repetido).
4. **Campos**: data (default hoje), **nota** (`RateInput` meia-estrela), marcadores (Curtir / Revisão), anotação.
5. Atalhos: **⌘↵ loga**, **Esc fecha**, clique no scrim fecha. → `POST /api/movies/{id}/watch`.

### `AddToWatchlistModal`
Busca TMDB → escolher → `POST /api/movies/` com `status='watchlist'`. Toast.

### Micro-detalhes
- **Nota em meia-estrela**: metade esquerda = .5; direita = inteiro; hover = preview.
- **"Sincronizar agora"**: botão vira spinner; toast "↻ {created} novos, {updated} atualizados"; erro →
  toast vermelho com a mensagem (sem travar a UI).
- **Pôster ausente**: fallback tipográfico consistente — nunca quebra o grid (SC-005/SC-011).
- **Favoritos editáveis**: Editar → remover/adicionar (via `FavPicker`) → `PUT /favorites` (servidor).
- **NextBar**: setas para alternar entre os "quero ver"; "Já vi" → loga.
- **Hover/transições**: discretas (120–180ms); respeitar `prefers-reduced-motion`.
- **Acessibilidade**: alt nos pôsteres (título + ano); foco visível; estrelas operáveis por teclado;
  modal foca a busca, aceita Enter/Esc; alvos ≥ 44px.

## 7. Tweaks (painel de preferências — **client-only**, localStorage)

| Tweak | Tipo | Opções | Default |
|---|---|---|---|
| **Tema** | Radio | Escuro / Claro | Escuro |
| **Cor de acento** | Radio | Rosa de palco / Verde-água / Carmim / Âmbar | **Verde-água** |
| **Densidade** | Radio | Grande / Médio / Compacto | **Compacto** |
| **Estilo do pôster** | Radio | Tipográfico / Minimal | Tipográfico |
| **Ordenação** | Select | Recentes / Nota / Título / Diretor / Ano / Duração | Recentes |

Aplicação: tema → `data-theme` no `<html>`; acento → `data-accent`; densidade → `data-density` na
`.akane-shell` (`--cover-w`); pôster → `data-postyle`. **Sem endpoint** — preferências em `localStorage`.
(Os **favoritos**, ao contrário, persistem no servidor.)

## 8. Contrato de dados por tela (resumo)

| Tela | Endpoint | `akaneApi` | Campos consumidos |
|---|---|---|---|
| Início | `GET /api/movies/home` | `getHome` | favorites, recent_activity, watchlist_highlight, rating_histogram, sessions_7d, last_session, counts |
| Filmes | `GET /api/movies/?status=&sort=&filter=&tag=` | `listMovies` | id, title, year, poster_url, poster_palette, rating, rating_source, liked, tags, times_watched |
| Watchlist | `GET /api/movies/watchlist` | `getWatchlist` | id, title, year, poster_url, poster_palette |
| Diário | `GET /api/movies/diary?limit=` | `getDiary` | movie_id, movie_title, poster_url, watched_date, rating, rewatch, review, tags |
| Detalhe | `GET /api/movies/{id}` | `getMovie` | movie{…notes, rating_source, tags} + people[] + vault[] + diary[] |
| Listas | `GET /api/movies/lists(/{id})` | `getLists`/`getList` | id, name, description, accent, films[] |
| Etiquetas | `GET /api/movies/tags` | `getTags` | name, count, person |
| Rewind | `GET /api/movies/rewind?year=` + `/heatmap?year=` | `getRewind`, `getHeatmap` | totais, monthly[12], rating_histogram, top_*, favorite, days[] |
| Stats | `GET /api/movies/stats?year=` | `getStats` | total_films, total_sessions, avg_rating, top_genres, top_directors, rating_histogram |
| LogModal | `GET /api/movies/tmdb/search?q=` + `POST .../watch` | `searchTmdb`, `logWatch` | resultado TMDB; body de sessão |
| Favoritos | `GET/PUT /api/movies/favorites` | `getFavorites`, `setFavorites` | ids ordenados (≤4) |
| Cofre | `GET/POST /api/movies/{id}/vault`, `DELETE .../vault/{id}` | `getVault`, `addVaultItem`, `deleteVaultItem` | type, title, url, source |

(Shapes completos em `contracts/movies-api.md` e `data-model.md`.)

## 9. Regras do projeto (não violar)

- **Rota `/movies/*` em `App.tsx` ANTES do catch-all `/*`** — senão o Layout global captura.
- **Tokens só do próprio domínio**: usar apenas o que está em `akane.css` (`.akane-shell`); não importar
  `frieren.css`/`nami.css`. Tokens globais (`--ink-*` etc.) vêm do CSS raiz quando aplicável.
- **Nunca `fetch` cru** em componente — sempre `akaneApi.*` (que usa `api.*` de `lib/api.ts`, com
  `credentials: 'include'`).
- **Imagens/estáticos** em `frontend/public/` (ex.: `akane-hero.png` para a sidebar/hero), **nunca** em `dist/`.
- **`akaneApi.ts`** fica em `pages/akane/` (API volumosa, como `namiApi.ts`); `types.ts` espelha o backend
  (`contracts/`).
- **Sem estado global** entre Shells — dados compartilhados passam pela API.
- **Tweaks em localStorage**; **favoritos no servidor** (paridade de canais).

## 10. Entregáveis esperados do porte

1. `akane.css` final (tokens `.akane-shell` — claro/escuro + 4 acentos + componentes) **portado** de
   `design_handoff_akane_filmes/akane/styles.css`.
2. As **9 telas** (Início, Filmes, Diário, Watchlist, Detalhe, Listas, Etiquetas, Rewind, Stats) +
   **modais** (LogModal busca-primária, AddToWatchlist, FavPicker) nos estados (cheio/vazio/carregando).
3. Inventário de componentes (§5) com as classes CSS correspondentes.
4. Pôster com **fallback tipográfico** (14 paletas) sobre a imagem real do TMDB.
5. Painel de **Tweaks** (tema/acento/densidade/pôster/ordenação) em localStorage.
