// Input de nota interativo para a escala MAL (0–10, passo 0.5).
// Hover mostra preview da nota antes de clicar.
// 10 estrelas que suportam clique na metade esquerda (0.5 step).
// Score 0 = "sem nota" (clique na mesma nota atual reseta para 0).

import { useState } from 'react'

interface RateInputProps {
  // Nota atual (null ou 0 = sem nota)
  value: number | null | undefined
  // Callback chamado ao selecionar uma nota
  onChange: (score: number) => void
  // Tamanho de cada estrela em px (padrão: 22)
  size?: number
  className?: string
}

/**
 * Input de nota estilo MAL — 10 estrelas, meias-estrelas por hover.
 * Clicar na nota atual → reseta para 0 (remove avaliação).
 */
export function RateInput({ value, onChange, size = 22, className }: RateInputProps) {
  // Nota que aparece no hover (null = não hovering)
  const [hoverScore, setHoverScore] = useState<number | null>(null)

  // Nota exibida: hover tem prioridade sobre o valor real
  const displayScore = hoverScore ?? (value ?? 0)

  const full = Math.floor(displayScore)
  const half = displayScore - full >= 0.5

  function handleMouseMove(e: React.MouseEvent<HTMLSpanElement>, starIndex: number) {
    // Detecta se o cursor está na metade esquerda (< 50%) ou direita (≥ 50%)
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    // Metade esquerda = meia estrela (ex.: estrela 3 metade esquerda → 2.5)
    const isLeftHalf = x < rect.width / 2
    setHoverScore(isLeftHalf ? starIndex + 0.5 : starIndex + 1)
  }

  function handleClick(clickedScore: number) {
    // Clique na nota atual → reseta para 0 (remove avaliação)
    const current = value ?? 0
    onChange(clickedScore === current ? 0 : clickedScore)
  }

  return (
    <span
      className={`mr-rate-input${className ? ' ' + className : ''}`}
      onMouseLeave={() => setHoverScore(null)}
      style={{ display: 'inline-flex', gap: 2, cursor: 'pointer' }}
      aria-label="Selecionar nota (0–10)"
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
              userSelect: 'none',
            }}
            onMouseMove={(e) => handleMouseMove(e, i)}
            onClick={() => handleClick(hoverScore ?? (i + 1))}
          >
            {/* Estrela vazia de base */}
            ★
            {/* Overlay da estrela cheia ou meia */}
            {(isFull || isHalf) && (
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  color: hoverScore != null ? 'var(--marin)' : 'var(--star)',
                  clipPath: isHalf ? 'inset(0 50% 0 0)' : undefined,
                  overflow: 'hidden',
                  transition: 'color 0.1s',
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
