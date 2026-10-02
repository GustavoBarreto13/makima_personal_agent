// Implementações web das portas do core/ (Storage, Clock). No app nativo estas são trocadas.

import { formatShortcut } from '../core/format'
import { memoryStorage, systemClock, type Clock, type Storage } from '../core/ports'

/** localStorage que nunca lança (modo privado, site bloqueado). Cai para memória se indisponível. */
function createWebStorage(): Storage {
  const fallback = memoryStorage()
  return {
    get(key) {
      try {
        return window.localStorage.getItem(key)
      } catch {
        return fallback.get(key)
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value)
      } catch {
        fallback.set(key, value)
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key)
      } catch {
        fallback.remove(key)
      }
    },
  }
}

export const webStorage: Storage = createWebStorage()
export const webClock: Clock = systemClock

/** O usuário está no macOS? (Só então os atalhos mostram ⌘ em vez de Ctrl.) */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')
}

/** Rótulo de atalho no padrão Windows: 'mod+k' → "Ctrl+K" (⌘K só no macOS). */
export function shortcutLabel(keys: string): string {
  return formatShortcut(keys, isMacPlatform() ? 'mac' : 'other')
}
