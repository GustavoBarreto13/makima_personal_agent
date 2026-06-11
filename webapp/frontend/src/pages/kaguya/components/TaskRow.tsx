// TaskRow — uma linha de tarefa (guia §4.1/§10). Checkbox com pop, traço de
// prioridade (PrioFlag), título editável inline, chips e subtarefas ricas
// expandidas por padrão (cada uma com sua prioridade e descrição).

import { useState } from 'react'
import type { Task } from '../types'
import { Icon } from '../ui/Icons'
import { PrioFlag } from '../ui/PrioFlag'
import { DateChip, ProjChip, TypeGlyph, RecurChip } from '../ui/Chips'

interface TaskRowProps {
  task: Task
  depth?: number              // 0 = pai, 1 = subtarefa
  showProject?: boolean       // mostra o chip da lista (telas flat: Hoje/Busca)
  onToggle: (task: Task) => void          // concluir/reabrir
  onOpen: (task: Task) => void            // abrir o modal de edição
  onRename: (task: Task, title: string) => void
}

export function TaskRow({ task, depth = 0, showProject = false, onToggle, onOpen, onRename }: TaskRowProps) {
  const done = task.completed_at != null
  // Edição inline do título: alterna entre <span> e <input>.
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.title)

  // Vencida = aberta com data anterior a hoje (puxa o lacre para vermelho).
  const today = new Date().toISOString().slice(0, 10)
  const overdue = !done && task.due_date != null && task.due_date < today

  // Salva o título editado (se mudou e não ficou vazio).
  const commit = () => {
    setEditing(false)
    const t = draft.trim()
    if (t && t !== task.title) onRename(task, t)
    else setDraft(task.title)
  }

  return (
    <div className={`kg-row${done ? ' done' : ''}`}>
      <PrioFlag priority={task.priority} overdue={overdue} />

      <button className={`kg-check${done ? ' done' : ''}`} onClick={() => onToggle(task)} aria-label={done ? 'Reabrir' : 'Concluir'}>
        {done && <Icon name="check" size={12} />}
      </button>

      <div className="kg-row-main">
        <div className="kg-row-titleline">
          <TypeGlyph type={task.type} />
          {editing ? (
            <input
              className="kg-input"
              style={{ padding: '2px 4px', fontSize: '13.5px' }}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(task.title) } }}
            />
          ) : (
            // Clique no texto edita; clique no resto da linha abre o modal.
            <span className="kg-row-title" onClick={() => setEditing(true)}>{task.title}</span>
          )}
          {/* botão discreto para abrir o modal completo */}
          <button className="kg-icon-btn" style={{ marginLeft: 'auto', border: 'none', padding: 4 }} onClick={() => onOpen(task)} aria-label="Detalhes">
            <Icon name="dots" size={15} />
          </button>
        </div>

        {/* descrição da subtarefa (subtarefas são ricas) */}
        {depth > 0 && task.description && <div className="kg-sub-desc">{task.description}</div>}

        {(task.due_date || task.recurrence_text || (showProject && task.project_name)) && (
          <div className="kg-row-chips">
            {task.due_date && <DateChip due_date={task.due_date} due_time={task.due_time} />}
            {task.recurrence_text && <RecurChip text={task.recurrence_text} />}
            {showProject && task.project_name && <ProjChip name={task.project_name} />}
          </div>
        )}

        {/* subtarefas ricas, expandidas por padrão */}
        {depth === 0 && task.subtasks && task.subtasks.length > 0 && (
          <div className="kg-subtasks">
            {task.subtasks.map((s) => (
              <TaskRow key={s.id} task={s} depth={1} onToggle={onToggle} onOpen={onOpen} onRename={onRename} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
