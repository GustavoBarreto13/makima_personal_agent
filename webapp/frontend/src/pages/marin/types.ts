/**
 * Interfaces TypeScript do domínio Animes (Marin Kitagawa — fatia 021).
 *
 * Espelham exatamente o schema PostgreSQL de `agents/marin/schema_pg.sql`
 * e os shapes de resposta dos 15 endpoints de `webapp/backend/routers/animes.py`.
 * Nenhum valor em runtime aqui — apenas tipos para segurança do compilador.
 */

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS / UNIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Status do anime na lista do usuário.
 * Espelha o campo `anime.status` no PostgreSQL (5 valores em pt-BR).
 */
export type Status =
  | 'assistindo'      // em progresso
  | 'completo'        // terminou todos os episódios
  | 'quero_assistir'  // watchlist (plan_to_watch no MAL)
  | 'pausado'         // on_hold
  | 'abandonado'      // dropped

/**
 * Telas disponíveis dentro do MarinShell.
 * Substituem o roteamento interno via React Router — o Shell usa useState.
 */
export type MarinView =
  | 'home'        // Início — hero + stats + assistindo + watchlist
  | 'catalogo'    // Catálogo — grade de pôsteres
  | 'diario'      // Diário — sessões cronológicas
  | 'watchlist'   // Quero assistir — fila de animes
  | 'lancamentos' // Lançamentos — schedule de episódios futuros
  | 'stats'       // Estatísticas anuais
  | 'detalhe'     // Detalhe de um anime específico

/**
 * Chaves das 12 paletas de pôster tipográfico kawaii.
 * Usadas quando `poster_url` é null — gera gradiente determinístico pelo título.
 */
export type PosterKey =
  | 'magenta' | 'violet' | 'cyan' | 'emerald'
  | 'amber'   | 'sunset' | 'indigo' | 'rose'
  | 'teal'    | 'lime'   | 'plum'  | 'sky'

/**
 * Estado de exibição do anime (campo `airing_status` da API MAL / Jikan).
 */
export type AiringStatus = 'no_ar' | 'finalizado' | 'nao_lancado'

/**
 * Tipo de mídia do anime.
 */
export type MediaType = 'tv' | 'movie' | 'ova' | 'special' | 'ona'

/**
 * Status de exibição de um episódio individual.
 */
export type EpisodeAiringStatus = 'lancado' | 'agendado'


// ─────────────────────────────────────────────────────────────────────────────
// ENTIDADES PRINCIPAIS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Anime no catálogo do usuário.
 * Espelha a tabela `anime` do PostgreSQL.
 */
export interface Anime {
  /** UUID do registro no banco */
  id: string
  /** ID do anime no MyAnimeList (null para animes adicionados manualmente) */
  mal_id: number | null
  /** ID no AniList (para banner e schedule) */
  anilist_id: number | null
  /** ID no TMDB (para thumbnails de episódios) */
  tmdb_id: number | null
  /** Título de exibição (pt-br ou romaji) */
  title: string
  /** Título em inglês (ex.: "Delicious in Dungeon") */
  title_english: string | null
  /** Título em japonês (ex.: "ダンジョン飯") */
  title_japanese: string | null
  /** Título normalizado (lowercase sem acentos) — para busca fuzzy */
  normalizado: string
  /** Formato da mídia */
  media_type: MediaType | null
  /** Temporada de estreia (ex.: "winter 2024") */
  season: string | null
  /** Nome do estúdio de animação principal */
  studio: string | null
  /** Total de episódios planejados (null se em exibição ou indefinido) */
  episodes_total: number | null
  /** Episódios assistidos pelo usuário (soma dos watch_logs) */
  episodes_watched: number
  /** Status na lista do usuário */
  status: Status
  /** Estado de exibição do anime */
  airing_status: AiringStatus | null
  /** Nota pessoal (escala MAL 0–10, passo 0.5) */
  score: number | null
  /** URL do pôster (CDN MAL via Jikan) */
  poster_url: string | null
  /** URL do banner de alta resolução (AniList CDN) */
  banner_url: string | null
  /** Sinopse (truncada em 2000 chars) */
  overview: string | null
  /** Gêneros (ex.: ["Adventure", "Comedy", "Fantasy"]) */
  genres: string[]
  /** Tags livres adicionadas pelo usuário */
  tags: string[]
  /** Anotações soltas do usuário */
  notes: string | null
  /** Data da primeira sessão (preenchida automaticamente pelo log_watch) */
  date_started: string | null
  /** Data em que episodes_watched >= episodes_total */
  date_finished: string | null
  /** Origem do registro: 'manual' | 'mal_sync' | 'jikan' */
  source: string
  /** Quando o registro foi criado */
  created_at: string
  /** Quando o registro foi atualizado pela última vez */
  updated_at: string
  /** Soft delete — true = removido do catálogo */
  deleted: boolean
  /** Paleta tipográfica de fallback — calculada pelo hash do título */
  poster_key?: PosterKey
}

/**
 * Sessão de episódios assistidos (entrada do diário).
 * Espelha a tabela `watch_logs` do PostgreSQL.
 */
export interface WatchLog {
  /** UUID do registro */
  id: string
  /** FK para o anime */
  anime_id: string
  /** Título do anime (denormalizado para evitar JOIN) */
  anime_title: string | null
  /** Data em que a sessão aconteceu (YYYY-MM-DD) */
  watched_date: string
  /** Primeiro episódio da sessão (null se número desconhecido) */
  ep_start: number | null
  /** Último episódio da sessão (null se número desconhecido) */
  ep_end: number | null
  /** Quantidade de episódios assistidos nesta sessão */
  episodes_count: number | null
  /** Nota da sessão (0–10, passo 0.5, null = sem avaliação) */
  rating: number | null
  /** Observações específicas desta sessão */
  notes: string | null
  /** Origem: 'manual' | 'mal_sync' */
  source: string
  /** Quando o log foi criado */
  created_at: string
  /** Pôster do anime (enriquecido pelo JOIN no endpoint /diary) */
  poster_url?: string | null
  /** Paleta tipográfica de fallback */
  poster_key?: PosterKey
}

/**
 * Cache de metadados de um episódio individual.
 * Espelha a tabela `episodes` do PostgreSQL.
 */
export interface Episode {
  /** UUID do registro */
  id: string
  /** FK para o anime */
  anime_id: string
  /** Número do episódio dentro da série */
  number: number
  /** Título do episódio (frequentemente null para episódios antigos) */
  title: string | null
  /** Data de lançamento (YYYY-MM-DD ou null) */
  aired: string | null
  /** Sinopse do episódio (truncada em 2000 chars) */
  synopsis: string | null
  /** URL do thumbnail (TMDB still w780) */
  thumbnail_url: string | null
  /** Estado de exibição do episódio */
  airing_status: EpisodeAiringStatus
  /** True quando o episódio foi marcado como assistido */
  watched: boolean
  /** Data em que foi marcado como assistido */
  watched_date: string | null
}

/**
 * Estado de sincronização com o MAL (linha única da tabela mal_sync_state).
 */
export interface MalSyncState {
  /** Quando foi o último sync bem-sucedido */
  last_sync_at: string | null
  /** Quando esta linha foi atualizada */
  updated_at: string
}


// ─────────────────────────────────────────────────────────────────────────────
// SHAPES DE RESPOSTA DOS ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resultado de busca no Jikan (endpoint GET /animes/search?q=).
 * Retornado por `search_anime()` em tools.py.
 */
export interface AnimeSearchResult {
  mal_id: number
  title: string
  title_english: string | null
  type: MediaType | null
  airing_status: AiringStatus | null
  episodes_total: number | null
  score: number | null
  season: string | null
  year: number | null
  poster_url: string | null
  /** True se o anime já está no catálogo local */
  in_catalog?: boolean
  /** ID local se já estiver no catálogo */
  local_id?: string
}

/**
 * Detalhe completo de um anime: metadados + próximo episódio + logs recentes.
 * Retornado por GET /animes/:id.
 */
export interface AnimeDetail {
  anime: Anime
  /** Próximo episódio não assistido (null se completo ou sem dados) */
  next_episode: Episode | null
  /** Episódios paginados (12 por vez) */
  episodes: Episode[]
  /** Total de episódios no cache (para paginação) */
  episodes_total_cached: number
  /** Últimas sessões do diário deste anime */
  recent_logs: WatchLog[]
}

/**
 * Item do schedule de lançamentos (GET /animes/schedule?days=N).
 */
export interface ScheduleItem {
  /** ID do anime */
  anime_id: string
  /** Título do anime */
  anime_title: string
  /** URL do pôster */
  poster_url: string | null
  /** Paleta tipográfica de fallback */
  poster_key: PosterKey
  /** Número do episódio que vai ao ar */
  episode_number: number
  /** Título do episódio (se disponível no cache) */
  episode_title?: string | null
  /** Data de exibição (YYYY-MM-DD) */
  aired: string
  /** Status de exibição do episódio */
  airing_status: EpisodeAiringStatus
}

/**
 * Estatísticas do usuário para um ano (GET /animes/stats?year=N).
 */
export interface Stats {
  /** Ano das estatísticas */
  year: number
  /** Total de animes únicos com sessão no ano */
  total_animes: number
  /** Total de episódios assistidos no ano */
  total_episodes: number
  /** Total de horas assistidas no ano (estimativa: eps × 23 min) */
  total_hours: number
  /** Nota média do ano (null se sem notas) */
  avg_score: number | null
  /** Top gêneros (nome + contagem de animes) */
  top_genres: Array<{ genre: string; count: number }>
  /** Top estúdios (nome + contagem de animes) */
  top_studios: Array<{ studio: string; count: number }>
  /** Contagem de sessões por mês (índice 0 = janeiro, 11 = dezembro) */
  monthly: number[]
  /** Contagem de sessões por status */
  by_status: Record<Status, number>
  /** Heatmap: {date: count} para dias do ano */
  heatmap: Record<string, number>
  /** Anime destaque do ano (maior nota ou mais assistido) */
  highlight: {
    anime_id: string
    title: string
    score: number | null
    poster_url?: string | null
    episodes_watched?: number
  } | null
}

/**
 * Dados agregados para a HomeScreen (GET /animes/home).
 * Evita N+1 calls: tudo em uma requisição.
 */
export interface HomeData {
  /** Última sessão registrada (hero "continue assistindo") */
  last_session: {
    anime: Anime
    log: WatchLog
    next_episode: Episode | null
  } | null
  /** Animes com status='assistindo' */
  currently_watching: Anime[]
  /** Últimas 5 sessões do diário */
  recent_logs: WatchLog[]
  /** Próximos 3–4 episódios do schedule */
  upcoming_episodes: ScheduleItem[]
  /** Carrossel: até 8 animes com status='quero_assistir' */
  watchlist_preview: Anime[]
  /** Stats rápidas: totais por status */
  counts: Record<Status, number>
  /** Episódios assistidos nos últimos 7 dias */
  episodes_7d: number
  /** Episódios assistidos nos 7 dias anteriores (para variação %) */
  episodes_7d_prev: number
  /** Nota média de todas as sessões do ano atual */
  avg_score_year: number | null
}

/**
 * Resultado do sync com o MAL (POST /animes/sync).
 */
export interface SyncResult {
  ok: boolean
  full: boolean
  timestamp: string
  mal_entries_fetched: number
  updated: number
  created: number
  skipped: number
  errors: Array<{ mal_id: number | null; msg: string }>
}

// ─────────────────────────────────────────────────────────────────────────────
// BODIES DE MUTAÇÃO (request payloads)
// ─────────────────────────────────────────────────────────────────────────────

/** Body para POST /animes — adicionar anime ao catálogo */
export interface AddAnimeBody {
  /** ID do anime no MAL (preferível para enriquecer metadados via Jikan/AniList) */
  mal_id: number
}

/** Body para POST /animes/:id/log — logar uma sessão de episódios */
export interface LogWatchBody {
  /** Primeiro episódio da sessão (opcional) */
  ep_start?: number | null
  /** Último episódio da sessão (opcional) */
  ep_end?: number | null
  /** Data da sessão (YYYY-MM-DD, default: hoje) */
  watched_date?: string
  /** Nota da sessão (0–10, passo 0.5) */
  rating?: number | null
  /** Observações da sessão */
  notes?: string | null
}

/** Body para PATCH /animes/:id/status */
export interface StatusBody {
  status: Status
}

/** Body para PATCH /animes/:id/score */
export interface ScoreBody {
  /** Nota (0–10, passo 0.5) */
  score: number
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO DO SHELL (Tweaks)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Preferências do MarinShell salvas em localStorage ('mr-tweaks').
 */
export interface Tweaks {
  /** Tema visual */
  tema: 'Escuro' | 'Claro'
  /** Acento de cor */
  acento: 'Rosa-Magenta' | 'Sakura' | 'Neon' | 'Gold'
  /** Densidade dos pôsteres */
  densidade: 'Grande' | 'Médio' | 'Compacto'
  /** Ordenação padrão do catálogo */
  ordenacao: 'Atualizado' | 'Adicionado' | 'Nota' | 'Título' | 'Progresso'
}

/** Mapa de acento para o atributo data-accent do DOM */
export const ACCENT_MAP: Record<Tweaks['acento'], string> = {
  'Rosa-Magenta': '',
  'Sakura':       'sakura',
  'Neon':         'neon',
  'Gold':         'gold',
} as const

/** Mapa de densidade para o atributo data-density do DOM */
export const DENSITY_MAP: Record<Tweaks['densidade'], string> = {
  'Grande':   'large',
  'Médio':    'medium',
  'Compacto': 'compact',
} as const

/** Valores padrão das Tweaks (Neon + Escuro + Médio) */
export const TWEAK_DEFAULTS: Tweaks = {
  tema:      'Escuro',
  acento:    'Neon',
  densidade: 'Médio',
  ordenacao: 'Atualizado',
} as const
