// Componente de estrelas de avaliação (0.5–5.0, meia-estrela).
// SEMPRE usa --gold (verde Letterboxd) — não acompanha o acento (design guide §2.3).

interface StarsProps {
  /** Nota (0.5–5.0). null = sem nota (não renderiza estrelas). */
  rating: number | null
  /** Tamanho das estrelas em pixels (padrão: 12). */
  size?: number
  /** Exibe o número da nota ao lado das estrelas (padrão: false). */
  showNumber?: boolean
}

/**
 * Exibe até 5 estrelas representando a nota de um filme.
 * Suporta meia-estrela (SVG com clip).
 * Cor: --gold (fixo, verde Letterboxd), independente do acento.
 */
export function Stars({ rating, size = 12, showNumber = false }: StarsProps) {
  // Sem nota → não renderiza nada (padrão do protótipo: sem estrela cinza)
  if (rating === null || rating === undefined) return null

  // Clampeia a nota entre 0 e 5 por segurança
  const clampedRating = Math.min(5, Math.max(0, rating))

  // Gera 5 estrelas; cada uma pode ser: cheia, meia ou vazia
  const stars = Array.from({ length: 5 }, (_, i) => {
    const starValue = i + 1
    if (clampedRating >= starValue) return 'full'          // ex: rating=4.0, i=3 → full
    if (clampedRating >= starValue - 0.5) return 'half'   // ex: rating=3.5, i=3 → half
    return 'empty'
  })

  return (
    <span
      className="ak-stars"
      title={`${clampedRating} estrelas`}
      aria-label={`Nota: ${clampedRating} de 5`}
      style={{ fontSize: 0 }}   // Evita espaço extra entre SVGs inline
    >
      {stars.map((type, i) => (
        <StarSVG key={i} type={type} size={size} />
      ))}
      {/* Número da nota ao lado (opcional) */}
      {showNumber && (
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: size * 0.85,
            color: 'var(--gold)',
            marginLeft: 4,
            lineHeight: 1,
          }}
        >
          {clampedRating.toFixed(1)}
        </span>
      )}
    </span>
  )
}

// ── Ícone SVG de uma estrela (cheia, meia ou vazia) ──────────────────────────

interface StarSVGProps {
  type: 'full' | 'half' | 'empty'
  size: number
}

function StarSVG({ type, size }: StarSVGProps) {
  // ID único para o clipPath da meia-estrela (evita conflitos em grids com muitas estrelas)
  const clipId = `ak-half-${Math.random().toString(36).slice(2, 7)}`

  if (type === 'empty') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 12 12"
        className="ak-star empty"
        aria-hidden="true"
        style={{ color: 'var(--line)' }}
      >
        {/* Estrela vazia: stroke fina, sem fill */}
        <path
          d="M6 1l1.35 2.73L10.5 4.14l-2.25 2.19.53 3.1L6 7.96 3.22 9.43l.53-3.1L1.5 4.14l3.15-.41z"
          fill="none"
          stroke="currentColor"
          strokeWidth={0.8}
        />
      </svg>
    )
  }

  if (type === 'half') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 12 12"
        className="ak-star half"
        aria-hidden="true"
        style={{ color: 'var(--gold)' }}
      >
        {/* Define um clip que cobre apenas a metade esquerda da estrela */}
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="0" width="6" height="12" />
          </clipPath>
        </defs>
        {/* Estrela de fundo (cinza/borda) */}
        <path
          d="M6 1l1.35 2.73L10.5 4.14l-2.25 2.19.53 3.1L6 7.96 3.22 9.43l.53-3.1L1.5 4.14l3.15-.41z"
          fill="none"
          stroke="currentColor"
          strokeWidth={0.8}
          opacity={0.3}
        />
        {/* Estrela preenchida clipada para a metade esquerda */}
        <path
          d="M6 1l1.35 2.73L10.5 4.14l-2.25 2.19.53 3.1L6 7.96 3.22 9.43l.53-3.1L1.5 4.14l3.15-.41z"
          fill="currentColor"
          clipPath={`url(#${clipId})`}
        />
      </svg>
    )
  }

  // Estrela cheia (full)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      className="ak-star"
      aria-hidden="true"
      style={{ color: 'var(--gold)' }}
    >
      <path
        d="M6 1l1.35 2.73L10.5 4.14l-2.25 2.19.53 3.1L6 7.96 3.22 9.43l.53-3.1L1.5 4.14l3.15-.41z"
        fill="currentColor"
      />
    </svg>
  )
}
