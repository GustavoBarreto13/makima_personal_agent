import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TmdbResult } from '../types'
import { emptyDraft, type LogDraft } from './log'
import { submitLog } from './submit'

const api = {
  add: vi.fn(), logWatch: vi.fn(), like: vi.fn(), createWatchLocation: vi.fn(), deleteDiary: vi.fn(), delete: vi.fn(),
}
const film = (over: Partial<TmdbResult> = {}): TmdbResult => ({ tmdb_id: 7, title: 'Paprika', year: 2006, poster_url: null, director: [], local_id: null, in_catalog: false, ...over })
const draft = (over: Partial<LogDraft> = {}): LogDraft => ({ ...emptyDraft('2026-10-03'), film: film(), rating: 4.5, ...over })

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  api.add.mockResolvedValue({ status: 'ok', id: 'm-new' })
  api.logWatch.mockResolvedValue({ status: 'ok', diary_id: 'd-1' })
  api.createWatchLocation.mockResolvedValue({ status: 'ok', location: { id: 'l-new', name: 'Cinemark', kind: 'cinema' }, created: true })
  api.like.mockResolvedValue({ status: 'ok' })
  api.deleteDiary.mockResolvedValue({ status: 'ok' })
  api.delete.mockResolvedValue({ status: 'ok' })
})

describe('submitLog', () => {
  it('filme fora do catálogo: cria como visto e loga a sessão', async () => {
    await submitLog(draft(), api as never)
    expect(api.add).toHaveBeenCalledWith({ tmdb_id: 7, title: 'Paprika', status: 'watched', year: 2006 })
    expect(api.logWatch).toHaveBeenCalledWith('m-new', expect.objectContaining({ watched_date: '2026-10-03', rating: 4.5, review: null, companion_ids: [], watch_location_id: null }))
  })

  it('filme já no catálogo: não cria de novo', async () => {
    await submitLog(draft({ film: film({ local_id: 'm-old', in_catalog: true }) }), api as never)
    expect(api.add).not.toHaveBeenCalled()
    expect(api.logWatch).toHaveBeenCalledWith('m-old', expect.any(Object))
  })

  it('local novo é cadastrado antes da sessão; pessoas e resenha seguem junto', async () => {
    await submitLog(draft({ place: { name: 'Cinemark', kind: 'cinema' }, people: [{ id: 'p1', name: 'Ana' }], review: '  Obra-prima  ', tags: ['anime'] }), api as never)
    expect(api.createWatchLocation).toHaveBeenCalledWith('Cinemark', 'cinema')
    expect(api.logWatch).toHaveBeenCalledWith('m-new', expect.objectContaining({ watch_location_id: 'l-new', companion_ids: ['p1'], review: 'Obra-prima', tags: ['anime'] }))
  })

  it('local já cadastrado é só referenciado', async () => {
    await submitLog(draft({ place: { id: 'l1' } }), api as never)
    expect(api.createWatchLocation).not.toHaveBeenCalled()
    expect(api.logWatch).toHaveBeenCalledWith('m-new', expect.objectContaining({ watch_location_id: 'l1' }))
  })

  it('só marca o coração quando pedido', async () => {
    await submitLog(draft(), api as never)
    expect(api.like).not.toHaveBeenCalled()
    await submitLog(draft({ liked: true }), api as never)
    expect(api.like).toHaveBeenCalledWith('m-new', true)
  })

  it('Desfazer apaga a sessão e, se o filme nasceu agora, o filme também', async () => {
    const r = await submitLog(draft(), api as never)
    await r.undo()
    expect(api.deleteDiary).toHaveBeenCalledWith('d-1')
    expect(api.delete).toHaveBeenCalledWith('m-new')
  })

  it('Desfazer de um filme que já existia só apaga a sessão', async () => {
    const r = await submitLog(draft({ film: film({ local_id: 'm-old' }) }), api as never)
    await r.undo()
    expect(api.deleteDiary).toHaveBeenCalledWith('d-1')
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('sem filme escolhido não grava nada', async () => {
    await expect(submitLog(draft({ film: null }), api as never)).rejects.toThrow(/Escolha o filme/)
    expect(api.logWatch).not.toHaveBeenCalled()
  })
})
