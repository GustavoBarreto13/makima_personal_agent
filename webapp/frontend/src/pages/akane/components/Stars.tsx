// Estrelas ESTÁTICAS de exibição de nota (0 a 5, com meia estrela).
// Porte 1:1 do componente Stars do design handoff (akane/ui.jsx).
//
// Técnica da meia-estrela ("clip"): renderizamos DUAS fileiras de 5 estrelas
// cheias, uma sobre a outra. A de baixo fica na cor "vazia" (--ink-4 via CSS);
// a de cima fica dourada (--gold) e é cortada horizontalmente na porcentagem
// exata da nota (width = nota/5 * 100%). Assim qualquer fração funciona.

import { StarShape } from '../ui/Heart'

interface StarsProps {
  /** Nota de 0 a 5 (aceita frações — 3.5 corta a 4ª estrela ao meio). */
  value: number | null | undefined
  /** true = versão grande (classe .lg, usada na linha de nota do detalhe). */
  lg?: boolean
}

/** Exibir a nota como 5 estrelas com preenchimento fracionário. */
export function Stars({ value, lg }: StarsProps) {
  // Limita a nota ao intervalo [0, 5] e converte para porcentagem de corte
  const pct = (Math.max(0, Math.min(5, value || 0)) / 5) * 100
  return (
    <span className={'ak-stars' + (lg ? ' ak-lg' : '')} title={(value || 0).toFixed(1) + ' / 5'}>
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        {/* Camada de baixo: 5 estrelas na cor "vazia" (cor vem do CSS .stars .empty) */}
        <span style={{ display: 'inline-flex', gap: '1px' }} className="ak-empty">
          {[0, 1, 2, 3, 4].map(i => <StarShape key={i} filled />)}
        </span>
        {/* Camada de cima: 5 estrelas douradas, cortadas na largura da nota */}
        <span style={{ position: 'absolute', inset: 0, overflow: 'hidden', width: pct + '%',
                       display: 'inline-flex', gap: '1px', color: 'var(--gold)' }}>
          {[0, 1, 2, 3, 4].map(i => <StarShape key={i} filled />)}
        </span>
      </span>
    </span>
  )
}
