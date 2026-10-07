// Estatísticas: o ano em leitura. Tudo vem do backend no contrato StatsPayload (GET /api/books/stats);
// a meta anual (das Preferências) entra aqui como mais um número, comparada aos livros lidos no ano.

import { useState } from 'react'
import { fmtNumber } from '../../../design/core/format'
import { ErrorState, hueFromName, LoadingState, MediaCard, Page, StatsPage } from '../../../design'
import type { StatsKpi } from '../../../design/core/stats'
import { DEFAULT_PREFS, useFrieren } from '../context'
import { frierenApi } from '../frierenApi'
import { useLoad } from '../lib/useLoad'

export function Stats() {
  const frieren = useFrieren()
  const maxYear = Number(frieren.today.slice(0, 4))
  const [year, setYear] = useState(maxYear)
  const { state, retry } = useLoad(() => frierenApi.stats(year), [year, frieren.rev])

  if (state.status === 'loading') return <Page wide><LoadingState variant="stat" count={4} /></Page>
  if (state.status === 'error') return <Page wide><ErrorState onRetry={retry} /></Page>

  const p = state.data
  const kpi = (key: string) => p.kpis.find((k) => k.key === key)?.value ?? 0
  const finished = kpi('books_finished')
  const goal = frieren.prefs.yearlyGoal > 0 ? frieren.prefs.yearlyGoal : DEFAULT_PREFS.yearlyGoal
  // Meta do ano: livros lidos contra a meta (a unidade mostra o alvo, ex.: "12 /24").
  const goalKpi: StatsKpi = { key: 'yearly_goal', label: 'Meta do ano', value: finished, unit: ` /${goal}`, decimals: 0, prev: null }
  const payload = { ...p, kpis: [goalKpi, ...p.kpis] }

  const summary = (
    <>
      <span>{fmtNumber(finished)} {finished === 1 ? 'livro lido' : 'livros lidos'}</span>
      <span>·</span>
      <span>{fmtNumber(kpi('pages'))} páginas</span>
      {finished < goal && year === maxYear && <><span>·</span><span>faltam {goal - finished} para a meta</span></>}
      {kpi('avg_rating') > 0 && <><span>·</span><span>nota média {fmtNumber(kpi('avg_rating'), 1)}</span></>}
    </>
  )

  return (
    <StatsPage
      payload={payload}
      hero={{ eyebrow: 'Seu ano em leitura', summary }}
      minYear={p.first_year}
      maxYear={maxYear}
      onYear={setYear}
      today={frieren.today}
      // Os mesmos níveis de páginas por dia do mapa do Início.
      heatThresholds={[1, 18, 38, 62]}
      formatDaily={(v) => `${v} ${v === 1 ? 'página' : 'páginas'}`}
      heatmapTitle="Dias de leitura"
      monthlyTitle="Páginas por mês"
      emptyHint="Registre uma leitura neste ano para ver as estatísticas."
      momentsClass="ds-grid-poster"
      renderMoment={(m, i) => (
        <MediaCard
          key={m.id}
          cover="poster"
          title={m.title}
          subtitle={m.subtitle}
          image={m.image}
          icon="book"
          hue={hueFromName(m.title)}
          rating={m.rating}
          index={i}
          onOpen={() => frieren.goto({ view: 'catalog', bookId: String(m.id) })}
        />
      )}
    />
  )
}
