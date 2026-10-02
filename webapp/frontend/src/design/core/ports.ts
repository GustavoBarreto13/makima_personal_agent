// Portas (interfaces injetadas) do Design System.
// O core/ nunca toca em localStorage, relógio global ou rede diretamente: recebe estas interfaces.
// Hoje a web fornece as implementações (headless/web.ts). Um app (Capacitor/React Native) fornece as dele.

/** Armazenamento chave → texto. Web: localStorage. App: AsyncStorage/Preferences. */
export interface Storage {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

/** Relógio. Injetável para testes e para datas sempre no fuso do usuário (UTC-3). */
export interface Clock {
  /** Data/hora atual. */
  now(): Date
}

/** Cliente HTTP mínimo. Os componentes do design/ nunca o chamam: só as telas ligam a API. */
export interface Http {
  get<T>(url: string): Promise<T>
  post<T>(url: string, body?: unknown): Promise<T>
  patch<T>(url: string, body?: unknown): Promise<T>
  del<T>(url: string): Promise<T>
}

/** Fila de escritas pendentes para o modo offline (hoje em memória; o app persiste). */
export interface OfflineQueue {
  push(job: { id: string; run: () => Promise<void> }): void
  flush(): Promise<void>
  size(): number
}

export const systemClock: Clock = { now: () => new Date() }

/** Armazenamento em memória: testes e ambientes sem storage. */
export function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get: (k) => (m.has(k) ? (m.get(k) as string) : null),
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
  }
}

/** Fila offline em memória (padrão). */
export function memoryQueue(): OfflineQueue {
  const jobs: { id: string; run: () => Promise<void> }[] = []
  return {
    push: (j) => void jobs.push(j),
    size: () => jobs.length,
    async flush() {
      while (jobs.length) {
        const j = jobs[0]
        await j.run()
        jobs.shift()
      }
    },
  }
}

/** Lê JSON do storage sem nunca lançar. */
export function readJSON<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.get(key)
    return raw ? ({ ...(fallback as object), ...JSON.parse(raw) } as T) : fallback
  } catch {
    return fallback
  }
}

/** Grava JSON no storage sem nunca lançar. */
export function writeJSON(storage: Storage, key: string, value: unknown): void {
  try {
    storage.set(key, JSON.stringify(value))
  } catch {
    /* storage cheio ou bloqueado: a UI funciona sem persistência */
  }
}
