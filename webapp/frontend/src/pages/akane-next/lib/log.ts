// Logar um filme: o que a linha rápida ("Duna 2 ★4.5 ontem @Cinemark +Ana #ficção") entende e como vira
// um rascunho. Lógica pura (sem React nem rede): a decisão de salvar direto ou abrir o formulário é daqui.

import { createCaptureParser, type CaptureResult } from '../../../design/core/capture'
import type { TmdbResult, WatchLocation } from '../types'

export const logParser = createCaptureParser({ rules: ['place', 'person', 'tag', 'rating', 'date'], dateDirection: 'past' })

export type PlaceChoice = { id: string } | { name: string; kind: WatchLocation['kind'] }
export interface PersonRef { id: string; name: string }

export interface LogDraft {
  /** O que foi digitado como título (usado para buscar no TMDB). */
  title: string
  /** Filme escolhido (TMDB ou catálogo). null = ainda não escolhido. */
  film: TmdbResult | null
  date: string
  rating: number | null
  liked: boolean
  review: string
  tags: string[]
  place: PlaceChoice | null
  people: PersonRef[]
}

/** O que a linha digitada pediu e não deu para resolver sozinho: vira aviso no formulário. */
export interface CaptureIssues {
  /** "@nome" que não bateu com nenhum local (ou bateu com vários). */
  place?: string
  /** "+nome": pessoa nunca é vinculada sem confirmar quem é (smart-match da Komi). */
  people: string[]
}

export const emptyDraft = (today: string): LogDraft => ({
  title: '', film: null, date: today, rating: null, liked: false, review: '', tags: [], place: null, people: [],
})

/** Minúsculas, sem acento e sem pontuação: "Amélie" e "amelie" são o mesmo título. */
export function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/** Resultado do TMDB só é "o filme certo" sem perguntar quando UM único resultado tem exatamente o título digitado. */
export function pickConfident(title: string, results: TmdbResult[]): TmdbResult | null {
  const t = norm(title)
  if (!t) return null
  const same = results.filter((r) => norm(r.title) === t)
  return same.length === 1 ? same[0] : null
}

/** "@cinemark" → o local cadastrado, se houver exatamente um que bata (nome igual, senão que comece/contenha). */
export function resolvePlace(name: string, locations: WatchLocation[]): WatchLocation | null {
  const n = norm(name)
  if (!n) return null
  const exact = locations.filter((l) => norm(l.name) === n)
  if (exact.length === 1) return exact[0]
  const part = locations.filter((l) => norm(l.name).startsWith(n) || norm(l.name).includes(n))
  return exact.length === 0 && part.length === 1 ? part[0] : null
}

export function draftFromCapture(r: CaptureResult, ctx: { today: string; locations: WatchLocation[] }): { draft: LogDraft; issues: CaptureIssues } {
  const f = r.fields
  const issues: CaptureIssues = { people: [...f.people] }
  let place: PlaceChoice | null = null
  if (f.place) {
    const hit = resolvePlace(f.place, ctx.locations)
    if (hit) place = { id: hit.id }
    else issues.place = f.place
  }
  return {
    draft: { ...emptyDraft(ctx.today), title: f.title.trim(), date: f.dueDate ?? ctx.today, rating: f.rating, tags: f.tags, place },
    issues,
  }
}

/** Mensagem de erro do campo certo, ou null se dá para salvar. */
export function validateDraft(d: LogDraft, today: string): { field: 'film' | 'date'; message: string } | null {
  if (!d.film) return { field: 'film', message: 'Escolha o filme na lista de resultados.' }
  if (!d.date) return { field: 'date', message: 'Escolha a data em que você assistiu.' }
  if (d.date > today) return { field: 'date', message: 'A data não pode ser no futuro.' }
  return null
}

/** Salva direto só se o filme foi reconhecido com certeza e a linha não deixou nada para confirmar. */
export function canSaveQuickly(draft: LogDraft, issues: CaptureIssues, today: string): boolean {
  return validateDraft(draft, today) === null && !issues.place && issues.people.length === 0
}
