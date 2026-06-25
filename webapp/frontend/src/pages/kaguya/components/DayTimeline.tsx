// DayTimeline — régua de horas 07h–23h.
// Renderiza dois tipos de bloco lado a lado, sem sobreposição:
//   • Eventos do Google Calendar (read-only) — lane esquerda
//   • Blocos de tarefas (draggable/droppable) — lane direita
//
// Acima da régua, uma faixa compacta (.kg-tl-allday) exibe os eventos de dia inteiro.
// Um popover de toggle permite ligar/desligar calendários Google individuais.
//
// DnD via @dnd-kit (migrado do HTML5 nativo):
//   • HourSlot: cada hora vira um droppable (@dnd-kit/core useDroppable).
//   • A lógica de "o que acontece ao soltar" (construir start_at + chamar a API)
//     ficou no TodayScreen (onDragEnd), que é quem tem o DndContext.
//   • isOver (via useDroppable) aciona a classe .drop-ok sem manipular o DOM diretamente.

import { useRef, useState, useEffect } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Task, TimelineEvent, Calendar } from '../types'

// ── Constantes do protótipo (design-guide.md §Constantes) ────────────────────
const DAY_START = 7   // 7h
const DAY_END = 23    // 23h
const HOURS = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i)
const TOTAL_MIN = (DAY_END - DAY_START) * 60

// Converte um ISO datetime para o minuto do dia (ex.: "2024-01-01T14:30:00-03:00" → 870).
function minuteOfDay(iso: string): number {
  try {
    const d = new Date(iso)
    return d.getHours() * 60 + d.getMinutes()
  } catch { return 0 }
}

// Converte o minuto do dia para % vertical na régua (posição `top`).
function topPct(startMin: number): number {
  const rel = startMin - DAY_START * 60
  return Math.max(0, (rel / TOTAL_MIN) * 100)
}

// Converte a duração em minutos para % de altura na régua.
function heightPct(durMin: number): number {
  return Math.max(0.5, (durMin / TOTAL_MIN) * 100)
}

// Formata um ISO datetime como "HH:MM" no fuso local.
function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

// ─── HourSlot ────────────────────────────────────────────────────────────────
// Componente interno: cada faixa de hora é uma zona de soltar (@dnd-kit).
// O id segue o prefixo "hour:<h>" para que o onDragEnd do TodayScreen
// saiba qual hora foi alvo do drop.
function HourSlot({ h, totalHours }: { h: number; totalHours: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `hour:${h}` })

  return (
    <div
      ref={setNodeRef}
      className={`kg-tl-hour${isOver ? ' drop-ok' : ''}`}
      style={{
        top: `${((h - DAY_START) / (DAY_END - DAY_START)) * 100}%`,
        position: 'absolute',
        width: '100%',
        height: `${100 / totalHours}%`,
      }}
    >
      <span className="kg-tl-hour-label">{String(h).padStart(2, '0')}h</span>
    </div>
  )
}

// ─── DayTimeline ─────────────────────────────────────────────────────────────

interface DayTimelineProps {
  plano: Task[]                     // tarefas do plano de hoje (com start_at = time-block)
  eventos: TimelineEvent[]          // eventos do Google Calendar do dia (já filtrados por visibilidade)
  sources: Calendar[]               // fontes gcal:* para o toggle (com .visible e .color)
  onToggleCalendar: (id: string, visible: boolean) => void  // persiste pref + reload
  onChanged: () => void             // recarrega o Meu Dia (passado ao PlanCard se necessário)
  onOpen: (task: Task) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function DayTimeline({ plano, eventos, sources, onToggleCalendar, onOpen }: DayTimelineProps) {
  // Tarefas com bloco de tempo posicionadas na timeline.
  const blocked = plano.filter(t => t.start_at)
  // Eventos timed (com hora) posicionados na timeline.
  const timedEvents = eventos.filter(e => !e.all_day && e.start)
  // Eventos de dia inteiro mostrados acima da régua.
  const allDayEvents = eventos.filter(e => e.all_day)

  // Popover de toggle de calendários
  const [showCalPop, setShowCalPop] = useState(false)
  const popRef = useRef<HTMLDivElement>(null)

  // Fecha o popover ao clicar fora ou pressionar Escape
  useEffect(() => {
    if (!showCalPop) return
    const handleMouseDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setShowCalPop(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCalPop(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showCalPop])

  return (
    <div className="kg-timeline">
      {/* Cabeçalho com título e toggle de calendários */}
      <div className="kg-tl-header">
        <div className="kg-timeline-title">Timeline do dia</div>
        {sources.length > 0 && (
          <div className="kg-tl-cal-toggle" ref={popRef}>
            <button
              className="kg-tl-cal-btn"
              onClick={() => setShowCalPop(v => !v)}
              title="Calendários visíveis"
            >
              <span className="kg-tl-cal-dots">
                {sources.slice(0, 3).map((s) => (
                  <span
                    key={s.id}
                    className="kg-tl-cal-dot"
                    style={{
                      background: s.visible !== false
                        ? (s.color || '#4285F4')
                        : 'var(--ink-5)',
                    }}
                  />
                ))}
              </span>
              Calendários
            </button>
            {showCalPop && (
              <div className="kg-tl-cal-pop">
                {sources.map((s) => (
                  <label key={s.id} className="kg-tl-cal-item">
                    <input
                      type="checkbox"
                      checked={s.visible !== false}
                      onChange={(e) => onToggleCalendar(s.id, e.target.checked)}
                    />
                    <span
                      className="kg-tl-cal-swatch"
                      style={{ background: s.color || '#4285F4' }}
                    />
                    <span className="kg-tl-cal-name">{s.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Faixa de eventos de dia inteiro (acima da régua) */}
      {allDayEvents.length > 0 && (
        <div className="kg-tl-allday">
          {allDayEvents.map((ev) => (
            <span
              key={ev.id}
              className="kg-tl-allday-chip"
              style={{ borderColor: ev.color || 'var(--ink-4)' }}
              title={`${ev.calendar_name} — dia inteiro`}
            >
              {ev.title}
            </span>
          ))}
        </div>
      )}

      {/* Régua de horas */}
      <div className="kg-tl-body" style={{ height: `${HOURS.length * 44}px` }}>

        {/* Faixas de hora — cada uma é um HourSlot droppable */}
        {HOURS.map(h => (
          <HourSlot key={h} h={h} totalHours={HOURS.length} />
        ))}

        {/* Lane esquerda: eventos do Google Calendar (read-only) */}
        {timedEvents.map(ev => {
          if (!ev.start) return null
          const startMin = minuteOfDay(ev.start)
          const endMin   = ev.end ? minuteOfDay(ev.end) : startMin + 30
          const durMin   = Math.max(endMin - startMin, 15)  // mínimo de 15 min para legibilidade
          const borderColor = ev.color || 'var(--ink-4)'
          return (
            <div
              key={ev.id}
              className="kg-tl-slot event"
              style={{
                top: `${topPct(startMin)}%`,
                height: `${heightPct(durMin)}%`,
                position: 'absolute',
                left: 36,
                right: '50%',
                marginRight: 2,
                borderLeftColor: borderColor,
              }}
              title={`${ev.calendar_name}${ev.title !== ev.calendar_name ? ` — ${ev.title}` : ''}`}
            >
              <div style={{ fontWeight: 500, fontSize: 11, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {ev.title}
              </div>
              <div className="kg-tl-slot-time">
                {fmtTime(ev.start)}{ev.end ? `–${fmtTime(ev.end)}` : ''}
              </div>
            </div>
          )
        })}

        {/* Lane direita: blocos de tarefas com time-block */}
        {blocked.map(task => {
          if (!task.start_at) return null
          const startMin = minuteOfDay(task.start_at)
          const endMin   = task.end_at ? minuteOfDay(task.end_at) : startMin + (task.duration_min || 30)
          const durMin   = endMin - startMin
          return (
            <div
              key={task.id}
              className="kg-tl-slot task"
              style={{
                top: `${topPct(startMin)}%`,
                height: `${heightPct(durMin)}%`,
                position: 'absolute',
                left: timedEvents.length > 0 ? '50%' : 36,
                right: 4,
                marginLeft: timedEvents.length > 0 ? 2 : 0,
              }}
              onClick={() => onOpen(task)}
              title={task.title}
            >
              <div style={{ fontWeight: 500, fontSize: 12, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {task.title}
              </div>
              <div className="kg-tl-slot-time">
                {fmtTime(task.start_at)}{task.end_at ? `–${fmtTime(task.end_at)}` : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
