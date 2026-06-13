// PlanCard — card de tarefa no plano do dia (e nas sugestões).
// Versão "plano": draggable para a timeline. Versão "sugestão": botão "+ Puxar".

import type { Task } from '../types'
import { kaguyaApi } from '../kaguyaApi'

function fmtMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}min`
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

interface PlanCardProps {
  task: Task
  isSuggestion?: boolean           // true = sem drag, com botão "+ Puxar"
  onChanged: () => void            // recarrega a tela
  onOpen: (task: Task) => void     // abre o TaskModal
  onDragStart?: (taskId: number) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function PlanCard({ task, isSuggestion, onChanged, onOpen, onDragStart, toast }: PlanCardProps) {
  const pull = async () => {
    try {
      await kaguyaApi.addToMyDay(task.id)
      toast('Adicionada ao Meu Dia.')
      onChanged()
    } catch {
      toast('Não foi possível adicionar.', 'err')
    }
  }

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      if (task.completed_at) {
        await kaguyaApi.reopen(task.id)
      } else {
        const r = await kaguyaApi.complete(task.id)
        if (r.needs_cascade) {
          if (!window.confirm(`Concluir ${r.open_subtasks} subtarefa(s) também?`)) return
          await kaguyaApi.complete(task.id, true)
        }
      }
      onChanged()
    } catch {
      toast('Não foi possível atualizar.', 'err')
    }
  }

  // Ícone de tipo (event / birthday / task padrão).
  const typeGlyph = task.type === 'event' ? '📅' : task.type === 'birthday' ? '🎂' : ''

  return (
    <div
      className={`kg-plan-card${isSuggestion ? ' no-drag' : ''}`}
      data-prio={task.priority}
      draggable={!isSuggestion}
      onDragStart={!isSuggestion && onDragStart
        ? (e) => { e.dataTransfer.setData('text/plain', String(task.id)); onDragStart(task.id) }
        : undefined
      }
      onClick={() => onOpen(task)}
      title={task.title}
    >
      {/* Checkbox */}
      <button
        onClick={toggle}
        style={{
          width: 17, height: 17, borderRadius: '50%', border: '2px solid var(--line)',
          background: task.completed_at ? 'var(--done)' : 'none',
          cursor: 'pointer', flexShrink: 0, marginTop: 2,
        }}
        aria-label="Concluir"
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Título */}
        <div className="kg-plan-card-title">
          {typeGlyph && <span style={{ marginRight: 4 }}>{typeGlyph}</span>}
          {task.title}
        </div>

        {/* Chips: bloco de tempo + projeto */}
        <div className="kg-plan-card-chips">
          {task.start_at && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--kg-deep)' }}>
              {fmtTime(task.start_at)}
              {task.end_at ? `–${fmtTime(task.end_at)}` : ''}
            </span>
          )}
          {task.project_name && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)' }}>
              {task.project_name}
            </span>
          )}
          {isSuggestion && task.due_date && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--p-high)' }}>
              vence {new Date(task.due_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
      </div>

      {/* Estimativa à direita */}
      {task.duration_min && !isSuggestion && (
        <span className="kg-plan-card-est">{fmtMin(task.duration_min)}</span>
      )}

      {/* Botão "+ Puxar" nas sugestões */}
      {isSuggestion && (
        <button className="kg-plan-pull-btn" onClick={(e) => { e.stopPropagation(); pull() }}>
          + Puxar
        </button>
      )}
    </div>
  )
}
