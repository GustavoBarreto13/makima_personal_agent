import { describe, expect, it } from 'vitest'
import { buildDragPatch, getQuadrant, undoPatch } from './eisenhower'

const TODAY = '2026-06-10'
const t = (priority: number, due_date: string | null) => ({ priority, due_date })

describe('Eisenhower', () => {
  it('classifica por urgência (até 2 dias, inclui atrasadas) e importância (prioridade ≥ 2)', () => {
    expect(getQuadrant(t(3, '2026-06-11'), TODAY)).toBe('q1')
    expect(getQuadrant(t(2, '2026-06-20'), TODAY)).toBe('q2')
    expect(getQuadrant(t(0, '2026-06-01'), TODAY)).toBe('q3')
    expect(getQuadrant(t(1, null), TODAY)).toBe('q4')
    expect(getQuadrant(t(0, '2026-06-12'), TODAY)).toBe('q3') // limite: hoje + 2
    expect(getQuadrant(t(0, '2026-06-13'), TODAY)).toBe('q4')
  })

  it('o amanhã vem do dia local informado, não do relógio', () => {
    expect(buildDragPatch(t(0, null), 'q3', TODAY)).toEqual({ due_date: '2026-06-11' })
    expect(buildDragPatch(t(3, '2026-06-11'), 'q4', TODAY)).toEqual({ priority: 1, due_date: '2026-06-15' })
    expect(buildDragPatch(t(0, null), 'q4', TODAY)).toBeNull()
  })

  it('desfazer devolve prioridade e vencimento originais (inclusive sem data)', () => {
    const task = t(0, null)
    const patch = buildDragPatch(task, 'q1', TODAY)!
    expect(patch).toEqual({ priority: 2, due_date: '2026-06-11' })
    expect(undoPatch(task, patch)).toEqual({ priority: 0, due_date: null })
  })
})
