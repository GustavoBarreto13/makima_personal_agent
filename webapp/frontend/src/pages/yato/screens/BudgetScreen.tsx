/**
 * BudgetScreen.tsx — Yato · Viagens (fatia 066)
 *
 * 3 números grandes (estimado/realizado/saldo) + barra por categoria + tabela
 * de gastos com selo "→ Nami" (lançamento atômico, ver log_trip_expense).
 */

import { useEffect, useState } from 'react'
import type { Trip, BudgetResponse, TripExpense } from '../types'
import { yatoApi } from '../yatoApi'
import { fmtRange, fmtBR, money } from '../dateUtils'
import { BudgetBar, CAT_LABEL } from '../components/BudgetBar'
import { Icon } from '../components/Icon'

interface BudgetScreenProps {
  trip: Trip
  onLogExpense: () => void
  reloadKey: number
}

export function BudgetScreen({ trip, onLogExpense, reloadKey }: BudgetScreenProps) {
  const [budget, setBudget] = useState<BudgetResponse | null>(null)
  const [expenses, setExpenses] = useState<TripExpense[]>([])

  useEffect(() => {
    yatoApi.getBudget(trip.id).then(setBudget).catch(() => setBudget(null))
    yatoApi.listExpenses(trip.id).then(res => setExpenses(res.expenses)).catch(() => setExpenses([]))
  }, [trip.id, reloadKey])

  if (!budget) return <div className="page"><p className="dim">Carregando orçamento…</p></div>

  const neg = budget.total_balance < 0

  return (
    <div className="page">
      <div className="section-head" style={{ marginTop: 4 }}>
        <h2 className="section-title">Orçamento</h2>
        <span className="section-sub">{trip.city}/{trip.state_uf} · {fmtRange(trip.start_date, trip.end_date)}</span>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={onLogExpense}>
          <Icon name="cifrao" /> Registrar gasto
        </button>
      </div>

      <div className="big3">
        <div className="card big-num"><span className="bn-k">estimado</span><span className="bn-v mono">{money(budget.total_estimated)}</span><span className="bn-s">{budget.items.length} categorias</span></div>
        <div className="card big-num"><span className="bn-k">realizado</span><span className="bn-v mono">{money(budget.total_actual)}</span><span className="bn-s">{expenses.length} lançamentos</span></div>
        <div className="card big-num">
          <span className="bn-k">saldo</span>
          <span className="bn-v mono" style={{ color: neg ? 'var(--budget-over)' : 'var(--budget-ok)' }}>{money(budget.total_balance)}</span>
          <span className="bn-s">{neg ? 'estourou — reveja as categorias' : 'ainda cabe um passeio'}</span>
        </div>
      </div>

      <div className="section">
        <div className="card">
          <div className="dos-head" style={{ padding: '13px 18px' }}>
            <div className="dos-head-top">
              <span className="dos-kicker">por categoria</span>
              <span className="dos-checked">realizado sobre o trilho do estimado</span>
            </div>
          </div>
          <div className="bud-list">
            {budget.items.map(b => <BudgetBar key={b.category} item={b} />)}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Gastos</h2>
          <span className="section-sub">cada linha já espelhada nas finanças</span>
        </div>
        <div className="card" style={{ overflow: 'hidden' }}>
          {expenses.length === 0 && <p className="dim" style={{ padding: 16 }}>Nenhum gasto registrado ainda.</p>}
          {expenses.length > 0 && (
            <table className="exp-table">
              <thead><tr><th>data</th><th>categoria</th><th>descrição</th><th className="num">valor</th><th></th></tr></thead>
              <tbody>
                {expenses.map(e => (
                  <tr key={e.id}>
                    <td>{fmtBR(e.date)}</td>
                    <td>{CAT_LABEL[e.category]}</td>
                    <td style={{ fontFamily: 'var(--sans)' }}>{e.description}</td>
                    <td className="num">{money(e.amount)}</td>
                    <td><span className="nami-seal" title="lançada nas finanças (Nami) no ato do registro">→ Nami</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
