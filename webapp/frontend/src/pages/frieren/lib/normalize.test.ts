// A borda do app: dado do servidor com null/formato antigo não pode quebrar nenhuma tela.

import { describe, expect, it } from 'vitest'
import { domainOf, normalizeBook, normalizeSession, normalizeUrl, shelfTone, splitList } from './normalize'
import type { ApiBook } from '../types'

const RAW: ApiBook = {
  id: 'b1', title: 'Duna', author: null, total_pages: null, status: 'abandonado', cover_url: '', date_started: '2026-03-01',
  date_finished: null, date_abandoned: '2026-04-02', rating: null, genre: 'Ficção científica, Aventura', isbn: null,
  published_year: null, language: null, notes: null, store_url: null, price: null, liked: null, created_at: null,
  updated_at: null, current_page: null, last_read: null, shelves: null,
}

describe('normalizeBook', () => {
  it('nulls viram valores seguros e os 7 status são preservados', () => {
    const b = normalizeBook(RAW)
    expect(b.status).toBe('abandonado')          // o shell antigo transformava em "lido"
    expect(b.author).toBe('')
    expect(b.shelves).toEqual([])
    expect(b.liked).toBe(false)
    expect(b.coverUrl).toBeNull()
    expect(b.progress).toBeNull()
    expect(b.genres).toEqual(['Ficção científica', 'Aventura'])
    expect(b.genre).toBe('Ficção científica')
    expect(b.abandoned).toBe('2026-04-02')
  })
  it('status desconhecido cai em "quero ler"; progresso nunca passa de 100%', () => {
    const b = normalizeBook({ ...RAW, status: 'xyz', total_pages: 100, current_page: 150 })
    expect(b.status).toBe('quero_ler')
    expect(b.progress).toBe(1)
  })
})

describe('normalizeSession', () => {
  it('tipo desconhecido vira progresso comum', () => {
    const s = normalizeSession({ id: 'l1', date: '2026-10-01', book_id: 'b1', title: '', author: null, pages: null, page: null, note: null, rating: null, type: 'review' })
    expect(s).toMatchObject({ kind: 'progress', title: 'Livro', pages: 0, page: 0, note: '' })
  })
})

describe('estantes e links', () => {
  it('cor da estante: formato antigo, matiz puro, cinza e lixo', () => {
    expect(shelfTone('oklch(0.58 0.085 195)', 0)).toEqual({ hue: 195, neutral: false })
    expect(shelfTone('250', 0)).toEqual({ hue: 250, neutral: false })
    expect(shelfTone('oklch(0.62 0.02 240)', 0).neutral).toBe(true)   // o "cinza" da paleta antiga
    expect(shelfTone('neutral', 9)).toEqual({ hue: 9, neutral: true })
    expect(shelfTone('azul', 195)).toEqual({ hue: 195, neutral: false })
  })
  it('link sem protocolo ganha https e mostra só o domínio', () => {
    expect(normalizeUrl('amazon.com.br/x')).toBe('https://amazon.com.br/x')
    expect(normalizeUrl('http://a.com')).toBe('http://a.com')
    expect(domainOf('www.estantevirtual.com.br/livro')).toBe('estantevirtual.com.br')
  })
  it('splitList ignora vazios', () => {
    expect(splitList(' a, ,b ')).toEqual(['a', 'b'])
    expect(splitList(null)).toEqual([])
  })
})
