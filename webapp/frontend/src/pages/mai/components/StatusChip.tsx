// StatusChip — badge colorido do status da série (usa --st-* tokens do mai.css).

import type { MaiStatus } from '../types'

// Mapeamento de status para rótulo em pt-BR
const LABELS: Record<MaiStatus, string> = {
  quero_assistir: 'Quero assistir',
  assistindo:     'Assistindo',
  concluida:      'Concluída',
  pausada:        'Pausada',
  abandonada:     'Abandonada',
}

// Mapeamento de status para variável CSS de cor
const COLORS: Record<MaiStatus, string> = {
  quero_assistir: 'var(--st-quero_assistir)',
  assistindo:     'var(--st-assistindo)',
  concluida:      'var(--st-concluida)',
  pausada:        'var(--st-pausada)',
  abandonada:     'var(--st-abandonada)',
}

interface Props {
  status: MaiStatus
  /** 'sm' = padrão (11px); 'md' = médio (12.5px) */
  size?: 'sm' | 'md'
  /** Adiciona backdrop-filter blur (para uso sobre pôsteres) */
  onPoster?: boolean
}

/** Badge colorido do status da série com ponto de cor. */
export function StatusChip({ status, size = 'sm', onPoster = false }: Props) {
  const color = COLORS[status]

  return (
    <span
      className={`status-chip${size === 'md' ? ' md' : ''}${onPoster ? ' on-poster' : ''}`}
      style={{ color, background: `${color}22` }}
    >
      <span className="sc-dot" />
      {LABELS[status]}
    </span>
  )
}

/** Exporta o mapa de labels para uso em outros componentes */
export { LABELS as STATUS_LABELS }
