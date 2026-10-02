// usePrefs — preferências do domínio, persistidas em `ds:prefs:<agente>`.
// O tema NÃO entra aqui (é global, ver useTheme). O acento também não: é identidade do agente.

import { useCallback, useEffect, useState } from 'react'
import { readJSON, writeJSON, type Storage } from '../core/ports'
import { webStorage } from './web'

export function usePrefs<T extends object>(agent: string, defaults: T, storage: Storage = webStorage): [T, (patch: Partial<T>) => void] {
  const key = `ds:prefs:${agent}`
  const [prefs, setPrefs] = useState<T>(() => readJSON<T>(storage, key, defaults))
  useEffect(() => writeJSON(storage, key, prefs), [prefs, storage, key])
  const patch = useCallback((p: Partial<T>) => setPrefs((cur) => ({ ...cur, ...p })), [])
  return [prefs, patch]
}
