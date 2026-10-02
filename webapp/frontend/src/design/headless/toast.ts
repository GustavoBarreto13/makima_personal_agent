// Toasts globais: um host (<ToastHost>) e uma store simples. Toda exclusão deve oferecer "Desfazer".
// O Ctrl+Z desfaz a ação mais recente (a mesma do botão do toast).

import { useSyncExternalStore } from 'react'

export type ToastTone = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
  /** Se houver, o toast mostra "Desfazer". */
  undo?: () => void
  /** ms até sumir (padrão 4200; erro com desfazer dura mais). */
  duration: number
}

export interface ToastOptions {
  tone?: ToastTone
  undo?: () => void
  duration?: number
}

let items: ToastItem[] = []
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(message: string, opts: ToastOptions = {}): number {
  const id = ++seq
  const item: ToastItem = {
    id,
    message,
    tone: opts.tone ?? 'info',
    undo: opts.undo,
    duration: opts.duration ?? (opts.undo ? 6000 : 4200),
  }
  items = [...items, item].slice(-4)
  emit()
  return id
}

export function dismissToast(id: number): void {
  items = items.filter((t) => t.id !== id)
  emit()
}

/** Executa o "Desfazer" do toast mais recente que tiver um. Devolve true se desfez algo. */
export function undoLast(): boolean {
  const last = [...items].reverse().find((t) => t.undo)
  if (!last) return false
  last.undo?.()
  dismissToast(last.id)
  return true
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const snapshot = () => items

export function useToastItems(): ToastItem[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Hook de conveniência: `const { toast } = useToast()`. */
export function useToast() {
  return { toast, dismiss: dismissToast, undoLast }
}

/** Só para testes. */
export function __resetToasts(): void {
  items = []
  seq = 0
  emit()
}
