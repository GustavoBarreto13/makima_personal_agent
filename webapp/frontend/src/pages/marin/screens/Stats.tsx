// Estatísticas: o ano em animes (une o antigo Stats e o Rewind). Tudo vem do backend no contrato StatsPayload.

import { useState } from 'react'
import { fmtNumber } from '../../../design/core/format'
import { ErrorState, LoadingState, MediaCard, Page, StatsPage, hueFromName } from '../../../design'
import { useMarin } from '../context'
import { useLoad } from '../lib/useLoad'
import { marinApi } from '../marinApi'

export function Stats() {
  const marin = useMarin()
  const maxYear = Number(marin.today.slice(0, 4))
  const [year, setYear] = useState(maxYear)
  const { state, retry } = useLoad(() => marinApi.statsPayload(year), [year, marin.rev])

  if (state.status === 'loading') return <Page wide><LoadingState variant="stat" count={4} /></Page>
  if (state.status === 'error') return <Page wide><ErrorState onRetry={retry} /></Page>

  const p = state.data
  const kpi = (key: string) => p.kpis.find((k) => k.key === key)?.value ?? 0
  const eps = kpi('episodes')
  const summary = (
    <>
      <span>{fmtNumber(kpi('animes'))} {kpi('animes') === 1 ? 'anime' : 'animes'}</span>
      <span>·</span>
      <span>{fmtNumber(eps)} {eps === 1 ? 'episódio' : 'episódios'}</span>
      <span>·</span>
      <span>{fmtNumber(kpi('hours'))} h de tela</span>
      {kpi('avg_rating') > 0 && <><span>·</span><span>nota média {fmtNumber(kpi('avg_rating'), 1)}</span></>}
    </>
  )

  return (
    <StatsPage
      payload={p}
      hero={{ eyebrow: 'Seu ano em animes', summary }}
      minYear={p.first_year}
      maxYear={maxYear}
      onYear={setYear}
      today={marin.today}
      heatThresholds={[1, 3, 6, 10]}
      formatDaily={(v) => `${v} ${v === 1 ? 'episódio' : 'episódios'}`}
      emptyHint="Logue um episódio neste ano para ver as estatísticas."
      momentsClass="ds-grid-poster"
      renderMoment={(m, i) => (
        <MediaCard key={m.id} cover="poster" title={m.title} subtitle={m.subtitle} image={m.image} icon="anime" hue={hueFromName(m.title)} rating={m.rating} index={i} onOpen={() => marin.goto({ view: 'catalog', animeId: String(m.id) })} />
      )}
    />
  )
}
