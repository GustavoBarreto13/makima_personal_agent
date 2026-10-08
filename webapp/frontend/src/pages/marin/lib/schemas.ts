// Esquemas das coleções da Marin (padrão useCollection): busca + status/formato + data + 2 ordenações, no mínimo.
//   marin:animes   o catálogo todo (os 5 estados)
//   marin:querover só a fila "Quero assistir"
//   marin:diario   as sessões
//   marin:listas   as listas

import { defineCollection, type CollectionSchema } from '../../../design/core/collection'
import { MONTHS_LONG } from '../../../design/core/format'
import type { Anime, AnimeList, Session } from '../types'
import { STATUS, STATUS_ORDER } from './status'

export type AnimeSort = 'updated' | 'added' | 'rating' | 'title' | 'progress'

const FORMAT_LABEL: Record<string, string> = { tv: 'TV', movie: 'Filme', ova: 'OVA', special: 'Especial', ona: 'ONA' }

const uniqueSorted = (values: string[]): string[] => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
const options = (values: string[]) => uniqueSorted(values).map((value) => ({ value }))
const monthLabel = (iso: string) => (iso ? `${MONTHS_LONG[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}` : 'Sem data')

/** Temporadas ordenadas da mais recente para a mais antiga ("Outono 2025" antes de "Verão 2024"). */
const ESTACAO_ORDEM: Record<string, number> = { Inverno: 0, Primavera: 1, 'Verão': 2, Outono: 3 }
/** Número que ordena temporadas no tempo: ano * 10 + posição da estação ("Outono 2025" > "Verão 2025"); 0 sem temporada. */
export function seasonKey(season: string): number {
  if (!season) return 0
  const [estacao, ano] = season.split(' ')
  return Number(ano) * 10 + (ESTACAO_ORDEM[estacao] ?? 0)
}

export function seasonsDesc(values: string[]): { value: string }[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => seasonKey(b) - seasonKey(a)).map((value) => ({ value }))
}

const animeSearch = (a: Anime): string[] => [a.title, a.titleEnglish, a.titleJapanese, a.studio, ...a.genres, ...a.tags]

const formatOf = (a: Anime): string => (a.mediaType ? FORMAT_LABEL[a.mediaType] : '')

/** Ordenações do catálogo: os cinco critérios do shell antigo (atualizado, adicionado, nota, título, progresso) + temporada. */
const ANIME_SORTS = [
  { id: 'updated', label: 'Atualizado', value: (a: Anime) => a.updatedAt },
  { id: 'added', label: 'Adicionado', value: (a: Anime) => a.addedAt },
  { id: 'rating', label: 'Nota', value: (a: Anime) => a.rating ?? 0 },
  { id: 'title', label: 'Título', value: (a: Anime) => a.title.toLowerCase() },
  { id: 'progress', label: 'Progresso', value: (a: Anime) => a.progress ?? 0 },
  { id: 'season', label: 'Temporada de estreia', value: (a: Anime) => seasonKey(a.season) },
]

export function makeAnimesSchema(animes: Anime[], sortBy: AnimeSort = 'updated'): CollectionSchema<Anime> {
  return defineCollection<Anime>({
    scope: 'marin:animes',
    search: animeSearch,
    facets: [
      { kind: 'enum', id: 'status', label: 'Situação', get: (a) => a.status, options: STATUS_ORDER.map((s) => ({ value: s, label: STATUS[s].label })) },
      { kind: 'tags', id: 'genre', label: 'Gênero', get: (a) => a.genres },
      { kind: 'enum', id: 'format', label: 'Formato', get: formatOf, options: options(animes.map(formatOf)) },
      { kind: 'enum', id: 'season', label: 'Temporada', get: (a) => a.season, options: seasonsDesc(animes.map((a) => a.season)) },
      { kind: 'enum', id: 'studio', label: 'Estúdio', get: (a) => a.studio, options: options(animes.map((a) => a.studio)) },
      { kind: 'tags', id: 'tags', label: 'Etiquetas', get: (a) => a.tags },
      { kind: 'range', id: 'rating', label: 'Nota mínima', get: (a) => a.rating, min: 0.5, max: 5, step: 0.5, display: 'stars' },
      { kind: 'flag', id: 'liked', label: 'Só os que curti', get: (a) => a.liked },
      { kind: 'dateRange', id: 'updated', label: 'Atualizado em', get: (a) => a.updatedAt, buckets: ['last30', 'last90', 'thisYear', 'all'], defaultBucket: 'all' },
    ],
    groups: [
      { id: 'status', label: 'Situação', key: (a) => STATUS[a.status].label },
      { id: 'season', label: 'Temporada', key: (a) => a.season || 'Sem temporada' },
      { id: 'format', label: 'Formato', key: (a) => formatOf(a) || 'Sem formato' },
      { id: 'studio', label: 'Estúdio', key: (a) => a.studio || 'Sem estúdio' },
    ],
    sorts: ANIME_SORTS,
    defaults: { groupBy: 'none', sortBy, dir: sortBy === 'title' ? 'asc' : 'desc' },
  })
}

export function makeQueueSchema(animes: Anime[]): CollectionSchema<Anime> {
  return defineCollection<Anime>({
    scope: 'marin:querover',
    search: animeSearch,
    facets: [
      { kind: 'tags', id: 'genre', label: 'Gênero', get: (a) => a.genres },
      { kind: 'enum', id: 'format', label: 'Formato', get: formatOf, options: options(animes.map(formatOf)) },
      { kind: 'enum', id: 'season', label: 'Temporada', get: (a) => a.season, options: seasonsDesc(animes.map((a) => a.season)) },
      { kind: 'dateRange', id: 'added', label: 'Adicionado em', get: (a) => a.addedAt, buckets: ['last30', 'last90', 'thisYear', 'all'], defaultBucket: 'all' },
    ],
    groups: [
      { id: 'season', label: 'Temporada', key: (a) => a.season || 'Sem temporada' },
      { id: 'format', label: 'Formato', key: (a) => formatOf(a) || 'Sem formato' },
    ],
    sorts: [
      { id: 'added', label: 'Adicionado', value: (a) => a.addedAt },
      { id: 'title', label: 'Título', value: (a) => a.title.toLowerCase() },
      { id: 'episodes', label: 'Nº de episódios', value: (a) => a.total ?? 0 },
      { id: 'season', label: 'Temporada de estreia', value: (a) => seasonKey(a.season) },
    ],
    defaults: { groupBy: 'none', sortBy: 'added', dir: 'desc' },
  })
}

export function makeDiarySchema(): CollectionSchema<Session> {
  return defineCollection<Session>({
    scope: 'marin:diario',
    search: (s) => [s.title, s.notes],
    facets: [
      { kind: 'range', id: 'rating', label: 'Nota mínima', get: (s) => s.rating, min: 0.5, max: 5, step: 0.5, display: 'stars' },
      { kind: 'dateRange', id: 'date', label: 'Período', get: (s) => s.date, buckets: ['last7', 'last30', 'last90', 'thisYear', 'all'], defaultBucket: 'all' },
    ],
    groups: [
      { id: 'month', label: 'Mês', key: (s) => monthLabel(s.date) },
      { id: 'anime', label: 'Anime', key: (s) => s.title },
    ],
    sorts: [
      { id: 'date', label: 'Data', value: (s) => s.date },
      { id: 'rating', label: 'Nota', value: (s) => s.rating ?? 0 },
      { id: 'title', label: 'Título', value: (s) => s.title.toLowerCase() },
      { id: 'episodes', label: 'Episódios na sessão', value: (s) => s.count },
    ],
    defaults: { groupBy: 'month', sortBy: 'date', dir: 'desc' },
  })
}

export function makeListsSchema(): CollectionSchema<AnimeList> {
  return defineCollection<AnimeList>({
    scope: 'marin:listas',
    search: (l) => [l.name, l.description],
    facets: [{ kind: 'flag', id: 'ranked', label: 'Só rankings', get: (l) => l.ranked }],
    groups: [],
    sorts: [
      { id: 'name', label: 'Nome', value: (l) => l.name.toLowerCase() },
      { id: 'count', label: 'Nº de animes', value: (l) => l.count },
    ],
    defaults: { groupBy: 'none', sortBy: 'name', dir: 'asc' },
  })
}
