// Heatmap de sessões por dia do ano (estilo GitHub contributions).
// Agrupado por mês com labels. Intensidade: 0–4 (tokens CSS --heat-0..4).
// Usa os dados do campo `heatmap` retornado por get_stats().

interface HeatmapProps {
  // Mapa de data ISO → contagem de sessões naquele dia
  data: Record<string, number>
  // Ano exibido (usado para gerar os dias do grid)
  year: number
  className?: string
}

// Nomes dos meses em português (abreviados)
const MONTH_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
// Dias da semana (abreviados, começando por dom)
const WEEK_LABELS = ['D','S','T','Q','Q','S','S']

/**
 * Heatmap anual de sessões.
 * Calor: 0 → --heat-0, 1 → --heat-1, 2 → --heat-2, 3 → --heat-3, 4+ → --heat-4.
 */
export function Heatmap({ data, year, className }: HeatmapProps) {
  // Gera todos os dias do ano como strings ISO (YYYY-MM-DD)
  const startDate = new Date(year, 0, 1)
  const endDate   = new Date(year, 11, 31)
  const days: string[] = []
  const d = new Date(startDate)
  while (d <= endDate) {
    days.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 1)
  }

  // Células preenchendo a primeira semana parcial com dias vazios antes do 1º jan
  const firstDow = startDate.getDay()  // 0=dom … 6=sab

  // Converte contagem → nível de calor (0–4)
  function heatLevel(count: number): number {
    if (!count) return 0
    if (count === 1) return 1
    if (count <= 3) return 2
    if (count <= 6) return 3
    return 4
  }

  // Agrupa as células em colunas de semana para o layout de grid
  // Cada coluna = uma semana (7 slots)
  const totalSlots = firstDow + days.length
  const numCols = Math.ceil(totalSlots / 7)

  // Flat array de slots: os firstDow primeiros são vazios
  const slots: Array<{ date: string | null; count: number }> = [
    ...Array.from({ length: firstDow }, () => ({ date: null, count: 0 })),
    ...days.map(d => ({ date: d, count: data[d] ?? 0 })),
  ]
  // Preenche a última semana com slots vazios até completar o grid
  while (slots.length < numCols * 7) slots.push({ date: null, count: 0 })

  // Colunas de semana para o render
  const cols: typeof slots[] = []
  for (let c = 0; c < numCols; c++) {
    cols.push(slots.slice(c * 7, (c + 1) * 7))
  }

  // Gera headers de mês: qual coluna marca o início de cada mês
  const monthHeaders: Array<{ label: string; col: number }> = []
  let lastMonth = -1
  days.forEach((d, i) => {
    const month = new Date(d).getMonth()
    if (month !== lastMonth) {
      const col = Math.floor((firstDow + i) / 7)
      monthHeaders.push({ label: MONTH_LABELS[month], col })
      lastMonth = month
    }
  })

  return (
    <div className={`mr-heatmap${className ? ' ' + className : ''}`}>
      {/* Labels de mês */}
      <div
        className="mr-heatmap-months"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${numCols}, 12px)`,
          marginBottom: 4,
          paddingLeft: 22,  // espaço para os labels de dia da semana
        }}
      >
        {monthHeaders.map(({ label, col }) => (
          <span
            key={label}
            style={{
              gridColumnStart: col + 1,
              fontSize: 9,
              color: 'var(--ink-3)',
              fontFamily: 'var(--mono)',
            }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Grid principal: labels da semana + colunas de dias */}
      <div style={{ display: 'flex', gap: 2 }}>
        {/* Labels de dia da semana */}
        <div
          className="mr-heatmap-weekdays"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            marginRight: 4,
          }}
        >
          {WEEK_LABELS.map((label, i) => (
            <span
              key={i}
              style={{
                height: 12,
                width: 16,
                fontSize: 8,
                color: 'var(--ink-4)',
                fontFamily: 'var(--mono)',
                lineHeight: '12px',
                textAlign: 'right',
              }}
            >
              {/* Mostra apenas seg (1) e qui (4) para não poluir */}
              {i === 1 || i === 4 ? label : ''}
            </span>
          ))}
        </div>

        {/* Colunas de semanas */}
        <div style={{ display: 'flex', gap: 2 }}>
          {cols.map((col, ci) => (
            <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {col.map((slot, si) => (
                <div
                  key={si}
                  className="mr-heat-cell"
                  data-level={slot.date ? heatLevel(slot.count) : undefined}
                  title={slot.date ? `${slot.date}: ${slot.count} sessão(ões)` : undefined}
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    // Sem data = transparente (slot de preenchimento do grid)
                    background: !slot.date
                      ? 'transparent'
                      : `var(--heat-${heatLevel(slot.count)})`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legenda de intensidade */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginTop: 6,
          paddingLeft: 22,
        }}
      >
        <span style={{ fontSize: 9, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>Menos</span>
        {[0, 1, 2, 3, 4].map(level => (
          <div
            key={level}
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: `var(--heat-${level})`,
            }}
          />
        ))}
        <span style={{ fontSize: 9, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>Mais</span>
      </div>
    </div>
  )
}
