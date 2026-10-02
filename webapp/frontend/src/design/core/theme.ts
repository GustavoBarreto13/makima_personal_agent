// Tema global — lógica pura. O hook useTheme (headless/) aplica no DOM.

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'makima-theme'

export function isThemePreference(v: unknown): v is ThemePreference {
  return v === 'light' || v === 'dark' || v === 'system'
}

/** Preferência + o que o sistema pede → tema efetivo. */
export function resolveTheme(pref: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (pref === 'system') return systemDark ? 'dark' : 'light'
  return pref
}

/** Próxima preferência no botão de alternar rápido (claro ↔ escuro, partindo do efetivo). */
export function toggledPreference(resolved: ResolvedTheme): ThemePreference {
  return resolved === 'dark' ? 'light' : 'dark'
}
