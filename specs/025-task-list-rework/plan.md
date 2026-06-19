# Implementation Plan: Lista de Tarefas como Árvore + Pessoas (Fatia 025)

**Branch**: `master` | **Date**: 2026-06-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification de `specs/025-task-list-rework/spec.md`

---

## Summary

Reformulação da visão de Lista do Kaguya para uma **árvore hierárquica de profundidade irrestrita**
(cap 12) onde toda subtarefa é uma tarefa de primeira classe com `parent_id`. Inclui drag-and-drop
com 3 zonas (antes/dentro/depois), edição inline via teclado (Enter/Tab/Shift+Tab), promoção de
subtarefa a raiz, atribuição de pessoas da Komi, e aparição de subtarefas planejadas no Meu Dia e
em smart lists. Nenhuma mudança de schema — o banco já tem `parent_id`, `position`, e
`person_links`. A mudança é relaxar a regra "1 nível" na camada de lógica e reconstruir a UI.

---

## Technical Context

**Language/Version**: Python 3.12 (backend) · TypeScript + React 19 (frontend)

**Primary Dependencies**:
- Backend: FastAPI, psycopg2-binary, Python 3.12
- Frontend: React 19, @dnd-kit/core + @dnd-kit/sortable (já instalado), Vite 6

**Storage**: PostgreSQL — schema existente, sem nova tabela ou coluna

**Testing**: pytest (backend) · Vitest + @testing-library/react (frontend)

**Target Platform**: Web app (single-user, self-hosted Docker)

**Project Type**: Web application — FastAPI backend + React frontend

**Performance Goals**: Árvore visível em < 300ms após navegação; drag sem flash de spinner

**Constraints**:
- CSS escopo estrito `.kg-app` (sem vazamento para outros shells)
- Sem gerenciador de estado externo (React hooks apenas)
- Sem nova tabela/coluna no banco
- Nenhuma mudança em `agents/journal`, `mcp_servers`, `coordinator`, Calendar Hub (fatia 019)

**Scale/Scope**: Usuário único; ~100 tarefas por projeto; profundidade máxima 12 níveis

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação | Justificativa |
|-----------|-----------|---------------|
| **I. Agent Specialization** | ✅ PASSA | Toda lógica nova fica em `agents/kaguya/tools_tasks.py`. O router FastAPI só delega. `move_task`, `_attach_subtasks` recursivo e `_attach_assignees` ficam em `tools_tasks.py`. `unlink_people_on_cursor` fica em `agents/komi/tools.py`. |
| **II. Hybrid Batch + Agentic** | ✅ PASSA | Nenhuma automação batch migrada para ADK. A feature é puramente UI/REST síncrono. |
| **III. Self-Contained Agents** | ✅ PASSA | Kaguya importa Komi via import lazy (padrão existente: dentro da função). Nenhum ciclo de import. |
| **IV. Portuguese-First UX** | ✅ PASSA | Todos os toasts, labels, placeholders e mensagens de erro em português (handoff já é em pt-BR). |
| **V. Minimal Footprint** | ✅ PASSA | Nenhuma nova tabela, coluna, biblioteca, nem agente. Relaxar uma regra de negócio existente e adicionar campos aos payloads. |

**Resultado**: Todos os gates passam. Sem violações.

---

## Project Structure

### Documentation (this feature)

```text
specs/025-task-list-rework/
├── spec.md              # Spec completa (/speckit-specify)
├── plan.md              # Este arquivo (/speckit-plan)
├── research.md          # Decisões técnicas (/speckit-plan Phase 0)
├── data-model.md        # Modelo de dados (/speckit-plan Phase 1)
├── quickstart.md        # Guia de validação (/speckit-plan Phase 1)
├── contracts/
│   └── api-endpoints.md # Contratos REST (/speckit-plan Phase 1)
├── checklists/
│   └── requirements.md  # Checklist de qualidade (/speckit-specify)
├── tasks.md             # Tarefas executáveis (/speckit-tasks — próximo passo)
└── design_handoff_kaguya_lista_arvore/   # Protótipo de referência
    └── kaguya/
        ├── tasktree.jsx, screens-list.jsx, app.jsx, modals.jsx, styles.css
        └── data.js
```

### Source Code (modified files)

```text
# Backend
agents/kaguya/
└── tools_tasks.py       # MODIFY: create_task(relaxar 1-nível), _attach_subtasks(recursivo),
                         #   update_task(+person_ids), move_task(NOVO),
                         #   _attach_assignees(NOVO), _generate_next_occurrence(recursivo),
                         #   list_my_day(subs planejadas)
agents/komi/
└── tools.py             # MODIFY: unlink_people_on_cursor(NOVO helper)

webapp/backend/routers/
└── tasks.py             # MODIFY: CreateTaskBody/UpdateTaskBody(+person_ids),
                         #   MoveTaskBody(NOVO), POST /{id}/move (NOVO endpoint)

# Frontend
webapp/frontend/src/pages/kaguya/
├── types.ts             # MODIFY: +Assignee, +Person, Task.assignees, Task.parent_title
├── kaguyaApi.ts         # MODIFY: +moveTask, +person_ids em create/update, +listPeople
├── kaguya.css           # MODIFY: portar seção da árvore do protótipo
├── ui/
│   └── Icons.tsx        # MODIFY: +grip, +arrowUpRight, +chevDown, +users, +flag, +loop
├── lib/
│   ├── tasktree.ts      # NEW: childrenOf, subProgress, taskDepth, avatarColor, initials
│   └── useCollapsedState.ts  # NEW: hook localStorage por lista
├── components/
│   ├── TaskTree.tsx     # NEW: TaskTree + TreeRow com DnD 3 zonas e edição inline
│   └── People.tsx       # NEW: Avatar, AvatarStack, AssigneePicker
├── screens/
│   ├── ListScreen.tsx   # REWRITE: usa TaskTree, grupos, toolbar completa, extras
│   ├── TodayScreen.tsx  # MODIFY: exibir parent_title para subtarefas no plano
│   └── FilterScreen.tsx # MODIFY: subtarefas que casam na regra
└── modals/
    └── TaskModal.tsx    # MODIFY: banner de mãe, seção Pessoas, subtarefas com helpers
```

**Structure Decision**: Web application option (backend + frontend separados). Padrão existente
do codebase — routers em `webapp/backend/routers/`, frontend em `webapp/frontend/src/pages/kaguya/`.

---

## Implementation Phases

### Fase A — Backend core (pré-requisito para tudo)

**A1 · Árvore recursiva** (`agents/kaguya/tools_tasks.py`)
- Substituir `_attach_subtasks` por CTE `WITH RECURSIVE` (ver `research.md` Decisão 2)
- Remover guard "só 1 nível" em `create_task`; manter: mãe viva, não concluída, profundidade ≤ 12
- Nova `_attach_assignees(cur, task_ids)` — 1 query batch `person_links JOIN people`
- `_serialize_task` inclui `assignees: []` e `parent_title: None`
- `list_tasks` chama `_attach_assignees` sobre todas as tasks da árvore montada

**A2 · `move_task`** (`agents/kaguya/tools_tasks.py` + `webapp/backend/routers/tasks.py`)
- Função: validação anti-ciclo (CTE), validação profundidade, seta `parent_id`, calcula `position`
  (ponto médio, reusa lógica de `reorder_task`), CTE UPDATE recursivo de `project_id`, gcal_sync
- Router: `MoveTaskBody { new_parent_id: int | None, after_id: int | None, before_id: int | None }`
  → `POST /api/tasks/{id}/move`

**A3 · Assignees no update** (`agents/komi/tools.py` + `agents/kaguya/tools_tasks.py`)
- `unlink_people_on_cursor(cur, entity_type, entity_id)` → DELETE em `person_links`
- `update_task(person_ids: list[str] | None = None)`: se presente, DELETE + re-INSERT
- Router: `person_ids: list[str] | None = None` em `CreateTaskBody` e `UpdateTaskBody`

**A4 · Cross-view** (`agents/kaguya/tools_tasks.py`)
- `list_my_day`: remover `AND parent_id IS NULL` de `plano`/`pendencias_ontem`; incluir
  `parent_title` via LEFT JOIN `tasks` `p` ON `t.parent_id = p.id`
- Endpoint de filtro de smart list: remover filtro de raiz ao aplicar regras

**A5 · Recorrência recursiva** (`agents/kaguya/tools_tasks.py`)
- `_generate_next_occurrence`: tornar BFS recursivo usando mapa `old_id → new_id` ao clonar

---

### Fase B — Frontend foundation

**B1 · Tipos e API** (`types.ts`, `kaguyaApi.ts`)
- `Assignee { id: string; name: string; avatar_url: string | null }`
- `Person { id: string; name: string; avatar_url: string | null }`
- `Task.assignees?: Assignee[]`, `Task.parent_title?: string`
- `kaguyaApi.moveTask(id, body)`, `kaguyaApi.listPeople()`, `person_ids` em create/update

**B2 · Ícones** (`ui/Icons.tsx`)
- Verificar e adicionar se ausentes: `grip` (6 pontos 2×3), `arrowUpRight`, `chevDown`,
  `users`, `flag`, `loop`

**B3 · CSS da árvore** (`kaguya.css`)
- Portar do `styles.css` do protótipo (último 1/3 do arquivo), adaptando tokens:
  `--line` para guias, `--kg` para drop, `var(--pr-color)` → CSS custom property por row,
  `--row-pad`/`--row-gap` para densidade já existente
- Classes mínimas necessárias: `.tree`, `.tree-row`, `.tree-guides i`, `.tree-grip`,
  `.tree-caret`, `.tree-count`, `.tk-body`, `.tk-title`, `.tk-subnote`, `.tk-meta`,
  `.tree-actions`, `.prio-dot`, `.drop-before`, `.drop-after`, `.drop-child`,
  `.task-group`, `.task-group-head`, `.task-group-body`, `.tree-addroot`,
  `.parent-banner`, `.people-pick`, `.person-chip`, `.kg-av`, `.kg-avstack`,
  `.kg-pop.assignee-pop`, `.kg-pop-search`, `.kg-pop-list`, `.kg-pop-item`

**B4 · Helpers e hooks** (`lib/tasktree.ts`, `lib/useCollapsedState.ts`)
- `tasktree.ts`: funções puras `childrenOf(tasks, parentId)`, `subProgress(task)`,
  `taskDepth(task, allTasks)`, `buildBreadcrumb(task, allTasks)`, `avatarColor(name)`, `initials(name)`
- `useCollapsedState(scopeKey: string)`: `Set<number>` em localStorage; `toggle(id)`,
  `expandAll(ids)`, `collapseAll(ids)`

---

### Fase C — Componentes visuais

**C1 · People.tsx**
```
Avatar({ person, size=19 })
  → img se avatar_url, else <span className="kg-av"> com iniciais + avatarColor
AvatarStack({ assignees, max=3, size=19 })
  → exibe até max Avatars + chip "+N" se exceder
AssigneePicker({ value, people, onChange, onClose })
  → popover 244px, input busca, lista com check/nome/avatar, scrim para fechar
```

**C2 · TaskTree.tsx — TreeRow**
```
Layout (da esquerda):
  .tree-guides (linhas verticais depth × i)
  .tree-indent (espaçador depth × 22px)
  .tree-grip (draggable handle)
  .tree-caret ou .ghost (colapso)
  <Check size=17 popping=160ms />
  .prio-dot
  .tk-body (.tk-title inline-edit + .tk-subnote + tree-count + recur flag + parent arrow)
  .tk-meta (AvatarStack + 1 tag + DateChip + PrioFlag)
  .tree-actions (hover: Pessoas, +Filho, Promover, Abrir)
  Tooltip de profundidade no .tree-indent para depth ≥ 2

Inline editing:
  editingId state no TaskTree pai (compartilhado entre TreeRows)
  Enter → commit + addSibling → setEditingId(newId)
  Tab → commit + indent (new_parent = irmão anterior)
  Shift+Tab → commit + outdent (new_parent = avó)
  Esc / blur vazio → cancel/remove
```

**C3 · TaskTree.tsx — TaskTree (DnD)**
```
DndContext (sensors=useDndSensors)
  useRef pointerY ← window.pointermove durante drag ativo
  onDragOver → compute zone(pointerY, over.rect) → setDropState({targetId, zone})
  onDragEnd  → resolve (activeId, targetId, zone) → {new_parent_id, after_id, before_id}
               → kaguyaApi.moveTask(activeId, body) + optimistic local state + silent reload
DragOverlay → <TreeRow task={activeTask} depth=0 ghost />

Renderização recursiva:
  renderNode(task, depth):
    kids = childrenOf(allTasks, task.id).filter(childFilter).sort(sorter)
    return <TreeRow> + (hasKids && !collapsed && kids.map(k → renderNode(k, depth+1)))
```

---

### Fase D — Telas e modais

**D1 · ListScreen.tsx** (reescrita completa)
- Busca: `kaguyaApi.listTasks(projectId, showDone)`; monta árvore completa em memória
- Cabeçalho, QuickAdd, Toolbar (chips prio, toggle done, agrupar, sort)
- `SORTS = { manual, smart, due, prio }` — aplicados recursivamente
- `GROUP_BYS = { project, prio, none }` — projeto único → `none` forçado
- Grupos: cabeçalho colapsável + `TaskTree` + rodapé "Adicionar tarefa"
- Extras: `useCollapsedState` para grupos; botão "↕" no cabeçalho do grupo → `expandAll/collapseAll`
- Silent-reload via `firstLoad` ref

**D2 · TaskModal.tsx** (modificações)
- Banner de mãe (quando `task.parent_id != null`): título clicável + botão Tornar independente
- Seção "Pessoas": `AssigneePicker` com lista de `people` carregada via `kaguyaApi.listPeople()`
- `person_ids` enviado no save
- Subtarefas: usa `childrenOf(allTasks, task.id)` de `tasktree.ts` para listar filhos

**D3 · TodayScreen.tsx** (pequena modificação)
- Quando `task.parent_id != null && task.parent_title`, exibir chip/badge "subtarefa de {parent_title}"

**D4 · TaskCard.tsx** (pequena modificação)
- Adicionar `<AvatarStack assignees={task.assignees ?? []} size={17} />` no card Kanban

---

## Key Design Decisions

Ver [research.md](research.md) para detalhes completos:

| # | Tópico | Decisão |
|---|--------|---------|
| 1 | DnD 3 zonas | @dnd-kit + pointermove ref + over.rect |
| 2 | Árvore N níveis | CTE WITH RECURSIVE PostgreSQL, montagem O(N) em Python |
| 3 | Assignees batch | 1 JOIN query, defaultdict por task_id |
| 4 | Colapso persistido | localStorage kg:collapsed:{scopeKey} |
| 5 | project_id em cascata | CTE UPDATE recursivo em move_task |
| 6 | Anti-ciclo | CTE de descendentes antes do UPDATE |
| 7 | Unlink de pessoas | DELETE + re-INSERT na mesma transação |
| 8 | Meu Dia com subs | Remover parent_id IS NULL em plano/pendencias_ontem |

---

## Artifacts

| Artefato | Caminho |
|----------|---------|
| Spec | `specs/025-task-list-rework/spec.md` |
| Research | `specs/025-task-list-rework/research.md` |
| Data Model | `specs/025-task-list-rework/data-model.md` |
| API Contracts | `specs/025-task-list-rework/contracts/api-endpoints.md` |
| Quickstart | `specs/025-task-list-rework/quickstart.md` |
| Tasks (próximo) | `specs/025-task-list-rework/tasks.md` |
| Protótipo de referência | `specs/025-task-list-rework/design_handoff_kaguya_lista_arvore/` |
