// Gravar um rascunho de sessão e desfazer (lógica pura com a API simulada).

import { describe, expect, it, vi } from 'vitest'
import { emptyDraft } from './log'
import { normalizeAnime } from './normalize'
import { submitLog } from './submit'
import type { ApiAnime } from '../types'

const anime = (status: string) => normalizeAnime({
  id: 'a1', mal_id: 1, title: 'Frieren', media_type: 'tv', season: null, studio: null, episodes_total: 28, episodes_watched: 11, status,
  airing_status: null, score: null, poster_url: null, banner_url: null, overview: null, genres: [], tags: [], notes: null,
  date_started: null, date_finished: null, created_at: null, updated_at: null,
} as ApiAnime)

const api = () => ({
  logWatch: vi.fn(async () => ({ log_id: 'log-1' })),
  updateStatus: vi.fn(async () => ({})),
  deleteLog: vi.fn(async () => ({})),
})

const draft = { ...emptyDraft('2026-10-08', 'a1', 12), notes: ' boa ', rating: 4.5 }

describe('submitLog', () => {
  it('registra a sessão com a nota em estrelas (a conversão para o MAL é da API) e a anotação limpa', async () => {
    const a = api()
    const r = await submitLog(draft, anime('assistindo'), a as never)
    expect(a.logWatch).toHaveBeenCalledWith('a1', { ep_start: 12, ep_end: 12, watched_date: '2026-10-08', stars: 4.5, notes: 'boa' })
    expect(a.updateStatus).not.toHaveBeenCalled()
    expect(r.message).toBe('Ep 12 de Frieren registrado')
  })
  it('desfazer apaga a sessão', async () => {
    const a = api()
    const r = await submitLog(draft, anime('assistindo'), a as never)
    await r.undo()
    expect(a.deleteLog).toHaveBeenCalledWith('log-1')
    expect(a.updateStatus).not.toHaveBeenCalled()
  })
  it('anime da fila passa a "assistindo" antes de logar e o desfazer devolve o estado antigo', async () => {
    const a = api()
    const r = await submitLog(draft, anime('quero_assistir'), a as never)
    expect(a.updateStatus).toHaveBeenCalledWith('a1', 'assistindo')
    expect(a.updateStatus.mock.invocationCallOrder[0]).toBeLessThan(a.logWatch.mock.invocationCallOrder[0])
    await r.undo()
    expect(a.updateStatus).toHaveBeenLastCalledWith('a1', 'quero_assistir')
  })
  it('anime pausado também volta a "assistindo"; completo não muda', async () => {
    const paused = api()
    await submitLog(draft, anime('pausado'), paused as never)
    expect(paused.updateStatus).toHaveBeenCalledWith('a1', 'assistindo')
    const done = api()
    await submitLog(draft, anime('completo'), done as never)
    expect(done.updateStatus).not.toHaveBeenCalled()
  })
})
