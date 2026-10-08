// Wrapper tipado dos endpoints /api/animes/*. Componentes nunca fazem fetch direto.
// Usa api.* de lib/api.ts (já inclui credentials:'include'). Tudo que volta passa por lib/normalize.ts, então
// as telas recebem listas sempre listas e a nota já em estrelas (e mandam estrelas: a conversão para a escala do
// MAL é feita aqui, no `rate`/`logWatch`).

import { api } from '../../lib/api'
import {
  normalizeAnime, normalizeEpisode, normalizeHome, normalizeList, normalizeListItem, normalizeSchedule, normalizeSearch, normalizeSession,
} from './lib/normalize'
import { toMal } from './lib/score'
import type {
  Anime, AnimeDetailData, AnimeList, AnimeListItem, AnimeStatus, ApiAnime, ApiEpisode, ApiHome, ApiList, ApiListItem, ApiLog,
  ApiScheduleItem, ApiSearchResult, Episode, HomeData, ScheduleItem, SearchResult, Session, StatsResponse, SyncResult, TagEntry,
} from './types'

interface Ok { status?: 'ok'; message?: string; [k: string]: unknown }

export interface WatchBody {
  ep_start?: number | null
  ep_end?: number | null
  watched_date?: string
  /** Nota da sessão em ESTRELAS (0.5–5); a conversão para a escala do MAL acontece aqui. */
  stars?: number | null
  notes?: string | null
}

/** A sessão apagada que o "Desfazer" devolve ao servidor, com o mesmo ID. */
export interface RestoreLog {
  id: string
  anime_id: string
  watched_date: string
  ep_start: number | null
  ep_end: number | null
  episodes_count: number | null
  /** Nota da sessão em estrelas. */
  stars: number | null
  notes: string | null
  source: string
}

const animes = (r: { animes?: ApiAnime[] | null }): Anime[] => (r.animes ?? []).map(normalizeAnime)
const animes_fav = (r: { favorites?: ApiAnime[] | null }): Anime[] => (r.favorites ?? []).map(normalizeAnime)

export const marinApi = {
  // ── catálogo e busca ──
  search: (q: string, limit = 8) =>
    api.get<{ results?: ApiSearchResult[] }>(`/api/animes/search?q=${encodeURIComponent(q)}&limit=${limit}`)
      .then((r): SearchResult[] => (r.results ?? []).map(normalizeSearch)),
  list: () => api.get<{ animes?: ApiAnime[] }>('/api/animes').then(animes),
  diary: (limit = 500) => api.get<{ logs?: ApiLog[] }>(`/api/animes/diary?limit=${limit}`).then((r): Session[] => (r.logs ?? []).map(normalizeSession)),
  schedule: (days = 14) => api.get<{ schedule?: ApiScheduleItem[] }>(`/api/animes/schedule?days=${days}`).then((r): ScheduleItem[] => (r.schedule ?? []).map(normalizeSchedule)),
  home: () => api.get<ApiHome>('/api/animes/home').then((r): HomeData => normalizeHome(r)),
  detail: (id: string) =>
    api.get<{ anime: ApiAnime; next_episode: ApiEpisode | null; episodes?: ApiEpisode[]; episodes_total_cached?: number; recent_logs?: ApiLog[] }>(`/api/animes/${id}`)
      .then((r): AnimeDetailData => ({
        anime: normalizeAnime(r.anime),
        next: r.next_episode ? normalizeEpisode(r.next_episode) : null,
        episodes: (r.episodes ?? []).map(normalizeEpisode),
        episodesTotal: r.episodes_total_cached ?? 0,
        // O detalhe devolve as sessões sem o título do anime; completa para reaproveitar o editor e o excluir.
        logs: (r.recent_logs ?? []).map((l) => normalizeSession({ ...l, anime_id: r.anime.id, anime_title: r.anime.title })),
      })),
  episodes: (id: string, page = 1) =>
    api.get<{ episodes?: ApiEpisode[]; total?: number; page?: number }>(`/api/animes/${id}/episodes?page=${page}`)
      .then((r): { episodes: Episode[]; total: number } => ({ episodes: (r.episodes ?? []).map(normalizeEpisode), total: r.total ?? 0 })),

  // ── mutações do anime ──
  add: (malId: number) => api.post<Ok & { id?: string }>('/api/animes', { mal_id: malId }),
  logWatch: (animeId: string, b: WatchBody) =>
    api.post<Ok & { log_id?: string }>(`/api/animes/${animeId}/log`, {
      ep_start: b.ep_start ?? null,
      ep_end: b.ep_end ?? null,
      watched_date: b.watched_date,
      rating: b.stars ? toMal(b.stars) : null,
      notes: b.notes ?? null,
    }),
  updateStatus: (animeId: string, status: AnimeStatus) => api.patch<Ok>(`/api/animes/${animeId}/status`, { status }),
  rate: (animeId: string, stars: number | null) => api.patch<Ok>(`/api/animes/${animeId}/score`, { score: toMal(stars) }),
  like: (animeId: string, liked: boolean) => api.patch<Ok>(`/api/animes/${animeId}/like`, { liked }),
  setNotes: (animeId: string, notes: string) => api.patch<Ok>(`/api/animes/${animeId}/notes`, { notes }),
  refreshMetadata: (animeId: string) => api.post<Ok>(`/api/animes/${animeId}/refresh-metadata`, {}),
  deleteAnime: (animeId: string) => api.del<Ok>(`/api/animes/${animeId}`),
  restoreAnime: (animeId: string) => api.post<Ok>(`/api/animes/${animeId}/restore`, {}),
  addTag: (animeId: string, tag: string) => api.post<Ok>(`/api/animes/${animeId}/tags`, { tag }),
  removeTag: (animeId: string, tag: string) => api.del<Ok>(`/api/animes/${animeId}/tags/${encodeURIComponent(tag)}`),

  // ── sessões ──
  deleteLog: (logId: string) => api.del<Ok>(`/api/animes/logs/${logId}`),
  restoreLog: (l: RestoreLog) =>
    api.post<Ok>('/api/animes/logs/restore', {
      id: l.id, anime_id: l.anime_id, watched_date: l.watched_date, ep_start: l.ep_start, ep_end: l.ep_end,
      episodes_count: l.episodes_count, rating: l.stars ? toMal(l.stars) : null, notes: l.notes, source: l.source,
    }),

  // ── favoritos (vitrine do Início) ──
  favorites: () => api.get<{ favorites?: ApiAnime[] }>('/api/animes/favorites').then(animes_fav),
  setFavorites: (ids: string[]) => api.put<Ok>('/api/animes/favorites', { ids }),

  // ── listas e etiquetas ──
  lists: () => api.get<{ lists?: ApiList[] }>('/api/animes/lists').then((r): AnimeList[] => (r.lists ?? []).map(normalizeList)),
  listDetail: (id: string) =>
    api.get<{ list: ApiList; animes?: ApiListItem[] }>(`/api/animes/lists/${id}`)
      .then((r): { list: AnimeList; items: AnimeListItem[] } => ({ list: normalizeList(r.list), items: (r.animes ?? []).map(normalizeListItem) })),
  createList: (b: { name: string; description?: string; ranked?: boolean }) => api.post<Ok & { id?: string }>('/api/animes/lists', b),
  updateList: (id: string, b: Partial<{ name: string; description: string; ranked: boolean }>) => api.patch<Ok>(`/api/animes/lists/${id}`, b),
  deleteList: (id: string) => api.del<Ok>(`/api/animes/lists/${id}`),
  addToList: (listId: string, animeId: string, position?: number) => api.post<Ok>(`/api/animes/lists/${listId}/items`, { anime_id: animeId, position }),
  removeFromList: (listId: string, animeId: string) => api.del<Ok>(`/api/animes/lists/${listId}/items/${animeId}`),
  tags: () => api.get<{ tags?: TagEntry[] }>('/api/animes/tags').then((r) => r.tags ?? []),

  // ── estatísticas e MyAnimeList ──
  /** Estatísticas + Rewind no contrato StatsPayload (spec 074). */
  statsPayload: (year?: number, month?: number) => {
    const q = new URLSearchParams()
    if (year) q.set('year', String(year))
    if (month) q.set('month', String(month))
    const qs = q.toString()
    return api.get<StatsResponse>(`/api/animes/stats${qs ? `?${qs}` : ''}`)
  },
  syncMal: (full = false) => api.post<SyncResult>('/api/animes/sync', { full }),
}

export type MarinApi = typeof marinApi
