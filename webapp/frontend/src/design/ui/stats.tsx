// Estatísticas / Rewind — componentes e <StatsPage> (padrão da Frieren, ampliado).
// Ordem fixa: período → hero de retrospectiva → KPIs com delta → mapa de calor por mês → ritmo mensal
// + distribuição de notas → rankings → recordes e sequências → comparativo → momentos.
// Os componentes consomem o contrato StatsPayload (core/stats). Uma tela só cobre "Stats" e "Rewind".

import { useEffect, useState, type ReactNode } from 'react'
import { fmtNumber, MONTHS_LONG, MONTHS_SHORT, todayISO } from '../core/format'
import { buildHeatmapMonths, computeDelta, ratingDistribution, type DailyPoint, type HeatThresholds, type MonthlyPoint, type RankItem, type RecordItem, type StatsKpi, type StatsPayload } from '../core/stats'
import { usePrefersReducedMotion } from '../headless/useBreakpoint'
import { EmptyState } from './feedback'
import { Hero, Page, SectionHeader } from './shell'
import { cx, IconButton } from './primitives'
import { Stars } from './rating'

// ── CountUp ──────────────────────────────────────────────────────────────────

export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const reduce = usePrefersReducedMotion()
  const [shown, setShown] = useState(reduce ? value : 0)
  useEffect(() => {
    if (reduce) { setShown(value); return }
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 700)
      setShown(value * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, reduce])
  return <>{fmtNumber(shown, decimals)}</>
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

export function DeltaBadge({ current, previous, absolute, previousLabel }: { current: number; previous?: number | null; absolute?: boolean; previousLabel: string }) {
  const d = computeDelta(current, previous, absolute)
  if (d.value === null) return <span className="ds-delta ds-flat">sem base de {previousLabel}</span>
  const sign = d.direction === 'flat' ? '■' : d.direction === 'up' ? '▲' : '▼'
  const amount = d.kind === 'absolute' ? fmtNumber(Math.abs(d.value), 1) : `${fmtNumber(Math.abs(d.value))}%`
  return (
    <span className={`ds-delta ds-${d.direction}`}>
      <span aria-hidden="true">{sign}</span>
      <span className="ds-sr-only">{d.direction === 'up' ? 'Subiu' : d.direction === 'down' ? 'Caiu' : 'Estável'}</span>
      {amount} <span>vs {previousLabel}</span>
    </span>
  )
}

export function KpiGrid({ kpis, previousLabel }: { kpis: StatsKpi[]; previousLabel: string }) {
  return (
    <div className="ds-kpis">
      {kpis.map((k) => (
        <div key={k.key} className="ds-kpi ds-card">
          <span className="ds-mono">{k.label}</span>
          <span className="ds-v"><CountUp value={k.value} decimals={k.decimals ?? 0} />{k.unit && <small>{k.unit}</small>}</span>
          <DeltaBadge current={k.value} previous={k.prev} absolute={k.absoluteDelta} previousLabel={previousLabel} />
        </div>
      ))}
    </div>
  )
}

// ── Mapa de calor: um bloco por mês (modelo da Frieren) ──────────────────────

export interface HeatmapProps {
  year: number
  /** Lista esparsa do backend (só dias com atividade). */
  daily: DailyPoint[]
  today?: string
  /** Limites dos níveis 1..4 na unidade do domínio (minutos, páginas, episódios…). */
  thresholds?: HeatThresholds
  /** Texto do tooltip de um dia com valor. */
  formatValue?: (value: number) => string
  /** Descrição acessível. */
  label?: string
}

export function Heatmap({ year, daily, today = todayISO(), thresholds, formatValue = (v) => String(v), label }: HeatmapProps) {
  const months = buildHeatmapMonths(year, daily, today, thresholds)
  return (
    <div>
      <div className="ds-hm-wrap">
        <div className="ds-hm" role="img" aria-label={label ?? `Mapa de calor de ${year}, um bloco por mês`}>
          {months.map((m) => (
            <div className="ds-hm-mo" key={m.month}>
              <div className="ds-hm-name">{m.name}</div>
              <div className="ds-hm-cells">
                {m.cells.map((c, i) =>
                  c ? (
                    <i key={i} className={cx('ds-hm-c', c.level > 0 && `ds-l${c.level}`, c.future && 'ds-fut')} title={`${c.date.slice(8)}/${c.date.slice(5, 7)}: ${c.value > 0 ? formatValue(c.value) : 'sem registro'}`} />
                  ) : (
                    <i key={i} className="ds-hm-c ds-nul" />
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="ds-hm-leg">
        menos {[0, 1, 2, 3, 4].map((l) => <i key={l} className={cx('ds-hm-c', l > 0 && `ds-l${l}`)} />)} mais
      </div>
    </div>
  )
}

// ── Ritmo mensal ─────────────────────────────────────────────────────────────

export function BarSeries({ monthly, unit, decimals = 0, label }: { monthly: MonthlyPoint[]; unit: string; decimals?: number; label?: string }) {
  const byMonth = Array.from({ length: 12 }, (_, i) => monthly.find((m) => m.month === i + 1)?.value ?? 0)
  const max = Math.max(...byMonth, 1)
  const best = byMonth.indexOf(Math.max(...byMonth))
  return (
    <div className="ds-bars" role="img" aria-label={label ?? `${unit} por mês`}>
      {byMonth.map((v, i) => (
        <div key={i} className={cx('ds-bcol', i === best && v > 0 && 'ds-best')}>
          <span className="ds-bv">{v ? fmtNumber(v, decimals) : ''}</span>
          <div className="ds-bb" style={{ height: `${(v / max) * 100}%`, '--ds-i': i } as React.CSSProperties} title={`${MONTHS_LONG[i]}: ${fmtNumber(v, decimals)} ${unit}`} />
          <span className="ds-mono">{MONTHS_SHORT[i]}</span>
        </div>
      ))}
    </div>
  )
}

// ── Distribuição de notas (0.5 a 5, sem perder valores) ──────────────────────

export function Distribution({ buckets }: { buckets: { value: number; count: number }[] }) {
  const max = Math.max(...buckets.map((b) => b.count), 1)
  return (
    <div className="ds-dist">
      {buckets.map((b) => (
        <div key={b.value} className="ds-drow">
          <Stars value={b.value} />
          <div className="ds-bar"><i style={{ width: `${(b.count / max) * 100}%` }} /></div>
          <b>{b.count}</b>
        </div>
      ))}
    </div>
  )
}

// ── Rankings e recordes ──────────────────────────────────────────────────────

export function RankList({ items }: { items: RankItem[] }) {
  const top = Math.max(...items.map((i) => i.count), 1)
  return (
    <div className="ds-rank">
      {items.map((it, i) => (
        <div key={it.label} className="ds-rk">
          <span className="ds-n">{i + 1}</span>
          <div style={{ minWidth: 0 }}>
            <b>{it.label}</b>
            <div className="ds-bar"><i style={{ width: `${(it.count / top) * 100}%` }} /></div>
          </div>
          <span className="ds-num" style={{ fontWeight: 700 }}>{it.count}</span>
        </div>
      ))}
    </div>
  )
}

export function RecordList({ records }: { records: RecordItem[] }) {
  return (
    <div className="ds-recs">
      {records.map((r) => (
        <div key={r.label} className="ds-rec ds-card">
          <span className="ds-mono">{r.label}</span>
          <b>{r.value}</b>
          {r.detail && <span className="ds-hint">{r.detail}</span>}
        </div>
      ))}
    </div>
  )
}

export function YearNav({ year, min, max, onChange }: { year: number; min: number; max: number; onChange: (y: number) => void }) {
  return (
    <div className="ds-yearnav">
      <IconButton icon="left" label="Ano anterior" size={16} disabled={year <= min} onClick={() => onChange(year - 1)} />
      <b className="ds-num">{year}</b>
      <IconButton icon="right" label="Próximo ano" size={16} disabled={year >= max} onClick={() => onChange(year + 1)} />
    </div>
  )
}

// ── StatsPage ────────────────────────────────────────────────────────────────

export interface StatsPageProps {
  payload: StatsPayload | null
  /** "Seu ano em treino". */
  hero: { eyebrow: string; summary: ReactNode }
  /** Anos disponíveis (seletor de período; muda a query no backend). */
  minYear: number
  maxYear: number
  onYear: (year: number) => void
  today?: string
  heatThresholds?: HeatThresholds
  formatDaily?: (v: number) => string
  /** Alterna a métrica da série mensal (o payload deve vir recalculado). */
  metrics?: { value: string; label: string }[]
  metric?: string
  onMetric?: (m: string) => void
  /** Notas de cada item, para a distribuição (0.5 a 5). Se omitido, usa payload.distribution. */
  ratings?: number[]
  /** Cartões dos momentos do ano. */
  renderMoment?: (m: StatsPayload['moments'][number], i: number) => ReactNode
  /** Estado vazio do período. */
  emptyHint?: string
}

export function StatsPage({ payload, hero, minYear, maxYear, onYear, today, heatThresholds, formatDaily, metrics, metric, onMetric, ratings, renderMoment, emptyHint }: StatsPageProps) {
  const year = payload?.period.year ?? maxYear
  const nav = <YearNav year={year} min={minYear} max={maxYear} onChange={onYear} />
  if (!payload || payload.kpis.every((k) => !k.value)) {
    return (
      <Page wide>
        <div className="ds-inline">{nav}</div>
        <EmptyState icon="stats" title={`Sem registros em ${year}`} hint={emptyHint ?? 'Registre algo para ver as estatísticas deste ano.'} />
      </Page>
    )
  }
  const prevLabel = payload.previous?.label ?? String(year - 1)
  const dist = ratings ? ratingDistribution(ratings) : payload.distribution.map((d) => ({ value: Number(d.bucket), count: d.count }))
  return (
    <Page wide>
      <div className="ds-row-between">{nav}<span className="ds-mono">Compara com o mesmo período de {prevLabel}</span></div>
      <Hero compact eyebrow={hero.eyebrow} eyebrowIcon="trophy" title={`${payload.period.label}`} meta={hero.summary} />
      <KpiGrid kpis={payload.kpis} previousLabel={prevLabel} />
      <section className="ds-panel ds-card" aria-labelledby="ds-hm-t">
        <h3 id="ds-hm-t">Dias com registro</h3>
        <Heatmap year={year} daily={payload.daily} today={today} thresholds={heatThresholds} formatValue={formatDaily} />
      </section>
      <div className="ds-cols2">
        <section className="ds-panel ds-card">
          <div className="ds-row-between">
            <h3>Ritmo por mês</h3>
            {metrics && metric && onMetric && (
              <div className="ds-seg" role="group" aria-label="Métrica">
                {metrics.map((m) => <button key={m.value} type="button" className={cx(metric === m.value && 'ds-on')} aria-pressed={metric === m.value} onClick={() => onMetric(m.value)}>{m.label}</button>)}
              </div>
            )}
          </div>
          <BarSeries monthly={payload.monthly} unit={payload.monthlyUnit} decimals={payload.monthlyUnit === 'treinos' ? 0 : 1} />
        </section>
        {dist.some((d) => d.count > 0) && (
          <section className="ds-panel ds-card"><h3>Como você avalia</h3><Distribution buckets={dist} /></section>
        )}
      </div>
      {Object.keys(payload.rankings).length > 0 && (
        <div className="ds-cols2">
          {Object.entries(payload.rankings).map(([k, r]) => (
            <section key={k} className="ds-panel ds-card"><h3>{r.title}</h3><RankList items={r.items} /></section>
          ))}
        </div>
      )}
      {payload.records.length > 0 && (
        <section aria-labelledby="ds-rec-t">
          <SectionHeader title="Recordes e sequências" id="ds-rec-t" />
          <RecordList records={payload.records} />
        </section>
      )}
      {payload.moments.length > 0 && renderMoment && (
        <section aria-labelledby="ds-mom-t">
          <SectionHeader title="Momentos do ano" id="ds-mom-t" mono="os mais marcantes" />
          <div className="ds-grid">{payload.moments.map(renderMoment)}</div>
        </section>
      )}
    </Page>
  )
}

