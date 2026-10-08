// Blocos do Início: Favoritos, Assistindo agora, Atividade recente, Próximos episódios, Distribuição por estado e
// a faixa da fila "Quero assistir".

import { Button, Icon, ProgressBar, SectionHeader, Stars } from '../../../design'
import { fmtRelative } from '../../../design/core/format'
import { useMarin } from '../context'
import { epLabel } from '../lib/log'
import { STATUS, STATUS_ORDER } from '../lib/status'
import type { Anime, AnimeStatus, ScheduleItem, Session } from '../types'
import { progressText } from './AnimeCard'
import { Poster } from './Poster'

export function FavoriteShelf({ favorites, onPick }: { favorites: Anime[]; onPick: () => void }) {
  const marin = useMarin()
  return (
    <section aria-labelledby="mr-fav">
      <SectionHeader title="Animes favoritos" id="mr-fav" action={<Button variant="ghost" size="sm" icon="edit" onClick={onPick}>{favorites.length ? 'Editar' : 'Escolher'}</Button>} />
      <div className="mr-fav-grid">
        {favorites.slice(0, 4).map((a) => (
          <Poster key={a.id} title={a.title} src={a.poster} onOpen={() => marin.goto({ view: 'catalog', animeId: a.id })} />
        ))}
        {favorites.length === 0 && (
          <button type="button" className="mr-fav-add" onClick={onPick}><Icon name="add" size={20} /><span>Escolher favoritos</span></button>
        )}
      </div>
    </section>
  )
}

/** Até 6 animes em andamento, com a faixa de progresso e o episódio em que parou. */
export function WatchingShelf({ animes }: { animes: Anime[] }) {
  const marin = useMarin()
  if (animes.length === 0) return null
  return (
    <section aria-labelledby="mr-watching">
      <SectionHeader title="Assistindo agora" id="mr-watching" action={<Button variant="ghost" size="sm" iconRight="right" onClick={() => marin.goto('catalog')}>Catálogo</Button>} />
      <div className="mr-watch-grid">
        {animes.slice(0, 6).map((a) => (
          <div key={a.id} className="mr-watch">
            <Poster title={a.title} src={a.poster} titleOnCover={false} progress={a.progress} onOpen={() => marin.goto({ view: 'catalog', animeId: a.id })} />
            <b className="mr-watch-t">{a.title}</b>
            {a.progress !== null && <ProgressBar value={a.progress * 100} label={`${Math.round(a.progress * 100)}% de ${a.title}`} />}
            <span className="mr-watch-s">ep {progressText(a)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/** As últimas sessões: título, episódios, dia e nota. */
export function RecentPanel({ sessions }: { sessions: Session[] }) {
  const marin = useMarin()
  return (
    <section className="ds-card mr-panel" aria-labelledby="mr-recent">
      <SectionHeader title="Atividade recente" id="mr-recent" action={<Button variant="ghost" size="sm" iconRight="right" onClick={() => marin.goto('diary')}>Diário</Button>} />
      {sessions.length === 0
        ? <p className="ds-hint">Nenhuma sessão ainda.</p>
        : (
          <div className="mr-plist">
            {sessions.slice(0, 5).map((s) => (
              <button key={s.id} type="button" className="mr-prow" onClick={() => marin.goto({ view: 'catalog', animeId: s.animeId })}>
                <span className="mr-ptitle">{s.title}</span>
                <span className="mr-psub">{epLabel(s.epStart, s.epEnd, s.count)} · {fmtRelative(s.date, marin.today)}</span>
                {s.rating ? <Stars value={s.rating} /> : null}
              </button>
            ))}
          </div>
        )}
    </section>
  )
}

/** Próximos episódios dos animes em andamento, com o dia no mini-calendário. */
export function UpcomingPanel({ items }: { items: ScheduleItem[] }) {
  const marin = useMarin()
  return (
    <section className="ds-card mr-panel" aria-labelledby="mr-up">
      <SectionHeader title="Próximos episódios" id="mr-up" action={<Button variant="ghost" size="sm" iconRight="right" onClick={() => marin.goto('schedule')}>Lançamentos</Button>} />
      {items.length === 0
        ? <p className="ds-hint">Nenhum episódio novo nos próximos dias. Os animes que você está assistindo aparecem aqui quando houver data.</p>
        : (
          <div className="mr-plist">
            {items.slice(0, 4).map((i) => (
              <button key={`${i.animeId}-${i.episode}`} type="button" className="mr-prow mr-prow-cal" onClick={() => marin.goto({ view: 'catalog', animeId: i.animeId })}>
                <span className="mr-cal" aria-hidden="true"><b>{Number(i.date.slice(8, 10))}</b><i>{i.date.slice(5, 7)}</i></span>
                <span className="mr-ptitle">{i.title}</span>
                <span className="mr-psub">Ep {i.episode} · {fmtRelative(i.date, marin.today)}</span>
              </button>
            ))}
          </div>
        )}
    </section>
  )
}

/** Barra empilhada com a quantidade de animes em cada estado (o "MalStats" do shell antigo). */
export function StatusPanel({ counts }: { counts: Record<AnimeStatus, number> }) {
  const marin = useMarin()
  const total = STATUS_ORDER.reduce((n, s) => n + counts[s], 0)
  return (
    <section className="ds-card mr-panel" aria-labelledby="mr-split">
      <SectionHeader title="Seu acervo" id="mr-split" mono={`${total}`} action={<Button variant="ghost" size="sm" iconRight="right" onClick={() => marin.goto('stats')}>Estatísticas</Button>} />
      <div className="mr-split-bar" role="img" aria-label={STATUS_ORDER.map((s) => `${counts[s]} ${STATUS[s].label.toLowerCase()}`).join(', ')}>
        {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
          // A largura de cada trecho é o dado (a fatia do acervo), não layout.
          <i key={s} className={`mr-seg mr-seg-${s}`} style={{ flexGrow: counts[s] }} />
        ))}
      </div>
      <div className="mr-legend">
        {STATUS_ORDER.map((s) => (
          <span key={s}><i className={`mr-dot mr-seg-${s}`} />{STATUS[s].label} <b>{counts[s]}</b></span>
        ))}
      </div>
    </section>
  )
}

/** Faixa horizontal com o que está esperando na fila. */
export function QueueStrip({ items }: { items: Anime[] }) {
  const marin = useMarin()
  if (items.length === 0) return null
  return (
    <section aria-labelledby="mr-want">
      <SectionHeader title="Esperando na fila" id="mr-want" action={<Button variant="ghost" size="sm" iconRight="right" onClick={() => marin.goto('queue')}>Ver tudo</Button>} />
      <div className="mr-strip">
        {items.map((a) => (
          <div key={a.id} className="mr-want">
            <Poster title={a.title} src={a.poster} titleOnCover={false} onOpen={() => marin.goto({ view: 'catalog', animeId: a.id })} />
            <b className="mr-want-t">{a.title}</b>
            <span className="mr-want-s">{[a.season, a.total ? `${a.total} eps` : null].filter(Boolean).join(' · ')}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
