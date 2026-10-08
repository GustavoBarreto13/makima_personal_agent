// Cartão de número do Início: rótulo mono, valor grande, rodapé e (opcional) mini-gráfico.

import type { ReactNode } from 'react'
import { Icon, type IconName } from '../../../design'

export function StatCard({ icon, label, value, unit, foot, children }: {
  icon: IconName
  label: string
  value: ReactNode
  unit?: string
  foot?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="ds-card mr-stat">
      <div className="mr-stat-l"><Icon name={icon} size={13} /> {label}</div>
      <div className="mr-stat-v">{value}{unit && <small>{unit}</small>}</div>
      {children}
      {foot && <div className="mr-stat-f">{foot}</div>}
    </div>
  )
}

/** Barras de episódios por dia (mais altas = mais episódios). A altura é o dado, não layout. */
export function Spark({ data, label }: { data: number[]; label: string }) {
  const max = Math.max(...data, 1)
  return (
    <div className="mr-spark" role="img" aria-label={label}>
      {data.map((v, i) => <i key={i} className={v >= max * 0.7 && v > 0 ? 'mr-hot' : ''} style={{ height: `${Math.max(2, (v / max) * 24)}px` }} />)}
    </div>
  )
}

/** Variação percentual de uma semana para a outra ("↑ 40%" / "↓ 12%"), com ícone de tendência. */
export function Trend({ now, prev, unit = 'vs. semana anterior' }: { now: number; prev: number; unit?: string }) {
  // Sem semana anterior para comparar: qualquer episódio conta como alta de 100%.
  const delta = prev ? Math.round(((now - prev) / prev) * 100) : now > 0 ? 100 : 0
  return (
    <>
      <span className={delta >= 0 ? 'mr-up' : 'mr-down'}>
        <Icon name={delta >= 0 ? 'trend-up' : 'trend-down'} size={13} /> {Math.abs(delta)}%
      </span>{' '}{unit}
    </>
  )
}
