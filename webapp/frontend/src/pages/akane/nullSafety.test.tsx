// @vitest-environment jsdom
// Regressão do crash do detalhe: em produção `movies.tags` é NULL em todos os filmes (e `diary_entries.tags` em boa
// parte das sessões). Estes testes servem os payloads COM esses null, passando pela camada `akaneApi` de verdade
// (só o transporte HTTP é simulado), para garantir que nenhuma tela assume lista onde o servidor manda null.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../design/test-utils'
import { __resetToasts } from '../../design/headless/toast'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn() }))
vi.mock('../../lib/api', () => ({ api: http }))
vi.mock('../komi/komiApi', () => ({ komiApi: { search: vi.fn(async () => ({ matches: [] })), create: vi.fn() } }))

import { AkaneShell } from './AkaneShell'

// ── payloads no formato EXATO que o backend devolve hoje (tags/countries NULL, sessão sem local) ──
const MOVIE = (id: string, title: string, over: object = {}) => ({
  id, tmdb_id: 11, imdb_id: null, letterboxd_uri: 'https://letterboxd.com/film/x/', title, normalizado: title.toLowerCase(), year: 1997,
  director: ['Satoshi Kon'], genres: ['Animação'], runtime: 81, overview: 'Uma ex-idol enfrenta a própria imagem.', poster_url: null,
  backdrop_url: null, poster_palette: 'noir', status: 'watched', rating: 4.5, rating_source: 'letterboxd', liked: false,
  tags: null, notes: null, last_watched_date: '2026-09-30', times_watched: 1, original_language: 'ja', countries: null,
  watchlist_added_at: null, created_at: '2026-01-01T12:00:00-03:00', ...over,
})
const ENTRY = (id: string, title: string, over: object = {}) => ({
  id, movie_id: 'm1', movie_title: title, poster_url: null, poster_palette: 'noir', watched_date: '2026-09-30', rating: 5, rewatch: false,
  review: 'Watched on Wednesday September 30, 2026.', tags: null, companions: [], watch_location: null, ...over,
})
const DETAIL = {
  status: 'ok', movie: MOVIE('m1', 'Perfect Blue'), people: [], vault: [],
  diary: [{ id: 'd1', watched_date: '2026-09-30', rating: 5, rewatch: false, review: null, tags: null, companions: [], watch_location: null }],
}
const HOME = {
  status: 'ok',
  favorites: [{ id: 'm1', title: 'Perfect Blue', poster_url: null, poster_palette: 'noir', position: 0 }],
  recent_activity: [ENTRY('d1', 'Perfect Blue', { liked: false })],
  watchlist_highlight: [{ id: 'm2', title: 'Paprika', year: 2006, poster_url: null, poster_palette: 'x', director: ['Satoshi Kon'], runtime: 90 }],
  rating_histogram: { '5.0': 1 }, sessions_7d: 1, sessions_7d_prev: 0,
  last_session: { title: 'Perfect Blue', rating: 5, watched_date: '2026-09-30' }, counts: { films_watched: 12, diary: 20, watchlist: 3 },
}

const route = (url: string) => {
  if (url.startsWith('/api/movies/watch-locations')) return { status: 'ok', locations: [] }
  if (url.startsWith('/api/movies/diary')) return { status: 'ok', entries: [ENTRY('d1', 'Perfect Blue'), ENTRY('d2', 'Paprika', { movie_id: 'm2' })] }
  if (url.startsWith('/api/movies/watchlist')) return { status: 'ok', movies: [MOVIE('m2', 'Paprika', { status: 'watchlist', rating: null })] }
  if (url.startsWith('/api/movies/home')) return HOME
  if (url.startsWith('/api/movies/heatmap')) return { status: 'ok', year: 2026, days: [] }
  if (url.startsWith('/api/movies/tags')) return { status: 'ok', tags: [] }
  if (url.startsWith('/api/movies/lists')) return { status: 'ok', lists: [] }
  if (url === '/api/movies') return { status: 'ok', movies: [MOVIE('m1', 'Perfect Blue'), MOVIE('m3', 'Duna', { year: 2021, director: ['Denis Villeneuve'], genres: ['Ficção científica'] })] }
  if (url === '/api/movies/m1') return DETAIL
  throw new Error(`rota não simulada: ${url}`)
}

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  Object.values(http).forEach((m) => m.mockReset())
  http.get.mockImplementation(async (url: string) => route(url))
  http.post.mockResolvedValue({ status: 'ok' })
  http.patch.mockResolvedValue({ status: 'ok' })
  window.location.hash = ''
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); document.documentElement.removeAttribute('data-ds-theme') })

const openAt = (hash: string) => {
  window.location.hash = hash
  render(<MemoryRouter><AkaneShell /></MemoryRouter>)
  return userEvent.setup()
}

describe('payloads reais, com null', () => {
  it('o detalhe do filme abre (tags e countries NULL) e mostra a ficha', async () => {
    openAt('#filme/m1')
    expect(await screen.findByRole('heading', { level: 2, name: 'Perfect Blue' })).toBeTruthy()
    expect(screen.getByText('Uma ex-idol enfrenta a própria imagem.')).toBeTruthy()
    expect(screen.queryByText('Algo deu errado nesta tela')).toBeNull()
  })

  it('as sessões do detalhe abrem o editor mesmo sem etiquetas', async () => {
    const user = openAt('#filme/m1')
    await screen.findByRole('heading', { level: 2, name: 'Perfect Blue' })
    await user.click(screen.getByRole('tab', { name: /Sessões/ }))
    await user.click(screen.getByRole('button', { name: /Editar sessão de/ }))
    expect(await screen.findByRole('dialog', { name: /Editar sessão/ })).toBeTruthy()
  })

  it('o Início renderiza (favoritos, atividade recente e Quero ver)', async () => {
    openAt('#inicio')
    expect(await screen.findByText('12 filmes vistos')).toBeTruthy()
    expect(screen.getByText('Paprika')).toBeTruthy()
  })

  it('Filmes: digitar na busca filtra sem estourar (a busca lê as etiquetas)', async () => {
    const user = openAt('#filmes')
    await screen.findByText('Duna')
    await user.type(screen.getByPlaceholderText(/Buscar por título/), 'duna')
    await waitFor(() => expect(screen.queryByText('Perfect Blue')).toBeNull())
    expect(screen.getByText('Duna')).toBeTruthy()
  })

  it('Quero ver: digitar na busca não estoura', async () => {
    const user = openAt('#quero-ver')
    await screen.findByText('Paprika')
    await user.type(screen.getByPlaceholderText(/Buscar no Quero ver/), 'papr')
    expect(screen.getByText('Paprika')).toBeTruthy()
  })

  it('Diário: digitar na busca filtra e o editor de sessão sem etiquetas abre', async () => {
    const user = openAt('#diario')
    await screen.findByText('Paprika')
    await user.type(screen.getByPlaceholderText(/Buscar por filme/), 'paprika')
    await waitFor(() => expect(screen.queryByText('Perfect Blue')).toBeNull())
    await user.click(screen.getByRole('button', { name: 'Editar sessão de Paprika' }))
    expect(await screen.findByRole('dialog', { name: /Editar sessão · Paprika/ })).toBeTruthy()
  })

  it('Etiquetas: sem nenhuma etiqueta mostra o estado vazio', async () => {
    openAt('#etiquetas')
    expect(await screen.findByText('Nenhuma etiqueta ainda')).toBeTruthy()
  })

  it('o aviso "Sessão excluída" desfaz mesmo sem etiquetas (manda tags vazias, não null)', async () => {
    const user = openAt('#diario')
    await screen.findByText('Paprika')
    await user.click(screen.getByRole('button', { name: 'Excluir sessão de Paprika' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }))
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/api/movies/m2/watch', expect.objectContaining({ tags: [] })))
  })
})
