// Estatísticas: o ano em filmes (une o antigo Stats e o Rewind). Tudo vem do backend no contrato StatsPayload.

import { useState } from 'react'
import { fmtNumber } from '../../../design/core/format'
import { ErrorState, LoadingState, MediaCard, Page, StatsPage, hueFromName } from '../../../design'
import { akaneApi } from '../akaneApi'
import { useAkane } from '../context'
import { useLoad } from '../lib/useLoad'

export function Stats() {
  const akane = useAkane()
  const maxYear = Number(akane.today.slice(0, 4))
  const [year, setYear] = useState(maxYear)
  const { state, retry } = useLoad(() => akaneApi.statsPayload(year), [year, akane.rev])

  if (state.status === 'loading') return <Page wide><LoadingState variant="stat" count={4} /></Page>
  if (state.status === 'error') return <Page wide><ErrorState onRetry={retry} /></Page>

  const p = state.data
  const kpi = (key: string) => p.kpis.find((k) => k.key === key)?.value ?? 0
  const films = kpi('films')
  const summary = (
    <>
      <span>{fmtNumber(films)} {films === 1 ? 'filme' : 'filmes'}</span>
      <span>·</span>
      <span>{fmtNumber(kpi('hours'))} h de tela</span>
      {kpi('avg_rating') > 0 && <><span>·</span><span>nota média {fmtNumber(kpi('avg_rating'), 1)}</span></>}
    </>
  )

  return (
    <StatsPage
      payload={p}
      hero={{ eyebrow: 'Seu ano em filmes', summary }}
      minYear={p.first_year}
      maxYear={maxYear}
      onYear={setYear}
      today={akane.today}
      heatThresholds={[1, 2, 3, 4]}
      formatDaily={(v) => `${v} ${v === 1 ? 'sessão' : 'sessões'}`}
      emptyHint="Logue um filme neste ano para ver as estatísticas."
      momentsClass="ds-grid-poster"
      renderMoment={(m, i) => (
        <MediaCard key={m.id} cover="poster" title={m.title} subtitle={m.subtitle} image={m.image} icon="movie" hue={hueFromName(m.title)} rating={m.rating} index={i} onOpen={() => akane.goto({ view: 'films', movieId: String(m.id) })} />
      )}
    />
  )
}
