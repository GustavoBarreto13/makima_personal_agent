// Grade do mês: 6 semanas × 7 colunas. Cada dia mostra até 4 pílulas e “+N mais”. Clicar no dia abre a visão do dia;
// clicar numa pílula abre o evento; arrastar a pílula de uma TAREFA para outro dia remonta o vencimento (a hora fica).

import { Fragment, type CSSProperties } from 'react'
import { Icon } from '../../../design'
import { MONTHS_SHORT, parseISODate, WEEKDAYS_SHORT } from '../../../design/core/format'
import { resolveColor } from '../lib/calendar'
import type { CalEvent, Calendar } from '../types'

const MAX = 4
const hhmm = (t: string | null) => (t ? (t.includes('T') ? t.split('T')[1] : t).slice(0, 5) : '')

interface Props {
  days: string[]
  refDate: string
  today: string
  events: CalEvent[]
  cals: Calendar[]
  onDay: (iso: string) => void
  onOpen: (ev: CalEvent, pos: { x: number; y: number }) => void
  onMenu: (ev: CalEvent, pos: { x: number; y: number }) => void
  /** Uma tarefa foi solta noutro dia (arrastada de uma pílula ou da bandeja). */
  onDropTask: (taskId: number, day: string) => void
}

export function MonthGrid({ days, refDate, today, events, cals, onDay, onOpen, onMenu, onDropTask }: Props) {
  const month = parseISODate(refDate).getMonth()
  const byDay: Record<string, CalEvent[]> = {}
  for (const ev of events) if (ev.day) (byDay[ev.day] ??= []).push(ev)
  const weeks = Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7))

  return (
    <div className="kn-cmo" role="grid" aria-label="Mês">
      <div className="kn-cmo-dow" role="row">{WEEKDAYS_SHORT.map((d) => <div key={d} role="columnheader" className="ds-mono">{d}</div>)}</div>
      <div className="kn-cmo-weeks">
        {weeks.map((week, w) => (
          <div key={w} className="kn-cmo-week" role="row">
            {week.map((iso) => {
              const d = parseISODate(iso)
              const list = byDay[iso] ?? []
              const extra = list.length - MAX
              return (
                <div
                  key={iso}
                  role="gridcell"
                  tabIndex={0}
                  className={`kn-cmo-cell${d.getMonth() !== month ? ' kn-dim' : ''}${iso === today ? ' kn-today' : ''}`}
                  aria-label={`${d.getDate()} de ${MONTHS_SHORT[d.getMonth()]}${list.length ? `, ${list.length} item(ns)` : ''}`}
                  onClick={() => onDay(iso)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onDay(iso) }}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes('text/task-id')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
                  onDrop={(e) => { e.preventDefault(); const id = Number(e.dataTransfer.getData('text/task-id')); if (id) onDropTask(id, iso) }}
                >
                  <div className="kn-cmo-num ds-num">{d.getDate()}{d.getDate() === 1 && <span className="ds-mono"> {MONTHS_SHORT[d.getMonth()]}</span>}</div>
                  {list.slice(0, MAX).map((ev, i) => (
                    <Fragment key={`${ev.id}-${i}`}>
                      <button
                        type="button"
                        className={`kn-cmo-pill${ev.allDay || !ev.start ? ' kn-filled' : ''}${ev.done ? ' kn-cdone' : ''}`}
                        style={{ '--kn-cc': resolveColor(ev, cals) } as CSSProperties}
                        title={ev.title}
                        draggable={ev.kind === 'task' && !!ev.taskId}
                        onDragStart={(e) => { if (ev.taskId) { e.dataTransfer.setData('text/task-id', String(ev.taskId)); e.dataTransfer.effectAllowed = 'move' } }}
                        onClick={(e) => { e.stopPropagation(); onOpen(ev, { x: e.clientX, y: e.clientY }) }}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onMenu(ev, { x: e.clientX, y: e.clientY }) }}
                      >
                        {!(ev.allDay || !ev.start) && <><i className="kn-cp-dot" /><span className="ds-mono kn-cp-t">{hhmm(ev.start)}</span></>}
                        {ev.recurring && <Icon name="recurring" size={10} />}
                        <span className="kn-cp-title">{ev.title}</span>
                      </button>
                    </Fragment>
                  ))}
                  {extra > 0 && <div className="kn-cmo-more ds-mono">+{extra} mais</div>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
