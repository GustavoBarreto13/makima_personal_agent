// Card do Kanban: barra de prioridade no topo, título, linha de meta (data relativa · estimativa · lista) e, à
// direita, o check de concluída ou o anel de subtarefas. É só a pele do card original — a estrutura é a mesma.
// O arraste fica no `KanbanSortableCard` (@dnd-kit); o card em si não tem draggable nativo.

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties } from 'react'
import { Avatar, Icon, ProgressRing } from '../../../design'
import { useKaguya } from '../context'
import { dueInfo, fmtMinutes, subtaskProgress } from '../lib/taskView'
import type { Task } from '../types'

const PRIO_COLOR = ['transparent', 'var(--p-low)', 'var(--p-med)', 'var(--p-high)']

interface CardProps {
  task: Task
  onOpen: (task: Task) => void
  /** Nome da lista (o board é por lista, mas o do grupo mistura várias). */
  projectName?: string
  /** Adornos da view ativa; ligados por padrão (a view “Completa”). */
  showChips?: boolean
  showRing?: boolean
}

export function KanbanCard({ task, onOpen, projectName, showChips = true, showRing = true }: CardProps) {
  const k = useKaguya()
  const done = task.completed_at != null
  const prio = task.priority ?? 0
  const sub = subtaskProgress(task)
  const due = task.due_date ? dueInfo(task, k.today) : null
  const hasMeta = !!task.due_date || (!!task.duration_min && !done) || !!projectName

  return (
    <div
      className={`kcard${done ? ' done' : ''}`}
      data-prio={prio}
      style={{ '--pr-color': PRIO_COLOR[prio] } as CSSProperties}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(task) }}
    >
      <span className="kcard-prio-dot" />
      <div className="kcard-body">
        <div className="kcard-title">{task.title}</div>
        {showChips && hasMeta && (
          <div className="kcard-meta">
            {due && (
              <span className={`kcard-date${due.tone === 'later' ? '' : ` ${due.tone}`}`}><Icon name="calendar" size={11} />{due.label}</span>
            )}
            {task.duration_min != null && !done && <span className="kcard-est">{fmtMinutes(task.duration_min)}</span>}
            {projectName && <span className="kcard-proj"><i /><span>{projectName}</span></span>}
          </div>
        )}
      </div>
      <div className="kcard-right">
        {task.assignees && task.assignees.length > 0 && (
          <span className="kn-kavs">{task.assignees.slice(0, 2).map((a) => <Avatar key={a.id} name={a.name} src={a.avatar_url} size={18} />)}</span>
        )}
        {done ? (
          <span className="kcard-done" aria-label="Concluída"><Icon name="check" size={11} /></span>
        ) : showRing && sub ? (
          <span className="kcard-ring">
            <ProgressRing value={sub.done / sub.total} size={30} label={`${sub.done} de ${sub.total} subtarefas`} />
            <span className="kr-lbl" aria-hidden="true">{sub.done}/{sub.total}</span>
          </span>
        ) : null}
      </div>
    </div>
  )
}

/** Card arrastável: o slot original fica translúcido enquanto o card segue o cursor (DragOverlay). */
export function KanbanSortableCard({ task, isBeingDragged, ...rest }: CardProps & { isBeingDragged: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isBeingDragged ? 0.35 : 1,
    cursor: isBeingDragged ? 'grabbing' : 'grab',
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCard task={task} {...rest} />
    </div>
  )
}
