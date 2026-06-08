// Mini sparkline de barras verticais — visualiza séries temporais compactas
// (ex.: páginas lidas por dia nos últimos N dias).
// Barras com valor >= 70% do máximo recebem destaque visual (classe "hot").
// Portada do protótipo ui.jsx.

import React from 'react'

// Props do componente Spark
interface SparkProps {
  // Array de valores numéricos a plotar como barras (tipicamente 14+ dias)
  // Cada elemento corresponde a uma barra vertical no gráfico
  data: number[]
}

// Componente mini sparkline.
// A altura de cada barra é proporcional ao valor máximo da série.
// Barras que atingem ao menos 70% do máximo são marcadas como "hot" (destaque em cor quente).
// Altura mínima de 2px garante que dias com 0 páginas ainda sejam visíveis como traço.
export function Spark({ data }: SparkProps) {
  // Calcula o valor máximo da série para normalizar as alturas das barras
  // O mínimo de 1 evita divisão por zero quando todos os valores são 0
  const max = Math.max(...data, 1)

  return (
    // Container do sparkline — classe stat-spark define layout e espaçamento via CSS
    <div className="stat-spark">
      {data.map((v, i) => (
        // Cada barra é um <i> com altura proporcional e classe "hot" quando destacada
        // A altura máxima de 22px é a altura total disponível para o gráfico
        <i
          key={i}
          className={v >= max * 0.7 ? 'hot' : ''}    // Destaca barras acima de 70% do máximo
          style={{ height: Math.max(2, (v / max) * 22) + 'px' }}  // Normaliza para 0–22px
        />
      ))}
    </div>
  )
}
