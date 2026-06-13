// DayTimeline — régua de horas 07h–23h.
// Eventos do Calendar (read-only) e blocos de tarefas posicionados por top/height.
// Arrastar um PlanCard para um slot grava o time-block via POST /{id}/time-block.

import { useCallback } from 'react'
import type { Task } from '../types'
import { kaguyaApi } from '../kaguyaApi'

// Constantes do protótipo (design-guide.md §Constantes).
const DAY_START = 7   // 7h
const DAY_END = 23    // 23h
const HOURS = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i)
const TOTAL_MIN = (DAY_END - DAY_START) * 60

function minuteOfDay(iso: string): number {
  try {
    const d = new Date(iso)
    return d.getHours() * 60 + d.getMinutes()
  } catch { return 0 }
}

function topPct(startMin: number): number {
  const rel = startMin - DAY_START * 60
  return Math.max(0, (rel / TOTAL_MIN) * 100)
}

function heightPct(durMin: number): number {
  return Math.max(0.5, (durMin / TOTAL_MIN) * 100)
}

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

interface DayTimelineProps {
  plano: Task[]          // tarefas do plano de hoje (com start_at = time-block)
  onChanged: () => void  // recarrega o Meu Dia
  onOpen: (task: Task) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function DayTimeline({ plano, onChanged, onOpen, toast }: DayTimelineProps) {
  // Tarefas com bloco de tempo posicionadas na timeline.
  const blocked = plano.filter(t => t.start_at)

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>, hour: number) => {
    e.preventDefault()
    const taskId = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (!taskId) return
    const task = plano.find(t => t.id === taskId)
    if (!task) return

    // Constrói start_at no fuso local (formato ISO com offset).
    const today = new Date()
    today.setHours(hour, 0, 0, 0)
    const offset = -today.getTimezoneOffset()
    const sign = offset >= 0 ? '+' : '-'
    const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
    const mm = String(Math.abs(offset) % 60).padStart(2, '0')
    const startAt = today.toISOString().slice(0, 16) + `:00${sign}${hh}:${mm}`

    try {
      await kaguyaApi.setTimeBlock(task.id, {
        start_at: startAt,
        duration_min: task.duration_min || 30,
      })
      toast(`${task.title.slice(0, 30)} bloqueada às ${hour}h.`)
      onChanged()
    } catch {
      toast('Não foi possível bloquear o horário.', 'err')
    }
  }, [plano, onChanged, toast])

  const allowDrop = (e: React.DragEvent) => { e.preventDefault(); e.currentTarget.classList.add('drop-ok') }
  const dragLeave = (e: React.DragEvent) => { e.currentTarget.classList.remove('drop-ok') }
  const dropEnd = (e: React.DragEvent<HTMLDivElement>, hour: number) => {
    e.currentTarget.classList.remove('drop-ok')
    handleDrop(e, hour)
  }

  return (
    <div className="kg-timeline">
      <div className="kg-timeline-title">Timeline do dia</div>
      <div className="kg-tl-body" style={{ height: `${HOURS.length * 44}px` }}>
        {/* Horas (dropzones) */}
        {HOURS.map(h => (
          <div
            key={h}
            className="kg-tl-hour"
            style={{ top: `${((h - DAY_START) / (DAY_END - DAY_START)) * 100}%`, position: 'absolute', width: '100%', height: `${100 / HOURS.length}%` }}
            onDragOver={allowDrop}
            onDragLeave={dragLeave}
            onDrop={e => dropEnd(e, h)}
          >
            <span className="kg-tl-hour-label">{String(h).padStart(2, '0')}h</span>
          </div>
        ))}

        {/* Blocos de tarefas com time-block */}
        {blocked.map(task => {
          if (!task.start_at) return null
          const startMin = minuteOfDay(task.start_at)
          const endMin = task.end_at ? minuteOfDay(task.end_at) : startMin + (task.duration_min || 30)
          const durMin = endMin - startMin
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
