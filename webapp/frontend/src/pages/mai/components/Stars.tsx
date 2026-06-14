// Stars — exibe nota 0.5–5.0 em estrelas (meia-estrela via clip-path).
// RateInput — 5 estrelas clicáveis com suporte a meia-estrela (click esquerdo = 0.5).
// Cor de estrela FIXA: --star / --star-empty (não segue acento de cor).

import { useState } from 'react'
import { IconStarFill } from './MaiIcons'

interface StarsProps {
  rating: number      // 0.5–5.0
  size?: 'sm' | 'md' | 'lg'
  showNum?: boolean   // exibe o número ao lado
}

/**
 * Stars — exibe nota como estrelas preenchidas (com meia-estrela visual).
 * Usa clip-path para a meia-estrela da direita.
 */
export function Stars({ rating, size = 'md', showNum = false }: StarsProps) {
  const stars: JSX.Element[] = []

  for (let i = 1; i <= 5; i++) {
    // Determina quanto desta estrela está preenchida (0, 0.5 ou 1)
    const filled = Math.min(1, Math.max(0, rating - (i - 1)))

    if (filled >= 1) {
      // Estrela cheia
      stars.push(
        <span key={i} style={{ color: 'var(--star)', display: 'inline-flex' }}>
          <IconStarFill />
        </span>
      )
    } else if (filled >= 0.5) {
      // Meia estrela: duas camadas (vazia + cheia cortada à metade)
      stars.push(
        <span key={i} style={{ position: 'relative', display: 'inline-flex' }}>
          <span style={{ color: 'var(--star-empty)', display: 'inline-flex' }}>
            <IconStarFill />
          </span>
          <span style={{
            position: 'absolute', inset: 0, color: 'var(--star)',
            clipPath: 'inset(0 50% 0 0)', display: 'inline-flex',
          }}>
            <IconStarFill />
          </span>
        </span>
      )
    } else {
      // Estrela vazia
      stars.push(
        <span key={i} style={{ color: 'var(--star-empty)', display: 'inline-flex' }}>
          <IconStarFill />
        </span>
      )
    }
  }

  return (
    <span className={`stars${size !== 'md' ? ' ' + size : ''}`} style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      {stars}
      {showNum && <span className="score-num" style={{ marginLeft: 6 }}>{rating.toFixed(1)}</span>}
    </span>
  )
}

// ─── RateInput ───────────────────────────────────────────────────────────────

interface RateInputProps {
  value: number | null
  onChange: (v: number | null) => void
}

/**
 * RateInput — 5 estrelas clicáveis com meia-estrela.
 * Click na metade esquerda de uma estrela = N - 0.5.
 * Click na metade direita = N.
 * Click no valor já selecionado = remove nota (null).
 */
export function RateInput({ value, onChange }: RateInputProps) {
  const [hover, setHover] = useState<number | null>(null)

  const display = hover ?? value ?? 0

  function handleClick(star: number, half: boolean) {
    const v = half ? star - 0.5 : star
    // Toggle: clicar no valor atual remove a nota
    if (value === v) onChange(null)
    else onChange(v)
  }

  return (
    <div className="rate-input">
      {[1, 2, 3, 4, 5].map(star => {
        const leftFill  = display >= star - 0.5  // meia estrela preenchida
        const rightFill = display >= star         // estrela cheia

        return (
          <span
            key={star}
            className="rate-star"
            onMouseLeave={() => setHover(null)}
          >
            {/* Estrela de fundo (vazia) */}
            <span style={{ color: 'var(--star-empty)', display: 'inline-flex' }}>
              <IconStarFill />
            </span>

            {/* Metade esquerda preenchida (nota N-0.5) */}
            {leftFill && (
              <span style={{
                position: 'absolute', inset: 0, color: 'var(--star)',
                clipPath: 'inset(0 50% 0 0)', display: 'inline-flex',
              }}>
                <IconStarFill />
              </span>
            )}

            {/* Metade direita preenchida (nota N) */}
            {rightFill && (
              <span style={{
                position: 'absolute', inset: 0, color: 'var(--star)',
                display: 'inline-flex',
              }}>
                <IconStarFill />
              </span>
            )}

            {/* Zonas clicáveis invisíveis sobre cada metade */}
            <span
              className="rate-half l"
              onMouseEnter={() => setHover(star - 0.5)}
              onClick={() => handleClick(star, true)}
            />
            <span
              className="rate-half r"
              onMouseEnter={() => setHover(star)}
              onClick={() => handleClick(star, false)}
            />
          </span>
        )
      })}

      {/* Valor numérico + botão de limpar */}
      {value !== null && (
        <>
          <span className="rate-val">{value.toFixed(1)}</span>
          <button className="rate-clear" onClick={() => onChange(null)}>×</button>
        </>
      )}
    </div>
  )
}
