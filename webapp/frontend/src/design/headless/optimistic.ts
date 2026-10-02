// Interações otimistas: marcar, avaliar e mover atualizam a UI na hora; se o servidor falhar,
// revertem com toast de erro. Se estiver offline e houver fila, a escrita entra na fila.

import { memoryQueue, type OfflineQueue } from '../core/ports'
import { toast } from './toast'

export const offlineQueue: OfflineQueue = memoryQueue()

export interface OptimisticAction<T> {
  /** Atualiza a UI imediatamente. */
  apply: () => void
  /** Persiste no servidor. */
  commit: () => Promise<T>
  /** Desfaz o `apply` se o commit falhar. */
  rollback: () => void
  errorMessage?: string
}

export async function runOptimistic<T>(a: OptimisticAction<T>): Promise<T | undefined> {
  a.apply()
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    offlineQueue.push({ id: String(Date.now()), run: async () => void (await a.commit()) })
    toast('Sem conexão. A alteração será enviada quando a rede voltar.')
    return undefined
  }
  try {
    return await a.commit()
  } catch {
    a.rollback()
    toast(a.errorMessage ?? 'Não foi possível salvar. Verifique a conexão e tente de novo.', { tone: 'error' })
    return undefined
  }
}
