# Handoff: Akane — Filmes

> **Seção de organização de filmes do app Makima.**
> Protótipo hi-fi em HTML/CSS/React (JSX transpilado no cliente). Os arquivos deste pacote são **referência de design** — o objetivo é recriar este comportamento e visual no ambiente real do projeto (codebase existente). Não copiar o HTML direto para produção.

---

## 1. Contexto do produto

O **Makima** é um app pessoal de gestão de vida onde cada seção é "curada" por uma personagem de anime. A **Akane Kurokawa** (de *Oshi no Ko*) cura a seção de **filmes** — uma cinemateca pessoal no espírito do **Letterboxd**, mas dentro do sistema visual do app.

```
App Makima
├── Makima (dashboard)
├── Nami    → Finanças
├── Frieren → Livros
├── Kaguya  → Tarefas
├── Violet  → Diário
└── Akane   → Filmes   ← este handoff
```

A seção herda a estrutura de shell dos outros agents (sidebar 252px + topbar 56px + barra inferior + grid), com identidade própria.

### Princípio central — Lista ≠ Diário
Igual ao Letterboxd, há **duas entidades distintas**:

- **Filmes (lista / `FILMS`)** — o acervo único. **Um card por filme**, com a nota/review/notas mais recentes.
- **Diário (`DIARY`)** — o registro **cronológico de sessões**. O **diário bebe da lista**: cada entrada referencia um filme, e o mesmo filme pode aparecer **várias vezes** (rewatches), cada sessão com data, nota e marcadores próprios.

Tudo o que envolve "quando assisti / quantas vezes / o que achei naquele dia" vive no Diário; tudo que é "o filme em si" vive na Lista.

---

## 2. Fidelidade

**Hi-fi.** Recriar cores, tipografia, espaçamento, sombras, estados de hover/foco e animações. O protótipo é a referência definitiva de visual e comportamento.

---

## 3. Design tokens

Tema **escuro por padrão** (sala de cinema), com tema claro no tweak. Todos os tokens são CSS custom properties em `:root`; o claro sobrescreve em `[data-theme='light']`. Acento trocável por `[data-accent]`.

### Cores — tema escuro (padrão, `:root`)

| Token | Valor | Uso |
|---|---|---|
| `--paper` | `oklch(0.155 0.010 330)` | Fundo do app |
| `--paper-2` | `oklch(0.185 0.013 332)` | Sidebar / superfícies alt |
| `--card` | `oklch(0.208 0.014 332)` | Cards, modais |
| `--card-2` | `oklch(0.182 0.012 332)` | Cards secundários |
| `--mist` | `oklch(0.255 0.030 345)` | Fundo do hero |
| `--ink` … `--ink-4` | `0.95 → 0.475` (hue 330–336) | Texto primário → muted |
| `--line` / `--line-2` | `0.305` / `0.245` (hue 334) | Bordas / divisórias |
| `--rose` | `oklch(0.655 0.205 357)` | **Acento primário** (rosa de palco) |
| `--rose-deep` | `oklch(0.755 0.165 354)` | Texto-acento sobre escuro (mais claro no dark) |
| `--rose-bright` | `oklch(0.72 0.20 354)` | Gradientes / brilho |
| `--rose-tint` / `--rose-tint-2` | rose @ 0.16 / 0.26 | Fundos suaves, seleção |
| `--gold` / `--gold-deep` | `oklch(0.815 0.135 86)` | **Estrelas / notas** |
| `--heart` | `oklch(0.68 0.20 12)` | Coração (curtir) |

> No tema escuro os sufixos `-deep` são **mais claros** que o base (texto-acento sobre fundo escuro), seguindo a convenção dos outros agents.

### Acento padrão e alternativos (tweak "Cor de acento")
Default de fábrica: **Verde-água** (`data-accent='teal'`). Variações setam `data-accent` no `<html>`:

| Tweak | `data-accent` | Hue base |
|---|---|---|
| Rosa de palco | *(nenhum)* | 357 (rosa-magenta) |
| Verde-água **(padrão)** | `teal` | 196 |
| Carmim | `carmim` | 22 |
| Âmbar | `ambar` | 66 |

Cada acento redefine `--rose*` e a escala `--heat-*`. As **estrelas (`--gold`) e o histograma de notas usam verde Letterboxd (`oklch(0.72 0.15 150)`) independentemente do acento.**

### Escala do heatmap de sessões (`--heat-0..4`)
0 = sem sessão → 4 = 4+ filmes no dia. No escuro vai de `--line-2` a `oklch(0.74 0.20 354)` (acompanha o acento).

### Tipografia

| Função | Família | Uso |
|---|---|---|
| **Display** | `DM Serif Display` | Títulos grandes, pôsteres, hero, números de stat (cara de marquise) |
| **Serif** | `Newsreader` (ital) | Reviews, notas, citações, títulos de filme em listas |
| **Sans** | `DM Sans` | UI, botões, corpo |
| **Mono** | `DM Mono` | Rótulos, datas, contagens, metadados |

### Espaçamento, raios e sombras
`--r-sm 7px` · `--r-md 11px` · `--r-lg 18px`. Sidebar 252px · topbar 56px · barra inferior 68px. Sombras `--shadow-sm/md/lg/poster` (mais densas no escuro).

---

## 4. Layout do shell (`.ak-app`)

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

Grid: `grid-template-columns: 252px 1fr; grid-template-rows: 1fr auto`. Barra inferior ocupa `grid-column: 1/3; grid-row: 2`.
**Responsivo:** ≤ 880px a sidebar colapsa para 64px (só ícones); ≤ 720px o hero vira coluna única e esconde o retrato.

### Sidebar
- **Marca**: círculo 44px com `akane-hero.png` (retrato recortado) + glow do acento; nome "Akane" (Display 20px) + "FILMES" (mono).
- **Botão `Logar filme`** (ação principal, sempre visível) → abre o modal.
- **Nav, 2 grupos:**
  - *Cinemateca*: Início · Filmes · Diário · Quero ver
  - *Coleção*: Listas · Etiquetas · Rewind
  - Cada item tem ícone + label + contagem (badge).
- **Rodapé**: "← Voltar à Makima".

### Topbar
Título da rota atual (Display) + busca pill (título ou diretor). Digitar leva para **Filmes** e filtra.

---

## 5. Data model (`data.js`)

```typescript
type Status = 'watched' | 'watchlist';   // já assisti | quero ver

interface Film {
  id: string;
  title: string; year: number; director: string;
  runtime: number;                 // minutos
  genre: string;                   // "Animação · Thriller" (separado por " · ")
  country: string;
  poster: PosterKey;               // paleta de cor (ver §6)
  status: Status;
  rating: number | null;           // 0–5 em passos de 0.5
  ratingSource: 'letterboxd' | 'own' | null;   // a nota veio do Letterboxd?
  liked: boolean;                  // coração
  people: { name: string; role: string }[];    // direção + elenco/equipe → base de pessoas
  tags: string[];                  // etiquetas
  review: string | null;           // sua crítica
  notes: string | null;            // anotações soltas (≠ review)
  vault: { type: 'video'|'article'|'essay'|'review'; title: string; source: string }[];
}

interface DiaryEntry {              // uma SESSÃO (o diário bebe da lista)
  id: string; date: string;        // YYYY-MM-DD
  filmId: string;                  // referencia Film.id
  rating: number | null;           // nota daquela sessão
  liked: boolean;
  rewatch: boolean;                // revisão?
  note: string | null;             // anotação da sessão
}

interface List { id; name; accent; desc; films: string[]; }   // coleção curada
```

### Coleções e séries derivadas
- **`FILMS`** — acervo (18 filmes seed).
- **`FAVORITES`** — `string[]` com 4 ids (vitrine do perfil; editável em runtime, ver §8.2).
- **`LISTS`** — coleções curadas (Atrizes em colapso, Cinema japonês, Romance que dói, etc.).
- **`DIARY`** — sessões em ordem decrescente de data.
- **`HEATMAP`** — `{date, count}[]` do ano (determinístico via LCG + garante ≥1 nos dias do diário). Alimenta o sparkline e `STATS`.
- **`TAGS`** — `{name, count, person}[]` derivado das tags dos filmes. `PERSON_TAGS` marca etiquetas que já apontam para uma pessoa (ex.: *Satoshi Kon*).
- **`STATS`** — IIFE que pré-calcula: `filmsWatched, sessions, rewatches, totalMinutes, avgRating, monthly[12], dist{ '0.5'..'5.0' }, byGenre, byDirector, topPeople[], topGenre, topDirector, topDecade, maxSessions, fav, liked`.

### "API" de filmes (mock TMDB)
- **`TMDB_CATALOG`** — filmes **fora** do acervo, com metadados completos (12 títulos). Representa a base/serviço externo de filmes.
- **`searchTmdb(q)`** — simula a busca: filtra por título/diretor/ano, ignora o que já está em `FILMS`, retorna até 6.
- **`addFilmFromCatalog(entry)`** — insere o resultado em `FILMS` como `status:'watched'` e devolve o objeto.

### Helpers
`filmById(id)` · `diaryFor(id)` (sessões de um filme) · `sessionsInLast(nDays)` (soma no heatmap) · `fmtRuntime(min)` (`"2h 25min"`).

> **Persistência:** tudo em memória (arrays JS), exceto **favoritos** (localStorage `akane.favorites`). Em produção, mapear para a API/banco do app.

---

## 6. Componentes de UI (`ui.jsx`)

| Componente | Descrição |
|---|---|
| **`Icon({name})`** | Ícones de linha (stroke) Lucide-style. Conjunto `ICONS` (inicio, filmes, diario, watchlist, listas, tags, rewind, rewatch, clock, user, play, doc, quote, star, link, etc.). |
| **`Heart({filled})`** | Coração preenchível (curtir). |
| **`StarShape({filled})`** | Estrela base. |
| **`Stars({value, lg})`** | Estrelas estáticas com **meia-estrela via clip** (`width: value/5*100%`). Suporta qualquer fração. |
| **`RateInput({value, onChange})`** | Seletor **interativo com meio-passo** — cada estrela tem duas metades clicáveis (`.rate-half l/r`); hover mostra preview; clique grava 0.5/1.0…; botão "limpar". |
| **`Poster({film, badge, showRating, mini})`** | **Pôster tipográfico de cinema** (sem imagem). Aspect 2:3, campo de cor por paleta, moldura interna, gênero (kicker), título em Display dimensionado pelo comprimento, diretor + ano em mono no rodapé. `badge` mostra coração (curtido) e "quero ver" (watchlist). `mini` = versão reduzida (só cor + título central, usada nas pilhas de Listas). |
| **`Heatmap({data})`** | Grade de sessões/dia agrupada por mês (definido, hoje usado só como utilitário). |
| **`Spark({data})`** | Mini sparkline (barras) — usado no card "Sessões · 7 dias". |
| **Datas** | `fmtDate`, `relDate` (hoje/ontem/N dias), `MESES`, `MESES_CURTO`, `DIAS_CURTO`. |

### Paletas de pôster (`POSTER`)
14 colorgrades de cinema: `noir, ember, rose, neon, teal, gold, ink, blood, forest, dusk, bone, slate, wine, sea`. Cada uma: `{bg, ink, accent}`. Trocar `film.poster` muda a cor.

### Estilo do pôster (tweak)
`data-postyle='minimal'` esconde moldura e kicker (só título grande). Default `tipografico`.

---

## 7. Telas (rotas)

Roteamento por estado em `app.jsx` (`route = {view, param}`). `navigate(view, param)` zera o scroll.

### 7.1 Início (`Home`)
1. **Hero** — eyebrow "Cinemateca de Akane", saudação (por hora), linha "Última sessão · *filme* · nota", citação da Akane, CTAs **Logar filme** / **Abrir diário**. Retrato **transparente** (`akane-hero.png`) centralizado com halo + drop-shadow (tratamento estilo Frieren).
2. **2 stat cards** — *Filmes · 2026* (com meta) e *Sessões · 7 dias* (sparkline + variação vs. semana anterior).
3. **`home-split`** (perfil Letterboxd, 2 colunas ≥ 980px; empilha abaixo disso):
   - **Coluna principal** (`home-main`): **`FavoriteFilms`** + **`RecentActivity`**.
   - **Coluna lateral**: **`LbPanel`** (Diário + Notas), alinhada à primeira fileira de pôsteres.
4. **Watchlist em destaque** — carrossel horizontal dos filmes "quero ver".

#### `FavoriteFilms({navigate, favorites, setFavorites})` — **editável**
- Cabeçalho de seção com régua + link **Editar / Concluir**.
- 4 pôsteres favoritos. Em **modo edição**: cada slot ganha **× (remover)**; havendo < 4, aparece o slot **＋ Adicionar** → abre `FavPicker`.
- `FavPicker` — modal com busca entre os **filmes vistos** (exclui os já favoritos); clicar adiciona.
- Estado mora no `Home` e **persiste em `localStorage['akane.favorites']`**; fallback para `FAVORITES`.

#### `RecentActivity({navigate})`
4 últimas entradas do diário como pôsteres, com **marcadores abaixo**: estrelas (com meia), coração (se curtido), loop de revisão, ícone de anotação. Link **Tudo →** para o Diário.

#### `LbPanel({navigate})` — sidebar de perfil
- Bloco **Diário** — entradas agrupadas por mês (chip mês/ano + dia + título clicável), limitado a ~9 linhas; contagem total no canto.
- Bloco **Notas** — **histograma de notas (0,5–5,0)** com meia-estrela verde à esquerda e 5 estrelas verdes à direita (widget RATINGS do Letterboxd).

### 7.2 Filmes (`Catalog`) — a LISTA
Grade de pôsteres. Chips de filtro: **Todos / Vistos / Curtidos / Quero ver / Com nota**. Ordenação (tweak): Recentes (data no diário) / Nota / Título / Diretor / Ano / Duração. Abaixo de cada pôster: título, diretor·ano, estrelas+coração ou "quero ver". Também é a tela de **etiqueta** (quando `tag` é passado: header "#tag" + voltar).

### 7.3 Diário (`Diary`) — tabela cronológica
Estilo diário do Letterboxd, agrupado por **mês/ano**. Cada linha: **dia + dia-da-semana**, mini-pôster, título·ano, anotação em itálico, e marcadores (estrelas / coração / loop de revisão). Distinta da lista: mostra **cada sessão**.

### 7.4 Detalhe do filme (`FilmDetail`)
Coluna esquerda **sticky**: pôster grande + ações:
- **Logar filme** (abre modal pré-selecionado).
- Toggles **Curtir** (coração) e **Quero ver / Na lista** (alterna `status`/`liked` em runtime).

Coluna direita:
- Gênero (kicker), título (Display), "ano · dirigido por **X** · duração · país".
- **Linha de nota**: estrelas grandes + valor, coração, selo **via Letterboxd** (se `ratingSource`), pill de status (Visto/Quero ver).
- **Grade de metadados** (direção, ano, duração, país, sessões).
- **Sua review** (Newsreader itálico, filete dourado).
- **Anotações** — bloco "caderno" (filete do acento), separado da review.
- **Cofre de conteúdos** — galeria de cards por tipo (**vídeo / artigo / ensaio / review**) com thumb colorida, ícone do tipo, título e domínio + "abrir →", mais um card **＋ Salvar conteúdo**. (`VAULT_META` define rótulo/ícone/cor por tipo.)
- **Etiquetas** — chips clicáveis (→ tela da etiqueta); etiquetas de pessoa ganham glifo de pessoa.
- **Diário deste filme** — timeline das sessões daquele filme (data, nota, revisão, nota textual).

### 7.5 Quero ver (`Watchlist`)
Lista vertical: pôster, título/diretor/duração/país, chip de gênero, anotação, e botão **Já vi** (→ loga). Mostra total de horas "esperando".

### 7.6 Listas (`Lists` / `ListView`)
Grid de coleções curadas; cada card mostra uma **pilha de mini-pôsteres** (`Poster mini`), barra de acento, nome, descrição e contagem. `ListView` abre a coleção como grade de pôsteres.

### 7.7 Etiquetas (`Tags`)
Nuvem de chips com contagem. Etiquetas de pessoa (ex.: *Satoshi Kon*) recebem glifo e nota: **vão se conectar à base de pessoas em breve**. Clicar filtra os Filmes por aquela etiqueta.

### 7.8 Rewind (`Rewind`) — o ano em revista
- Hero "Rewind 2026" + linha-resumo.
- **4 totais**: filmes vistos, sessões, horas assistidas, revisões.
- **Sessões por mês** (barras).
- **Histograma de notas** 0,5–5,0.
- **Destaques**: filme favorito, maior maratona (sessões no mesmo dia), década mais vista, nota média.
- **Top gêneros** e **Top diretores** (ranks com avatar de iniciais).
- **Pessoas que marcaram o ano** (direção + elenco + equipe) — preparando o **link com a base de pessoas**.

---

## 8. Interações-chave

### 8.1 Modal "Logar filme" (`LogModal`) — `logmodal.jsx`
Princípio: **abrir, logar, sair**. A **busca é o caminho principal** (quase todo filme logado é novo).

- **Busca (primária)** — campo no topo, em foco, com placeholder de exemplo. Debounce de ~480ms + **estado de "buscando…"** (spinner) simulando a API (`searchTmdb`). Cada resultado mostra pôster + metadados + **Logar este** → `addFilmFromCatalog` adiciona à base, seleciona e fecha a busca.
- **Alvo do log** — card que mostra **qual filme vai para o diário** (atualiza ao buscar/escolher).
- **Seletor secundário recolhível** — `<details>` "Ou escolha um que já está na sua base" com os pôsteres do acervo (raro: logar algo repetido).
- **Quando você viu?** (data, default hoje) · **Sua nota** (`RateInput` meia-estrela).
- **Marcadores** — Curtir (coração) / Revisão (loop).
- **Anotação** (opcional).
- Atalhos: **⌘↵ loga**, **Esc fecha**, clique no scrim fecha.
- `onSave` → `addLog` (em `app.jsx`): cria a entrada no `DIARY`, ordena por data, vira `watched` se era watchlist, grava nota/`ratingSource:'own'`/coração no filme, incrementa o heatmap e dispara o toast.

### 8.2 Favoritos editáveis
Ver §7.1 — Editar → remover/adicionar (via `FavPicker`) → persiste em `localStorage`.

### 8.3 Barra "Próxima sessão" (`NextBar`)
Rodapé full-width: planeja a próxima da watchlist. Pôster + título/diretor/ano/duração, setas pra alternar entre os "quero ver", botão **Já vi** (→ loga). Some se a watchlist estiver vazia.

### 8.4 Toast (`Toast`)
Confirmação flutuante ("Filme logado no diário" / "Revisão logada no diário"), some em 2,6s.

---

## 9. Tweaks (`app.jsx` + `tweaks-panel.jsx`)

Painel flutuante acionado pelo host. Defaults de fábrica (`TWEAK_DEFAULTS`):

| Tweak | Tipo | Opções | Default |
|---|---|---|---|
| **Tema** | Radio | Escuro / Claro | Escuro |
| **Cor de acento** | Radio | Rosa de palco / Carmim / Âmbar / Verde-água | **Verde-água** |
| **Densidade** | Radio | Grande / Médio / Compacto | **Compacto** |
| **Estilo do pôster** | Radio | Tipográfico / Minimal | Tipográfico |
| **Ordenação** | Select | Recentes / Nota / Título / Diretor / Ano / Duração | Recentes |

Aplicação: tema → `data-theme` no `<html>`; acento → `data-accent`; densidade → `data-density` na `.ak-app` (`--cover-w` 198/162/120px); pôster → `data-postyle`.

---

## 10. Assets

| Asset | Arquivo | Uso |
|---|---|---|
| Retrato (recortado) | `akane/akane-hero.png` | Hero (transparente, halo + drop-shadow) e marca na sidebar |
| Retrato (original) | `akane/akane.png` | Fonte (já vinha com fundo transparente; `akane-hero.png` é o recorte pro contorno) |

Os **pôsteres são tipográficos** (sem imagens) — coesos e resistentes a link quebrado. Para suportar pôster real no futuro, adicionar `posterUrl` ao `Film` e renderizar `<img>` sobre o campo de cor.

---

## 11. Arquivos

```
Akane - Filmes.html      ← shell (carrega fontes, React, Babel e os módulos)
akane/
  styles.css             ← design system completo (tokens claro/escuro + acentos + componentes)
  data.js                ← modelo, seed, STATS, "API" mock (searchTmdb/addFilmFromCatalog)
  ui.jsx                 ← Icon, Heart, Stars, RateInput, Poster, Heatmap, Spark, datas
  screens-a.jsx          ← Home, FavoriteFilms, FavPicker, RecentActivity, LbPanel, Catalog, FilmDetail
  screens-b.jsx          ← Diary, Watchlist, Lists, ListView, Tags, Rewind
  logmodal.jsx           ← LogModal (busca-primária), NextBar, Toast
  app.jsx                ← shell, nav, roteamento, tweaks, addLog
  akane-hero.png         ← retrato recortado
tweaks-panel.jsx         ← painel de tweaks (compartilhado, na raiz)
```

Ordem de carregamento: `data.js` (plain) → `ui.jsx` → `tweaks-panel.jsx` → `screens-a.jsx` → `screens-b.jsx` → `logmodal.jsx` → `app.jsx`. Componentes são expostos em `window` via `Object.assign` ao fim de cada arquivo (escopos Babel separados).

---

## 12. Notas de implementação

1. **Oklch** em todos os tokens — checar suporte do browser-alvo (Chrome 111+, FF 113+, Safari 15.4+).
2. **Lista vs Diário** é o coração do modelo — manter a separação ao mapear para o backend. O heatmap e o Rewind são **derivados** do diário.
3. **Nota pode ou não vir do Letterboxd** (`ratingSource`); ao logar manualmente vira `'own'`. O selo "via Letterboxd" só aparece quando `ratingSource === 'letterboxd'`.
4. **Notas ≠ review** — campos separados (anotações soltas vs. crítica).
5. **Cofre de conteúdos** — `vault[]` por filme. Os links do mock apontam para `#`; em produção, salvar URL real + (opcional) thumbnail.
6. **Tags → pessoas** — `PERSON_TAGS` e `people[]`/`topPeople` já preparam a ligação com a futura **base de pessoas**; cada pessoa deve abrir um perfil próprio.
7. **"API" de filmes** — `searchTmdb` é mock determinístico com latência simulada; trocar por chamada real (TMDB/Letterboxd) mantendo a mesma UI do `LogModal`.
8. **Persistência** — favoritos em `localStorage['akane.favorites']`; o resto em memória. Migrar para a API por usuário.
9. **Acessibilidade rápida** — modal foca a busca, aceita Enter (⌘↵) e Esc; alvos de toque ≥ 44px nos botões principais.
