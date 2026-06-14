// Chip colorido que indica o status de um anime na lista do usuário.
// Usa variáveis CSS --st-{status} declaradas em marin.css para as cores.
// Variante onPoster exibe fundo sólido sobre o pôster (sem border radius grande).

import type { Status } from '../types'

interface StatusChipProps {
  // Status do anime (chave usada no banco e na variável CSS)
  status: Status
  // Variante visual: padrão ou sobre-pôster (menor, sem padding extra)
  variant?: 'default' | 'onPoster'
  className?: string
}

// Mapa de status → label em português amigável
const LABELS: Record<Status, string> = {
  assistindo:    'Assistindo',
  completo:      'Completo',
  quero_assistir: 'Quero assistir',
  pausado:       'Pausado',
  abandonado:    'Abandonado',
}

/**
 * Chip de status do anime.
 * Cor vinda de variáveis CSS --st-{status} definidas em marin.css.
 */
export function StatusChip({ status, variant = 'default', className }: StatusChipProps) {
  return (
    <span
      className={`mr-status-chip mr-status-chip--${variant}${className ? ' ' + className : ''}`}
      // data-status conecta ao CSS (ex.: [data-status='assistindo'] { background: var(--st-assistindo); })
      data-status={status}
      aria-label={`Status: ${LABELS[status]}`}
    >
      {LABELS[status]}
    </span>
  )
}
