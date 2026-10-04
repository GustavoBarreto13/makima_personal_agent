// Cartão de número do Início: rótulo mono, valor grande em serifa, rodapé e (opcional) mini-gráfico.

import type { ReactNode } from 'react'
import { Icon } from '../../../design'
import type { IconName } from '../../../design'

export function StatCard({ icon, label, value, unit, foot, children }: {
  icon: IconName
  label: string
  value: ReactNode
  unit?: string
  foot?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="ds-card ax-stat">
      <div className="ax-stat-l"><Icon name={icon} size={13} /> {label}</div>
      <div className="ax-stat-v">{value}{unit && <small>{unit}</small>}</div>
      {children}
      {foot && <div className="ax-stat-f">{foot}</div>}
    </div>
  )
}

/** Barras das sessões dos últimos dias (mais altas = mais sessões). */
export function Spark({ data }: { data: number[] }) {
  const max = Math.max(...data, 1)
  return (
    <div className="ax-spark" role="img" aria-label={`Sessões nos últimos ${data.length} dias`}>
      {data.map((v, i) => <i key={i} className={v >= max * 0.7 && v > 0 ? 'ax-hot' : ''} style={{ height: `${Math.max(2, (v / max) * 24)}px` }} />)}
    </div>
  )
}
