// Editar livro: só o que mudou vai para o servidor, e esvaziar um campo opcional apaga o valor.

import { describe, expect, it } from 'vitest'
import { buildPatch, validateForm } from './BookForm'

const F = {
  title: 'Duna', author: 'Frank Herbert', cover_url: '', genre: 'Ficção', published_year: '1965', total_pages: '680', isbn: '',
  language: 'en', status: 'lido' as const, rating: 4 as number | null, date_started: '2026-01-01', date_finished: '2026-02-01',
  description: '', notes: 'Ótimo', store_url: '', price: '',
}

describe('buildPatch', () => {
  it('nada mudou: patch vazio', () => {
    expect(buildPatch(F, { ...F })).toEqual({})
  })
  it('só os campos alterados, com números convertidos', () => {
    expect(buildPatch(F, { ...F, title: ' Duna ', total_pages: '700', genre: 'Ficção científica' })).toEqual({ total_pages: 700, genre: 'Ficção científica' })
  })
  it('esvaziar nota, término, resenha e páginas apaga (clear)', () => {
    const p = buildPatch(F, { ...F, rating: null, date_finished: '', notes: '', total_pages: '' })
    expect(p.clear?.sort()).toEqual(['date_finished', 'notes', 'rating', 'total_pages'])
  })
  it('link da loja ganha https e preço aceita vírgula', () => {
    expect(buildPatch(F, { ...F, store_url: 'amazon.com.br/x', price: '49,90' })).toEqual({ store_url: 'https://amazon.com.br/x', price: 49.9 })
  })
  it('nota com meia estrela', () => {
    expect(buildPatch(F, { ...F, rating: 4.5 })).toEqual({ rating: 4.5 })
  })
})

describe('validateForm', () => {
  it('título obrigatório, término depois do início e nada no futuro', () => {
    expect(validateForm({ ...F, title: ' ' }, '2026-10-07').title).toBeTruthy()
    expect(validateForm({ ...F, date_finished: '2025-12-01' }, '2026-10-07').date_finished).toMatch(/antes do início/)
    expect(validateForm({ ...F, date_started: '2027-01-01', date_finished: '' }, '2026-10-07').date_started).toBeTruthy()
    expect(validateForm(F, '2026-10-07')).toEqual({})
  })
})
