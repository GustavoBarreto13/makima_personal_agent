// Bloco "Diário recente" da Home — porte do RecentActivity do handoff
// (akane/screens-a.jsx): as 4 últimas sessões como pôsteres com marcadores
// abaixo (estrelas com meia, coração se curtido, loop de revisão, ícone de
// anotação quando a sessão tem texto).

import type { DiaryEntry } from '../types'
import { Icon } from '../ui/Icon'
import { Heart } from '../ui/Heart'
import { Poster } from './Poster'
import { Stars } from './Stars'

interface RecentActivityProps {
  /** Entradas recentes do diário (home.recent_activity, com liked). */
  entries: Array<DiaryEntry & { liked: boolean }>
  /** Abrir o detalhe do filme da sessão. */
  onSelectMovie: (id: string) => void
  /** Link "Tudo →" — navega para a tela Diário. */
  onGoDiary: () => void
}

/** As 4 sessões mais recentes, no formato de vitrine da Home. */
export function RecentActivity({ entries, onSelectMovie, onGoDiary }: RecentActivityProps) {
  const recent = entries.slice(0, 4)
  return (
    <div className="lb-sec">
      <div className="ak-lb-sec-head">
        <span className="ak-t">Diário recente</span>
        <span className="ak-rule" />
        <span className="ak-lb-sec-link" onClick={onGoDiary}>Tudo →</span>
      </div>
      <div className="ak-fav-grid">
        {recent.map(e => (
          <div key={e.id} className="ak-act-card" onClick={() => onSelectMovie(e.movie_id)}>
            <Poster title={e.movie_title ?? ''} posterUrl={e.poster_url} palette={e.poster_palette} />
            <div className="ak-act-marks">
              {e.rating ? <Stars value={e.rating} /> : <span className="ak-act-none">—</span>}
              {e.liked && <Heart filled className="ak-heart-ico" />}
              {e.rewatch && <Icon name="rewatch" style={{ width: 13, height: 13, color: 'var(--rose)' }} />}
              {e.review && <Icon name="listas" style={{ width: 13, height: 13, color: 'var(--ink-4)' }} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
