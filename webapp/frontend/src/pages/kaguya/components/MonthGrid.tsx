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
    <div className="cmo-grid" role="grid" aria-label="Mês">
      <div className="cmo-dow-row" role="row">{WEEKDAYS_SHORT.map((d) => <div key={d} role="columnheader" className="cmo-dow">{d}</div>)}</div>
      <div className="cmo-weeks" style={{ gridTemplateRows: 'repeat(6, minmax(92px, 1fr))' }}>
        {weeks.map((week, w) => (
          <div key={w} className="cmo-week" role="row">
            {week.map((iso) => {
              const d = parseISODate(iso)
              const list = byDay[iso] ?? []
              const extra = list.length - MAX
              return (
                <div
                  key={iso}
                  role="gridcell"
                  tabIndex={0}
                  className={`cmo-cell${d.getMonth() !== month ? ' dim' : ''}${iso === today ? ' today' : ''}`}
                  aria-label={`${d.getDate()} de ${MONTHS_SHORT[d.getMonth()]}${list.length ? `, ${list.length} item(ns)` : ''}`}
                  onClick={() => onDay(iso)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onDay(iso) }}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes('text/task-id')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
                  onDrop={(e) => { e.preventDefault(); const id = Number(e.dataTransfer.getData('text/task-id')); if (id) onDropTask(id, iso) }}
                >
                  <div className="cmo-numrow"><span className="cmo-num">{d.getDate()}{d.getDate() === 1 && <span className="cmo-month-abbr"> {MONTHS_SHORT[d.getMonth()]}</span>}</span></div>
                  {list.slice(0, MAX).map((ev, i) => (
                    <Fragment key={`${ev.id}-${i}`}>
                      <div
                        className={`cmo-pill${ev.allDay || !ev.start ? ' filled' : ''}${ev.done ? ' done' : ''}`}
                        style={{ '--cc': resolveColor(ev, cals) } as CSSProperties}
                        role="button"
                        tabIndex={0}
                        title={ev.title}
                        draggable={ev.kind === 'task' && !!ev.taskId}
                        onDragStart={(e) => { if (ev.taskId) { e.dataTransfer.setData('text/task-id', String(ev.taskId)); e.dataTransfer.effectAllowed = 'move' } }}
                        onClick={(e) => { e.stopPropagation(); onOpen(ev, { x: e.clientX, y: e.clientY }) }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); onOpen(ev, { x: r.left, y: r.bottom }) } }}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onMenu(ev, { x: e.clientX, y: e.clientY }) }}
                      >
                        {!(ev.allDay || !ev.start) && <><span className="cp-dot" /><span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', flexShrink: 0 }}>{hhmm(ev.start)}</span></>}
                        {ev.recurring && <Icon name="recurring" size={10} />}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</span>
                      </div>
                    </Fragment>
                  ))}
                  {extra > 0 && <div className="cmo-more">+{extra} mais</div>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
