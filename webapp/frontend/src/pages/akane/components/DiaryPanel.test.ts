import { describe, expect, it } from 'vitest'
import type { DiaryEntry } from '../types'
import { groupRecent } from './DiaryPanel'

const e = (id: string, watched_date: string) => ({ id, watched_date, movie_id: id, movie_title: id }) as unknown as DiaryEntry

describe('groupRecent (painel Diário do Início)', () => {
  it('agrupa por mês na ordem recebida e guarda o mês e o ano de cada grupo', () => {
    const g = groupRecent([e('a', '2026-10-02'), e('b', '2026-10-01'), e('c', '2026-09-30')])
    expect(g.map((x) => [x.key, x.month, x.year, x.items.length])).toEqual([['2026-10', 9, '2026', 2], ['2026-09', 8, '2026', 1]])
  })

  it('corta em 9 linhas no total, mesmo no meio de um mês', () => {
    const many = Array.from({ length: 14 }, (_, i) => e(`m${i}`, `2026-10-${String(14 - i).padStart(2, '0')}`))
    const g = groupRecent(many)
    expect(g.reduce((n, x) => n + x.items.length, 0)).toBe(9)
  })

  it('o mesmo mês de anos diferentes não se mistura', () => {
    const g = groupRecent([e('a', '2026-03-05'), e('b', '2025-03-20')])
    expect(g.map((x) => x.year)).toEqual(['2026', '2025'])
  })

  it('sem sessões, sem grupos', () => {
    expect(groupRecent([])).toEqual([])
  })
})
