import { describe, expect, it } from 'vitest'
import { greeting } from './greeting'

describe('saudação do hero', () => {
  it('muda nas viradas das 6h, 12h e 18h', () => {
    expect([0, 5].map(greeting)).toEqual(['Boa madrugada', 'Boa madrugada'])
    expect([6, 11].map(greeting)).toEqual(['Bom dia', 'Bom dia'])
    expect([12, 17].map(greeting)).toEqual(['Boa tarde', 'Boa tarde'])
    expect([18, 23].map(greeting)).toEqual(['Boa noite', 'Boa noite'])
  })
})
