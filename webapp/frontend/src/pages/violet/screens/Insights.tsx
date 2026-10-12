// Insights — o ano no diário (spec 076). No topo, a FORÇA da escrita: o mesmo motor dos hábitos da Kaguya
// ("caixa d'água": escrever enche, faltar vaza um pouco; a régua é a sua meta semanal — dias de folga não são
// falha). Depois, horários (fuso local) e emoções × intensidade. Embaixo, o StatsPage do padrão: dias, palavras,
// taxa de destaque, ritmo por mês, pessoas/tags/emoções mais presentes, recordes e momentos favoritos.

import { useState } from 'react'
import { ErrorState, Icon, LoadingState, Page, ProgressRing, SegmentedControl, StatsPage } from '../../../design'
import { fmtDate, fmtNumber, MONTHS_SHORT, pluralize } from '../../../design/core/format'
import { useViolet } from '../context'
import { plainText } from '../lib/markup'
import { useLoad } from '../lib/useLoad'
import { violetApi } from '../violetApi'

const TREND = { up: { label: 'subindo', icon: 'trend-up' }, down: { label: 'caindo', icon: 'trend-down' }, flat: { label: 'estável', icon: 'minus' } } as const

export function Insights() {
  const v = useViolet()
  const maxYear = Number(v.today.slice(0, 4))
  const [year, setYear] = useState(maxYear)
  const { state, retry } = useLoad(() => violetApi.stats(year, v.prefs.weeklyTarget), [year, v.rev, v.prefs.weeklyTarget])
  const years = useLoad(() => violetApi.years(), [])

  if (state.status === 'loading') return <Page wide><LoadingState variant="stat" count={4} /></Page>
  if (state.status === 'error') return <Page wide><ErrorState onRetry={retry} /></Page>
  const p = state.data
  const s = p.strength
  const minYear = years.state.status === 'ok' ? Math.min(...years.state.data) : maxYear
  const kpi = (key: string) => p.kpis.find((k) => k.key === key)?.value ?? 0
  const maxHour = Math.max(1, ...p.distribution.map((d) => d.count))
  const trend = TREND[s.trend]

  return (
    <>
      <Page wide>
        <section className="vl-card vl-strength" aria-labelledby="vl-strength-t">
          <div className="vl-strength-ring"><ProgressRing value={s.consistency} size={112} label={`Força da escrita: ${s.consistency}%`} /></div>
          <div className="vl-strength-body">
            <h3 id="vl-strength-t">Força da escrita</h3>
            <p className="vl-strength-n"><b>{s.consistency}%</b>
              <span className={`vl-pill vl-trend-${s.trend}`}><Icon name={trend.icon} size={12} />{trend.label}</span></p>
            <p className="vl-muted">{s.recent_done}/{s.recent_total} dias escritos nas últimas 2 semanas · melhor dos últimos 90 dias: {s.best}%</p>
            <p className="vl-muted vl-small">Um dia sem escrever baixa um pouco; voltar a escrever sobe. Nada zera.</p>
            <SegmentedControl label="Meta de dias por semana" value={String(v.prefs.weeklyTarget)} onChange={(x) => v.setPrefs({ weeklyTarget: Number(x) })}
              options={['3', '4', '5', '6', '7'].map((n) => ({ value: n, label: `${n}×/sem` }))} />
          </div>
          <div className="vl-strength-chart" role="img" aria-label="Força nos últimos 90 dias">
            {s.series.map((pt) => <span key={pt.date} title={`${fmtDate(pt.date)}: ${pt.value}%`} className={pt.done ? 'vl-on' : undefined} style={{ ['--vl-level' as string]: pt.value / 100 }} />)}
          </div>
        </section>

        <div className="vl-twocol">
          <section className="vl-card">
            <h4 className="vl-card-title">Quando você escreve</h4>
            <div className="vl-hours">
              {p.distribution.map((d) => (
                <span key={d.bucket} className="vl-hourcol" title={`${d.bucket}: ${pluralize(d.count, 'momento', 'momentos')}`}>
                  <span style={{ ['--vl-level' as string]: d.count / maxHour }} /><small>{d.bucket}</small>
                </span>
              ))}
            </div>
          </section>
          <section className="vl-card">
            <h4 className="vl-card-title">Emoções × intensidade</h4>
            {p.emotions.by_emotion.length === 0 && <p className="vl-muted">Nenhum registro emocional neste ano.</p>}
            {p.emotions.by_emotion.slice(0, 7).map((e) => (
              <div key={e.name} className="vl-rankrow">
                <span>{e.name}</span>
                <span className="vl-emo-bar"><span style={{ ['--vl-level' as string]: e.avg_intensity / 10 }} /></span>
                <span className="ds-mono">{e.count}× · {fmtNumber(e.avg_intensity, 1)}{e.avg_relief ? ` · −${fmtNumber(e.avg_relief, 1)}` : ''}</span>
              </div>
            ))}
            {p.emotions.by_month.length > 0 && (
              <p className="vl-muted vl-small">Mês mais pesado: {MONTHS_SHORT[[...p.emotions.by_month].sort((a, b) => b.avg - a.avg)[0].month - 1]} (média {fmtNumber([...p.emotions.by_month].sort((a, b) => b.avg - a.avg)[0].avg, 1)})</p>
            )}
          </section>
        </div>
      </Page>
      <StatsPage
        payload={p}
        hero={{
          eyebrow: 'Seu ano no diário',
          summary: (
            <>
              <span>{pluralize(kpi('days'), 'dia escrito', 'dias escritos')}</span><span>·</span>
              <span>{pluralize(kpi('words'), 'palavra', 'palavras')}</span><span>·</span>
              <span>{kpi('highlight_rate')}% dos dias com destaque</span>
            </>
          ),
        }}
        minYear={minYear}
        maxYear={maxYear}
        onYear={setYear}
        today={v.today}
        ratings={[]}
        heatThresholds={[1, 60, 200, 450]}
        formatDaily={(n) => pluralize(n, 'palavra', 'palavras')}
        heatmapTitle="Dias escritos (palavras)"
        monthlyTitle="Palavras por mês"
        emptyHint="Escreva neste ano para ver os insights."
        renderMoment={(m) => (
          <button key={m.id} type="button" className="vl-moment" onClick={() => v.goto({ view: 'write', date: (m as { date?: string }).date })}>
            <Icon name="heart" size={14} /><span>{plainText(m.title)}</span><small className="ds-mono">{m.subtitle}</small>
          </button>
        )}
        momentsClass="vl-moments"
      />
    </>
  )
}
