// Gráfico de rosca (donut) em SVG puro — sem biblioteca externa.
// Usa stroke-dasharray / stroke-dashoffset em <circle> para desenhar as fatias.
// Props: data[] com categoria, total e pct (0-100).

interface DonutSlice {
  categoria: string
  total: number
  pct: number
}

interface DonutChartProps {
  data: DonutSlice[]
}

// Mapa de cor por categoria — mesmas cores do TxRow para consistência
const CAT_COLOR: Record<string, string> = {
  Alimentacao: '#F59E0B', 'Comer Fora': '#F97316', Saude: '#10B981',
  Lazer: '#8B5CF6', Transporte: '#3B82F6', Moradia: '#6366F1',
  Roupas: '#EC4899', Educacao: '#0EA5E9', Assinaturas: '#14B8A6',
  Viagem: '#F59E0B', Presente: '#EF4444', Beleza: '#D946EF',
  Academia: '#84CC16', Farmacia: '#06B6D4', Supermercado: '#22C55E',
  Eletronicos: '#6366F1', Pet: '#F97316', Investimento: '#10B981',
  Receita: '#22C55E', Inbox: '#94A3B8',
}

const PALETTE = [
  '#EF8B3D', '#3B82F6', '#10B981', '#8B5CF6', '#F97316',
  '#EC4899', '#14B8A6', '#0EA5E9', '#84CC16', '#F59E0B',
]

/** Gráfico de rosca SVG sem biblioteca externa. */
export function DonutChart({ data }: DonutChartProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--ink-4)', fontSize: 12.5 }}>
        Sem dados
      </div>
    )
  }

  // Dimensões do SVG
  const size = 120
  const cx = size / 2
  const cy = size / 2
  const r = 44          // raio do anel
  const stroke = 18     // espessura do anel
  const gap = 2         // gap entre fatias em graus

  // Circunferência total do círculo
  const circumference = 2 * Math.PI * r

  // Calcula o offset inicial (começa do topo — subtraímos 90° = π/2)
  let rotateOffset = -90

  // Monta as fatias como <circle> com stroke-dasharray
  const slices = data.map((d, i) => {
    const color  = CAT_COLOR[d.categoria] ?? PALETTE[i % PALETTE.length]
    // Comprimento do arco desta fatia menos o gap
    const arcLen = (d.pct / 100) * circumference - gap
    // Offset inicial desta fatia em graus
    const rotation = rotateOffset
    // Avança o offset para a próxima fatia
    rotateOffset += (d.pct / 100) * 360

    return (
      <circle
        key={d.categoria}
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        // Arco da fatia + parte vazia (restante da circunferência)
        strokeDasharray={`${Math.max(0, arcLen)} ${circumference}`}
        strokeDashoffset={0}
        // Rota para posicionar a fatia no ângulo correto
        transform={`rotate(${rotation} ${cx} ${cy})`}
        strokeLinecap="butt"
      />
    )
  })

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      {/* SVG do donut */}
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        {/* Anel de fundo */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        {slices}
      </svg>

      {/* Legenda lateral */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
        {data.slice(0, 6).map((d, i) => {
          const color = CAT_COLOR[d.categoria] ?? PALETTE[i % PALETTE.length]
          return (
            <div key={d.categoria} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Quadradinho de cor */}
              <span style={{
                width: 8, height: 8, borderRadius: 2,
                background: color, flexShrink: 0,
                display: 'inline-block',
              }} />
              {/* Nome da categoria */}
              <span style={{
                fontSize: 11.5, color: 'var(--ink-2)',
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {d.categoria}
              </span>
              {/* Percentual */}
              <span style={{ fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                {d.pct.toFixed(0)}%
              </span>
              {/* Valor absoluto */}
              <span className="amount" style={{
                fontSize: 11, color: 'var(--ink)', fontFamily: 'var(--mono)',
                fontVariantNumeric: 'tabular-nums', flexShrink: 0,
              }}>
                R${fmt(d.total)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
