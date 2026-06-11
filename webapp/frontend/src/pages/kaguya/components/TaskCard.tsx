// TaskCard — card do Kanban (guia §4.2): título + traço de prioridade + chips
// mínimos. Arrastável (o KanbanScreen lê o id no dragstart).

import type { Task } from '../types'
import { PrioFlag } from '../ui/PrioFlag'
import { DateChip, TypeGlyph } from '../ui/Chips'

interface TaskCardProps {
  task: Task
  onDragStart: (taskId: number) => void
  onOpen: (task: Task) => void
}

export function TaskCard({ task, onDragStart, onOpen }: TaskCardProps) {
  const done = task.completed_at != null
  const today = new Date().toISOString().slice(0, 10)
  const overdue = !done && task.due_date != null && task.due_date < today
  return (
    <div
      className={`kg-card${done ? ' done' : ''}`}
      draggable
      onDragStart={() => onDragStart(task.id)}
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
