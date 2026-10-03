// Resumo: a retrospectiva do ano (ou de um mês) no StatsPage do Design System — receitas, despesas, taxa de
// poupança, patrimônio real, gasto por mês, mapa de calor, categorias e recordes. O período muda a consulta.

import { useMemo, useState } from 'react'
import { fmtMoney, fmtPercent, todayISO } from '../../../design/core/format'
import type { StatsPayload } from '../../../design/core/stats'
import { ErrorState, LoadingState, Page, StatsPage } from '../../../design'
import { useNami } from '../context'
import { useLoad } from '../lib/useLoad'
import { namiApi } from '../namiApi'

type Metric = 'expense' | 'income'

export function Summary() {
  const nami = useNami()
  const today = useMemo(() => todayISO(), [])
  const maxYear = Number(today.slice(0, 4))
  const [year, setYear] = useState(maxYear)
  const [metric, setMetric] = useState<Metric>('expense')
  const { state, retry } = useLoad(() => namiApi.getStats(year), [year, nami.rev])

  if (state.status === 'loading') return <Page><LoadingState variant="stat" count={4} /></Page>
  if (state.status === 'error') return <Page><ErrorState onRetry={retry} /></Page>

  const stats = state.data
  // A série mensal do StatsPage é uma só: despesas por padrão, receitas na outra métrica (já vêm juntas do servidor).
  const payload: StatsPayload = metric === 'income' ? { ...stats, monthly: stats.monthly_income } : stats
  const income = stats.kpis.find((k) => k.key === 'income')?.value ?? 0
  const expense = stats.kpis.find((k) => k.key === 'expense')?.value ?? 0
  const rate = stats.kpis.find((k) => k.key === 'savings_rate')?.value ?? 0
  const net = stats.net_worth

  return (
    <StatsPage
      payload={payload}
      hero={{
        eyebrow: 'Seu dinheiro no ano',
        summary: (
          <>
            <span>Entrou {fmtMoney(income, { mask: nami.hide })} e saiu {fmtMoney(expense, { mask: nami.hide })}.</span>
            <span>{income > 0 ? `Sobrou ${fmtPercent(Math.max(0, rate) / 100)} da renda.` : 'Sem entradas lançadas neste período.'}</span>
            <span>Patrimônio líquido hoje: {fmtMoney(net.patrimonio_liquido, { mask: nami.hide })} (contas {fmtMoney(net.saldo_contas, { mask: nami.hide })} − cartões {fmtMoney(net.divida_cartoes, { mask: nami.hide })}).</span>
          </>
        ),
      }}
      minYear={maxYear - 5}
      maxYear={maxYear}
      onYear={setYear}
      today={today}
      heatThresholds={[1, 50, 150, 400]}
      formatDaily={(v) => fmtMoney(v, { mask: nami.hide })}
      heatmapTitle="Dias com gasto"
      monthlyTitle={metric === 'income' ? 'Entradas por mês' : 'Gastos por mês'}
      metrics={[{ value: 'expense', label: 'Despesas' }, { value: 'income', label: 'Entradas' }]}
      metric={metric}
      onMetric={(m) => setMetric(m as Metric)}
      emptyHint="Lance um gasto ou uma entrada para ver a retrospectiva deste ano."
    />
  )
}
