// Cores de gráficos — lê tudo de --ds-chart-* (tokens.json). Nenhuma cor literal em SVG.
// Paleta categórica de 8 cores (contraste >= 3:1 contra o card nos dois temas, distinguível por daltônicos);
// sequencial = níveis do acento (heatmap); divergente = positivo/negativo.

/** Cor categórica i (cicla de 1 a 8). Use como valor de `fill`/`stroke`/`background`. */
export function chartColor(i: number): string {
  return `var(--ds-chart-${(((i % 8) + 8) % 8) + 1})`
}

export const CHART_POSITIVE = 'var(--ds-chart-positive)'
export const CHART_NEGATIVE = 'var(--ds-chart-negative)'

/** Intensidade sequencial a partir do acento do agente (0 a 1). */
export function chartSequential(t: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, t)) * 100)
  return `color-mix(in oklab, var(--ds-accent) ${pct}%, var(--ds-line-2))`
}
