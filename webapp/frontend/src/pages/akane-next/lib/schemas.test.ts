import { describe, expect, it } from 'vitest'
import { defaultState, filterItems, type CollectionSchema, type CollectionState } from '../../../design/core/collection'
import type { DiaryEntry, Movie } from '../types'
import { decadeOf, localDay, makeDiarySchema, makeFilmsSchema, makeWatchlistSchema, placeKind } from './schemas'

const TODAY = '2026-10-03'
const movie = (over: Partial<Movie>): Movie => ({
  id: 'm', tmdb_id: 1, imdb_id: null, letterboxd_uri: null, title: 'Filme', year: 1997, director: [], genres: ['Drama'], runtime: 100, overview: null,
  poster_url: null, backdrop_url: null, poster_palette: 'noir', status: 'watched', rating: 4, rating_source: 'own', liked: false, tags: [], notes: null,
  last_watched_date: '2026-09-01', times_watched: 1, original_language: 'en', countries: ['US'], watchlist_added_at: null, created_at: '2026-01-01T12:00:00-03:00', ...over,
})
const entry = (over: Partial<DiaryEntry>): DiaryEntry => ({
  id: 'd', movie_id: 'm', movie_title: 'Filme', poster_url: null, poster_palette: 'noir', watched_date: '2026-09-01', rating: 4, rewatch: false,
  review: null, tags: [], companions: [], watch_location: null, ...over,
})
const apply = <T,>(schema: CollectionSchema<T>, items: T[], patch: Partial<CollectionState>): T[] =>
  filterItems(schema, { ...defaultState(schema), ...patch }, items, TODAY)

describe('datas locais', () => {
  it('data ISO pura passa como está; instante do servidor vira o dia LOCAL (não o do UTC)', () => {
    expect(localDay('2026-10-03')).toBe('2026-10-03')
    // 23h30 locais de 03/10: em UTC-3 já é dia 04 em UTC, e o dia certo continua sendo 03 (qualquer fuso da máquina)
    expect(localDay(new Date(2026, 9, 3, 23, 30).toISOString())).toBe('2026-10-03')
    expect(localDay(null)).toBe('')
  })
  it('década', () => {
    expect(decadeOf(1997)).toBe('1990s')
    expect(decadeOf(null)).toBe('')
  })
})

describe('Filmes', () => {
  const movies = [
    movie({ id: 'a', title: 'Perfect Blue', director: ['Satoshi Kon'], genres: ['Animação'], year: 1997, liked: true, rating: 5 }),
    movie({ id: 'b', title: 'Duna', genres: ['Ficção científica'], year: 2021, rating: 3 }),
    movie({ id: 'c', title: 'Paprika', genres: ['Animação'], year: 2006, status: 'watchlist', rating: null, last_watched_date: null }),
  ]
  const schema = makeFilmsSchema(movies)
  const ids = (xs: Movie[]) => xs.map((m) => m.id).sort()

  it('busca por título, diretor e gênero', () => {
    expect(ids(apply(schema, movies, { q: 'kon' }))).toEqual(['a'])
    expect(ids(apply(schema, movies, { q: 'duna' }))).toEqual(['b'])
    expect(ids(apply(schema, movies, { q: 'animação' }))).toEqual(['a', 'c'])
  })

  it('situação, gênero, década, nota mínima e "curti"', () => {
    expect(ids(apply(schema, movies, { facets: { status: { values: { watchlist: true } } } }))).toEqual(['c'])
    expect(ids(apply(schema, movies, { facets: { genre: { values: { Animação: true } } } }))).toEqual(['a', 'c'])
    expect(ids(apply(schema, movies, { facets: { decade: { values: { '2000s': true } } } }))).toEqual(['c'])
    expect(ids(apply(schema, movies, { facets: { rating: { min: 4 } } }))).toEqual(['a'])
    expect(ids(apply(schema, movies, { facets: { liked: { flag: true } } }))).toEqual(['a'])
  })

  it('declara 2+ ordenações e oferece as décadas existentes', () => {
    expect(schema.sorts.length).toBeGreaterThanOrEqual(2)
    const decades = schema.facets.find((f) => f.id === 'decade')
    expect(decades && 'options' in decades ? decades.options.map((o) => o.value) : []).toEqual(['2020s', '2000s', '1990s'])
  })
})

describe('Quero ver', () => {
  const movies = [
    movie({ id: 'a', status: 'watchlist', watchlist_added_at: new Date(2026, 9, 2, 23, 0).toISOString() }),   // 23h locais de 02/10
    movie({ id: 'b', status: 'watchlist', watchlist_added_at: new Date(2026, 0, 5, 12, 0).toISOString() }),
  ]
  const schema = makeWatchlistSchema(movies)

  it('"Adicionado em" usa o dia local do instante de entrada', () => {
    const got = apply(schema, movies, { facets: { added: { bucket: 'last7' } } })
    expect(got.map((m) => m.id)).toEqual(['a'])
  })
  it('tem ao menos 2 ordenações', () => expect(schema.sorts.length).toBeGreaterThanOrEqual(2))
})

describe('Diário', () => {
  const entries = [
    entry({ id: '1', movie_title: 'Duna', watch_location: { id: 'l', name: 'Cinemark', kind: 'cinema' }, companions: [{ id: 'p', name: 'Ana' }], rating: 5 }),
    entry({ id: '2', movie_title: 'Her', watch_location: { id: 'n', name: 'Netflix', kind: 'streaming' }, rewatch: true, rating: 3 }),
    entry({ id: '3', movie_title: 'Alien', watch_location: null }),
  ]
  const schema = makeDiarySchema()
  const ids = (xs: DiaryEntry[]) => xs.map((e) => e.id).sort()

  it('classifica onde assistiu (cinema, em casa, sem local)', () => {
    expect(entries.map(placeKind)).toEqual(['cinema', 'streaming', 'none'])
  })
  it('busca por filme, local e pessoa', () => {
    expect(ids(apply(schema, entries, { q: 'ana' }))).toEqual(['1'])
    expect(ids(apply(schema, entries, { q: 'netflix' }))).toEqual(['2'])
  })
  it('filtra por onde, com quem, nota mínima e revisões', () => {
    expect(ids(apply(schema, entries, { facets: { where: { values: { cinema: true } } } }))).toEqual(['1'])
    expect(ids(apply(schema, entries, { facets: { with: { values: { Ana: true } } } }))).toEqual(['1'])
    expect(ids(apply(schema, entries, { facets: { rating: { min: 4 } } }))).toEqual(['1', '3'])
    expect(ids(apply(schema, entries, { facets: { rewatch: { flag: true } } }))).toEqual(['2'])
  })
})
