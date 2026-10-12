import { describe, expect, it } from 'vitest'
import { applyKanbanFilters, KANBAN_DEFAULTS } from './kanbanFilter'
import { midPosition } from './dnd'
import type { Task } from '../types'

const t = (id: number, over: Partial<Task> = {}) => ({ id, position: id * 1000, priority: 0, due_date: null, ...over }) as Task

describe('applyKanbanFilters', () => {
  const cards = [t(1, { priority: 1, due_date: '2026-07-10' }), t(2, { priority: 3 }), t(3, { priority: 2, due_date: '2026-07-01' })]
  it('manual ordena por posição e não muda o array original', () => {
    const shuffled = [cards[2], cards[0], cards[1]]
    expect(applyKanbanFilters(shuffled, KANBAN_DEFAULTS).map((c) => c.id)).toEqual([1, 2, 3])
    expect(shuffled.map((c) => c.id)).toEqual([3, 1, 2])
  })
  it('prioridade mínima filtra', () => {
    expect(applyKanbanFilters(cards, { prio: 2, sort: 'manual' }).map((c) => c.id)).toEqual([2, 3])
  })
  it('vencimento põe sem data no fim; prioridade vai da maior para a menor', () => {
    expect(applyKanbanFilters(cards, { prio: 0, sort: 'due' }).map((c) => c.id)).toEqual([3, 1, 2])
    expect(applyKanbanFilters(cards, { prio: 0, sort: 'prio' }).map((c) => c.id)).toEqual([2, 3, 1])
  })
})

describe('midPosition', () => {
  it('cobre coluna vazia, início, fim e meio', () => {
    expect(midPosition(null, null)).toBe(1000)
    expect(midPosition(null, t(1, { position: 1000 }))).toBe(500)
    expect(midPosition(t(1, { position: 1000 }), null)).toBe(2000)
    expect(midPosition(t(1, { position: 1000 }), t(2, { position: 2000 }))).toBe(1500)
  })
})
