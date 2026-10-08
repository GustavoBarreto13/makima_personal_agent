// Nota do anime: meia estrela = 1 ponto do MAL (lógica pura).

import { describe, expect, it } from 'vitest'
import { malLabel, toMal, toStars } from './score'

describe('toStars', () => {
  it('converte a nota do MAL (0–10) em estrelas com meia estrela', () => {
    expect(toStars(10)).toBe(5)
    expect(toStars(9)).toBe(4.5)
    expect(toStars(8)).toBe(4)
    expect(toStars(7)).toBe(3.5)
    expect(toStars(1)).toBe(0.5)
  })
  it('notas antigas com .5 arredondam para a meia estrela mais próxima', () => {
    expect(toStars(7.5)).toBe(4)       // 3.75 → 4
    expect(toStars(8.5)).toBe(4.5)     // 4.25 → 4.5
  })
  it('sem nota continua sem nota', () => {
    expect(toStars(null)).toBeNull()
    expect(toStars(undefined)).toBeNull()
    expect(toStars(0)).toBeNull()
  })
})

describe('toMal', () => {
  it('volta de estrelas para pontos inteiros do MAL', () => {
    expect(toMal(5)).toBe(10)
    expect(toMal(4.5)).toBe(9)
    expect(toMal(0.5)).toBe(1)
  })
  it('vazio ou zero vira 0 (o servidor lê como "sem nota")', () => {
    expect(toMal(null)).toBe(0)
    expect(toMal(0)).toBe(0)
  })
  it('ida e volta não perde nada para notas inteiras do MAL', () => {
    for (let mal = 1; mal <= 10; mal++) expect(toMal(toStars(mal))).toBe(mal)
  })
})

describe('malLabel', () => {
  it('mostra "8/10" ao lado das estrelas', () => {
    expect(malLabel(4)).toBe('8/10')
    expect(malLabel(null)).toBeNull()
  })
})
