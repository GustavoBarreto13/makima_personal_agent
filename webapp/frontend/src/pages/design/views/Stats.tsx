// Estatísticas do agente de exemplo no <StatsPage> do padrão (modelo da Frieren, ampliado).

import { useMemo, useState } from 'react'
import { fmtDuration, MONTHS_LONG } from '../../../design/core/format'
import { MediaCard, StatsPage } from '../../../design'
import { buildStatsPayload, TYPE_META, type StatsMetric, type Workout } from '../demoData'

export function StatsView({ workouts, today, onOpen }: { workouts: Workout[]; today: string; onOpen: (id: number) => void }) {
  const maxYear = Number(today.slice(0, 4))
  const years = [...new Set(workouts.map((w) => Number(w.date.slice(0, 4))))]
  const minYear = Math.min(...years)
  const [year, setYear] = useState(maxYear)
  const [metric, setMetric] = useState<StatsMetric>('count')
  // Em um domínio real isto é GET /api/<domínio>/stats?year=…; o período muda a query, não só o filtro do front.
  const payload = useMemo(() => buildStatsPayload(workouts, year, today, metric), [workouts, year, today, metric])
  const done = workouts.filter((w) => w.status === 'done' && w.date.startsWith(String(year)))
  const weeks = new Set(done.map((w) => w.date.slice(0, 7))).size
  const first = payload.kpis[0].value
  const prev = payload.kpis[0].prev ?? 0
  const pct = prev ? Math.abs(Math.round(((first - prev) / prev) * 100)) : null
  return (
    <StatsPage
      payload={payload}
      hero={{
        eyebrow: 'Seu ano em treino',
        summary: (
          <>
            <span>{first} treinos em {weeks} {weeks === 1 ? 'mês' : 'meses'} com registro.</span>
            <span>{pct === null ? 'Primeiro ano com registros.' : `${pct}% ${first >= prev ? 'acima' : 'abaixo'} do mesmo período de ${year - 1}.`}</span>
          </>
        ),
      }}
      minYear={minYear}
      maxYear={maxYear}
      onYear={setYear}
      today={today}
      heatThresholds={[1, 30, 60, 90]}
      formatDaily={fmtDuration}
      metrics={[{ value: 'count', label: 'Treinos' }, { value: 'hours', label: 'Horas' }, { value: 'vol', label: 'Carga' }]}
      metric={metric}
      onMetric={(m) => setMetric(m as StatsMetric)}
      ratings={done.map((w) => w.rating)}
      renderMoment={(m, i) => {
        const w = workouts.find((x) => x.id === m.id)
        if (!w) return null
        return <MediaCard key={w.id} index={i} title={w.title} subtitle={`${w.type} · ${MONTHS_LONG[Number(w.date.slice(5, 7)) - 1]}`} icon={TYPE_META[w.type].icon} hue={TYPE_META[w.type].hue} rating={w.rating} onOpen={() => onOpen(w.id)} />
      }}
    />
  )
}
