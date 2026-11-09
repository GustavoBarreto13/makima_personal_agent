// Testes da escrita offline (src/lib/offlineWrites.ts): rede e navegador simulados (ambiente node).

import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Navegador mínimo: o módulo só usa `window` (eventos) e `navigator.onLine`. */
function navegador(onLine: boolean) {
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('navigator', { onLine })
}

/** Importa o módulo "do zero" (fila vazia, sem estado de um teste para o outro). */
async function carregar() {
  vi.resetModules()
  navegador(true)
  const m = await import('./offlineWrites')
  const { webStorage } = await import('../design/headless/web')
  const ler = (k: string) => JSON.parse(webStorage.get(k) ?? 'null')
  return { ...m, ler }
}

function resposta(status: number, corpo: unknown = {}): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('writeOrQueue', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('com rede: envia na hora, com Idempotency-Key, e devolve a resposta', async () => {
    const m = await carregar()
    const fetchMock = vi.fn().mockResolvedValue(resposta(201, { id: 7 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await m.writeOrQueue('POST', '/api/tasks', { title: 'A' })
    expect(r).toEqual({ queued: false, data: { id: 7 } })
    const headers = new Headers(fetchMock.mock.calls[0][1].headers)
    expect(headers.get('Idempotency-Key')).toBeTruthy()
  })

  it('sem rede (fetch rejeita): guarda na fila com o MESMO id da tentativa', async () => {
    const m = await carregar()
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    const r = await m.writeOrQueue('POST', '/api/tasks', { title: 'A' })
    expect(r).toEqual({ queued: true })
    const idTentativa = new Headers(fetchMock.mock.calls[0][1].headers).get('Idempotency-Key')
    const guardado = m.ler('makima-offline-queue') ?? []
    expect(guardado).toHaveLength(1)
    expect(guardado[0].id).toBe(idTentativa)
  })

  it('aparelho offline: nem tenta enviar', async () => {
    const m = await carregar()
    vi.stubGlobal('navigator', { onLine: false })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await m.writeOrQueue('POST', '/api/tasks', { title: 'A' })).toEqual({ queued: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('erro do servidor (400) é lançado e NÃO vai para a fila', async () => {
    const m = await carregar()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(400, { detail: 'inválido' })))
    await expect(m.writeOrQueue('POST', '/api/tasks', {})).rejects.toThrow('inválido')
    expect(m.ler('makima-offline-queue')).toBeNull()
  })

  it('flush: envia em ordem, reaproveita o id e avisa as telas', async () => {
    const m = await carregar()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x')))
    await m.writeOrQueue('POST', '/api/tasks', { title: 'A' })
    await m.writeOrQueue('POST', '/api/tasks', { title: 'B' })
    const ids = m.ler('makima-offline-queue').map((i: { id: string }) => i.id)

    const enviados: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      enviados.push(new Headers(init.headers).get('Idempotency-Key')!)
      return resposta(201)
    }))
    const sincronizou = vi.fn()
    m.onOfflineSynced(sincronizou)
    await m.flushOfflineWrites()

    expect(enviados).toEqual(ids)
    expect(sincronizou).toHaveBeenCalledOnce()
    expect(m.ler('makima-offline-queue')).toEqual([])
  })

  it('flush: sessão expirada (401) mantém o item para depois', async () => {
    const m = await carregar()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x')))
    await m.writeOrQueue('POST', '/api/tasks', { title: 'A' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(401, { detail: 'x' })))
    await m.flushOfflineWrites()
    expect(m.ler('makima-offline-queue')).toHaveLength(1)
  })

  it('flush: recusa definitiva (422) vai para a lista de não enviados', async () => {
    const m = await carregar()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x')))
    await m.writeOrQueue('POST', '/api/tasks', { title: 'A' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(422, { detail: 'x' })))
    await m.flushOfflineWrites()
    expect(m.ler('makima-offline-queue')).toEqual([])
    expect(m.ler('makima-offline-queue:failed')).toHaveLength(1)
  })

  it('clearOfflineWrites apaga fila e recusados', async () => {
    const m = await carregar()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x')))
    await m.writeOrQueue('POST', '/api/tasks', { title: 'A' })
    m.clearOfflineWrites()
    expect(m.ler('makima-offline-queue')).toEqual([])
  })
})
