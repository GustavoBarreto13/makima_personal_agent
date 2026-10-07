// @vitest-environment jsdom
// Detalhe do livro, Estantes e Estatísticas da Frieren nova, com a API simulada.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia } from '../../design/test-utils'
import { __resetToasts } from '../../design/headless/toast'
import { normalizeBook } from './lib/normalize'
import type { ApiBook } from './types'

const api = vi.hoisted(() => ({
  list: vi.fn(), shelves: vi.fn(), detail: vi.fn(), history: vi.fn(), favorites: vi.fn(), setFavorites: vi.fn(), bullets: vi.fn(),
  setStatus: vi.fn(), like: vi.fn(), delete: vi.fn(), restore: vi.fn(), updateMetadata: vi.fn(), createShelf: vi.fn(),
  updateShelf: vi.fn(), deleteShelf: vi.fn(), addToShelf: vi.fn(), removeFromShelf: vi.fn(), stats: vi.fn(), deleteSession: vi.fn(),
  restoreSession: vi.fn(), createBullet: vi.fn(), deleteBullet: vi.fn(),
}))
vi.mock('./frierenApi', () => ({ frierenApi: api }))

import { FrierenShell } from './FrierenShell'

const RAW = (id: string, title: string, over: Partial<ApiBook> = {}): ApiBook => ({
  id, title, author: 'Frank Herbert', total_pages: 400, status: 'lendo', cover_url: null, date_started: '2026-09-01', date_finished: null,
  date_abandoned: null, rating: null, genre: 'Ficção científica', isbn: null, published_year: 1965, language: 'en', notes: null,
  store_url: null, price: null, liked: false, created_at: '2026-01-01T12:00:00-03:00', updated_at: null, current_page: 100,
  last_read: '2026-10-06', shelves: ['s1'], ...over,
})
const DUNA = RAW('b1', 'Duna', { notes: 'Especiarias e areia.' })
const BOOKS = [DUNA, RAW('b2', 'O Hobbit', { status: 'lido', shelves: [], date_finished: '2026-09-20' })].map(normalizeBook)
const SHELVES = [{ id: 's1', name: 'Clássicos', description: 'Os de sempre', accent: 'oklch(0.58 0.085 195)', count: 1 }]

const STATS = (year: number) => ({
  status: 'ok',
  period: { year, month: null, label: String(year) },
  previous: null,
  kpis: [
    { key: 'books_finished', label: 'Livros lidos', value: 7, prev: null, decimals: 0 },
    { key: 'pages', label: 'Páginas', value: 2300, prev: null, decimals: 0 },
  ],
  daily: [{ date: `${year}-03-01`, value: 40 }],
  monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, value: i === 2 ? 40 : 0 })),
  monthlyUnit: 'páginas',
  distribution: [{ bucket: '4.5', count: 1 }],
  rankings: { genres: { title: 'Gêneros', items: [{ label: 'Fantasia', count: 3 }] } },
  records: [{ label: 'Maior sequência', value: '5 dias' }],
  moments: [{ id: 'b2', title: 'O Hobbit', subtitle: 'Tolkien', image: null, rating: 4.5 }],
  first_year: 2024,
})

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  api.list.mockResolvedValue(BOOKS)
  api.shelves.mockResolvedValue(SHELVES)
  api.detail.mockResolvedValue({ ...DUNA, description: 'Um planeta deserto.' })
  api.history.mockResolvedValue([{ id: 'l1', date: '2026-10-06', page_start: 80, page_end: 100, pages_read: 20, session_notes: 'Fremen' }])
  api.favorites.mockResolvedValue([])
  api.bullets.mockResolvedValue([{ id: 'm1', book_id: 'b1', content: 'O medo mata a mente', color: 'amarelo', page_number: 12, position: 0, created_at: '' }])
  for (const k of ['setStatus', 'like', 'delete', 'restore', 'updateMetadata', 'setFavorites', 'deleteShelf', 'addToShelf', 'removeFromShelf', 'deleteSession', 'restoreSession', 'deleteBullet'] as const) {
    api[k].mockResolvedValue({ status: 'ok' })
  }
  api.createShelf.mockResolvedValue({ status: 'ok', id: 's-new' })
  api.createBullet.mockResolvedValue({ status: 'ok' })
  api.stats.mockImplementation(async (year: number) => STATS(year))
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); window.location.hash = '' })

const openAt = async (hash: string, ready: string | RegExp) => {
  window.location.hash = hash
  const user = userEvent.setup()
  render(<MemoryRouter><FrierenShell /></MemoryRouter>)
  await screen.findAllByText(ready)
  return user
}

describe('detalhe do livro', () => {
  it('cabeçalho, sinopse, resenha, ficha e estante', async () => {
    await openAt('#livro/b1', 'Um planeta deserto.')
    expect(screen.getByRole('heading', { name: 'Duna' })).toBeTruthy()
    expect(screen.getByText('Especiarias e areia.')).toBeTruthy()
    expect(screen.getByText('Comecei em')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clássicos' })).toBeTruthy()
  })

  it('trocar a situação para "Abandonado" com Desfazer', async () => {
    const user = await openAt('#livro/b1', 'Um planeta deserto.')
    await user.click(screen.getByRole('button', { name: 'Lendo' }))
    await user.click(within(screen.getByRole('menu', { name: 'Mudar a situação' })).getByRole('menuitem', { name: 'Abandonado' }))
    await waitFor(() => expect(api.setStatus).toHaveBeenCalledWith('b1', 'abandonado'))
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.setStatus).toHaveBeenLastCalledWith('b1', 'lendo'))
  })

  it('curtir e pôr na vitrine', async () => {
    const user = await openAt('#livro/b1', 'Um planeta deserto.')
    await user.click(screen.getByRole('button', { name: 'Curti' }))
    await waitFor(() => expect(api.like).toHaveBeenCalledWith('b1', true))
    await user.click(screen.getByRole('button', { name: 'Mais ações do livro' }))
    await user.click(screen.getByRole('menuitem', { name: 'Pôr na vitrine de favoritos' }))
    await waitFor(() => expect(api.setFavorites).toHaveBeenCalledWith(['b1']))
  })

  it('excluir pede confirmação, volta à Biblioteca e o Desfazer restaura', async () => {
    const user = await openAt('#livro/b1', 'Um planeta deserto.')
    await user.click(screen.getByRole('button', { name: 'Mais ações do livro' }))
    await user.click(screen.getByRole('menuitem', { name: 'Excluir livro' }))
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('b1'))
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.restore).toHaveBeenCalledWith('b1'))
  })

  it('resenha: editar na página e apagar (texto vazio vira clear)', async () => {
    const user = await openAt('#livro/b1', 'Um planeta deserto.')
    await user.click(screen.getByRole('button', { name: 'Editar resenha' }))
    const box = screen.getByRole('textbox', { name: 'Resenha' })
    await user.clear(box)
    await user.click(screen.getByRole('button', { name: /^Salvar resenha/ }))
    await waitFor(() => expect(api.updateMetadata).toHaveBeenCalledWith('b1', { clear: ['notes'] }))
  })

  it('abas Diário e Marcações', async () => {
    const user = await openAt('#livro/b1', 'Um planeta deserto.')
    await user.click(screen.getByRole('tab', { name: /Diário/ }))
    expect(await screen.findByText('Fremen')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Marcações' }))
    expect(await screen.findByText('O medo mata a mente')).toBeTruthy()
    expect(screen.getByText('p. 12')).toBeTruthy()
  })

  it('livro que não abre mostra erro com voltar', async () => {
    api.detail.mockRejectedValue(new Error('404'))
    await openAt('#livro/xx', 'Não foi possível abrir o livro')
    expect(screen.getByRole('button', { name: 'Voltar para a Biblioteca' })).toBeTruthy()
  })
})

describe('estantes', () => {
  it('grade com a estante e seus livros; abrir mostra os livros', async () => {
    const user = await openAt('#estantes', 'Clássicos')
    expect(screen.getByText('1 livro')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Abrir a estante Clássicos' }))
    expect(await screen.findByRole('heading', { name: 'Clássicos' })).toBeTruthy()
    expect(screen.getByText('Duna')).toBeTruthy()
  })

  it('tirar um livro pede confirmação e tem Desfazer', async () => {
    const user = await openAt('#estante/s1', 'Duna')
    await user.click(screen.getByRole('button', { name: 'Tirar Duna da estante' }))
    await user.click(await screen.findByRole('button', { name: 'Tirar' }))
    await waitFor(() => expect(api.removeFromShelf).toHaveBeenCalledWith('s1', 'b1'))
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.addToShelf).toHaveBeenCalledWith('s1', 'b1'))
  })

  it('criar estante com nome obrigatório e a cor escolhida', async () => {
    const user = await openAt('#estantes', 'Clássicos')
    await user.click(screen.getByRole('button', { name: 'Nova estante' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova estante' })
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(within(dialog).getByText('Dê um nome à estante.')).toBeTruthy()
    await user.type(within(dialog).getByLabelText('Nome'), 'Releituras')
    await user.click(within(dialog).getByRole('radio', { name: 'Roxo' }))
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(api.createShelf).toHaveBeenCalledWith({ name: 'Releituras', description: '', accent: '300' }))
  })
})

describe('estatísticas', () => {
  it('a meta anual entra como número e o resumo usa os KPIs', async () => {
    await openAt('#estatisticas', 'Seu ano em leitura')
    expect(screen.getByText('Meta do ano')).toBeTruthy()
    expect(screen.getByText(/7 livros lidos/)).toBeTruthy()
    expect(screen.getByText('Maior sequência')).toBeTruthy()
  })

  it('o seletor de ano refaz a consulta', async () => {
    const user = await openAt('#estatisticas', 'Seu ano em leitura')
    const year = Number(new Date().getFullYear())
    await user.click(screen.getByRole('button', { name: /anterior/i }))
    await waitFor(() => expect(api.stats).toHaveBeenLastCalledWith(year - 1))
  })

  it('erro mostra "Tentar de novo"', async () => {
    api.stats.mockRejectedValue(new Error('x'))
    await openAt('#estatisticas', 'Tentar de novo')
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  })
})
