// @vitest-environment jsdom
// Robustez: o banco da Frieren tem MUITO campo vazio (livros adicionados só pelo título não têm autor, páginas,
// gênero, capa; estantes antigas têm cor no formato velho). Estes testes servem payloads cheios de null passando
// pela camada `frierenApi` de verdade (só o transporte HTTP é simulado) e abrem cada tela: nenhuma pode cair na
// rede de segurança ("Algo deu errado nesta tela").

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { mockLayoutApis, mockMatchMedia } from '../../design/test-utils'
import { __resetToasts } from '../../design/headless/toast'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn() }))
vi.mock('../../lib/api', () => ({ api: http }))

import { FrierenShell } from './FrierenShell'

// Livro "pelado": só id, título e status — tudo o mais null (o formato exato da listagem).
const BARE = (id: string, title: string, status: string, over: object = {}) => ({
  id, title, author: null, total_pages: null, status, cover_url: null, date_started: null, date_finished: null,
  date_abandoned: null, rating: null, genre: null, isbn: null, published_year: null, language: null, notes: null,
  store_url: null, price: null, liked: null, created_at: null, updated_at: null, current_page: null, last_read: null,
  shelves: null, ...over,
})
const BOOKS = [
  BARE('b1', 'Sem nada', 'lendo'),
  BARE('b2', 'Lido sem dados', 'lido', { date_finished: '2026-05-01', notes: 'curta' }),
  BARE('b3', 'Status estranho', 'emprestado'),
  BARE('b4', 'Na wishlist', 'wishlist'),
]

const route = (url: string) => {
  if (url === '/api/books') return { status: 'ok', books: BOOKS }
  if (url === '/api/books/shelves') return { status: 'ok', shelves: [{ id: 's1', name: null, description: null, accent: 'oklch(0.62 0.02 240)', book_count: null }] }
  if (url === '/api/books/home') {
    return {
      status: 'ok', favorites: [], reading: [{ id: 'b1', title: 'Sem nada', author: null, cover_url: null, total_pages: null, date_started: null, current_page: 0, last_read: null }],
      recent_finished: [], rating_histogram: {}, pages_7d: 0, pages_7d_prev: 0, pages_30d: 0, spark: [], streak: { best: 0, current: 0 },
      finished_year: 0, last_session: null, counts: { lendo: 1, lido: 1, wishlist: 1 },
    }
  }
  if (url.startsWith('/api/books/activity')) {
    return { status: 'ok', activity: [{ id: 'l1', date: '2026-10-01', book_id: 'b1', title: null, author: null, pages: null, page: null, note: null, rating: null, type: null }] }
  }
  if (url.startsWith('/api/books/heatmap')) return { status: 'ok', heatmap: null }
  if (url.startsWith('/api/books/stats/payload')) {
    return {
      status: 'ok', period: { year: 2026, month: null, label: '2026' }, previous: null, kpis: [], daily: [], monthly: [], monthlyUnit: 'páginas',
      distribution: [], rankings: {}, records: [], moments: [], first_year: 2026,
    }
  }
  if (url === '/api/books/favorites') return { status: 'ok', favorites: null }
  if (url === '/api/books/b1') return { status: 'ok', book: { ...BARE('b1', 'Sem nada', 'lendo'), description: null } }
  if (url === '/api/books/b1/history') return { status: 'ok', logs: null }
  if (url === '/api/books/b1/bullets') return { status: 'ok', bullets: null }
  throw new Error(`rota não simulada: ${url}`)
}

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  Object.values(http).forEach((m) => m.mockReset())
  http.get.mockImplementation(async (url: string) => route(url))
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); window.location.hash = '' })

const SCREENS: [string, string | RegExp][] = [
  ['', 'Biblioteca de Frieren'],
  ['#biblioteca', 'Status estranho'],
  ['#quero-ler', /na pilha/],
  ['#wishlist', 'Na wishlist'],
  ['#diario', /sessão/],
  ['#estantes', 'Estante'],
  ['#resenhas', 'curta'],
  ['#estatisticas', 'Seu ano em leitura'],
  ['#livro/b1', 'Sem nada'],
]

describe('dados vazios não derrubam nenhuma tela', () => {
  it.each(SCREENS)('%s abre sem erro', async (hash, ready) => {
    window.location.hash = hash
    render(<MemoryRouter><FrierenShell /></MemoryRouter>)
    expect((await screen.findAllByText(ready)).length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.queryByText('Algo deu errado nesta tela')).toBeNull())
  })
})
