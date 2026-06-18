// SummaryFooter — rodapé-resumo do board "Vidro" (spec 024, R14/R15).
// Três slots de métrica; cada slot é definido pela view ativa (US2). No US1 o
// default é ['abertas','tempo_estimado','em_andamento'] (a view built-in "Completa").
// Todas as métricas recalculam sobre o conjunto de tarefas recebido (já filtrado).

import type { Task, Column, SummaryMetric } from '../types'
import { todayLocalISO } from '../../violet/dateUtils'

// Rótulos pt-BR das métricas do catálogo (R15). O tipo vive em types.ts.
const METRIC_LABEL: Record<SummaryMetric, string> = {
  abertas: 'tarefas abertas',
  tempo_estimado: 'tempo estimado',
  concluidas: 'concluídas',
  concluidas_hoje: 'concluídas hoje',
  em_andamento: 'em andamento',
}

interface SummaryFooterProps {
  tasks: Task[]
  columns: Column[]
  slots?: SummaryMetric[]   // 3 chaves; default = view "Completa"
}

function fmtEst(min: number): string {
  if (min < 60) return `${min}min`
  const h = min / 60
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`
}

// Data local "YYYY-MM-DD" de um timestamp (UTC-3 via partes locais — CLAUDE.md).
function localDateOf(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function SummaryFooter({
  tasks,
  columns,
  slots = ['abertas', 'tempo_estimado', 'em_andamento'],
}: SummaryFooterProps) {
  const firstColId = columns[0]?.id ?? null
  const open = tasks.filter(t => t.completed_at == null)

  // Calcula o valor formatado de uma métrica do catálogo.
  const valueOf = (m: SummaryMetric): string => {
    switch (m) {
      case 'abertas':
        return String(open.length)
      case 'tempo_estimado': {
        const sum = open.reduce((s, t) => s + (t.duration_min ?? 0), 0)
        return sum > 0 ? fmtEst(sum) : '—'
      }
      case 'concluidas':
        return String(tasks.filter(t => t.completed_at != null).length)
      case 'concluidas_hoje': {
        const today = todayLocalISO()
        return String(tasks.filter(t => t.completed_at != null && localDateOf(t.completed_at) === today).length)
      }
      case 'em_andamento':
        return String(open.filter(t => t.column_id != null && t.column_id !== firstColId).length)
    }
  }

  // Garante exatamente 3 slots (defensivo se a view vier malformada).
  const three = slots.slice(0, 3)

  return (
    <div className="ksummary">
      {three.map((m, i) => (
        <div key={m} style={{ display: 'contents' }}>
          {i > 0 && <div className="ks-sep" />}
          <div className="ks-stat">
            <span className="ks-v">{valueOf(m)}</span>
            <span className="ks-k">{METRIC_LABEL[m]}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
