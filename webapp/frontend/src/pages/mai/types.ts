/**
 * types.ts — Mai Sakurajima · Séries de TV (fatia 022)
 *
 * Interfaces TypeScript que espelham os contratos de dados do backend
 * (/api/series/*). Usadas em maiApi.ts, nos screens e nos componentes.
 */

// ── Enums de estado ────────────────────────────────────────────────────────

/** Status do usuário em relação à série (série.status no banco). */
export type MaiStatus =
  | 'quero_assistir'  // Na watchlist
  | 'assistindo'      // Assistindo ativamente
  | 'concluida'       // Terminou de assistir
  | 'pausada'         // Pausado temporariamente
  | 'abandonada'      // Desistiu

/** Paletas de pôster tipográfico (fallback quando poster_url é null). */
export type PosterKey =
  | 'periwinkle' | 'dusk' | 'amber' | 'slate' | 'wine' | 'teal'
  | 'moss'       | 'rose' | 'indigo'| 'sand'  | 'steel'| 'plum'

/** Modo de tema da shell (armazenado em tweaks). */
export type ThemeMode = 'dark' | 'light'

/** Acento de cor da shell (armazenado em tweaks). */
export type Accent = 'periwinkle' | 'rose' | 'amber' | 'noir'

/** Densidade visual da shell (armazenado em tweaks). */
export type Density = 'compact' | 'medium' | 'cozy'

/** Telas disponíveis na shell da Mai (roteamento por estado). */
export type MaiView =
  | 'home'       // Tela Início (default)
  | 'catalog'    // Catálogo com filtros e pôsteres
  | 'diary'      // Diário de sessões
  | 'watchlist'  // Lista "Quero Assistir"
  | 'upcoming'   // Próximos episódios
  | 'stats'      // Estatísticas anuais
  | 'detail'     // Detalhe de uma série (param = series_id)
  | 'search'     // Busca (modal de adição)

// ── Entidade: Série ────────────────────────────────────────────────────────

/**
 * Série no catálogo do usuário.
 * Espelha a tabela `series` do banco (omitindo campos internos).
 */
export interface Series {
  id: string
  tmdb_id: number | null
  imdb_id: string | null
  title: string
  title_original: string | null
  normalizado: string
  first_air_date: string | null   // ISO date YYYY-MM-DD
  last_air_date: string | null
  series_status: string | null    // 'no_ar' | 'finalizada' | 'cancelada' | 'nao_lancada'
  network: string | null
  seasons_count: number | null
  episodes_count: number | null
  episodes_watched: number
  status: MaiStatus
  rating: number | null           // 0.5–5.0
  rating_source: string | null    // 'own' | null
  poster_url: string | null
  backdrop_url: string | null
  overview: string | null
  genres: string[]
  tags: string[]
  notes: string | null
  date_started: string | null
  date_finished: string | null
  source: string | null           // 'manual' | 'tmdb_sync'
  created_at: string
  updated_at: string
  deleted: boolean
  /** Paleta tipográfica determinística para fallback sem poster_url. */
  poster_palette?: PosterKey
}

// ── Entidade: Temporada ────────────────────────────────────────────────────

/**
 * Temporada de uma série (cache TMDB).
 * Espelha a tabela `seasons`.
 */
export interface Season {
  id: string
  series_id: string
  season_number: number
  name: string | null
  episode_count: number | null
  air_date: string | null
  overview: string | null
  poster_url: string | null
  /** Calculado na query: COUNT episodes WHERE watched=TRUE AND season_number=N */
  watched_count?: number
}

// ── Entidade: Episódio ─────────────────────────────────────────────────────

/**
 * Episódio de uma série (cache TMDB).
 * Espelha a tabela `episodes`.
 */
export interface Episode {
  id: string
  series_id: string
  season_number: number
  episode_number: number
  title: string | null
  air_date: string | null
  overview: string | null
  still_url: string | null
  airing_status: 'lancado' | 'agendado' | null
  watched: boolean
  watched_date: string | null
}

// ── Entidade: Sessão (watch log) ───────────────────────────────────────────

/**
 * Uma sessão de assistência registrada pelo usuário.
 * Espelha a tabela `watch_logs`.
 */
export interface WatchLog {
  id: string
  series_id: string
  series_title: string | null
  watched_date: string           // ISO date YYYY-MM-DD
  season_number: number | null
  ep_start: number | null
  ep_end: number | null
  episodes_count: number | null
  rating: number | null          // 0.5–5.0
  review: string | null
  source: string | null
  created_at: string
}

// ── Resposta de detalhe ────────────────────────────────────────────────────

/**
 * Resposta completa do endpoint GET /api/series/{id}.
 * Inclui série, temporadas com watched_count, próximo episódio e logs recentes.
 */
export interface SeriesDetail {
  status: 'ok'
  series: Series
  seasons: (Season & { watched_count: number })[]
  next_episode: Episode | null
  recent_logs: WatchLog[]
}

// ── Episódio próximo / agendado ───────────────────────────────────────────

/**
 * Episódio agendado de uma série "assistindo".
 * Retornado pelo endpoint GET /api/series/upcoming.
 */
export interface UpcomingEpisode {
  series_id: string
  series_title: string
  season_number: number
  episode_number: number
  title: string | null
  air_date: string             // ISO date
  still_url: string | null
  poster_url: string | null
}

// ── Estatísticas ───────────────────────────────────────────────────────────

/** Retorno de GET /api/series/stats?year=N */
export interface Stats {
  status: 'ok'
  year: number
  total_series: number          // séries com ao menos 1 log no ano
  total_episodes: number        // soma de episodes_count dos watch_logs
  total_hours: number           // estimado: total_episodes * 50min / 60
  avg_rating: number | null
  top_genres: { genre: string; count: number }[]
  top_networks: { network: string; count: number }[]
  by_status: Record<MaiStatus, number>
  monthly: number[]             // 12 valores, jan→dez (episódios por mês)
}

// ── Configurações salvas em localStorage ─────────────────────────────────

/** Tweaks de personalização da shell Mai (chave 'mai-tweaks' no localStorage). */
export interface Tweaks {
  theme: ThemeMode    // 'dark' | 'light'
  accent: Accent      // 'periwinkle' | 'rose' | 'amber' | 'noir'
  density: Density    // 'compact' | 'medium' | 'cozy'
}

/** Estado de navegação interno da shell (roteamento por estado, sem React Router). */
export interface NavState {
  view: MaiView
  param: string | null   // ex.: series_id para DetailScreen
}
