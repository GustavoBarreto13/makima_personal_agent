// Ponte com o shell antigo: o que o navegador já guardava ("mr-tweaks", "marin.favorites") não se perde.

import type { MarinPrefs } from '../context'
import type { AnimeSort } from './schemas'

/** Lê `localStorage` sem estourar quando o navegador o bloqueia (janela anônima, por exemplo). */
function safeStorage(): Storage | null {
  try { return window.localStorage } catch { return null }
}

/** Preferências do shell antigo ("mr-tweaks") viram o ponto de partida das novas, para quem já tinha escolhido
 *  densidade e ordenação não perder a escolha. Só vale enquanto não há preferência nova salva (o usePrefs usa
 *  estes valores apenas como padrão). Tema e acento agora são globais do app. Exportada para teste. */
export function legacyPrefs(base: MarinPrefs, storage: Pick<Storage, 'getItem'> | null = safeStorage()): MarinPrefs {
  try {
    const raw = storage?.getItem('mr-tweaks')
    if (!raw) return base
    const old = JSON.parse(raw) as { densidade?: string; ordenacao?: string }
    const density = ({ Grande: 'large', 'Médio': 'medium', Compacto: 'compact' } as const)[old.densidade as 'Grande'] ?? base.density
    const sort: AnimeSort = ({ Atualizado: 'updated', Adicionado: 'added', Nota: 'rating', 'Título': 'title', Progresso: 'progress' } as const)[old.ordenacao as 'Nota'] ?? base.sort
    return { ...base, density, sort }
  } catch {
    return base
  }
}

const FAVORITES_KEY = 'marin.favorites'

/** IDs dos favoritos que o shell antigo guardava só neste navegador (até 4); vazio quando não há. */
export function legacyFavoriteIds(storage: Pick<Storage, 'getItem'> | null = safeStorage()): string[] {
  try {
    const raw = storage?.getItem(FAVORITES_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, 4) : []
  } catch {
    return []
  }
}

/** Apaga a chave antiga depois de enviar os favoritos ao servidor. */
export function clearLegacyFavorites(): void {
  try { safeStorage()?.removeItem(FAVORITES_KEY) } catch { /* sem storage: nada a limpar */ }
}
