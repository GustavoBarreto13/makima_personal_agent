import { describe, expect, it, vi } from 'vitest'
import {
  NativeSession,
  REFRESH_MARGIN_MS,
  type RefreshResult,
  type StoredSession,
  type TokenResponse,
} from './tokenSession'

const T0 = 1_000_000

/** Resposta do servidor com `n` no nome dos tokens, para distinguir renovações. */
const resp = (n: number, name = ''): TokenResponse => ({
  access_token: `acc${n}`,
  refresh_token: `ref${n}`,
  expires_in: 1800,
  device_id: 'dev1',
  user: { email: 'eu@x.com', name },
})

function setup(initial: StoredSession | null, refresh: (t: string) => Promise<RefreshResult>) {
  let stored = initial
  let now = T0
  const refreshRequest = vi.fn(refresh)
  const session = new NativeSession({
    store: {
      read: async () => stored,
      write: async (s) => {
        stored = s
      },
      clear: async () => {
        stored = null
      },
    },
    refreshRequest,
    now: () => now,
  })
  return { session, refreshRequest, getStored: () => stored, advance: (ms: number) => (now += ms) }
}

const logged = (): StoredSession => ({
  accessToken: 'acc0',
  accessExpiresAt: T0 + 1800_000,
  refreshToken: 'ref0',
  deviceId: 'dev1',
  email: 'eu@x.com',
  name: 'Gustavo',
})

describe('NativeSession', () => {
  it('sem sessão devolve null e não chama o servidor', async () => {
    const { session, refreshRequest } = setup(null, async () => ({ ok: false, status: 500 }))
    expect(await session.getAccessToken()).toBeNull()
    expect(refreshRequest).not.toHaveBeenCalled()
  })

  it('token ainda válido é devolvido sem renovar', async () => {
    const { session, refreshRequest } = setup(logged(), async () => ({ ok: false, status: 500 }))
    expect(await session.getAccessToken()).toBe('acc0')
    expect(refreshRequest).not.toHaveBeenCalled()
  })

  it('renova quando falta menos que a margem e guarda o novo par (mantendo o nome)', async () => {
    const { session, refreshRequest, getStored, advance } = setup(logged(), async () => ({ ok: true, data: resp(1) }))
    advance(1800_000 - REFRESH_MARGIN_MS + 1)
    expect(await session.getAccessToken()).toBe('acc1')
    expect(refreshRequest).toHaveBeenCalledWith('ref0')
    expect(getStored()).toMatchObject({ accessToken: 'acc1', refreshToken: 'ref1', name: 'Gustavo' })
  })

  it('pedidos simultâneos com o token vencido fazem UMA renovação só (refresh rotativo)', async () => {
    let calls = 0
    const { session, advance } = setup(logged(), async () => {
      calls += 1
      await Promise.resolve()
      return { ok: true, data: resp(calls) }
    })
    advance(1800_000)
    const tokens = await Promise.all([session.getAccessToken(), session.getAccessToken(), session.getAccessToken()])
    expect(calls).toBe(1)
    expect(tokens).toEqual(['acc1', 'acc1', 'acc1'])
  })

  it('refresh recusado (401) encerra a sessão e devolve null', async () => {
    const { session, getStored, advance } = setup(logged(), async () => ({ ok: false, status: 401 }))
    advance(1800_000)
    expect(await session.getAccessToken()).toBeNull()
    expect(getStored()).toBeNull()
  })

  it('sem rede: lança e MANTÉM a sessão para a próxima tentativa', async () => {
    const { session, getStored, advance } = setup(logged(), async () => {
      throw new TypeError('Failed to fetch')
    })
    advance(1800_000)
    await expect(session.getAccessToken()).rejects.toThrow()
    expect(getStored()?.refreshToken).toBe('ref0')
  })

  it('erro 503 do servidor também não derruba a sessão', async () => {
    const { session, getStored, advance } = setup(logged(), async () => ({ ok: false, status: 503 }))
    advance(1800_000)
    await expect(session.getAccessToken()).rejects.toThrow()
    expect(getStored()).not.toBeNull()
  })

  it('depois de uma falha a fila destrava e a próxima tentativa renova', async () => {
    let fail = true
    const { session, advance } = setup(logged(), async () => {
      if (fail) throw new TypeError('offline')
      return { ok: true, data: resp(1) }
    })
    advance(1800_000)
    await expect(session.getAccessToken()).rejects.toThrow()
    fail = false
    expect(await session.getAccessToken()).toBe('acc1')
  })

  it('save() guarda o login com a validade calculada', async () => {
    const { session, getStored } = setup(null, async () => ({ ok: false, status: 500 }))
    await session.save(resp(5, 'Gustavo'))
    expect(getStored()).toMatchObject({ accessToken: 'acc5', accessExpiresAt: T0 + 1800_000, name: 'Gustavo' })
  })
})
