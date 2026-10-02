// useConfirm() — substitui window.confirm. O <ConfirmHost> (ui/) renderiza a caixa.
// Variante `danger`: botão vermelho e foco inicial em "Cancelar".

import { useSyncExternalStore } from 'react'

export interface ConfirmRequest {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface Pending extends ConfirmRequest {
  resolve: (ok: boolean) => void
}

let pending: Pending | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Abre a confirmação e resolve com true (confirmou) ou false (cancelou ou fechou). */
export function confirm(req: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    pending?.resolve(false)
    pending = { ...req, resolve }
    emit()
  })
}

export function answerConfirm(ok: boolean): void {
  const p = pending
  pending = null
  emit()
  p?.resolve(ok)
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const snapshot = () => pending

export function usePendingConfirm(): ConfirmRequest | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

export function useConfirm() {
  return confirm
}
