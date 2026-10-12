// Classificação da matriz de Eisenhower — pura. Urgente = vence em até 2 dias (inclui hoje e atrasadas);
// importante = prioridade média ou alta. A matriz não cria campo novo: arrastar entre quadrantes ajusta a prioridade
// e/ou o vencimento. “Hoje” vem sempre de fora (fuso local), nunca do relógio do servidor nem de toISOString().

import { addDaysISO, diffDays } from '../../../design/core/format'
import type { Task } from '../types'

export type QuadId = 'q1' | 'q2' | 'q3' | 'q4'

export interface Quad {
  id: QuadId
  label: string
  sub: string
  /** Token de cor do marcador. */
  color: string
  urgent: boolean
  important: boolean
}

export const QUADS: Quad[] = [
  { id: 'q1', label: 'Faça agora', sub: 'Urgente · Importante', color: 'var(--ds-danger)', urgent: true, important: true },
  { id: 'q2', label: 'Agende', sub: 'Importante · Não urgente', color: 'var(--ds-warn)', urgent: false, important: true },
  { id: 'q3', label: 'Resolva rápido', sub: 'Urgente · Não importante', color: 'var(--ds-info)', urgent: true, important: false },
  { id: 'q4', label: 'Depois', sub: 'Nem urgente · Nem importante', color: 'var(--ds-ink-4)', urgent: false, important: false },
]

export const isUrgent = (t: Pick<Task, 'due_date'>, today: string): boolean => !!t.due_date && diffDays(today, t.due_date) <= 2
export const isImportant = (t: Pick<Task, 'priority'>): boolean => (t.priority ?? 0) >= 2

export function getQuadrant(t: Pick<Task, 'due_date' | 'priority'>, today: string): QuadId {
  const u = isUrgent(t, today)
  const i = isImportant(t)
  return u && i ? 'q1' : !u && i ? 'q2' : u ? 'q3' : 'q4'
}

export interface QuadPatch { priority?: number; due_date?: string | null }

/** O que mudar na tarefa para ela cair no quadrante `targetId`. `null` quando já está nele. */
export function buildDragPatch(t: Pick<Task, 'due_date' | 'priority'>, targetId: QuadId, today: string): QuadPatch | null {
  const target = QUADS.find((q) => q.id === targetId)!
  const patch: QuadPatch = {}
  if (target.important && !isImportant(t)) patch.priority = 2
  else if (!target.important && isImportant(t)) patch.priority = 1
  if (target.urgent && !isUrgent(t, today)) patch.due_date = addDaysISO(today, 1)
  else if (!target.urgent && isUrgent(t, today)) patch.due_date = addDaysISO(today, 5)
  return Object.keys(patch).length ? patch : null
}

/** O patch que desfaz `patch` na tarefa original (para o “Desfazer”). */
export function undoPatch(t: Pick<Task, 'due_date' | 'priority'>, patch: QuadPatch): QuadPatch {
  const back: QuadPatch = {}
  if (patch.priority !== undefined) back.priority = t.priority ?? 0
  if (patch.due_date !== undefined) back.due_date = t.due_date ?? null
  return back
}
