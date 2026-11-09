// Escrita sem internet: tenta enviar na hora; se não houver rede, guarda no aparelho e envia depois.
//
// Como funciona (ver design/core/offlineQueue.ts, que guarda a fila em disco):
//   1. Cada escrita ganha um id único, mandado ao servidor no cabeçalho `Idempotency-Key`.
//   2. Se o envio falhar por falta de rede, o item entra na fila COM O MESMO id.
//   3. Quando a internet volta (evento `online`, app voltando ao primeiro plano, abertura), a fila é enviada
//      em ordem. Se o servidor já tinha gravado antes e só a resposta se perdeu, ele reconhece o id e não
//      grava de novo (webapp/backend/idempotency.py) — por isso reenviar nunca duplica.
//   4. O horário/data vai dentro do corpo, no momento em que o usuário agiu (não no do envio).
//
// Só rotas listadas em webapp/backend/idempotency.py participam; outras escritas seguem exigindo internet.

import { useSyncExternalStore } from 'react'
import { createPersistentQueue, defaultIsTransient, type QueuedRequest, type QueueMethod } from '../design/core/offlineQueue'
import { webStorage } from '../design/headless/web'
import { toast } from '../design/headless/toast'
import { ApiError, authFetch, errorFromResponse } from './api'

/** Evento disparado no `window` depois que a fila enviou algo: as telas recarregam seus dados. */
export const OFFLINE_SYNCED_EVENT = 'makima:offline-synced'

/** Aviso padrão quando uma escrita foi guardada no aparelho. */
export const QUEUED_MESSAGE = 'Sem internet — salvo no aparelho. Envio quando voltar.'

/** Resultado de uma escrita: enviada agora (com a resposta) ou guardada para depois. */
export type WriteResult<T> = { queued: false; data: T } | { queued: true }

/**
 * Sessão expirada (401/403) não é motivo para jogar a escrita fora: a fila espera o usuário entrar de novo.
 * Os demais 4xx continuam definitivos (dado recusado pelo servidor).
 */
function isTransient(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status
  return status === 401 || status === 403 || defaultIsTransient(err)
}

/** Monta e envia a requisição. Usada tanto no envio imediato quanto no reenvio da fila. */
function request(method: QueueMethod, path: string, body: unknown, id: string): Promise<Response> {
  return authFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': id },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const queue = createPersistentQueue({
  storage: webStorage,
  isTransient,
  send: async (req) => {
    const res = await request(req.method, req.path, req.body, req.id)
    if (!res.ok) throw await errorFromResponse(res)
  },
})

// ─── Estado observável (selo "N aguardando internet") ───────────────────────────────────────────

export interface PendingState {
  pending: number
  failed: QueuedRequest[]
}

let snapshot: PendingState = { pending: queue.size(), failed: queue.failed() }
const listeners = new Set<() => void>()

/** Recalcula o estado e avisa quem está olhando. */
function notify(): void {
  snapshot = { pending: queue.size(), failed: queue.failed() }
  listeners.forEach((l) => l())
}

/** Hook: quantas escritas aguardam envio e quais foram recusadas pelo servidor. */
export function usePendingWrites(): PendingState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => snapshot,
  )
}

// ─── API pública ────────────────────────────────────────────────────────────────────────────────

/**
 * Envia uma escrita; se não houver rede, guarda para enviar depois.
 *
 * Erros do servidor (4xx/5xx) continuam sendo lançados como `ApiError`, para a tela mostrar o problema:
 * só a falta de rede vira fila.
 *
 * @param method - Verbo HTTP.
 * @param path - Rota do backend (ex.: '/api/tasks').
 * @param body - Corpo JSON.
 * @returns `{ queued: false, data }` se enviou, ou `{ queued: true }` se ficou na fila.
 */
export async function writeOrQueue<T = unknown>(method: QueueMethod, path: string, body?: unknown): Promise<WriteResult<T>> {
  const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
  const guardar = (): WriteResult<T> => {
    queue.enqueue({ id, method, path, body })
    notify()
    toast(QUEUED_MESSAGE, { tone: 'info' })
    return { queued: true }
  }
  // Aparelho sabidamente offline: nem tenta (evita esperar o tempo limite da rede).
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return guardar()

  let res: Response
  try {
    res = await request(method, path, body, id)
  } catch (e) {
    if (e instanceof ApiError) throw e // ex.: sessão que não renova — não é falta de rede
    return guardar() // fetch rejeitou (sem rede): guarda com o MESMO id usado acima
  }
  if (!res.ok) throw await errorFromResponse(res)
  return { queued: false, data: (await res.json()) as T }
}

let flushing: Promise<void> | null = null

/** Envia a fila agora (ignora se já há envio em andamento). Avisa as telas e mostra o que foi recusado. */
export function flushOfflineWrites(): Promise<void> {
  if (flushing) return flushing
  if (queue.size() === 0) return Promise.resolve()
  flushing = (async () => {
    try {
      const r = await queue.flush()
      notify()
      if (r.sent > 0) window.dispatchEvent(new Event(OFFLINE_SYNCED_EVENT))
      if (r.rejected > 0) {
        toast(`${r.rejected} alteraç${r.rejected > 1 ? 'ões' : 'ão'} feita${r.rejected > 1 ? 's' : ''} sem internet não ${r.rejected > 1 ? 'puderam' : 'pôde'} ser enviada${r.rejected > 1 ? 's' : ''}.`, { tone: 'error' })
      }
    } finally {
      flushing = null
    }
  })()
  return flushing
}

/** Descarta as escritas que o servidor recusou (depois de o usuário ver o aviso). */
export function discardFailedWrites(): void {
  queue.clearFailed()
  notify()
}

/** Apaga tudo (logout pedido pelo usuário): nada do que foi escrito fica guardado no aparelho. */
export function clearOfflineWrites(): void {
  for (const item of queue.pending()) queue.remove(item.id)
  queue.clearFailed()
  notify()
}

/** Liga o reenvio automático: ao abrir e sempre que a internet voltar. Devolve a função que desliga. */
export function initOfflineWrites(): () => void {
  const flush = () => void flushOfflineWrites()
  window.addEventListener('online', flush)
  flush()
  return () => window.removeEventListener('online', flush)
}

/** Hook: roda `onSynced` quando a fila enviou algo (para a tela recarregar os dados). */
export function onOfflineSynced(onSynced: () => void): () => void {
  window.addEventListener(OFFLINE_SYNCED_EVENT, onSynced)
  return () => window.removeEventListener(OFFLINE_SYNCED_EVENT, onSynced)
}
