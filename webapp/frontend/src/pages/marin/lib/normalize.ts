// Converte o que o servidor devolve no formato que as telas usam. É a "borda" do app: tudo que pode vir
// `null` (listas, textos, datas) vira um valor seguro aqui, para nenhuma tela quebrar com dado inesperado.
// A nota também muda de escala aqui: o servidor fala MAL (0–10), as telas falam estrelas (0–5).

import { isoDate } from '../../../design/core/format'
import type {
  Anime, AnimeList, AnimeListItem, AnimeStatus, AiringStatus, ApiAnime, ApiEpisode, ApiHome, ApiList, ApiListItem, ApiLog,
  ApiScheduleItem, ApiSearchResult, Episode, HomeData, MediaType, ScheduleItem, SearchResult, Session,
} from '../types'
import { seasonLabel } from './season'
import { toStars } from './score'
import { isAnimeStatus, STATUS_ORDER } from './status'

/** Dia local (America/Sao_Paulo no navegador) de um instante ISO do servidor — nunca `slice(0, 10)` (UTC). */
export function localDay(iso: string | null | undefined): string {
  if (!iso) return ''
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : isoDate(new Date(iso))
}

/** Só a parte da data (YYYY-MM-DD) de um campo DATE; vazio vira null. DATE já é o dia local, então cortar é seguro. */
const day = (v: string | null | undefined): string | null => (v ? v.slice(0, 10) : null)

const list = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : [])

const MEDIA: MediaType[] = ['tv', 'movie', 'ova', 'special', 'ona']
const AIRING: AiringStatus[] = ['no_ar', 'finalizado', 'nao_lancado']

export function normalizeAnime(a: ApiAnime): Anime {
  const status: AnimeStatus = isAnimeStatus(a.status) ? a.status : 'quero_assistir'
  const total = a.episodes_total && a.episodes_total > 0 ? a.episodes_total : null
  const watched = a.episodes_watched ?? 0
  return {
    id: a.id,
    malId: a.mal_id ?? null,
    title: a.title || 'Sem título',
    titleEnglish: a.title_english ?? '',
    titleJapanese: a.title_japanese ?? '',
    mediaType: MEDIA.includes(a.media_type as MediaType) ? (a.media_type as MediaType) : null,
    season: seasonLabel(a.season),
    studio: a.studio ?? '',
    total,
    watched,
    status,
    airing: AIRING.includes(a.airing_status as AiringStatus) ? (a.airing_status as AiringStatus) : null,
    rating: toStars(a.score),
    poster: a.poster_url || null,
    banner: a.banner_url || null,
    overview: a.overview ?? '',
    genres: list(a.genres),
    tags: list(a.tags),
    notes: a.notes ?? '',
    started: day(a.date_started),
    finished: day(a.date_finished),
    abandoned: day(a.date_abandoned),
    addedAt: localDay(a.created_at),
    updatedAt: localDay(a.updated_at),
    liked: !!a.liked,
    // Progresso só quando dá para calcular e há algo visto; limitado a 100%.
    progress: total && watched > 0 ? Math.min(1, watched / total) : null,
  }
}

export function normalizeSession(l: ApiLog): Session {
  const count = l.episodes_count ?? (l.ep_start != null && l.ep_end != null ? l.ep_end - l.ep_start + 1 : 0)
  return {
    id: l.id,
    animeId: l.anime_id,
    title: l.anime_title || 'Anime',
    date: day(l.watched_date) ?? '',
    epStart: l.ep_start ?? null,
    epEnd: l.ep_end ?? null,
    count,
    rating: toStars(l.rating),
    notes: l.notes ?? '',
    source: l.source ?? 'manual',
    poster: l.poster_url ?? null,
  }
}

export function normalizeEpisode(e: ApiEpisode): Episode {
  return {
    id: e.id,
    number: e.number,
    title: e.title ?? '',
    aired: day(e.aired),
    scheduled: e.airing_status === 'agendado',
    watched: !!e.watched,
    watchedDate: day(e.watched_date),
  }
}

export function normalizeSchedule(s: ApiScheduleItem): ScheduleItem {
  return {
    animeId: s.anime_id,
    title: s.anime_title || 'Anime',
    poster: s.poster_url ?? null,
    episode: s.episode_number,
    episodeTitle: s.episode_title ?? '',
    date: (s.aired ?? '').slice(0, 10),
    // O banco guarda só o dia; se algum dia vier com hora, a tela mostra o horário JST/BRT.
    at: s.aired && s.aired.length > 10 ? s.aired : null,
  }
}

/** Matiz (0–360) guardado em `accent` ("oklch(0.6 0.1 205)" ou "205"); null quando não dá para ler. */
function accentHue(accent: string | null): number | null {
  const nums = (accent ?? '').match(/-?\d+(?:\.\d+)?/g)
  const h = nums ? Number(nums[nums.length - 1]) : NaN
  return Number.isFinite(h) && h >= 0 && h <= 360 ? h : null
}

export function normalizeList(l: ApiList): AnimeList {
  return { id: l.id, name: l.name || 'Lista', description: l.description ?? '', ranked: !!l.ranked, count: l.count ?? 0, hue: accentHue(l.accent) }
}

export function normalizeListItem(i: ApiListItem): AnimeListItem {
  return {
    id: i.id,
    title: i.title || 'Anime',
    poster: i.poster_url ?? null,
    status: isAnimeStatus(i.status) ? i.status : 'quero_assistir',
    rating: toStars(i.score),
    position: i.position ?? null,
  }
}

export function normalizeHome(h: ApiHome): HomeData {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, h.counts?.[s] ?? 0])) as Record<AnimeStatus, number>
  return {
    last: h.last_session
      ? {
          anime: normalizeAnime(h.last_session.anime),
          date: day(h.last_session.log?.watched_date) ?? '',
          next: h.last_session.next_episode ? normalizeEpisode(h.last_session.next_episode) : null,
        }
      : null,
    watching: list(h.currently_watching).map(normalizeAnime),
    recent: list(h.recent_logs).map(normalizeSession),
    upcoming: list(h.upcoming_episodes).map(normalizeSchedule),
    queue: list(h.watchlist_preview).map(normalizeAnime),
    favorites: list(h.favorites).map(normalizeAnime),
    counts,
    episodes7d: h.episodes_7d ?? 0,
    episodes7dPrev: h.episodes_7d_prev ?? 0,
  }
}

export function normalizeSearch(r: ApiSearchResult): SearchResult {
  return {
    malId: r.mal_id,
    title: r.title,
    titleEnglish: r.title_english ?? '',
    type: r.type ?? '',
    season: seasonLabel(r.season),
    year: r.year ?? null,
    episodes: r.episodes_total ?? null,
    score: r.score ?? null,
    poster: r.poster_url ?? null,
    inCatalog: !!r.in_catalog,
    localId: r.local_id ?? null,
  }
}
