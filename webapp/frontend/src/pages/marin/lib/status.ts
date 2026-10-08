// Os 5 estados de um anime e como cada um aparece na tela: nome, ícone, tom do chip do DS e ordem.

import type { IconName, Status } from '../../../design'
import type { AnimeStatus } from '../types'

export interface StatusMeta {
  label: string
  /** Verbo da ação que leva a este estado (menu de status). */
  action: string
  icon: IconName
  /** Tom do StatusChip do DS (um mapa único para todo o app). `null` = sem chip na capa. */
  tone: Status | null
}

export const STATUS: Record<AnimeStatus, StatusMeta> = {
  assistindo: { label: 'Assistindo', action: 'Assistindo', icon: 'episode', tone: null },
  completo: { label: 'Completo', action: 'Completo', icon: 'check', tone: 'done' },
  quero_assistir: { label: 'Quero assistir', action: 'Quero assistir', icon: 'watchlist', tone: 'planned' },
  pausado: { label: 'Pausado', action: 'Pausado', icon: 'pause', tone: 'paused' },
  abandonado: { label: 'Abandonado', action: 'Abandonado', icon: 'drop', tone: 'dropped' },
}

/** Ordem de exibição: o que está em andamento primeiro, o que acabou por último. */
export const STATUS_ORDER: AnimeStatus[] = ['assistindo', 'pausado', 'quero_assistir', 'completo', 'abandonado']

export function isAnimeStatus(s: string): s is AnimeStatus {
  return (STATUS_ORDER as string[]).includes(s)
}
