// Tipos da Marin. Dois grupos:
//   Api*  → o que o servidor devolve (pode ter `null` onde as telas esperam valor; ver lib/normalize.ts)
//   resto → o formato que as telas usam, já normalizado (listas sempre listas, nota já em estrelas).

// ── estados e formatos ───────────────────────────────────────────────────────

/** Os 5 estados de um anime na lista do usuário (valores gravados no banco). */
export type AnimeStatus = 'assistindo' | 'completo' | 'quero_assistir' | 'pausado' | 'abandonado'

/** Formato do título: série de TV, filme, OVA, especial ou ONA (web). */
export type MediaType = 'tv' | 'movie' | 'ova' | 'special' | 'ona'

/** Estado de exibição do anime no Japão. */
export type AiringStatus = 'no_ar' | 'finalizado' | 'nao_lancado'

// ── o que o servidor devolve ─────────────────────────────────────────────────

export interface ApiAnime {
  id: string
  mal_id: number | null
  title: string
  title_english?: string | null
  title_japanese?: string | null
  media_type: string | null
  /** Texto livre do Jikan, ex.: "winter 2024". */
  season: string | null
  studio: string | null
  episodes_total: number | null
  episodes_watched: number | null
  status: string
  airing_status: string | null
  /** Nota na escala do MAL (0–10). */
  score: number | null
  poster_url: string | null
  banner_url: string | null
  overview: string | null
  genres: string[] | null
  tags: string[] | null
  notes: string | null
  date_started: string | null
  date_finished: string | null
  date_abandoned?: string | null
  created_at: string | null
  updated_at: string | null
  liked?: boolean | null
}

export interface ApiLog {
  id: string
  anime_id: string
  anime_title: string | null
  watched_date: string
  ep_start: number | null
  ep_end: number | null
  episodes_count: number | null
  /** Nota da sessão na escala do MAL (0–10). */
  rating: number | null
  notes: string | null
  source?: string | null
  poster_url?: string | null
}

export interface ApiEpisode {
  id: string
  number: number
  title: string | null
  aired: string | null
  synopsis?: string | null
  thumbnail_url?: string | null
  airing_status: string | null
  watched: boolean | null
  watched_date: string | null
}

export interface ApiScheduleItem {
  anime_id: string
  anime_title: string
  poster_url: string | null
  episode_number: number
  episode_title?: string | null
  /** "YYYY-MM-DD" (o banco guarda só a data); aceita também um instante completo. */
  aired: string
  airing_status?: string | null
}

export interface ApiList {
  id: string
  name: string
  description: string | null
  accent: string | null
  ranked: boolean | null
  count: number | null
}

export interface ApiListItem {
  id: string
  title: string
  poster_url: string | null
  status: string
  score: number | null
  position: number | null
}

export interface ApiHome {
  last_session: { anime: ApiAnime; log: { id: string; watched_date: string }; next_episode: ApiEpisode | null } | null
  currently_watching: ApiAnime[] | null
  recent_logs: ApiLog[] | null
  upcoming_episodes: ApiScheduleItem[] | null
  watchlist_preview: ApiAnime[] | null
  favorites: ApiAnime[] | null
  counts: Partial<Record<AnimeStatus, number>> | null
  episodes_7d: number | null
  episodes_7d_prev: number | null
  avg_score_year: number | null
}

// ── o que as telas usam ──────────────────────────────────────────────────────

export interface Anime {
  id: string
  malId: number | null
  title: string
  titleEnglish: string
  titleJapanese: string
  mediaType: MediaType | null
  /** Temporada de estreia em português ("Inverno 2024"), ou '' quando desconhecida. */
  season: string
  studio: string
  /** Total de episódios; null quando ainda em exibição/indefinido. */
  total: number | null
  watched: number
  status: AnimeStatus
  airing: AiringStatus | null
  /** Nota em estrelas (0.5–5, meia estrela = 1 ponto do MAL); null = sem nota. */
  rating: number | null
  poster: string | null
  banner: string | null
  overview: string
  genres: string[]
  tags: string[]
  notes: string
  started: string | null
  finished: string | null
  abandoned: string | null
  /** Dia local em que entrou no catálogo (YYYY-MM-DD). */
  addedAt: string
  /** Dia local da última alteração (YYYY-MM-DD). */
  updatedAt: string
  liked: boolean
  /** Fração assistida (0–1); null quando o total é desconhecido ou nada foi visto. */
  progress: number | null
}

/** Uma sessão do diário: um ou mais episódios vistos num dia. */
export interface Session {
  id: string
  animeId: string
  title: string
  date: string
  epStart: number | null
  epEnd: number | null
  count: number
  /** Nota da sessão em estrelas; null = sem nota. */
  rating: number | null
  notes: string
  source: string
  poster: string | null
}

export interface Episode {
  id: string
  number: number
  title: string
  aired: string | null
  scheduled: boolean
  watched: boolean
  watchedDate: string | null
}

export interface ScheduleItem {
  animeId: string
  title: string
  poster: string | null
  episode: number
  episodeTitle: string
  /** Dia (YYYY-MM-DD). */
  date: string
  /** Instante completo quando o servidor trouxe hora; null quando só há o dia. */
  at: string | null
}

export interface AnimeList {
  id: string
  name: string
  description: string
  ranked: boolean
  count: number
  /** Matiz (0–360) escolhido na lista, ou null. */
  hue: number | null
}

export interface AnimeListItem {
  id: string
  title: string
  poster: string | null
  status: AnimeStatus
  rating: number | null
  position: number | null
}

export interface AnimeDetailData {
  anime: Anime
  next: Episode | null
  episodes: Episode[]
  episodesTotal: number
  logs: Session[]
}

export interface HomeData {
  last: { anime: Anime; date: string; next: Episode | null } | null
  watching: Anime[]
  recent: Session[]
  upcoming: ScheduleItem[]
  queue: Anime[]
  favorites: Anime[]
  counts: Record<AnimeStatus, number>
  episodes7d: number
  episodes7dPrev: number
}

export interface SearchResult {
  malId: number
  title: string
  titleEnglish: string
  type: string
  season: string
  year: number | null
  episodes: number | null
  score: number | null
  poster: string | null
  inCatalog: boolean
  localId: string | null
}

export interface ApiSearchResult {
  mal_id: number
  title: string
  title_english: string | null
  type: string | null
  season: string | null
  year: number | null
  episodes_total: number | null
  score: number | null
  poster_url: string | null
  in_catalog?: boolean
  local_id?: string
}

export interface TagEntry {
  name: string
  count: number
}

export interface SyncResult {
  ok: boolean
  full: boolean
  created: number
  updated: number
  skipped: number
  errors: Array<{ mal_id: number | null; msg: string }>
}

/** GET /api/animes/stats: o contrato do DS mais o ano da primeira sessão (limite do seletor de ano). */
export type StatsResponse = import('../../design/core/stats').StatsPayload & { status: 'ok'; first_year: number }
