// Linha rápida de "registrar leitura": o que ela entende e quando salva direto (lógica pura, sem tela).

import { describe, expect, it } from 'vitest'
import { addDaysISO, todayISO } from '../../../design/core/format'
import { normalizeBook } from './normalize'
import { candidates, draftFromCapture, logParser, pickBook, splitFinish, validateDraft } from './log'
import type { ApiBook } from '../types'

// O parser entende "ontem" a partir do dia real: o teste usa o mesmo dia para não depender do calendário.
const TODAY = todayISO()

const book = (id: string, title: string, over: Partial<ApiBook> = {}) => normalizeBook({
  id, title, author: 'Autor', total_pages: 400, status: 'lendo', cover_url: null, date_started: '2026-09-01', date_finished: null,
  date_abandoned: null, rating: null, genre: 'Fantasia', isbn: null, published_year: 2000, language: 'pt', notes: null, store_url: null,
  price: null, liked: false, created_at: '2026-01-01T12:00:00-03:00', updated_at: null, current_page: 100, last_read: '2026-10-06',
  shelves: [], ...over,
})

const BOOKS = [
  book('b1', 'Duna'),
  book('b2', 'Duna: Messias', { status: 'quero_ler', current_page: null }),
  book('b3', 'O Hobbit', { status: 'lido', current_page: 300, total_pages: 300 }),
]
const draft = (text: string, books = BOOKS) => draftFromCapture(logParser(text), { today: TODAY, books })

describe('splitFinish', () => {
  it('"terminei" no fim sai do título e marca terminado', () => {
    expect(splitFinish('O Hobbit terminei')).toEqual({ title: 'O Hobbit', finished: true })
    expect(splitFinish('O Hobbit')).toEqual({ title: 'O Hobbit', finished: false })
  })
})

describe('pickBook', () => {
  it('título igual (sem acento/maiúscula) escolhe o livro mesmo havendo outro que começa igual', () => {
    expect(pickBook('duna', BOOKS)?.id).toBe('b1')
  })
  it('começo do título serve quando só um livro bate', () => {
    expect(pickBook('hobb', BOOKS)?.id).toBeUndefined()   // "hobb" não é o começo de "O Hobbit"
    expect(pickBook('o hob', BOOKS)?.id).toBe('b3')
  })
  it('sem título: o único livro em leitura', () => {
    expect(pickBook('', BOOKS)?.id).toBe('b1')
    expect(pickBook('', [...BOOKS, book('b4', 'Outro')])).toBeNull()   // dois em leitura: pergunta
  })
  it('empate não chuta', () => {
    expect(pickBook('duna', [...BOOKS, book('b5', 'Duna')])).toBeNull()
  })
})

describe('draftFromCapture', () => {
  it('"Duna p. 240 ontem": livro, página e data no passado', () => {
    const d = draft('Duna p. 240 ontem')
    expect(d).toMatchObject({ bookId: 'b1', page: 240, date: addDaysISO(TODAY, -1), finished: false })
  })
  it('"Hobbit terminei ★4.5" sem página: página final = total do livro e a nota', () => {
    const d = draft('O Hobbit terminei ★4.5')
    expect(d).toMatchObject({ bookId: 'b3', page: 300, finished: true, rating: 4.5 })
  })
  it('nota sem "terminei" é ignorada (nota é do livro terminado)', () => {
    expect(draft('Duna p. 200 ★4').rating).toBeNull()
  })
})

describe('validateDraft', () => {
  const b1 = BOOKS[0]
  it('página nova maior que a atual: ok', () => {
    expect(validateDraft({ ...draft('Duna p. 120') }, b1, TODAY)).toBeNull()
  })
  it('página que não avança e sem terminar: pede uma página maior', () => {
    expect(validateDraft(draft('Duna p. 100'), b1, TODAY)?.field).toBe('page')
  })
  it('página além do total do livro', () => {
    expect(validateDraft(draft('Duna p. 999'), b1, TODAY)?.message).toMatch(/400 páginas/)
  })
  it('data no futuro', () => {
    expect(validateDraft({ ...draft('Duna p. 120'), date: addDaysISO(TODAY, 1) }, b1, TODAY)?.field).toBe('date')
  })
  it('sem livro escolhido', () => {
    expect(validateDraft(draft('Livro que não existe p. 10'), null, TODAY)?.field).toBe('book')
  })
})

describe('candidates', () => {
  it('lendo primeiro, depois a pilha, por último os lidos', () => {
    expect(candidates(BOOKS).map((b) => b.id)).toEqual(['b1', 'b2', 'b3'])
  })
})
