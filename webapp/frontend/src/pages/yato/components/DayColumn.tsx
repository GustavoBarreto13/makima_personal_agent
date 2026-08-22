/**
 * DayColumn.tsx — Yato · Viagens (fatia 066)
 *
 * Uma coluna do board de dias do roteiro: cabeçalho (dia da semana + data +
 * custo somado) e três faixas fixas manhã/tarde/noite separadas por tracejado.
 */

import type { ItineraryItem, Period } from '../types'
import { parseLocalDate, fmtBR, DOW, money } from '../dateUtils'
import { ItineraryItemRow } from './ItineraryItem'

const PERIODS: [Period, string][] = [['manha', 'manhã'], ['tarde', 'tarde'], ['noite', 'noite']]

interface DayColumnProps {
  date: string
  items: ItineraryItem[]
  onAdd: (date: string, period: Period) => void
  onItemClick?: (item: ItineraryItem) => void
  onDeleteItem?: (itemId: string) => void
}

export function DayColumn({ date, items, onAdd, onItemClick, onDeleteItem }: DayColumnProps) {
  const d = parseLocalDate(date)
  const cost = items.reduce((a, i) => a + (i.cost_estimate || 0), 0)

  return (
    <div className="day-col">
      <div className="day-head">
        <span className="day-dow">{DOW[d.getDay()]}</span>
        <span className="day-date">{fmtBR(date)}</span>
        {cost > 0 && <span className="day-cost">{money(cost)}</span>}
      </div>
      {PERIODS.map(([k, label]) => {
        const its = items.filter(i => i.period === k).sort((a, b) => a.position - b.position)
        return (
          <div className="period" key={k}>
            <div className="period-k">{label}</div>
            {its.map((it, i) => (
              <div key={it.id} onClick={onItemClick ? () => onItemClick(it) : undefined} style={onItemClick ? { cursor: 'pointer' } : undefined}>
                <ItineraryItemRow item={it} seam={i < its.length - 1} onDelete={onDeleteItem ? () => onDeleteItem(it.id) : undefined} />
              </div>
            ))}
            <button className="period-add" style={its.length > 0 ? { marginTop: 6 } : undefined} onClick={() => onAdd(date, k)}>
              {its.length === 0 ? '+ adicionar' : '+'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
