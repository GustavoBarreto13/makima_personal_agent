// Linha de episódio individual — usada na lista de episódios do AnimeDetail.
// Layout: ícone de status (✓ assistido / relógio agendado) + thumbnail + metadados.
// Variante assistido: fundo levemente destacado + checkmark colorido.

import type { Episode } from '../types'
import { Icon } from './Icon'

interface EpisodeLineProps {
  episode: Episode
  // Callback ao clicar: abre modal para logar este episódio
  onLog?: (ep: Episode) => void
}

/**
 * Linha de episódio para a lista de episódios do AnimeDetail.
 * Assistidos aparecem com destaque; agendados mostram data estimada.
 */
export function EpisodeLine({ episode, onLog }: EpisodeLineProps) {
  // Formata a data de exibição no padrão DD/MM/AAAA (ou "Agendado" se sem data)
  const airedText = episode.aired
    ? new Date(episode.aired).toLocaleDateString('pt-BR')
    : episode.airing_status === 'agendado' ? 'Agendado' : '—'

  return (
    <div
      className={`mr-ep-line${episode.watched ? ' mr-ep-line--watched' : ''}`}
      role="listitem"
    >
      {/* Ícone de status: check se assistido, clock se agendado */}
      <span className="mr-ep-line-status">
        {episode.watched ? (
          <Icon name="check" size={14} style={{ color: 'var(--marin)' }} />
        ) : (
          <Icon name="clock" size={14} style={{ color: 'var(--ink-3)' }} />
        )}
      </span>

      {/* Número do episódio */}
      <span className="mr-ep-line-num">
        Ep {episode.number}
      </span>

      {/* Título do episódio (truncado se longo) */}
      <span className="mr-ep-line-title">
        {episode.title || `Episódio ${episode.number}`}
      </span>

      {/* Data de exibição */}
      <span className="mr-ep-line-date">
        {airedText}
      </span>

      {/* Botão logar — aparece só se não assistido e callback fornecido */}
      {!episode.watched && onLog && (
        <button
          className="mr-ep-line-btn"
          onClick={() => onLog(episode)}
          title={`Logar episódio ${episode.number}`}
          aria-label={`Marcar episódio ${episode.number} como assistido`}
        >
          <Icon name="check" size={12} />
        </button>
      )}
    </div>
  )
}
