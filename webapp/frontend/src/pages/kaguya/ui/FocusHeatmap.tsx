// FocusHeatmap — grade anual de minutos focados por dia (spec 062). Estrutura
// idêntica a HabitHeatmap.tsx (densificação + agrupamento por mês), mas com
// CLASSES PRÓPRIAS (kg-fheat-*) — não reusar as .kg-heat-* dos hábitos mesmo sendo
// o mesmo shell, para manter os dois componentes editáveis independentemente
// (mesma decisão que levou a HabitHeatmap a não importar o heatmap da Frieren).

import { useMemo } from 'react'
import type { FocusHeatDay } from '../types'

interface FocusHeatmapProps {
  data: FocusHeatDay[]  // esparso — só dias com sessão produtiva
  year: number
}

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Nível de intensidade (0–4) a partir dos minutos do dia — limiares fixos, não
// relativos ao histórico do usuário (mesma simplicidade de heatLevel do hábito
// sim/não: previsível, sem recalcular escala a cada novo dado).
function heatLevel(totalMin: number): number {
  if (totalMin <= 0) return 0
  if (totalMin < 30) return 1
  if (totalMin < 60) return 2
  if (totalMin < 120) return 3
  return 4
}

function densify(sparse: FocusHeatDay[], year: number): FocusHeatDay[] {
  const byDate = new Map<string, FocusHeatDay>()
  sparse.forEach((d) => byDate.set(d.date, d))

  const cur = new Date(year, 0, 1)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const end = year < today.getFullYear() ? new Date(year, 11, 31) : today

  const dense: FocusHeatDay[] = []
  while (cur <= end) {
    const y = cur.getFullYear()
    const mo = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    const dateStr = `${y}-${mo}-${d}`
    dense.push(byDate.get(dateStr) ?? { date: dateStr, total_min: 0, sessoes: 0 })
    cur.setDate(cur.getDate() + 1)
  }
  return dense
}

interface MonthGroup {
  m: number
  days: FocusHeatDay[]
}

export function FocusHeatmap({ data, year }: FocusHeatmapProps) {
  const dense = useMemo(() => densify(data, year), [data, year])

  const months: MonthGroup[] = []
  dense.forEach((d) => {
    const m = new Date(d.date + 'T00:00:00').getMonth()
    let g = months.find((x) => x.m === m)
    if (!g) { g = { m, days: [] }; months.push(g) }
    g.days.push(d)
  })

  return (
    <div className="kg-fheat">
      <div className="kg-fheat-months">
        {months.map((g) => {
          const first = new Date(g.days[0].date + 'T00:00:00')
          const lead = first.getDay()

          const cells: (FocusHeatDay | null)[] = []
          for (let i = 0; i < lead; i++) cells.push(null)
          g.days.forEach((d) => cells.push(d))
          while (cells.length % 7 !== 0) cells.push(null)

          const totalMin = g.days.reduce((a, d) => a + d.total_min, 0)

          return (
            <div className="kg-fheat-month" key={g.m}>
              <div className="kg-fheat-head">
                <span className="kg-fheat-name">{MONTH_NAMES[g.m]}</span>
                <span className="kg-fheat-sum">{totalMin}min</span>
              </div>
              <div className="kg-fheat-cells">
                {cells.map((d, i) => (
                  <div
                    key={i}
                    className="kg-fheat-cell"
                    title={d ? (d.total_min > 0 ? `${d.date} · ${d.total_min}min (${d.sessoes} sessão${d.sessoes === 1 ? '' : 'ões'})` : d.date) : ''}
                    style={{
                      background: d != null ? `var(--kg-heat-${heatLevel(d.total_min)})` : 'transparent',
                    }}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="kg-fheat-legend">
        <span>menos</span>
        <span className="kg-fheat-sw">
          {[0, 1, 2, 3, 4].map((i) => (
            <i key={i} style={{ background: `var(--kg-heat-${i})` }} />
          ))}
        </span>
        <span>mais</span>
      </div>
    </div>
  )
}
