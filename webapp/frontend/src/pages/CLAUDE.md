## Módulo: webapp/frontend/src/pages

Três Shells ativos (desenvolvimento contínuo) + páginas legado na raiz.

---

### Mapa dos domínios

| Pasta | Shell | API object | CSS | Rota |
|---|---|---|---|---|
| `violet/` | `VioletShell.tsx` | `violetApi` em `lib/api.ts` | `violet.css` | `/journal/*` |
| `nami/` | `NamiShell.tsx` | `namiApi` em `nami/namiApi.ts` | `nami.css` | `/nami/*` |
| `frieren/` | `FrierenShell.tsx` | `booksApi` em `lib/api.ts` | `frieren.css` | `/books/*` |
| raiz (`pages/*.tsx`) | — (layout global) | `api.*` de `lib/api.ts` | global CSS | `/`, `/login`, etc. |

---

### Páginas raiz vs Shells

As páginas soltas na raiz (`Dashboard.tsx`, `Transactions.tsx`, etc.) são **legado** — renderizadas dentro do `Layout` global via `react-router-dom`. Os Shells assumem controle total das sub-rotas e **não usam `Layout`**.

Nunca misturar: código de Shell não chama componentes do `Layout`; páginas da raiz não usam tokens CSS de um Shell específico.

---

### CSS: isolamento por domínio

Cada Shell tem seu próprio arquivo CSS com tokens OKLCH (`--garnet`, `--sapphire`, etc.) declarados dentro de um seletor de escopo (`.violet-shell` / `.nami-shell` / `.frieren-shell`). Tokens de um domínio **não são visíveis** no outro.

- Usar somente os tokens declarados no CSS do próprio domínio.
- Não importar `nami.css` dentro de `violet/`, nem o inverso.
- Tokens globais (`--ink-*`, `--line-*`, `--mist`) vêm do CSS raiz da app.

---

### Estado: apenas React hooks

Nenhum gerenciador de estado externo (Redux, Zustand, Jotai). Tudo via `useState` / `useEffect` / `useCallback`. Dados são buscados no mount da tela e re-buscados quando o identificador relevante muda (ex.: `year`, `date`).

---

### API: objeto por domínio — nunca `fetch` direto

Cada domínio usa seu objeto de API. Componentes nunca chamam `fetch` diretamente.

```ts
// Correto:
violetApi.heatmap(year)     // violet
namiApi.getStats(month)     // nami
booksApi.list()             // frieren

// Proibido:
fetch('/api/journal/heatmap?year=2026', { credentials: 'include' })
```

---

### Estrutura interna de cada Shell

```
<dominio>/
├── <Dominio>Shell.tsx   # raiz: sidebar, navegação, roteamento interno
├── TweaksPanel.tsx      # painel lateral de preferências (se existir)
├── types.ts             # interfaces TypeScript espelhando o backend
├── <dominio>.css        # tokens e classes do domínio
├── screens/             # uma tela por seção
├── modals/              # modais de criação/edição (nami tem isso)
├── components/          # componentes compostos reutilizados no domínio
└── ui/                  # primitivos visuais (charts, icons, etc.)
```

`namiApi.ts` fica em `nami/` por ser mais volumoso; `violetApi` e `booksApi` ficam em `lib/api.ts` por serem menores.

---

### O que NÃO fazer aqui

- **Não criar arquivo de rota na raiz de `pages/` para Shells** — a Route está em `App.tsx` e os Shells usam wildcard (`/journal/*`); criar `Journal.tsx` na raiz criaria conflito
- **Não usar `className` de outro domínio** — ex.: `.heat-mo` é de violet; `.book-card` é de frieren
- **Não adicionar estado global** — qualquer dado compartilhado entre Shells passa pela API (banco), não por contexto React compartilhado
- **Não fazer lazy load manual** — Vite já faz code splitting; importar o Shell normalmente
- **Não criar tela em `screens/` sem registrar no Shell** — a tela não será acessível até o Shell conhecer a rota interna
