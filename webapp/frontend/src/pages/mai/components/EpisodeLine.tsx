// EpisodeLine — linha de episódio dentro do SeasonAccordion.
// Grid: indicador 18px | still 96×54px | meta 1fr | estado auto.
// Episódios assistidos têm dot verde; próximo tem dot âmbar pulsante.

import type { Episode } from '../types'
import { IconCheck } from './MaiIcons'

interface Props {
  episode: Episode
  /** Callback quando o usuário clicar no episódio para marcar como assistido. */
  onToggle?: () => void
}

/**
 * EpisodeLine — linha de um episódio com still, número, título e estado.
 * Clicável para abrir o modal de log de sessão filtrado para este episódio.
 */
export function EpisodeLine({ episode, onToggle }: Props) {
  const isWatched = episode.watched
  const isNext    = !isWatched && episode.airing_status === 'lancado'  // próximo ep disponível

  // Formata a data de exibição (ex.: "12 jun")
  const airDateStr = episode.air_date
    ? new Date(episode.air_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
    : null

  return (
    <div
      className={`epi-line${isWatched ? ' watched' : ''}${isNext ? ' next' : ''}`}
      onClick={onToggle}
      title={isWatched ? 'Assistido' : 'Marcar como assistido'}
    >
      {/* Indicador de estado (ponto colorido) */}
      <div className="epi-dot" />

      {/* Still do episódio (96×54) ou placeholder numérico */}
      <div className="epi-still">
        {episode.still_url ? (
          <img
            src={episode.still_url}
            alt={episode.title ?? `Episódio ${episode.episode_number}`}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
          />
        ) : (
          <>
            <span className="es-ico">📺</span>
            <span className="es-num">{episode.episode_number}</span>
          </>
        )}
      </div>

      {/* Meta: título + sub (número + data) */}
      <div className="epi-meta">
        <div className="em-title">
          {episode.title || `Episódio ${episode.episode_number}`}
        </div>
        <div className="em-sub">
          E{String(episode.episode_number).padStart(2, '0')}
          {airDateStr && ` · ${airDateStr}`}
        </div>
      </div>

      {/* Estado: assistido (✓) ou próximo (PRÓXIMO) */}
      {isWatched ? (
        <div className="epi-check">
          <IconCheck />
        </div>
      ) : isNext ? (
        <div className="epi-state next">PRÓXIMO</div>
      ) : episode.airing_status === 'agendado' ? (
        <div className="epi-state" style={{ color: 'var(--ink-4)', fontSize: 10 }}>
          {airDateStr ?? 'BREVE'}
        </div>
      ) : null}
    </div>
  )
}
