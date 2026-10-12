// Preferências do shell antigo (localStorage "vl-tweaks": tema, acento, modo e tipografia) viram as do padrão.
// Tema e acento agora são globais (Preferências → Aparência); "modo foco" vira o foco do Escrever e a
// tipografia "técnica" (monoespaçada) vira a fonte Roteiro. A chave antiga é apagada depois de lida.

import type { VioletPrefs } from '../context'

const KEY = 'vl-tweaks'

export function legacyPrefs(base: VioletPrefs, storage: Pick<Storage, 'getItem' | 'removeItem'> | null = safeStorage()): VioletPrefs {
  if (!storage) return base
  let raw: string | null = null
  try { raw = storage.getItem(KEY) } catch { return base }
  if (!raw) return base
  try {
    const old = JSON.parse(raw) as { mode?: string; typography?: string }
    storage.removeItem(KEY)
    return {
      ...base,
      focus: old.mode === 'focus' ? true : base.focus,
      font: old.typography === 'technical' ? 'roteiro' : base.font,
    }
  } catch {
    return base
  }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}
