// @vitest-environment jsdom
// A Akane nova de ponta a ponta no jsdom: o shell de verdade, com a API simulada.
// Cobre o que mais importa para o uso: logar pela linha rápida (e desfazer), dúvida/pessoa/local abrem o
// formulário, Diário (excluir com desfazer, reordenar o dia), Filmes e os estados da tela.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../design/test-utils'
import { __resetToasts } from '../../design/headless/toast'

const api = vi.hoisted(() => ({
  home: vi.fn(), heatmap: vi.fn(), watchLocations: vi.fn(), tmdbSearch: vi.fn(), add: vi.fn(), logWatch: vi.fn(), like: vi.fn(),
  createWatchLocation: vi.fn(), deleteDiary: vi.fn(), delete: vi.fn(), list: vi.fn(), watchlist: vi.fn(), diary: vi.fn(),
  reorderDiary: vi.fn(), setFavorites: vi.fn(), updateDiaryEntry: vi.fn(), syncLetterboxd: vi.fn(),
}))
vi.mock('./akaneApi', () => ({ akaneApi: api }))
vi.mock('../komi/komiApi', () => ({ komiApi: { search: vi.fn(async () => ({ matches: [] })), create: vi.fn() } }))

import { AkaneShell } from './AkaneShell'

const HOME = {
  status: 'ok',
  favorites: [{ id: 'm1', title: 'Perfect Blue', poster_url: null, poster_palette: 'noir', position: 0 }],
  recent_activity: [{
    id: 'd1', movie_id: 'm1', movie_title: 'Perfect Blue', poster_url: null, poster_palette: 'noir', watched_date: '2026-10-02', rating: 5,
    rewatch: false, review: null, tags: [], companions: [], watch_location: null, liked: true,
  }],
  watchlist_highlight: [{ id: 'm2', title: 'Paprika', year: 2006, poster_url: null, poster_palette: 'x', director: ['Satoshi Kon'], runtime: 90 }],
  rating_histogram: { '5.0': 1 },
  sessions_7d: 3, sessions_7d_prev: 1,
  last_session: { title: 'Perfect Blue', rating: 5, watched_date: '2026-10-02' },
  counts: { films_watched: 12, diary: 20, watchlist: 3 },
}
const EMPTY_HOME = { ...HOME, favorites: [], recent_activity: [], watchlist_highlight: [], last_session: null, counts: { films_watched: 0, diary: 0, watchlist: 0 } }

const MOVIE = (id: string, title: string, over: object = {}) => ({
  id, tmdb_id: 1, imdb_id: null, letterboxd_uri: null, title, year: 1997, director: ['Satoshi Kon'], genres: ['Animação'], runtime: 81, overview: null,
  poster_url: null, backdrop_url: null, poster_palette: 'noir', status: 'watched', rating: 4.5, rating_source: 'own', liked: false, tags: [], notes: null,
  last_watched_date: '2026-09-01', times_watched: 1, original_language: 'ja', countries: ['JP'], watchlist_added_at: null, created_at: '2026-01-01T12:00:00-03:00', ...over,
})
const ENTRY = (id: string, title: string, over: object = {}) => ({
  id, movie_id: `m-${id}`, movie_title: title, poster_url: null, poster_palette: 'noir', watched_date: '2026-10-02', rating: 4, rewatch: false,
  review: null, tags: [], companions: [], watch_location: null, ...over,
})
const RESULT = (over: object = {}) => ({ tmdb_id: 1, title: 'Perfect Blue', year: 1997, poster_url: null, director: ['Satoshi Kon'], local_id: null, in_catalog: false, ...over })

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  api.home.mockResolvedValue(HOME)
  api.heatmap.mockResolvedValue({ status: 'ok', year: 2026, days: [] })
  api.watchLocations.mockResolvedValue({ status: 'ok', locations: [{ id: 'l1', name: 'Cinemark', kind: 'cinema' }] })
  api.tmdbSearch.mockResolvedValue({ status: 'ok', results: [RESULT()] })
  api.add.mockResolvedValue({ status: 'ok', id: 'm-new' })
  api.logWatch.mockResolvedValue({ status: 'ok', diary_id: 'd-new' })
  api.like.mockResolvedValue({ status: 'ok' })
  api.deleteDiary.mockResolvedValue({ status: 'ok' })
  api.delete.mockResolvedValue({ status: 'ok' })
  api.list.mockResolvedValue({ status: 'ok', movies: [MOVIE('m1', 'Perfect Blue'), MOVIE('m3', 'Duna', { year: 2021, genres: ['Ficção científica'], director: [] })] })
  api.watchlist.mockResolvedValue({ status: 'ok', movies: [MOVIE('m2', 'Paprika', { status: 'watchlist', rating: null })] })
  api.diary.mockResolvedValue({ status: 'ok', entries: [] })
  api.reorderDiary.mockResolvedValue({ status: 'ok' })
  window.location.hash = ''
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); document.documentElement.removeAttribute('data-ds-theme') })

const open = async () => {
  const user = userEvent.setup()
  render(<MemoryRouter><AkaneShell /></MemoryRouter>)
  await screen.findByText('12 filmes vistos')
  return user
}
const captureInput = () => screen.getByLabelText('Logar um filme em uma linha')

describe('Início', () => {
  it('mostra o total visto, a semana, a atividade recente e o Quero ver', async () => {
    await open()
    expect(screen.getByText(/3 sessões nos últimos 7 dias \(\+2 que na semana anterior\)/)).toBeTruthy()
    expect(screen.getByText('Atividade recente')).toBeTruthy()
    expect(screen.getByText('Paprika')).toBeTruthy()
    expect(screen.getAllByText('Perfect Blue').length).toBeGreaterThan(0)
  })

  it('primeiro uso: convida a logar o primeiro filme', async () => {
    api.home.mockResolvedValue(EMPTY_HOME)
    render(<MemoryRouter><AkaneShell /></MemoryRouter>)
    expect(await screen.findByText('Sua cinemateca começa aqui')).toBeTruthy()
  })

  it('erro ao carregar mostra o estado de erro com "Tentar de novo"', async () => {
    api.home.mockRejectedValue(new Error('offline'))
    render(<MemoryRouter><AkaneShell /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  })
})

describe('linha rápida', () => {
  it('"Perfect Blue ★4.5" reconhece o filme, cria no catálogo e loga com a nota; o Desfazer apaga sessão e filme', async () => {
    const user = await open()
    await user.type(captureInput(), 'Perfect Blue ★4.5{Enter}')
    await waitFor(() => expect(api.logWatch).toHaveBeenCalledTimes(1))
    expect(api.add).toHaveBeenCalledWith({ tmdb_id: 1, title: 'Perfect Blue', status: 'watched', year: 1997 })
    expect(api.logWatch.mock.calls[0][0]).toBe('m-new')
    expect(api.logWatch.mock.calls[0][1]).toMatchObject({ rating: 4.5, review: null, companion_ids: [] })

    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.deleteDiary).toHaveBeenCalledWith('d-new'))
    expect(api.delete).toHaveBeenCalledWith('m-new')
  })

  it('filme que já está no catálogo não é criado de novo', async () => {
    api.tmdbSearch.mockResolvedValue({ status: 'ok', results: [RESULT({ local_id: 'm1', in_catalog: true })] })
    const user = await open()
    await user.type(captureInput(), 'Perfect Blue{Enter}')
    await waitFor(() => expect(api.logWatch).toHaveBeenCalledTimes(1))
    expect(api.add).not.toHaveBeenCalled()
    expect(api.logWatch.mock.calls[0][0]).toBe('m1')
  })

  it('o local cadastrado ("@cinemark") é reconhecido e vai na sessão', async () => {
    const user = await open()
    await user.type(captureInput(), 'Perfect Blue @cinemark{Enter}')
    await waitFor(() => expect(api.logWatch).toHaveBeenCalled())
    expect(api.logWatch.mock.calls[0][1]).toMatchObject({ watch_location_id: 'l1' })
  })

  it('dois resultados com o mesmo título: não chuta, abre o formulário com a lista', async () => {
    api.tmdbSearch.mockResolvedValue({ status: 'ok', results: [RESULT(), RESULT({ tmdb_id: 2, year: 2020 })] })
    const user = await open()
    await user.type(captureInput(), 'Perfect Blue{Enter}')
    const dialog = await screen.findByRole('dialog', { name: 'Logar filme' })
    expect(within(dialog).getAllByText('Perfect Blue').length).toBeGreaterThan(0)
    expect(within(dialog).getByText(/2020/)).toBeTruthy()
    expect(api.logWatch).not.toHaveBeenCalled()
  })

  it('"+Ana" NUNCA salva direto: abre o formulário para confirmar a pessoa', async () => {
    const user = await open()
    await user.type(captureInput(), 'Perfect Blue +Ana{Enter}')
    const dialog = await screen.findByRole('dialog', { name: 'Logar filme' })
    expect(within(dialog).getByText(/Você escreveu \+Ana/)).toBeTruthy()
    expect(api.logWatch).not.toHaveBeenCalled()
  })

  it('local desconhecido avisa e abre o formulário', async () => {
    const user = await open()
    await user.type(captureInput(), 'Perfect Blue @kinoplex{Enter}')
    expect(await screen.findByRole('dialog', { name: 'Logar filme' })).toBeTruthy()
    expect(await screen.findAllByText(/Não achei o local/)).not.toHaveLength(0)
    expect(api.logWatch).not.toHaveBeenCalled()
  })

  it('Shift+Enter sempre abre o formulário, mesmo com tudo certo', async () => {
    const user = await open()
    await user.type(captureInput(), 'Perfect Blue{Shift>}{Enter}{/Shift}')
    expect(await screen.findByRole('dialog', { name: 'Logar filme' })).toBeTruthy()
    expect(api.logWatch).not.toHaveBeenCalled()
  })
})

describe('formulário de logar', () => {
  const openForm = async () => {
    const user = await open()
    await user.click(screen.getAllByRole('button', { name: /^Logar filme/ })[0])
    return { user, dialog: await screen.findByRole('dialog', { name: 'Logar filme' }) }
  }

  it('sem escolher o filme não salva e diz o que fazer', async () => {
    const { user, dialog } = await openForm()
    await user.click(within(dialog).getByRole('button', { name: /Salvar/ }))
    expect(await within(dialog).findByText('Escolha o filme na lista de resultados.')).toBeTruthy()
    expect(api.logWatch).not.toHaveBeenCalled()
  })

  it('busca no TMDB enquanto digita, escolhe o resultado e salva', async () => {
    const { user, dialog } = await openForm()
    await user.type(within(dialog).getByLabelText('Filme'), 'perfect')
    await user.click(await within(dialog).findByRole('button', { name: /Perfect Blue/ }))
    await user.click(within(dialog).getByRole('button', { name: /Salvar/ }))
    await waitFor(() => expect(api.logWatch).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Logar filme' })).toBeNull())
  })
})

describe('Diário', () => {
  it('lista as sessões e exclui com confirmação; o aviso desfaz recriando a sessão', async () => {
    window.location.hash = '#diario'
    api.diary.mockResolvedValue({ status: 'ok', entries: [ENTRY('dA', 'Duna', { rating: 5 })] })
    const user = userEvent.setup()
    render(<MemoryRouter><AkaneShell /></MemoryRouter>)
    await screen.findByText('Duna')
    await user.click(screen.getByRole('button', { name: 'Excluir sessão de Duna' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(api.deleteDiary).toHaveBeenCalledWith('dA'))
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.logWatch).toHaveBeenCalledWith('m-dA', expect.objectContaining({ watched_date: '2026-10-02', rating: 5 })))
  })

  it('duas sessões no mesmo dia: "Descer" manda a ordem para o servidor (mais antiga primeiro)', async () => {
    window.location.hash = '#diario'
    api.diary.mockResolvedValue({ status: 'ok', entries: [ENTRY('dA', 'Duna'), ENTRY('dB', 'Her')] })
    const user = userEvent.setup()
    render(<MemoryRouter><AkaneShell /></MemoryRouter>)
    await screen.findByText('Duna')
    await user.click(screen.getByRole('button', { name: 'Descer Duna na ordem do dia' }))
    await waitFor(() => expect(api.reorderDiary).toHaveBeenCalledWith('2026-10-02', ['dA', 'dB']))
  })

  it('uma sessão sozinha no dia não mostra subir/descer', async () => {
    window.location.hash = '#diario'
    api.diary.mockResolvedValue({ status: 'ok', entries: [ENTRY('dA', 'Duna')] })
    render(<MemoryRouter><AkaneShell /></MemoryRouter>)
    await screen.findByText('Duna')
    expect(screen.queryByRole('button', { name: /na ordem do dia/ })).toBeNull()
  })

  it('diário vazio convida a logar', async () => {
    window.location.hash = '#diario'
    render(<MemoryRouter><AkaneShell /></MemoryRouter>)
    expect(await screen.findByText('O diário está vazio')).toBeTruthy()
  })
})

describe('Filmes e Quero ver', () => {
  it('Filmes mostra o catálogo; o hash #quero-ver abre só a watchlist', async () => {
    window.location.hash = '#filmes'
    render(<MemoryRouter><AkaneShell /></MemoryRouter>)
    expect(await screen.findByText('Duna')).toBeTruthy()
    cleanup()
    window.location.hash = '#quero-ver'
    render(<MemoryRouter><AkaneShell /></MemoryRouter>)
    expect(await screen.findByText('Paprika')).toBeTruthy()
    expect(screen.queryByText('Duna')).toBeNull()
  })

  it('abre direto na tela pedida pelo hash', async () => {
    window.location.hash = '#diario'
    render(<MemoryRouter><AkaneShell /></MemoryRouter>)
    expect(await screen.findByRole('heading', { level: 1, name: 'Diário' })).toBeTruthy()
  })
})
