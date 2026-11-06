// Testes da verificação de sessão com suporte a "sem conexão" (src/pwa/session.ts).
// Lógica pura: sem rede, sem DOM — a função de consulta e o storage são simulados.

import { describe, expect, it, vi } from 'vitest'
import { memoryStorage } from '../design/core/ports'
import { ApiError } from '../lib/api'
import { checkSession, isAuthRejection, LAST_USER_KEY, readLastUser } from './session'

const USER = { email: 'dono@example.com', name: 'Dono' }

describe('checkSession', () => {
  it('sessão válida: devolve o usuário e guarda como último usuário', async () => {
    const storage = memoryStorage()
    const res = await checkSession(async () => USER, storage)
    expect(res).toEqual({ kind: 'user', user: USER })
    expect(readLastUser(storage)).toEqual(USER)
  })

  it('401 do servidor: anônimo, apaga o último usuário e limpa os dados do aparelho', async () => {
    const storage = memoryStorage()
    storage.set(LAST_USER_KEY, JSON.stringify(USER))
    const aoSair = vi.fn()

    const res = await checkSession(async () => { throw new ApiError('HTTP 401', 401) }, storage, aoSair)

    expect(res).toEqual({ kind: 'anonymous' })
    expect(storage.get(LAST_USER_KEY)).toBeNull()
    expect(aoSair).toHaveBeenCalledOnce()
  })

  it('403 também conta como sessão recusada', async () => {
    const res = await checkSession(async () => { throw new ApiError('HTTP 403', 403) }, memoryStorage())
    expect(res.kind).toBe('anonymous')
  })

  it('sem rede (fetch rejeita): segue com o último usuário conhecido', async () => {
    const storage = memoryStorage()
    storage.set(LAST_USER_KEY, JSON.stringify(USER))
    const aoSair = vi.fn()

    const res = await checkSession(async () => { throw new TypeError('Failed to fetch') }, storage, aoSair)

    expect(res).toEqual({ kind: 'offline', user: USER, reason: 'network' })
    expect(aoSair).not.toHaveBeenCalled() // offline NÃO apaga nada
  })

  it('sem rede e sem login anterior: offline sem usuário (tela "sem conexão")', async () => {
    const res = await checkSession(async () => { throw new TypeError('Failed to fetch') }, memoryStorage())
    expect(res).toEqual({ kind: 'offline', user: null, reason: 'network' })
  })

  it('servidor fora do ar (502) é tratado como offline, não como "deslogado"', async () => {
    const storage = memoryStorage()
    storage.set(LAST_USER_KEY, JSON.stringify(USER))
    const res = await checkSession(async () => { throw new ApiError('HTTP 502', 502) }, storage)
    expect(res.kind).toBe('offline')
    expect(res.kind === 'offline' && res.reason).toBe('server') // 5xx: mensagem de "servidor com problema"
    expect(storage.get(LAST_USER_KEY)).not.toBeNull()
  })
})

describe('readLastUser', () => {
  it('ignora JSON corrompido ou sem e-mail', () => {
    const storage = memoryStorage()
    storage.set(LAST_USER_KEY, '{nao-e-json')
    expect(readLastUser(storage)).toBeNull()
    storage.set(LAST_USER_KEY, JSON.stringify({ name: 'sem email' }))
    expect(readLastUser(storage)).toBeNull()
  })
})

describe('isAuthRejection', () => {
  it('só 401/403 de ApiError contam', () => {
    expect(isAuthRejection(new ApiError('x', 401))).toBe(true)
    expect(isAuthRejection(new ApiError('x', 500))).toBe(false)
    expect(isAuthRejection(new TypeError('x'))).toBe(false)
    expect(isAuthRejection(new Error('HTTP 401'))).toBe(false)
  })
})
