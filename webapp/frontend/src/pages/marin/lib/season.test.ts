// Temporada de estreia em português (lógica pura).

import { describe, expect, it } from 'vitest'
import { seasonLabel, seasonYear } from './season'
import { seasonKey, seasonsDesc } from './schemas'

describe('seasonLabel', () => {
  it('traduz o texto do Jikan', () => {
    expect(seasonLabel('winter 2024')).toBe('Inverno 2024')
    expect(seasonLabel('Fall 2019')).toBe('Outono 2019')
    expect(seasonLabel('spring 2021')).toBe('Primavera 2021')
    expect(seasonLabel('summer 2020')).toBe('Verão 2020')
  })
  it('aceita o que já veio em português', () => {
    expect(seasonLabel('Verão 2019')).toBe('Verão 2019')
    expect(seasonLabel('verao 2019')).toBe('Verão 2019')
  })
  it('texto que não dá para entender vira vazio', () => {
    expect(seasonLabel(null)).toBe('')
    expect(seasonLabel('2024')).toBe('')
    expect(seasonLabel('monsoon 2024')).toBe('')
    expect(seasonLabel('winter')).toBe('')
  })
  it('seasonYear tira o ano do rótulo', () => {
    expect(seasonYear('Inverno 2024')).toBe('2024')
    expect(seasonYear('')).toBe('')
  })
})

describe('ordem das temporadas', () => {
  it('a mais recente vem primeiro', () => {
    expect(seasonsDesc(['Verão 2024', 'Outono 2025', 'Inverno 2024', '', 'Outono 2025']).map((s) => s.value))
      .toEqual(['Outono 2025', 'Verão 2024', 'Inverno 2024'])
  })
  it('sem temporada vale 0', () => {
    expect(seasonKey('')).toBe(0)
    expect(seasonKey('Outono 2025')).toBeGreaterThan(seasonKey('Verão 2025'))
  })
})
