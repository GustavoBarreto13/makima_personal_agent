import { describe, expect, it } from 'vitest'
import { hashFor, routeFromHash, VIEW_HASH, type ViewId } from './routes'

describe('rotas por hash', () => {
  it('cada tela tem um hash que volta para ela mesma', () => {
    for (const view of Object.keys(VIEW_HASH) as ViewId[]) expect(routeFromHash(`#${VIEW_HASH[view]}`)).toEqual({ view })
  })

  it('filme e lista abertos ficam na URL', () => {
    expect(routeFromHash('#filme/abc-123')).toEqual({ view: 'films', movieId: 'abc-123' })
    expect(routeFromHash('#lista/9f')).toEqual({ view: 'lists', listId: '9f' })
    expect(hashFor({ view: 'films', movieId: 'abc' })).toBe('filme/abc')
    expect(hashFor({ view: 'lists', listId: 'x' })).toBe('lista/x')
    expect(hashFor({ view: 'diary' })).toBe('diario')
  })

  it('o Rewind antigo agora é a tela de Estatísticas', () => {
    expect(routeFromHash('#rewind')).toEqual({ view: 'stats' })
  })

  it('hash vazio ou desconhecido cai no Início; maiúsculas não importam', () => {
    expect(routeFromHash('')).toEqual({ view: 'home' })
    expect(routeFromHash('#naoexiste')).toEqual({ view: 'home' })
    expect(routeFromHash('#DIARIO')).toEqual({ view: 'diary' })
  })
})
