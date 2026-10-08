// @vitest-environment jsdom
// A Marin nova de ponta a ponta no jsdom: o shell de verdade, com a API simulada.
// Cobre o que mais importa para o uso: logar pela linha rápida (e desfazer), dúvida/anime novo abrem o formulário,
// a fila vira "assistindo" ao logar, Diário (excluir com desfazer), Lançamentos, adicionar anime, favoritos
// (inclusive a migração do navegador) e os estados da tela.

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockLayoutApis, mockMatchMedia, setMockWidth } from '../../design/test-utils'
import { __resetToasts } from '../../design/headless/toast'
import { todayISO } from '../../design/core/format'

const api = vi.hoisted(() => ({
  home: vi.fn(), diary: vi.fn(), list: vi.fn(), schedule: vi.fn(), statsPayload: vi.fn(), search: vi.fn(), add: vi.fn(), logWatch: vi.fn(),
  updateStatus: vi.fn(), deleteLog: vi.fn(), restoreLog: vi.fn(), favorites: vi.fn(), setFavorites: vi.fn(), syncMal: vi.fn(),
  detail: vi.fn(), episodes: vi.fn(), lists: vi.fn(), tags: vi.fn(),
}))
vi.mock('./marinApi', () => ({ marinApi: api }))

import { MarinShell } from './MarinShell'
import { legacyFavoriteIds } from './lib/legacy'
import { normalizeAnime, normalizeHome, normalizeSession } from './lib/normalize'
import type { ApiAnime, ApiLog } from './types'

const TODAY = todayISO()

const ANIME = (id: string, title: string, over: Partial<ApiAnime> = {}) => normalizeAnime({
  id, mal_id: 1, title, media_type: 'tv', season: 'fall 2023', studio: 'Madhouse', episodes_total: 28, episodes_watched: 11, status: 'assistindo',
  airing_status: 'finalizado', score: 8, poster_url: null, banner_url: null, overview: null, genres: ['Fantasia'], tags: [], notes: null,
  date_started: '2026-09-01', date_finished: null, created_at: '2026-01-01T12:00:00-03:00', updated_at: '2026-10-06T12:00:00-03:00', ...over,
})
const LOG = (id: string, title: string, over: Partial<ApiLog> = {}) => normalizeSession({
  id, anime_id: `a-${id}`, anime_title: title, watched_date: '2026-10-02', ep_start: 5, ep_end: 6, episodes_count: 2, rating: 8, notes: null, source: 'manual', ...over,
})

const FRIEREN = ANIME('a1', 'Frieren')
const DUNGEON = ANIME('a2', 'Dungeon Meshi', { status: 'completo', episodes_watched: 24, episodes_total: 24 })
const FILA = ANIME('a3', 'Mushishi', { status: 'quero_assistir', episodes_watched: 0, episodes_total: 26, score: null })

const HOME = normalizeHome({
  last_session: { anime: { id: 'a1', title: 'Frieren' } as ApiAnime, log: { id: 'l1', watched_date: '2026-10-02' }, next_episode: { id: 'e12', number: 12, title: 'Aura', aired: null, airing_status: null, watched: false, watched_date: null } },
  currently_watching: [{ id: 'a1', title: 'Frieren', episodes_total: 28, episodes_watched: 11, status: 'assistindo' } as ApiAnime],
  recent_logs: [{ id: 'l1', anime_id: 'a1', anime_title: 'Frieren', watched_date: '2026-10-02', ep_start: 11, ep_end: 11, episodes_count: 1, rating: 8, notes: null }],
  upcoming_episodes: [{ anime_id: 'a1', anime_title: 'Frieren', poster_url: null, episode_number: 12, aired: TODAY }],
  watchlist_preview: [{ id: 'a3', title: 'Mushishi', status: 'quero_assistir', episodes_total: 26, season: 'fall 2005' } as ApiAnime],
  favorites: [{ id: 'a1', title: 'Frieren' } as ApiAnime],
  counts: { assistindo: 1, completo: 1, quero_assistir: 1 }, episodes_7d: 3, episodes_7d_prev: 1, avg_score_year: 8,
})
const EMPTY_HOME = normalizeHome({ last_session: null, currently_watching: [], recent_logs: [], upcoming_episodes: [], watchlist_preview: [], favorites: [], counts: {}, episodes_7d: 0, episodes_7d_prev: 0, avg_score_year: null })

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  api.home.mockResolvedValue(HOME)
  api.diary.mockResolvedValue([])
  api.list.mockResolvedValue([FRIEREN, DUNGEON, FILA])
  api.schedule.mockResolvedValue([])
  api.statsPayload.mockResolvedValue({ status: 'ok', first_year: 2024, kpis: [{ key: 'avg_rating', value: 4 }, { key: 'episodes', value: 120 }] })
  api.search.mockResolvedValue([])
  api.add.mockResolvedValue({ id: 'a-new' })
  api.logWatch.mockResolvedValue({ log_id: 'log-new' })
  api.updateStatus.mockResolvedValue({})
  api.deleteLog.mockResolvedValue({})
  api.restoreLog.mockResolvedValue({})
  api.favorites.mockResolvedValue([])
  api.setFavorites.mockResolvedValue({})
  api.syncMal.mockResolvedValue({ ok: true, full: false, created: 1, updated: 2, skipped: 0, errors: [] })
  api.lists.mockResolvedValue([])
  api.tags.mockResolvedValue([])
  window.location.hash = ''
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); setMockWidth(1200); document.documentElement.removeAttribute('data-ds-theme') })

const open = async () => {
  const user = userEvent.setup()
  render(<MemoryRouter><MarinShell /></MemoryRouter>)
  await screen.findByText(/Catálogo da Marin/)
  return user
}
const captureInput = () => screen.getByLabelText('Logar episódio em uma linha')

describe('Início', () => {
  it('hero: continue assistindo, próximo episódio e os botões', async () => {
    await open()
    expect(screen.getByRole('heading', { level: 2, name: /Continue Frieren/ })).toBeTruthy()
    expect(screen.getByText(/próximo:/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Logar ep 12' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ver detalhe' })).toBeTruthy()
  })

  it('cartões de número: acompanhados, episódios da semana contra a anterior e a nota média do ano', async () => {
    await open()
    expect(screen.getByText('Acompanhados')).toBeTruthy()
    expect(screen.getByText('200%')).toBeTruthy()                          // 3 episódios vs 1 na semana anterior
    expect(screen.getByText(/Nota média · \d{4}/)).toBeTruthy()
    expect(screen.getByText(/120 episódios no ano/)).toBeTruthy()
  })

  it('blocos de sempre: favoritos, assistindo agora, atividade, próximos, acervo e fila', async () => {
    await open()
    expect(screen.getByText('Animes favoritos')).toBeTruthy()
    expect(screen.getByText('Assistindo agora')).toBeTruthy()
    expect(screen.getByText('Atividade recente')).toBeTruthy()
    expect(screen.getByText('Próximos episódios')).toBeTruthy()
    expect(screen.getByText('Seu acervo')).toBeTruthy()
    expect(screen.getByText('Esperando na fila')).toBeTruthy()
    expect(screen.getByText('Mushishi')).toBeTruthy()
  })

  it('primeiro uso: convida a adicionar o primeiro anime', async () => {
    api.home.mockResolvedValue(EMPTY_HOME)
    render(<MemoryRouter><MarinShell /></MemoryRouter>)
    expect(await screen.findByText('Seu catálogo começa aqui')).toBeTruthy()
  })

  it('erro ao carregar mostra o estado de erro com "Tentar de novo"', async () => {
    api.home.mockRejectedValue(new Error('offline'))
    render(<MemoryRouter><MarinShell /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  })
})

describe('linha rápida', () => {
  it('"Frieren ep 12 ★4.5" reconhece o anime e loga com a nota em estrelas; o Desfazer apaga a sessão', async () => {
    const user = await open()
    await user.type(captureInput(), 'Frieren ep 12 ★4.5{Enter}')
    await waitFor(() => expect(api.logWatch).toHaveBeenCalledTimes(1))
    expect(api.logWatch).toHaveBeenCalledWith('a1', { ep_start: 12, ep_end: 12, watched_date: TODAY, stars: 4.5, notes: null })
    expect(await screen.findByText('Ep 12 de Frieren registrado')).toBeTruthy()

    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.deleteLog).toHaveBeenCalledWith('log-new'))
  })

  it('sem episódio na linha, loga o próximo', async () => {
    const user = await open()
    await user.type(captureInput(), 'Frieren{Enter}')
    await waitFor(() => expect(api.logWatch).toHaveBeenCalledTimes(1))
    expect(api.logWatch.mock.calls[0][1]).toMatchObject({ ep_start: 12, ep_end: 12 })
  })

  it('anime da fila passa a "assistindo" ao logar, e o Desfazer devolve a fila', async () => {
    const user = await open()
    await user.type(captureInput(), 'Mushishi ep 1{Enter}')
    await waitFor(() => expect(api.logWatch).toHaveBeenCalledTimes(1))
    expect(api.updateStatus).toHaveBeenCalledWith('a3', 'assistindo')
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.deleteLog).toHaveBeenCalled())
    expect(api.updateStatus).toHaveBeenLastCalledWith('a3', 'quero_assistir')
  })

  it('anime que não está no catálogo: avisa e oferece adicionar', async () => {
    const user = await open()
    await user.type(captureInput(), 'Anime Inexistente ep 3{Enter}')
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar anime' })
    expect((within(dialog).getByLabelText('Título') as HTMLInputElement).value).toBe('Anime Inexistente')
    expect(api.logWatch).not.toHaveBeenCalled()
  })

  it('título que serve para dois animes: não chuta, abre o formulário', async () => {
    api.list.mockResolvedValue([FRIEREN, ANIME('a9', 'Frieren Special', { status: 'quero_assistir' })])
    const user = await open()
    await user.type(captureInput(), 'Frier ep 3{Enter}')
    expect(await screen.findByRole('dialog', { name: 'Logar episódio' })).toBeTruthy()
    expect(api.logWatch).not.toHaveBeenCalled()
  })

  it('episódio além do total abre o formulário com o erro, sem salvar', async () => {
    const user = await open()
    await user.type(captureInput(), 'Frieren ep 99{Enter}')
    const dialog = await screen.findByRole('dialog', { name: 'Logar episódio' })
    await user.click(within(dialog).getByRole('button', { name: /Salvar/ }))
    expect(await within(dialog).findByText(/tem 28 episódios/)).toBeTruthy()
    expect(api.logWatch).not.toHaveBeenCalled()
  })

  it('Shift+Enter sempre abre o formulário, mesmo com tudo certo', async () => {
    const user = await open()
    await user.type(captureInput(), 'Frieren ep 12{Shift>}{Enter}{/Shift}')
    expect(await screen.findByRole('dialog', { name: 'Logar episódio' })).toBeTruthy()
    expect(api.logWatch).not.toHaveBeenCalled()
  })
})

describe('formulário de logar', () => {
  it('escolher o anime pré-preenche o próximo episódio; salvar manda o intervalo', async () => {
    const user = await open()
    await user.click(screen.getAllByRole('button', { name: /^Logar episódio/ })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Logar episódio' })
    // Frieren é o único "assistindo": já vem escolhido, no episódio 12
    expect((within(dialog).getByLabelText('Primeiro episódio') as HTMLInputElement).value).toBe('12')
    await user.click(within(dialog).getByRole('button', { name: '+1' }))
    await user.click(within(dialog).getByRole('button', { name: /Salvar/ }))
    await waitFor(() => expect(api.logWatch).toHaveBeenCalledTimes(1))
    expect(api.logWatch.mock.calls[0][1]).toMatchObject({ ep_start: 12, ep_end: 13 })
  })
})

describe('Diário', () => {
  it('lista as sessões e exclui com confirmação; o aviso desfaz devolvendo a sessão com o mesmo ID', async () => {
    window.location.hash = '#diario'
    api.diary.mockResolvedValue([LOG('dA', 'Duna')])
    const user = userEvent.setup()
    render(<MemoryRouter><MarinShell /></MemoryRouter>)
    await screen.findByText('Duna')
    await user.click(screen.getByRole('button', { name: 'Excluir sessão de Duna' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(api.deleteLog).toHaveBeenCalledWith('dA'))
    await user.click(await screen.findByRole('button', { name: /Desfazer/ }))
    await waitFor(() => expect(api.restoreLog).toHaveBeenCalledWith(expect.objectContaining({ id: 'dA', anime_id: 'a-dA', watched_date: '2026-10-02', ep_start: 5, ep_end: 6, episodes_count: 2, stars: 4 })))
  })

  it('agrupa por mês, com dia grande, dia da semana, episódios e nota do MAL', async () => {
    window.location.hash = '#diario'
    api.diary.mockResolvedValue([LOG('dA', 'Duna', { notes: 'Visualmente deslumbrante' }), LOG('dB', 'Her', { watched_date: '2026-09-12' })])
    render(<MemoryRouter><MarinShell /></MemoryRouter>)
    await screen.findByText('Duna')
    expect(screen.getByText('Outubro')).toBeTruthy()
    expect(screen.getByText('Setembro')).toBeTruthy()
    expect(screen.getAllByText('1 sessão')).toHaveLength(2)
    expect(screen.getByText('sex')).toBeTruthy()                       // 02/10/2026 é sexta
    expect(screen.getAllByText(/Eps 5–6 · 2 eps/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('8/10').length).toBeGreaterThan(0)
    expect(screen.getByText('“Visualmente deslumbrante”')).toBeTruthy()
  })

  it('diário vazio convida a logar', async () => {
    window.location.hash = '#diario'
    render(<MemoryRouter><MarinShell /></MemoryRouter>)
    expect(await screen.findByText('O diário está vazio')).toBeTruthy()
  })
})

describe('Catálogo e Quero assistir', () => {
  it('Catálogo mostra todos; o hash #quero-ver abre só a fila, com "Começar"', async () => {
    window.location.hash = '#catalogo'
    render(<MemoryRouter><MarinShell /></MemoryRouter>)
    expect(await screen.findByText('Dungeon Meshi')).toBeTruthy()
    expect(document.querySelector('.ds-grid-poster')).toBeTruthy()
    cleanup()
    window.location.hash = '#quero-ver'
    render(<MemoryRouter><MarinShell /></MemoryRouter>)
    expect(await screen.findByText('Mushishi')).toBeTruthy()
    expect(screen.queryByText('Dungeon Meshi')).toBeNull()
    expect(screen.getByText(/~26 episódios na fila/)).toBeTruthy()
  })

  it('"Começar" na fila (modo lista) abre o formulário já no episódio 1', async () => {
    window.location.hash = '#quero-ver'
    localStorage.setItem('ds:prefs:marin', JSON.stringify({ art: 'neon', layout: 'list', density: 'medium', sort: 'updated' }))
    const user = userEvent.setup()
    render(<MemoryRouter><MarinShell /></MemoryRouter>)
    await screen.findByText('Mushishi')
    await user.click(screen.getByRole('button', { name: 'Começar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Logar episódio' })
    expect((within(dialog).getByLabelText('Primeiro episódio') as HTMLInputElement).value).toBe('1')
  })

  it('a busca do topo leva ao Catálogo já filtrado', async () => {
    const user = await open()
    await user.type(screen.getByPlaceholderText('Buscar anime…'), 'dungeon{Enter}')
    await screen.findByRole('heading', { level: 1, name: 'Catálogo' })
    await waitFor(() => expect(screen.queryByText('Mushishi')).toBeNull())
    expect(screen.getByText('Dungeon Meshi')).toBeTruthy()
  })
})

describe('Lançamentos', () => {
  it('agrupa por dia, marca o de hoje com "Novo ep" e "Já vi" abre o formulário no episódio', async () => {
    window.location.hash = '#lancamentos'
    api.schedule.mockResolvedValue([
      { animeId: 'a1', title: 'Frieren', poster: null, episode: 12, episodeTitle: 'Aura', date: TODAY, at: null },
    ])
    const user = userEvent.setup()
    render(<MemoryRouter><MarinShell /></MemoryRouter>)
    expect(await screen.findByText('Hoje')).toBeTruthy()
    expect(screen.getByText('Novo ep')).toBeTruthy()
    expect(screen.getByText('Ep 12 · Aura')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Já vi' }))
    const dialog = await screen.findByRole('dialog', { name: 'Logar episódio' })
    expect((within(dialog).getByLabelText('Primeiro episódio') as HTMLInputElement).value).toBe('12')
  })

  it('sem episódios nos próximos dias, explica', async () => {
    window.location.hash = '#lancamentos'
    render(<MemoryRouter><MarinShell /></MemoryRouter>)
    expect(await screen.findByText('Nenhum episódio nos próximos 14 dias')).toBeTruthy()
  })
})

describe('Adicionar anime', () => {
  const result = (over: object = {}) => ({ malId: 52991, title: 'Sousou no Frieren', titleEnglish: '', type: 'TV', season: 'Outono 2023', year: 2023, episodes: 28, score: 9.3, poster: null, inCatalog: false, localId: null, ...over })

  it('busca no MyAnimeList, escolhe o resultado e abre a página do anime novo', async () => {
    api.search.mockResolvedValue([result()])
    const user = await open()
    await user.keyboard('a')                                           // atalho A
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar anime' })
    await user.type(within(dialog).getByLabelText('Título'), 'frieren')
    await user.click(await within(dialog).findByRole('button', { name: /Sousou no Frieren/ }))
    await waitFor(() => expect(api.add).toHaveBeenCalledWith(52991))
    await waitFor(() => expect(window.location.hash).toBe('#anime/a-new'))
  })

  it('anime que já está no catálogo só abre a página dele', async () => {
    api.search.mockResolvedValue([result({ inCatalog: true, localId: 'a1' })])
    const user = await open()
    await user.keyboard('a')
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar anime' })
    await user.type(within(dialog).getByLabelText('Título'), 'frieren')
    expect(await within(dialog).findByText(/Já na lista/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: /Sousou no Frieren/ }))
    await waitFor(() => expect(window.location.hash).toBe('#anime/a1'))
    expect(api.add).not.toHaveBeenCalled()
  })
})

describe('Favoritos', () => {
  it('escolher até 4 animes salva a vitrine no servidor', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Escolher favoritos' })
    await user.click(within(dialog).getByRole('button', { name: /Dungeon Meshi/ }))
    await user.click(within(dialog).getByRole('button', { name: /Salvar/ }))
    await waitFor(() => expect(api.setFavorites).toHaveBeenCalledWith(['a1', 'a2']))
  })

  it('migra os favoritos que o navegador guardava (só os que existem) e apaga a chave antiga', async () => {
    localStorage.setItem('marin.favorites', JSON.stringify(['a2', 'sumiu']))
    await open()
    await waitFor(() => expect(api.setFavorites).toHaveBeenCalledWith(['a2']))
    await waitFor(() => expect(legacyFavoriteIds()).toEqual([]))
  })

  it('se o servidor já tem vitrine, não sobrescreve — só apaga a chave antiga', async () => {
    localStorage.setItem('marin.favorites', JSON.stringify(['a2']))
    api.favorites.mockResolvedValue([FRIEREN])
    await open()
    await waitFor(() => expect(legacyFavoriteIds()).toEqual([]))
    expect(api.setFavorites).not.toHaveBeenCalled()
  })
})

describe('Preferências e atalhos', () => {
  it('"Sincronizar agora" fala com o MyAnimeList e avisa o resultado', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: /Preferências/ }))
    await user.click(await screen.findByRole('button', { name: 'Sincronizar agora' }))
    await waitFor(() => expect(api.syncMal).toHaveBeenCalledWith(false))
    expect(await screen.findByText('MyAnimeList: 1 novos, 2 atualizados')).toBeTruthy()
  })

  it('o sync completo (que antes não tinha botão) existe', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: /Preferências/ }))
    await user.click(await screen.findByRole('button', { name: 'Sync completo' }))
    await waitFor(() => expect(api.syncMal).toHaveBeenCalledWith(true))
  })

  it('abre direto na tela pedida pelo hash', async () => {
    window.location.hash = '#diario'
    render(<MemoryRouter><MarinShell /></MemoryRouter>)
    expect(await screen.findByRole('heading', { level: 1, name: 'Diário' })).toBeTruthy()
  })
})
