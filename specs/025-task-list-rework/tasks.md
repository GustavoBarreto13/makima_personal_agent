# Tasks: Lista de Tarefas como Árvore + Pessoas (Fatia 025)

**Input**: Design documents de `specs/025-task-list-rework/`

**Prerequisites**: plan.md ✅ · spec.md ✅ · research.md ✅ · data-model.md ✅ · contracts/ ✅ · quickstart.md ✅

**Referência de implementação**: `specs/025-task-list-rework/design_handoff_kaguya_lista_arvore/kaguya/`
(tasktree.jsx, screens-list.jsx, app.jsx, modals.jsx, styles.css — protótipo de referência, não copiar literal)

**Organização**: Tarefas agrupadas por user story para possibilitar entrega incremental.
Setup + Backend (Fases 1-2) são pré-requisitos; User Stories (Fases 3-9) são independentes entre si
após a Fase 2 estar concluída.

## Formato: `[ID] [P?] [Story?] Descrição`

- **[P]**: Pode rodar em paralelo (arquivos/funções diferentes, sem dependências incompletas)
- **[US?]**: User Story correspondente da spec.md (US1–US7)
- Setup e Backend não têm label [US?]

---

## Phase 1: Setup (Infraestrutura Compartilhada)

**Purpose**: Tipos, CSS, ícones, helpers e hooks que todas as user stories precisam.
Pode ser feito em qualquer ordem internamente — começar antes do backend estar pronto.

- [ ] T001 [P] Portar seção de árvore do `styles.css` do protótipo para `webapp/frontend/src/pages/kaguya/kaguya.css` (classes: `.tree`, `.tree-row`, `.tree-guides`, `.tree-grip`, `.tree-caret`, `.tree-count`, `.tk-body`, `.tk-title`, `.tk-subnote`, `.tk-meta`, `.tree-actions`, `.prio-dot`, `.drop-before`, `.drop-after`, `.drop-child`, `.task-group`, `.task-group-head`, `.task-group-body`, `.tree-addroot`, `.parent-banner`, `.people-pick`, `.person-chip`, `.kg-av`, `.kg-avstack`, `.kg-pop.assignee-pop` — tudo sob `.kg-app`)
- [ ] T002 [P] Verificar e adicionar ícones ausentes em `webapp/frontend/src/pages/kaguya/ui/Icons.tsx` (garantir: `grip` 6-pontos 2×3, `arrowUpRight`, `chevDown`, `users`, `flag`, `loop` — todos traço/stroke, padrão existente)
- [ ] T003 Adicionar tipos `Assignee { id, name, avatar_url }` e `Person { id, name, avatar_url }` em `webapp/frontend/src/pages/kaguya/types.ts`; adicionar campos `assignees?: Assignee[]` e `parent_title?: string` à interface `Task`
- [ ] T004 Estender `webapp/frontend/src/pages/kaguya/kaguyaApi.ts`: adicionar `moveTask(id, { new_parent_id, after_id?, before_id? })` → `POST /api/tasks/{id}/move`; adicionar `listPeople()` → `GET /api/people/`; adicionar `person_ids?: string[]` nos bodies de `createTask` e `updateTask`
- [ ] T005 [P] Criar `webapp/frontend/src/pages/kaguya/lib/tasktree.ts` com helpers puros: `childrenOf(tasks, parentId)`, `subProgress(task)`, `taskDepth(task, tasks)`, `buildBreadcrumb(task, tasks)`, `avatarColor(name)`, `initials(name)` (paleta OKLCH como no protótipo `data.js`)
- [ ] T006 [P] Criar `webapp/frontend/src/pages/kaguya/lib/useCollapsedState.ts` — hook `useCollapsedState(scopeKey: string)` que persiste `Set<number>` no localStorage com chave `kg:collapsed:{scopeKey}`; expõe `collapsed`, `toggle(id)`, `expandAll(ids)`, `collapseAll(ids)`

**Checkpoint**: Foundation frontend pronta — componentes podem ser desenvolvidos sem esperar o backend.

---

## Phase 2: Backend Core (Pré-requisito para todas as User Stories)

**Purpose**: Todas as mudanças no backend que habilitam a árvore N-níveis, assignees e move.

**⚠️ CRÍTICO**: Nenhuma user story do frontend pode ser validada end-to-end sem esta fase.

- [ ] T007 [P] Criar helper `unlink_people_on_cursor(cur, entity_type: str, entity_id: str | int) -> None` em `agents/komi/tools.py` — executa `DELETE FROM person_links WHERE entity_type = %s AND entity_id = %s::text` (usar import lazy para evitar ciclo)
- [ ] T008 [P] Criar função `_attach_assignees(cur, tasks: list[dict]) -> None` em `agents/kaguya/tools_tasks.py` — 1 query batch `SELECT pl.entity_id::int, p.id, p.name, p.avatar_url FROM person_links pl JOIN people p ON pl.person_id = p.id WHERE pl.entity_type = 'task' AND pl.entity_id = ANY(%s::text[])` → agrupa por `task_id` via `defaultdict(list)` e injeta `task['assignees']` em cada task
- [ ] T009 [P] Substituir `_attach_subtasks` em `agents/kaguya/tools_tasks.py` por versão recursiva com `WITH RECURSIVE tree AS (SELECT * FROM tasks WHERE parent_id = ANY(%s) AND deleted_at IS NULL UNION ALL SELECT t.* FROM tasks t JOIN tree ON t.parent_id = tree.id WHERE t.deleted_at IS NULL)` — montar árvore aninhada no Python via `dict` por `id` em O(N)
- [ ] T010 [P] Modificar `create_task` em `agents/kaguya/tools_tasks.py`: remover guard `"parent já é subtarefa → erro"` (regra de 1 nível); manter validações: mãe existe, mãe viva (not completed_at), mãe não deletada, profundidade via CTE `taskDepth ≤ 12`; subtarefa ainda herda `project_id` da mãe e recebe `column_id = NULL`
- [ ] T011 Atualizar `_serialize_task` em `agents/kaguya/tools_tasks.py` para incluir `assignees: []` (default) e `parent_title: None` (default); atualizar `list_tasks` para chamar `_attach_assignees` e `_attach_parent_titles` sobre todas as tasks (raízes + subs) após montar a árvore recursiva
- [ ] T012 Estender `update_task` em `agents/kaguya/tools_tasks.py` com parâmetro `person_ids: list[str] | None = None` — quando presente: dentro da transação, chamar `unlink_people_on_cursor(cur, 'task', task_id)` depois `link_person_on_cursor(cur, pid, 'task', task_id)` para cada `pid` (import lazy de `agents.komi.tools`)
- [ ] T013 [P] Adicionar `person_ids: list[str] | None = None` a `CreateTaskBody` e `UpdateTaskBody` em `webapp/backend/routers/tasks.py`; criar `MoveTaskBody(BaseModel)` com `new_parent_id: int | None`, `after_id: int | None = None`, `before_id: int | None = None`
- [ ] T014 [P] Criar função `move_task(task_id, new_parent_id, after_id=None, before_id=None)` em `agents/kaguya/tools_tasks.py`: (1) validar anti-ciclo via CTE de descendentes, (2) validar profundidade da nova posição ≤ 12, (3) UPDATE `parent_id`, (4) calcular `position` por ponto médio entre `after_id` e `before_id` no novo escopo `(project_id, parent_id)` — reusa lógica de `reorder_task` com renumeração em colisão, (5) CTE UPDATE recursivo de `project_id` em toda a subárvore = `project_id` da nova mãe (ou manter para raízes), (6) `gcal_sync.push_task` best-effort
- [ ] T015 Adicionar endpoint `POST /api/tasks/{task_id}/move` em `webapp/backend/routers/tasks.py` — chama `move_task(**body.model_dump())` via `_check_result`; resposta 200 com task atualizada
- [ ] T016 [P] Tornar `_generate_next_occurrence` em `agents/kaguya/tools_tasks.py` recursivo: clonar toda a subárvore via BFS com mapa `old_id → new_id`; cada filho clonado recebe `parent_id = new_id` da mãe clonada; `completed_at = None`, `my_day_date = None`, `start_at = None` resetados

**Checkpoint**: Backend pronto — validar com `curl` usando cenários 1-3 do `quickstart.md`.

---

## Phase 3: User Story 1 — Visualizar Hierarquia (Priority: P1) 🎯 MVP

**Goal**: Usuário abre uma lista e vê a árvore completa recuada, com guias, carets e contadores.
Colapso persiste ao recarregar.

**Independent Test**: Criar 3 níveis via API; abrir a lista; verificar recuo de 22px, guias verticais,
caret colapsa/expande, contador done/total, colapso lembrado após reload.

### Implementação

- [ ] T017 [P] [US1] Criar `webapp/frontend/src/pages/kaguya/components/People.tsx` com componentes `Avatar({ person, size=19 })` (foto real se `avatar_url`, senão iniciais + `avatarColor`) e `AvatarStack({ assignees, max=3, size=19 })` (sobreposição -6px, chip `+N` se exceder)
- [ ] T018 [P] [US1] Criar esqueleto de `webapp/frontend/src/pages/kaguya/components/TaskTree.tsx` com componente `TreeRow` — layout visual completo: `.tree-guides` (linhas verticais), `.tree-indent` (depth×22px), `.tree-grip` (placeholder não-funcional), `.tree-caret`/ghost, `Check` (17px), `.prio-dot`, `.tk-body` (título + nota), `.tk-meta` (AvatarStack + 1 tag + DateChip + PrioFlag), `.tree-actions` (placeholder); prop `data-prio` + CSS custom properties `--pr-color`/`--pr-tint`; tooltip `.tree-indent` com `buildBreadcrumb` quando `depth ≥ 2`
- [ ] T019 [US1] Adicionar componente `TaskTree` em `webapp/frontend/src/pages/kaguya/components/TaskTree.tsx` — renderização recursiva `renderNode(task, depth)` usando `childrenOf` de `tasktree.ts`; estado local `collapsed: Set<number>`; `onToggleCollapse(id)` exposto via prop; prop `childFilter` para filtrar filhos; prop `sort` aplicada a cada nível de irmãos
- [ ] T020 [US1] Reescrever `webapp/frontend/src/pages/kaguya/screens/ListScreen.tsx` — cabeçalho (chip projeto 30×30 com cor a 16% alpha + `"{N} abertas · arraste para aninhar ou reordenar"`), `QuickAdd` (reusar), grupos colapsáveis básicos (`.task-group`) com `TaskTree` dentro e rodapé `".tree-addroot Adicionar tarefa"`; `fetchTasks` com silent-reload via `firstLoad` ref
- [ ] T021 [US1] Integrar `useCollapsedState` em `webapp/frontend/src/pages/kaguya/screens/ListScreen.tsx` para nós da árvore — chave `kg:collapsed:{scopeId}`; passar `collapsed` e `onToggleCollapse` para `TaskTree`; adicionar botão "↕ Expandir tudo / Recolher tudo" no `.task-group-head`

**Checkpoint**: Hierarquia visual funcionando — a árvore está legível e o colapso persiste.

---

## Phase 4: User Story 2 — Criar via Teclado (Priority: P1)

**Goal**: Enter cria irmã, Tab indenta, Shift+Tab desindenta, Esc cancela, blur vazio remove.

**Independent Test**: A partir de uma linha em edição: Enter cria irmã abaixo focada, Tab transforma
em filha da linha acima, Shift+Tab sobe um nível, Esc cancela sem salvar linha vazia.

### Implementação

- [ ] T022 [US2] Adicionar edição inline ao `TreeRow` em `webapp/frontend/src/pages/kaguya/components/TaskTree.tsx` — clicar no título troca `.tk-title` por `<input className="tk-title-input">`; blur com título não-vazio chama `kaguyaApi.updateTask(id, {title})`; state `editingId` gerenciado no `TaskTree` pai (compartilhado entre TreeRows)
- [ ] T023 [US2] Implementar `Enter` no input de edição: commit do título → `addSibling` (cria task via `kaguyaApi.createTask({title: '', parent_id: task.parent_id, project_id: task.project_id, position: task.position + 5})`) → setEditingId(newId) em `webapp/frontend/src/pages/kaguya/components/TaskTree.tsx`
- [ ] T024 [US2] Implementar `Tab` (indent) e `Shift+Tab` (outdent) no input de edição em `webapp/frontend/src/pages/kaguya/components/TaskTree.tsx`: Tab = `kaguyaApi.moveTask(id, { new_parent_id: irmãoAnterior.id })`; Shift+Tab = `kaguyaApi.moveTask(id, { new_parent_id: task.parent?.parent_id ?? null, after_id: task.parent_id })`; ambos preservam foco no campo após move
- [ ] T025 [US2] Implementar `Esc` (cancela; remove linha nova vazia), blur vazio em linha nova (remove), e botão `+` em hover (chama `addChild` → `kaguyaApi.createTask({parent_id: task.id})` → expande mãe → setEditingId(newId)) em `webapp/frontend/src/pages/kaguya/components/TaskTree.tsx`

**Checkpoint**: Fluxo de teclado completo — criar e reorganizar hierarquia sem mouse.

---

## Phase 5: User Story 3 — Drag-and-Drop com 3 Zonas (Priority: P1)

**Goal**: Arrastar pela alça e soltar nas zonas before/child/after com feedback visual e persistência.

**Independent Test**: Arrastar tarefa para zona "child" → vira filha (sem spinner). Arrastar para
zona "before/after" → reordena. Tentar mãe dentro do filho → nenhuma ação.

### Implementação

- [ ] T026 [P] [US3] Criar hook `useTreeDrop` em `webapp/frontend/src/pages/kaguya/components/TaskTree.tsx` — registra `pointermove` no `window` durante drag ativo (quando `activeId !== null`) e armazena `pointerY` em `useRef` (sem re-render); expõe `computeZone(overRect: DOMRect): 'before' | 'child' | 'after'` via `(pointerY - overRect.top) / overRect.height < 0.28 → before, > 0.72 → after, else child`
- [ ] T027 [US3] Envolver `TaskTree` em `DndContext` com `useDndSensors()` de `lib/dnd.ts`; tornar `.tree-grip` de cada `TreeRow` draggable via `useDraggable({ id: task.id })`; tornar cada `TreeRow` droppable via `useDroppable({ id: \`tree:\${task.id}\` })`; `onDragOver` atualiza `dropState: { targetId, zone }` via `computeZone`; feedback visual: classes `drop-before`/`drop-after`/`drop-child` no row-alvo em `webapp/frontend/src/pages/kaguya/components/TaskTree.tsx`
- [ ] T028 [US3] Implementar `onDragEnd` em `TaskTree` em `webapp/frontend/src/pages/kaguya/components/TaskTree.tsx`: traduzir `(activeId, targetId, zone)` → `{ new_parent_id, after_id, before_id }` (zone=child: `new_parent_id=targetId`, after_id=último filho; zone=before/after: `new_parent_id=target.parent_id`, before/after via irmãos) → chamar `kaguyaApi.moveTask`; adicionar `<DragOverlay dropAnimation={null}>` com `<TreeRow>` fantasma durante drag
- [ ] T029 [US3] Aplicar optimistic update local (mover node na árvore local imediatamente) + silent reload após `moveTask` via `firstLoad` ref pattern em `webapp/frontend/src/pages/kaguya/screens/ListScreen.tsx`; garantir que drop anti-ciclo é silencioso (moveTask retorna 400 → reverter optimistic, mostrar toast de erro)

**Checkpoint**: Drag-and-drop completo com 3 zonas — reorganizar hierarquia visualmente.

---

## Phase 6: User Story 4 — Promover Subtarefa (Priority: P2)

**Goal**: Botão "↗" em hover (e no modal) desvincula subtarefa → vira raiz com toast de confirmação.

**Independent Test**: Hover em subtarefa → clicar "↗" → tarefa some do lugar atual, aparece como
raiz ao final, filhos dela permanecem filhos; toast "Agora é uma tarefa independente".

### Implementação

- [ ] T030 [US4] Adicionar botão `↗ Tornar independente` nas `.tree-actions` do `TreeRow` em `webapp/frontend/src/pages/kaguya/components/TaskTree.tsx` — visível somente quando `task.parent_id !== null`; `title="Tornar tarefa independente"` com ícone `arrowUpRight`
- [ ] T031 [US4] Implementar ação promote em `webapp/frontend/src/pages/kaguya/components/TaskTree.tsx` — chama `kaguyaApi.moveTask(task.id, { new_parent_id: null })` + `onToast('Agora é uma tarefa independente')` + silent reload; subárvore da tarefa promovida migra intacta (tratado pelo backend)
- [ ] T032 [US4] Adicionar banner de mãe ao `webapp/frontend/src/pages/kaguya/modals/TaskModal.tsx` — quando `task.parent_id !== null`: `<div className="parent-banner"><Icon name="arrowUpRight" rotate180 /> Subtarefa de <b onClick={() => onOpen(mãe)}>{task.parent_title}</b> <button className="pb-promote" onClick={promote}>Tornar independente</button></div>`; carregar a mãe via `allTasks.find(t => t.id === task.parent_id)` passado como prop ou via `kaguyaApi.getTask`

**Checkpoint**: Promoção funcional — subtarefa se torna raiz tanto pelo hover quanto pelo modal.

---

## Phase 7: User Story 5 — Pessoas da Komi (Priority: P2)

**Goal**: Atribuir responsáveis a tarefas em qualquer nível; avatares visíveis na árvore e no Kanban.

**Independent Test**: Hover → Pessoas → selecionar 2 pessoas → fechar; avatares aparecem na linha.
Modal → seção Pessoas mostra as mesmas. Kanban → card exibe avatares.

### Implementação

- [ ] T033 [P] [US5] Criar `AssigneePicker` em `webapp/frontend/src/pages/kaguya/components/People.tsx` — popover 244px com scrim fixo `onMouseDown→onClose`, campo de busca, lista de `Person[]` filtrada, cada item com `Avatar + nome + check se selecionado`; toggle add/remove em `value: string[]`; expõe `onChange(newValue: string[])`
- [ ] T034 [US5] Adicionar botão Pessoas às `.tree-actions` do `TreeRow` em `webapp/frontend/src/pages/kaguya/components/TaskTree.tsx` — abre `AssigneePicker` inline com `people` vindos de prop (lista pré-carregada no `TaskTree` via `kaguyaApi.listPeople()`); ao fechar: `kaguyaApi.updateTask(task.id, { person_ids: newValue })` + optimistic update local de `task.assignees`
- [ ] T035 [US5] Adicionar seção Pessoas ao `webapp/frontend/src/pages/kaguya/modals/TaskModal.tsx` — `<label>Pessoas <span className="ml-hint">· da Komi</span></label>` + chips toggláveis `(person-chip + Avatar)` para cada pessoa; carrega `people` via `kaguyaApi.listPeople()` no mount; inclui `person_ids` no payload do save
- [ ] T036 [US5] Adicionar `<AvatarStack assignees={task.assignees ?? []} size={17} />` ao `webapp/frontend/src/pages/kaguya/components/TaskCard.tsx` (card do Kanban) — posicionado no rodapé do card à esquerda do anel de progresso

**Checkpoint**: Pessoas funcionando — avatares visíveis na árvore, modal e Kanban.

---

## Phase 8: User Story 6 — Subtarefas no Meu Dia e Smart Lists (Priority: P2)

**Goal**: Subtarefas com `my_day_date` aparecem no Meu Dia; smart lists incluem subtarefas que casam.
Kanban e Eisenhower continuam root-only.

**Independent Test**: Adicionar subtarefa ao Meu Dia → aparece no Meu Dia com badge "subtarefa de X".
Abrir Kanban → subtarefa não aparece como card.

### Implementação

- [ ] T037 [P] [US6] Modificar `list_my_day` em `agents/kaguya/tools_tasks.py` — remover `AND t.parent_id IS NULL` das queries de `plano` e `pendencias_ontem`; adicionar `LEFT JOIN tasks p ON t.parent_id = p.id` e campo `p.title AS parent_title` no SELECT; `sugestoes` mantém `AND t.parent_id IS NULL`; incluir subtarefas nos resultados de `_attach_assignees`
- [ ] T038 [US6] Modificar `webapp/frontend/src/pages/kaguya/screens/TodayScreen.tsx` — quando `task.parent_id !== null && task.parent_title`, exibir chip/badge `"subtarefa de {parent_title}"` abaixo do título (`.today-parent-chip` ou similar com cor discreta)
- [ ] T039 [US6] Remover filtro implícito de `parent_id IS NULL` do endpoint de smart list em `webapp/backend/routers/tasks.py` e/ou na query correspondente em `agents/kaguya/tools_tasks.py`; garantir que `FilterScreen.tsx` em `webapp/frontend/src/pages/kaguya/screens/FilterScreen.tsx` renderiza itens com `parent_id` exibindo a indicação de mãe

**Checkpoint**: Cross-view funcionando — subtarefas planejadas chegam ao Meu Dia e smart lists.

---

## Phase 9: User Story 7 — Agrupar e Ordenar (Priority: P3)

**Goal**: Toolbar com chips de prioridade, toggle Concluídas, agrupamento por projeto/prioridade/nenhum
e ordenação manual/inteligente/vencimento/prioridade — aplicados recursivamente.

**Independent Test**: Mudar para "Agrupar: Prioridade" → raízes agrupadas em Alta/Média/Baixa/Sem.
Mudar para "Ordenação: Vencimento" → irmãos em cada nível ordenados por data.

### Implementação

- [ ] T040 [US7] Adicionar chips de prioridade (Tudo / Alta+ / Média+ / Baixa+) e toggle Concluídas ao `.toolbar` em `webapp/frontend/src/pages/kaguya/screens/ListScreen.tsx` — `prioFilter` state (0/1/2/3), `showDone` state; filtrar `roots` antes de passar para grupos (`t.priority >= prioFilter && (showDone || !t.completed_at)`)
- [ ] T041 [US7] Adicionar `SORTS = { manual, smart, due, prio }` e botão de ordenação rotativo em `webapp/frontend/src/pages/kaguya/screens/ListScreen.tsx` — `sort` state; sorter aplicado em cada chamada de `childrenOf(...).sort(sorter)` dentro do `renderNode` do `TaskTree`; ordenação "Manual" habilita drag-and-drop (setDragEnabled)
- [ ] T042 [US7] Adicionar `GROUP_BYS = { project, prio, none }` e botão de agrupamento em `webapp/frontend/src/pages/kaguya/screens/ListScreen.tsx` — montar grupos: `project` (por `project_id`), `prio` (Alta/Média/Baixa/Sem), `none` (um único grupo); projeto único força `effectiveGroupBy = 'none'`; cada grupo com cabeçalho `.task-group-head` (caret, ponto colorido, nome, contador abertos, linha divisória)
- [ ] T043 [US7] Adicionar estado de colapso de grupos via `useCollapsedState('groups:' + scopeKey)` em `webapp/frontend/src/pages/kaguya/screens/ListScreen.tsx`; adicionar botão "↕" no `.task-group-head` que chama `expandAll(allNodeIds)` ou `collapseAll(allNodeIds)` no `useCollapsedState` dos nós da árvore

**Checkpoint**: Toolbar completa — agrupar e ordenar funcionam com a nova árvore.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Modal de edição completo, recorrência recursiva, extras de UX e validação final.

- [ ] T044 [P] Atualizar `webapp/frontend/src/pages/kaguya/modals/TaskModal.tsx` — seção Subtarefas usa `childrenOf(allTasks, task.id)` de `lib/tasktree.ts` para listar filhos reais; cada linha: check, título clicável (abre modal da sub), AvatarStack, ciclar prioridade, excluir; campo "Adicionar subtarefa e Enter" chama `kaguyaApi.createTask({ parent_id: task.id, ... })`; para tarefa nova: `pendingSubs` (lista local) → criados no save como filhos reais
- [ ] T045 [P] Ativar tooltip de migalha de profundidade no `.tree-indent` em `webapp/frontend/src/pages/kaguya/components/TaskTree.tsx` — `title={buildBreadcrumb(task, allTasks)}` quando `depth ≥ 2`; `buildBreadcrumb` retorna caminho separado por " › " (ex.: "Estudos › ETL")
- [ ] T046 [P] Validar e completar `_generate_next_occurrence` recursivo em `agents/kaguya/tools_tasks.py` — clone BFS com mapa `old_id → new_id`; cada filho criado com `parent_id = mapa[filho.parent_id]`; campos resetados: `completed_at = NULL`, `my_day_date = NULL`, `start_at = NULL`, `end_at = NULL`
- [ ] T047 Executar todos os cenários do `specs/025-task-list-rework/quickstart.md` (cenários 1–8); confirmar não-regressão: Kanban, Eisenhower, Meu Dia (time-blocking), Hábitos, Calendário, CSS sem vazamento para `/journal`, `/nami`, `/books`
- [ ] T048 Executar `npm run build` (sem erros TypeScript) e `npx vitest` (testes do parser não regridem) em `webapp/frontend/`

**Checkpoint**: Feature completa — todos os cenários do quickstart passam, build limpo.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependências — pode começar imediatamente e rodar em paralelo com o backend
- **Backend Core (Phase 2)**: Sem dependências de frontend — pode rodar em paralelo com Phase 1
- **US1–US7 (Phases 3–9)**: Todas dependem de Phase 2 concluída para validação E2E; mas o componente TreeRow/TaskTree pode ser construído com dados mock antes do backend estar pronto
- **Polish (Phase 10)**: Depende de todas as fases anteriores desejadas estarem completas

### User Story Dependencies

- **US1 (P1)**: Pode começar após Phase 1 (tipos, CSS, helpers). Bloqueia US2 e US3.
- **US2 (P1)**: Depende de US1 (precisa do TreeRow com edição inline)
- **US3 (P1)**: Depende de US1 (precisa do TaskTree para adicionar DnD); pode ser paralelo com US2
- **US4 (P2)**: Depende de US1 (botão na árvore) e de T014/T015 backend
- **US5 (P2)**: Independente de US2/US3/US4 após Phase 1; depende de T008/T012/T013 backend
- **US6 (P2)**: Independente de US1–US5 no backend (T037 standalone); UI depende de estrutura existente
- **US7 (P3)**: Depende de US1 (ListScreen base existe)

### Within Each Phase — Execution Order

```
Phase 1: T001, T002, T005, T006 (paralelos) → T003 → T004 → T005 (usa tipos)
Phase 2: T007, T008, T009, T010, T013, T014, T016 (paralelos) → T011 (após T008) → T012 (após T007) → T015 (após T014)
Phase 3: T017 (paralelo com T018) → T019 → T020 → T021
Phase 4: T022 → T023 → T024 → T025
Phase 5: T026 (paralelo) → T027 → T028 → T029
Phase 6: T030 → T031 → T032
Phase 7: T033 (paralelo) → T034 → T035 → T036
Phase 8: T037 (paralelo) → T038 → T039
Phase 9: T040 → T041 → T042 → T043
Phase 10: T044, T045, T046 (paralelos) → T047 → T048
```

### Parallel Opportunities

- Phase 1: T001, T002, T005, T006 podem rodar em paralelo (arquivos independentes)
- Phase 2: T007, T008, T009, T010, T013, T014, T016 (paralelos entre si)
- Phase 3: T017, T018 paralelos
- Phase 5: T026 pode ser implementado enquanto Phase 4 ainda não está concluída
- Phase 7: T033 pode ser implementado em paralelo com Phases 4 e 5
- Phase 8: T037 (backend) pode ser feito em qualquer momento após Phase 2
- Phase 10: T044, T045, T046 são independentes entre si

---

## Parallel Example: Fases 1 e 2 (início)

```bash
# Podem ser iniciadas simultaneamente (arquivos completamente independentes):
Tarefa: "T001 Portar CSS da árvore para kaguya.css"
Tarefa: "T002 Adicionar ícones ausentes em Icons.tsx"
Tarefa: "T007 unlink_people_on_cursor em agents/komi/tools.py"
Tarefa: "T009 _attach_subtasks CTE recursiva em tools_tasks.py"
Tarefa: "T014 move_task completo em tools_tasks.py"
```

## Parallel Example: Fase 3 (US1)

```bash
# Podem começar juntas após T003 (types.ts) estar pronto:
Tarefa: "T017 Avatar + AvatarStack em People.tsx"
Tarefa: "T018 TreeRow visual estático em TaskTree.tsx"
```

---

## Implementation Strategy

### MVP First (US1 apenas — árvore visual)

1. Completar Phase 1: Setup (T001–T006)
2. Completar T009, T011 do Backend (árvore recursiva no backend)
3. Completar Phase 3: US1 (T017–T021) — TreeRow + TaskTree + ListScreen básico
4. **PARAR e VALIDAR**: árvore visual funcionando com dados reais
5. Continuar com US2 (teclado) e US3 (DnD)

### Incremental Delivery

1. Phase 1 + Backend Core → foundation pronta
2. + US1 → árvore legível (MVP visual)
3. + US2 → criar via teclado
4. + US3 → drag-and-drop
5. + US4 → promover
6. + US5 → pessoas
7. + US6 → cross-view
8. + US7 → sort/group
9. Polish → feature completa

### Single Developer Strategy

Com um único desenvolvedor, a ordem recomendada é:

1. Phase 1 (Setup) inteiro primeiro — base pronta para tudo
2. Phase 2 (Backend) — todas as mudanças de servidor
3. Phase 3 (US1) — árvore visual: PR/commit checkpoint
4. Phase 4+5 (US2+US3) — interações: PR/commit checkpoint
5. Phase 6+7 (US4+US5) — promote + pessoas: PR/commit checkpoint
6. Phase 8+9 (US6+US7) — cross-view + toolbar: PR/commit checkpoint
7. Phase 10 (Polish) — finalização: PR/commit checkpoint

---

## Notes

- **[P]** = arquivos/funções diferentes, sem dependências incompletas no mesmo phase
- **[US?]** = mapeia tarefa para user story específica da spec.md
- Referência visual: sempre consultar o `.html` do handoff (`Kaguya - Tarefas.html`) para paridade visual
- CSS: toda classe nova deve estar sob `.kg-app` — nunca seletores globais
- DnD: se `@dnd-kit` 3-zonas não funcionar adequadamente, fallback = HTML5 DnD nativo na árvore
- Backend: rodar scripts dentro do container `makima-web` (hostname do PG não resolve no host)
- Commit após cada phase ou grupo lógico (não por tarefa individual)
- Consultar `specs/025-task-list-rework/quickstart.md` cenário por cenário ao longo da implementação
