// Testes da fila offline persistente (design/core/offlineQueue.ts). Sem rede nem DOM.

import { describe, expect, it, vi } from 'vitest'
import { createPersistentQueue, defaultIsTransient, type QueuedRequest } from './offlineQueue'
import { memoryStorage } from './ports'

/** Erro com código HTTP, como o ApiError (duck typing: o core não importa lib/). */
const http = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status })

function setup(send: (r: QueuedRequest) => Promise<void> = async () => {}) {
  const storage = memoryStorage()
  let n = 0
  const make = () =>
    createPersistentQueue({
      storage,
      send,
      newId: () => `id${++n}`,
      now: () => new Date('2026-11-04T12:00:00Z'),
    })
  return { storage, queue: make(), recarregar: make }
}

describe('enqueue', () => {
  it('guarda a escrita com id, horário e 0 tentativas', () => {
    const { queue } = setup()
    const item = queue.enqueue({ method: 'POST', path: '/api/tasks', body: { title: 'a' } })
    expect(item).toMatchObject({ id: 'id1', method: 'POST', createdAt: '2026-11-04T12:00:00.000Z', attempts: 0 })
    expect(queue.size()).toBe(1)
  })

  it('sobrevive a "fechar o app": outra instância sobre o mesmo storage vê os itens', () => {
    const { queue, recarregar } = setup()
    queue.enqueue({ method: 'POST', path: '/api/a' })
    expect(recarregar().pending().map((i) => i.path)).toEqual(['/api/a'])
  })

  it('mesmo id enfileirado duas vezes não duplica (toque duplo)', () => {
    const { queue } = setup()
    queue.enqueue({ id: 'x', method: 'POST', path: '/api/a' })
    queue.enqueue({ id: 'x', method: 'POST', path: '/api/a' })
    expect(queue.size()).toBe(1)
  })

  it('JSON corrompido no storage não quebra: começa vazio', () => {
    const { storage, queue } = setup()
    storage.set('makima-offline-queue', '{lixo')
    expect(queue.size()).toBe(0)
    expect(() => queue.enqueue({ method: 'POST', path: '/api/a' })).not.toThrow()
  })
})

describe('flush', () => {
  it('envia na ordem em que foram criados e esvazia a fila', async () => {
    const enviados: string[] = []
    const { queue } = setup(async (r) => { enviados.push(r.path) })
    queue.enqueue({ method: 'POST', path: '/api/1' })
    queue.enqueue({ method: 'PATCH', path: '/api/2' })
    queue.enqueue({ method: 'DELETE', path: '/api/3' })

    expect(await queue.flush()).toEqual({ sent: 3, rejected: 0, pending: 0 })
    expect(enviados).toEqual(['/api/1', '/api/2', '/api/3'])
  })

  it('erro temporário (rede/5xx): para, mantém a ordem e conta a tentativa', async () => {
    const send = vi.fn(async (r: QueuedRequest) => {
      if (r.path === '/api/2') throw new TypeError('Failed to fetch')
    })
    const { queue } = setup(send)
    queue.enqueue({ method: 'POST', path: '/api/1' })
    queue.enqueue({ method: 'POST', path: '/api/2' })
    queue.enqueue({ method: 'POST', path: '/api/3' })

    const res = await queue.flush()
    expect(res).toEqual({ sent: 1, rejected: 0, pending: 2 })
    expect(send).toHaveBeenCalledTimes(2) // não tentou o /api/3 antes do /api/2
    expect(queue.pending().map((i) => [i.path, i.attempts])).toEqual([['/api/2', 1], ['/api/3', 0]])
  })

  it('erro definitivo (4xx): vai para "não enviados" e a fila segue andando', async () => {
    const { queue } = setup(async (r) => { if (r.path === '/api/2') throw http(422) })
    queue.enqueue({ method: 'POST', path: '/api/1' })
    queue.enqueue({ method: 'POST', path: '/api/2' })
    queue.enqueue({ method: 'POST', path: '/api/3' })

    expect(await queue.flush()).toEqual({ sent: 2, rejected: 1, pending: 0 })
    expect(queue.failed().map((i) => i.path)).toEqual(['/api/2'])
    queue.clearFailed()
    expect(queue.failed()).toEqual([])
  })

  it('dois flush ao mesmo tempo não enviam o mesmo item duas vezes', async () => {
    let soltar: () => void = () => {}
    const send = vi.fn(() => new Promise<void>((ok) => { soltar = ok }))
    const { queue } = setup(send)
    queue.enqueue({ method: 'POST', path: '/api/1' })

    const a = queue.flush()
    const b = await queue.flush() // segundo disparo enquanto o primeiro espera o servidor
    expect(b.sent).toBe(0)
    soltar()
    await a
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('item criado durante o envio também é enviado no mesmo flush', async () => {
    const enviados: string[] = []
    const { queue } = setup(async (r) => {
      enviados.push(r.path)
      if (r.path === '/api/1') queue.enqueue({ method: 'POST', path: '/api/novo' })
    })
    queue.enqueue({ method: 'POST', path: '/api/1' })
    await queue.flush()
    expect(enviados).toEqual(['/api/1', '/api/novo'])
  })
})

describe('remove', () => {
  it('desiste de um item da fila', () => {
    const { queue } = setup()
    const a = queue.enqueue({ method: 'POST', path: '/api/a' })
    expect(queue.remove(a.id)).toBe(true)
    expect(queue.remove(a.id)).toBe(false)
    expect(queue.size()).toBe(0)
  })
})

describe('defaultIsTransient', () => {
  it.each([
    [new TypeError('Failed to fetch'), true],
    [http(500), true],
    [http(503), true],
    [http(408), true],
    [http(429), true],
    [http(400), false],
    [http(401), false],
    [http(404), false],
    [http(422), false],
  ])('%s → %s', (err, esperado) => {
    expect(defaultIsTransient(err)).toBe(esperado)
  })
})
