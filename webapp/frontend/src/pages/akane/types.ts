// Interfaces TypeScript do domínio Filmes (Akane).
// Espelham os shapes retornados pela /api/movies/* (contracts/movies-api.md).

// ── Filme (catálogo) ────────────────────────────────────────────────────────

/** Status de um filme no catálogo. */
export type MovieStatus = 'watchlist' | 'watched'

/** Origem da entrada. */
export type MovieSource = 'manual' | 'letterboxd_rss' | 'letterboxd_csv'

/** Origem da nota. */
export type RatingSource = 'own' | 'letterboxd' | null

/**
 * Filme no catálogo — campos para o grid e detalhe.
 * Retornado por GET /api/movies e GET /api/movies/{id}.
 */
export interface Movie {
  id: string
  tmdb_id: number | null
  imdb_id: string | null
  letterboxd_uri: string | null
  title: string
  normalizado: string
  year: number | null
  director: string[]
  genres: string[]
  runtime: number | null          // Duração em minutos
  overview: string | null         // Sinopse (até 2000 chars)
  poster_url: string | null       // URL pôster TMDB (w500); NULL → pôster tipográfico
  backdrop_url: string | null     // URL backdrop TMDB (w1280)
  poster_palette: string          // Paleta do pôster tipográfico (uma das 14)
  status: MovieStatus
  rating: number | null           // Nota atual (0.5–5.0)
  rating_source: RatingSource     // 'letterboxd' → exibe selo "via Letterboxd"
  liked: boolean                  // Coração (curtir)
  tags: string[]
  notes: string | null            // Anotações soltas (≠ review da sessão)
  last_watched_date: string | null // ISO date da sessão mais recente
  times_watched: number           // Contagem de sessões (inclui rewatches)
  source: MovieSource
  created_at: string
  updated_at: string
  deleted: boolean
}

// ── Sessão do diário ────────────────────────────────────────────────────────

/**
 * Entrada do diário — representa UMA sessão de visualização.
 * Um mesmo filme pode ter múltiplas entradas (rewatches).
 * Retornado por GET /api/movies/diary e dentro de GET /api/movies/{id}.
 */
export interface DiaryEntry {
  id: string
  movie_id: string
  movie_title: string | null      // Denormalizado para evitar JOIN na lista
  poster_url: string | null       // Pôster do filme (vem do JOIN com movies)
  poster_palette: string          // Paleta tipográfica do filme
  watched_date: string            // ISO date
  rating: number | null
  rewatch: boolean
  review: string | null
  tags: string[]
}

// ── Pessoas (elenco/equipe) ─────────────────────────────────────────────────

/** Pessoa associada a um filme (diretor, ator, roteirista, etc.). */
export interface MoviePerson {
  id: string
  name: string
  role: string | null             // Ex.: "Direção", "Roteiro", "Fotografia"
  is_person_tag: boolean          // TRUE se também é etiqueta em movies.tags
  person_id: string | null        // RESERVADO — FK futura para hub 014
}

// ── Cofre de conteúdos ──────────────────────────────────────────────────────

/** Tipo de conteúdo do Cofre. */
export type VaultType = 'video' | 'article' | 'essay' | 'review'

/** Item do Cofre — conteúdo salvo sobre um filme. */
export interface VaultItem {
  id: string
  type: VaultType
  title: string
  url: string | null
  source: string | null           // Domínio de exibição (ex.: youtube.com)
}

// ── Detalhe completo do filme ───────────────────────────────────────────────

/** Shape completo retornado por GET /api/movies/{id}. */
export interface MovieDetail {
  movie: Movie
  people: MoviePerson[]
  vault: VaultItem[]
  diary: DiaryEntry[]
}

// ── Listas / Coleções ───────────────────────────────────────────────────────

/** Metadados de uma lista (GET /api/movies/lists). */
export interface MovieList {
  id: string
  name: string
  description: string
  accent: string | null
  ranked: boolean
  count: number                   // Contagem de filmes na lista (calculada na query)
}

/** Detalhe de uma lista com filmes. */
export interface MovieListDetail {
  list: Omit<MovieList, 'count'>
  films: (Pick<Movie, 'id' | 'title' | 'year' | 'poster_url' | 'poster_palette' | 'rating' | 'liked'> & { position: number | null })[]
}

// ── Etiquetas ────────────────────────────────────────────────────────────────

/** Etiqueta com contagem e flag de pessoa. */
export interface Tag {
  name: string
  count: number
  person: boolean   // TRUE = também é uma pessoa (via movie_people.is_person_tag)
}

// ── Favoritos ───────────────────────────────────────────────────────────────

/** Item da vitrine de favoritos. */
export interface FavoriteFilm {
  id: string
  title: string
  poster_url: string | null
  poster_palette: string
  position: number
}

// ── Estatísticas ─────────────────────────────────────────────────────────────

/** Estatísticas do ano. */
export interface Stats {
  status: 'ok'
  year: number
  total_films: number
  total_sessions: number
  rewatches: number
  avg_rating: number | null
  top_genres: Array<{ genre: string; count: number }>
  top_directors: Array<{ director: string; count: number }>
  rating_histogram: Record<string, number>   // {"0.5": 0, "1.0": 3, ...}
}

/** Rewind (year-in-review enriquecido). */
export interface Rewind extends Stats {
  total_minutes: number
  monthly: number[]              // 12 valores, jan→dez
  liked_count: number
  top_people: Array<{ name: string; count: number; roles: string[] }>
  top_decade: { decade: number; count: number } | null
  max_sessions: number           // Maior maratona (max sessões num dia)
  favorite: { id: string; title: string; rating: number } | null
}

/** Dia do heatmap. */
export interface HeatmapDay {
  date: string                   // ISO date (YYYY-MM-DD)
  count: number                  // Número de sessões naquele dia
}

// ── Tela Início ─────────────────────────────────────────────────────────────

/** Shape do GET /api/movies/home. */
export interface HomeData {
  status: 'ok'
  favorites: FavoriteFilm[]
  recent_activity: Array<DiaryEntry & { liked: boolean }>
  watchlist_highlight: Pick<Movie, 'id' | 'title' | 'year' | 'poster_url' | 'poster_palette' | 'director' | 'runtime'>[]
  rating_histogram: Record<string, number>
  sessions_7d: number
  sessions_7d_prev: number
  last_session: { title: string; rating: number | null; watched_date: string } | null
  counts: { films_watched: number; diary: number; watchlist: number }
}

// ── Tweaks ──────────────────────────────────────────────────────────────────

/** Configurações locais do Shell (localStorage). */
export interface Tweaks {
  theme: 'dark' | 'light'        // Tema
  accent: 'teal' | '' | 'carmim' | 'ambar'  // Acento
  density: 'large' | 'medium' | 'compact'   // Densidade do grid
  sort: 'recent' | 'rating' | 'title' | 'director' | 'year' | 'runtime'  // Ordenação padrão
}

/** Valores padrão dos tweaks (teal por padrão, escuro, médio). */
export const TWEAK_DEFAULTS: Tweaks = {
  theme:   'dark',
  accent:  'teal',   // padrão de fábrica definido no design guide
  density: 'medium',
  sort:    'recent',
}

// ── Resultado de sync Letterboxd ─────────────────────────────────────────────

/** Resultado do POST /api/movies/sync-letterboxd. */
export interface SyncResult {
  status: 'ok'
  created: number
  updated: number
  skipped: number
  errors: number
}

// ── Views internas do Shell ──────────────────────────────────────────────────

/** Views possíveis do shell de filmes. */
export type AkaneView =
  | 'home'
  | 'films'
  | 'diary'
  | 'watchlist'
  | 'lists'
  | 'list'
  | 'tags'
  | 'rewind'
  | 'detail'
  | 'stats'
