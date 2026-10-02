// Tema global claro / escuro / sistema.
// Grava em localStorage['makima-theme'] e aplica data-ds-theme no <html>.
// O script inline do index.html aplica o tema antes do primeiro render (sem flash).

import { useCallback, useSyncExternalStore } from 'react'
import { isThemePreference, resolveTheme, THEME_STORAGE_KEY, type ResolvedTheme, type ThemePreference } from '../core/theme'
import { webStorage } from './web'

type Listener = () => void
const listeners = new Set<Listener>()

function readPreference(): ThemePreference {
  const v = webStorage.get(THEME_STORAGE_KEY)
  return isThemePreference(v) ? v : 'system'
}

const systemDark = (): boolean => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

/** Aplica o tema no <html>. `system` remove o atributo e deixa o CSS seguir o sistema. */
export function applyTheme(pref: ThemePreference): void {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  if (pref === 'system') el.removeAttribute('data-ds-theme')
  else el.setAttribute('data-ds-theme', pref)
}

export function setThemePreference(pref: ThemePreference): void {
  webStorage.set(THEME_STORAGE_KEY, pref)
  applyTheme(pref)
  listeners.forEach((l) => l())
}

function subscribe(l: Listener): () => void {
  listeners.add(l)
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', l)
  return () => {
    listeners.delete(l)
    mq.removeEventListener('change', l)
  }
}

let initialized = false
/** Chame uma vez ao iniciar o app (idempotente). */
export function initTheme(): void {
  if (initialized || typeof document === 'undefined') return
  initialized = true
  applyTheme(readPreference())
}

export interface UseTheme {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (p: ThemePreference) => void
  /** Alterna claro ↔ escuro a partir do tema efetivo. */
  toggle: () => void
}

export function useTheme(): UseTheme {
  const preference = useSyncExternalStore(subscribe, readPreference, () => 'system' as ThemePreference)
  const dark = useSyncExternalStore(subscribe, systemDark, () => false)
  const resolved = resolveTheme(preference, dark)
  const toggle = useCallback(() => setThemePreference(resolved === 'dark' ? 'light' : 'dark'), [resolved])
  return { preference, resolved, setPreference: setThemePreference, toggle }
}
