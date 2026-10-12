// Trechos do diário agrupados por dia (filtro por pessoa, tag ou referência; busca). Tocar abre o dia.

import { Icon } from '../../../design'
import { fmtDateLong, fmtRelative } from '../../../design/core/format'
import { useViolet } from '../context'
import { kindMeta } from '../lib/kinds'
import type { DayBullets } from '../types'
import { RichText } from './RichText'

export function DayBulletsList({ days }: { days: DayBullets[] }) {
  const v = useViolet()
  return (
    <div className="vl-daylist">
      {days.map((d) => (
        <section key={d.date} className="vl-daylist-day">
          <button type="button" className="vl-daylist-date" onClick={() => v.goto({ view: 'write', date: d.date })}>
            <b>{fmtDateLong(d.date)}</b><span className="vl-muted ds-mono">{fmtRelative(d.date, v.today)}</span><Icon name="right" size={14} />
          </button>
          <ul>
            {d.bullets.map((b) => (
              <li key={b.id} data-kind={b.kind}>
                <Icon name={b.favorite ? 'heart' : kindMeta(b.kind ?? 'bullet').icon} size={13} />
                <span><RichText text={b.content} /></span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
