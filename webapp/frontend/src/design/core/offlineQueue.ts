// Fila de escritas offline PERSISTENTE (sobrevive a fechar o app).
//
// A porta `OfflineQueue` de ports.ts guarda funções (`run: () => Promise<void>`), que não dá para
// salvar em disco. Aqui cada item é uma descrição simples da requisição (método + rota + corpo),
// que cabe em JSON e vai para o `Storage` (localStorage na web, Preferences no app).
//
// Regras:
//   - Ordem preservada: o que foi feito primeiro é enviado primeiro (criar tarefa → concluir tarefa).
//   - Erro temporário (sem rede, 5xx, 408, 429): para o envio e tenta de novo depois, sem perder nada.
//   - Erro definitivo (4xx, ex.: dado inválido): o item vai para a lista de "não enviados" para o
//     usuário ver — nunca fica travando a fila nem é apagado em silêncio.
//   - Cada item tem um `id` único, repassado a quem envia: base para o servidor, no futuro,
//     ignorar repetição (hoje, se a resposta se perder depois do servidor gravar, o reenvio duplica).
//
// Sem dependência de rede nem de DOM: tudo entra por parâmetro (por isso é testável em vitest).

import type { Storage } from './ports'

export type QueueMethod = 'POST' | 'PATCH' | 'PUT' | 'DELETE'

/** Uma escrita guardada para enviar depois. */
export interface QueuedRequest {
  id: string
  method: QueueMethod
  /** Rota do backend (ex.: '/api/tasks'). */
  path: string
  body?: unknown
  /** ISO 8601 do momento em que o usuário agiu (não o do envio). */
  createdAt: string
  /** Quantas tentativas de envio já falharam por motivo temporário. */
  attempts: number
}

/** Dados que quem enfileira informa; o resto a fila preenche. */
export type QueueInput = Pick<QueuedRequest, 'method' | 'path' | 'body'> & { id?: string }

export interface FlushResult {
  /** Itens enviados com sucesso. */
  sent: number
  /** Itens recusados de vez pelo servidor (foram para `failed()`). */
  rejected: number
  /** Itens que continuam na fila (parou num erro temporário ou já havia envio em andamento). */
  pending: number
}

export interface PersistentQueueOptions {
  storage: Storage
  /** Envia UMA requisição de verdade. Deve lançar erro se falhar. */
  send: (req: QueuedRequest) => Promise<void>
  /** Chave no storage (padrão 'makima-offline-queue'); a lista de recusados usa `${key}:failed`. */
  key?: string
  /** Relógio injetável (testes). */
  now?: () => Date
  /** Gerador de id injetável (testes). */
  newId?: () => string
  /** Decide se um erro é temporário. Padrão: sem `status` ou 5xx/408/429 = temporário. */
  isTransient?: (err: unknown) => boolean
}

/** Padrão: erro sem código HTTP (rede) ou 5xx/408/429 é temporário; os demais 4xx são definitivos. */
export function defaultIsTransient(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status
  if (typeof status !== 'number') return true
  return status >= 500 || status === 408 || status === 429
}

function fallbackId(): string {
  // crypto.randomUUID existe em navegadores modernos e no Node 19+; o resto cai no aleatório simples.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  return c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export interface PersistentQueue {
  /** Guarda uma escrita para enviar depois. Devolve o item criado. */
  enqueue(input: QueueInput): QueuedRequest
  /** Tenta enviar tudo, em ordem. Seguro chamar várias vezes (ignora se já há envio em andamento). */
  flush(): Promise<FlushResult>
  /** Itens aguardando envio, na ordem. */
  pending(): QueuedRequest[]
  /** Itens que o servidor recusou de vez (para mostrar ao usuário). */
  failed(): QueuedRequest[]
  /** Quantos itens aguardam envio. */
  size(): number
  /** Remove um item da fila (ex.: o usuário desistiu). Devolve true se existia. */
  remove(id: string): boolean
  /** Esvazia a lista de recusados (depois do usuário ver). */
  clearFailed(): void
}

/**
 * Cria a fila persistente.
 *
 * @example
 *   const fila = createPersistentQueue({ storage: webStorage, send: (r) => authFetch(r.path, {...}) })
 *   fila.enqueue({ method: 'POST', path: '/api/tasks', body: { title: 'Pagar luz' } })
 *   window.addEventListener('online', () => void fila.flush())
 */
export function createPersistentQueue(opts: PersistentQueueOptions): PersistentQueue {
  const { storage, send } = opts
  const key = opts.key ?? 'makima-offline-queue'
  const failedKey = `${key}:failed`
  const now = opts.now ?? (() => new Date())
  const newId = opts.newId ?? fallbackId
  const isTransient = opts.isTransient ?? defaultIsTransient
  let flushing = false

  const read = (k: string): QueuedRequest[] => {
    try {
      const parsed = JSON.parse(storage.get(k) ?? '[]')
      return Array.isArray(parsed) ? (parsed as QueuedRequest[]) : []
    } catch {
      return [] // JSON corrompido: começa vazio em vez de quebrar o app
    }
  }
  const write = (k: string, items: QueuedRequest[]): void => {
    try {
      storage.set(k, JSON.stringify(items))
    } catch {
      /* storage cheio/bloqueado: a fila segue em memória durante esta sessão */
    }
  }

  return {
    enqueue(input) {
      const item: QueuedRequest = {
        id: input.id ?? newId(),
        method: input.method,
        path: input.path,
        body: input.body,
        createdAt: now().toISOString(),
        attempts: 0,
      }
      const items = read(key)
      // Mesmo id já enfileirado (toque duplo, reenvio do formulário): não duplica.
      const existente = items.find((i) => i.id === item.id)
      if (existente) return existente
      write(key, [...items, item])
      return item
    },

    async flush() {
      if (flushing) return { sent: 0, rejected: 0, pending: read(key).length }
      flushing = true
      let sent = 0
      let rejected = 0
      try {
        // Sempre relê o primeiro item do storage: enqueue() pode acontecer enquanto um envio espera
        // o servidor. Depois do envio, mexemos SÓ no item enviado (pelo id) sobre a lista atual —
        // regravar uma lista lida antes do envio apagaria o que foi enfileirado nesse meio-tempo.
        for (;;) {
          const primeiro = read(key)[0]
          if (!primeiro) break
          const semPrimeiro = () => read(key).filter((i) => i.id !== primeiro.id)
          try {
            await send(primeiro)
            write(key, semPrimeiro())
            sent++
          } catch (err) {
            if (isTransient(err)) {
              write(key, read(key).map((i) => (i.id === primeiro.id ? { ...i, attempts: i.attempts + 1 } : i)))
              break // mantém a ordem: não tenta os próximos antes deste
            }
            write(failedKey, [...read(failedKey), primeiro])
            write(key, semPrimeiro())
            rejected++
          }
        }
      } finally {
        flushing = false
      }
      return { sent, rejected, pending: read(key).length }
    },

    pending: () => read(key),
    failed: () => read(failedKey),
    size: () => read(key).length,

    remove(id) {
      const items = read(key)
      const resto = items.filter((i) => i.id !== id)
      if (resto.length === items.length) return false
      write(key, resto)
      return true
    },

    clearFailed: () => write(failedKey, []),
  }
}
