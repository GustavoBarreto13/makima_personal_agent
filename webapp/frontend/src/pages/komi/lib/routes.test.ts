import { describe, expect, it } from 'vitest'
import { hashFor, routeFromHash } from './routes'

describe('rotas por hash', () => {
  it('telas do menu e nomes antigos', () => {
    expect(routeFromHash('')).toEqual({ view: 'home' })
    expect(routeFromHash('#pessoas')).toEqual({ view: 'people' })
    expect(routeFromHash('#diretorio')).toEqual({ view: 'people' })
    expect(routeFromHash('#datas')).toEqual({ view: 'dates' })
    expect(routeFromHash('#estatisticas')).toEqual({ view: 'stats' })
    expect(routeFromHash('#qualquer-coisa')).toEqual({ view: 'home' })
  })

  it('#pessoa/<id> (o link que a Violet e a Kaguya usam) preserva o id e aceita a aba', () => {
    expect(routeFromHash('#pessoa/AbC-123')).toEqual({ view: 'people', personId: 'AbC-123', tab: undefined })
    expect(routeFromHash('#pessoa/x1/anotacoes')).toEqual({ view: 'people', personId: 'x1', tab: 'notes' })
    expect(routeFromHash('#pessoa/x1/aba-errada').tab).toBeUndefined()
  })

  it('relacionamento do menu', () => {
    expect(routeFromHash('#pessoas/familia')).toEqual({ view: 'people', category: 'familia' })
  })

  it('hashFor é o inverso de routeFromHash', () => {
    for (const h of ['inicio', 'pessoas', 'datas', 'estatisticas', 'pessoa/u1', 'pessoa/u1/interacoes', 'pessoas/amigos']) {
      expect(hashFor(routeFromHash(`#${h}`))).toBe(h)
    }
  })
})
