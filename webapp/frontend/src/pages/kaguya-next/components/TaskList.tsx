// Lista de tarefas (estilo TickTick) sobre os grupos do motor de coleções: subtarefas recolhíveis, seleção
// (Ctrl/⌘ ou Shift + clique, ou a tecla X), teclado (↑↓ Espaço Enter 0–3 T A Delete) e a barra de ação em massa.
// A ordenação/agrupamento/filtros vêm de fora (CollectionToolbar); aqui só se desenha e se age.

import { DndContext, DragOverlay, closestCenter, useDraggable, useDroppable, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Icon, toast } from '../../../design'
import type { Group } from '../../../design/core/collection'
import { addDaysISO } from '../../../design/core/format'
import { kaguyaApi } from '../api'
import { useKaguya } from '../context'
import * as act from '../lib/actions'
import { useDndSensors } from '../lib/dnd'
import { findTask, indentBody, isDescendant, moveBody, outdentBody, restoreBody, shiftBody, zoneAt, type DropZone, type MoveBody } from '../lib/reorder'
import { PRIORITY_LABEL } from '../lib/taskView'
import type { Task } from '../types'
import { BulkBar } from './BulkBar'
import { TaskRow } from './TaskRow'

interface Props {
  groups: Group<Task>[]
  /** Mostra o nome da lista em cada linha (visões que cruzam listas). */
  showProject?: boolean
  /** Concluídas do final da lista (já separadas pela tela). */
  completed?: Task[]
  /** Permite arrastar para reordenar e aninhar (só faz sentido na ordem manual, sem agrupar). */
  reorderable?: boolean
}

interface Visible { task: Task; depth: number }

/** Linhas visíveis de um grupo, respeitando o que está expandido. */
function flatten(tasks: Task[], expanded: Set<number>, depth = 0): Visible[] {
  return tasks.flatMap((t) => [
    { task: t, depth },
    ...(expanded.has(t.id) && t.subtasks?.length ? flatten(t.subtasks, expanded, depth + 1) : []),
  ])
}

/** A linha que se arrasta (pela alça) e recebe soltura: um só hook por linha, ref combinada. */
function DndRow({ row, index, zone, dragging, children }: { row: Visible; index: number; zone: DropZone | null; dragging: boolean; children: (p: { rowRef: (n: HTMLLIElement | null) => void; grip: React.ReactNode; dropZone: DropZone | null; dragging: boolean }) => React.ReactNode }) {
  const drag = useDraggable({ id: row.task.id })
  const drop = useDroppable({ id: row.task.id })
  const rowRef = (n: HTMLLIElement | null) => { drag.setNodeRef(n); drop.setNodeRef(n) }
  const grip = (
    <button type="button" className="kn-grip" aria-label={`Arrastar “${row.task.title}” (ou use Alt + setas)`} {...drag.attributes} {...drag.listeners} data-index={index}>
      <Icon name="drag" size={14} />
    </button>
  )
  return <>{children({ rowRef, grip, dropZone: zone, dragging })}</>
}

export function TaskList({ groups, showProject, completed = [], reorderable }: Props) {
  const k = useKaguya()
  const deps = useMemo(() => ({ reload: k.reload }), [k.reload])
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [cursor, setCursor] = useState<number>(-1)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())
  const [showDone, setShowDone] = useState(false)
  const lastClicked = useRef<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // ── Arrastar para reordenar/aninhar ──────────────────────────────────────────
  const sensors = useDndSensors()
  const pointerY = useRef(0)
  const [dragId, setDragId] = useState<number | null>(null)
  const [drop, setDrop] = useState<{ id: number; zone: DropZone } | null>(null)
  const tree = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const trackPointer = useCallback((e: PointerEvent) => { pointerY.current = e.clientY }, [])
  useEffect(() => () => window.removeEventListener('pointermove', trackPointer), [trackPointer])

  const applyMove = useCallback(async (id: number, body: MoveBody | null, label: string) => {
    if (!body) return
    const undo = restoreBody(tree, id)
    try {
      await kaguyaApi.moveTask(id, body)
      toast(label, { tone: 'success', undo: undo ? () => { void kaguyaApi.moveTask(id, undo).then(k.reload).catch(() => toast('Não foi possível desfazer.', { tone: 'error' })) } : undefined })
      k.reload()
    } catch (e) { toast(e instanceof Error && !/^HTTP \d+$/.test(e.message) ? e.message : 'Não foi possível mover a tarefa.', { tone: 'error' }) }
  }, [tree, k])

  const zoneFor = (targetId: number): DropZone => {
    const el = document.querySelector(`[data-task-id="${targetId}"]`)
    if (!el) return 'after'
    const r = el.getBoundingClientRect()
    return zoneAt((pointerY.current - r.top) / (r.height || 1))
  }
  const onDragStart = (e: DragStartEvent) => { setDragId(Number(e.active.id)); setDrop(null); window.addEventListener('pointermove', trackPointer) }
  const onDragOver = (e: DragOverEvent) => {
    const over = e.over ? Number(e.over.id) : null
    const from = Number(e.active.id)
    if (over == null || over === from || isDescendant(tree, from, over)) { setDrop(null); return }
    const zone = zoneFor(over)
    setDrop((p) => (p && p.id === over && p.zone === zone ? p : { id: over, zone }))
  }
  const endDrag = () => { window.removeEventListener('pointermove', trackPointer); setDragId(null); setDrop(null) }
  const onDragEnd = (e: DragEndEvent) => {
    const from = Number(e.active.id)
    if (drop) void applyMove(from, moveBody(tree, from, drop.id, drop.zone), drop.zone === 'child' ? 'Virou subtarefa.' : 'Tarefa movida.')
    endDrag()
  }

  const sections = useMemo(
    () => groups.map((g) => ({ key: g.key, rows: collapsedGroups.has(g.key) ? [] : flatten(g.items, expanded), total: g.items.length })),
    [groups, expanded, collapsedGroups],
  )
  const rows = useMemo(() => sections.flatMap((s) => s.rows), [sections])
  const byId = useMemo(() => new Map(rows.map((r) => [r.task.id, r.task])), [rows])

  // Se a tela recarrega e a tarefa selecionada sumiu, tira da seleção.
  useEffect(() => {
    setSelected((cur) => {
      const next = new Set([...cur].filter((id) => byId.has(id)))
      return next.size === cur.size ? cur : next
    })
  }, [byId])

  const toggleExpand = useCallback((id: number) => setExpanded((cur) => {
    const next = new Set(cur)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }), [])

  const select = useCallback((id: number, e?: MouseEvent) => {
    setSelected((cur) => {
      const next = new Set(cur)
      if (e?.shiftKey && lastClicked.current !== null) {
        const a = rows.findIndex((r) => r.task.id === lastClicked.current)
        const b = rows.findIndex((r) => r.task.id === id)
        if (a !== -1 && b !== -1) rows.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((r) => next.add(r.task.id))
      } else if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    lastClicked.current = id
  }, [rows])

  const menuFor = useCallback((t: Task) => [
    { id: 'open', label: 'Abrir', onSelect: () => k.openTask(t.id) },
    ...(reorderable ? [
      { id: 'up', label: 'Subir', disabled: !shiftBody(tree, t.id, -1), onSelect: () => void applyMove(t.id, shiftBody(tree, t.id, -1), 'Tarefa movida.') },
      { id: 'down', label: 'Descer', disabled: !shiftBody(tree, t.id, 1), onSelect: () => void applyMove(t.id, shiftBody(tree, t.id, 1), 'Tarefa movida.') },
      { id: 'indent', label: 'Tornar subtarefa da anterior', disabled: !indentBody(tree, t.id), onSelect: () => void applyMove(t.id, indentBody(tree, t.id), 'Virou subtarefa.') },
      { id: 'outdent', label: 'Tirar de subtarefa', disabled: !outdentBody(tree, t.id), onSelect: () => void applyMove(t.id, outdentBody(tree, t.id), 'Agora é uma tarefa do nível acima.') },
    ] : []),
    t.my_day_date === k.today
      ? { id: 'myday', label: 'Tirar do Meu Dia', onSelect: () => void act.removeFromMyDay(deps, [t.id]) }
      : { id: 'myday', label: 'Adicionar ao Meu Dia', onSelect: () => void act.addToMyDay(deps, [t.id]) },
    { id: 'today', label: 'Vence hoje', onSelect: () => void act.setDueDate(deps, [t.id], k.today) },
    { id: 'tomorrow', label: 'Vence amanhã', onSelect: () => void act.setDueDate(deps, [t.id], addDaysISO(k.today, 1)) },
    { id: 'dup', label: 'Duplicar', onSelect: () => void act.duplicate(deps, t) },
    { id: 'del', label: 'Excluir', onSelect: () => void act.deleteTasks(deps, [t]) },
  ], [k, deps, reorderable, tree, applyMove])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return
    const cur = rows[cursor]?.task
    // Alt + setas: reordenar e aninhar pelo teclado (o mesmo que arrastar).
    if (reorderable && cur && e.altKey && e.key.startsWith('Arrow')) {
      const body = e.key === 'ArrowUp' ? shiftBody(tree, cur.id, -1) : e.key === 'ArrowDown' ? shiftBody(tree, cur.id, 1) : e.key === 'ArrowRight' ? indentBody(tree, cur.id) : outdentBody(tree, cur.id)
      e.preventDefault()
      void applyMove(cur.id, body, e.key === 'ArrowRight' ? 'Virou subtarefa.' : 'Tarefa movida.')
      return
    }
    const move = (d: number) => { e.preventDefault(); setCursor(Math.min(rows.length - 1, Math.max(0, (cursor < 0 ? (d > 0 ? -1 : rows.length) : cursor) + d))) }
    switch (e.key) {
      case 'ArrowDown': return move(1)
      case 'ArrowUp': return move(-1)
      case 'ArrowRight': if (cur?.subtasks?.length) { e.preventDefault(); setExpanded((s) => new Set(s).add(cur.id)) } return
      case 'ArrowLeft': if (cur && expanded.has(cur.id)) { e.preventDefault(); toggleExpand(cur.id) } return
      case ' ': if (cur) { e.preventDefault(); void act.toggleComplete(deps, cur) } return
      case 'Enter': if (cur) { e.preventDefault(); k.openTask(cur.id) } return
      case 'x': case 'X': if (cur) { e.preventDefault(); select(cur.id) } return
      case 'Escape': if (selected.size) { e.preventDefault(); setSelected(new Set()) } return
      case 'Delete': case 'Backspace': {
        if (!cur) return
        e.preventDefault()
        const targets = selected.size ? [...selected].map((id) => byId.get(id)).filter((t): t is Task => !!t) : [cur]
        void act.deleteTasks(deps, targets).then((ok) => ok && setSelected(new Set()))
        return
      }
      case 't': case 'T': if (cur) { e.preventDefault(); void act.addToMyDay(deps, [cur.id]) } return
      case 'a': case 'A': if (cur) { e.preventDefault(); void act.setDueDate(deps, [cur.id], addDaysISO(k.today, 1)) } return
      default:
        if (cur && /^[0-3]$/.test(e.key)) {
          e.preventDefault()
          const p = Number(e.key)
          void act.setPriority(deps, selected.size ? [...selected] : [cur.id], p).then(() => toast(`Prioridade: ${PRIORITY_LABEL[p]}.`))
        }
    }
  }

  const selectedTasks = [...selected].map((id) => byId.get(id)).filter((t): t is Task => !!t)

  const renderRow = (r: Visible, i: number) => (reorderable ? (
    <DndRow key={r.task.id} row={r} index={i} zone={drop?.id === r.task.id ? drop.zone : null} dragging={dragId === r.task.id}>
      {(p) => rowFor(r, i, p)}
    </DndRow>
  ) : rowFor(r, i))

  const rowFor = (r: Visible, i: number, dnd?: { rowRef: (n: HTMLLIElement | null) => void; grip: React.ReactNode; dropZone: DropZone | null; dragging: boolean }) => (
    <TaskRow
      key={r.task.id}
      task={r.task}
      rowRef={dnd?.rowRef}
      grip={dnd?.grip}
      dropZone={dnd?.dropZone}
      dragging={dnd?.dragging}
      today={k.today}
      depth={r.depth}
      selected={selected.has(r.task.id)}
      active={k.route.taskId === r.task.id}
      focused={rows[cursor]?.task.id === r.task.id}
      showProject={showProject}
      showDetails={k.prefs.showDetails}
      expanded={r.task.subtasks?.length ? expanded.has(r.task.id) : undefined}
      onToggleExpand={() => toggleExpand(r.task.id)}
      onToggle={() => void act.toggleComplete(deps, r.task)}
      onOpen={() => { setCursor(i); k.openTask(r.task.id) }}
      onSelect={(e) => select(r.task.id, e)}
      menu={menuFor(r.task)}
    />
  )

  let offset = 0
  const dragged = dragId != null ? findTask(tree, dragId) : undefined
  const body = (
    <div className="kn-list" ref={listRef} role="tree" aria-label="Tarefas" tabIndex={0} onKeyDown={onKeyDown}>
      {selectedTasks.length > 0 && (
        <BulkBar tasks={selectedTasks} today={k.today} projects={k.projects} reload={k.reload} onClear={() => setSelected(new Set())} />
      )}
      {sections.map((s) => {
        const start = offset
        offset += s.rows.length
        const named = s.key !== ''
        return (
          <section key={s.key || '_'} className="kn-section">
            {named && (
              <button type="button" className="kn-sec-h" aria-expanded={!collapsedGroups.has(s.key)} onClick={() => setCollapsedGroups((cur) => {
                const next = new Set(cur)
                if (next.has(s.key)) next.delete(s.key)
                else next.add(s.key)
                return next
              })}>
                <Icon name={collapsedGroups.has(s.key) ? 'right' : 'down'} size={14} />
                <span>{s.key}</span>
                <span className="kn-count">{s.total}</span>
              </button>
            )}
            <ul className="kn-rows">{s.rows.map((r, i) => renderRow(r, start + i))}</ul>
          </section>
        )
      })}

      {k.prefs.showCompleted && completed.length > 0 && (
        <section className="kn-section kn-completed">
          <button type="button" className="kn-sec-h" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
            <Icon name={showDone ? 'down' : 'right'} size={14} />
            <span>Concluídas</span>
            <span className="kn-count">{completed.length}</span>
          </button>
          {showDone && (
            <ul className="kn-rows">
              {completed.map((t) => (
                <TaskRow key={t.id} task={t} today={k.today} showProject={showProject} showDetails={false}
                  onToggle={() => void act.toggleComplete(deps, t)} onOpen={() => k.openTask(t.id)} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
  return reorderable ? (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={endDrag}>
      {body}
      <DragOverlay dropAnimation={null}>{dragged ? <div className="kn-drag-ghost">{dragged.title}</div> : null}</DragOverlay>
    </DndContext>
  ) : body
}
