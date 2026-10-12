// Foco: o overview gameficado. A floresta do período, o ano em minutos, “quando eu foco × quando eu largo”, onde o tempo
// foi, o padrão de falha (taxa de conclusão e motivos recentes) e as conquistas. Um payload só (`GET /focus/stats`): nada
// é agregado aqui, a tela só desenha o que o backend já calculou.

import { useState } from 'react'
import { Button, ErrorState, Heatmap, LoadingState, Page, SectionHeader, SegmentedControl } from '../../../design'
import { addDaysISO, fmtDate } from '../../../design/core/format'
import { kaguyaApi } from '../api'
import { Achievements, FocusForest, HourBars, Rankings } from '../components/FocusViews'
import { useKaguya } from '../context'
import { fmtMinutes } from '../lib/taskView'
import { useLoad } from '../lib/useLoad'

type Period = 'week' | 'month' | 'year' | 'all'
const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: '7 dias' }, { value: 'month', label: '30 dias' }, { value: 'year', label: 'Este ano' }, { value: 'all', label: 'Tudo' },
]

/** Início do período a partir do dia local de hoje (nunca do relógio do servidor). */
export function periodStart(period: Period, today: string): string {
  if (period === 'week') return addDaysISO(today, -6)
  if (period === 'month') return addDaysISO(today, -29)
  if (period === 'year') return `${today.slice(0, 4)}-01-01`
  return '2000-01-01' // bem antes de qualquer sessão real
}

export function Focus() {
  const k = useKaguya()
  const [period, setPeriod] = useState<Period>('month')
  const year = Number(k.today.slice(0, 4))
  const { state, retry } = useLoad(async () => {
    const [stats, heat, ach] = await Promise.all([
      kaguyaApi.focus.stats(periodStart(period, k.today), k.today),
      kaguyaApi.focus.heatmap(year),
      kaguyaApi.focus.achievements(),
    ])
    return { stats, heat, ach }
  }, [period, k.today, k.rev])

  return (
    <Page wide className="kn-page">
      <div className="kn-quick">
        <SegmentedControl<Period> label="Período" value={period} onChange={setPeriod} options={PERIODS} />
        <Button variant="primary" icon="play" onClick={() => k.startFocus({})}>Iniciar foco</Button>
      </div>
      <p className="ds-hint">Cada sessão vira uma árvore. Desistir não apaga a floresta.</p>

      {state.status === 'loading' && <LoadingState variant="stat" count={4} />}
      {state.status === 'error' && <ErrorState onRetry={retry} />}
      {state.status === 'ok' && (() => {
        const { stats, heat, ach } = state.data
        const o = stats.outcome
        return (
          <>
            <dl className="kn-kpis" aria-label="Resumo do período">
              <div><dd className="ds-num">{stats.streak}</dd><dt>dias seguidos</dt></div>
              <div><dd className="ds-num">{fmtMinutes(stats.totals.total_min)}</dd><dt>focados no período</dt></div>
              <div><dd className="ds-num">{stats.totals.sessoes}</dd><dt>sessões concluídas</dt></div>
              <div><dd className="ds-num">{o.completion_pct}%</dd><dt>taxa de conclusão</dt></div>
            </dl>

            <section aria-labelledby="kn-f-forest"><SectionHeader id="kn-f-forest" title="Floresta" /><FocusForest sessions={stats.sessions} /></section>

            <section aria-labelledby="kn-f-year">
              <SectionHeader id="kn-f-year" title={`O ano em minutos — ${year}`} />
              <Heatmap year={year} daily={heat.map((d) => ({ date: d.date, value: d.total_min }))} today={k.today} thresholds={[1, 25, 60, 120]} formatValue={(v) => fmtMinutes(v)} label={`Minutos de foco por dia em ${year}`} />
            </section>

            <section aria-labelledby="kn-f-hours"><SectionHeader id="kn-f-hours" title="Quando eu foco" /><HourBars data={stats.by_hour} /></section>

            <section aria-labelledby="kn-f-where">
              <SectionHeader id="kn-f-where" title="Onde eu foco" />
              <Rankings blocks={[{ title: 'Tarefas', items: stats.top_tasks }, { title: 'Listas', items: stats.top_projects }, { title: 'Hábitos', items: stats.top_habits }]} />
            </section>

            <section aria-labelledby="kn-f-fail">
              <SectionHeader id="kn-f-fail" title="Padrão de falha" />
              <dl className="kn-kpis" aria-label="Desistências">
                <div><dd className="ds-num">{o.cancelled}</dd><dt>canceladas</dt></div>
                <div><dd className="ds-num">{o.abandoned}</dd><dt>abandonadas</dt></div>
                <div><dd className="ds-num">{o.avg_min_before_quit != null ? `${o.avg_min_before_quit}min` : '—'}</dd><dt>tempo médio antes de largar</dt></div>
              </dl>
              {stats.recent_reasons.length > 0 && (
                <ul className="kn-sublist" aria-label="Motivos recentes">
                  {stats.recent_reasons.map((r, i) => <li key={i}><span className="ds-mono">{fmtDate(r.date)}</span><span>“{r.reason}”</span></li>)}
                </ul>
              )}
            </section>

            <section aria-labelledby="kn-f-ach"><SectionHeader id="kn-f-ach" title="Conquistas" /><Achievements items={ach} /></section>
          </>
        )
      })()}
    </Page>
  )
}
