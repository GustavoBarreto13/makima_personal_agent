// Gráfico de barras vertical mini (sparkline de barras).
// Usado nos stats cards da HomeScreen para mostrar tendência de episódios/semana.
// Barras proporcionais ao valor máximo do array.

interface SparkProps {
  // Valores para as barras (ex.: episódios por dia nos últimos 7 dias)
  data: number[]
  // Altura máxima de cada barra em px (padrão: 32)
  maxHeight?: number
  // Largura de cada barra em px (padrão: 6)
  barWidth?: number
  // Gap entre barras em px (padrão: 3)
  gap?: number
  className?: string
}

/**
 * Sparkline de barras verticais — proporcionais ao valor máximo.
 * Barra com valor 0: altura mínima de 2px para visibilidade.
 */
export function Spark({
  data,
  maxHeight = 32,
  barWidth = 6,
  gap = 3,
  className,
}: SparkProps) {
  const maxVal = Math.max(...data, 1)  // evita divisão por zero

  return (
    <div
      className={`mr-spark${className ? ' ' + className : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        gap,
        height: maxHeight,
      }}
      aria-hidden="true"  // decorativo, não precisa de label
    >
      {data.map((val, i) => (
        <div
          key={i}
          style={{
            width: barWidth,
            // Mínimo de 2px para barras com valor 0 ficarem visíveis
            height: Math.max((val / maxVal) * maxHeight, val > 0 ? 3 : 2),
            background: 'var(--marin)',
            // Última barra (mais recente) recebe cor mais viva
            opacity: i === data.length - 1 ? 1 : 0.45,
            borderRadius: 2,
            transition: 'height 0.3s ease',
          }}
        />
      ))}
    </div>
  )
}
