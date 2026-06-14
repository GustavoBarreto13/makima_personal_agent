// NextBar — barra inferior (footbar) mostrando próximo episódio da série atual.
// Exibida quando o usuário está na tela de detalhe de uma série com status "assistindo".

import type { UpcomingEpisode } from '../types'
import { IconCalendar, IconTv } from './MaiIcons'

interface Props {
  /** Próximo episódio da série que o usuário está vendo na tela de detalhe. */
  next: UpcomingEpisode | null
  /** Callback para abrir a série no detalhe (se o usuário clicar no bar). */
  onClick?: () => void
}

/** Formata data pt-BR curta: "13 jun" ou "hoje" */
function fmtDate(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10)
  if (dateStr === today) return 'hoje'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '')
}

/** NextBar — footbar com próximo episódio a ser lançado. */
export function NextBar({ next, onClick }: Props) {
  if (!next) {
    // Footbar vazio quando não há próximo episódio agendado
    return (
      <div className="footbar">
        <div className="fb-label">
          <IconTv style={{ width: 14, height: 14, opacity: 0.5 }} />
          <span>Nenhum episódio agendado</span>
        </div>
      </div>
    )
  }

  const isToday = next.air_date === new Date().toISOString().slice(0, 10)
  const dateLabel = fmtDate(next.air_date)

  return (
    <div
      className="footbar"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Label "PRÓXIMO" */}
      <div className="fb-label">
        <IconCalendar style={{ width: 13, height: 13 }} />
        <span>PRÓXIMO</span>
      </div>

      {/* Thumbnail still ou ícone */}
      <div className="fb-still">
        {next.still_url ? (
          <img
            src={`https://image.tmdb.org/t/p/w185${next.still_url}`}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
          />
        ) : (
          <span className="fbs-ico">📺</span>
        )}
      </div>

      {/* Info do episódio */}
      <div className="footbar-info">
        <div className="footbar-title">{next.series_title}</div>
        <div className="footbar-sub">
          T{next.season_number} E{String(next.episode_number).padStart(2, '0')}
          {next.title && ` · ${next.title}`}
          {' · '}
          <span style={isToday ? { color: 'var(--warm)', fontWeight: 700 } : {}}>
            {dateLabel}
          </span>
        </div>
      </div>

      {/* Badge "HOJE" quando o episódio é hoje */}
      {isToday && <div className="sched-badge">HOJE</div>}
    </div>
  )
}
