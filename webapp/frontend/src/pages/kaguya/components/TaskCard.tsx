// TaskCard — card do Kanban (guia §4.2): título + traço de prioridade + chips
// mínimos. Puramente visual — o drag é gerenciado pelo SortableTaskCard wrapper
// (@dnd-kit). Não tem mais `draggable` nativo nem onDragStart.

import type { Task } from '../types'
import { PrioFlag } from '../ui/PrioFlag'
import { DateChip, TypeGlyph } from '../ui/Chips'

interface TaskCardProps {
  task: Task
  onOpen: (task: Task) => void
}

export function TaskCard({ task, onOpen }: TaskCardProps) {
  const done = task.completed_at != null
  // Usa partes locais da data (getFullYear/getMonth/getDate) para evitar o bug
  // de fuso horário: toISOString() retorna UTC, então após as 21h no UTC-3 já
  // apontaria para o dia seguinte. Convenção: sempre usar partes locais aqui.
  const now = new Date()
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const overdue = !done && task.due_date != null && task.due_date < todayISO
  return (
    <div
      className={`kg-card${done ? ' done' : ''}`}
      onClick={() => onOpen(task)}
    >
      <PrioFlag priority={task.priority} overdue={overdue} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="kg-card-title"><TypeGlyph type={task.type} /> {task.title}</div>
        {task.due_date && (
          <div className="kg-row-chips" style={{ marginTop: 6 }}>
            <DateChip due_date={task.due_date} due_time={task.due_time} />
          </div>
        )}
      </div>
    </div>
  )
}
