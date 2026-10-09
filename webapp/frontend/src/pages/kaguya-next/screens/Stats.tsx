// Estatísticas: "Visão geral" no StatsPage do Design System (concluídas por dia/mês, no prazo × atrasadas, por lista e
// etiqueta, hábitos, metas, experimentos, foco) e "Planejamento" — onde o plano falha: planejado × feito no Meu Dia,
// tarefas empurradas, precisão das estimativas, dias sobrecarregados, idade das pendências e as horas mais produtivas,
// com um achado e uma sugestão de ação para cada gargalo. Tudo filtrado pelo espaço escolhido.

import { useMemo, useState } from 'react'
import {
  EmptyState, ErrorState, Icon, LoadingState, Page, ProgressRing, SectionHeader, StatsPage, Tabs,
} from '../../../design'
import { fmtDate } from '../../../design/core/format'
import { kaguyaApi, type PlanningStats } from '../api'
import { useKaguya } from '../context'
import { fmtMinutes } from '../lib/taskView'
import { useLoad } from '../lib/useLoad'

const SEVERITY_ICON = { alert: 'warning', warn: 'warning', info: 'insight' } as const

/** Barras horizontais simples (rótulo, barra, número) para distribuições curtas. */
function Bars({ rows, label }: { rows: { bucket: string; count: number }[]; label: string }) {
  const max = Math.max(...rows.map((r) => r.count), 1)
  return (
    <ul className="kn-bars" aria-label={label}>
      {rows.map((r) => (
        <li key={r.bucket}>
          <span>{r.bucket}</span>
          <span className="ds-bar" role="img" aria-label={`${r.bucket}: ${r.count}`}><i style={{ width: `${(r.count / max) * 100}%` }} /></span>
          <b className="ds-num">{r.count}</b>
        </li>
      ))}
    </ul>
  )
}

function Planning({ p }: { p: PlanningStats }) {
  const k = useKaguya()
  const rate = p.plan.rate
  return (
    <Page wide className="kn-page">
      {p.data_since && <p className="ds-hint">O histórico de planejamento começa em {fmtDate(p.data_since)} — antes disso não há “planejado × feito”.</p>}

      <section aria-labelledby="kn-ins">
        <SectionHeader id="kn-ins" title="Onde o plano falha" mono={`${p.insights.length}`} />
        {p.insights.length === 0 ? (
          <EmptyState icon="insight" title="Sem achados por enquanto" hint="Os alertas aparecem quando há dados suficientes: planeje o Meu Dia, estime o tempo das tarefas e use o foco. Quanto mais você registra, mais claro fica." />
        ) : (
          <ul className="kn-insights">
            {p.insights.map((i) => (
              <li key={i.key} className={`kn-insight kn-sev-${i.severity}`}>
                <Icon name={SEVERITY_ICON[i.severity]} size={18} />
                <div><b>{i.text}</b><p className="ds-hint">{i.action}</p></div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="ds-cols2">
        <section className="ds-panel ds-card" aria-label="Planejado e feito">
          <h3>Planejado × feito no Meu Dia</h3>
          {rate === null ? <p className="ds-hint">Ainda sem tarefas planejadas no período.</p> : (
            <>
              <div className="kn-ringrow"><ProgressRing value={rate} size={64} label={`${rate}% do plano concluído`} /><p><b>{Math.round(rate)}%</b> do que você planejou foi concluído no dia ({p.plan.done} de {p.plan.planned}).</p></div>
              <Bars label="Taxa por dia da semana" rows={p.plan.by_weekday.map((d) => ({ bucket: d.bucket, count: d.rate === null ? 0 : Math.round(d.rate) }))} />
            </>
          )}
        </section>

        <section className="ds-panel ds-card" aria-label="Estimativas">
          <h3>Suas estimativas</h3>
          {p.estimates.n === 0 ? <p className="ds-hint">Estime o tempo das tarefas e use o foco para ver o quanto você acerta.</p> : (
            <p>
              Em {p.estimates.n} tarefas, você estimou <b>{fmtMinutes(p.estimates.estimated_min)}</b> e levou <b>{fmtMinutes(p.estimates.focused_min)}</b>
              {p.estimates.bias_pct ? <> — {p.estimates.bias_pct > 0 ? `${p.estimates.bias_pct}% a mais` : `${Math.abs(p.estimates.bias_pct)}% a menos`} do que o previsto</> : ' — na mosca'}.
            </p>
          )}
          <h3>Sobrecarga</h3>
          {p.overload.days_planned === 0 ? <p className="ds-hint">Sem dias planejados no período.</p> : (
            <>
              <p><b>{p.overload.days_over}</b> de {p.overload.days_planned} dias planejados passaram do tempo livre.</p>
              {p.overload.worst.length > 0 && (
                <ul className="kn-sublist">
                  {p.overload.worst.map((w) => <li key={w.day}><span className="kn-title">{fmtDate(w.day)}</span><span className="ds-mono">+{fmtMinutes(w.over_min)} ({fmtMinutes(w.planned_min)} em {fmtMinutes(w.free_min)})</span></li>)}
                </ul>
              )}
            </>
          )}
        </section>
      </div>

      <section className="ds-panel ds-card" aria-label="Tarefas empurradas">
        <h3>Tarefas mais empurradas</h3>
        {p.pushed.top.length === 0 ? <p className="ds-hint">Nenhuma tarefa foi adiada várias vezes. Bom sinal.</p> : (
          <ul className="kn-sublist">
            {p.pushed.top.map((t) => (
              <li key={t.task_id}>
                <button type="button" className="kn-main" onClick={() => k.openTask(t.task_id)}><span className="kn-title">{t.title}</span></button>
                <span className="ds-mono">{t.count}×</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="ds-cols2">
        <section className="ds-panel ds-card" aria-label="Idade das pendências"><h3>Idade das pendências abertas</h3><Bars label="Idade" rows={p.age} /></section>
        <section className="ds-panel ds-card" aria-label="Dias da semana"><h3>Quando você conclui (dia da semana)</h3><Bars label="Dia da semana" rows={p.weekday} /></section>
      </div>
      <section className="ds-panel ds-card" aria-label="Horas do dia">
        <h3>Quando você conclui (hora do dia)</h3>
        <Bars label="Hora do dia" rows={p.hours.filter((h) => h.count > 0)} />
        {p.lead_time_days !== null && <p className="ds-hint">Tempo mediano da criação à conclusão: {Math.round(p.lead_time_days)} dia(s).</p>}
      </section>
    </Page>
  )
}

export function Stats() {
  const k = useKaguya()
  const thisYear = Number(k.today.slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const [tab, setTab] = useState<'geral' | 'planejamento'>('geral')
  const { state, retry } = useLoad(() => kaguyaApi.stats({ year, space: k.space }), [year, k.space, k.rev])

  // O StatsPage mostra a distribuição como estrelas (notas); a nossa é por prioridade e fica na aba Planejamento.
  const payload = useMemo(() => (state.status === 'ok' ? { ...state.data, distribution: [] } : null), [state])

  return (
    <>
      <Page wide className="kn-page">
        <Tabs
          label="Seções das estatísticas"
          value={tab}
          onChange={(t) => setTab(t as 'geral' | 'planejamento')}
          tabs={[{ id: 'geral', label: 'Visão geral' }, { id: 'planejamento', label: 'Planejamento' }]}
        />
      </Page>
      {state.status === 'loading' && <Page wide><LoadingState variant="stat" count={4} /></Page>}
      {state.status === 'error' && <Page wide><ErrorState onRetry={retry} /></Page>}
      {state.status === 'ok' && tab === 'planejamento' && <Planning p={state.data.planning} />}
      {state.status === 'ok' && tab === 'geral' && (
        <StatsPage
          payload={payload}
          hero={{ eyebrow: 'Seu ano em tarefas', summary: <span>{state.data.kpis.find((x) => x.key === 'completed')?.value ?? 0} tarefas concluídas</span> }}
          minYear={thisYear - 4}
          maxYear={thisYear}
          onYear={setYear}
          today={k.today}
          heatThresholds={[1, 3, 5, 8]}
          formatDaily={(v) => `${v} tarefa${v === 1 ? '' : 's'}`}
          heatmapTitle="Dias com tarefas concluídas"
          monthlyTitle="Concluídas por mês"
          emptyHint="Conclua tarefas para ver o seu ritmo, os atrasos e onde o tempo foi."
        />
      )}
    </>
  )
}
