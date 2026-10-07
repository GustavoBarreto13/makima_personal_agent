// Avaliação por estrelas: de 0 a 5, COM MEIA ESTRELA. Porte 1:1 da Akane (a única sem bug).
// Exibição: as estrelas não têm espaço entre si (o desenho já tem margem dentro do quadrado), então "70%" da
// largura é exatamente 3,5 estrelas; a camada dourada é flex (sem linha de texto) para ficar alinhada à cinza.
//   <Stars value size/>      exibição: duas camadas (vazia + preenchida cortada na nota)
//   <RateInput value onChange/>  edição: cada estrela tem duas metades clicáveis (esq = n−0.5, dir = n)
// Valores válidos: 0.5, 1, 1.5 … 5. 0 / null = sem nota (5 estrelas vazias).
// O arredondamento é o snapHalf do core (única fonte).

import { useState, type KeyboardEvent } from 'react'
import { snapHalf } from '../core/format'

const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.6 6.1 20.7l1.2-6.6L2.5 9.5l6.6-.9z'

function Star() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={STAR_PATH} />
    </svg>
  )
}

function Row() {
  return (
    <span className="ds-row">
      {[0, 1, 2, 3, 4].map((i) => <Star key={i} />)}
    </span>
  )
}

export function Stars({ value, lg }: { value: number | null | undefined; lg?: boolean }) {
  const s = snapHalf(value)
  const label = s ? `${s.toFixed(1)} de 5` : 'sem nota'
  return (
    <span className={`ds-stars${lg ? ' ds-lg' : ''}`} role="img" aria-label={label} title={s ? `${s.toFixed(1)} / 5` : 'sem nota'}>
      <Row />
      <span className="ds-st-fill" style={{ width: `${(s / 5) * 100}%` }}>
        <Row />
      </span>
    </span>
  )
}

export interface RateInputProps {
  value: number
  onChange: (v: number) => void
  label?: string
  /** Mostra o valor e o botão "limpar". */
  showValue?: boolean
}

export function RateInput({ value, onChange, label = 'Nota de 0 a 5, com meia estrela', showValue = true }: RateInputProps) {
  const [hover, setHover] = useState(0)
  const v = snapHalf(value)
  const shown = hover || v

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    let n: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') n = Math.min(5, v + 0.5)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') n = Math.max(0, v - 0.5)
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = 5
    else if (/^[1-5]$/.test(e.key)) n = Number(e.key)
    if (n !== null) {
      e.preventDefault()
      onChange(n)
    }
  }

  return (
    <div className="ds-rate-group">
      <div
        className="ds-rate"
        tabIndex={0}
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={v}
        aria-valuetext={v ? `${v.toFixed(1)} de 5` : 'sem nota'}
        onKeyDown={onKey}
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className="ds-rs">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={STAR_PATH} /></svg>
            <span className="ds-fw" style={{ width: shown >= n ? '100%' : shown >= n - 0.5 ? '50%' : '0%' }}>
              <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 30, height: 30 }}><path d={STAR_PATH} /></svg>
            </span>
            <i className="ds-h ds-l" onMouseEnter={() => setHover(n - 0.5)} onClick={() => onChange(n - 0.5)} />
            <i className="ds-h ds-r" onMouseEnter={() => setHover(n)} onClick={() => onChange(n)} />
          </span>
        ))}
      </div>
      {showValue && <span className="ds-rval">{v ? v.toFixed(1) : ''}</span>}
      {showValue && v > 0 && (
        <button type="button" className="ds-rclear" onClick={() => onChange(0)}>limpar</button>
      )}
    </div>
  )
}
