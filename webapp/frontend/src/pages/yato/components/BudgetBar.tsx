/**
 * BudgetBar.tsx — Yato · Viagens (fatia 066)
 *
 * Uma linha por categoria: trilho + preenchimento (ok/warn/over) + valores em
 * mono. Quando estourado, o excedente aparece hachurado ultrapassando o trilho.
 */

import type { BudgetItem } from '../types'
import { money } from '../dateUtils'

const CAT_LABEL: Record<string, string> = {
  transporte_ida: 'Transporte ida', transporte_volta: 'Transporte volta', hospedagem: 'Hospedagem',
  alimentacao: 'Alimentação', mobilidade_local: 'Mobilidade local', passeios: 'Passeios', outros: 'Outros',
}

interface BudgetBarProps {
  item: BudgetItem
}

export function BudgetBar({ item }: BudgetBarProps) {
  const ratio = item.estimated ? item.actual / item.estimated : 0
  const over = ratio > 1
  const color = over ? 'var(--budget-over)' : ratio >= 0.8 ? 'var(--budget-warn)' : 'var(--budget-ok)'
  const w = Math.min(1, ratio) * 100

  return (
    <div className="bud-row">
      <span className="bud-k">{CAT_LABEL[item.category] || item.category}</span>
      <div className="bud-track">
        <div className="bud-fill" style={{ width: w + '%', background: color }} />
        {over && (
          <div className="bud-fill bud-over"
               style={{ left: '100%', width: Math.min(14, (ratio - 1) * 100) + '%', background: 'var(--budget-over)' }} />
        )}
      </div>
      <span className="bud-v" style={over ? { color: 'var(--budget-over)' } : undefined}>
        {money(item.actual)} / {money(item.estimated)}
      </span>
    </div>
  )
}

export { CAT_LABEL }
