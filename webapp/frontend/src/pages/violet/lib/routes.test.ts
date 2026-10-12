import { describe, expect, it } from 'vitest'
import { hashFor, navIdFor, routeFromHash, type Route } from './routes'

describe('rotas da Violet', () => {
  it('ida e volta', () => {
    const cases: Route[] = [
      { view: 'write' }, { view: 'write', date: '2026-10-12' }, { view: 'archive' }, { view: 'reflect' }, { view: 'reflect', week: '2026-10-05' },
      { view: 'reflect', weeks: true }, { view: 'letters' }, { view: 'letters', letterId: 7 }, { view: 'letters', newLetter: true },
      { view: 'emotions' }, { view: 'emotions', emotionId: 3 }, { view: 'values' }, { view: 'values', valuesEdit: true },
      { view: 'values', valuesHistory: true }, { view: 'people' }, { view: 'people', person: 'abc-1' }, { view: 'people', person: 'nome:Ana' },
      { view: 'tags', tag: 'vida-adulta' }, { view: 'collection', kind: 'idea' }, { view: 'collection', kind: 'dreams' },
      { view: 'collection', ref: { agent: 'akane', entityType: 'movie', entityId: 'm-1' } }, { view: 'insights' }, { view: 'tutor' },
    ]
    for (const r of cases) expect(routeFromHash(`#${hashFor(r)}`)).toEqual(r)
  })
  it('nomes antigos e o link ?date= do Calendário', () => {
    expect(routeFromHash('#journal')).toEqual({ view: 'archive' })
    expect(routeFromHash('#dreams')).toEqual({ view: 'collection', kind: 'dreams' })
    expect(routeFromHash('', '?date=2026-09-01')).toEqual({ view: 'write', date: '2026-09-01' })
    expect(routeFromHash('#qualquer-coisa')).toEqual({ view: 'write' })
    expect(routeFromHash('#dia/ontem')).toEqual({ view: 'write' })
  })
  it('item do menu', () => {
    expect(navIdFor({ view: 'collection', kind: 'idea' })).toBe('col-idea')
    expect(navIdFor({ view: 'letters', letterId: 2 })).toBe('letters')
  })
})
