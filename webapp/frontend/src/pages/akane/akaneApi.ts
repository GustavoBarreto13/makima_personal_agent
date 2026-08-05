// Wrapper tipado dos endpoints /api/movies/*.
// Componentes nunca fazem fetch direto — usam este objeto (padrão do projeto).
// Usa api.* de lib/api.ts que já inclui credentials:'include' (cookie de sessão).

import { api } from '../../lib/api'
import type {
  Movie,
  DiaryEntry,
  MovieDetail,
  Stats,
  Rewind,
  HeatmapDay,
  HomeData,
  FavoriteFilm,
  MovieList,
  MovieListDetail,
  Tag,
  VaultItem,
  SyncResult,
  WatchLocation,
} from './types'

// ── Shape dos resultados de listagem ────────────────────────────────────────

interface MoviesResult     { status: 'ok'; movies: Movie[] }
interface DiaryResult      { status: 'ok'; entries: DiaryEntry[] }
interface FavoritesResult  { status: 'ok'; favorites: FavoriteFilm[] }
interface ListsResult      { status: 'ok'; lists: MovieList[] }
interface TagsResult       { status: 'ok'; tags: Tag[] }
interface VaultResult      { status: 'ok'; items: VaultItem[] }
interface PeopleResult     { status: 'ok'; people: Array<{ name: string; count: number; roles: string[] }> }
interface TmdbSearchResult { status: 'ok'; results: Array<{ tmdb_id: number; title: string; year: number | null; poster_url: string | null; director: string[]; local_id: string | null; in_catalog: boolean }> }
interface OkResult         { status: 'ok'; message?: string; [k: string]: unknown }
interface MovieResult      { status: 'ok'; movie: Movie }
interface DiaryEntryResult { status: 'ok'; entry: DiaryEntry; movie: Pick<Movie, 'last_watched_date' | 'times_watched'> }
interface WatchLocationsResult { status: 'ok'; locations: WatchLocation[] }

// ── API pública ──────────────────────────────────────────────────────────────

export const akaneApi = {

  // ── Busca TMDB ─────────────────────────────────────────────────────────────
  /** Busca filmes no TMDB por texto (não grava no banco). */
  tmdbSearch: (q: string) =>
    api.get<TmdbSearchResult>(`/api/movies/tmdb/search?q=${encodeURIComponent(q)}`),

  // ── Catálogo (listagens) ───────────────────────────────────────────────────
  /**
   * Lista filmes do catálogo com filtros opcionais.
   * status, sort, genre, tag, filter são todos opcionais.
   */
  list: (params?: { status?: string; sort?: string; genre?: string; tag?: string; filter?: string }) => {
    const q = new URLSearchParams()
    if (params?.status)  q.set('status',  params.status)
    if (params?.sort)    q.set('sort',    params.sort)
    if (params?.genre)   q.set('genre',   params.genre)
    if (params?.tag)     q.set('tag',     params.tag)
    if (params?.filter)  q.set('filter',  params.filter)
    const qs = q.toString()
    return api.get<MoviesResult>(`/api/movies${qs ? '?' + qs : ''}`)
  },

  /** Retorna apenas a watchlist. */
  watchlist: () => api.get<MoviesResult>('/api/movies/watchlist'),

  /** Retorna o diário de sessões (limite opcional, padrão 50). */
  diary: (limit = 50) => api.get<DiaryResult>(`/api/movies/diary?limit=${limit}`),

  /** Detalhe completo de um filme: movie + people + vault + diary. */
  detail: (id: string) => api.get<{ status: 'ok' } & Omit<MovieDetail, never>>(`/api/movies/${id}`),

  /** Estatísticas do ano. */
  stats: (year?: number) => {
    const qs = year ? `?year=${year}` : ''
    return api.get<Stats>(`/api/movies/stats${qs}`)
  },

  // ── Mutações ───────────────────────────────────────────────────────────────
  /** Adiciona um filme ao catálogo. */
  add: (body: {
    title?: string
    tmdb_id?: number
    status?: string
    year?: number
    letterboxd_uri?: string
    source?: string
  }) => api.post<OkResult>('/api/movies', body),

  /** Loga uma sessão de visualização. */
  logWatch: (movieId: string, body: {
    watched_date?: string
    rating?: number | null
    review?: string | null
    tags?: string[]
    rewatch?: boolean | null
    source?: string
    companion_ids?: string[]
    watch_location_id?: string | null
  }) => api.post<OkResult>(`/api/movies/${movieId}/watch`, body),

  watchLocations: (q = '') => api.get<WatchLocationsResult>(`/api/movies/watch-locations?q=${encodeURIComponent(q)}`),
  createWatchLocation: (name: string, kind: WatchLocation['kind']) =>
    api.post<{ status: 'ok'; location: WatchLocation; created: boolean }>('/api/movies/watch-locations', { name, kind }),

  /** Define a nota do filme. */
  rate: (movieId: string, rating: number) =>
    api.patch<OkResult>(`/api/movies/${movieId}/rating`, { rating }),

  /** Marca ou desmarca o coração (liked). */
  like: (movieId: string, liked: boolean) =>
    api.patch<OkResult>(`/api/movies/${movieId}/like`, { liked }),

  /** Atualiza o status do filme. */
  updateStatus: (movieId: string, status: string) =>
    api.patch<OkResult>(`/api/movies/${movieId}/status`, { status }),

  /** Salva anotações soltas. */
  setNotes: (movieId: string, notes: string) =>
    api.patch<OkResult>(`/api/movies/${movieId}/notes`, { notes }),

  /** Soft-delete do filme. */
  delete: (movieId: string) => api.del<OkResult>(`/api/movies/${movieId}`),

  /** Remove uma sessão do diário. */
  deleteDiary: (diaryId: string) => api.del<OkResult>(`/api/movies/diary/${diaryId}`),

  /**
   * Rebusca metadados do filme no TMDB — botão "Buscar Dados" (spec 050).
   * Sem `tmdbId`: usa o tmdb_id já salvo, ou busca por título+ano.
   * Com `tmdbId`: aplica esse candidato específico (troca de match).
   */
  refreshMetadata: (movieId: string, tmdbId?: number) =>
    api.post<MovieResult>(`/api/movies/${movieId}/refresh-metadata`, { tmdb_id: tmdbId ?? null }),

  /** Edita campos de catálogo de um filme (título, ano, diretor, gêneros, duração, sinopse). */
  updateCatalog: (movieId: string, body: Partial<{
    title: string
    year: number
    director: string[]
    genres: string[]
    runtime: number
    overview: string
  }>) => api.patch<MovieResult>(`/api/movies/${movieId}/catalog`, body),

  /** Edita uma sessão do diário (data, nota, resenha, tags, revisão). */
  updateDiaryEntry: (diaryId: string, body: Partial<{
    watched_date: string
    rating: number
    review: string
    tags: string[]
    rewatch: boolean
    companion_ids: string[]
    watch_location_id: string | null
  }>) => api.patch<DiaryEntryResult>(`/api/movies/diary/${diaryId}`, body),

  /** Reordena sessões de um mesmo dia. */
  reorderDiary: (watchedDate: string, orderedIds: string[]) =>
    api.patch<OkResult>('/api/movies/diary/reorder', { watched_date: watchedDate, ordered_ids: orderedIds }),

  // ── Agregações (Onda 4) ────────────────────────────────────────────────────
  /** Dados da tela Início em uma chamada. */
  home: () => api.get<HomeData>('/api/movies/home'),

  /** Year-in-review. */
  rewind: (year?: number) => {
    const qs = year ? `?year=${year}` : ''
    return api.get<Rewind>(`/api/movies/rewind${qs}`)
  },

  /** Heatmap de sessões/dia. */
  heatmap: (year?: number) => {
    const qs = year ? `?year=${year}` : ''
    return api.get<{ status: 'ok'; year: number; days: HeatmapDay[] }>(`/api/movies/heatmap${qs}`)
  },

  /** Pessoas com mais filmes no catálogo. */
  people: (limit = 10) => api.get<PeopleResult>(`/api/movies/people?limit=${limit}`),

  /** Vitrine de favoritos. */
  favorites: () => api.get<FavoritesResult>('/api/movies/favorites'),

  /** Substitui a vitrine de favoritos (até 4 filmes). */
  setFavorites: (ids: string[]) => api.put<FavoritesResult>('/api/movies/favorites', { ids }),

  // ── Listas ─────────────────────────────────────────────────────────────────
  /** Lista todas as coleções. */
  lists: () => api.get<ListsResult>('/api/movies/lists'),

  /** Detalhe de uma lista com filmes. */
  listDetail: (id: string) => api.get<{ status: 'ok' } & MovieListDetail>(`/api/movies/lists/${id}`),

  /** Cria nova lista. */
  createList: (body: { name: string; description?: string; accent?: string; ranked?: boolean }) =>
    api.post<OkResult>('/api/movies/lists', body),

  /** Atualiza lista. */
  updateList: (id: string, body: Partial<{ name: string; description: string; accent: string; ranked: boolean }>) =>
    api.patch<OkResult>(`/api/movies/lists/${id}`, body),

  /** Remove lista. */
  deleteList: (id: string) => api.del<OkResult>(`/api/movies/lists/${id}`),

  /** Adiciona filme a uma lista. */
  addToList: (listId: string, movie_id: string, position?: number) =>
    api.post<OkResult>(`/api/movies/lists/${listId}/items`, { movie_id, position }),

  /** Remove filme de uma lista. */
  removeFromList: (listId: string, movieId: string) =>
    api.del<OkResult>(`/api/movies/lists/${listId}/items/${movieId}`),

  // ── Etiquetas ──────────────────────────────────────────────────────────────
  /** Nuvem de etiquetas com contagem e flag de pessoa. */
  tags: () => api.get<TagsResult>('/api/movies/tags'),

  // ── Sync Letterboxd ────────────────────────────────────────────────────────
  /** Dispara sincronização manual com o feed RSS do Letterboxd (POST 202). */
  syncLetterboxd: () => api.post<SyncResult>('/api/movies/sync-letterboxd', {}),

  // ── Cofre de conteúdos ─────────────────────────────────────────────────────
  /** Itens do Cofre de um filme. */
  vault: (movieId: string) => api.get<VaultResult>(`/api/movies/${movieId}/vault`),

  /** Adiciona item ao Cofre. */
  addVault: (movieId: string, body: { type: string; title: string; url?: string; source?: string }) =>
    api.post<OkResult>(`/api/movies/${movieId}/vault`, body),

  /** Remove item do Cofre. */
  deleteVault: (vaultId: string) => api.del<OkResult>(`/api/movies/vault/${vaultId}`),
}
