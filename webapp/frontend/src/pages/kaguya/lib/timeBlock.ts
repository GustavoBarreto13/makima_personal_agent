// timeBlock.ts — motor PURO (sem React, sem rede) do espelhamento
// início · fim · estimativa do TaskModal.
//
// Regra de negócio (aprovada no protótipo "Kaguya · Modal de Tarefa"):
//   - Os três campos descrevem UM conceito só, ditos de três jeitos.
//   - Editar dois quaisquer resolve o terceiro — MAS só quando início e fim
//     caem no MESMO dia. Evento de vários dias → a estimativa fica independente.
//   - Sem hora de início, só a estimativa vale (vira insumo da CapacityBar).
//
// A UI chama uma das três funções `apply*` e aplica o patch resultante ao state.

import { snapDuration } from './durations'

/** Estado temporal editável do modal. `startDate`/`endDate` são "YYYY-MM-DD". */
export interface TimeBlockState {
  startDate: string          // data de início (due_date)
  endDate: string            // data de fim ("" = mesmo dia do início)
  startTime: string          // "HH:MM" ou ""
  endTime: string            // "HH:MM" ou ""
  durationMin: number        // estimativa em minutos (0 = sem estimativa)
}

/** Campos que uma edição pode devolver para o `setState` do modal. */
export type TimeBlockPatch = Partial<Pick<TimeBlockState, 'startTime' | 'endTime' | 'durationMin'>>

// "HH:MM" → minutos do dia (ou null se vazio/ inválido).
export function hhmmToMin(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1]); const mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

// minutos do dia → "HH:MM" (clampado em 00:00–23:45).
export function minToHhmm(min: number): string {
  const v = Math.max(0, Math.min(23 * 60 + 45, Math.round(min)))
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}

/** Início e fim caem no mesmo dia? (endDate vazio = mesmo dia). */
export function isSameDay(s: Pick<TimeBlockState, 'startDate' | 'endDate'>): boolean {
  return !s.endDate || s.endDate === s.startDate
}

/**
 * Usuário mudou a HORA DE INÍCIO.
 * - mesmo dia + estimativa definida → desloca o fim mantendo a estimativa;
 * - mesmo dia sem estimativa mas com fim → recalcula a estimativa (fim − início);
 * - multi-dia → só grava o início.
 */
export function applyStart(s: TimeBlockState, value: string): TimeBlockPatch {
  const patch: TimeBlockPatch = { startTime: value }
  if (!isSameDay(s)) return patch
  const start = hhmmToMin(value)
  if (start == null) return patch
  if (s.durationMin > 0) {
    patch.endTime = minToHhmm(start + s.durationMin)
  } else {
    const end = hhmmToMin(s.endTime)
    if (end != null && end > start) patch.durationMin = snapDuration(end - start)
  }
  return patch
}

/**
 * Usuário mudou a HORA DE FIM.
 * - mesmo dia + início definido → recalcula a estimativa (fim − início, com snap);
 * - multi-dia (ou sem início) → só grava o fim.
 */
export function applyEnd(s: TimeBlockState, value: string): TimeBlockPatch {
  const patch: TimeBlockPatch = { endTime: value }
  if (!isSameDay(s)) return patch
  const start = hhmmToMin(s.startTime)
  const end = hhmmToMin(value)
  if (start != null && end != null && end > start) patch.durationMin = snapDuration(end - start)
  return patch
}

/**
 * Usuário mudou a ESTIMATIVA.
 * - mesmo dia + início definido → recalcula o fim (início + estimativa);
 * - multi-dia (ou sem início) → só grava a estimativa.
 */
export function applyEstimate(s: TimeBlockState, minutes: number): TimeBlockPatch {
  const patch: TimeBlockPatch = { durationMin: minutes }
  if (!isSameDay(s)) return patch
  const start = hhmmToMin(s.startTime)
  if (start != null && minutes > 0) patch.endTime = minToHhmm(start + minutes)
  return patch
}
