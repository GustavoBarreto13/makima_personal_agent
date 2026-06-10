# UI Contract: Favoritar Bullet pelo Próprio Ícone

**Feature**: 007-favorite-bullet | **Branch**: `007-favorite-bullet` | **Date**: 2026-06-10

---

## Componente: Marcador de Bullet (`.b-mark`)

### Localização

`webapp/frontend/src/pages/violet/screens/Write.tsx` — marcador de cada bullet renderizado
na tela de escrita do diário.

### Estado atual (sem feature)

```
[.b-mark]  →  div passiva, sem handler, sem cursor
  [.dot]   →  span cinza (bullet simples)
  [.glyph] →  span com ícone SVG colorido (highlight/dream/idea/wisdom/note)
```

### Estado com Feature 007

```
[.b-mark]   →  div clicável (cursor:pointer), title dinâmico, onClick → toggleFavorite
  quando NÃO favorito:
    [.dot]    →  span cinza (bullet simples) — sem classe adicional
    [.glyph]  →  span com ícone SVG na cor do kind — sem classe adicional

  quando favorito (is_fav = true):
    [.dot.is-fav]    →  background: var(--garnet) — ponto vermelho
    [.glyph.is-fav]  →  color: var(--garnet) — ícone vermelho (independente do kind)
```

---

## Comportamentos

### Toggle (clique no marcador)

| Situação | Ação | Resultado visual | Persistência |
|---|---|---|---|
| Bullet não-favorito, clique no `.b-mark` | Chama `toggleFavorite(b)` | Marcador vira garnet em < 200ms (optimistic) | PATCH enviado; mantém se OK, reverte se falha |
| Bullet favorito, clique no `.b-mark` | Chama `toggleFavorite(b)` | Marcador volta à cor do kind em < 200ms (optimistic) | PATCH enviado; mantém se OK, reverte se falha |
| Duplo clique no texto (`.bline`) | Entra em modo edição | Textarea aparece — sem interferência no favorito | Favorito preservado no estado local |
| Clique simples no texto (`.bline`) | Sem efeito | Nenhuma mudança | — |
| Bullet em modo adição (sem id) | `.b-mark` sem handler | Clique não dispara nenhuma ação | — |

### Rollback em falha

1. Antes do PATCH: salvar `const anterior = b.favorite`.
2. Optimistic update imediato: inverter `favorite` no `useState`.
3. PATCH `violetApi.setFavorite(id, novoValor)`.
4. `.catch(...)`: reverter com `setBullets(prev => prev.map(b => b.id === id ? {...b, favorite: anterior} : b))`.
5. Usuário vê o marcador voltar ao estado original — sem favorito "fantasma".

---

## Affordance e Acessibilidade

| Elemento | Atributo | Valor |
|---|---|---|
| `<div className="b-mark">` | `title` | `"Favoritar"` (não-favorito) / `"Desfavoritar"` (favorito) |
| `<div className="b-mark">` | `aria-label` | Mesmo que `title` |
| `<div className="b-mark">` | `role` | `"button"` |
| `<div className="b-mark">` | `tabIndex` | `0` (focável via teclado, opcional) |

---

## CSS

### Tokens existentes (sem modificação)

```css
/* violet.css — tokens garnet já existentes */
:root {
  --garnet:      oklch(0.535 0.165 18);       /* light mode */
  --garnet-tint: oklch(0.535 0.165 18 / 0.13);
}

[data-theme="dark"] {
  --garnet:      oklch(0.66 0.160 20);        /* dark mode */
}
```

### Regras novas a adicionar

```css
/* ── Marcador clicável (Feature 007) ─────────────────────────────────── */

/* Cursor pointer em TODOS os marcadores (bullet e ícone) */
.b-mark {
  cursor: pointer;
}

/* Hover: leve opacidade para indicar interatividade */
.b-mark:hover {
  opacity: 0.75;
  transition: opacity 0.1s ease;
}

/* Ponto (bullet simples) favoritado → fica garnet */
.b-mark .dot.is-fav {
  background: var(--garnet);
}

/* Ícone (qualquer kind) favoritado → fica garnet (sobrepõe cor do kind) */
.b-mark .glyph.is-fav {
  color: var(--garnet);
}
```

---

## Escopo da tela Write

O toggle de favorito é implementado **apenas na tela Escrever** (`Write.tsx`). Outras telas
que exibem bullets (Collection, Journal) são **somente leitura nesta spec** — o estado
`favorite` pode ser carregado e exibido visualmente, mas o toggle não é requerido por elas
nesta feature. A prioridade da spec 008 (heatmap vermelho nos dias com favorito) é o consumo
agregado via `list_favorite_days`, não a edição de favoritos em coleções.
