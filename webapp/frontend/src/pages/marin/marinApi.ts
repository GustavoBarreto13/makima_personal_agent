/**
 * marinApi.ts — Cliente de API tipado para o domínio Animes (Marin Kitagawa).
 *
 * Centraliza todos os endpoints /api/animes/* em um único objeto.
 * Componentes NUNCA chamam `fetch` diretamente — usam este módulo.
 * Isso garante que tipos, headers de sessão e URLs fiquem em um único lugar.
 *
 * Cada método usa `api.get<T>` / `api.post<T>` etc. de `lib/api.ts`,
 * que já inclui `credentials: 'include'` para o cookie de autenticação.
 */

import { api } from '../../lib/api'
import type {
  AddAnimeBody,
  Anime,
  AnimeDetail,
  AnimeSearchResult,
  HomeData,
  LogWatchBody,
  ScoreBody,
  ScheduleItem,
  Stats,
  StatusBody,
  SyncResult,
  WatchLog,
} from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de resposta auxiliares (shapes específicos de alguns endpoints)
// ─────────────────────────────────────────────────────────────────────────────

/** Resposta da rota DELETE /api/animes/:id e DELETE /api/animes/logs/:id */
interface DeleteResult {
  status: 'ok' | 'error'
  message: string
}

/** Listagem paginada de episódios (GET /api/animes/:id/episodes?page=N) */
interface EpisodesPage {
  episodes: import('./types').Episode[]
  total: number
  page: number
}

// ─────────────────────────────────────────────────────────────────────────────
// OBJETO PRINCIPAL — marinApi
// ─────────────────────────────────────────────────────────────────────────────

export const marinApi = {
  // ── Busca / Discovery ───────────────────────────────────────────────────────

  /**
   * Busca animes no Jikan (MAL) por título.
   * Retorna resultados com flag `in_catalog` para saber quais já estão no catálogo.
   * Usada pelo AddAnimeModal.
   */
  search: (q: string, limit = 5) =>
    api.get<{ results: AnimeSearchResult[] }>(
      `/api/animes/search?q=${encodeURIComponent(q)}&limit=${limit}`
    ),

  // ── Listagens principais ────────────────────────────────────────────────────

  /**
   * Lista animes do catálogo com filtros e ordenação opcionais.
   * Usada pelo CatalogScreen.
   */
  list: (params?: { status?: string; sort?: string; genre?: string }) => {
    // Monta a query string apenas com parâmetros não-nulos
    const qs = new URLSearchParams()
    if (params?.status)  qs.set('status', params.status)
    if (params?.sort)    qs.set('sort', params.sort)
    if (params?.genre)   qs.set('genre', params.genre)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return api.get<{ animes: Anime[] }>(`/api/animes${suffix}`)
  },

  /**
   * Lista animes com status='quero_assistir' (fila de espera).
   * Usada pelo WatchlistScreen.
   */
  watchlist: () =>
    api.get<{ animes: Anime[] }>('/api/animes/watchlist'),

  /**
   * Histórico de sessões (diário de episódios).
   * Usada pelo DiaryScreen.
   */
  diary: (limit = 50) =>
    api.get<{ logs: WatchLog[] }>(`/api/animes/diary?limit=${limit}`),

  /**
   * Detalhes completos de um anime: metadados + próximo ep + episódios + logs.
   * Usada pelo AnimeDetail e pela transição da HomeScreen → detalhe.
   */
  detail: (id: string) =>
    api.get<AnimeDetail>(`/api/animes/${id}`),

  /**
   * Episódios paginados de um anime (12 por página).
   * Usada pelo EpisodeList dentro do AnimeDetail quando o usuário rola.
   */
  episodes: (animeId: string, page = 1) =>
    api.get<EpisodesPage>(`/api/animes/${animeId}/episodes?page=${page}`),

  /**
   * Estatísticas anuais de animes.
   * Usada pelo StatsScreen.
   */
  stats: (year?: number) => {
    const suffix = year ? `?year=${year}` : ''
    return api.get<Stats>(`/api/animes/stats${suffix}`)
  },

  /**
   * Schedule de episódios futuros dos animes em progresso.
   * Usada pelo ScheduleScreen.
   */
  schedule: (days = 14) =>
    api.get<{ schedule: ScheduleItem[] }>(`/api/animes/schedule?days=${days}`),

  /**
   * Dados agregados para a HomeScreen (evita N+1 requests).
   * Usada pelo HomeScreen no mount.
   */
  home: () =>
    api.get<HomeData>('/api/animes/home'),

  // ── Mutações ────────────────────────────────────────────────────────────────

  /**
   * Adiciona um anime ao catálogo usando o ID do MyAnimeList.
   * Busca metadados completos via Jikan + AniList + ARM automaticamente.
   * Usada pelo AddAnimeModal após o usuário selecionar o anime na busca.
   */
  add: (body: AddAnimeBody) =>
    api.post<{ id: string; message: string }>('/api/animes', body),

  /**
   * Registra uma sessão de episódios assistidos no diário.
   * Também atualiza episodes_watched do anime e marca episódios como assistidos.
   * Usada pelo LogWatchModal.
   */
  logWatch: (animeId: string, body: LogWatchBody) =>
    api.post<{ log_id: string; message: string }>(
      `/api/animes/${animeId}/log`,
      body
    ),

  /**
   * Atualiza o status de um anime na lista do usuário.
   * Ex.: quero_assistir → assistindo ao clicar em "Começar".
   * Usada pelo WatchlistScreen, AnimeDetail e MarinShell.
   */
  updateStatus: (animeId: string, body: StatusBody) =>
    api.patch<{ id: string; status: string }>(
      `/api/animes/${animeId}/status`,
      body
    ),

  /**
   * Define a nota pessoal de um anime (escala MAL: 0–10, passo 0.5).
   * Score 0 remove a avaliação (NULL no banco).
   * Usada pelo RateInput no AnimeDetail e no LogWatchModal.
   */
  rate: (animeId: string, body: ScoreBody) =>
    api.patch<{ id: string; score: number | null }>(
      `/api/animes/${animeId}/score`,
      body
    ),

  /**
   * Remove um anime do catálogo (soft delete — histórico preservado).
   * Usada pelo botão de remover no AnimeDetail.
   */
  deleteAnime: (id: string) =>
    api.del<DeleteResult>(`/api/animes/${id}`),

  /**
   * Remove uma sessão do diário e recalcula episodes_watched.
   * Usada pelo DiaryScreen ao deletar uma entrada.
   */
  deleteLog: (logId: string) =>
    api.del<DeleteResult>(`/api/animes/logs/${logId}`),

  /**
   * Aciona a sincronização com o MyAnimeList.
   * full=true processa toda a lista (ignora last_sync_at).
   * Usada pelo botão "Sync MAL" na sidebar do MarinShell.
   */
  syncMal: (full = false) =>
    api.post<SyncResult>('/api/animes/sync', { full }),
}
