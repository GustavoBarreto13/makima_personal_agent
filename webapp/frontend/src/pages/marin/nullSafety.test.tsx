// @vitest-environment jsdom
// Robustez: o banco da Marin tem MUITO campo vazio (animes adicionados só pelo MAL não têm estúdio, temporada,
// gêneros, pôster; sessões não têm episódios). Estes testes servem payloads cheios de null passando pela camada
// `marinApi` de verdade (só o transporte HTTP é simulado) e abrem cada tela: nenhuma pode cair na rede de
// segurança ("Algo deu errado nesta tela").

import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { mockLayoutApis, mockMatchMedia } from '../../design/test-utils'
import { __resetToasts } from '../../design/headless/toast'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn() }))
vi.mock('../../lib/api', () => ({ api: http }))

import { MarinShell } from './MarinShell'

// Anime "pelado": só id, título e estado — tudo o mais null (o formato exato da listagem).
const BARE = (id: string, title: string, status: string, over: object = {}) => ({
  id, mal_id: null, title, media_type: null, season: null, studio: null, episodes_total: null, episodes_watched: null, status,
  airing_status: null, score: null, poster_url: null, banner_url: null, overview: null, genres: null, tags: null, notes: null,
  date_started: null, date_finished: null, date_abandoned: null, created_at: null, updated_at: null, liked: null, ...over,
})
const ANIMES = [
  BARE('a1', 'Sem nada', 'assistindo'),
  BARE('a2', 'Completo sem dados', 'completo', { score: 8, tags: ['isekai'] }),
  BARE('a3', 'Estado estranho', 'emprestado'),
  BARE('a4', 'Na fila', 'quero_assistir'),
]
const LOG = { id: 'l1', anime_id: 'a1', anime_title: null, watched_date: '2026-10-01', ep_start: null, ep_end: null, episodes_count: null, rating: null, notes: null, source: null }

const route = (url: string) => {
  if (url === '/api/animes') return { animes: ANIMES }
  if (url.startsWith('/api/animes/home')) {
    return {
      last_session: { anime: ANIMES[0], log: { id: 'l1', watched_date: '2026-10-01' }, next_episode: null },
      currently_watching: [ANIMES[0]], recent_logs: [LOG], upcoming_episodes: null, watchlist_preview: [ANIMES[3]], favorites: null,
      counts: { assistindo: 1, completo: 1, quero_assistir: 1 }, episodes_7d: null, episodes_7d_prev: null, avg_score_year: null,
    }
  }
  if (url.startsWith('/api/animes/diary')) return { logs: [LOG] }
  if (url.startsWith('/api/animes/schedule')) return { schedule: [{ anime_id: 'a1', anime_title: 'Sem nada', poster_url: null, episode_number: 3, aired: '2026-10-09' }] }
  if (url.startsWith('/api/animes/stats')) {
    return {
      status: 'ok', period: { year: 2026, month: null, label: '2026' }, previous: null, kpis: [], daily: [], monthly: [], monthlyUnit: 'episódios',
      distribution: [], rankings: {}, records: [], moments: [], first_year: 2026,
    }
  }
  if (url.startsWith('/api/animes/lists/l1')) return { list: { id: 'l1', name: 'Minha lista', description: null, accent: null, ranked: null, count: null }, animes: null }
  if (url.startsWith('/api/animes/lists')) return { lists: [{ id: 'l1', name: 'Minha lista', description: null, accent: 'lixo', ranked: null, count: null }] }
  if (url.startsWith('/api/animes/tags')) return { tags: [{ name: 'isekai', count: 1 }] }
  if (url === '/api/animes/favorites') return { favorites: null }
  if (url === '/api/animes/a1') return { anime: ANIMES[0], next_episode: null, episodes: null, episodes_total_cached: null, recent_logs: null }
  throw new Error(`rota não simulada: ${url}`)
}

beforeAll(() => { mockMatchMedia(false); mockLayoutApis() })
beforeEach(() => {
  Object.values(http).forEach((m) => m.mockReset())
  http.get.mockImplementation(async (url: string) => route(url))
})
afterEach(() => { cleanup(); __resetToasts(); localStorage.clear(); window.location.hash = '' })

const SCREENS: [string, string | RegExp][] = [
  ['', /Catálogo da Marin/],
  ['#catalogo', 'Estado estranho'],
  ['#quero-ver', 'Na fila'],
  ['#diario', /sessão/],
  ['#lancamentos', 'Sem nada'],
  ['#listas', 'Minha lista'],
  ['#lista/l1', 'Minha lista'],
  ['#etiquetas', /isekai/],
  ['#estatisticas', 'Seu ano em animes'],
  ['#anime/a1', 'Sem nada'],
]

describe('dados vazios não derrubam nenhuma tela', () => {
  it.each(SCREENS)('%s abre sem erro', async (hash, ready) => {
    window.location.hash = hash
    render(<MemoryRouter><MarinShell /></MemoryRouter>)
    expect((await screen.findAllByText(ready)).length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.queryByText('Algo deu errado nesta tela')).toBeNull())
  })
})
