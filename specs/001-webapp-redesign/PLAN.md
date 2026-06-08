# Plano: Aplicar design de `claude_design` ao webapp

## Context

O repositório `makima_personal_agent` já tem um webapp funcional (`webapp/`) com backend FastAPI e frontend React/Tailwind. O usuário criou um design refinado em `docs/claude_design/webapp/frontend/` com um novo sistema visual escuro (OKLch), sidebar baseada em personagens e três páginas redesenhadas (Journal, Dashboard, Books).

A spec foi criada em `specs/001-webapp-redesign/spec.md`.

O objetivo é **substituir o visual** do frontend com o design de referência sem alterar o backend nem a lógica de dados existente.

---

## Arquivos de Design (fonte de verdade)

| Arquivo design | Substitui |
|---|---|
| `docs/claude_design/webapp/frontend/src/index.css` | `webapp/frontend/src/index.css` |
| `docs/claude_design/webapp/frontend/tailwind.config.js` | `webapp/frontend/tailwind.config.js` |
| `docs/claude_design/webapp/frontend/src/components/Layout.tsx` | `webapp/frontend/src/components/Layout.tsx` |
| `docs/claude_design/webapp/frontend/src/lib/api.ts` | `webapp/frontend/src/lib/api.ts` |
| `docs/claude_design/webapp/frontend/src/pages/Journal.tsx` | `webapp/frontend/src/pages/Journal.tsx` |
| `docs/claude_design/webapp/frontend/src/pages/Dashboard.tsx` | `webapp/frontend/src/pages/Dashboard.tsx` |
| `docs/claude_design/webapp/frontend/src/pages/Books.tsx` | `webapp/frontend/src/pages/Books.tsx` |
| `docs/claude_design/webapp/frontend/src/App.tsx` | `webapp/frontend/src/App.tsx` (manter rotas existentes + novas) |

---

## Tarefas

### 1. Design system global
- Copiar `docs/claude_design/webapp/frontend/src/index.css` → `webapp/frontend/src/index.css`
  - Contém: variáveis OKLch (`--bg-app`, `--bg-card`, `--t1`–`--t4`, `--c-makima`, `--c-nami`, etc.), scrollbar customizado, grain texture overlay
- Copiar `docs/claude_design/webapp/frontend/tailwind.config.js` → `webapp/frontend/tailwind.config.js`
  - Adiciona fontes `Playfair Display`, `DM Sans`, `DM Mono` e tokens de cor do design system
- Adicionar no `webapp/frontend/index.html` o `<link>` do Google Fonts para as três fontes

### 2. Layout (sidebar de personagens)
- Copiar `docs/claude_design/webapp/frontend/src/components/Layout.tsx` → `webapp/frontend/src/components/Layout.tsx`
  - Sidebar com: logo Makima, personagens com cor temática, item ativo destacado, logout no rodapé
  - Estrutura de três painéis: sidebar fixa | main flex-1 | right sidebar contextual (por página)

### 3. App.tsx — manter rotas existentes
- Copiar `docs/claude_design/webapp/frontend/src/App.tsx` como base
- **Adicionar de volta** as rotas das páginas financeiras que o design não incluía: `/transactions`, `/accounts`, `/cards`, `/loans`, `/budgets`, `/subscriptions`, `/books/:id`
- Manter import de `Login` (a página de login não muda)

### 4. Páginas redesenhadas (substituição direta)
- Copiar `Journal.tsx` do design → `webapp/frontend/src/pages/Journal.tsx`
  - Bullet editor com @menções e #tags destacados, save debounce, sidebar direita com 5 abas (Escrever/Insights/Pessoas/Tags/Busca), heatmap anual
- Copiar `Dashboard.tsx` do design → `webapp/frontend/src/pages/Dashboard.tsx`
  - Três cards: Saúde Financeira (score + breakdown), Gastos por Categoria, Compromissos Futuros
- Copiar `Books.tsx` do design → `webapp/frontend/src/pages/Books.tsx`
  - Filtros por status, cards com progresso/nota, modal de busca Google Books em dois passos

### 5. Migração de tokens nas páginas financeiras existentes
- Percorrer `Transactions.tsx`, `Accounts.tsx`, `Cards.tsx`, `Loans.tsx`, `Budgets.tsx`, `Subscriptions.tsx`
- Substituir classes Tailwind hardcoded (`bg-gray-900`, `text-white`, etc.) por variáveis CSS do design system (`bg-[--bg-card]`, `text-[--t1]`, etc.) onde necessário
- Objetivo: consistência visual, sem redesign de layout

### 6. lib/api.ts
- Verificar se `docs/claude_design/webapp/frontend/src/lib/api.ts` é compatível com o existente; se sim, substituir

---

## Verificação

```bash
# No diretório webapp/frontend/
npm run build          # deve compilar sem erros TypeScript
npm run dev            # abrir localhost:5173 e verificar visualmente:
                       # - sidebar de personagens visível
                       # - /journal com editor de bullets e heatmap
                       # - /books com filtros e cards de capa
                       # - / com três cards financeiros
                       # - /transactions (e demais) sem regressão visual grave
```

Checar no browser:
- Sem erros de console (vermelho)
- Fontes Playfair Display e DM Sans carregando
- Fundo escuro OKLch em todas as páginas
- Heatmap renderizando grid 52×7
- @menções em violeta, #tags em verde no Journal
