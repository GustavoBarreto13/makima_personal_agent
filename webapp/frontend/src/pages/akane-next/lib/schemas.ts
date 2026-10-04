// Esquemas das coleções da Akane (padrão useCollection): busca + status/tipo + data + 2 ordenações, no mínimo.
//   akane:filmes     o catálogo todo (vistos e Quero ver)
//   akane:watchlist  só o Quero ver
//   akane:diario     as sessões

import { defineCollection, type CollectionSchema } from '../../../design/core/collection'
import { isoDate, MONTHS_LONG } from '../../../design/core/format'
import type { DiaryEntry, Movie } from '../types'

/** Dia local (America/Sao_Paulo no navegador) de um instante ISO do servidor — nunca `slice(0, 10)` (UTC). */
export function localDay(iso: string | null | undefined): string {
  if (!iso) return ''
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : isoDate(new Date(iso))
}

export const decadeOf = (year: number | null): string => (year ? `${Math.floor(year / 10) * 10}s` : '')

const uniqueSorted = (values: string[]): string[] => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
const options = (values: string[]) => uniqueSorted(values).map((value) => ({ value }))
const monthLabel = (iso: string) => (iso ? `${MONTHS_LONG[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}` : 'Sem data')

const movieSearch = (m: Movie): string[] => [m.title, ...m.director, ...m.genres, ...m.tags, m.year ? String(m.year) : '']

export function makeFilmsSchema(movies: Movie[]): CollectionSchema<Movie> {
  return defineCollection<Movie>({
    scope: 'akane:filmes',
    search: movieSearch,
    facets: [
      { kind: 'enum', id: 'status', label: 'Situação', get: (m) => m.status, options: [{ value: 'watched', label: 'Vistos' }, { value: 'watchlist', label: 'Quero ver' }] },
      { kind: 'enum', id: 'genre', label: 'Gênero', get: (m) => m.genres[0] ?? '', options: options(movies.flatMap((m) => m.genres[0] ?? [])) },
      { kind: 'enum', id: 'decade', label: 'Década', get: (m) => decadeOf(m.year), options: options(movies.map((m) => decadeOf(m.year))).reverse() },
      { kind: 'tags', id: 'tags', label: 'Etiquetas', get: (m) => m.tags },
      { kind: 'range', id: 'rating', label: 'Nota mínima', get: (m) => m.rating, min: 0.5, max: 5, step: 0.5, display: 'stars' },
      { kind: 'flag', id: 'liked', label: 'Só os que curti', get: (m) => m.liked },
      { kind: 'dateRange', id: 'seen', label: 'Visto em', get: (m) => m.last_watched_date ?? '', buckets: ['last30', 'last90', 'thisYear', 'all'], defaultBucket: 'all' },
    ],
    groups: [
      { id: 'decade', label: 'Década', key: (m) => decadeOf(m.year) || 'Sem ano' },
      { id: 'genre', label: 'Gênero', key: (m) => m.genres[0] ?? 'Sem gênero' },
      { id: 'seenYear', label: 'Ano em que vi', key: (m) => (m.last_watched_date ? m.last_watched_date.slice(0, 4) : 'Ainda não vi') },
    ],
    sorts: [
      { id: 'recent', label: 'Visto recentemente', value: (m) => m.last_watched_date ?? '' },
      { id: 'rating', label: 'Nota', value: (m) => m.rating ?? 0 },
      { id: 'title', label: 'Título', value: (m) => m.title.toLowerCase() },
      { id: 'year', label: 'Ano de lançamento', value: (m) => m.year ?? 0 },
    ],
    defaults: { groupBy: 'none', sortBy: 'recent', dir: 'desc' },
  })
}

export function makeWatchlistSchema(movies: Movie[]): CollectionSchema<Movie> {
  return defineCollection<Movie>({
    scope: 'akane:watchlist',
    search: movieSearch,
    facets: [
      { kind: 'enum', id: 'genre', label: 'Gênero', get: (m) => m.genres[0] ?? '', options: options(movies.flatMap((m) => m.genres[0] ?? [])) },
      { kind: 'enum', id: 'decade', label: 'Década', get: (m) => decadeOf(m.year), options: options(movies.map((m) => decadeOf(m.year))).reverse() },
      { kind: 'dateRange', id: 'added', label: 'Adicionado em', get: (m) => localDay(m.watchlist_added_at ?? m.created_at), buckets: ['last30', 'last90', 'thisYear', 'all'], defaultBucket: 'all' },
    ],
    groups: [
      { id: 'decade', label: 'Década', key: (m) => decadeOf(m.year) || 'Sem ano' },
      { id: 'genre', label: 'Gênero', key: (m) => m.genres[0] ?? 'Sem gênero' },
    ],
    sorts: [
      { id: 'added', label: 'Adicionado', value: (m) => localDay(m.watchlist_added_at ?? m.created_at) },
      { id: 'year', label: 'Ano de lançamento', value: (m) => m.year ?? 0 },
      { id: 'title', label: 'Título', value: (m) => m.title.toLowerCase() },
      { id: 'runtime', label: 'Duração', value: (m) => m.runtime ?? 0 },
    ],
    defaults: { groupBy: 'none', sortBy: 'added', dir: 'desc' },
  })
}

export const placeKind = (e: DiaryEntry): string => e.watch_location?.kind ?? 'none'

export function makeDiarySchema(): CollectionSchema<DiaryEntry> {
  return defineCollection<DiaryEntry>({
    scope: 'akane:diario',
    search: (e) => [e.movie_title ?? '', e.review ?? '', ...e.tags, ...e.companions.map((c) => c.name), e.watch_location?.name ?? ''],
    facets: [
      { kind: 'enum', id: 'where', label: 'Onde', get: placeKind, options: [{ value: 'cinema', label: 'Cinema' }, { value: 'streaming', label: 'Em casa' }, { value: 'none', label: 'Sem local' }] },
      { kind: 'tags', id: 'with', label: 'Com quem', get: (e) => e.companions.map((c) => c.name) },
      { kind: 'range', id: 'rating', label: 'Nota mínima', get: (e) => e.rating, min: 0.5, max: 5, step: 0.5, display: 'stars' },
      { kind: 'flag', id: 'rewatch', label: 'Só revisões', get: (e) => e.rewatch },
      { kind: 'dateRange', id: 'date', label: 'Período', get: (e) => e.watched_date, buckets: ['last7', 'last30', 'last90', 'thisYear', 'all'], defaultBucket: 'all' },
    ],
    groups: [
      { id: 'month', label: 'Mês', key: (e) => monthLabel(e.watched_date) },
      { id: 'where', label: 'Onde', key: (e) => (e.watch_location ? e.watch_location.name : 'Sem local') },
    ],
    sorts: [
      { id: 'date', label: 'Data', value: (e) => e.watched_date },
      { id: 'rating', label: 'Nota', value: (e) => e.rating ?? 0 },
      { id: 'title', label: 'Título', value: (e) => (e.movie_title ?? '').toLowerCase() },
    ],
    defaults: { groupBy: 'month', sortBy: 'date', dir: 'desc' },
  })
}
