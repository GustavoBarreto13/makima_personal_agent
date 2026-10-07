// Os 7 status de um livro e como cada um aparece na tela: nome, ícone, tom do chip do DS e ordem.
// O shell antigo espremia os 7 em 4 (pausado virava "Quero ler", abandonado contava como "Lido");
// aqui cada um é ele mesmo.

import type { IconName, Status } from '../../../design'
import type { BookStatus } from '../types'

export interface StatusMeta {
  label: string
  /** Rótulo curto para chips e botões ("Pausar", "Abandonar"…). */
  action: string
  icon: IconName
  /** Tom do StatusChip do DS (um mapa único para todo o app). `null` = sem chip na capa. */
  tone: Status | null
}

export const STATUS: Record<BookStatus, StatusMeta> = {
  lendo: { label: 'Lendo', action: 'Comecei a ler', icon: 'book', tone: null },
  pausado: { label: 'Pausado', action: 'Pausar', icon: 'pause', tone: 'paused' },
  estante: { label: 'Na estante', action: 'Tenho na estante', icon: 'library', tone: 'planned' },
  quero_ler: { label: 'Quero ler', action: 'Quero ler', icon: 'watchlist', tone: 'planned' },
  wishlist: { label: 'Wishlist', action: 'Quero comprar', icon: 'store', tone: 'planned' },
  lido: { label: 'Lido', action: 'Terminei', icon: 'finished', tone: 'done' },
  abandonado: { label: 'Abandonado', action: 'Abandonar', icon: 'abandon', tone: 'dropped' },
}

/** Ordem de exibição: o que está em andamento primeiro, o que acabou por último. */
export const STATUS_ORDER: BookStatus[] = ['lendo', 'pausado', 'estante', 'quero_ler', 'wishlist', 'lido', 'abandonado']

/** Status que contam como "ainda vou ler" (tela Quero ler). */
export const TO_READ: BookStatus[] = ['estante', 'quero_ler', 'pausado']

export function isBookStatus(s: string): s is BookStatus {
  return (STATUS_ORDER as string[]).includes(s)
}
