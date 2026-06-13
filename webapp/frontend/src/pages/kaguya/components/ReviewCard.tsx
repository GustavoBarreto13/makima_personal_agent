// ReviewCard — card de pendência de ontem no ritual do Meu Dia.
// Exibe o título, quando venceu, e as 3 ações: Hoje / Amanhã / Depois.
// "Depois" zera my_day_date mas NÃO apaga a tarefa (spec edge case).

import type { Task } from '../types'
import { kaguyaApi } from '../kaguyaApi'

interface ReviewCardProps {
  task: Task
  onDone: () => void                           // chamado após qualquer ação
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function ReviewCard({ task, onDone, toast }: ReviewCardProps) {
  // Formata a data no fuso local.
  const dateLabel = task.my_day_date
    ? new Date(task.my_day_date + 'T12:00:00').toLocaleDateString('pt-BR', {
        weekday: 'short', day: 'numeric', month: 'short',
      })
    : ''

  const act = async (when: 'today' | 'tomorrow' | 'later') => {
    try {
      await kaguyaApi.reschedule(task.id, when)
      // Feedback visual mínimo; a tela recarrega via onDone.
      const msgs = { today: 'Movida para hoje.', tomorrow: 'Movida para amanhã.', later: 'Retirada do Meu Dia.' }
      toast(msgs[when])
      onDone()
    } catch {
      toast('Não foi possível reagendar.', 'err')
    }
  }

  const toggle = async () => {
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
      onDone()
    } catch {
      toast('Não foi possível atualizar.', 'err')
    }
  }

  return (
    <div className="kg-review-card">
      {/* Checkbox de conclusão */}
      <button
        onClick={toggle}
        style={{
          width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--line)',
          background: task.completed_at ? 'var(--done)' : 'none',
          cursor: 'pointer', flexShrink: 0, marginTop: 2,
        }}
        aria-label="Concluir"
      />

      <div className="kg-review-body">
        <div className="kg-review-title">{task.title}</div>
        <div className="kg-review-meta">
          {dateLabel && `Planejada em ${dateLabel}`}
          {task.project_name ? ` · ${task.project_name}` : ''}
        </div>

        {/* Ações do ritual */}
        <div className="kg-review-actions">
          <button className="kg-review-btn primary" onClick={() => act('today')}>Hoje</button>
          <button className="kg-review-btn" onClick={() => act('tomorrow')}>Amanhã</button>
          <button className="kg-review-btn" onClick={() => act('later')}>Depois</button>
        </div>
      </div>
    </div>
  )
}
