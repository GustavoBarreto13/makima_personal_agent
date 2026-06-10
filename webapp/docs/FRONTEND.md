# Frontend

## Stack

| Tecnologia | Versão | Papel |
|---|---|---|
| React | 19 | Framework de UI |
| TypeScript | ~5.8 (strict) | Tipagem estática |
| Vite | 6 | Bundler / dev server |
| react-router-dom | 7 | Roteamento client-side |
| Tailwind CSS | 3 | Utilitários CSS (nas páginas legadas e shell Makima) |
| PostCSS + autoprefixer | — | Processamento do Tailwind |

**Sem bibliotecas de chart ou de data.** Todos os gráficos (donut, sparkline, barras, área, heatmap,
estrelas) são SVG/CSS escritos à mão. Todas as datas usam `Intl` / `toLocaleDateString('pt-BR', …)`
nativos do browser.

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
    │   └── *.tsx             # páginas legadas de finanças (Dashboard, Transactions, etc.)
    └── public/               # imagens copiadas para dist/ pelo Vite
        ├── nami.jpg
        ├── nami-hero.png
        ├── violet.png
        └── frieren.png
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

```
/nami/*          → NamiShell      (finanças — canônico)
/journal/*       → VioletShell    (diário pessoal)
/books/*         → FrierenShell   (livros)
/                → Dashboard      (legado — não linkado na sidebar)
/transactions    → Transactions   (legado — não linkado na sidebar)
/accounts        → Accounts       (legado — não linkado na sidebar)
/cards           → Cards          (legado — não linkado na sidebar)
/loans           → Loans          (legado — não linkado na sidebar)
/budgets         → Budgets        (legado — não linkado na sidebar)
/subscriptions   → Subscriptions  (legado — não linkado na sidebar)
```

> **Páginas legadas:** as rotas `/`, `/transactions`, `/accounts`, `/cards`, `/loans`, `/budgets`
> e `/subscriptions` ainda existem no React Router mas **não aparecem na sidebar** do app.
> A sidebar Makima (`components/Layout.tsx`) aponta para `/nami` (e hash sub-rotas), `/books` e
> `/journal`. O shell Nami (`pages/nami/`) é a implementação canônica e atual das finanças.

## Os três shells

Cada domínio implementado tem um "shell": um componente raiz que cuida da navegação interna,
carregamento de dados, theming e modais. Eles **não usam React Router internamente** — o roteamento
dentro de cada shell é por estado interno ou hash de URL.

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

**`uploadIcon`** em `namiApi.ts` usa `fetch` cru com `FormData` (o wrapper não suporta multipart).

## Theming e personagens

Cada shell tem identidade visual própria baseada num personagem de anime:

| Shell | Personagem | Imagem | Arquivo CSS | Classe raiz |
|---|---|---|---|---|
| NamiShell | Nami (One Piece) | `nami.jpg`, `nami-hero.png` | `nami.css` | `.nami-app` |
| VioletShell | Violet Evergarden | `violet.png` | `violet.css` | `.vl-app` |
| FrierenShell | Frieren Beyond Journey's End | `frieren.png` | `frieren.css` | `.fr-app` |

**Como o theming funciona:**
1. Cada CSS de personagem define tokens OKLCH ou variáveis CSS sob a classe raiz.
2. O shell aplica atributos `data-*` no elemento raiz:
   - NamiShell: `data-theme="dark|light"`, `data-acento="Tangerina|Azul-maré|Coral|Ouro"`,
     `data-privacy` (embaralha valores `.amount`), `data-density`.
   - VioletShell: `data-theme`, `data-acento` (sapphire/gold/emerald/garnet como variáveis OKLCH
     injetadas por JS), `modo-foco`, `modo-amplo`, `tipo-tecnica`.
   - FrierenShell: `data-theme`, `data-density`.
3. Preferências são persistidas em `localStorage` (chaves `nami:*`, `vl-tweaks`, `fr-tweaks`).

**Tokens Tailwind para cores de personagem** (`tailwind.config.js`):
`c-makima`, `c-nami`, `c-frieren`, `c-kaguya`, `c-kurisu`, `c-journal`.
Os tokens `c-kaguya` e `c-kurisu` existem mas os shells desses domínios ainda não foram construídos.

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
