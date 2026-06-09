// Gráfico de barras duplas verticais por mês — entradas (verde) e saídas (coral).
// Escala relativa ao maior valor. Mês atual destacado com fundo pill.
// Props: data[] com month/income/expense, currentMonth string.

interface MonthEntry {
  month: string   // formato YYYY-MM
  income: number
  expense: number
}

interface CashflowChartProps {
  data: MonthEntry[]
  currentMonth: string  // formato YYYY-MM para destaque
}

/** Gráfico de fluxo de caixa histórico (barras SVG/CSS). */
export function CashflowChart({ data, currentMonth }: CashflowChartProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--ink-4)', fontSize: 12.5 }}>
        Sem histórico
      </div>
    )
  }

  // Usa apenas os últimos 6 meses para não sobrecarregar visualmente
  const entries = data.slice(-6)

  // Valor máximo para escalar todas as barras
  const maxVal = Math.max(...entries.flatMap(e => [e.income, e.expense]), 1)

  const BAR_HEIGHT = 64   // altura máxima das barras em px
  const BAR_W     = 10    // largura de cada barra em px

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Barras */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: BAR_HEIGHT + 4 }}>
        {entries.map(entry => {
          const isCurrent = entry.month === currentMonth
          const inH  = Math.max((entry.income  / maxVal) * BAR_HEIGHT, 2)
          const outH = Math.max((entry.expense / maxVal) * BAR_HEIGHT, 2)

          // Legenda do mês: exibe "MM" (os dois últimos dígitos do mês)
          const monthLabel = entry.month.slice(5)  // ex.: "06" de "2026-06"

          return (
            <div
              key={entry.month}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {/* Barras duplas lado a lado */}
              <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: BAR_HEIGHT }}>
                {/* Barra de entradas (verde) */}
                <div style={{
                  width: BAR_W,
                  height: inH,
                  background: 'var(--in)',
                  borderRadius: '3px 3px 0 0',
                  opacity: isCurrent ? 1 : 0.7,
                }} />
                {/* Barra de saídas (coral) */}
                <div style={{
                  width: BAR_W,
                  height: outH,
                  background: 'var(--out)',
                  borderRadius: '3px 3px 0 0',
                  opacity: isCurrent ? 1 : 0.7,
                }} />
              </div>

              {/* Rótulo do mês com destaque pill no mês atual */}
              <div style={{
                fontSize: 10,
                color: isCurrent ? 'var(--tang)' : 'var(--ink-4)',
                fontFamily: 'var(--mono)',
                fontWeight: isCurrent ? 700 : 400,
                background: isCurrent ? 'var(--tang-tint)' : 'transparent',
                borderRadius: isCurrent ? 4 : 0,
                padding: isCurrent ? '1px 4px' : undefined,
                whiteSpace: 'nowrap',
              }}>
                {monthLabel}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legenda */}
      <div style={{ display: 'flex', gap: 14, marginTop: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ink-3)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--in)', display: 'inline-block' }} />
          Entradas
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ink-3)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--out)', display: 'inline-block' }} />
          Saídas
        </div>
      </div>
    </div>
  )
}
