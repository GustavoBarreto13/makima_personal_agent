// Gravar uma leitura e o "Desfazer" que devolve o livro ao estado de antes.

import { describe, expect, it, vi } from 'vitest'
import { normalizeBook } from './normalize'
import { submitLog } from './submit'
import type { LogDraft } from './log'
import type { ApiBook } from '../types'

const base: ApiBook = {
  id: 'b1', title: 'Duna', author: 'Frank Herbert', total_pages: 400, status: 'quero_ler', cover_url: null, date_started: null,
  date_finished: null, date_abandoned: null, rating: null, genre: null, isbn: null, published_year: null, language: null, notes: null,
  store_url: null, price: null, liked: false, created_at: null, updated_at: null, current_page: 0, last_read: null, shelves: [],
}
const api = () => ({
  log: vi.fn(async () => ({ status: 'ok' as const, log_id: 'log-1' })),
  finish: vi.fn(async () => ({ status: 'ok' as const })),
  deleteSession: vi.fn(async () => ({ status: 'ok' as const })),
  setStatus: vi.fn(async () => ({ status: 'ok' as const })),
  updateMetadata: vi.fn(async () => ({ status: 'ok' as const })),
})
const draft = (over: Partial<LogDraft>): LogDraft => ({ bookId: 'b1', title: '', page: 50, date: '2026-10-07', note: '', finished: false, rating: null, ...over })

describe('submitLog', () => {
  it('primeira leitura de um livro da pilha: registra; desfazer apaga a sessão, volta o status e a data de início', async () => {
    const a = api()
    const r = await submitLog(draft({ note: ' bom começo ' }), normalizeBook(base), a)
    expect(a.log).toHaveBeenCalledWith('b1', { current_page: 50, session_notes: 'bom começo', log_date: '2026-10-07' })
    expect(a.finish).not.toHaveBeenCalled()
    expect(r.message).toBe('+50 páginas em Duna')

    await r.undo()
    expect(a.deleteSession).toHaveBeenCalledWith('b1', 'log-1')
    expect(a.setStatus).toHaveBeenCalledWith('b1', 'quero_ler')
    expect(a.updateMetadata).toHaveBeenCalledWith('b1', { clear: ['date_started'] })
  })

  it('terminar sem página nova: só conclui (sem sessão); desfazer devolve status, término e nota', async () => {
    const a = api()
    const book = normalizeBook({ ...base, status: 'lendo', date_started: '2026-09-01', current_page: 400, rating: 3 })
    const r = await submitLog(draft({ page: 400, finished: true, rating: 4.5 }), book, a)
    expect(a.log).not.toHaveBeenCalled()
    expect(a.finish).toHaveBeenCalledWith('b1', { date_finished: '2026-10-07', rating: 4.5 })
    expect(r.message).toMatch(/terminado/)

    await r.undo()
    expect(a.deleteSession).not.toHaveBeenCalled()
    expect(a.setStatus).toHaveBeenCalledWith('b1', 'lendo')
    expect(a.updateMetadata).toHaveBeenCalledWith('b1', { rating: 3, clear: ['date_finished'] })
  })

  it('livro já em leitura avançando: desfazer só apaga a sessão', async () => {
    const a = api()
    const book = normalizeBook({ ...base, status: 'lendo', date_started: '2026-09-01', current_page: 100 })
    const r = await submitLog(draft({ page: 130 }), book, a)
    expect(r.message).toBe('+30 páginas em Duna')
    await r.undo()
    expect(a.deleteSession).toHaveBeenCalled()
    expect(a.setStatus).not.toHaveBeenCalled()
    expect(a.updateMetadata).not.toHaveBeenCalled()
  })
})
