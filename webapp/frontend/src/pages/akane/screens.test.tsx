// @vitest-environment jsdom
// As telas da segunda metade da Akane nova no jsdom, com a API simulada: detalhe do filme (ações, sessões, notas,
// Cofre), listas, etiquetas e estatísticas.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { todayISO } from '../../design/core/format'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../design/test-utils'
import { __resetToasts } from '../../design/headless/toast'

const api = vi.hoisted(() => ({
  home: vi.fn(), heatmap: vi.fn(), watchLocations: vi.fn(), tmdbSearch: vi.fn(), add: vi.fn(), logWatch: vi.fn(), like: vi.fn(),
  deleteDiary: vi.fn(), delete: vi.fn(), list: vi.fn(), watchlist: vi.fn(), diary: vi.fn(), detail: vi.fn(), updateStatus: vi.fn(),
  setNotes: vi.fn(), refreshMetadata: vi.fn(), updateCatalog: vi.fn(), lists: vi.fn(), listDetail: vi.fn(), createList: vi.fn(),
  updateList: vi.fn(), deleteList: vi.fn(), addToList: vi.fn(), removeFromList: vi.fn(), tags: vi.fn(), statsPayload: vi.fn(),
  addVault: vi.fn(), deleteVault: vi.fn(), updateDiaryEntry: vi.fn(), createWatchLocation: vi.fn(),
}))
vi.mock('./akaneApi', () => ({ akaneApi: api }))
vi.mock('../komi/komiApi', () => ({ komiApi: { search: vi.fn(async () => ({ matches: [] })), create: vi.fn() } }))

import { AkaneShell } from './AkaneShell'

const MOVIE = (id: string, title: string, over: object = {}) => ({
  id, tmdb_id: 11, imdb_id: null, letterboxd_uri: null, title, year: 1997, director: ['Satoshi Kon'], genres: ['Animação', 'Mistério'], runtime: 81,
  overview: 'Uma ex-idol enfrenta a própria imagem.', poster_url: null, backdrop_url: null, poster_palette: 'noir', status: 'watched', rating: 4.5,
  rating_source: 'own', liked: false, tags: ['anime'], notes: null, last_watched_date: '2026-10-02', times_watched: 1, original_language: 'ja',
  countries: ['JP'], watchlist_added_at: null, created_at: '2026-01-01T12:00:00-03:00', ...over,
})
const DETAIL = {
  status: 'ok',
  movie: MOVIE('m1', 'Perfect Blue'),
  people: [{ id: 'p1', name: 'Satoshi Kon', role: 'Direção' }],
  vault: [{ id: 'v1', type: 'video', title: 'Análise da cena do espelho', url: 'https://www.youtube.com/watch?v=x', source: 'youtube.com' }],
  diary: [{ id: 'dd1', watched_date: '2026-10-02', rating: 5, rewatch: false, review: 'Obra-prima', tags: [], companions: [], watch_location: { id: 'l1', name: 'Cinemark', kind: 'cinema' } }],
}
const LISTS = [{ id: 'l1', name: 'Cinema japonês', description: 'Do anime ao drama', accent: null, ranked: false, count: 2, created_at: '2026-09-01T12:00:00-03:00' }]
const LIST_DETAIL = {
  status: 'ok',
  list: { id: 'l1', name: 'Cinema japonês', description: 'Do anime ao drama', accent: null, ranked: false },
  films: [
    { id: 'm1', title: 'Perfect Blue', year: 1997, poster_url: null, poster_palette: 'noir', rating: 4.5, liked: true, position: 1 },
    { id: 'm2', title: 'Paprika', year: 2006, poster_url: null, poster_palette: 'noir', rating: null, liked: false, position: 2 },
  ],
}
const STATS = (year: number) => ({
  status: 'ok', first_year: 2024, period: { year, month: null, label: String(year) }, previous: { label: String(year - 1) },
  kpis: [
    { key: 'films', label: 'Filmes', value: 12, prev: 8, decimals: 0 }, { key: 'sessions', label: 'Sessões', value: 15, prev: 9, decimals: 0 },
    { key: 'hours', label: 'Horas', value: 20, prev: 10, unit: 'h', decimals: 0 }, { key: 'avg_rating', label: 'Nota média', value: 4.1, prev: 3.9, unit: '/5', decimals: 1, absoluteDelta: true },
  ],
  daily: [], monthly: [], monthlyUnit: 'sessões', distribution: [], records: [],
  rankings: { genres: { title: 'Gêneros', items: [{ label: 'Animação', count: 5 }] } },
  moments: [{ id: 'm1', title: 'Perfect Blue', subtitle: '1997', image: null, rating: 5 }],
})

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  api.watchLocations.mockResolvedValue({ status: 'ok', locations: [] })
  api.detail.mockResolvedValue(DETAIL)
  api.like.mockResolvedValue({ status: 'ok' })
  api.updateStatus.mockResolvedValue({ status: 'ok' })
  api.setNotes.mockResolvedValue({ status: 'ok' })
  api.logWatch.mockResolvedValue({ status: 'ok', diary_id: 'd-new' })
  api.deleteDiary.mockResolvedValue({ status: 'ok' })
  api.delete.mockResolvedValue({ status: 'ok' })
  api.addVault.mockResolvedValue({ status: 'ok' })
  api.deleteVault.mockResolvedValue({ status: 'ok' })
  api.lists.mockResolvedValue({ status: 'ok', lists: LISTS })
  api.listDetail.mockResolvedValue(LIST_DETAIL)
  api.createList.mockResolvedValue({ status: 'ok', id: 'l-new' })
  api.updateList.mockResolvedValue({ status: 'ok' })
  api.deleteList.mockResolvedValue({ status: 'ok' })
  api.addToList.mockResolvedValue({ status: 'ok' })
  api.removeFromList.mockResolvedValue({ status: 'ok' })
  api.tags.mockResolvedValue({ status: 'ok', tags: [{ name: 'anime', count: 2, person: false }, { name: 'Ana', count: 1, person: true }] })
  api.list.mockResolvedValue({ status: 'ok', movies: [MOVIE('m1', 'Perfect Blue'), MOVIE('m3', 'Duna', { tags: ['ficção'] })] })
  api.statsPayload.mockImplementation(async (year: number) => STATS(year))
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); document.documentElement.removeAttribute('data-ds-theme') })

const openAt = async (hash: string, ready: string | RegExp) => {
  window.location.hash = hash
  const user = userEvent.setup()
  render(<MemoryRouter><AkaneShell /></MemoryRouter>)
  await screen.findAllByText(ready)
  return user
}
const detail = () => openAt('#filme/m1', 'Uma ex-idol enfrenta a própria imagem.')

describe('detalhe do filme', () => {
  it('mostra a ficha: sinopse, direção, duração, idioma e país em português', async () => {
    await detail()
    expect(screen.getByRole('heading', { level: 2, name: 'Perfect Blue' })).toBeTruthy()
    expect(screen.getByText('1h 21min')).toBeTruthy()
    expect(screen.getByText('japonês')).toBeTruthy()
    expect(screen.getByText('Japão')).toBeTruthy()
  })

  it('"Logar sessão" abre o formulário com o filme já escolhido e salva sem recriá-lo', async () => {
    const user = await detail()
    await user.click(screen.getByRole('button', { name: 'Logar sessão' }))
    const dialog = await screen.findByRole('dialog', { name: 'Logar filme' })
    expect(within(dialog).getByText(/já no catálogo/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: /Salvar/ }))
    await waitFor(() => expect(api.logWatch).toHaveBeenCalledTimes(1))
    expect(api.add).not.toHaveBeenCalled()
    expect(api.logWatch.mock.calls[0][0]).toBe('m1')
  })

  it('"Curti" liga o coração', async () => {
    const user = await detail()
    await user.click(screen.getByRole('button', { name: 'Curti' }))
    await waitFor(() => expect(api.like).toHaveBeenCalledWith('m1', true))
  })

  it('"Voltar ao Quero ver" muda a situação e o aviso desfaz', async () => {
    const user = await detail()
    await user.click(screen.getByRole('button', { name: 'Voltar ao Quero ver' }))
    await waitFor(() => expect(api.updateStatus).toHaveBeenCalledWith('m1', 'watchlist'))
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.updateStatus).toHaveBeenLastCalledWith('m1', 'watched'))
  })

  it('anotações só podem ser salvas depois de mudar', async () => {
    const user = await detail()
    await user.click(screen.getByRole('tab', { name: 'Notas' }))
    const save = screen.getByRole('button', { name: 'Salvar anotações' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    await user.type(screen.getByLabelText('Anotações sobre o filme'), 'Rever com calma')
    expect(save.disabled).toBe(false)
    await user.click(save)
    await waitFor(() => expect(api.setNotes).toHaveBeenCalledWith('m1', 'Rever com calma'))
  })

  it('sessões: excluir pede confirmação e o Desfazer recria a sessão do mesmo filme', async () => {
    const user = await detail()
    await user.click(screen.getByRole('tab', { name: /Sessões/ }))
    await user.click(screen.getByRole('button', { name: /Excluir sessão de/ }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(api.deleteDiary).toHaveBeenCalledWith('dd1'))
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.logWatch).toHaveBeenCalledWith('m1', expect.objectContaining({ watched_date: '2026-10-02', rating: 5, watch_location_id: 'l1' })))
  })

  it('Cofre: título é obrigatório, link precisa ser http(s) e o item guardado vai com o domínio', async () => {
    const user = await detail()
    await user.click(screen.getByRole('tab', { name: /Cofre/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar conteúdo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Guardar no Cofre' })
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    expect(await within(dialog).findByText('Dê um título ao conteúdo.')).toBeTruthy()
    await user.type(within(dialog).getByLabelText('Título'), 'Ensaio sobre identidade')
    await user.type(within(dialog).getByLabelText('Link (opcional)'), 'youtube.com/x')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    expect(await within(dialog).findByText('O link precisa começar com http:// ou https://.')).toBeTruthy()
    await user.clear(within(dialog).getByLabelText('Link (opcional)'))
    await user.type(within(dialog).getByLabelText('Link (opcional)'), 'https://www.youtube.com/x')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(api.addVault).toHaveBeenCalledWith('m1', { type: 'video', title: 'Ensaio sobre identidade', url: 'https://www.youtube.com/x', source: 'youtube.com' }))
  })

  it('"Adicionar à lista" coloca o filme na lista escolhida', async () => {
    const user = await detail()
    await user.click(screen.getByRole('button', { name: 'Adicionar à lista' }))
    await user.click(await screen.findByRole('button', { name: /Cinema japonês/ }))
    await waitFor(() => expect(api.addToList).toHaveBeenCalledWith('l1', 'm1'))
  })

  it('excluir o filme avisa que não dá para desfazer, e volta para Filmes', async () => {
    const user = await detail()
    await user.click(screen.getByRole('button', { name: 'Mais ações do filme' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Excluir filme' }))
    const confirmDialog = await screen.findByRole('alertdialog')
    expect(within(confirmDialog).getByText(/Não dá para desfazer/)).toBeTruthy()
    await user.click(within(confirmDialog).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('m1'))
    await waitFor(() => expect(window.location.hash).toBe('#filmes'))
  })

  it('filme que não abre mostra o erro com "Tentar de novo" e um jeito de voltar', async () => {
    api.detail.mockRejectedValue(new Error('404'))
    window.location.hash = '#filme/zzz'
    render(<MemoryRouter><AkaneShell /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Voltar para Filmes' })).toBeTruthy()
  })
})

describe('listas', () => {
  it('mostra as listas com a contagem e abre uma', async () => {
    const user = await openAt('#listas', 'Cinema japonês')
    expect(screen.getByText('2 filmes')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Cinema japonês/ }))
    expect(await screen.findByRole('tab', { name: 'Filmes (2)' })).toBeTruthy()
    expect(window.location.hash).toBe('#lista/l1')
  })

  it('"Nova lista" exige nome, cria e abre a lista nova', async () => {
    const user = await openAt('#listas', 'Cinema japonês')
    await user.click(screen.getAllByRole('button', { name: 'Nova lista' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Nova lista' })
    await user.click(within(dialog).getByRole('button', { name: /Salvar/ }))
    expect(await within(dialog).findByText('Dê um nome à lista.')).toBeTruthy()
    await user.type(within(dialog).getByLabelText('Nome'), 'Terror')
    await user.click(within(dialog).getByRole('button', { name: 'É um ranking' }))
    await user.click(within(dialog).getByRole('button', { name: /Salvar/ }))
    await waitFor(() => expect(api.createList).toHaveBeenCalledWith({ name: 'Terror', description: '', ranked: true }))
    await waitFor(() => expect(window.location.hash).toBe('#lista/l-new'))
  })

  it('tirar um filme da lista tem Desfazer que o devolve na mesma posição', async () => {
    const user = await openAt('#lista/l1', 'Paprika')
    await user.click(screen.getByRole('button', { name: 'Tirar Paprika da lista' }))
    await waitFor(() => expect(api.removeFromList).toHaveBeenCalledWith('l1', 'm2'))
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.addToList).toHaveBeenCalledWith('l1', 'm2', 2))
  })

  it('excluir a lista confirma, apaga só a lista e o Desfazer a recria com os filmes', async () => {
    const user = await openAt('#lista/l1', 'Paprika')
    await user.click(screen.getByRole('button', { name: 'Excluir lista' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(api.deleteList).toHaveBeenCalledWith('l1'))
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.createList).toHaveBeenCalledWith({ name: 'Cinema japonês', description: 'Do anime ao drama', ranked: false }))
    await waitFor(() => expect(api.addToList).toHaveBeenCalledTimes(2))
  })

  it('sem listas convida a criar a primeira', async () => {
    api.lists.mockResolvedValue({ status: 'ok', lists: [] })
    await openAt('#listas', 'Nenhuma lista ainda')
    expect(screen.getAllByRole('button', { name: 'Nova lista' }).length).toBeGreaterThan(0)
  })
})

describe('etiquetas', () => {
  it('escolher uma etiqueta mostra os filmes dela; escolher de novo fecha', async () => {
    const user = await openAt('#etiquetas', /anime · 2/)
    expect(screen.queryByText('Duna')).toBeNull()
    await user.click(screen.getByRole('button', { name: /anime · 2/ }))
    expect(await screen.findByText(/Filmes com “anime”/)).toBeTruthy()
    expect(screen.getAllByText('Perfect Blue').length).toBeGreaterThan(0)
    expect(screen.queryByText('Duna')).toBeNull()                       // sem a etiqueta "anime"
    await user.click(screen.getByRole('button', { name: /anime · 2/ }))
    expect(screen.queryByText(/Filmes com “anime”/)).toBeNull()
  })

  it('sem etiquetas explica de onde elas vêm', async () => {
    api.tags.mockResolvedValue({ status: 'ok', tags: [] })
    await openAt('#etiquetas', 'Nenhuma etiqueta ainda')
  })
})

describe('estatísticas', () => {
  it('mostra o ano, os números e os rankings; o seletor de ano refaz a consulta', async () => {
    const user = await openAt('#estatisticas', 'Seu ano em filmes')
    const year = Number(todayISO().slice(0, 4))
    expect(screen.getByText('Gêneros')).toBeTruthy()
    expect(screen.getByText('12 filmes')).toBeTruthy()
    expect(screen.getByText('20 h de tela')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Ano anterior' }))
    await waitFor(() => expect(api.statsPayload).toHaveBeenCalledWith(year - 1))
  })

  it('o ano da primeira sessão limita o seletor', async () => {
    api.statsPayload.mockImplementation(async (year: number) => ({ ...STATS(year), first_year: year }))
    await openAt('#estatisticas', 'Seu ano em filmes')
    expect((screen.getByRole('button', { name: 'Ano anterior' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('o Rewind antigo (#rewind) cai nesta mesma tela', async () => {
    await openAt('#rewind', 'Seu ano em filmes')
  })

  it('erro mostra "Tentar de novo"', async () => {
    api.statsPayload.mockRejectedValue(new Error('offline'))
    window.location.hash = '#estatisticas'
    render(<MemoryRouter><AkaneShell /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  })
})
