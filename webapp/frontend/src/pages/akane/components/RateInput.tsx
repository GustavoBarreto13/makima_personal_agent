// Seletor INTERATIVO de nota com meio-passo (0.5 a 5.0).
// Porte 1:1 do RateInput do design handoff (akane/ui.jsx).
//
// Cada estrela tem duas metades clicáveis invisíveis (.rate-half l/r):
// clicar na esquerda grava n - 0.5, na direita grava n. O hover mostra um
// preview da nota antes do clique; sair do componente volta ao valor salvo.

import { useState } from 'react'
import { StarShape } from '../ui/Heart'

interface RateInputProps {
  /** Nota atual (0 = sem nota). */
  value: number
  /** Chamado com a nova nota ao clicar (0 quando o usuário limpa). */
  onChange: (value: number) => void
}

/** Selecionar uma nota de 0.5 em 0.5 clicando nas metades das estrelas. */
export function RateInput({ value, onChange }: RateInputProps) {
  // Nota "em preview" enquanto o mouse passa por cima (0 = sem hover)
  const [hover, setHover] = useState(0)
  const shown = hover || value || 0

  return (
    <div className="ak-rate-input" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(n => {
        const full = shown >= n              // estrela toda preenchida
        const half = !full && shown >= n - 0.5  // só a metade esquerda
        return (
          <span key={n} className="ak-rate-star">
            {/* Estrela de fundo (cor "vazia" vem do CSS .rate-star) */}
            <StarShape filled />
            {/* Camada dourada cortada em 0% / 50% / 100% conforme a nota */}
            <span className="ak-fill" style={{ position: 'absolute', inset: 0, width: full ? '100%' : half ? '50%' : '0%' }}>
              <StarShape filled />
            </span>
            {/* Áreas clicáveis invisíveis: metade esquerda = .5, direita = inteira */}
            <span className="ak-rate-half ak-l" onMouseEnter={() => setHover(n - 0.5)} onClick={() => onChange(n - 0.5)} />
            <span className="ak-rate-half ak-r" onMouseEnter={() => setHover(n)} onClick={() => onChange(n)} />
          </span>
        )
      })}
      {value > 0 && <span className="ak-rate-val">{value.toFixed(1)}</span>}
      {value > 0 && <button type="button" className="ak-rate-clear" onClick={() => onChange(0)}>limpar</button>}
    </div>
  )
}
