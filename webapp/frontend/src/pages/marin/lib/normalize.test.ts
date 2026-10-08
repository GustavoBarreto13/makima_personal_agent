// Normalização na borda: o banco manda null onde as telas esperam valor (lógica pura).

import { describe, expect, it } from 'vitest'
import { localDay, normalizeAnime, normalizeEpisode, normalizeHome, normalizeList, normalizeSchedule, normalizeSession } from './normalize'
import type { ApiAnime } from '../types'

const BARE: ApiAnime = {
  id: 'a1', mal_id: null, title: 'Frieren', media_type: null, season: null, studio: null, episodes_total: null, episodes_watched: null,
  status: 'assistindo', airing_status: null, score: null, poster_url: null, banner_url: null, overview: null, genres: null, tags: null,
  notes: null, date_started: null, date_finished: null, created_at: null, updated_at: null,
}

describe('normalizeAnime', () => {
  it('um anime "pelado" (tudo null) vira valores seguros', () => {
    const a = normalizeAnime(BARE)
    expect(a).toMatchObject({ genres: [], tags: [], studio: '', season: '', overview: '', notes: '', watched: 0, total: null, rating: null, progress: null, liked: false, abandoned: null })
  })
  it('a nota do MAL vira estrelas e a temporada vira português', () => {
    const a = normalizeAnime({ ...BARE, score: 9, season: 'fall 2023', episodes_total: 28, episodes_watched: 14, date_abandoned: '2026-03-02' })
    expect(a).toMatchObject({ rating: 4.5, season: 'Outono 2023', progress: 0.5, abandoned: '2026-03-02' })
  })
  it('estado ou formato desconhecido não quebra', () => {
    expect(normalizeAnime({ ...BARE, status: 'emprestado', media_type: 'filme' })).toMatchObject({ status: 'quero_assistir', mediaType: null })
  })
  it('progresso nunca passa de 100%', () => {
    expect(normalizeAnime({ ...BARE, episodes_total: 12, episodes_watched: 20 }).progress).toBe(1)
  })
})

describe('normalizeEpisode', () => {
  it('título genérico "Episódio N" vira vazio; título de verdade fica', () => {
    const base = { id: 'e1', number: 3, aired: null, airing_status: null, watched: false, watched_date: null }
    expect(normalizeEpisode({ ...base, title: 'Episódio 3' }).title).toBe('')
    expect(normalizeEpisode({ ...base, title: 'Aura' }).title).toBe('Aura')
    expect(normalizeEpisode({ ...base, title: null }).title).toBe('')
  })
})

describe('datas', () => {
  it('DATE já é o dia local; instante ISO é convertido para o dia local do navegador', () => {
    expect(localDay('2026-10-08')).toBe('2026-10-08')
    expect(localDay(null)).toBe('')
    expect(localDay('2026-10-09T01:30:00Z')).toMatch(/^2026-10-0[89]$/)
  })
})

describe('normalizeSession / Schedule / List / Home', () => {
  it('sessão sem episódios calcula a contagem pelo intervalo', () => {
    const s = normalizeSession({ id: 'l1', anime_id: 'a1', anime_title: null, watched_date: '2026-10-01', ep_start: 5, ep_end: 8, episodes_count: null, rating: 8, notes: null })
    expect(s).toMatchObject({ title: 'Anime', count: 4, rating: 4, notes: '', source: 'manual' })
  })
  it('lançamento só com o dia não inventa horário', () => {
    expect(normalizeSchedule({ anime_id: 'a1', anime_title: 'X', poster_url: null, episode_number: 3, aired: '2026-10-09' })).toMatchObject({ date: '2026-10-09', at: null, episodeTitle: '' })
    expect(normalizeSchedule({ anime_id: 'a1', anime_title: 'X', poster_url: null, episode_number: 3, aired: '2026-10-09T15:30:00+09:00' }).at).not.toBeNull()
  })
  it('lista lê o matiz de "oklch(...)" ou de um número', () => {
    expect(normalizeList({ id: 'l', name: 'A', description: null, accent: 'oklch(0.6 0.1 205)', ranked: null, count: null })).toMatchObject({ hue: 205, ranked: false, count: 0, description: '' })
    expect(normalizeList({ id: 'l', name: 'A', description: null, accent: '310', ranked: true, count: 2 }).hue).toBe(310)
    expect(normalizeList({ id: 'l', name: 'A', description: null, accent: null, ranked: true, count: 2 }).hue).toBeNull()
  })
  it('home toda nula vira listas vazias e contagens zeradas', () => {
    const h = normalizeHome({ last_session: null, currently_watching: null, recent_logs: null, upcoming_episodes: null, watchlist_preview: null, favorites: null, counts: null, episodes_7d: null, episodes_7d_prev: null, avg_score_year: null })
    expect(h).toMatchObject({ last: null, watching: [], recent: [], upcoming: [], queue: [], favorites: [], episodes7d: 0, episodes7dPrev: 0 })
    expect(h.counts).toEqual({ assistindo: 0, pausado: 0, quero_assistir: 0, completo: 0, abandonado: 0 })
  })
})
