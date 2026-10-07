import { describe, expect, it } from 'vitest'
import { hashFor, routeFromHash } from './routes'

describe('rotas por hash', () => {
  it('telas, livro e estante abertos vão e voltam da URL', () => {
    expect(routeFromHash('#diario')).toEqual({ view: 'diary' })
    expect(routeFromHash('#livro/abc-123')).toEqual({ view: 'catalog', bookId: 'abc-123' })
    expect(routeFromHash('#estante/s1')).toEqual({ view: 'shelves', shelfId: 's1' })
    expect(hashFor({ view: 'catalog', bookId: 'abc-123' })).toBe('livro/abc-123')
    expect(hashFor({ view: 'toread' })).toBe('quero-ler')
  })
  it('nomes do shell antigo continuam funcionando', () => {
    expect(routeFromHash('#catalogo').view).toBe('catalog')
    expect(routeFromHash('#atividade').view).toBe('diary')
    expect(routeFromHash('#listas').view).toBe('shelves')
    expect(routeFromHash('#querler').view).toBe('toread')
  })
  it('hash desconhecido ou vazio cai no Início', () => {
    expect(routeFromHash('').view).toBe('home')
    expect(routeFromHash('#nada').view).toBe('home')
  })
})
