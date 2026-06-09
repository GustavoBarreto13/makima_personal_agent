// AreaChart — gráfico de área SVG puro com curva Catmull-Rom→Bezier.
// Exibe 12 pontos (um por mês) com gradiente de área e linha de contorno.

interface AreaChartProps {
  // 12 valores numéricos (Jan=0 ... Dez=11)
  data: number[]
  // Altura do SVG em px
  height?: number
}

// Nomes abreviados dos meses para o eixo X
const MONTH_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

// Converte 4 pontos de controle Catmull-Rom em 2 pontos de controle Bezier cúbico.
// A curva Catmull-Rom passa por todos os pontos, diferente da Bezier que usa pontos de controle externos.
function catmullToBezier(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
): [number, number, number, number] {
  // Fórmula de conversão: os pontos de controle Bezier são derivados dos pontos vizinhos
  const cp1x = p1[0] + (p2[0] - p0[0]) / 6
  const cp1y = p1[1] + (p2[1] - p0[1]) / 6
  const cp2x = p2[0] - (p3[0] - p1[0]) / 6
  const cp2y = p2[1] - (p3[1] - p1[1]) / 6
  return [cp1x, cp1y, cp2x, cp2y]
}

// Constrói o atributo `d` de um path SVG com curva suave Catmull-Rom passando por todos os pontos
function buildCurve(points: [number, number][]): string {
  if (points.length < 2) return ''

  let d = `M ${points[0][0]} ${points[0][1]}`

  for (let i = 0; i < points.length - 1; i++) {
    // Pontos vizinhos para calcular os handles Catmull-Rom (com clamp nas bordas)
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]

    const [cp1x, cp1y, cp2x, cp2y] = catmullToBezier(p0, p1, p2, p3)
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2[0]} ${p2[1]}`
  }

  return d
}

export function AreaChart({ data, height = 88 }: AreaChartProps) {
  const w = 560   // largura total do SVG em unidades lógicas
  const padX = 24 // margem horizontal para os labels
  const padY = 10 // margem vertical
  const chartW = w - padX * 2
  const chartH = height - padY * 2 - 16  // 16px reservado para labels do eixo X

  // Encontra o valor máximo para normalização (mínimo 1 para evitar divisão por zero)
  const maxVal = Math.max(...data, 1)

  // Converte os 12 valores em coordenadas (x, y) dentro do viewport do gráfico
  const points: [number, number][] = data.map((val, i) => [
    padX + (i / (data.length - 1)) * chartW,
    padY + chartH - (val / maxVal) * chartH,
  ])

  // Caminho da linha (apenas a curva superior)
  const linePath = buildCurve(points)

  // Caminho da área (linha + borda inferior fechada)
  const areaPath = linePath
    + ` L ${points[points.length - 1][0]} ${padY + chartH}`
    + ` L ${points[0][0]} ${padY + chartH} Z`

  const gradId = 'vl-area-grad'

  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Gradiente vertical: accent opaco no topo, quase transparente na base */}
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Área preenchida com gradiente */}
      <path d={areaPath} fill={`url(#${gradId})`} />

      {/* Linha de contorno accent */}
      <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {/* Labels dos meses no eixo X */}
      {points.map((pt, i) => (
        <text
          key={i}
          x={pt[0]}
          y={height - 2}
          textAnchor="middle"
          style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: 'var(--ink-4)' }}
        >
          {MONTH_LABELS[i]}
        </text>
      ))}
    </svg>
  )
}
