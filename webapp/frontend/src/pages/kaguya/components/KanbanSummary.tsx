// Rodapé-resumo do board: três métricas escolhidas pela view ativa, recalculadas sobre as tarefas visíveis.

import { isoDate } from '../../../design/core/format'
import { fmtMinutes } from '../lib/taskView'
import type { Column, SummaryMetric, Task } from '../types'

const LABEL: Record<SummaryMetric, string> = {
  abertas: 'tarefas abertas', tempo_estimado: 'tempo estimado', concluidas: 'concluídas', concluidas_hoje: 'concluídas hoje', em_andamento: 'em andamento',
}

export const DEFAULT_SLOTS: SummaryMetric[] = ['abertas', 'tempo_estimado', 'em_andamento']

export function KanbanSummary({ tasks, columns, slots = DEFAULT_SLOTS, today }: { tasks: Task[]; columns: Column[]; slots?: SummaryMetric[]; today: string }) {
  const firstCol = columns[0]?.id ?? null
  const open = tasks.filter((t) => t.completed_at == null)
  const value = (m: SummaryMetric): string => {
    switch (m) {
      case 'abertas': return String(open.length)
      case 'tempo_estimado': { const sum = open.reduce((s, t) => s + (t.duration_min ?? 0), 0); return sum > 0 ? fmtMinutes(sum) : '—' }
      case 'concluidas': return String(tasks.filter((t) => t.completed_at != null).length)
      // O dia vem do instante local (UTC-3 pelas partes locais), nunca de toISOString().
      case 'concluidas_hoje': return String(tasks.filter((t) => t.completed_at != null && isoDate(new Date(t.completed_at)) === today).length)
      case 'em_andamento': return String(open.filter((t) => t.column_id != null && t.column_id !== firstCol).length)
    }
  }
  return (
    <div className="ksummary" role="group" aria-label="Resumo do quadro">
      {slots.slice(0, 3).map((m, i) => (
        <div key={m} style={{ display: 'contents' }}>
          {i > 0 && <div className="ks-sep" />}
          <div className="ks-stat"><span className="ks-v">{value(m)}</span><span className="ks-k">{LABEL[m]}</span></div>
        </div>
      ))}
    </div>
  )
}
