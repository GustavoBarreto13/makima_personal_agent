// Exibição de nota em formato de 10 estrelas (escala MAL 0–10, passo 0.5).
// Usa clip-path para renderizar meias-estrelas.
// Estrelas cheias: --star; meias-estrelas: clip 50% width; vazias: --star-empty.

interface StarsProps {
  // Nota atual (0–10, passo 0.5)
  score: number | null | undefined
  // Tamanho de cada estrela em px (padrão: 14)
  size?: number
  className?: string
}

/**
 * Fileira de 10 estrelas representando a nota MAL.
 * Meias estrelas são renderizadas com clip-path no span interno.
 */
export function Stars({ score, size = 14, className }: StarsProps) {
  // Converte null/0 para 0 para simplificar os cálculos
  const val = score != null && score > 0 ? score : 0
  // Número de estrelas cheias
  const full = Math.floor(val)
  // Tem meia estrela? (0.5, 1.5, 2.5...)
  const half = val - full >= 0.5

  return (
    <span
      className={`mr-stars${className ? ' ' + className : ''}`}
      aria-label={`Nota ${val}/10`}
      style={{ display: 'inline-flex', gap: 1 }}
    >
      {Array.from({ length: 10 }, (_, i) => {
        const isFull = i < full
        const isHalf = !isFull && i === full && half

        return (
          <span
            key={i}
            style={{
              position: 'relative',
              width: size,
              height: size,
              fontSize: size,
              lineHeight: '1',
              color: 'var(--star-empty)',
              display: 'inline-block',
            }}
          >
            {/* Estrela de fundo (vazia) */}
            ★
            {/* Sobreposição da estrela cheia/meia via clip-path */}
            {(isFull || isHalf) && (
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  color: 'var(--star)',
                  // Meia estrela: clippa 50% da largura da esquerda para a direita
                  clipPath: isHalf ? 'inset(0 50% 0 0)' : undefined,
                  overflow: 'hidden',
                }}
              >
                ★
              </span>
            )}
          </span>
        )
      })}
    </span>
  )
}
