// Utilitário puro de classificação Eisenhower — compartilhado entre EisenhowerScreen
// e qualquer outro consumidor (ex.: relato textual do Telegram).
// Régua: urgente = vence em ≤2 dias; importante = prioridade ≥ 2 (média ou alta).
// Uma definição, dois canais (FR-005/SC-004 da spec 017).

import type { Task } from '../types'

// Ids dos quadrantes (mantém a nomenclatura do protótipo QUADS).
export type QuadId = 'q1' | 'q2' | 'q3' | 'q4'

// Definição de um quadrante (metadados estáticos usados pela tela).
export interface Quad {
  id: QuadId
  label: string          // "Faça agora"
  sub: string            // "Urgente · Importante"
  color: string          // token CSS de cor da marca
  urgent: boolean
  important: boolean
}

// Os 4 quadrantes na ordem da grade 2×2 (linha 1: q1/q2, linha 2: q3/q4).
export const QUADS: Quad[] = [
  { id: 'q1', label: 'Faça agora',    sub: 'Urgente · Importante',          color: 'var(--p-high)', urgent: true,  important: true  },
  { id: 'q2', label: 'Agende',        sub: 'Importante · Não urgente',      color: 'var(--p-med)',  urgent: false, important: true  },
  { id: 'q3', label: 'Resolva rápido', sub: 'Urgente · Não importante',     color: 'var(--p-low)',  urgent: true,  important: false },
  { id: 'q4', label: 'Depois',        sub: 'Nem urgente · Nem importante',  color: 'var(--ink-4)',  urgent: false, important: false },
]

// Calcula a diferença em dias entre hoje e uma data ISO "YYYY-MM-DD".
// Retorna null se a data for nula.
function diasAte(isoDate: string): number {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(isoDate + 'T00:00:00')
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000)
}

// Tarefa é urgente se tem due_date e vence em ≤2 dias (inclusive hoje e vencidas).
export function isUrgent(task: Task): boolean {
  if (!task.due_date) return false
  return diasAte(task.due_date) <= 2
}

// Tarefa é importante se prioridade ≥ média (2).
export function isImportant(task: Task): boolean {
  return task.priority >= 2
}

// Retorna o id do quadrante derivado dos campos da tarefa.
export function getQuadrant(task: Task): QuadId {
  const u = isUrgent(task)
  const i = isImportant(task)
  if (u && i)  return 'q1'
  if (!u && i) return 'q2'
  if (u && !i) return 'q3'
  return 'q4'
}

// "amanhã" como string "YYYY-MM-DD" (fuso local — coerente com o campo due_date).
function amanha(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

// "hoje + N dias" como string "YYYY-MM-DD".
function hojeMaisN(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// Monta o patch para atualizar a tarefa ao ser arrastada para o quadrante `targetId`.
// Retorna null se o drag não altera nada (tarefa já está no quadrante destino).
export function buildDragPatch(
  task: Task,
  targetId: QuadId,
): { priority?: number; due_date?: string | null } | null {
  const target = QUADS.find(q => q.id === targetId)!
  const patch: { priority?: number; due_date?: string | null } = {}

  // Ajuste de importância (prioridade)
  if (target.important && !isImportant(task)) {
    patch.priority = 2  // sobe para "média" (mínimo do importante)
  } else if (!target.important && isImportant(task)) {
    patch.priority = 1  // baixa para "baixa"
  }

  // Ajuste de urgência (due_date)
  if (target.urgent && !isUrgent(task)) {
    patch.due_date = amanha()  // antecipa para dentro da janela de urgência
  } else if (!target.urgent && isUrgent(task)) {
    patch.due_date = hojeMaisN(5)  // empurra para fora da janela (hoje + 5)
  }

  // Sem alteração → não gera patch (evita chamada desnecessária à API).
  if (Object.keys(patch).length === 0) return null
  return patch
}
