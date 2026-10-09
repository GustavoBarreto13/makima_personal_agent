// @vitest-environment jsdom
// Linha do dia: a classe do modificador não pode colidir com o layout do shell (`kn-split` esticava cada bloco até o
// fim), blocos curtos viram uma linha só e a faixa ocupa a largura toda quando só há um tipo de item.

import { DndContext } from '@dnd-kit/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { DayTimeline } from './DayTimeline'
import type { Task, TimelineEvent } from '../types'

const task = (id: number, start: string, end: string): Task => ({
  id, project_id: 1, column_id: null, parent_id: null, title: `Tarefa ${id}`, description: null, type: 'task', priority: 0, due_date: '2026-06-01', due_time: null, position: id,
  completed_at: null, created_at: '2026-06-01T10:00:00-03:00', my_day_date: '2026-06-01', start_at: start, end_at: end, duration_min: null, tags: [], subtasks: [],
} as unknown as Task)
const ev = (id: string, start: string, end: string): TimelineEvent => ({ id, title: `Evento ${id}`, start, end, all_day: false, color: null, calendar_name: 'Agenda', location: null } as unknown as TimelineEvent)

const draw = (plano: Task[], eventos: TimelineEvent[]) => render(
  <DndContext><DayTimeline today="2026-06-01" plano={plano} eventos={eventos} sources={[]} onToggleCalendar={vi.fn()} onOpen={vi.fn()} onResize={vi.fn()} onClearBlock={vi.fn()} /></DndContext>,
)
afterEach(cleanup)

describe('Linha do dia', () => {
  it('nunca usa a classe do layout do shell nos blocos', () => {
    const { container } = draw([task(1, '2026-06-01T10:00:00-03:00', '2026-06-01T11:00:00-03:00')], [ev('a', '09:00', '10:00')])
    expect(container.querySelector('.kn-split')).toBeNull()
    expect(container.querySelector('.kn-tl-task.kn-tl-half')).toBeTruthy()
    expect(container.querySelector('.kn-tl-event.kn-tl-half')).toBeTruthy()
  })

  it('só eventos: o bloco ocupa a largura toda; só tarefas, idem', () => {
    const a = draw([], [ev('a', '09:00', '10:00')])
    expect(a.container.querySelector('.kn-tl-event.kn-tl-half')).toBeNull()
    cleanup()
    const b = draw([task(1, '2026-06-01T10:00:00-03:00', '2026-06-01T11:00:00-03:00')], [])
    expect(b.container.querySelector('.kn-tl-task.kn-tl-half')).toBeNull()
  })

  it('bloco de 30 minutos vira uma linha só e o título completo fica no tooltip', () => {
    const { container } = draw([], [ev('a', '09:00', '09:30')])
    const slot = container.querySelector('.kn-tl-event')!
    expect(slot.classList.contains('kn-tl-tiny')).toBe(true)
    expect(slot.getAttribute('title')).toContain('Evento a')
    expect(slot.getAttribute('title')).toContain('09:00')
  })

  it('bloco de 1 hora mostra o intervalo todo', () => {
    const { container } = draw([], [ev('a', '09:00', '10:00')])
    const slot = container.querySelector('.kn-tl-event')!
    expect(slot.classList.contains('kn-tl-tiny')).toBe(false)
    expect(slot.textContent).toContain('09:00–10:00')
  })
})
