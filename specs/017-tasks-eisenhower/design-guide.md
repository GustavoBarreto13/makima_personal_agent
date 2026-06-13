# Design Guide — Matriz de Eisenhower (fatia 017)

Complementa [`010/frontend-design-guide.md`](../010-kaguya-tasks-app/frontend-design-guide.md).
**Fonte de fidelidade**: `docs/claude_design/design_handoff_kaguya_tarefas/kaguya/screens-cal.jsx`
(`EisenhowerScreen`, `QUADS`) + classes `eis-grid`/`eis-quad`/`kcard` em `kaguya/styles.css`.
Reimplementar no shell `pages/kaguya/` (nova `screens/EisenhowerScreen.tsx`), substituindo o
placeholder em `KaguyaShell.tsx`. Reusar os tokens `--p-*`/`--kg*`/`--ink-*` já escopados em `.kg-app`.

---

## Grade (`eis-grid`, 2×2)

Página `wide` (max-width maior). Cabeçalho: "Matriz de Eisenhower" + sub "view derivada de prioridade
× urgência · arraste para ajustar".

```
┌──────────────────────────────┬──────────────────────────────┐
│ ● Faça agora        (p-high) │ ● Agende             (p-med)  │
│   Urgente · Importante       │   Importante · Não urgente    │
│   [cards…]                   │   [cards…]                    │
├──────────────────────────────┼──────────────────────────────┤
│ ● Resolva rápido     (p-low) │ ● Depois            (ink-4)   │
│   Urgente · Não importante   │   Nem urgente · Nem importante│
│   [cards…]                   │   [cards…]                    │
└──────────────────────────────┴──────────────────────────────┘
```

`< 860px`: `eis-grid` colapsa para 1 coluna (4 blocos empilhados).

## Quadrantes (`QUADS` — manter ids/cores)

| id | Nome | Sub | Cor da marca | urgent | important |
|---|---|---|---|---|---|
| `q1` | Faça agora | Urgente · Importante | `--p-high` | ✓ | ✓ |
| `q2` | Agende | Importante · Não urgente | `--p-med` | ✗ | ✓ |
| `q3` | Resolva rápido | Urgente · Não importante | `--p-low` | ✓ | ✗ |
| `q4` | Depois | Nem urgente · Nem importante | `--ink-4` | ✗ | ✗ |

Cada quadrante (`eis-quad`): cabeçalho com `eq-mark` (bolinha colorida) + nome + sub + `eq-count`
(contagem). Corpo com os cards; quadrante vazio mostra "vazio". Fundos graduados por urgência (mais
intenso em "Faça agora").

## Cards (`kcard`, draggable)

Cartão com traço de prioridade (`--pr-color`), título, e meta: `PrioFlag` (se prioridade > 0),
`DateChip` (se tem data) e a lista (dot colorido + nome). Clique abre o TaskModal. `draggable` com
`dataTransfer` do id.

Ordenação dentro do quadrante: `due_date` ascendente (sem data por último), depois prioridade
descendente.

## Classificação (régua compartilhada)

```
isUrgent(t)    = t.due_date != null && diasAte(t.due_date) <= 2
isImportant(t) = t.priority >= 2
quadrante(t)   = combinação (isUrgent, isImportant)
```

Extrair essa régua para um utilitário compartilhado (ex.: `pages/kaguya/lib/eisenhower.ts`) e espelhá-la
na camada de lógica para o relato textual do Telegram — **uma** definição, dois canais (FR-005/SC-004).

## Drag → patch (reusa `PATCH /api/tasks/{id}`)

Ao soltar no quadrante `q`:

```
patch = {}
se  q.important e t.priority < 2      → patch.priority = 2
se !q.important e t.priority >= 2     → patch.priority = 1
se  q.urgent e !isUrgent(t)           → patch.due_date = amanhã
se !q.urgent e  isUrgent(t)           → patch.due_date = hoje + 5
se patch vazio → não chama a API (toast opcional "já estava aqui")
```

Sem endpoint novo: usa o `update_task`/`PATCH /api/tasks/{id}` existente. Toast de confirmação
("Movida para 'Faça agora'").
