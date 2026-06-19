// DayTimeline — régua de horas 07h–23h.
// Eventos do Calendar (read-only) e blocos de tarefas posicionados por top/height.
// Arrastar um PlanCard para um slot grava o time-block via POST /{id}/time-block.
//
// DnD via @dnd-kit (migrado do HTML5 nativo):
//   • HourSlot: cada hora vira um droppable (@dnd-kit/core useDroppable).
//   • A lógica de "o que acontece ao soltar" (construir start_at + chamar a API)
//     ficou no TodayScreen (onDragEnd), que é quem tem o DndContext.
//   • isOver (via useDroppable) aciona a classe .drop-ok sem manipular o DOM diretamente.
//   • Sem handlers HTML5 nativo (onDragOver/onDragLeave/onDrop removidos).

import { useDroppable } from '@dnd-kit/core'
import type { Task } from '../types'

// ── Constantes do protótipo (design-guide.md §Constantes) ────────────────────
const DAY_START = 7   // 7h
const DAY_END = 23    // 23h
const HOURS = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i)
const TOTAL_MIN = (DAY_END - DAY_START) * 60

// Converte um ISO datetime para o minuto do dia (ex.: "2024-01-01T14:30:00" → 870).
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
  // useDroppable: isOver = true quando um PlanCard está passando sobre esta hora.
  const { setNodeRef, isOver } = useDroppable({ id: `hour:${h}` })

  return (
    <div
      ref={setNodeRef}
      // drop-ok: classe CSS de hover que já existia (agora via isOver, não classList manual).
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
  plano: Task[]          // tarefas do plano de hoje (com start_at = time-block)
  onChanged: () => void  // recarrega o Meu Dia (passado ao PlanCard se necessário)
  onOpen: (task: Task) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function DayTimeline({ plano, onOpen }: DayTimelineProps) {
  // Tarefas com bloco de tempo posicionadas na timeline.
  const blocked = plano.filter(t => t.start_at)

  return (
    <div className="kg-timeline">
      <div className="kg-timeline-title">Timeline do dia</div>
      <div className="kg-tl-body" style={{ height: `${HOURS.length * 44}px` }}>

        {/* Faixas de hora — cada uma é um HourSlot droppable */}
        {HOURS.map(h => (
          <HourSlot key={h} h={h} totalHours={HOURS.length} />
        ))}

        {/* Blocos de tarefas com time-block: posicionados absolutamente na régua */}
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
                position: 'absolute', left: 36, right: 4,
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
