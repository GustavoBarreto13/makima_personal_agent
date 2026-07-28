// Heatmap de atividade — visualiza sessões assistidas por dia agrupadas por mês.
// Portado de webapp/frontend/src/pages/frieren/ui/Heatmap.tsx (spec 051, US4):
// mesmo padrão, trocando o campo "pages" por "count" (sessões, não páginas).
//
// IMPORTANTE: o backend (get_heatmap) devolve apenas os dias com sessão (array
// esparso). O componente precisa de um array DENSO (todos os dias do ano,
// incluindo os com count=0) para a grade ficar contínua e alinhada por dia da
// semana — densificação feita aqui dentro, mesmo padrão do heatmap da Frieren.

import { useMemo } from 'react'
import type { HeatmapDay } from '../types'

interface HeatmapProps {
  // Array de dias com data e quantidade de sessões. Pode ser esparso — o
  // componente densifica internamente.
  data: HeatmapDay[]
}

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Calcula o nível de intensidade (0 a 4) para um dado número de sessões no dia.
function heatLevel(count: number): number {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count === 2) return 2
  if (count === 3) return 3
  return 4  // 4+ sessões no mesmo dia (maratona)
}

// Transforma o array esparso em um array DENSO cobrindo todos os dias do ano
// (mesmo motivo/lógica do heatmap da Frieren: alinhamento de grade + evitar
// meses sem sessão sumindo da visualização). Usa partes locais de data
// (getFullYear/getMonth/getDate), nunca toISOString() (retorna UTC).
function densify(sparse: HeatmapDay[]): HeatmapDay[] {
  const countByDate = new Map<string, number>()
  sparse.forEach(d => countByDate.set(d.date, d.count))

  const year = sparse.length > 0
    ? new Date(sparse[0].date + 'T00:00:00').getFullYear()
    : new Date().getFullYear()

  const cur = new Date(year, 0, 1)
  const end = new Date(year, 11, 31)

  const dense: HeatmapDay[] = []
  while (cur <= end) {
    const y = cur.getFullYear()
    const mo = String(cur.getMonth() + 1).padStart(2, '0')
    const d  = String(cur.getDate()).padStart(2, '0')
    const dateStr = `${y}-${mo}-${d}`
    dense.push({ date: dateStr, count: countByDate.get(dateStr) ?? 0 })
    cur.setDate(cur.getDate() + 1)
  }

  return dense
}

interface MonthGroup {
  m: number
  days: HeatmapDay[]
}

/** Heatmap de sessões assistidas por dia, agrupado por mês em grade 7×N. */
export function Heatmap({ data }: HeatmapProps) {
  const dense = useMemo(() => densify(data), [data])

  const months: MonthGroup[] = []
  dense.forEach(d => {
    const m = new Date(d.date + 'T00:00:00').getMonth()
    let g = months.find(x => x.m === m)
    if (!g) {
      g = { m, days: [] }
      months.push(g)
    }
    g.days.push(d)
  })

  return (
    <div>
      <div className="heat-months-wrap">
        {months.map(g => {
          const first = new Date(g.days[0].date + 'T00:00:00')
          const lead = first.getDay()

          const cells: (HeatmapDay | null)[] = []
          for (let i = 0; i < lead; i++) cells.push(null)
          g.days.forEach(d => cells.push(d))
          while (cells.length % 7 !== 0) cells.push(null)

          return (
            <div className="heat-month" key={g.m}>
              {/* Cabeçalho do mês: nome + soma de sessões (padrão hm-head do handoff) */}
              <div className="hm-head">
                <span className="hm-name">{MONTH_NAMES[g.m]}</span>
                <span className="hm-sum">{g.days.reduce((a, d) => a + d.count, 0)}</span>
              </div>
              <div className="hm-cells">
                {cells.map((d, i) => (
                  <div
                    key={i}
                    className="hm-cell"
                    title={d ? (d.count > 0 ? `${d.date} · ${d.count} sessão${d.count !== 1 ? 'ões' : ''}` : d.date) : ''}
                    style={{
                      background: d != null ? `var(--heat-${heatLevel(d.count)})` : 'transparent',
                    }}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="heat-legend">
        <span>menos</span>
        <span className="heat-sw">
          {[0, 1, 2, 3, 4].map(i => (
            <i key={i} style={{ background: `var(--heat-${i})` }} />
          ))}
        </span>
        <span>mais</span>
      </div>
    </div>
  )
}
