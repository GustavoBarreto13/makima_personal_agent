// Pequenos blocos do Início: cartão de número e linha de pessoa com ação.

import type { ReactNode } from 'react'
import { Icon, type IconName } from '../../../design'

export function StatTile({ icon, label, value, unit, foot }: { icon: IconName; label: string; value: ReactNode; unit?: string; foot?: ReactNode }) {
  return (
    <div className="ds-card km-stat">
      <div className="km-stat-l"><Icon name={icon} size={13} /> {label}</div>
      <div className="km-stat-v">{value}{unit && <small>{unit}</small>}</div>
      {foot && <div className="km-stat-f">{foot}</div>}
    </div>
  )
}
