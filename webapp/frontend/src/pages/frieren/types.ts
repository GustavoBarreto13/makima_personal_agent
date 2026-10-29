// Tipos da Frieren (livros) no Design System — espelham o que /api/books/* devolve.
// Os "Api*" são o formato cru do servidor; `Book`, `Session` e `Shelf` são o formato já normalizado
// (lib/normalize.ts) que as telas usam: sem `null` em lista, datas como texto YYYY-MM-DD, nomes em português.

import type { StatsPayload } from '../../design/core/stats'
import type { BookFormat, ProgressUnit } from './lib/units'

/** Os 7 status que o backend aceita (agents/frieren/tools.py → VALID_STATUSES). */
export type BookStatus = 'lendo' | 'pausado' | 'quero_ler' | 'estante' | 'wishlist' | 'lido' | 'abandonado'

/** Livro como vem de GET /api/books (listagem). */
export interface ApiBook {
  id: string
  title: string
  author: string | null
  /** Total NA UNIDADE do livro (páginas, capítulos ou volumes) — o nome é histórico. */
  total_pages: number | null
  /** Formato e unidade (podem faltar em respostas antigas: assume físico/páginas). */
  format?: string | null
  progress_unit?: string | null
  /** Capítulo/volume em que o livro começa (padrão 1; mangá de numeração contínua entre volumes). */
  first_unit?: number | null
  /** Id da série no MyAnimeList quando o livro está sincronizado com a lista de mangás de lá. */
  mal_manga_id?: number | null
  status: string
  cover_url: string | null
  date_started: string | null
  date_finished: string | null
  date_abandoned: string | null
  rating: number | null
  genre: string | null
  isbn: string | null
  published_year: number | null
  language: string | null
  notes: string | null
  store_url: string | null
  price: number | null
  liked: boolean | null
  created_at: string | null
  updated_at: string | null
  /** Maior página registrada nas sessões (null = nenhuma sessão ainda). */
  current_page: number | null
  /** Dia da sessão mais recente (null = nenhuma). */
  last_read: string | null
  shelves: string[] | null
}

/** Livro normalizado, pronto para as telas. */
export interface Book {
  id: string
  title: string
  /** Autor(es) como o Google Books devolve ("A, B"); vazio quando não há. */
  author: string
  year: number | null
  /** Total na unidade do livro (páginas, capítulos ou volumes). */
  pages: number | null
  format: BookFormat
  /** Unidade em que `pages`/`page` e as sessões são contados. */
  unit: ProgressUnit
  /** Número da primeira unidade (capítulo/volume inicial); 1 na maioria dos livros. `pages` é o ÚLTIMO número. */
  first: number
  /** Id da série no MyAnimeList (livro sincronizado) ou null. */
  malId: number | null
  /** Primeiro gênero (para facetas e agrupamento). */
  genre: string
  /** Todos os gêneros (o banco guarda "Fantasia, Aventura"). */
  genres: string[]
  language: string
  status: BookStatus
  /** Posição atual na unidade do livro (0 = nunca registrou). */
  page: number
  /** 0 a 1, só quando há total de páginas e alguma leitura. */
  progress: number | null
  started: string | null
  finished: string | null
  abandoned: string | null
  /** Dia (local) em que entrou no catálogo. */
  addedAt: string
  lastRead: string | null
  rating: number | null
  /** Resenha (campo `notes` no banco). */
  review: string
  liked: boolean
  shelves: string[]
  storeUrl: string | null
  price: number | null
  coverUrl: string | null
  isbn: string | null
}

/** Detalhe completo (GET /api/books/{id}): o livro + campos que a listagem não traz. */
export interface ApiBookDetail extends Omit<ApiBook, 'last_read'> {
  description: string | null
}

/** Sessão de leitura como vem de GET /api/books/activity. */
export interface ApiSession {
  id: string
  date: string
  book_id: string
  title: string
  author: string | null
  /** Avanço da sessão, na unidade do livro. */
  pages: number | null
  /** Posição onde parou (page_end), na unidade do livro. */
  page: number | null
  /** Unidade do livro desta sessão. */
  unit?: string | null
  note: string | null
  rating: number | null
  /** Inferido pelo servidor: primeira sessão, a do dia do término ou progresso comum. */
  type: 'started' | 'finished' | 'progress' | string
}

export interface Session {
  id: string
  date: string
  bookId: string
  title: string
  author: string
  /** Avanço da sessão, na unidade do livro. */
  pages: number
  /** Posição onde parou, na unidade do livro. */
  page: number
  unit: ProgressUnit
  note: string
  kind: 'started' | 'finished' | 'progress'
}

/** Sessão crua de GET /api/books/{id}/history (usada no detalhe). */
export interface ApiHistoryLog {
  id: string
  date: string
  page_start: number | null
  page_end: number | null
  pages_read: number | null
  session_notes: string | null
}

export interface ApiShelf {
  id: string
  name: string
  description: string | null
  accent: string | null
  book_count: number | null
}

export interface Shelf {
  id: string
  name: string
  description: string
  /** Cor salva no banco (texto oklch do shell antigo) — a tela mapeia para um matiz do DS. */
  accent: string
  count: number
}

/** Cores das marcações (CHECK do banco em book_bullets). */
export type BulletColor = 'rosa' | 'amarelo' | 'verde' | 'azul' | 'laranja'

export interface Bullet {
  id: string
  book_id: string
  content: string
  color: BulletColor
  page_number: number | null
  position: number
  created_at: string
}

/** Resultado da busca no Google Books (GET /api/books/search-google). */
export interface GoogleBook {
  google_books_id: string
  title: string
  author: string
  total_pages: number | null
  isbn: string | null
  cover_url: string | null
  description: string
  genre: string
  language: string
  published_year: number | null
}

export interface FavoriteBook {
  id: string
  title: string
  author: string | null
  cover_url: string | null
  position: number
}

/** Blocos da tela Início (GET /api/books/home). */
export interface HomeData {
  status: 'ok'
  favorites: FavoriteBook[]
  reading: {
    id: string
    title: string
    author: string | null
    cover_url: string | null
    total_pages: number | null
    date_started: string | null
    current_page: number
    last_read: string | null
    /** Unidade do livro (pages | chapters | volumes) em que `current_page`/`total_pages` estão. */
    progress_unit?: string | null
  }[]
  recent_finished: {
    id: string
    title: string
    author: string | null
    cover_url: string | null
    rating: number | null
    liked: boolean
    date_finished: string
    has_review: boolean
  }[]
  /** Quantos livros terminados no ano receberam cada nota ("0.5" … "5.0"). */
  rating_histogram: Record<string, number>
  pages_7d: number
  pages_7d_prev: number
  /** Páginas nos últimos 30 dias corridos (o cartão de ritmo divide por 30). */
  pages_30d: number
  /** Páginas por dia dos últimos 21 dias, com zeros. */
  spark: { date: string; value: number }[]
  streak: { best: number; current: number }
  finished_year: number
  last_session: { book_id: string; title: string; date: string; page_end: number | null; pages_read: number | null; progress_unit?: string | null } | null
  /** Quantos livros há em cada status (só os status com algum livro). */
  counts: Partial<Record<BookStatus, number>>
}

/** GET /api/books/stats: o contrato do DS + o primeiro ano com registro. */
export type StatsResponse = StatsPayload & { status: 'ok'; first_year: number }
