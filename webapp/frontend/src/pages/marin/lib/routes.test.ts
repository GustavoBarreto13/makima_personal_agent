// Rotas por hash (lógica pura).

import { describe, expect, it } from 'vitest'
import { hashFor, routeFromHash, VIEW_HASH, type ViewId } from './routes'

describe('routeFromHash', () => {
  it('lê cada tela pelo nome em português', () => {
    for (const [view, hash] of Object.entries(VIEW_HASH)) expect(routeFromHash(`#${hash}`)).toEqual({ view })
  })
  it('anime e lista abertos ficam na URL', () => {
    expect(routeFromHash('#anime/abc-123')).toEqual({ view: 'catalog', animeId: 'abc-123' })
    expect(routeFromHash('#lista/L1')).toEqual({ view: 'lists', listId: 'L1' })
  })
  it('aceita os nomes do shell antigo', () => {
    expect(routeFromHash('#watchlist')).toEqual({ view: 'queue' })
    expect(routeFromHash('#rewind')).toEqual({ view: 'stats' })
    expect(routeFromHash('#stats')).toEqual({ view: 'stats' })
  })
  it('vazio ou desconhecido cai no Início', () => {
    expect(routeFromHash('')).toEqual({ view: 'home' })
    expect(routeFromHash('#nada')).toEqual({ view: 'home' })
  })
})

describe('hashFor', () => {
  it('ida e volta', () => {
    for (const view of Object.keys(VIEW_HASH) as ViewId[]) expect(routeFromHash(`#${hashFor({ view })}`)).toEqual({ view })
    expect(hashFor({ view: 'catalog', animeId: 'x' })).toBe('anime/x')
    expect(hashFor({ view: 'lists', listId: 'y' })).toBe('lista/y')
  })
})
