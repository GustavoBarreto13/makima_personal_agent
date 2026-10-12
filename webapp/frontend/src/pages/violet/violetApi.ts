// Cliente tipado da Violet — embrulha /api/journal/* sobre lib/api.ts (spec 076).
// As telas nunca chamam fetch direto: usam este objeto.

import { api } from '../../lib/api'
import type {
  Bullet, BulletKind, Counsel, CounselHistoryItem, DayBullets, DreamItem, Emotion, EmotionAnalysis, EmotionLog, EmotionPatterns,
  EntryListItem, Font, Letter, MentionCount, PageResponse, PersonSuggestion, RefCount, ReflectPayload, RefProvider, RefResult,
  ScoreKey, Strength, TutorAnalysis, TutorAnalysisSummary, TutorConcept, TutorGuide, TutorProgress, ValuesArea, ValuesAssessment,
  ValuesGuide, WeeklyReview, WeeklyReviewItem, CollectionItem,
} from './types'
import type { StatsPayload } from '../../design/core/stats'

const B = '/api/journal'

/** Monta "?a=1&b=x" ignorando vazios. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

export interface VioletStats extends StatsPayload {
  strength: Pick<Strength, 'consistency' | 'trend' | 'recent_done' | 'recent_total' | 'weekly_target' | 'best' | 'series'>
  emotions: {
    by_emotion: { name: string; count: number; avg_intensity: number; avg_relief: number | null }[]
    by_month: { month: number; avg: number; count: number }[]
  }
}

export const violetApi = {
  // ── dia ──
  page: (date: string) => api.get<PageResponse>(`${B}/page${qs({ date })}`),
  ensurePage: (date: string) => api.post<PageResponse>(`${B}/page`, { date }),
  setFont: (date: string, font: Font | null) => api.put<{ status: string; page_id: number; font: Font | null }>(`${B}/page/font`, { date, font }),
  setDream: (page_id: number, dream: string) => api.put<{ status: string }>(`${B}/page/dream`, { page_id, dream }),
  upsertBullet: (body: { page_id: number; position: number; content: string; kind: BulletKind; person_ids?: string[] }) =>
    api.post<{ status: string; bullet: Bullet | null; deleted?: boolean }>(`${B}/bullets`, body),
  deleteBullet: (id: number) => api.del<{ status: string; bullet: Pick<Bullet, 'id' | 'page_id' | 'kind' | 'content' | 'position' | 'favorite'> }>(`${B}/bullets/${id}`),
  setFavorite: (id: number, favorite: boolean) => api.patch<{ status: string; favorite: boolean }>(`${B}/bullets/${id}/favorite`, { favorite }),

  // ── arquivo, busca, menções e referências ──
  entries: (opts: { q?: string; limit?: number; before?: string } = {}) => api.get<EntryListItem[]>(`${B}/entries${qs(opts)}`),
  search: (q: string) => api.get<DayBullets[]>(`${B}/search${qs({ q })}`),
  mentions: (kind: 'person' | 'tag') => api.get<MentionCount[]>(`${B}/mentions${qs({ kind })}`),
  filter: (kind: 'person' | 'tag', opts: { value?: string; person_id?: string }) => api.get<DayBullets[]>(`${B}/filter${qs({ kind, ...opts })}`),
  filterRef: (agent: string, entity_type: string, entity_id: string) => api.get<DayBullets[]>(`${B}/filter/ref${qs({ agent, entity_type, entity_id })}`),
  refProviders: () => api.get<RefProvider[]>(`${B}/refs/providers`),
  refSearch: (agent: string, q: string) => api.get<{ status: string; agent: string; results: RefResult[] }>(`${B}/refs/search${qs({ agent, q })}`),
  refs: (opts: { agent?: string; since?: string; until?: string } = {}) => api.get<RefCount[]>(`${B}/refs${qs(opts)}`),
  suggestPeople: (q: string) => api.get<{ status: string; people: PersonSuggestion[] }>(`${B}/people/suggest${qs({ q })}`),

  // ── coleções, insights, força, refletir ──
  collection: (kind: BulletKind) => api.get<CollectionItem[]>(`${B}/collection/${kind}`),
  dreams: () => api.get<DreamItem[]>(`${B}/dreams`),
  stats: (year: number, weeklyTarget: number) => api.get<VioletStats>(`${B}/stats${qs({ year, weekly_target: weeklyTarget })}`),
  years: () => api.get<number[]>(`${B}/years`),
  heatmap: (year: number) => api.get<Record<string, number>>(`${B}/heatmap${qs({ year })}`),
  strength: (weeklyTarget: number, days = 90) => api.get<Strength>(`${B}/strength${qs({ weekly_target: weeklyTarget, days })}`),
  reflect: (date: string, pins: string[], reroll: { prompt?: number; gem?: number; idea?: number; memory?: number } = {}) =>
    api.get<ReflectPayload>(`${B}/reflect${qs({ date, pins: pins.join(','), ...reroll })}`),

  // ── emoções ──
  listEmotions: () => api.get<Emotion[]>(`${B}/emotions`),
  createEmotion: (name: string) => api.post<{ status: string; emotion: Emotion }>(`${B}/emotions`, { name }),
  emotionLogs: (pageId: number) => api.get<EmotionLog[]>(`${B}/emotion-logs${qs({ page_id: pageId })}`),
  allEmotionLogs: (opts: { since?: string; until?: string; q?: string; emotion_id?: number; min_intensity?: number; limit?: number; ids?: number[] } = {}) =>
    api.get<EmotionLog[]>(`${B}/emotion-logs/all${qs({ ...opts, ids: opts.ids?.join(',') })}`),
  emotionLog: (id: number) => api.get<{ status: string; log: EmotionLog }>(`${B}/emotion-logs/${id}`),
  createEmotionLog: (body: EmotionLogBody & { page_id: number }) => api.post<{ status: string; log: EmotionLog }>(`${B}/emotion-logs`, body),
  updateEmotionLog: (id: number, body: Partial<EmotionLogBody>) => api.patch<{ status: string; log: EmotionLog }>(`${B}/emotion-logs/${id}`, body),
  deleteEmotionLog: (id: number) => api.del<{ status: string }>(`${B}/emotion-logs/${id}`),
  emotionPatterns: (since?: string, until?: string) => api.get<EmotionPatterns & { status: string }>(`${B}/emotion-patterns${qs({ since, until })}`),
  emotionAnalysis: (since?: string, until?: string) => api.get<{ analysis: EmotionAnalysis | null }>(`${B}/emotion-analysis${qs({ since, until })}`),
  generateEmotionAnalysis: (since?: string, until?: string) => api.post<{ status: string; analysis: EmotionAnalysis }>(`${B}/emotion-analysis`, { since, until }),

  // ── cartas ──
  letters: (pageId: number) => api.get<Letter[]>(`${B}/letters${qs({ page_id: pageId })}`),
  allLetters: (opts: { status?: 'draft' | 'sealed'; person_id?: string; q?: string; limit?: number } = {}) => api.get<Letter[]>(`${B}/letters/all${qs(opts)}`),
  letter: (id: number) => api.get<{ status: string; letter: Letter }>(`${B}/letters/${id}`),
  createLetter: (body: { page_id: number; recipient: string; body: string; title?: string | null; status?: 'draft' | 'sealed'; person_ids?: string[]; font?: Font }) =>
    api.post<{ status: string; letter: Letter }>(`${B}/letters`, body),
  updateLetter: (id: number, body: Partial<{ recipient: string; body: string; title: string | null; font: Font; person_ids: string[] }>) =>
    api.patch<{ status: string; letter: Letter }>(`${B}/letters/${id}`, body),
  sealLetter: (id: number) => api.post<{ status: string; letter: Letter }>(`${B}/letters/${id}/seal`, {}),
  deleteLetter: (id: number) => api.del<{ status: string }>(`${B}/letters/${id}`),

  // ── conselho e revisão semanal ──
  getCounsel: (date: string) => api.get<{ counsel: Counsel | null }>(`${B}/counsel${qs({ date })}`),
  generateCounsel: (date: string) => api.post<{ status: string; counsel: Counsel }>(`${B}/counsel`, { date }),
  counselHistory: (limit = 14) => api.get<{ items: CounselHistoryItem[] }>(`${B}/counsel/history${qs({ limit })}`),
  markActionAsTask: (page_id: number, action_index: number, task_id: number) =>
    api.patch<{ status: string; counsel: Counsel }>(`${B}/counsel/actions`, { page_id, action_index, task_id }),
  weeklyReview: (week?: string) => api.get<{ review: WeeklyReview | null }>(`${B}/weekly-review${qs({ week })}`),
  generateWeeklyReview: (week?: string) => api.post<{ status: string; review: WeeklyReview }>(`${B}/weekly-review`, { week }),
  weeklyReviews: (limit = 12) => api.get<{ items: WeeklyReviewItem[] }>(`${B}/weekly-review/history${qs({ limit })}`),
  markWeeklyActionAsTask: (week_start: string, action_index: number, task_id: number) =>
    api.patch<{ status: string; review: WeeklyReview }>(`${B}/weekly-review/actions`, { week_start, action_index, task_id }),

  // ── valores ──
  valuesGuide: () => api.get<ValuesGuide>(`${B}/values/domains`),
  valuesCurrent: () => api.get<{ status: string; assessment: ValuesAssessment | null; draft: boolean }>(`${B}/values/current`),
  valuesStart: () => api.post<{ status: string; assessment: ValuesAssessment }>(`${B}/values`, {}),
  valuesDiscard: () => api.del<{ status: string }>(`${B}/values/draft`),
  valuesArea: (id: number, key: string, body: Partial<Pick<ValuesArea, 'description' | 'narrative' | 'skipped'> & Record<ScoreKey, number | null>>) =>
    api.patch<{ status: string; area: ValuesArea; diagnosis: ValuesAssessment['diagnosis'] }>(`${B}/values/${id}/areas/${key}`, body),
  valuesComplete: (id: number) => api.post<{ status: string; assessment: ValuesAssessment }>(`${B}/values/${id}/complete`, {}),
  valuesHistory: () => api.get<{ status: string; versions: ValuesAssessment[]; evolution: Record<string, { at: string; gap: number | null; satisfaction: number | null; action: number | null }[]> }>(`${B}/values/history`),
  valuesAddCommitment: (id: number, domain_key: string, text: string) =>
    api.post<{ status: string; commitment: ValuesAssessment['commitments'][number] }>(`${B}/values/${id}/commitments`, { domain_key, text }),
  valuesUpdateCommitment: (cid: number, body: { text?: string; task_id?: number }) => api.patch<{ status: string }>(`${B}/values/commitments/${cid}`, body),
  valuesDeleteCommitment: (cid: number) => api.del<{ status: string }>(`${B}/values/commitments/${cid}`),
  valuesCheckin: (domain_key: string, action: number, satisfaction: number) => api.post<{ status: string; week_start: string }>(`${B}/values/checkin`, { domain_key, action, satisfaction }),
  valuesCheckins: (weeks = 8) => api.get<{ week_start: string; domain_key: string; action: number | null; satisfaction: number | null }[]>(`${B}/values/checkins${qs({ weeks })}`),

  // ── tutor (spec 031) ──
  analyzeTutor: (bulletId: number, language = 'en') => api.post<{ status: string; analysis: TutorAnalysis; skills_touched: string[] }>(`${B}/bullets/${bulletId}/tutor`, { language }),
  bulletAnalysis: (bulletId: number) => api.get<{ analysis: TutorAnalysis | null }>(`${B}/bullets/${bulletId}/tutor`),
  tutorProgress: (language = 'en') => api.get<TutorProgress>(`${B}/tutor/progress${qs({ language })}`),
  tutorAnalyses: (language = 'en', limit = 20) => api.get<TutorAnalysisSummary[]>(`${B}/tutor/analyses${qs({ language, limit })}`),
  tutorConcepts: () => api.get<TutorConcept[]>(`${B}/tutor/concepts`),
  saveTutorGuide: (body: { description: string; target_concepts?: string[]; language?: string }) =>
    api.put<{ status: string; guide: TutorGuide }>(`${B}/tutor/guide`, { language: 'en', ...body }),
  deleteTutorGuide: (language = 'en') => api.del<{ status: string }>(`${B}/tutor/guide${qs({ language })}`),
}

export interface EmotionLogBody {
  emotion_id: number
  intensity: number
  situation?: string | null
  automatic_thought?: string | null
  adaptive_response?: string | null
  reappraised_intensity?: number | null
}
