// CapacityBar — "Cabe no seu dia?"
// Barra segmentada: agenda (cinza) + tarefas (azul) + estouro (vermelho-lacre).
// Alimentada pelo objeto `capacity` de GET /api/tasks/my-day (nunca recalcula no front).

import type { CapacityStats } from '../types'

function fmtMin(min: number): string {
  if (min <= 0) return '0min'
  const h = Math.floor(Math.abs(min) / 60)
  const m = Math.abs(min) % 60
  if (h === 0) return `${m}min`
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

interface CapacityBarProps {
  capacity: CapacityStats
}

export function CapacityBar({ capacity }: CapacityBarProps) {
  const { agenda_min, estimado_min, livre_min, folga_min, excedeu, calendar_ok } = capacity

  // Janela útil = livre + agenda (= total da janela 8h–22h = 840 min).
  const total = livre_min + agenda_min || 840

  // Larguras dos segmentos como % do total da janela.
  const pctAgenda = Math.min((agenda_min / total) * 100, 100)
  // Tarefas só cabem no livre; o excedente vira o segmento "over".
  const tasksDentro = Math.min(estimado_min, livre_min)
  const tasksOver = Math.max(0, estimado_min - livre_min)
  const pctTasks = (tasksDentro / total) * 100
  const pctOver = (tasksOver / total) * 100

  const livreLabel = excedeu
    ? `+${fmtMin(Math.abs(folga_min))} acima`
    : `${fmtMin(folga_min)} de folga`

  return (
    <div className="kg-capacity">
      <div className="kg-capacity-title">Cabe no seu dia?</div>

      {/* Números */}
      <div className="kg-capacity-numbers">
        {fmtMin(estimado_min)} de tarefas
        {calendar_ok && agenda_min > 0 ? ` · ${fmtMin(agenda_min)} de agenda` : ''}
        {' · '}{livreLabel}
      </div>

      {/* Barra segmentada */}
      <div className="kg-capacity-track" title={`Janela útil: ${fmtMin(total)}`}>
        {/* Agenda já comprometida (cinza escuro) */}
        {pctAgenda > 0 && (
          <div className="kg-capacity-seg agenda" style={{ width: `${pctAgenda}%` }} />
        )}
        {/* Tarefas que cabem no livre (azul) */}
        {pctTasks > 0 && (
          <div className="kg-capacity-seg tasks" style={{ width: `${pctTasks}%` }} />
        )}
        {/* Estouro (vermelho-lacre) */}
        {pctOver > 0 && (
          <div className="kg-capacity-seg over" style={{ width: `${pctOver}%` }} />
        )}
      </div>

      {/* Avisos */}
      {excedeu && (
        <div className="kg-capacity-warn">⚠ Plano excede o tempo disponível</div>
      )}
      {!calendar_ok && (
        <div className="kg-capacity-note">Agenda indisponível — mostrando só tarefas</div>
      )}
    </div>
  )
}
