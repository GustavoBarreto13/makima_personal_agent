// Wrapper tipado dos endpoints /api/movies/*. Componentes nunca fazem fetch direto.
// Usa api.* de lib/api.ts (já inclui credentials:'include').

import { api } from '../../lib/api'
import type {
  DiaryEntry, FavoriteFilm, HeatmapDay, HomeData, Movie, MovieDetail, MovieList, MovieListDetail, SyncResult,
  Tag, TmdbResult, VaultItem, WatchLocation,
} from './types'

interface Ok { status: 'ok'; message?: string; [k: string]: unknown }
interface MovieResult { status: 'ok'; movie: Movie }

export interface WatchBody {
  watched_date?: string
  rating?: number | null
  review?: string | null
  tags?: string[]
  rewatch?: boolean | null
  source?: string
  companion_ids?: string[]
  watch_location_id?: string | null
}

export const akaneApi = {
  // ── busca e catálogo ──
  tmdbSearch: (q: string) => api.get<{ status: 'ok'; results: TmdbResult[] }>(`/api/movies/tmdb/search?q=${encodeURIComponent(q)}`),
  list: () => api.get<{ status: 'ok'; movies: Movie[] }>('/api/movies'),
  watchlist: () => api.get<{ status: 'ok'; movies: Movie[] }>('/api/movies/watchlist'),
  diary: (limit = 500) => api.get<{ status: 'ok'; entries: DiaryEntry[] }>(`/api/movies/diary?limit=${limit}`),
  detail: (id: string) => api.get<{ status: 'ok' } & MovieDetail>(`/api/movies/${id}`),

  // ── mutações do filme ──
  add: (body: { title?: string; tmdb_id?: number; status?: string; year?: number }) => api.post<Ok & { id?: string }>('/api/movies', body),
  logWatch: (movieId: string, body: WatchBody) => api.post<Ok & { diary_id?: string }>(`/api/movies/${movieId}/watch`, body),
  like: (movieId: string, liked: boolean) => api.patch<Ok>(`/api/movies/${movieId}/like`, { liked }),
  updateStatus: (movieId: string, status: string) => api.patch<Ok>(`/api/movies/${movieId}/status`, { status }),
  setNotes: (movieId: string, notes: string) => api.patch<Ok>(`/api/movies/${movieId}/notes`, { notes }),
  delete: (movieId: string) => api.del<Ok>(`/api/movies/${movieId}`),
  refreshMetadata: (movieId: string, tmdbId?: number) => api.post<MovieResult>(`/api/movies/${movieId}/refresh-metadata`, { tmdb_id: tmdbId ?? null }),
  updateCatalog: (movieId: string, body: Partial<{ title: string; year: number; director: string[]; genres: string[]; runtime: number; overview: string }>) =>
    api.patch<MovieResult>(`/api/movies/${movieId}/catalog`, body),

  // ── sessões ──
  deleteDiary: (diaryId: string) => api.del<Ok>(`/api/movies/diary/${diaryId}`),
  updateDiaryEntry: (diaryId: string, body: Partial<{
    watched_date: string; rating: number; review: string; tags: string[]; rewatch: boolean; companion_ids: string[]; watch_location_id: string | null
  }>) => api.patch<Ok>(`/api/movies/diary/${diaryId}`, body),
  reorderDiary: (watchedDate: string, orderedIds: string[]) => api.patch<Ok>('/api/movies/diary/reorder', { watched_date: watchedDate, ordered_ids: orderedIds }),
  watchLocations: (q = '') => api.get<{ status: 'ok'; locations: WatchLocation[] }>(`/api/movies/watch-locations?q=${encodeURIComponent(q)}`),
  createWatchLocation: (name: string, kind: WatchLocation['kind']) =>
    api.post<{ status: 'ok'; location: WatchLocation; created: boolean }>('/api/movies/watch-locations', { name, kind }),

  // ── agregações ──
  home: () => api.get<HomeData>('/api/movies/home'),
  heatmap: (year?: number) => api.get<{ status: 'ok'; year: number; days: HeatmapDay[] }>(`/api/movies/heatmap${year ? `?year=${year}` : ''}`),
  /** Estatísticas + Rewind no contrato StatsPayload (spec 072). */
  statsPayload: (year?: number, month?: number) => {
    const q = new URLSearchParams()
    if (year) q.set('year', String(year))
    if (month) q.set('month', String(month))
    const qs = q.toString()
    return api.get<import('../../design/core/stats').StatsPayload & { status: 'ok' }>(`/api/movies/stats/payload${qs ? `?${qs}` : ''}`)
  },
  setFavorites: (ids: string[]) => api.put<{ status: 'ok'; favorites: FavoriteFilm[] }>('/api/movies/favorites', { ids }),

  // ── listas e etiquetas ──
  lists: () => api.get<{ status: 'ok'; lists: MovieList[] }>('/api/movies/lists'),
  listDetail: (id: string) => api.get<{ status: 'ok' } & MovieListDetail>(`/api/movies/lists/${id}`),
  createList: (body: { name: string; description?: string; accent?: string; ranked?: boolean }) => api.post<Ok & { id?: string }>('/api/movies/lists', body),
  updateList: (id: string, body: Partial<{ name: string; description: string; accent: string; ranked: boolean }>) => api.patch<Ok>(`/api/movies/lists/${id}`, body),
  deleteList: (id: string) => api.del<Ok>(`/api/movies/lists/${id}`),
  addToList: (listId: string, movieId: string, position?: number) => api.post<Ok>(`/api/movies/lists/${listId}/items`, { movie_id: movieId, position }),
  removeFromList: (listId: string, movieId: string) => api.del<Ok>(`/api/movies/lists/${listId}/items/${movieId}`),
  tags: () => api.get<{ status: 'ok'; tags: Tag[] }>('/api/movies/tags'),

  // ── Letterboxd e Cofre ──
  syncLetterboxd: () => api.post<SyncResult>('/api/movies/sync-letterboxd', {}),
  addVault: (movieId: string, body: { type: string; title: string; url?: string; source?: string }) => api.post<Ok & { item?: VaultItem }>(`/api/movies/${movieId}/vault`, body),
  deleteVault: (vaultId: string) => api.del<Ok>(`/api/movies/vault/${vaultId}`),
}
