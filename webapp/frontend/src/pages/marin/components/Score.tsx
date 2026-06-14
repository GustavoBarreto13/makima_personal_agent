// Exibe a nota de um anime na escala MAL (0–10, passo 0.5).
// Variantes: compact (apenas o número) ou full (ícone de estrela + número).
// Cor: --star quando tem nota, --ink-3 quando não tem.

interface ScoreProps {
  // Nota do anime (null = sem avaliação)
  score: number | null | undefined
  // Variante visual
  variant?: 'compact' | 'full'
  className?: string
}

/**
 * Nota do anime em escala MAL (0–10).
 * Retorna '—' quando sem avaliação.
 */
export function Score({ score, variant = 'full', className }: ScoreProps) {
  // Formata o número: 8 → '8.0', 7.5 → '7.5', null → '—'
  const formatted = score != null && score > 0
    ? score % 1 === 0 ? `${score}.0` : `${score}`
    : '—'

  const hasScore = score != null && score > 0

  if (variant === 'compact') {
    return (
      <span
        className={`mr-score mr-score--compact${className ? ' ' + className : ''}`}
        style={{ color: hasScore ? 'var(--star)' : 'var(--ink-3)' }}
      >
        {formatted}
      </span>
    )
  }

  return (
    <span
      className={`mr-score mr-score--full${className ? ' ' + className : ''}`}
      style={{ color: hasScore ? 'var(--star)' : 'var(--ink-3)' }}
    >
      {/* Estrela só aparece quando tem nota */}
      {hasScore && <span className="mr-score-star">★</span>}
      {formatted}
    </span>
  )
}
