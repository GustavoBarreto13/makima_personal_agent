// Rótulos e ícones dos "não ditos": por que a pessoa não falou e o que aconteceu depois.

import type { IconName } from '../../../design'
import type { Unsaid, UnsaidReason, UnsaidStatus } from '../types'

export const REASONS: { value: UnsaidReason; label: string; hint: string }[] = [
  { value: 'nao_posso', label: 'Não posso', hint: 'Algo de fora me impede' },
  { value: 'nao_quero', label: 'Não quero', hint: 'Escolho não dizer' },
  { value: 'nao_consigo', label: 'Não consigo', hint: 'Tento e não sai' },
]
export const reasonLabel = (r: UnsaidReason) => REASONS.find((x) => x.value === r)?.label ?? 'Não disse'

export const STATUSES: { value: UnsaidStatus; label: string; icon: IconName }[] = [
  { value: 'kept', label: 'Guardado', icon: 'eye-off' },
  { value: 'said', label: 'Acabei falando', icon: 'send' },
  { value: 'let_go', label: 'Deixei ir', icon: 'check' },
]
export const statusLabel = (s: UnsaidStatus) => STATUSES.find((x) => x.value === s)?.label ?? 'Guardado'

/** Nome para exibir: a pessoa da Komi, senão o texto livre digitado. */
export const unsaidTo = (u: Pick<Unsaid, 'people' | 'recipient'>) => u.people[0]?.name ?? u.recipient
