// Mini sparkline de barras — porte 1:1 do Spark do design handoff (akane/ui.jsx).
// Usado no stat card "Sessões · 7 dias" da Home: cada barra é um dia,
// a altura é proporcional ao máximo da janela e dias "quentes" (>= 70% do
// máximo) ganham a cor do acento via classe .hot.

interface SparkProps {
  /** Contagens por dia, em ordem cronológica (ex.: sessões dos últimos 21 dias). */
  data: number[]
}

/** Desenhar o sparkline de barras das sessões recentes. */
export function Spark({ data }: SparkProps) {
  // max mínimo de 1 evita divisão por zero quando todos os dias são 0
  const max = Math.max(...data, 1)
  return (
    <div className="stat-spark">
      {data.map((v, i) => (
        <i key={i} className={v >= max * 0.7 && v > 0 ? 'hot' : ''}
           style={{ height: Math.max(2, (v / max) * 24) + 'px' }} />
      ))}
    </div>
  )
}
