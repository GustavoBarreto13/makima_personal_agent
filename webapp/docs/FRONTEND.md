# Frontend

## Stack

| Tecnologia | Versão | Papel |
|---|---|---|
| React | 19 | Framework de UI |
| TypeScript | ~5.8 (strict) | Tipagem estática |
| Vite | 6 | Bundler / dev server |
| react-router-dom | 7 | Roteamento client-side |
| Tailwind CSS | 3 | Utilitários CSS (nas páginas legadas e no `Layout` global) |
| PostCSS + autoprefixer | — | Processamento do Tailwind |
| @dnd-kit (core/sortable/utilities) | 6/10/3 | Drag-and-drop (shell Kaguya: listas, Kanban, Eisenhower) |
| react-markdown + remark-gfm | 10/4 | Renderização das notas Markdown de tarefas (shell Kaguya) |
| Vitest | 4 | Testes unitários (`npm run test` — ex.: parser de quick-add da Kaguya) |

**Sem bibliotecas de chart ou de data.** Todos os gráficos (donut, sparkline, barras, área, heatmap,
estrelas) são SVG/CSS escritos à mão. Todas as datas usam `Intl` / `toLocaleDateString('pt-BR', …)`
nativos do browser (ou os helpers próprios de cada shell, como `kaguya/lib/dateUtils.ts`).

**Sem Redux, Zustand ou React Query.** Estado local por `useState` + `useEffect`. Cada shell carrega
seus dados no mount e passa para os filhos via props; mutações refazem a carga local.

## Estrutura de arquivos relevante

```
webapp/frontend/
├── package.json              # npm scripts e dependências
├── vite.config.ts            # proxy de dev e plugins
├── tsconfig*.json            # configuração TypeScript (strict + noUnusedLocals)
├── tailwind.config.js        # tokens de cor por personagem, fontes
├── index.html                # carrega Google Fonts e o entry point React
└── src/
    ├── main.tsx              # createRoot + StrictMode
    ├── App.tsx               # verificação de auth (/auth/me) + BrowserRouter + rotas
    ├── lib/
    │   └── api.ts            # fetch tipado (api, violetApi, booksApi)
    ├── components/
    │   └── Layout.tsx        # sidebar Makima (legado) + área de conteúdo
    ├── pages/
    │   ├── Login.tsx         # tela de login (botão Google)
    │   ├── nami/             # shell de finanças (Nami)
    │   ├── violet/           # shell de diário (Violet)
    │   ├── frieren/          # shell de livros (Frieren)
    │   ├── kaguya/           # shell de tarefas/agenda (Kaguya)
    │   ├── akane/            # shell de filmes (Akane)
    │   ├── marin/            # shell de animes (Marin)
    │   ├── mai/              # shell de séries de TV (Mai)
    │   ├── komi/             # shell de pessoas (Komi)
    │   ├── makima/           # shell do Hub — rota / em tela cheia (Makima)
    │   └── *.tsx             # páginas legadas de finanças (Transactions, Accounts, etc.)
    └── public/               # imagens copiadas para dist/ pelo Vite
        ├── nami.jpg / nami.png / nami-hero.png
        ├── violet.png
        ├── frieren.png
        ├── kaguya.jpg
        ├── akane.png
        ├── marin.png
        ├── mai.png
        ├── komi.png
        └── makima.png
```

## Inicialização e autenticação

`App.tsx` faz `GET /auth/me` na montagem. Se receber `401` (não logado), renderiza `<Login />`
(tela de login). Caso contrário monta o `<BrowserRouter>` com todas as rotas.

```tsx
// App.tsx (simplificado)
const [user, setUser] = useState(null);

useEffect(() => {
  fetch("/auth/me", { credentials: "include" })
    .then(r => r.ok ? r.json() : null)
    .then(data => setUser(data));
}, []);

if (!user) return <Login />;
return <BrowserRouter>...</BrowserRouter>;
```

## Rotas

Na ordem de registro do `App.tsx` (os shells vêm **antes** do catch-all `/*`):

```
/books/*         → FrierenShell   (livros)
/journal/*       → VioletShell    (diário pessoal)
/nami/*          → NamiShell      (finanças — canônico)
/tasks/*         → KaguyaShell    (tarefas + agenda)
/movies/*        → AkaneShell     (filmes)
/animes/*        → MarinShell     (animes)
/series/*        → MaiShell       (séries de TV)
/people/*        → KomiShell      (pessoas e contatos)
/                → MakimaShell    (Hub — tela cheia, SEM Layout global)
/transactions    → Transactions   (legado — não linkado na sidebar)
/accounts        → Accounts       (legado — não linkado na sidebar)
/cards           → Cards          (legado — não linkado na sidebar)
/loans           → Loans          (legado — não linkado na sidebar)
/budgets         → Budgets        (legado — não linkado na sidebar)
/subscriptions   → Subscriptions  (legado — não linkado na sidebar)
```

> **Páginas legadas:** as rotas `/transactions`, `/accounts`, `/cards`, `/loans`, `/budgets`
> e `/subscriptions` ainda existem no React Router (dentro do `Layout` global) mas **não
> aparecem na sidebar** do app. A rota `/` deixou de ser o Dashboard de finanças — hoje ela
> renderiza o `MakimaShell` (Hub). `Dashboard.tsx` ainda existe em `pages/` mas não está
> mais roteado. O shell Nami (`pages/nami/`) é a implementação canônica e atual das finanças.

## Os nove shells

Cada domínio implementado tem um "shell": um componente raiz que cuida da navegação interna,
carregamento de dados, theming e modais. Eles **não usam React Router internamente** — o roteamento
dentro de cada shell é por estado interno ou hash de URL (exceção: o `MakimaShell` é uma tela
única, sem navegação interna).

---

### NamiShell — Finanças (`src/pages/nami/`)

**Roteamento:** deep-link por hash (`/nami#dashboard`, `/nami#transacoes`, `/nami#contas`…).
O shell lê `window.location.hash` na montagem e ao navegar usa `history.replaceState`.

**Telas (screens/):**

| Hash | Tela | O que mostra |
|---|---|---|
| `#dashboard` | Dashboard | Hero (valor líquido), QuickAdd, 4 stat-cards, gráficos cashflow + donut, contas, compromissos, orçamentos, transações recentes |
| `#transacoes` | Transactions | Transações agrupadas por dia com busca e filtros |
| `#contas` | Accounts | Lista de contas com saldo |
| `#cartoes` | Cards | Cartões de crédito com fatura e limite |
| `#orcamentos` | Budgets | Envelopes de orçamento por categoria |
| `#assinaturas` | Subscriptions | Assinaturas recorrentes |
| `#emprestimos` | Loans | Empréstimos pessoais (pessoa a pessoa) |
| `#financiamentos` | Financings | Financiamentos bancários |

**Componentes notáveis (nami/):**

| Arquivo | O que faz |
|---|---|
| `components/CashflowChart.tsx` | Barras duplas SVG (receitas/despesas por mês) |
| `components/DonutChart.tsx` | Donut chart SVG puro para breakdown de categorias |
| `components/QuickAdd.tsx` | Barra inline de lançamento rápido de transação |
| `components/TxRow.tsx` | Linha de transação com ícone de categoria e valor formatado |
| `components/LoanCard.tsx` | Card de empréstimo/financiamento com indicador de parcelas |
| `modals/AddModal.tsx` | Modal de nova transação |
| `modals/FormModal.tsx` | Modal genérico orientado a schema |
| `modals/IconField.tsx` | Campo para upload ou URL de ícone |
| `namiApi.ts` | Cliente de API para todos os endpoints `/api/finances/*` |
| `lib.ts` | Adaptadores de dados: `normalizeTx`, `groupByDay`, `buildCatMap`, `filterTxs`, etc. |
| `ui.tsx` | Componentes de exibição: `Money`, `BigMoney`, `CatBadge`, `Donut`, `Spark`, `CashflowBars` + helpers de data |
| `Toast.tsx` | Toast de feedback (sucesso/erro) |
| `TweaksPanel.tsx` | Painel de personalização (tema, acento, densidade, privacidade) |

**Upload de ícone:** `namiApi.ts` usa `fetch` cru com `FormData` (não o wrapper `api`) porque o
wrapper typed não suporta `multipart/form-data`.

---

### VioletShell — Diário (`src/pages/violet/`)

**Roteamento:** estado interno `{view, param}`. Não usa hash nem React Router internamente.

**Telas (screens/):**

| View | Tela | O que mostra |
|---|---|---|
| `write` | Write | Bullet journal do dia; bullets tipados + campo dream |
| `journal` | Journal (Arquivo) | Entradas do passado agrupadas por mês, com busca |
| `reflect` | Reflect | Cartões de reflexão inspiracionais (prompts Violet) |
| `insights` | Insights | Heatmap anual + gráfico de área + big numbers + 7 tabs |
| `dreams` | Dreams | Todas as entradas com `dream` preenchido |
| `highlights` | Highlights | Coleção de bullets do tipo `highlight` |
| `ideas` | Ideas | Coleção de bullets do tipo `idea` |
| `wisdom` | Wisdom | Coleção de bullets do tipo `wisdom` |
| `notes` | Notes | Coleção de bullets do tipo `note` |
| `tags` | Tags | Nuvem de `#tags` por frequência |
| `people` | People | Grid de `@pessoas` mencionadas com avatar de iniciais |
| `tutor` | Tutor | Progresso do Tutor de Idiomas (spec 031): skills por conceito, nível CEFR, próximo foco e guia de estudo |

**Tutor de Idiomas (spec 031 — persona Kurisu):** botão discreto (`.tt-icon-btn`, ícone
`sparkles`) em cada bullet do `Write.tsx` pede uma análise de escrita via
`violetApi.analyzeTutor`; o resultado abre em `components/TutorModal.tsx` (correção,
reescrita natural, erros por conceito, resumo e nota). Bullets já analisados ganham um
toggle inline (`.tt-toggle-btn`) para alternar entre o texto original (nunca sobrescrito)
e a versão corrigida, buscada sob demanda via `violetApi.bulletAnalysis`. A tela `Tutor`
(sidebar, ícone `graduation`) mostra a barra de maestria + glyph de tendência (📈/📉/➡️)
por conceito, o nível CEFR estimado, a sugestão de próximo foco e o formulário do guia
de estudo (US4) — todos os endpoints em `violetApi.tutor*`/`*TutorGuide`.

**Componentes de UI (violet/ui/):**

| Arquivo | O que faz |
|---|---|
| `AreaChart.tsx` | Gráfico de área SVG com curva Catmull-Rom→Bezier (12 pontos mensais) |
| `HeatmapRow.tsx` | Heatmap estilo GitHub — grid anual de atividade de bullets por dia |
| `RichText.tsx` | Parser de `@pessoa` e `#tag` em spans clicáveis |
| `Icon.tsx` | Set de ícones SVG inline |

---

### FrierenShell — Livros (`src/pages/frieren/`)

**Roteamento:** estado interno `{view, param}`. Não usa hash nem React Router internamente.

**Telas (screens/):**

| View | Tela | O que mostra |
|---|---|---|
| `home` | Home | Hero com stats + heatmap de páginas + "agora lendo" + atividade recente |
| `catalogo` | Catálogo (Biblioteca) | Lista de todos os livros com filtros e ordenação |
| `lendo` | Lendo | Livros em leitura agora |
| `querler` | Quero ler | Lista to-read |
| `wishlist` | Wishlist | Lista de desejos com links para lojas |
| `listas` | Estantes | Estantes personalizadas do usuário |
| `atividade` | Atividade | Diário de leitura por data |
| `resenhas` | Resenhas | Avaliações dos livros lidos |
| `stats` | Stats | "Ano em revisão" — estatísticas anuais de leitura |
| `detalhe` | Detalhe | Página individual do livro (log, histórico, estantes) |

**Componentes de UI (frieren/ui/):**

| Arquivo | O que faz |
|---|---|
| `Cover.tsx` | Capa do livro: fotográfica (se houver URL) ou tipográfica (paleta determinística) |
| `Heatmap.tsx` | Heatmap de páginas lidas por dia, organizado por mês em grid 7×N |
| `ProgressBar.tsx` | Barra de progresso de leitura |
| `Spark.tsx` | Sparkline de barras verticais |
| `Stars.tsx` | Avaliação em estrelas fracionárias via clip SVG |
| `Icons.tsx` | Set de ícones SVG inline |

---

### KaguyaShell — Tarefas e agenda (`src/pages/kaguya/`)

**Roteamento:** estado interno `{view, param}` (tipo `KaguyaView` em `types.ts`). O maior shell
do app: sidebar própria com listas/grupos, smart-lists, Command Palette (⌘K) e TweaksPanel.

**Telas (screens/):**

| View | Tela | O que mostra |
|---|---|---|
| `today` | TodayScreen | Meu Dia — plano do dia, pendências de ontem, sugestões, capacity bar e time-blocking |
| `list` | ListScreen | Tarefas da lista em árvore (subtarefas, quick-add com datas/recorrência/#tags, atalhos de teclado) |
| `group-list` | GroupListScreen | Tarefas de todas as listas de um grupo, em visão de lista |
| `kanban` | KanbanScreen | Board Kanban da lista, com views configuráveis (spec 024) |
| `group` | GroupBoardScreen | Board agregado do grupo — colunas de mesmo nome unificadas (spec 025) |
| `calendar` | CalendarScreen | Calendário mês/semana: tarefas datadas, ocorrências virtuais e eventos Google (Calendar Hub) |
| `eisenhower` | EisenhowerScreen | Matriz 2×2 urgência × prioridade com drag-and-drop |
| `habits` | HabitsScreen | Hábitos com anel de consistência, check-in de hoje e heatmap anual |
| `experiments` | ExperimentsScreen / ExperimentDetailScreen | Tiny Experiments (spec 029): aderência, check-ins, pausa/retomada e revisão |
| `goals` | GoalsScreen / GoalDetailScreen | Metas (spec 030): agrupadas por área da vida, métrica, marcos e movimentos vinculados |
| `filter` | FilterScreen | Smart-list salva (filtros), com aviso de referência órfã |
| `trash` | TrashScreen | Lixeira — restaurar tarefas soft-deletadas |

**Particularidades:**
- **DnD** com `@dnd-kit` (única dependência de drag-and-drop do app) — árvore de tarefas, Kanban e Eisenhower.
- **Inputs custom obrigatórios:** `DatePicker`/`TimePicker`/`MiniCalendar` no lugar dos nativos
  (ver "Padrões do frontend" em `webapp/CLAUDE.md`).
- **Notas Markdown** por tarefa (`MarkdownNotesEditor` + `react-markdown`/`remark-gfm`), com
  chips `[[id|Título]]` que reabrem tarefas mencionadas. No `TaskModal` o editor é
  **redimensionável** (divisor arrastável entre formulário e notas) e **colapsável**
  (fechar → modal só de formulário; reabrir pelo ícone de nota no cabeçalho) — largura e
  estado ficam em `localStorage` (`kg:notes:width`, `kg:notes:collapsed`). Na lista, a
  descrição **não** aparece como texto: a linha mostra só o ícone `note` (abre o modal).
- **Preferências** em `localStorage`: `kg-tweaks` (tema etc.) e `kaguya:kanban:last-list`
  (última lista aberta no Kanban).
- API: `kaguyaApi.ts` — todos os `/api/tasks/*`.

---

### AkaneShell — Filmes (`src/pages/akane/`)

**Roteamento:** estado interno `{view, param}` (tipo `AkaneView` em `types.ts`).

**Telas (screens/):**

| View | Tela | O que mostra |
|---|---|---|
| `home` | HomeScreen | Blocos do início: favoritos, atividade recente, destaque da watchlist, histograma de notas |
| `films` | FilmsScreen | Catálogo de filmes com filtros (status, gênero, etiqueta) e ordenações |
| `diary` | DiaryScreen | Diário de sessões de visualização |
| `watchlist` | WatchlistScreen | Filmes a assistir |
| `lists` / `list` | ListsScreen | Listas/coleções de filmes (grade e detalhe de uma lista) |
| `tags` | TagsScreen | Nuvem de etiquetas com contagem |
| `rewind` | RewindScreen | Retrospectiva do ano (year-in-review) |
| `stats` | StatsScreen | Estatísticas anuais |
| `detail` | MovieDetailScreen | Detalhe do filme: nota, curtir, status, Cofre e diário |

**Particularidades:** busca de filmes no TMDB no modal de adição (`/api/movies/tmdb/search`);
botão de sync com o Letterboxd (`POST /api/movies/sync-letterboxd`); preferências em
`localStorage` (`akane-tweaks`). API: `akaneApi.ts` — todos os `/api/movies/*`.

---

### MarinShell — Animes (`src/pages/marin/`)

**Roteamento:** estado interno `{view, param}` (tipo `MarinView` no próprio `MarinShell.tsx`).

**Telas (screens/ + raiz):**

| View | Tela | O que mostra |
|---|---|---|
| `home` | HomeScreen | Blocos agregados: última sessão, assistindo agora, próximos episódios, watchlist |
| `catalogo` | CatalogScreen | Catálogo de animes com filtros e ordenação |
| `diario` | DiaryScreen | Histórico de sessões de episódios |
| `watchlist` | WatchlistScreen | Fila "quero assistir" |
| `lancamentos` | ScheduleScreen | Schedule de episódios futuros dos animes em progresso |
| `stats` | StatsScreen | Estatísticas do ano |
| `detalhe` | AnimeDetail.tsx | Detalhe do anime: episódios paginados, log de sessão, nota (escala MAL 0–10) |

**Particularidades:** sync com o MyAnimeList (`POST /api/animes/sync`, delta ou full); metadados
via Jikan/AniList; preferências em `localStorage` (`mr-tweaks`) com `data-theme` claro/escuro.
API: `marinApi.ts` — todos os `/api/animes/*`.

---

### MaiShell — Séries de TV (`src/pages/mai/`)

**Roteamento:** estado interno `{view, param}` (tipo `MaiView` em `types.ts`).

**Telas (screens/):**

| View | Tela | O que mostra |
|---|---|---|
| `home` | HomeScreen | Blocos do início: assistindo agora, próximos episódios, favoritas |
| `catalog` | CatalogScreen | Catálogo de séries com filtros e pôsteres |
| `diary` | DiaryScreen | Diário de sessões |
| `watchlist` | WatchlistScreen | Séries "quero assistir" |
| `upcoming` | UpcomingScreen | Próximos episódios das séries em andamento |
| `stats` | StatsScreen | Estatísticas anuais |
| `detail` | DetailScreen | Detalhe da série: temporadas em acordeão (`SeasonAccordion`) com toggle de episódio/temporada |
| `search` | — (AddSeriesModal) | Busca no TMDB para adicionar série |

**Particularidades:** metadados via TMDB API v4 (Bearer); re-sync de metadados por série
(`POST /api/series/{id}/sync-metadata`); preferências em `localStorage` (`mai-tweaks`, com
densidade `compact|medium|cozy`). API: `maiApi.ts` — todos os `/api/series/*`.

---

### KomiShell — Pessoas (`src/pages/komi/`)

**Roteamento:** estado interno `{view, param}` (tipo `KomiView` no próprio `KomiShell.tsx`).

**Telas (screens/):**

| View | Tela | O que mostra |
|---|---|---|
| `home` | Home | Visão geral (`/api/people/overview`): cards por domínio, sugestões de reconexão, datas próximas |
| `grid` | Directory | Diretório de todas as pessoas (cards com avatar e contagem de vínculos) |
| `dates` | UpcomingDates | Datas importantes próximas (aniversários etc.) |
| `person` | PersonPage | Perfil da pessoa: apelidos, datas e vínculos cross-agent (finanças, tarefas, livros, diário) |

**Particularidades:** upload de avatar (`POST /api/people/uploads/avatar`, multipart);
`PersonModal` de criação/edição; preferências em `localStorage` (`km-tweaks`) com `data-theme`.
API: `komiApi.ts` — todos os `/api/people/*`.

---

### MakimaShell — Hub (`src/pages/makima/`)

**Roteamento:** nenhum — é uma tela única na rota exata `/`, renderizada em **tela cheia,
sem o `Layout` global** (spec 023).

**O que mostra:** hero editorial + 8 cards de agente (Nami, Frieren, Komi, Violet, Kaguya,
Mai, Marin, Akane), cada um com 2 stats reais vindos de `GET /api/hub/summary` (uma única
chamada no mount). Stat ausente/carregando/falho vira "—" (fallback gracioso). Os cards
navegam para as rotas dos shells via `<Link>` (SPA, sem reload).

**Particularidades:** tema dark/light persistido em `localStorage` (`makima-hub-theme`,
default dark); todo o CSS vive sob a classe raiz `.mkA` (zero vazamento); dados estáticos
do roster em `data.ts`. API: `makimaApi.ts` — só o `/api/hub/summary`.

## Cliente de API

Todos os domínios compartilham o mesmo mecanismo base em `src/lib/api.ts`:

```ts
// lib/api.ts (simplificado)
const api = {
  get: (url: string) => fetch(url, { credentials: "include" }).then(parse),
  post: (url: string, body: unknown) =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
                 body: JSON.stringify(body), credentials: "include" }).then(parse),
  // patch, put, del — mesmo padrão
};
```

`credentials: "include"` garante que o cookie `makima_session` seja enviado em toda requisição.
Em erros HTTP (`!response.ok`), o wrapper lança `Error("HTTP <status>")`.

**Clientes por domínio:**

| Objeto | Onde | Endpoints cobertos |
|---|---|---|
| `api` | `lib/api.ts` | base; reexportado para usos avulsos |
| `violetApi` | `lib/api.ts` | todos os `/api/journal/*` |
| `booksApi` | `lib/api.ts` | todos os `/api/books/*` |
| `namiApi` | `pages/nami/namiApi.ts` | todos os `/api/finances/*` |
| `kaguyaApi` | `pages/kaguya/kaguyaApi.ts` | todos os `/api/tasks/*` |
| `akaneApi` | `pages/akane/akaneApi.ts` | todos os `/api/movies/*` |
| `marinApi` | `pages/marin/marinApi.ts` | todos os `/api/animes/*` |
| `maiApi` | `pages/mai/maiApi.ts` | todos os `/api/series/*` |
| `komiApi` | `pages/komi/komiApi.ts` | todos os `/api/people/*` |
| `makimaApi` | `pages/makima/makimaApi.ts` | `/api/hub/summary` |

**`uploadIcon`** em `namiApi.ts` usa `fetch` cru com `FormData` (o wrapper não suporta multipart).

## Theming e personagens

Cada shell tem identidade visual própria baseada num personagem de anime:

| Shell | Personagem | Imagem | Arquivo CSS | Classe raiz |
|---|---|---|---|---|
| NamiShell | Nami (One Piece) | `nami.jpg`, `nami-hero.png` | `nami.css` | `.nami-app` |
| VioletShell | Violet Evergarden | `violet.png` | `violet.css` | `.vl-app` |
| FrierenShell | Frieren Beyond Journey's End | `frieren.png` | `frieren.css` | `.frieren-shell` (+ `.fr-app` interno) |
| KaguyaShell | Kaguya (Kaguya-sama: Love is War) | `kaguya.jpg` | `kaguya.css` | `.kg-app` |
| AkaneShell | Akane Kurokawa (Oshi no Ko) | `akane.png` | `akane.css` | `.akane-shell` (+ `.ak-app` interno) |
| MarinShell | Marin Kitagawa (Sono Bisque Doll) | `marin.png` | `marin.css` | `.marin-shell` |
| MaiShell | Mai Sakurajima (Seishun Buta Yarou) | `mai.png` | `mai.css` | `.mai-shell` |
| KomiShell | Komi Shouko (Komi-san) | `komi.png` | `komi.css` | `.km-app` |
| MakimaShell | Makima (Chainsaw Man) | `makima.png` | `makima.css` | `.mkA` |

**Como o theming funciona:**
1. Cada CSS de personagem define tokens OKLCH ou variáveis CSS sob a classe raiz.
2. O shell aplica atributos `data-*` no elemento raiz:
   - NamiShell: `data-theme="dark|light"`, `data-acento="Tangerina|Azul-maré|Coral|Ouro"`,
     `data-privacy` (embaralha valores `.amount`), `data-density`.
   - VioletShell: `data-theme`, `data-acento` (sapphire/gold/emerald/garnet como variáveis OKLCH
     injetadas por JS), `modo-foco`, `modo-amplo`, `tipo-tecnica`.
   - FrierenShell: `data-theme`, `data-density`.
   - Shells novos (Kaguya, Akane, Marin, Mai, Komi, Makima): `data-theme` dark/light aplicado
     na classe raiz; densidade onde houver (ex.: Mai).
3. Preferências são persistidas em `localStorage` (chaves `nami:*`, `vl-tweaks`, `fr-tweaks`,
   `kg-tweaks`, `akane-tweaks`, `mr-tweaks`, `mai-tweaks`, `km-tweaks`, `makima-hub-theme`).

**Tokens Tailwind para cores de personagem** (`tailwind.config.js`):
`c-makima`, `c-nami`, `c-frieren`, `c-kaguya`, `c-kurisu`, `c-journal`.
São usados nas páginas legadas e no `Layout` global; os shells modernos usam os tokens OKLCH
dos seus próprios arquivos CSS. O token `c-kurisu` existe mas o shell desse domínio ainda não
foi construído.

## Build e desenvolvimento

Scripts disponíveis em `webapp/frontend/`:

```bash
# Modo de desenvolvimento — HMR no localhost:5173
npm run dev

# Build de produção — compila TS + gera dist/
npm run build      # executa: tsc -b && vite build

# Pré-visualização do build (sem dev server)
npm run preview
```

A saída do build vai para `webapp/frontend/dist/` e é servida pelo FastAPI em produção.
O `dist/` não é commitado no git (veja `.gitignore`).
