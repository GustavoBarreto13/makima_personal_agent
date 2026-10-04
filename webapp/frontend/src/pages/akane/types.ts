// Interfaces TypeScript do domínio Filmes (Akane). Espelham os shapes da /api/movies/*
// (contrato detalhado em specs/015-akane-filmes/contracts/movies-api.md).

export type MovieStatus = 'watchlist' | 'watched'
export type RatingSource = 'own' | 'letterboxd' | null

/** Filme no catálogo. */
export interface Movie {
  id: string
  tmdb_id: number | null
  imdb_id: string | null
  letterboxd_uri: string | null
  title: string
  year: number | null
  director: string[]
  genres: string[]
  runtime: number | null
  overview: string | null
  poster_url: string | null
  backdrop_url: string | null
  poster_palette: string
  status: MovieStatus
  rating: number | null
  rating_source: RatingSource
  liked: boolean
  tags: string[]
  notes: string | null
  last_watched_date: string | null
  times_watched: number
  original_language: string | null
  countries: string[] | null
  watchlist_added_at: string | null
  created_at: string
}

/** Local reutilizável onde uma sessão foi assistida. */
export interface WatchLocation {
  id: string
  name: string
  kind: 'cinema' | 'streaming'
}

/** Uma sessão de visualização (um filme pode ter várias: revisões). */
export interface DiaryEntry {
  id: string
  movie_id: string
  movie_title: string | null
  poster_url: string | null
  poster_palette: string
  watched_date: string
  rating: number | null
  rewatch: boolean
  review: string | null
  tags: string[]
  companions: Array<{ id: string; name: string }>
  watch_location: WatchLocation | null
  /** Só no Início (atividade recente): o coração é do filme. */
  liked?: boolean
}

export interface MoviePerson {
  id: string
  name: string
  role: string | null
}

export type VaultType = 'video' | 'article' | 'essay' | 'review'

export interface VaultItem {
  id: string
  type: VaultType
  title: string
  url: string | null
  source: string | null
}

export interface MovieDetail {
  movie: Movie
  people: MoviePerson[]
  vault: VaultItem[]
  diary: DiaryEntry[]
}

export interface MovieList {
  id: string
  name: string
  description: string
  accent: string | null
  ranked: boolean
  count: number
  created_at?: string
}

export interface MovieListDetail {
  list: Omit<MovieList, 'count'>
  films: (Pick<Movie, 'id' | 'title' | 'year' | 'poster_url' | 'poster_palette' | 'rating' | 'liked'> & { position: number | null })[]
}

export interface Tag {
  name: string
  count: number
  person: boolean
}

export interface FavoriteFilm {
  id: string
  title: string
  poster_url: string | null
  poster_palette: string
  position: number
}

export interface HeatmapDay {
  date: string
  count: number
}

/** GET /api/movies/home. */
export interface HomeData {
  status: 'ok'
  favorites: FavoriteFilm[]
  recent_activity: DiaryEntry[]
  watchlist_highlight: Pick<Movie, 'id' | 'title' | 'year' | 'poster_url' | 'poster_palette' | 'director' | 'runtime'>[]
  rating_histogram: Record<string, number>
  sessions_7d: number
  sessions_7d_prev: number
  last_session: { title: string; rating: number | null; watched_date: string } | null
  counts: { films_watched: number; diary: number; watchlist: number }
}

/** GET /api/movies/stats: o contrato do DS mais o ano da primeira sessão (limite do seletor de ano). */
export type StatsResponse = import('../../design/core/stats').StatsPayload & { status: 'ok'; first_year: number }

export interface SyncResult {
  status: 'ok'
  created: number
  updated: number
  skipped: number
  errors: number
}

/** Resultado da busca no TMDB; `local_id` aponta para o filme se ele já está no catálogo. */
export interface TmdbResult {
  tmdb_id: number
  title: string
  year: number | null
  poster_url: string | null
  director: string[]
  local_id: string | null
  in_catalog: boolean
}
