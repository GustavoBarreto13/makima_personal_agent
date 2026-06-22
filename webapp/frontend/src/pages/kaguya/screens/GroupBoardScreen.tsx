// GroupBoardScreen — Kanban agregado de um Grupo de Listas.
//
// Exibe as tarefas de TODAS as listas do grupo num único board, com colunas
// "unificadas" por nome: colunas de mesmo nome (case-insensitive) de listas
// diferentes são tratadas como a mesma coluna de status.
//
// Lógica de arrastar um card:
//   • Resolve qual column_id usar na lista da PRÓPRIA tarefa (via members da coluna unificada).
//   • Coluna "done" → completa a tarefa (com confirmação de cascata se houver subtarefas).
//   • Status inexistente na lista da tarefa → toast de aviso; rollback do drag.
//   • Não chama reorder (posições são por-lista; aqui o drag só muda status).
//
// Sem seletor de "View" (kanban_views continuam por-board de lista).
// Sem modal de criação de coluna (colunas são gerenciadas em cada lista individualmente).
//
// DnD via @dnd-kit, mesmo padrão do KanbanScreen:
//   • DragOverlay suave que segue o cursor.
//   • Optimistic update: o card se move na tela imediatamente, sem aguardar a API.
//   • Carregamento silencioso (sem spinner no reload): padrão firstLoad/didMountRef
//     obrigatório de pages/CLAUDE.md.

import { useEffect, useState, useCallback, useRef } from 'react'
import type { Task, GroupBoard, GroupBoardColumn, GroupBoardList } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { TaskCard } from '../components/TaskCard'
import { SortableTaskCard } from '../components/SortableTaskCard'
import { Icon } from '../ui/Icons'
// Toolbar de filtro/ordenação compartilhada com o KanbanScreen.
import { KanbanToolbar } from '../components/KanbanToolbar'
// Lógica pura de filtro: filtra por prioridade mínima + ordena os cards.
import { applyKanbanFilters, KANBAN_DEFAULTS } from '../lib/kanbanFilter'
import type { KanbanFilters } from '../lib/kanbanFilter'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  useDroppable,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
// Sensor centralizado (PointerSensor 5px) compartilhado com Kanban, Eisenhower e TodayScreen.
import { useDndSensors } from '../lib/dnd'

// ── Props ──────────────────────────────────────────────────────────────────────

interface GroupBoardScreenProps {
  groupId: number                              // id do grupo a carregar
  reloadKey: number                            // bump do shell → reload silencioso
  onOpenTask: (task: Task) => void             // abre o TaskModal
  onChanged: () => void                        // avisa o shell (atualiza contadores sidebar)
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// ── Componente de coluna unificada ─────────────────────────────────────────────
// Extraído para componente separado porque useDroppable é um hook e exige ser
// chamado dentro de um componente React (não pode ser chamado em callbacks ou maps).

interface GroupColumnProps {
  col: GroupBoardColumn                        // coluna unificada (agrega N listas)
  cards: Task[]                                // tarefas cujo column_id está nos members
  activeId: number | null                      // id do card sendo arrastado
  isOver: boolean                              // cursor está sobre esta coluna no drag
  listName: (projectId: number) => string      // resolve nome da lista pelo project_id
  onOpen: (task: Task) => void
}

function GroupColumn({ col, cards, activeId, isOver, listName, onOpen }: GroupColumnProps) {
  // useDroppable torna o corpo da coluna uma área de drop para o dnd-kit.
  // Usa o `key` normalizado da coluna como id (ex.: "a fazer") para não colidir
  // com ids de cards (numéricos) ou colunas por-lista.
  const { setNodeRef } = useDroppable({ id: `gcol:${col.key}` })

  // Cor do ponto/acento: coluna "done" fica esmeralda; demais usam o accent ativo.
  const accent = col.is_done ? 'var(--done)' : 'var(--kg)'

  return (
    <div
      className={`kcol${isOver ? ' is-over' : ''}`}
      style={{ '--kc-color': accent } as React.CSSProperties}
    >
      {/* Cabeçalho: numeral + nome + sub-linha */}
      <div className="kcol-head">
        <div className="kc-row1">
          <span className="kc-num">{cards.length}</span>
          <div className="kc-namewrap">
            <span className="kc-name">
              <span className="kc-dot" style={{ background: accent }} />{col.name}
            </span>
            <span className="kc-sub">
              {col.is_done ? 'concluídas' : `${col.members.length} lista(s)`}
            </span>
          </div>
        </div>
        {/* Sem capacity meter no board de grupo (estimativas misturadas de listas diferentes
            não fazem sentido agregadas; o capacity é por-lista). */}
      </div>

      {/* Corpo droppable + cards sortáveis */}
      <div ref={setNodeRef} className="kcol-body">
        <SortableContext items={cards.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {cards.map(t => (
            <SortableTaskCard
              key={t.id}
              task={t}
              onOpen={onOpen}
              isBeingDragged={activeId === t.id}
              // Mostra o nome da lista no chip do card (campo projectName de TaskCard).
              projectName={listName(t.project_id)}
              showChips={true}   // chips ligados: data/estimativa/lista sempre visíveis
              showRing={true}    // anel de subtarefas sempre visível
            />
          ))}
        </SortableContext>
      </div>

      {/* Sem botão "+ Adicionar tarefa" no board de grupo: tarefas são criadas dentro
          de cada lista individualmente (abre a lista pela sidebar). */}
    </div>
  )
}

// ── Tela principal ─────────────────────────────────────────────────────────────

export function GroupBoardScreen({ groupId, reloadKey, onOpenTask, onChanged, toast }: GroupBoardScreenProps) {
  // Payload completo do board: grupo, listas, colunas unificadas, tarefas.
  const [board, setBoard] = useState<GroupBoard | null>(null)

  // firstLoad: true = exibe o spinner "Carregando…". Fica false após o primeiro
  // load e nunca volta a true — reloads silenciosos não mostram o spinner.
  const [firstLoad, setFirstLoad] = useState(true)

  // activeId: id do card sendo arrastado (alimenta o DragOverlay e a opacidade do slot).
  const [activeId, setActiveId] = useState<number | null>(null)

  // overColKey: chave da coluna unificada atualmente sob o cursor durante o drag.
  const [overColKey, setOverColKey] = useState<string | null>(null)

  // filters: estado da barra de filtro/ordenação — compartilhada com o KanbanScreen.
  // Reseta automaticamente ao trocar de grupo (groupId muda → KANBAN_DEFAULTS).
  const [filters, setFilters] = useState<KanbanFilters>(KANBAN_DEFAULTS)

  // Sensor centralizado: PointerSensor com 5px de ativação (anti-click-acidental).
  const sensors = useDndSensors()

  // didMountRef: controla se o próximo reloadKey bump é silencioso.
  // Obrigatório pelo padrão DnD de pages/CLAUDE.md: bumps de reloadKey após um drop
  // nunca devem piscar o spinner (firstLoad=true seria regressão de UX).
  const didMountRef = useRef(false)

  // ── Carregamento do board ──────────────────────────────────────────────────

  // Carrega (ou recarrega) o board do grupo via GET /api/tasks/groups/{groupId}/board.
  // `silent=true` omite o spinner — usado em reloads após drag e em bumps de reloadKey.
  const load = useCallback(async (silent = false) => {
    if (!silent) setFirstLoad(true)
    try {
      const data = await kaguyaApi.groupBoard(groupId)
      setBoard(data)
    } catch {
      toast('Falha ao carregar o board do grupo.', 'err')
    } finally {
      if (!silent) setFirstLoad(false)
    }
  }, [groupId, toast])

  // Mount: carrega com spinner. Bump de reloadKey (após drag/modal): carrega silencioso.
  useEffect(() => {
    if (!didMountRef.current) {
      // Primeira vez: exibe o spinner.
      didMountRef.current = true
      load(false)
    } else {
      // Bumps subsequentes de reloadKey: silencioso (sem piscar).
      load(true)
    }
  }, [load, reloadKey])

  // ── Handlers DnD ──────────────────────────────────────────────────────────

  // Início do drag: registra qual card está no cursor.
  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(e.active.id as number)
  }, [])

  // Drag over: atualiza qual coluna está sob o cursor (para realce visual).
  const handleDragOver = useCallback((e: DragOverEvent) => {
    // O id do droppable tem formato "gcol:<key>". Cards sortáveis têm id numérico.
    const overId = e.over?.id as string | number | null
    if (typeof overId === 'string' && overId.startsWith('gcol:')) {
      setOverColKey(overId.replace('gcol:', ''))
    } else if (typeof overId === 'number' && board) {
      // Arrastando sobre um card: identifica a coluna do card e realça ela.
      const targetTask = board.tasks.find(t => t.id === overId)
      if (targetTask && targetTask.column_id != null) {
        const targetColKey = board.columns.find(c =>
          c.members.some(m => m.column_id === targetTask.column_id)
        )?.key ?? null
        setOverColKey(targetColKey)
      }
    } else {
      setOverColKey(null)
    }
  }, [board])

  // Fim do drag: move o card para a nova coluna (dentro da lista da própria tarefa).
  const handleDragEnd = useCallback(async (e: DragEndEvent) => {
    const { active, over } = e
    setActiveId(null)
    setOverColKey(null)

    // Sem destino válido (solto fora de qualquer área de drop) → cancela.
    if (!over || !board) return

    const taskId = active.id as number
    // Localiza a tarefa que foi arrastada.
    const task = board.tasks.find(t => t.id === taskId)
    if (!task) return

    // Resolve a coluna unificada de destino.
    // O id do droppable pode ser "gcol:<key>" (coluna) ou um número (card).
    let targetColKey: string | null = null
    if (typeof over.id === 'string' && over.id.startsWith('gcol:')) {
      // Solto diretamente no droppable da coluna.
      targetColKey = over.id.replace('gcol:', '')
    } else if (typeof over.id === 'number') {
      // Solto sobre um card: resolve a coluna unificada do card de destino.
      const overTask = board.tasks.find(t => t.id === over.id)
      if (overTask && overTask.column_id != null) {
        targetColKey = board.columns.find(c =>
          c.members.some(m => m.column_id === overTask.column_id)
        )?.key ?? null
      }
    }
    if (!targetColKey) return

    // Localiza a coluna unificada de destino.
    const targetCol = board.columns.find(c => c.key === targetColKey)
    if (!targetCol) return

    // Não faz nada se o card já está na coluna de destino.
    const currentColKey = board.columns.find(c =>
      c.members.some(m => m.column_id === task.column_id)
    )?.key ?? null
    if (currentColKey === targetColKey) return

    // ── Resolve o column_id da lista da tarefa nessa coluna unificada ────────
    // Procura o membro da coluna de destino que pertence à mesma lista da tarefa.
    const member = targetCol.members.find(m => m.project_id === task.project_id)
    if (!member) {
      // A lista desta tarefa não tem esse status (coluna inexistente nela).
      const lista = board.lists.find(l => l.id === task.project_id)
      toast(`A lista '${lista?.name ?? '?'}' não tem a coluna '${targetCol.name}'.`, 'err')
      return
    }

    // ── Snapshot para rollback em caso de erro da API ─────────────────────────
    const snapshot = board

    // ── Optimistic update: move o card na tela imediatamente ─────────────────
    setBoard(prev => {
      if (!prev) return prev
      return {
        ...prev,
        tasks: prev.tasks.map(t =>
          t.id === taskId ? { ...t, column_id: member.column_id } : t
        ),
      }
    })

    try {
      if (targetCol.is_done) {
        // Coluna "concluído" → completa a tarefa.
        // Subtarefas abertas: `needs_cascade` → pede confirmação ao usuário.
        const r = await kaguyaApi.complete(taskId)
        if (r.needs_cascade) {
          if (!window.confirm(`Concluir ${r.open_subtasks} subtarefa(s) também?`)) {
            // Cancelou → reverte para o estado antes do drag.
            setBoard(snapshot)
            return
          }
          await kaguyaApi.complete(taskId, true)
        }
      } else {
        // Coluna comum → atualiza o column_id da tarefa para o membro desta lista.
        await kaguyaApi.updateTask(taskId, { column_id: member.column_id })
      }

      // Reload silencioso: sincroniza com o estado real do banco (sem spinner).
      load(true)
      // Avisa o shell para atualizar contadores da sidebar (open_count por lista).
      onChanged()
    } catch {
      // Erro de rede: reverte para o estado antes do drag.
      setBoard(snapshot)
      toast('Falha ao mover o card.', 'err')
    }
  }, [board, load, onChanged, toast])

  // ── Renderização ──────────────────────────────────────────────────────────

  // Spinner só no primeiro carregamento (firstLoad=true do mount).
  if (firstLoad) {
    return (
      <div className="kg-page">
        <div className="kg-empty">Carregando…</div>
      </div>
    )
  }

  // Grupo sem listas: estado amigável com orientação.
  if (!board || board.lists.length === 0) {
    return (
      <div className="kg-page">
        <div className="kg-empty">
          <div className="kg-empty-title">Grupo vazio</div>
          Adicione listas a este grupo pela sidebar para exibir o board.
        </div>
      </div>
    )
  }

  // Grupo com listas mas sem colunas unificadas: nenhuma lista tem board Kanban.
  if (board.columns.length === 0) {
    return (
      <div className="kg-page">
        <h1 className="kg-page-title">
          <Icon name="board" size={22} /> {board.group.name}
        </h1>
        <div className="kg-empty">
          <div className="kg-empty-title">Nenhuma lista tem board Kanban</div>
          Crie colunas em pelo menos uma lista do grupo para ativar este board.
        </div>
      </div>
    )
  }

  // Mapa rápido project_id → nome da lista (para o chip do card).
  const listMap = new Map<number, GroupBoardList>(board.lists.map(l => [l.id, l]))
  const listName = (projectId: number) => listMap.get(projectId)?.name ?? ''

  // Conjunto de todos os column_ids que aparecem nas colunas unificadas.
  // Tarefas cujo column_id não aparece aqui são "sem coluna" (listas sem board).
  const knownColumnIds = new Set(
    board.columns.flatMap(c => c.members.map(m => m.column_id))
  )

  // Tarefas sem coluna conhecida (listas sem board ou coluna excluída).
  const tasksWithoutColumn = board.tasks.filter(
    t => t.parent_id == null && (t.column_id == null || !knownColumnIds.has(t.column_id))
  )

  // Card ativo no drag (para o DragOverlay seguir o cursor com o visual do card).
  const activeTask = activeId != null ? board.tasks.find(t => t.id === activeId) ?? null : null

  return (
    // DndContext: cobre todo o board (necessário para o drag cruzar colunas).
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="kg-page" style={{ maxWidth: 'none' }}>
        {/* Cabeçalho: ícone de board + nome do grupo */}
        <h1 className="kg-page-title">
          <Icon name="board" size={22} /> {board.group.name}
        </h1>
        {/* Sub-linha: lista das listas que compõem o board */}
        <div className="kg-page-sub" style={{ marginBottom: 8 }}>
          {board.lists.map((l, i) => (
            <span key={l.id}>
              {l.icon ? `${l.icon} ` : ''}{l.name}{i < board.lists.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </div>

        {/* Barra de filtro/ordenação — idêntica à do KanbanScreen de lista.
            Chips de prioridade + ciclo de ordenação (Manual/Vencimento/Prioridade). */}
        <KanbanToolbar filters={filters} onChange={setFilters} />

        {/* Board: mesma moldura "vidro" (.kg-board) do KanbanScreen — garante
            responsividade idêntica: scroll horizontal aparece apenas quando as
            colunas não cabem na tela. */}
        <div className="kg-board">
          <div className="kcols">
            {board.columns.map(col => {
              // Cards desta coluna: tarefas-pai cujo column_id está nos members.
              // applyKanbanFilters filtra por prioridade e ordena conforme `filters`.
              const memberIds = new Set(col.members.map(m => m.column_id))
              const rawCards = board.tasks.filter(
                t => t.parent_id == null && t.column_id != null && memberIds.has(t.column_id)
              )
              const cards = applyKanbanFilters(rawCards, filters)
              return (
                <GroupColumn
                  key={col.key}
                  col={col}
                  cards={cards}
                  activeId={activeId}
                  isOver={overColKey === col.key}
                  listName={listName}
                  onOpen={onOpenTask}
                />
              )
            })}

            {/* Balde "Sem coluna": tarefas de listas sem board — apenas leitura.
                Também aplica filtro de prioridade para consistência com as colunas. */}
            {(() => {
              const filteredWithout = applyKanbanFilters(tasksWithoutColumn, filters)
              return filteredWithout.length > 0 ? (
                <div className="kcol" style={{ opacity: 0.6 }}>
                  <div className="kcol-head">
                    <div className="kc-row1">
                      <span className="kc-num">{filteredWithout.length}</span>
                      <div className="kc-namewrap">
                        <span className="kc-name">Sem coluna</span>
                        <span className="kc-sub">listas sem board Kanban</span>
                      </div>
                    </div>
                  </div>
                  {/* Não droppable: não usa useDroppable; é somente leitura */}
                  <div className="kcol-body">
                    {filteredWithout.map(t => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        onOpen={onOpenTask}
                        projectName={listName(t.project_id)}
                        showChips={true}
                        showRing={true}
                      />
                    ))}
                  </div>
                </div>
              ) : null
            })()}
          </div>
        </div>
      </div>

      {/* DragOverlay: cópia do card que segue o cursor durante o drag.
          dropAnimation={null} = sem animação de retorno ao soltar. */}
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="kg-drag-overlay">
            <TaskCard
              task={activeTask}
              onOpen={onOpenTask}
              projectName={listName(activeTask.project_id)}
              showChips={true}
              showRing={true}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
