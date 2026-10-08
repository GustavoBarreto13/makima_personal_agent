// @vitest-environment jsdom
// Telas de detalhe: anime (estado, nota, coração, notas, etiquetas, episódios, sessões, remover com desfazer),
// listas, etiquetas e estatísticas — com a API simulada.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../design/test-utils'
import { __resetToasts } from '../../design/headless/toast'

const api = vi.hoisted(() => ({
  home: vi.fn(), diary: vi.fn(), list: vi.fn(), schedule: vi.fn(), statsPayload: vi.fn(), favorites: vi.fn(), setFavorites: vi.fn(),
  detail: vi.fn(), episodes: vi.fn(), updateStatus: vi.fn(), rate: vi.fn(), like: vi.fn(), setNotes: vi.fn(), refreshMetadata: vi.fn(),
  deleteAnime: vi.fn(), restoreAnime: vi.fn(), addTag: vi.fn(), removeTag: vi.fn(), deleteLog: vi.fn(), restoreLog: vi.fn(),
  lists: vi.fn(), listDetail: vi.fn(), createList: vi.fn(), updateList: vi.fn(), deleteList: vi.fn(), addToList: vi.fn(), removeFromList: vi.fn(), tags: vi.fn(),
}))
vi.mock('./marinApi', () => ({ marinApi: api }))

import { MarinShell } from './MarinShell'
import { normalizeAnime, normalizeEpisode, normalizeList, normalizeListItem, normalizeSession } from './lib/normalize'
import type { ApiAnime } from './types'

const ANIME = (over: Partial<ApiAnime> = {}) => normalizeAnime({
  id: 'a1', mal_id: 52991, title: 'Frieren', title_japanese: '葬送のフリーレン', media_type: 'tv', season: 'fall 2023', studio: 'Madhouse', episodes_total: 28,
  episodes_watched: 11, status: 'assistindo', airing_status: 'finalizado', score: 8, poster_url: null, banner_url: null, overview: 'Uma maga elfa depois da jornada.',
  genres: ['Fantasia', 'Aventura'], tags: ['calmo'], notes: 'ótimo', date_started: '2026-09-01', date_finished: null,
  created_at: '2026-01-01T12:00:00-03:00', updated_at: '2026-10-06T12:00:00-03:00', ...over,
})
const EP = (n: number, over: object = {}) => normalizeEpisode({ id: `e${n}`, number: n, title: `Episódio ${n}`, aired: '2023-10-0' + (n % 9 + 1), airing_status: 'lancado', watched: n <= 11, watched_date: n <= 11 ? '2026-09-02' : null, ...over })
const SESSION = (id: string, over: object = {}) => normalizeSession({ id, anime_id: 'a1', anime_title: 'Frieren', watched_date: '2026-10-02', ep_start: 10, ep_end: 11, episodes_count: 2, rating: 8, notes: 'ritmo bom', source: 'manual', ...over })

const detail = (over: Partial<ApiAnime> = {}) => ({
  anime: ANIME(over), next: EP(12), episodes: Array.from({ length: 12 }, (_, i) => EP(i + 1)), episodesTotal: 28, logs: [SESSION('s1')],
})

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  api.list.mockResolvedValue([ANIME()])
  api.favorites.mockResolvedValue([])
  api.detail.mockImplementation(async () => detail())
  api.episodes.mockResolvedValue({ episodes: Array.from({ length: 12 }, (_, i) => EP(i + 13)), total: 28 })
  for (const m of [api.updateStatus, api.rate, api.like, api.setNotes, api.refreshMetadata, api.deleteAnime, api.restoreAnime, api.addTag, api.removeTag, api.deleteLog, api.restoreLog, api.updateList, api.deleteList, api.addToList, api.removeFromList]) m.mockResolvedValue({})
  api.createList.mockResolvedValue({ id: 'l-new' })
  api.lists.mockResolvedValue([])
  api.tags.mockResolvedValue([])
  api.statsPayload.mockResolvedValue({ status: 'ok', first_year: 2024, period: { year: 2026, month: null, label: '2026' }, previous: null, kpis: [{ key: 'animes', value: 5 }, { key: 'episodes', value: 90 }, { key: 'hours', value: 36 }, { key: 'avg_rating', value: 4 }], daily: [], monthly: [], monthlyUnit: 'episódios', distribution: [], rankings: {}, records: [], moments: [] })
  window.location.hash = ''
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); document.documentElement.removeAttribute('data-ds-theme') })

const openAt = async (hash: string, ready: string | RegExp) => {
  window.location.hash = hash
  const user = userEvent.setup()
  render(<MemoryRouter><MarinShell /></MemoryRouter>)
  await screen.findAllByText(ready)
  return user
}

describe('detalhe do anime', () => {
  it('mostra título, ficha, sinopse, sessões, próximo episódio e o progresso', async () => {
    await openAt('#anime/a1', 'Uma maga elfa depois da jornada.')
    expect(screen.getByRole('heading', { level: 2, name: 'Frieren' })).toBeTruthy()
    expect(screen.getByText(/葬送のフリーレン/)).toBeTruthy()
    expect(screen.getByText(/Próximo:/)).toBeTruthy()
    expect(screen.getByText('11/28 episódios · 39%')).toBeTruthy()
    expect(screen.getByText('ritmo bom')).toBeTruthy()
    expect(screen.getByText('Estúdio')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Logar ep 12' })).toBeTruthy()
  })

  it('anime que não existe mostra o erro com o caminho de volta', async () => {
    api.detail.mockRejectedValue(new Error('404'))
    window.location.hash = '#anime/sumiu'
    render(<MemoryRouter><MarinShell /></MemoryRouter>)
    expect(await screen.findByText('Não foi possível abrir o anime')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Voltar para o Catálogo' })).toBeTruthy()
  })

  it('mudar o estado grava e o aviso desfaz', async () => {
    const user = await openAt('#anime/a1', 'Uma maga elfa depois da jornada.')
    await user.selectOptions(screen.getByLabelText('Estado do anime'), 'pausado')
    await waitFor(() => expect(api.updateStatus).toHaveBeenCalledWith('a1', 'pausado'))
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.updateStatus).toHaveBeenLastCalledWith('a1', 'assistindo'))
  })

  it('curtir grava o coração', async () => {
    const user = await openAt('#anime/a1', 'Uma maga elfa depois da jornada.')
    await user.click(screen.getByRole('button', { name: 'Curti' }))
    await waitFor(() => expect(api.like).toHaveBeenCalledWith('a1', true))
  })

  it('a nota em estrelas vai para a API como estrelas (a conversão para o MAL é dela) e desfaz', async () => {
    const user = await openAt('#anime/a1', 'Uma maga elfa depois da jornada.')
    const rate = screen.getByRole('slider', { name: /Nota de 0 a 5/ })
    rate.focus()
    await user.keyboard('5')
    await waitFor(() => expect(api.rate).toHaveBeenCalledWith('a1', 5))
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.rate).toHaveBeenLastCalledWith('a1', 4))     // a nota 8/10 de antes
  })

  it('salvar o Caderno só liga quando o texto muda', async () => {
    const user = await openAt('#anime/a1', 'Uma maga elfa depois da jornada.')
    const save = screen.getByRole('button', { name: 'Salvar anotações' })
    expect((save as HTMLButtonElement).disabled).toBe(true)
    await user.type(screen.getByLabelText('Anotações sobre o anime'), ' demais')
    await user.click(save)
    await waitFor(() => expect(api.setNotes).toHaveBeenCalledWith('a1', 'ótimo demais'))
  })

  it('etiquetas: adicionar e remover chamam a API certa', async () => {
    const user = await openAt('#anime/a1', 'Uma maga elfa depois da jornada.')
    await user.type(screen.getByLabelText('Etiquetas'), 'isekai{Enter}')
    await waitFor(() => expect(api.addTag).toHaveBeenCalledWith('a1', 'isekai'))
  })

  it('"Atualizar dados" fica desligado para anime sem MyAnimeList', async () => {
    api.detail.mockImplementation(async () => detail({ mal_id: null }))
    const user = await openAt('#anime/a1', 'Uma maga elfa depois da jornada.')
    await user.click(screen.getByRole('button', { name: 'Mais ações do anime' }))
    expect((await screen.findByRole('menuitem', { name: /precisa de um anime do MyAnimeList/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('"Atualizar dados" busca de novo os metadados', async () => {
    const user = await openAt('#anime/a1', 'Uma maga elfa depois da jornada.')
    await user.click(screen.getByRole('button', { name: 'Mais ações do anime' }))
    await user.click(await screen.findByRole('menuitem', { name: /Atualizar dados/ }))
    await waitFor(() => expect(api.refreshMetadata).toHaveBeenCalledWith('a1'))
  })

  it('remover pede confirmação, volta ao catálogo e o aviso desfaz', async () => {
    const user = await openAt('#anime/a1', 'Uma maga elfa depois da jornada.')
    await user.click(screen.getByRole('button', { name: 'Mais ações do anime' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Remover do catálogo' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remover' }))
    await waitFor(() => expect(api.deleteAnime).toHaveBeenCalledWith('a1'))
    await waitFor(() => expect(window.location.hash).toBe('#catalogo'))
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.restoreAnime).toHaveBeenCalledWith('a1'))
  })

  it('excluir uma sessão pelo detalhe (antes só dava pelo Diário) com desfazer', async () => {
    const user = await openAt('#anime/a1', 'Uma maga elfa depois da jornada.')
    await user.click(screen.getByRole('button', { name: /Excluir sessão de/ }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(api.deleteLog).toHaveBeenCalledWith('s1'))
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.restoreLog).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', anime_id: 'a1', ep_start: 10, ep_end: 11 })))
  })

  it('aba Episódios: 12 por vez, "Carregar mais" e "Logar" abre o formulário no episódio', async () => {
    const user = await openAt('#anime/a1', 'Uma maga elfa depois da jornada.')
    await user.click(screen.getByRole('tab', { name: /Episódios/ }))
    expect(await screen.findAllByRole('listitem')).toHaveLength(12)
    await user.click(screen.getByRole('button', { name: 'Carregar mais' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(24))
    expect(api.episodes).toHaveBeenCalledWith('a1', 2)
    await user.click(screen.getAllByRole('button', { name: 'Logar' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Logar episódio' })
    expect((within(dialog).getByLabelText('Primeiro episódio') as HTMLInputElement).value).toBe('12')
  })

  it('a data do episódio é o dia exato, sem o dia a menos do fuso', async () => {
    api.detail.mockImplementation(async () => ({ ...detail(), episodes: [EP(1, { aired: '2023-10-01' })] }))
    const user = await openAt('#anime/a1', 'Uma maga elfa depois da jornada.')
    await user.click(screen.getByRole('tab', { name: /Episódios/ }))
    expect(await screen.findByText(/1 de out\./)).toBeTruthy()
  })
})

describe('Listas', () => {
  const LIST = normalizeList({ id: 'l1', name: 'Isekai favoritos', description: 'Os melhores', accent: null, ranked: true, count: 2 })
  const ITEMS = [normalizeListItem({ id: 'a1', title: 'Frieren', poster_url: null, status: 'assistindo', score: 10, position: 1 }), normalizeListItem({ id: 'a2', title: 'Mushishi', poster_url: null, status: 'completo', score: null, position: 2 })]

  it('cria uma lista e abre a página dela', async () => {
    api.lists.mockResolvedValue([])
    api.listDetail.mockResolvedValue({ list: LIST, items: [] })
    const user = await openAt('#listas', 'Nenhuma lista ainda')
    await user.click(screen.getAllByRole('button', { name: 'Nova lista' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Nova lista' })
    await user.type(within(dialog).getByLabelText('Nome'), 'Top 10')
    await user.click(within(dialog).getByRole('button', { name: 'É um ranking' }))
    await user.click(within(dialog).getByRole('button', { name: /Salvar/ }))
    await waitFor(() => expect(api.createList).toHaveBeenCalledWith({ name: 'Top 10', description: '', ranked: true }))
    await waitFor(() => expect(window.location.hash).toBe('#lista/l-new'))
  })

  it('lista aberta mostra a posição do ranking; tirar um anime desfaz', async () => {
    api.listDetail.mockResolvedValue({ list: LIST, items: ITEMS })
    const user = await openAt('#lista/l1', 'Isekai favoritos')
    expect(screen.getByText('Ranking')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Tirar Mushishi da lista' }))
    await waitFor(() => expect(api.removeFromList).toHaveBeenCalledWith('l1', 'a2'))
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.addToList).toHaveBeenCalledWith('l1', 'a2', 2))
  })

  it('excluir a lista pede confirmação e o aviso recria com os mesmos animes', async () => {
    api.listDetail.mockResolvedValue({ list: LIST, items: ITEMS })
    const user = await openAt('#lista/l1', 'Isekai favoritos')
    await user.click(screen.getByRole('button', { name: 'Excluir lista' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(api.deleteList).toHaveBeenCalledWith('l1'))
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.createList).toHaveBeenCalledWith({ name: 'Isekai favoritos', description: 'Os melhores', ranked: true }))
    await waitFor(() => expect(api.addToList).toHaveBeenCalledTimes(2))
  })

  it('"Adicionar à lista" no detalhe põe o anime numa lista existente', async () => {
    api.lists.mockResolvedValue([LIST])
    const user = await openAt('#anime/a1', 'Uma maga elfa depois da jornada.')
    await user.click(screen.getByRole('button', { name: 'Adicionar à lista' }))
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar à lista' })
    await user.click(await within(dialog).findByRole('button', { name: /Isekai favoritos/ }))
    await waitFor(() => expect(api.addToList).toHaveBeenCalledWith('l1', 'a1'))
  })
})

describe('Etiquetas', () => {
  it('escolher uma etiqueta mostra os animes dela', async () => {
    api.tags.mockResolvedValue([{ name: 'calmo', count: 1 }])
    const user = await openAt('#etiquetas', /calmo · 1/)
    await user.click(screen.getByRole('button', { name: /calmo · 1/ }))
    expect(await screen.findByText('Animes com “calmo”')).toBeTruthy()
    expect(screen.getByText('Frieren')).toBeTruthy()
  })

  it('sem etiquetas, explica como criar', async () => {
    await openAt('#etiquetas', 'Nenhuma etiqueta ainda')
  })
})

describe('Estatísticas', () => {
  it('mostra o resumo do ano e trocar de ano refaz a consulta', async () => {
    const user = await openAt('#estatisticas', 'Seu ano em animes')
    expect(screen.getByText(/90 episódios/)).toBeTruthy()
    expect(api.statsPayload).toHaveBeenCalledWith(new Date().getFullYear())
    await user.click(screen.getByRole('button', { name: /Ano anterior/ }))
    await waitFor(() => expect(api.statsPayload).toHaveBeenCalledWith(new Date().getFullYear() - 1))
  })

  it('erro mostra "Tentar de novo"', async () => {
    api.statsPayload.mockRejectedValue(new Error('x'))
    window.location.hash = '#estatisticas'
    render(<MemoryRouter><MarinShell /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  })
})
