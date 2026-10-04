// Início: a cinemateca de relance.
//   Hero com o total visto → logar em uma linha → favoritos → atividade recente → próximos do Quero ver →
//   ritmo do ano (mapa de calor) e como você avalia.

import { useState } from 'react'
import { fmtRelative } from '../../../design/core/format'
import {
  Button, Distribution, EmptyState, ErrorState, Heatmap, Hero, Icon, LoadingState, MediaCard, Page, SectionHeader, Stars, hueFromName,
} from '../../../design'
import { akaneApi } from '../akaneApi'
import { FavoritesPicker } from '../components/FavoritesPicker'
import { LogCapture } from '../components/LogCapture'
import { useAkane } from '../context'
import { useLoad } from '../lib/useLoad'
import type { DiaryEntry } from '../types'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function Home() {
  const akane = useAkane()
  const year = Number(akane.today.slice(0, 4))
  const [picking, setPicking] = useState(false)
  const { state, retry } = useLoad(async () => {
    const [home, heat] = await Promise.all([akaneApi.home(), akaneApi.heatmap(year)])
    return { home, days: heat.days.map((d) => ({ date: d.date, value: d.count })) }
  }, [akane.rev, year])

  if (state.status === 'loading') return <Page><LoadingState variant="stat" count={4} /></Page>
  if (state.status === 'error') return <Page><ErrorState onRetry={retry} /></Page>

  const { home, days } = state.data
  const empty = home.counts.films_watched === 0 && home.counts.diary === 0 && home.counts.watchlist === 0
  if (empty) {
    return (
      <Page>
        <EmptyState
          icon="movie"
          title="Sua cinemateca começa aqui"
          hint="Logue o primeiro filme que você viu, ou guarde um que quer ver. A Akane cuida do resto: pôster, diretor, notas e estatísticas."
          action={<Button variant="primary" icon="add" onClick={() => akane.openLog()}>Logar filme</Button>}
        />
      </Page>
    )
  }

  const delta = home.sessions_7d - home.sessions_7d_prev
  const week = `${plural(home.sessions_7d, 'sessão', 'sessões')} nos últimos 7 dias${home.sessions_7d_prev > 0 ? ` (${delta >= 0 ? '+' : '−'}${Math.abs(delta)} que na semana anterior)` : ''}`
  const last = home.last_session
  const ratings = ['5.0', '4.5', '4.0', '3.5', '3.0', '2.5', '2.0', '1.5', '1.0', '0.5']
  const buckets = ratings.map((k) => ({ value: Number(k), count: home.rating_histogram[k] ?? 0 }))

  return (
    <Page>
      <Hero
        eyebrow={`Cinemateca · ${year}`}
        eyebrowIcon="movie"
        title={plural(home.counts.films_watched, 'filme visto', 'filmes vistos')}
        meta={<><span>{week}</span>{last && <><span>·</span><span>Último: {last.title} {fmtRelative(last.watched_date, akane.today)}</span></>}</>}
      />

      <section aria-labelledby="ax-log">
        <SectionHeader title="Logar" id="ax-log" mono="Enter salva · Shift+Enter abre o formulário" />
        <LogCapture />
      </section>

      <section aria-labelledby="ax-fav">
        <SectionHeader title="Favoritos" id="ax-fav" action={<Button variant="ghost" size="sm" icon="edit" onClick={() => setPicking(true)}>Escolher</Button>} />
        {home.favorites.length === 0
          ? <p className="ds-hint">Escolha até 4 filmes para a sua vitrine.</p>
          : (
            <div className="ds-grid">
              {home.favorites.map((f, i) => (
                <MediaCard key={f.id} title={f.title} image={f.poster_url} icon="movie" hue={hueFromName(f.title)} index={i} onOpen={() => akane.goto({ view: 'films', movieId: f.id })} />
              ))}
            </div>
          )}
      </section>

      <div className="ds-cols2">
        <section aria-labelledby="ax-rec">
          <SectionHeader title="Atividade recente" id="ax-rec" action={<Button variant="ghost" size="sm" iconRight="right" onClick={() => akane.goto('diary')}>Ver diário</Button>} />
          {home.recent_activity.length === 0
            ? <p className="ds-hint">Nenhuma sessão ainda.</p>
            : <div className="ds-list">{home.recent_activity.map((e) => <ActivityRow key={e.id} entry={e} today={akane.today} />)}</div>}
        </section>
        <section aria-labelledby="ax-next">
          <SectionHeader title="Quero ver" id="ax-next" action={<Button variant="ghost" size="sm" iconRight="right" onClick={() => akane.goto('watchlist')}>Ver lista</Button>} />
          {home.watchlist_highlight.length === 0
            ? <p className="ds-hint">Nada guardado para ver depois.</p>
            : (
              <div className="ds-list">
                {home.watchlist_highlight.map((m) => (
                  <button key={m.id} type="button" className="ds-lrow" onClick={() => akane.goto({ view: 'films', movieId: m.id })}>
                    <span className="ds-lead"><Icon name="watchlist" size={18} /></span>
                    <span className="ds-t"><b>{m.title}</b><span>{[m.year, m.director[0]].filter(Boolean).join(' · ')}</span></span>
                    <Icon name="right" size={16} />
                  </button>
                ))}
              </div>
            )}
        </section>
      </div>

      <section aria-labelledby="ax-ritmo">
        <SectionHeader title="Ritmo do ano" id="ax-ritmo" action={<Button variant="ghost" size="sm" iconRight="right" onClick={() => akane.goto('stats')}>Estatísticas</Button>} />
        <div className="ds-card ax-pad">
          <Heatmap year={year} daily={days} today={akane.today} thresholds={[1, 2, 3, 4]} formatValue={(v) => plural(v, 'sessão', 'sessões')} label={`Sessões por dia em ${year}`} />
        </div>
      </section>

      <section aria-labelledby="ax-nota">
        <SectionHeader title="Como você avalia" id="ax-nota" />
        <div className="ds-card ax-pad"><Distribution buckets={buckets} /></div>
      </section>

      {picking && <FavoritesPicker current={home.favorites} onClose={() => setPicking(false)} />}
    </Page>
  )
}

function ActivityRow({ entry, today }: { entry: DiaryEntry; today: string }) {
  const akane = useAkane()
  const meta = [fmtRelative(entry.watched_date, today), entry.watch_location?.name].filter(Boolean).join(' · ')
  return (
    <button type="button" className="ds-lrow" onClick={() => akane.goto({ view: 'films', movieId: entry.movie_id })}>
      <span className="ds-lead"><Icon name={entry.rewatch ? 'rewatch' : 'movie'} size={18} /></span>
      <span className="ds-t"><b>{entry.movie_title ?? 'Filme'}</b><span>{meta}</span></span>
      {entry.liked && <Icon name="heart" size={14} label="Curtido" />}
      {entry.rating ? <Stars value={entry.rating} /> : null}
    </button>
  )
}
