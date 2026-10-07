// Wrapper tipado dos endpoints /api/books/*. Componentes nunca fazem fetch direto.
// Usa api.* de lib/api.ts (já envia o cookie de sessão) e normaliza as respostas na borda (lib/normalize.ts).

import { api } from '../../lib/api'
import { normalizeBook, normalizeSession, normalizeShelf } from './lib/normalize'
import type {
  ApiBook, ApiBookDetail, ApiHistoryLog, ApiSession, ApiShelf, Bullet, BulletColor, FavoriteBook, GoogleBook, HomeData,
  StatsResponse,
} from './types'

/** Resposta de sucesso das rotas de escrita (a mensagem é HTML da tool da Frieren — não exibir crua). */
interface Ok { status: 'ok'; message?: string }

/** Campos editáveis de um livro (PATCH /metadata). `clear` apaga (grava vazio) os campos listados. */
export type MetadataPatch = Partial<{
  title: string
  author: string
  cover_url: string
  total_pages: number
  genre: string
  published_year: number
  isbn: string
  language: string
  description: string
  notes: string
  store_url: string
  price: number
  rating: number
  date_started: string
  date_finished: string
  clear: string[]
}>

export interface AddBookBody {
  title: string
  status?: string
  google_books_id?: string
  author?: string
  total_pages?: number
  isbn?: string
  cover_url?: string
  description?: string
  genre?: string
  language?: string
  published_year?: number
}

export const frierenApi = {
  // ── catálogo ──
  list: () => api.get<{ status: 'ok'; books: ApiBook[] }>('/api/books').then((r) => (r.books ?? []).map(normalizeBook)),
  detail: (id: string) => api.get<{ status: 'ok'; book: ApiBookDetail }>(`/api/books/${id}`).then((r) => r.book),
  history: (id: string) => api.get<{ status: 'ok'; logs: ApiHistoryLog[] }>(`/api/books/${id}/history`).then((r) => r.logs ?? []),
  searchGoogle: (q: string) =>
    api.get<{ status: 'ok'; results: GoogleBook[] }>(`/api/books/search-google?q=${encodeURIComponent(q)}`).then((r) => r.results ?? []),
  add: (body: AddBookBody) => api.post<Ok>('/api/books', body),
  delete: (id: string) => api.del<Ok>(`/api/books/${id}`),
  /** Desfaz a exclusão (o livro só tinha sido marcado como apagado). */
  restore: (id: string) => api.post<Ok>(`/api/books/${id}/restore`, {}),

  // ── estado do livro ──
  setStatus: (id: string, status: string) => api.patch<Ok>(`/api/books/${id}/status`, { status }),
  like: (id: string, liked: boolean) => api.patch<Ok & { liked: boolean }>(`/api/books/${id}/like`, { liked }),
  updateMetadata: (id: string, patch: MetadataPatch) => api.patch<Ok>(`/api/books/${id}/metadata`, patch),
  finish: (id: string, body: { rating?: number; date_finished?: string; date_started?: string; notes?: string }) =>
    api.post<Ok>(`/api/books/${id}/finish`, body),

  // ── sessões de leitura ──
  log: (id: string, body: { current_page: number; session_notes?: string; log_date?: string }) =>
    api.post<Ok & { log_id: string | null }>(`/api/books/${id}/log`, body),
  sessions: (limit = 1000) =>
    api.get<{ status: 'ok'; activity: ApiSession[] }>(`/api/books/activity?limit=${limit}`).then((r) => (r.activity ?? []).map(normalizeSession)),
  updateSession: (bookId: string, logId: string, body: { current_page?: number; session_notes?: string; log_date?: string }) =>
    api.patch<Ok>(`/api/books/${bookId}/logs/${logId}`, body),
  deleteSession: (bookId: string, logId: string) => api.del<Ok>(`/api/books/${bookId}/logs/${logId}`),
  /** Desfaz a exclusão de uma sessão, regravando-a com os mesmos valores (inclusive o ID). */
  restoreSession: (bookId: string, log: { id: string; date: string; page_start: number; page_end: number; pages_read: number; session_notes: string }) =>
    api.post<Ok>(`/api/books/${bookId}/logs/restore`, log),

  // ── agregações ──
  home: () => api.get<HomeData>('/api/books/home'),
  heatmap: (year: number) =>
    api.get<{ status: 'ok'; heatmap: { date: string; pages: number }[] }>(`/api/books/heatmap?year=${year}`).then((r) => r.heatmap ?? []),
  /** Estatísticas no contrato StatsPayload (spec 073). */
  stats: (year?: number, month?: number) => {
    const q = new URLSearchParams()
    if (year) q.set('year', String(year))
    if (month) q.set('month', String(month))
    const qs = q.toString()
    return api.get<StatsResponse>(`/api/books/stats/payload${qs ? `?${qs}` : ''}`)
  },
  favorites: () => api.get<{ status: 'ok'; favorites: FavoriteBook[] }>('/api/books/favorites').then((r) => r.favorites ?? []),
  setFavorites: (ids: string[]) => api.put<{ status: 'ok'; favorites: FavoriteBook[] }>('/api/books/favorites', { ids }),

  // ── estantes ──
  shelves: () => api.get<{ status: 'ok'; shelves: ApiShelf[] }>('/api/books/shelves').then((r) => (r.shelves ?? []).map(normalizeShelf)),
  createShelf: (body: { name: string; description?: string; accent?: string }) =>
    api.post<{ status: 'ok'; id: string }>('/api/books/shelves', body),
  updateShelf: (id: string, body: { name?: string; description?: string; accent?: string }) => api.patch<Ok>(`/api/books/shelves/${id}`, body),
  deleteShelf: (id: string) => api.del<Ok>(`/api/books/shelves/${id}`),
  addToShelf: (shelfId: string, bookId: string) => api.post<Ok>(`/api/books/shelves/${shelfId}/books/${bookId}`, {}),
  removeFromShelf: (shelfId: string, bookId: string) => api.del<Ok>(`/api/books/shelves/${shelfId}/books/${bookId}`),

  // ── marcações coloridas ──
  bullets: (bookId: string) => api.get<{ status: 'ok'; bullets: Bullet[] }>(`/api/books/${bookId}/bullets`).then((r) => r.bullets ?? []),
  createBullet: (bookId: string, body: { content: string; color: BulletColor; page_number?: number | null }) =>
    api.post<{ status: 'ok'; bullet: Bullet }>(`/api/books/${bookId}/bullets`, body),
  updateBullet: (id: string, body: Partial<{ content: string; color: BulletColor; page_number: number | null }>) =>
    api.patch<{ status: 'ok'; bullet: Bullet }>(`/api/books/bullets/${id}`, body),
  deleteBullet: (id: string) => api.del<Ok>(`/api/books/bullets/${id}`),
}

export type FrierenApi = typeof frierenApi
