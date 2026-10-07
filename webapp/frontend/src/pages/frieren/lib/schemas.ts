// Esquemas das coleções da Frieren (padrão useCollection): busca + status/tipo + data + 2 ordenações, no mínimo.
//   frieren:livros    a biblioteca toda (os 7 status)
//   frieren:querler   o que ainda vai ler (na estante, quero ler, pausados)
//   frieren:wishlist  o que quer comprar
//   frieren:diario    as sessões de leitura
//   frieren:resenhas  os livros com resenha

import { defineCollection, type CollectionSchema, type EnumFacet } from '../../../design/core/collection'
import { MONTHS_LONG } from '../../../design/core/format'
import type { UseCollection } from '../../../design/headless/useCollection'
import type { Book, BookStatus, Session } from '../types'
import { STATUS, STATUS_ORDER, TO_READ } from './status'

const uniqueSorted = (values: string[]): string[] => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
const options = (values: string[]) => uniqueSorted(values).map((value) => ({ value }))
const monthLabel = (iso: string) => (iso ? `${MONTHS_LONG[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}` : 'Sem data')

/** Textos pesquisáveis de um livro: título, autor, gêneros e ano. */
const bookSearch = (b: Book): string[] => [b.title, b.author, ...b.genres, b.year ? String(b.year) : '']

/** Faceta de status limitada aos status dados (na ordem natural). */
const statusFacet = (only: BookStatus[]): EnumFacet<Book> => ({
  kind: 'enum',
  id: 'status',
  label: 'Situação',
  get: (b) => b.status,
  options: STATUS_ORDER.filter((s) => only.includes(s)).map((s) => ({ value: s, label: STATUS[s].label })),
})

const genreFacet = (books: Book[]): EnumFacet<Book> => ({
  kind: 'enum', id: 'genre', label: 'Gênero', get: (b) => b.genre, options: options(books.map((b) => b.genre)),
})

/** Dia mais recente em que o livro "aconteceu": última leitura, término ou início. */
export const lastActivity = (b: Book): string => b.lastRead ?? b.finished ?? b.started ?? ''

/** As 7 ordenações do shell antigo, com os mesmos nomes. */
const BOOK_SORTS: CollectionSchema<Book>['sorts'] = [
  { id: 'added', label: 'Adicionado recentemente', value: (b) => b.addedAt },
  { id: 'recent', label: 'Atividade recente', value: lastActivity },
  { id: 'rating', label: 'Avaliação', value: (b) => b.rating ?? 0 },
  { id: 'title', label: 'Título', value: (b) => b.title.toLowerCase() },
  { id: 'author', label: 'Autor', value: (b) => b.author.toLowerCase() },
  { id: 'progress', label: 'Progresso', value: (b) => b.progress ?? (b.status === 'lido' ? 1 : 0) },
  { id: 'pages', label: 'Nº de páginas', value: (b) => b.pages ?? 0 },
]

export function makeLibrarySchema(books: Book[]): CollectionSchema<Book> {
  return defineCollection<Book>({
    scope: 'frieren:livros',
    search: bookSearch,
    facets: [
      statusFacet(STATUS_ORDER),
      genreFacet(books),
      { kind: 'enum', id: 'language', label: 'Idioma', get: (b) => b.language, options: options(books.map((b) => b.language)) },
      { kind: 'range', id: 'rating', label: 'Nota mínima', get: (b) => b.rating, min: 0.5, max: 5, step: 0.5, display: 'stars' },
      { kind: 'flag', id: 'liked', label: 'Só os que curti', get: (b) => b.liked },
      { kind: 'dateRange', id: 'finished', label: 'Terminado em', get: (b) => b.finished ?? '', buckets: ['last30', 'last90', 'thisYear', 'all'], defaultBucket: 'all' },
      { kind: 'dateRange', id: 'added', label: 'Adicionado em', get: (b) => b.addedAt, buckets: ['last30', 'last90', 'thisYear', 'all'], defaultBucket: 'all' },
    ],
    groups: [
      { id: 'status', label: 'Situação', key: (b) => STATUS[b.status].label },
      { id: 'genre', label: 'Gênero', key: (b) => b.genre || 'Sem gênero' },
      { id: 'finishedYear', label: 'Ano em que li', key: (b) => (b.finished ? b.finished.slice(0, 4) : 'Ainda não terminei') },
    ],
    sorts: BOOK_SORTS,
    // Como o shell antigo: agrupado por situação, os adicionados por último primeiro.
    defaults: { groupBy: 'status', sortBy: 'added', dir: 'desc' },
  })
}

export function makeToReadSchema(books: Book[]): CollectionSchema<Book> {
  return defineCollection<Book>({
    scope: 'frieren:querler',
    search: bookSearch,
    facets: [
      statusFacet(TO_READ),
      genreFacet(books),
      { kind: 'dateRange', id: 'added', label: 'Adicionado em', get: (b) => b.addedAt, buckets: ['last30', 'last90', 'thisYear', 'all'], defaultBucket: 'all' },
    ],
    groups: [
      { id: 'status', label: 'Situação', key: (b) => STATUS[b.status].label },
      { id: 'genre', label: 'Gênero', key: (b) => b.genre || 'Sem gênero' },
    ],
    sorts: BOOK_SORTS.filter((s) => ['added', 'title', 'author', 'pages'].includes(s.id)),
    defaults: { groupBy: 'none', sortBy: 'added', dir: 'desc' },
  })
}

export function makeWishlistSchema(books: Book[]): CollectionSchema<Book> {
  return defineCollection<Book>({
    scope: 'frieren:wishlist',
    search: (b) => [...bookSearch(b), b.storeUrl ?? ''],
    facets: [
      genreFacet(books),
      { kind: 'flag', id: 'link', label: 'Só com link da loja', get: (b) => !!b.storeUrl },
      { kind: 'dateRange', id: 'added', label: 'Adicionado em', get: (b) => b.addedAt, buckets: ['last30', 'last90', 'thisYear', 'all'], defaultBucket: 'all' },
    ],
    groups: [{ id: 'genre', label: 'Gênero', key: (b) => b.genre || 'Sem gênero' }],
    sorts: [
      ...BOOK_SORTS.filter((s) => ['added', 'title', 'author'].includes(s.id)),
      // Sem preço vai para o fim no crescente (preço alto demais para "barato primeiro").
      { id: 'price', label: 'Preço', value: (b) => b.price ?? Number.MAX_SAFE_INTEGER },
    ],
    defaults: { groupBy: 'none', sortBy: 'added', dir: 'desc' },
  })
}

const KIND_LABEL: Record<Session['kind'], string> = { started: 'Começou', progress: 'Leitura', finished: 'Terminou' }

export function makeDiarySchema(): CollectionSchema<Session> {
  return defineCollection<Session>({
    scope: 'frieren:diario',
    search: (s) => [s.title, s.author, s.note],
    facets: [
      {
        kind: 'enum', id: 'kind', label: 'Tipo', get: (s) => s.kind,
        options: (['started', 'progress', 'finished'] as const).map((k) => ({ value: k, label: KIND_LABEL[k] })),
      },
      { kind: 'flag', id: 'note', label: 'Só com nota do dia', get: (s) => s.note.trim().length > 0 },
      { kind: 'dateRange', id: 'date', label: 'Período', get: (s) => s.date, buckets: ['last7', 'last30', 'last90', 'thisYear', 'all'], defaultBucket: 'all' },
    ],
    groups: [
      { id: 'month', label: 'Mês', key: (s) => monthLabel(s.date) },
      { id: 'book', label: 'Livro', key: (s) => s.title },
    ],
    sorts: [
      { id: 'date', label: 'Data', value: (s) => s.date },
      { id: 'pages', label: 'Páginas lidas', value: (s) => s.pages },
      { id: 'title', label: 'Livro', value: (s) => s.title.toLowerCase() },
    ],
    defaults: { groupBy: 'month', sortBy: 'date', dir: 'desc' },
  })
}

export function makeReviewsSchema(books: Book[]): CollectionSchema<Book> {
  return defineCollection<Book>({
    scope: 'frieren:resenhas',
    search: (b) => [...bookSearch(b), b.review],
    facets: [
      genreFacet(books),
      { kind: 'range', id: 'rating', label: 'Nota mínima', get: (b) => b.rating, min: 0.5, max: 5, step: 0.5, display: 'stars' },
      { kind: 'flag', id: 'liked', label: 'Só os que curti', get: (b) => b.liked },
      { kind: 'dateRange', id: 'finished', label: 'Terminado em', get: (b) => b.finished ?? '', buckets: ['last30', 'last90', 'thisYear', 'all'], defaultBucket: 'all' },
    ],
    groups: [{ id: 'year', label: 'Ano em que li', key: (b) => (b.finished ? b.finished.slice(0, 4) : 'Sem data') }],
    sorts: [
      // Como o shell antigo: as resenhas dos livros terminados por último primeiro.
      { id: 'finished', label: 'Terminado recentemente', value: (b) => b.finished ?? '' },
      ...BOOK_SORTS.filter((s) => ['rating', 'title'].includes(s.id)),
    ],
    defaults: { groupBy: 'none', sortBy: 'finished', dir: 'desc' },
  })
}

/** Reordena os grupos de status na ordem natural (Lendo… Abandonado). O DS agrupa na ordem em que os itens
 *  aparecem depois de ordenar, o que deixaria "Lido" antes de "Lendo" quando o último adicionado é um lido. */
export function withStatusOrder<T>(c: UseCollection<T>): UseCollection<T> {
  if (c.state.groupBy !== 'status') return c
  const rank = (key: string) => STATUS_ORDER.findIndex((s) => STATUS[s].label === key)
  const groups = [...c.result.groups].sort((a, b) => rank(a.key) - rank(b.key))
  return { ...c, result: { ...c.result, groups } }
}
