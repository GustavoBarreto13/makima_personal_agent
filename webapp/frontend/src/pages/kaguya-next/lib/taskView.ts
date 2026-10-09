// Lógica PURA de exibição de uma tarefa: data relativa e urgência, prioridade, adiada/bloqueada, progresso das
// subtarefas. Sem React nem DOM — a tela só desenha o que isto devolve. "Hoje" vem sempre de fora (fuso local).

import { addDaysISO, diffDays, fmtDate, WEEKDAYS_SHORT, parseISODate } from '../../../design/core/format'
import type { Task } from '../types'

export type DueTone = 'overdue' | 'today' | 'soon' | 'later' | 'none'

export interface DueInfo {
  label: string
  tone: DueTone
  /** Dias até o vencimento (negativo = atrasada); null sem data. */
  days: number | null
}

/** "Hoje", "Amanhã", "Ontem", dia da semana (próximos 6 dias), ou "12 set" — com a hora, se houver. */
export function dueInfo(task: Pick<Task, 'due_date' | 'due_time'>, today: string): DueInfo {
  if (!task.due_date) return { label: '', tone: 'none', days: null }
  const days = diffDays(today, task.due_date)
  let label: string
  if (days === 0) label = 'Hoje'
  else if (days === 1) label = 'Amanhã'
  else if (days === -1) label = 'Ontem'
  else if (days > 1 && days <= 6) label = WEEKDAYS_SHORT[parseISODate(task.due_date).getDay()]
  else label = fmtDate(task.due_date)
  if (task.due_time) label += ` ${task.due_time}`
  const tone: DueTone = days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 2 ? 'soon' : 'later'
  return { label, tone, days }
}

export const PRIORITY_LABEL: Record<number, string> = { 0: 'Sem prioridade', 1: 'Baixa', 2: 'Média', 3: 'Alta' }
/** Ordem de exibição (mais urgente primeiro) — usada em agrupamentos. */
export const PRIORITY_ORDER = [3, 2, 1, 0] as const

/** Adiada: só aparece a partir de `start_date`, que ainda está no futuro. */
export function isDeferred(task: Pick<Task, 'start_date'>, today: string): boolean {
  return !!task.start_date && task.start_date > today
}

/** Rótulo curto de "adiada até …" (ou vazio). */
export function deferLabel(task: Pick<Task, 'start_date'>, today: string): string {
  if (!task.start_date || task.start_date <= today) return ''
  const days = diffDays(today, task.start_date)
  return days === 1 ? 'Volta amanhã' : `Volta ${fmtDate(task.start_date)}`
}

/** Aguardando e já passou do dia de cobrar. */
export function followUpDue(task: Pick<Task, 'gtd_status' | 'follow_up_date'>, today: string): boolean {
  return task.gtd_status === 'waiting' && !!task.follow_up_date && task.follow_up_date <= today
}

/** Todas as subtarefas de uma árvore, em profundidade. */
export function flattenTree(tasks: Task[]): Task[] {
  const out: Task[] = []
  const walk = (nodes: Task[]) => nodes.forEach((n) => { out.push(n); if (n.subtasks?.length) walk(n.subtasks) })
  walk(tasks)
  return out
}

/** Progresso das subtarefas diretas: "2/5", ou null sem subtarefas. */
export function subtaskProgress(task: Pick<Task, 'subtasks'>): { done: number; total: number } | null {
  const subs = task.subtasks ?? []
  return subs.length ? { done: subs.filter((s) => s.completed_at).length, total: subs.length } : null
}

/** Minutos → "45min", "1h30", "2h". */
export function fmtMinutes(min: number): string {
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

/** Faixa de vencimento para facetas/agrupamentos (ordenável pela posição em DUE_BUCKETS). */
export type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none'
export const DUE_BUCKETS: { value: DueBucket; label: string }[] = [
  { value: 'overdue', label: 'Atrasadas' }, { value: 'today', label: 'Hoje' }, { value: 'tomorrow', label: 'Amanhã' },
  { value: 'week', label: 'Próximos 7 dias' }, { value: 'later', label: 'Depois' }, { value: 'none', label: 'Sem data' },
]

export function dueBucket(task: Pick<Task, 'due_date'>, today: string): DueBucket {
  if (!task.due_date) return 'none'
  const days = diffDays(today, task.due_date)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return days <= 7 ? 'week' : 'later'
}

/** A data de hoje + n dias, em ISO (atalho legível nas telas). */
export const inDays = (today: string, n: number): string => addDaysISO(today, n)
