/**
 * maiApi.ts — Mai Sakurajima · Séries de TV (fatia 022)
 *
 * Wrapper tipado sobre os endpoints REST /api/series/*.
 * Componentes nunca fazem fetch diretamente — usam este objeto.
 * Segue o mesmo padrão de namiApi.ts (objeto com métodos por operação).
 */

// Importa o cliente HTTP base que injeta o cookie de sessão automaticamente
import { api } from '../../lib/api'

// Importa os tipos TypeScript que espelham os contratos do backend
import type {
  Series,
  Episode,
  WatchLog,
  SeriesDetail,
  UpcomingEpisode,
  Stats,
  MaiStatus,
} from './types'

// ── Tipos de request (bodies de POST/PATCH) ────────────────────────────────

/** Body para adicionar uma série ao catálogo. */
export interface AddSeriesBody {
  tmdb_id?: number          // ID no TMDB (se encontrado pela busca)
  title?: string            // Título manual (quando tmdb_id é null)
  status?: MaiStatus        // Default: 'quero_assistir'
}

/** Body para registrar uma sessão de assistência. */
export interface LogWatchBody {
  watched_date: string      // ISO date YYYY-MM-DD
  season_number?: number    // Temporada assistida (nullable)
  ep_start?: number         // Primeiro ep da sessão
  ep_end?: number           // Último ep da sessão
  episodes_count?: number   // Qtd de eps (alternativo a start/end)
  rating?: number           // 0.5–5.0 (opcional)
  review?: string           // Impressões da sessão (opcional)
}

/** Body para alterar status de uma série. */
export interface UpdateStatusBody {
  status: MaiStatus
}

/** Body para avaliar uma série. */
export interface RateSeriesBody {
  rating: number | null     // 0.5–5.0 ou null para remover nota
}

/** Body para salvar anotações de uma série. */
export interface SetNotesBody {
  notes: string             // Anotações livres do usuário
}

// ── Tipos de resposta das listagens ───────────────────────────────────────

/** Resposta de GET /api/series (grid do catálogo). */
interface SeriesListResponse {
  status: 'ok'
  series: Series[]
  total: number
}

/** Resposta de GET /api/series/diary */
interface DiaryResponse {
  status: 'ok'
  logs: WatchLog[]
}

/** Resposta de GET /api/series/upcoming */
interface UpcomingResponse {
  status: 'ok'
  upcoming: UpcomingEpisode[]
}

/** Resposta de GET /api/series/watchlist */
interface WatchlistResponse {
  status: 'ok'
  series: Series[]
}

/** Resposta de GET /api/series/search */
interface SearchResponse {
  status: 'ok'
  results: TMDBSearchResult[]
}

/** Resultado de busca no TMDB (antes de adicionar ao catálogo). */
export interface TMDBSearchResult {
  tmdb_id: number
  title: string
  title_original: string | null
  first_air_date: string | null
  overview: string | null
  poster_url: string | null
  genres: string[]
  in_catalog: boolean       // true se já está no catálogo do usuário
  catalog_id: string | null // series.id se in_catalog=true
}

/** Resposta de GET /api/series/{id}/seasons/{n}/episodes */
interface EpisodesResponse {
  status: 'ok'
  episodes: Episode[]
}

/** Resposta de operações simples (add, update, delete). */
interface OkResponse {
  status: 'ok'
  [key: string]: unknown
}

// ── Objeto de API ─────────────────────────────────────────────────────────

/**
 * Objeto de API da Mai — todos os endpoints de séries de TV.
 * Centraliza as URLs e tipos para que os componentes fiquem desacoplados do HTTP.
 */
export const maiApi = {
  // ── Busca e catálogo ────────────────────────────────────────────────────

  /**
   * Busca séries no TMDB por texto (sem gravar no banco).
   * Retorna resultados enriquecidos com flag in_catalog.
   */
  search: (q: string) =>
    api.get<SearchResponse>(`/api/series/search?q=${encodeURIComponent(q)}`),

  /**
   * Lista o catálogo do usuário com filtros opcionais.
   * @param status - Filtra por status (ex.: 'assistindo'). Omitir = todos.
   * @param genre - Filtra por gênero. Omitir = todos.
   */
  list: (status?: MaiStatus, genre?: string) => {
    // Monta query string somente com parâmetros presentes
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (genre) params.set('genre', genre)
    const qs = params.toString() ? `?${params}` : ''
    return api.get<SeriesListResponse>(`/api/series${qs}`)
  },

  /**
   * Adiciona uma série ao catálogo (por tmdb_id ou título manual).
   * O backend enriquece os metadados via TMDB automaticamente.
   */
  add: (body: AddSeriesBody) =>
    api.post<OkResponse>('/api/series', body),

  /**
   * Retorna detalhe completo de uma série: metadados + temporadas
   * com watched_count + próximo episódio + logs recentes.
   */
  detail: (seriesId: string) =>
    api.get<SeriesDetail>(`/api/series/${seriesId}`),

  /**
   * Retorna as séries com status 'quero_assistir'.
   */
  watchlist: () =>
    api.get<WatchlistResponse>('/api/series/watchlist'),

  // ── Episódios e temporadas ───────────────────────────────────────────────

  /**
   * Retorna os episódios de uma temporada específica de uma série.
   * O backend sincroniza o cache TMDB antes de responder se necessário.
   */
  episodes: (seriesId: string, seasonNumber: number) =>
    api.get<EpisodesResponse>(
      `/api/series/${seriesId}/seasons/${seasonNumber}/episodes`
    ),

  // ── Diário e logs ────────────────────────────────────────────────────────

  /**
   * Registra uma sessão de assistência.
   * Incrementa series.episodes_watched automaticamente.
   */
  logWatch: (seriesId: string, body: LogWatchBody) =>
    api.post<OkResponse>(`/api/series/${seriesId}/log`, body),

  /**
   * Retorna o diário de sessões cronológico (mais recente primeiro).
   * @param limit - Número máximo de entradas. Default: 50.
   */
  diary: (limit = 50) =>
    api.get<DiaryResponse>(`/api/series/diary?limit=${limit}`),

  // ── Próximos episódios ────────────────────────────────────────────────────

  /**
   * Retorna episódios futuros (air_date > hoje) de séries com
   * status 'assistindo', ordenados por data.
   */
  upcoming: () =>
    api.get<UpcomingResponse>('/api/series/upcoming'),

  // ── Atualizações de campos ───────────────────────────────────────────────

  /**
   * Altera o status de uma série no catálogo.
   */
  updateStatus: (seriesId: string, body: UpdateStatusBody) =>
    api.patch<OkResponse>(`/api/series/${seriesId}/status`, body),

  /**
   * Define (ou remove) a nota de uma série.
   * Passar rating: null remove a avaliação.
   */
  rate: (seriesId: string, body: RateSeriesBody) =>
    api.patch<OkResponse>(`/api/series/${seriesId}/rating`, body),

  /**
   * Salva as anotações livres do usuário sobre uma série.
   */
  setNotes: (seriesId: string, body: SetNotesBody) =>
    api.patch<OkResponse>(`/api/series/${seriesId}/notes`, body),

  // ── Sincronização de metadados ───────────────────────────────────────────

  /**
   * Aciona a sincronização de metadados via TMDB para a série.
   * Atualiza temporadas, episódios e campos de metadados da série.
   */
  syncMetadata: (seriesId: string) =>
    api.post<OkResponse>(`/api/series/${seriesId}/sync-metadata`, {}),

  // ── Exclusão ─────────────────────────────────────────────────────────────

  /**
   * Soft delete: marca a série como deleted=TRUE.
   * Os watch_logs são preservados (não são removidos).
   */
  delete: (seriesId: string) =>
    api.del<OkResponse>(`/api/series/${seriesId}`),

  // ── Estatísticas ─────────────────────────────────────────────────────────

  /**
   * Retorna estatísticas do ano: total de séries, episódios, horas,
   * nota média, top gêneros, top redes, distribuição por status e
   * episódios por mês (array de 12 valores).
   * @param year - Ano. Default: ano atual.
   */
  stats: (year?: number) => {
    // Usa o ano atual quando não especificado
    const y = year ?? new Date().getFullYear()
    return api.get<Stats>(`/api/series/stats?year=${y}`)
  },
}

// ── Utilitários de pôster ─────────────────────────────────────────────────

/** 12 paletas disponíveis para pôster tipográfico. */
const PALETTES = [
  'periwinkle', 'dusk', 'amber', 'slate', 'wine', 'teal',
  'moss', 'rose', 'indigo', 'sand', 'steel', 'plum',
] as const

/**
 * Retorna a paleta de pôster determinística para uma série.
 * Usa o título para distribuir as paletas de forma estável.
 * Sem import randômico — a mesma série sempre recebe a mesma paleta.
 */
export function posterPalette(title: string): typeof PALETTES[number] {
  // Soma os char codes do título para obter um índice determinístico
  const hash = title.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return PALETTES[hash % PALETTES.length]
}

/**
 * Retorna a URL do pôster ou null se não disponível.
 * Função de conveniência para uso nos componentes.
 */
export function posterUrl(series: Pick<Series, 'poster_url'>): string | null {
  return series.poster_url ?? null
}
