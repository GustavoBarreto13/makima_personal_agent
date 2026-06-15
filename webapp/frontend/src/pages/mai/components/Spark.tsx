/**
 * Spark — sparkline de barras verticais para stat-cards.
 *
 * Exibe até N barras representando contagens diárias (ex.: episódios
 * assistidos nos últimos 21 dias). A barra mais alta define a escala (100%
 * de altura = 24 px). Barras com valor ≥ 70% do máximo recebem a classe
 * `hot` e ficam na cor do acento (`--accent-bar` definido no pai).
 *
 * Uso esperado:
 *   <div className="stat-card" style={{ '--accent-bar': 'var(--warm)' }}>
 *     <Spark data={sparkData} />
 *   </div>
 */

interface Props {
  /** Array de valores numéricos (um por dia, ordem cronológica mais antiga → mais nova). */
  data: number[]
}

/**
 * Spark — sparkline vertical de barras para uso dentro de stat-cards.
 *
 * Args:
 *   data: Valores numéricos em ordem cronológica.
 *
 * Returns:
 *   Elemento `<div className="stat-spark">` com uma `<i>` por ponto de dado.
 */
export function Spark({ data }: Props) {
  // Valor máximo do array para normalizar as alturas (mínimo 1 para evitar divisão por zero)
  const max = Math.max(...data, 1)

  return (
    <div className="stat-spark">
      {data.map((v, i) => (
        <i
          key={i}
          // Classe "hot" quando o valor atinge ≥ 70% do pico e é positivo
          className={v >= max * 0.7 && v > 0 ? 'hot' : ''}
          // Altura proporcional ao máximo; mínimo 2 px para barras com valor 0
          style={{ height: Math.max(2, (v / max) * 24) + 'px' }}
        />
      ))}
    </div>
  )
}
