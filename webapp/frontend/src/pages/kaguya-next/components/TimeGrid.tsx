// Grade de 24 horas das visões Dia e Semana. Cabeçalho fixo (dias + faixa “dia inteiro”), colunas por dia com a linha de
// “agora”, a faixa de expediente (com o almoço) e os eventos em faixas quando se sobrepõem. Mover e redimensionar por
// ponteiro (de 15 em 15 min), criar arrastando uma área vazia e soltar uma tarefa da bandeja num horário.
//
// A grade NÃO fala com a rede: devolve o que o usuário fez (`onMove`, `onResize`, `onCreate`, `onDropTask`) e quem a usa
// grava. Os ponteiros usam listeners nativos na `window`, criados por gesto e removidos no fim — o React delega eventos na
// raiz e o pointer capture em filhos não entrega o movimento em tempo real.

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Icon } from '../../../design'
import { parseISODate, WEEKDAYS_SHORT } from '../../../design/core/format'
import { assignLanes, isEditable, localISO, minToLabel, resolveColor, snapTo15, type WorkBand } from '../lib/calendar'
import type { CalEvent, Calendar } from '../types'

export interface Placement { day: string; startMin: number; endMin: number }

interface Props {
  days: string[]
  today: string
  events: CalEvent[]
  cals: Calendar[]
  bands: Record<string, WorkBand | null>
  onOpen: (ev: CalEvent, pos: { x: number; y: number }) => void
  onMenu: (ev: CalEvent, pos: { x: number; y: number }) => void
  onMove: (ev: CalEvent, to: Placement, from: Placement) => void
  onResize: (ev: CalEvent, to: Placement) => void
  onCreate: (day: string, startISO: string, endISO: string) => void
  onDropTask: (taskId: number, day: string, startISO: string) => void
}

type Mode = 'move' | 'resize' | 'create'
interface Drag { mode: Mode; ev?: CalEvent; startX: number; startY: number; originMin: number; originEnd: number; originDay: string; colEl: HTMLElement; offsetMin: number; dragging: boolean }

const pct = (min: number) => `${(min / 1440) * 100}%`

export function TimeGrid({ days, today, events, cals, bands, onOpen, onMenu, onMove, onResize, onCreate, onDropTask }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const justDragged = useRef(false) // impede o click sintético que o navegador dispara logo após o arraste
  const [ghost, setGhost] = useState<(Placement & { left: string; width: string }) | null>(null)
  const ncols = days.length
  const nowMin = (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() })()

  // Abre mostrando ~07:00.
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight * (7 / 24) }, [])

  const colFromX = useCallback((x: number) => {
    const cols = gridRef.current?.querySelectorAll<HTMLElement>('.kn-cg-col')
    if (!cols) return null
    for (let i = 0; i < cols.length; i++) {
      const r = cols[i].getBoundingClientRect()
      if (x >= r.left && x <= r.right) return days[i]
    }
    return null
  }, [days])

  const yToMin = useCallback((y: number, col: HTMLElement) => {
    const r = col.getBoundingClientRect()
    const scale = r.height / (col.offsetHeight || r.height || 1)
    return (((y - r.top) / scale) / (col.offsetHeight || r.height || 1)) * 1440
  }, [])

  const ghostAt = (day: string, startMin: number, endMin: number) => {
    const i = Math.max(0, days.indexOf(day))
    setGhost({ day, startMin, endMin, left: `calc(var(--kn-gutter) + ${(i / ncols) * 100}%)`, width: `${100 / ncols}%` })
  }

  const startEventDrag = (e: ReactPointerEvent<HTMLElement>, ev: CalEvent, mode: 'move' | 'resize', startMin: number, endMin: number, day: string) => {
    if (!isEditable(ev, cals)) return
    e.preventDefault()
    e.stopPropagation()
    const colEl = (e.currentTarget as HTMLElement).closest('.kn-cg-col') as HTMLElement | null
    if (!colEl) return
    const d: Drag = { mode, ev, startX: e.clientX, startY: e.clientY, originMin: startMin, originEnd: endMin, originDay: day, colEl, offsetMin: mode === 'move' ? yToMin(e.clientY, colEl) - startMin : 0, dragging: false }
    drag.current = d
    const place = (clientX: number, clientY: number): Placement => {
      const raw = yToMin(clientY, d.colEl)
      const day2 = colFromX(clientX) ?? d.originDay // fora da grade, vale o dia de origem
      if (d.mode === 'move') { const s = snapTo15(raw - d.offsetMin); return { day: day2, startMin: s, endMin: s + (d.originEnd - d.originMin) } }
      return { day: d.originDay, startMin: d.originMin, endMin: Math.max(d.originMin + 15, snapTo15(raw)) }
    }
    const onMoveEv = (me: PointerEvent) => {
      if (!d.dragging && Math.abs(me.clientY - d.startY) + Math.abs(me.clientX - d.startX) < 4) return
      d.dragging = true
      const p = place(me.clientX, me.clientY)
      ghostAt(p.day, p.startMin, p.endMin)
    }
    const onUp = (ue: PointerEvent) => {
      window.removeEventListener('pointermove', onMoveEv)
      window.removeEventListener('pointerup', onUp)
      drag.current = null
      setGhost(null)
      if (!d.dragging || !d.ev) return
      justDragged.current = true
      setTimeout(() => { justDragged.current = false }, 0)
      const p = place(ue.clientX, ue.clientY)
      if (d.mode === 'move') onMove(d.ev, p, { day: d.originDay, startMin: d.originMin, endMin: d.originEnd })
      else onResize(d.ev, p)
    }
    window.addEventListener('pointermove', onMoveEv)
    window.addEventListener('pointerup', onUp)
  }

  const colDown = (e: ReactPointerEvent<HTMLDivElement>, day: string) => {
    if ((e.target as HTMLElement).closest('.kn-cg-ev')) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = { mode: 'create', startX: e.clientX, startY: e.clientY, originMin: snapTo15(yToMin(e.clientY, e.currentTarget)), originEnd: 0, originDay: day, colEl: e.currentTarget, offsetMin: 0, dragging: false }
  }
  const colMove = (e: ReactPointerEvent<HTMLDivElement>, day: string) => {
    const d = drag.current
    if (!d || d.mode !== 'create') return
    if (!d.dragging && Math.abs(e.clientY - d.startY) < 4) return
    d.dragging = true
    ghostAt(day, d.originMin, Math.max(d.originMin + 30, snapTo15(yToMin(e.clientY, d.colEl))))
  }
  const colUp = (e: ReactPointerEvent<HTMLDivElement>, day: string) => {
    const d = drag.current
    if (!d || d.mode !== 'create') return
    drag.current = null
    setGhost(null)
    if (!d.dragging) return
    const end = Math.max(d.originMin + 30, snapTo15(yToMin(e.clientY, d.colEl)))
    onCreate(day, localISO(day, d.originMin), localISO(day, end))
  }

  const byDay: Record<string, CalEvent[]> = {}
  for (const ev of events) if (ev.day) (byDay[ev.day] ??= []).push(ev)

  const cols = { gridTemplateColumns: `var(--kn-gutter) repeat(${ncols}, 1fr)` }
  return (
    <div className="kn-cscroll" ref={scrollRef}>
      <div className="kn-csticky">
        <div className="kn-cdayhead" style={cols}>
          <div className="kn-cdh-corner ds-mono">BRT</div>
          {days.map((iso) => (
            <div key={iso} className={`kn-cdh${iso === today ? ' kn-today' : ''}`}>
              <span className="ds-mono">{WEEKDAYS_SHORT[parseISODate(iso).getDay()]}</span>
              <b className="ds-num">{parseISODate(iso).getDate()}</b>
            </div>
          ))}
        </div>
        <div className="kn-callday" style={cols}>
          <div className="kn-cdh-corner ds-mono">dia todo</div>
          {days.map((iso) => (
            <div key={iso} className="kn-cad-col">
              {(byDay[iso] ?? []).filter((e) => e.allDay || !e.start).map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  className={`kn-cpill${ev.done ? ' kn-cdone' : ''}`}
                  style={{ '--kn-cc': resolveColor(ev, cals) } as CSSProperties}
                  title={ev.title}
                  onClick={(e) => onOpen(ev, { x: e.clientX, y: e.clientY })}
                  onContextMenu={(e) => { e.preventDefault(); onMenu(ev, { x: e.clientX, y: e.clientY }) }}
                >
                  {ev.recurring && <Icon name="recurring" size={11} />}{ev.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div ref={gridRef} className="kn-cgrid" style={cols}>
        <div className="kn-cg-gutter">
          {Array.from({ length: 24 }, (_, h) => <div key={h} className="kn-cg-hour ds-mono">{h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}</div>)}
        </div>
        {days.map((iso, colIdx) => {
          const band = bands[iso]
          const timed = assignLanes(byDay[iso] ?? [])
          return (
            <div
              key={iso}
              className={`kn-cg-col${iso === today ? ' kn-today' : ''}`}
              style={{ gridColumn: colIdx + 2 }}
              data-day={iso}
              onPointerDown={(e) => colDown(e, iso)}
              onPointerMove={(e) => colMove(e, iso)}
              onPointerUp={(e) => colUp(e, iso)}
              onDragOver={(e) => { if (e.dataTransfer.types.includes('text/task-id')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
              onDrop={(e) => {
                e.preventDefault()
                const id = Number(e.dataTransfer.getData('text/task-id'))
                if (id) onDropTask(id, iso, localISO(iso, snapTo15(yToMin(e.clientY, e.currentTarget))))
              }}
            >
              {band && <div className="kn-cg-work" style={{ top: pct(band.start), height: pct(band.end - band.start) }} aria-hidden="true" />}
              {band?.lunch && <div className="kn-cg-lunch" style={{ top: pct(band.lunch[0]), height: pct(band.lunch[1] - band.lunch[0]) }} aria-hidden="true" />}
              {iso === today && <div className="kn-cg-now" style={{ top: pct(nowMin) }} aria-label={`Agora: ${minToLabel(nowMin)}`} />}
              {timed.map(({ ev, lane, totalLanes, startMin, endMin }) => {
                const editable = isEditable(ev, cals)
                return (
                  <div
                    key={ev.id}
                    className={`kn-cg-ev${ev.kind === 'task' ? ' kn-ctask' : ''}${endMin - startMin <= 30 ? ' kn-tiny' : ''}${ev.done ? ' kn-cdone' : ''}`}
                    style={{
                      '--kn-cc': resolveColor(ev, cals), top: pct(startMin), height: `max(${pct(endMin - startMin)}, 18px)`,
                      left: `${(lane / totalLanes) * 100}%`, width: `calc(${100 / totalLanes}% - 2px)`, cursor: editable ? 'grab' : 'default',
                    } as CSSProperties}
                    role="button"
                    tabIndex={0}
                    aria-label={`${ev.title}, ${minToLabel(startMin)} às ${minToLabel(endMin)}`}
                    title={`${minToLabel(startMin)}–${minToLabel(endMin)} · ${ev.title}`}
                    onClick={(e) => { if (!drag.current?.dragging && !justDragged.current) onOpen(ev, { x: e.clientX, y: e.clientY }) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { const r = e.currentTarget.getBoundingClientRect(); onOpen(ev, { x: r.left, y: r.bottom }) } }}
                    onContextMenu={(e) => { e.preventDefault(); onMenu(ev, { x: e.clientX, y: e.clientY }) }}
                    onPointerDown={editable ? (e) => startEventDrag(e, ev, 'move', startMin, endMin, iso) : undefined}
                  >
                    <span className="kn-ce-title">{ev.recurring && <Icon name="recurring" size={11} />}{ev.title}</span>
                    <span className="kn-ce-time ds-mono">{minToLabel(startMin)}</span>
                    {editable && <div className="kn-cg-resize" aria-hidden="true" onPointerDown={(e) => { e.stopPropagation(); startEventDrag(e, ev, 'resize', startMin, endMin, iso) }} />}
                  </div>
                )
              })}
            </div>
          )
        })}
        {ghost && (
          <div className="kn-cg-ghost" style={{ left: ghost.left, width: ghost.width, top: pct(ghost.startMin), height: pct(ghost.endMin - ghost.startMin) }}>
            <span className="ds-mono">{minToLabel(ghost.startMin)} – {minToLabel(ghost.endMin)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

