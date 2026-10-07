// @vitest-environment jsdom
// A Frieren nova de ponta a ponta no jsdom: o shell de verdade, com a API simulada.
// Cobre o que mais importa no uso: Início (blocos, metas, primeiro uso, erro), registrar leitura pela linha
// rápida (e desfazer), Biblioteca com os 7 status, Wishlist (link da loja) e Diário (excluir com desfazer).

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../design/test-utils'
import { __resetToasts } from '../../design/headless/toast'
import { normalizeBook, normalizeSession } from './lib/normalize'
import type { ApiBook } from './types'

const api = vi.hoisted(() => ({
  list: vi.fn(), shelves: vi.fn(), home: vi.fn(), sessions: vi.fn(), heatmap: vi.fn(), log: vi.fn(), finish: vi.fn(),
  deleteSession: vi.fn(), restoreSession: vi.fn(), setStatus: vi.fn(), updateMetadata: vi.fn(), setFavorites: vi.fn(),
  add: vi.fn(), searchGoogle: vi.fn(), updateSession: vi.fn(), stats: vi.fn(), favorites: vi.fn(),
}))
vi.mock('./frierenApi', () => ({ frierenApi: api }))

import { FrierenShell, legacyPrefs } from './FrierenShell'
import { DEFAULT_PREFS } from './context'

const RAW = (id: string, title: string, over: Partial<ApiBook> = {}): ApiBook => ({
  id, title, author: 'Frank Herbert', total_pages: 400, status: 'lendo', cover_url: null, date_started: '2026-09-01', date_finished: null,
  date_abandoned: null, rating: null, genre: 'Ficção científica', isbn: null, published_year: 1965, language: 'en', notes: null,
  store_url: null, price: null, liked: false, created_at: '2026-01-01T12:00:00-03:00', updated_at: null, current_page: 100,
  last_read: '2026-10-06', shelves: [], ...over,
})
const BOOKS = [
  RAW('b1', 'Duna'),
  RAW('b2', 'O Hobbit', { status: 'lido', current_page: 300, total_pages: 300, date_finished: '2026-09-20', rating: 4.5, author: 'Tolkien', created_at: '2026-09-25T12:00:00-03:00' }),
  RAW('b3', 'Livro chato', { status: 'abandonado', current_page: 40, date_abandoned: '2026-04-02', author: 'Fulano' }),
  RAW('b4', 'Wish', { status: 'wishlist', current_page: null, store_url: 'https://amazon.com.br/x', author: 'Beltrano' }),
  RAW('b5', 'Pilha', { status: 'estante', current_page: null, author: 'Sicrano' }),
].map(normalizeBook)

const HOME = {
  status: 'ok',
  favorites: [{ id: 'b2', title: 'O Hobbit', author: 'Tolkien', cover_url: null, position: 0 }],
  reading: [{ id: 'b1', title: 'Duna', author: 'Frank Herbert', cover_url: null, total_pages: 400, date_started: '2026-09-01', current_page: 100, last_read: '2026-10-06' }],
  recent_finished: [{ id: 'b2', title: 'O Hobbit', author: 'Tolkien', cover_url: null, rating: 4.5, liked: true, date_finished: '2026-09-20', has_review: true }],
  rating_histogram: { '4.5': 1 },
  pages_7d: 120, pages_7d_prev: 60, pages_30d: 300,
  spark: Array.from({ length: 21 }, (_, i) => ({ date: `2026-09-${String(i + 10).padStart(2, '0')}`, value: i % 3 ? 10 : 0 })),
  streak: { best: 9, current: 3 },
  finished_year: 4,
  last_session: { book_id: 'b1', title: 'Duna', date: '2026-10-06', page_end: 100, pages_read: 20 },
  counts: { lendo: 1, lido: 1, abandonado: 1, wishlist: 1, estante: 1 },
}
const SESSIONS = [
  { id: 'l2', date: '2026-10-06', book_id: 'b1', title: 'Duna', author: 'Frank Herbert', pages: 20, page: 100, note: 'Fremen!', rating: null, type: 'progress' },
  { id: 'l1', date: '2026-09-01', book_id: 'b1', title: 'Duna', author: 'Frank Herbert', pages: 80, page: 80, note: null, rating: null, type: 'started' },
].map(normalizeSession)

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  api.list.mockResolvedValue(BOOKS)
  api.shelves.mockResolvedValue([])
  api.home.mockResolvedValue(HOME)
  api.sessions.mockResolvedValue(SESSIONS)
  api.heatmap.mockResolvedValue([{ date: '2026-10-06', pages: 20 }])
  api.log.mockResolvedValue({ status: 'ok', log_id: 'log-new' })
  api.finish.mockResolvedValue({ status: 'ok' })
  api.deleteSession.mockResolvedValue({ status: 'ok' })
  api.restoreSession.mockResolvedValue({ status: 'ok' })
  api.setStatus.mockResolvedValue({ status: 'ok' })
  api.updateMetadata.mockResolvedValue({ status: 'ok' })
  api.add.mockResolvedValue({ status: 'ok' })
  api.searchGoogle.mockResolvedValue([])
  window.location.hash = ''
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); document.documentElement.removeAttribute('data-ds-theme') })

const open = async (hash = '') => {
  window.location.hash = hash
  const user = userEvent.setup()
  render(<MemoryRouter><FrierenShell /></MemoryRouter>)
  return user
}
const openHome = async () => {
  const user = await open()
  await screen.findByText('Biblioteca de Frieren')
  return user
}
const captureInput = () => screen.getByLabelText('Registrar leitura em uma linha')

describe('Início', () => {
  it('hero: saudação, livro atual, citação e os botões', async () => {
    await openHome()
    expect(screen.getByRole('heading', { level: 2, name: /^(Bom dia|Boa tarde|Boa noite|Boa madrugada)\.$/ })).toBeTruthy()
    expect(screen.getByText(/No meio de/)).toBeTruthy()
    expect(screen.getByText(/neles a gente nunca esquece/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continuar Duna' })).toBeTruthy()
  })

  it('cartões: livros do ano contra a meta (24), páginas da semana, ritmo de 30 dias e sequência', async () => {
    await openHome()
    expect(screen.getByText((_, el) => el?.classList.contains('fr-stat-f') === true && el.textContent === 'Meta de 24: faltam 20')).toBeTruthy()
    expect(screen.getByText('100%')).toBeTruthy()               // 120 páginas contra 60 na semana anterior
    expect(screen.getByText('10,0')).toBeTruthy()               // 300 páginas / 30 dias
    expect(screen.getByText(/17 min de leitura/)).toBeTruthy()  // 10 / 0,6
    expect(screen.getByText(/Recorde:/)).toBeTruthy()
  })

  it('a meta anual vem da preferência', async () => {
    localStorage.setItem('ds:prefs:frieren', JSON.stringify({ ...DEFAULT_PREFS, yearlyGoal: 10 }))
    await openHome()
    // O rodapé inteiro do cartão: "Meta de 10: faltam 6" (10 − 4 lidos no ano).
    expect(screen.getByText((_, el) => el?.classList.contains('fr-stat-f') === true && el.textContent === 'Meta de 10: faltam 6')).toBeTruthy()
  })

  it('blocos no modelo da Akane: favoritos, lidos recentemente, painel Diário/Notas, lendo agora e o mapa do ano', async () => {
    await openHome()
    expect(screen.getByText('Livros favoritos')).toBeTruthy()
    expect(screen.getByText('Lidos recentemente')).toBeTruthy()
    const panel = screen.getByRole('complementary', { name: 'Diário e notas' })
    expect(within(panel).getAllByText('Duna').length).toBeGreaterThan(0)
    expect(screen.getByText('Lendo agora')).toBeTruthy()
    expect(screen.getByText(/p\. 100 de 400 · 25%/)).toBeTruthy()
    expect(screen.getByRole('img', { name: /Páginas lidas por dia em \d{4}/ })).toBeTruthy()
    expect(document.querySelectorAll('.ds-cover-poster').length).toBeGreaterThanOrEqual(3)
  })

  it('primeiro uso: convida a adicionar o primeiro livro', async () => {
    api.home.mockResolvedValue({ ...HOME, counts: {} })
    await open()
    expect(await screen.findByText('Sua biblioteca começa aqui')).toBeTruthy()
  })

  it('erro ao carregar mostra o estado de erro com "Tentar de novo"', async () => {
    api.home.mockRejectedValue(new Error('offline'))
    await open()
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  })

  it('topo "Editorial" (vindo das preferências do shell antigo) esconde a citação', async () => {
    localStorage.setItem('fr-tweaks', JSON.stringify({ densidade: 'Compacto', layoutInicio: 'Editorial' }))
    await openHome()
    expect(screen.queryByText(/neles a gente nunca esquece/)).toBeNull()
  })
})

describe('preferências do shell antigo', () => {
  it('densidade e topo do Início são aproveitados; lixo é ignorado', () => {
    const store = (v: string | null) => ({ getItem: () => v })
    expect(legacyPrefs(DEFAULT_PREFS, store(JSON.stringify({ densidade: 'Grande', layoutInicio: 'Galeria' })))).toMatchObject({ density: 'large', heroLayout: 'gallery' })
    expect(legacyPrefs(DEFAULT_PREFS, store('{quebrado'))).toEqual(DEFAULT_PREFS)
    expect(legacyPrefs(DEFAULT_PREFS, store(null))).toEqual(DEFAULT_PREFS)
  })
})

describe('linha rápida', () => {
  it('"Duna p. 240" registra direto; o Desfazer apaga a sessão', async () => {
    const user = await openHome()
    await user.type(captureInput(), 'Duna p. 240{Enter}')
    await waitFor(() => expect(api.log).toHaveBeenCalledTimes(1))
    expect(api.log.mock.calls[0][0]).toBe('b1')
    expect(api.log.mock.calls[0][1]).toMatchObject({ current_page: 240 })
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.deleteSession).toHaveBeenCalledWith('b1', 'log-new'))
  })

  it('página que não avança abre o formulário em vez de salvar', async () => {
    const user = await openHome()
    await user.type(captureInput(), 'Duna p. 50{Enter}')
    expect(await screen.findByRole('dialog', { name: 'Registrar leitura' })).toBeTruthy()
    expect(api.log).not.toHaveBeenCalled()
  })

  it('livro que não está na biblioteca oferece adicionar', async () => {
    const user = await openHome()
    await user.type(captureInput(), 'Neuromancer p. 30{Enter}')
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar livro' })
    expect((within(dialog).getByLabelText('Título, autor ou ISBN') as HTMLInputElement).value).toBe('Neuromancer')
    expect(api.log).not.toHaveBeenCalled()
  })

  it('Shift+Enter sempre abre o formulário, já com o livro escolhido', async () => {
    const user = await openHome()
    await user.type(captureInput(), 'Duna p. 240{Shift>}{Enter}{/Shift}')
    const dialog = await screen.findByRole('dialog', { name: 'Registrar leitura' })
    expect(within(dialog).getByRole('option', { selected: true })).toBeTruthy()
    expect(api.log).not.toHaveBeenCalled()
  })
})

describe('formulário de registrar leitura', () => {
  it('+25 soma à página atual e salva só a sessão (sem concluir)', async () => {
    const user = await openHome()
    await user.click(screen.getAllByRole('button', { name: 'Registrar leitura' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Registrar leitura' })
    await user.click(within(dialog).getByRole('button', { name: '+25' }))
    expect((within(dialog).getByLabelText('Você parou na página…') as HTMLInputElement).value).toBe('125')
    await user.click(within(dialog).getByRole('button', { name: /^Salvar/ }))
    await waitFor(() => expect(api.log).toHaveBeenCalled())
    expect(api.log.mock.calls[0][1]).toMatchObject({ current_page: 125 })
    expect(api.finish).not.toHaveBeenCalled()
  })

  it('"terminei" leva a página ao total e, com nota de meia estrela, conclui o livro', async () => {
    const user = await openHome()
    await user.click(screen.getAllByRole('button', { name: 'Registrar leitura' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Registrar leitura' })
    await user.click(within(dialog).getByRole('button', { name: 'terminei' }))
    expect((within(dialog).getByLabelText('Você parou na página…') as HTMLInputElement).value).toBe('400')
    await user.click(within(dialog).getByRole('button', { name: /^Salvar/ }))
    await waitFor(() => expect(api.finish).toHaveBeenCalled())
    expect(api.log.mock.calls[0][1]).toMatchObject({ current_page: 400 })
    expect(api.finish.mock.calls[0][0]).toBe('b1')
  })
})

describe('Biblioteca', () => {
  it('agrupa pelos 7 status na ordem natural; abandonado não vira "Lido"', async () => {
    await open('#biblioteca')
    await screen.findByText('Livro chato')
    // Cabeçalhos dos grupos, na ordem da tela. O mais recente adicionado é um lido (O Hobbit), mas "Lendo" vem antes.
    const heads = [...document.querySelectorAll('.ds-grp-h h3')].map((el) => el.textContent)
    expect(heads).toEqual(['Lendo', 'Na estante', 'Wishlist', 'Lido', 'Abandonado'])
  })

  it('busca do topo leva para a Biblioteca já filtrada', async () => {
    const user = await openHome()
    const search = screen.getByPlaceholderText('Buscar livro…')
    await user.type(search, 'hobbit{Enter}')
    expect(await screen.findByText('O Hobbit')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Livro chato')).toBeNull())
  })
})

describe('Wishlist', () => {
  it('apagar o link da loja apaga de verdade (clear), não deixa o antigo no banco', async () => {
    const user = await open('#wishlist')
    await screen.findByText('amazon.com.br')
    await user.click(screen.getByRole('button', { name: 'Editar link de Wish' }))
    const input = screen.getByLabelText('Link da loja de Wish')
    await user.clear(input)
    await user.type(input, '{Enter}')
    await waitFor(() => expect(api.updateMetadata).toHaveBeenCalledWith('b4', { clear: ['store_url'] }))
  })
})

describe('Diário', () => {
  it('excluir pede confirmação e o Desfazer regrava a sessão igual', async () => {
    const user = await open('#diario')
    await screen.findByText('“Fremen!”')
    await user.click(screen.getAllByRole('button', { name: 'Excluir sessão de Duna' })[0])
    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(api.deleteSession).toHaveBeenCalledWith('b1', 'l2'))
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.restoreSession).toHaveBeenCalledWith('b1', {
      id: 'l2', date: '2026-10-06', page_start: 80, page_end: 100, pages_read: 20, session_notes: 'Fremen!',
    }))
  })
})
