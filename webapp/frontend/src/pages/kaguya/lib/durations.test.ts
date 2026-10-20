// Testes dos helpers que mantêm Duração e Horário sincronizados.
import { describe, expect, it } from 'vitest'
import { durationBetween, endFromDuration } from './durations'

describe('endFromDuration', () => {
  it('soma a duração ao início', () => expect(endFromDuration(9 * 60, 120)).toBe(11 * 60))
  it('sem duração usa o bloco padrão de 30 min', () => expect(endFromDuration(9 * 60, 0)).toBe(9 * 60 + 30))
  it('pode passar da meia-noite', () => expect(endFromDuration(23 * 60, 120)).toBe(25 * 60))
})

describe('durationBetween', () => {
  it('diferença simples', () => expect(durationBetween(9 * 60, 10 * 60 + 40)).toBe(100))
  it('vira o dia', () => expect(durationBetween(23 * 60, 60, 1)).toBe(120))
  it('nunca menos de 15 min', () => expect(durationBetween(600, 605)).toBe(15))
})
