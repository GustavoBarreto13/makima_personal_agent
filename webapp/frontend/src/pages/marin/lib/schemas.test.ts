// Esquemas das coleções: facetas, ordenações e padrões (lógica pura).

import { describe, expect, it } from 'vitest'
import { makeAnimesSchema, makeDiarySchema, makeListsSchema, makeQueueSchema } from './schemas'
import { normalizeAnime } from './normalize'
import type { ApiAnime } from '../types'

const anime = (id: string, over: Partial<ApiAnime> = {}) => normalizeAnime({
  id, mal_id: null, title: `Anime ${id}`, media_type: 'tv', season: 'winter 2024', studio: 'MAPPA', episodes_total: 12, episodes_watched: 6,
  status: 'assistindo', airing_status: null, score: 8, poster_url: null, banner_url: null, overview: null, genres: ['Ação'], tags: ['x'],
  notes: null, date_started: null, date_finished: null, created_at: '2026-01-01T12:00:00-03:00', updated_at: '2026-10-01T12:00:00-03:00', ...over,
})

describe('catálogo', () => {
  const s = makeAnimesSchema([anime('1'), anime('2', { studio: 'Madhouse', season: 'fall 2023', media_type: 'movie' })])
  it('tem busca, situação, formato, nota, data e as ordenações do shell antigo', () => {
    expect(s.scope).toBe('marin:animes')
    expect(s.facets.map((f) => f.id)).toEqual(expect.arrayContaining(['status', 'genre', 'format', 'season', 'studio', 'rating', 'liked', 'updated']))
    expect(s.sorts.map((x) => x.id)).toEqual(expect.arrayContaining(['updated', 'added', 'rating', 'title', 'progress']))
  })
  it('a busca olha título, estúdio, gênero e etiqueta', () => {
    expect(s.search(anime('9'))).toEqual(expect.arrayContaining(['Anime 9', 'MAPPA', 'Ação', 'x']))
  })
  it('a ordem inicial vem das Preferências', () => {
    expect(makeAnimesSchema([], 'rating').defaults?.sortBy).toBe('rating')
    expect(makeAnimesSchema([], 'title').defaults?.dir).toBe('asc')
  })
  it('as opções de temporada e estúdio vêm do que existe no catálogo', () => {
    const season = s.facets.find((f) => f.id === 'season')
    expect(season && 'options' in season ? season.options.map((o) => o.value) : []).toEqual(['Inverno 2024', 'Outono 2023'])
  })
})

describe('fila, diário e listas', () => {
  it('têm escopo próprio e ao menos duas ordenações', () => {
    for (const [s, scope] of [[makeQueueSchema([]), 'marin:querover'], [makeDiarySchema(), 'marin:diario'], [makeListsSchema(), 'marin:listas']] as const) {
      expect(s.scope).toBe(scope)
      expect(s.sorts.length).toBeGreaterThanOrEqual(2)
    }
  })
  it('o diário agrupa por mês por padrão', () => {
    expect(makeDiarySchema().defaults?.groupBy).toBe('month')
  })
})
