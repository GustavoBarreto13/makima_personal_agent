import { describe, expect, it } from 'vitest'
import type { DiaryEntry, HomeData, Movie, MovieDetail } from '../types'
import { normalizeDetail, normalizeEntry, normalizeHome, normalizeMovie } from './normalize'

const movie = (over: Partial<Record<keyof Movie, unknown>> = {}) => ({ id: 'm', title: 'Duna', tags: null, genres: null, director: null, countries: null, ...over }) as unknown as Movie
const entry = (over: object = {}) => ({ id: 'd', tags: null, companions: null, watch_location: undefined, ...over }) as unknown as DiaryEntry

describe('normalização dos null do servidor', () => {
  it('filme: tags, gêneros, direção e países viram lista; o resto não muda', () => {
    const m = normalizeMovie(movie({ title: 'Duna', year: 2021 }))
    expect(m.tags).toEqual([])
    expect(m.genres).toEqual([])
    expect(m.director).toEqual([])
    expect(m.countries).toEqual([])
    expect(m.title).toBe('Duna')
  })

  it('não troca listas que já vêm preenchidas', () => {
    const m = normalizeMovie(movie({ tags: ['anime'], countries: ['JP'] }))
    expect(m.tags).toEqual(['anime'])
    expect(m.countries).toEqual(['JP'])
  })

  it('sessão: tags e acompanhantes viram lista e "sem local" é null explícito', () => {
    const e = normalizeEntry(entry())
    expect(e.tags).toEqual([])
    expect(e.companions).toEqual([])
    expect(e.watch_location).toBeNull()
  })

  it('detalhe: pessoas, Cofre e sessões nunca são null, e as sessões também são normalizadas', () => {
    const d = normalizeDetail({ movie: movie(), people: null, vault: null, diary: [entry()] } as unknown as MovieDetail)
    expect(d.people).toEqual([])
    expect(d.vault).toEqual([])
    expect(d.movie.tags).toEqual([])
    expect(d.diary[0].tags).toEqual([])
  })

  it('Início: favoritos, atividade, Quero ver e histograma sempre existem', () => {
    const h = normalizeHome({
      favorites: null, recent_activity: [entry()], watchlist_highlight: [{ id: 'm2', title: 'Paprika', director: null }], rating_histogram: null,
    } as unknown as HomeData)
    expect(h.favorites).toEqual([])
    expect(h.recent_activity[0].companions).toEqual([])
    expect(h.watchlist_highlight[0].director).toEqual([])
    expect(h.rating_histogram).toEqual({})
  })
})
