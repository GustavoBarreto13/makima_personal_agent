// A linha do dia do Meu Dia (07h–23h): à esquerda os eventos do Google (só leitura, com o local abrindo no mapa), à direita os
// blocos de tempo das tarefas do plano. Soltar uma tarefa do plano numa hora reserva o horário (a estimativa vira a duração);
// a alça de baixo do bloco ajusta o fim e o “x” libera o horário. Os calendários que aparecem aqui se escolhem no botão
// “Calendários”. O arraste é do DndContext da tela (as horas são alvos de soltura `hour:H`).

import { useDroppable } from '@dnd-kit/core'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Icon, IconButton } from '../../../design'
import { localISO, minToLabel, snapTo15, timeToMin } from '../lib/calendar'
import { mapsLinkFor } from '../lib/maps'
import type { Calendar, Task, TimelineEvent } from '../types'

const START = 7
const END = 23
const HOURS = Array.from({ length: END - START }, (_, i) => START + i)
const TOTAL = (END - START) * 60

const top = (min: number) => `${Math.max(0, ((min - START * 60) / TOTAL) * 100)}%`
const height = (dur: number) => `${Math.max(0.5, (dur / TOTAL) * 100)}%`

function Hour({ h }: { h: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `hour:${h}` })
  return (
    <div ref={setNodeRef} className={`kn-tl-hour${isOver ? ' kn-over' : ''}`} style={{ top: `${((h - START) / (END - START)) * 100}%`, height: `${100 / HOURS.length}%` }}>
      <span className="ds-mono">{String(h).padStart(2, '0')}h</span>
    </div>
  )
}

interface Props {
  today: string
  plano: Task[]
  eventos: TimelineEvent[]
  sources: Calendar[]
  onToggleCalendar: (id: string, visible: boolean) => void
  onOpen: (id: number) => void
  onResize: (task: Task, endISO: string) => void
  onClearBlock: (task: Task) => void
}

export function DayTimeline({ today, plano, eventos, sources, onToggleCalendar, onOpen, onResize, onClearBlock }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [pop, setPop] = useState(false)
  const [resize, setResize] = useState<{ id: number; start: number; end: number } | null>(null)
  const blocked = plano.filter((t) => t.start_at)
  const timed = eventos.filter((e) => !e.all_day && e.start)
  const allDay = eventos.filter((e) => e.all_day)

  useEffect(() => {
    if (!pop) return
    const onDown = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node)) setPop(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPop(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [pop])

  const yToMin = useCallback((clientY: number) => {
    const el = bodyRef.current
    if (!el) return START * 60
    const r = el.getBoundingClientRect()
    return snapTo15(START * 60 + Math.max(0, Math.min(1, (clientY - r.top) / (r.height || 1))) * TOTAL)
  }, [])

  const startResize = (e: ReactPointerEvent<HTMLDivElement>, task: Task, start: number, end: number) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setResize({ id: task.id, start, end })
  }
  const moveResize = (e: ReactPointerEvent<HTMLDivElement>, start: number) => {
    if (resize) setResize({ ...resize, end: Math.max(start + 15, yToMin(e.clientY)) })
  }
  const endResize = (e: ReactPointerEvent<HTMLDivElement>, task: Task, start: number) => {
    if (!resize) return
    const end = Math.max(start + 15, yToMin(e.clientY))
    setResize(null)
    if (task.start_at) onResize(task, localISO(today, end))
  }

  return (
    <section className="kn-tl" aria-label="Linha do dia">
      <header className="kn-tl-head">
        <h3 className="kn-h3">Linha do dia</h3>
        {sources.length > 0 && (
          <div className="kn-tl-cals" ref={popRef}>
            <button type="button" className="ds-btn ds-sm" aria-expanded={pop} aria-haspopup="true" onClick={() => setPop((v) => !v)}>
              <span className="kn-tl-dots" aria-hidden="true">
                {sources.slice(0, 3).map((s) => <i key={s.id} style={{ '--kn-cc': s.visible !== false ? s.color || 'var(--ds-accent)' : 'var(--ds-line)' } as CSSProperties} />)}
              </span>
              <span className="ds-lbl">Calendários</span>
            </button>
            {pop && (
              <div className="kn-tl-pop" role="group" aria-label="Calendários visíveis">
                {sources.map((s) => (
                  <label key={s.id} className="kn-tl-calrow">
                    <input type="checkbox" checked={s.visible !== false} onChange={(e) => onToggleCalendar(s.id, e.target.checked)} />
                    <i style={{ '--kn-cc': s.color || 'var(--ds-accent)' } as CSSProperties} aria-hidden="true" />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      {allDay.length > 0 && (
        <div className="kn-tl-allday">
          {allDay.map((e) => <span key={e.id} className="kn-tl-chip" style={{ '--kn-cc': e.color || 'var(--ds-ink-4)' } as CSSProperties} title={`${e.calendar_name} — dia inteiro`}>{e.title}</span>)}
        </div>
      )}

      <div className="kn-tl-body" ref={bodyRef} style={{ height: `${HOURS.length * 44}px` }}>
        {HOURS.map((h) => <Hour key={h} h={h} />)}

        {timed.map((e) => {
          if (!e.start) return null
          const s = timeToMin(e.start)
          const dur = Math.max((e.end ? timeToMin(e.end) : s + 30) - s, 15)
          return (
            <div key={e.id} className="kn-tl-slot kn-tl-event" style={{ top: top(s), height: height(dur), '--kn-cc': e.color || 'var(--ds-ink-4)' } as CSSProperties} title={`${e.calendar_name}${e.title !== e.calendar_name ? ` — ${e.title}` : ''}`}>
              <b>{e.title}</b>
              <span className="ds-mono">{minToLabel(s)}{e.end ? `–${minToLabel(timeToMin(e.end))}` : ''}</span>
              {e.location && <a href={mapsLinkFor(e.location)} target="_blank" rel="noreferrer" title={e.location}>{e.location}</a>}
            </div>
          )
        })}

        {blocked.map((t) => {
          const s = timeToMin(t.start_at)
          const live = resize?.id === t.id ? resize.end : null
          const end = live ?? (t.end_at ? timeToMin(t.end_at) : s + (t.duration_min || 30))
          return (
            <div key={t.id} className={`kn-tl-slot kn-tl-task${timed.length > 0 ? ' kn-split' : ''}`} style={{ top: top(s), height: height(end - s) }} title={t.title}>
              <button type="button" className="kn-main" onClick={() => onOpen(t.id)}>
                <b>{t.title}</b>
                <span className="ds-mono">{minToLabel(s)}–{minToLabel(end)}</span>
              </button>
              <IconButton icon="close" size={12} label={`Liberar o horário de ${t.title}`} onClick={() => onClearBlock(t)} />
              <div
                className="kn-tl-resize"
                role="separator"
                aria-label={`Ajustar o fim de ${t.title}`}
                onPointerDown={(e) => startResize(e, t, s, end)}
                onPointerMove={(e) => moveResize(e, s)}
                onPointerUp={(e) => endResize(e, t, s)}
              />
            </div>
          )
        })}
        {blocked.length === 0 && timed.length === 0 && (
          <p className="ds-hint kn-tl-empty"><Icon name="drag" size={12} /> Arraste uma tarefa do plano até uma hora para reservar o horário.</p>
        )}
      </div>
    </section>
  )
}
