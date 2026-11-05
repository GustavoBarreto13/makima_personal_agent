// Testes de lib/api.ts: base da API, token bearer e erros com status.
// O `fetch` global é simulado — nenhuma rede é usada.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, apiUrl, authFetch, setApiBase, setAuthTokenProvider } from './api'

let fetchMock: ReturnType<typeof vi.fn>

function resposta(status: number, corpo: unknown = {}): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  fetchMock = vi.fn(async () => resposta(200, { ok: true }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  setApiBase('')
  setAuthTokenProvider(null)
  vi.unstubAllGlobals()
})

describe('apiUrl', () => {
  it('sem base (site): devolve o caminho como está', () => {
    expect(apiUrl('/api/hub/summary')).toBe('/api/hub/summary')
  })

  it('com base (app): prefixa e ignora barra final', () => {
    setApiBase('https://makima.exemplo.com/')
    expect(apiUrl('/api/hub/summary')).toBe('https://makima.exemplo.com/api/hub/summary')
  })

  it('URL absoluta passa intacta', () => {
    setApiBase('https://makima.exemplo.com')
    expect(apiUrl('https://outro.com/x')).toBe('https://outro.com/x')
  })
})

describe('authFetch', () => {
  it('sem token: não manda Authorization e envia o cookie', async () => {
    await authFetch('/api/x')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/x')
    expect(init.credentials).toBe('include')
    expect(new Headers(init.headers).has('Authorization')).toBe(false)
  })

  it('com token (síncrono ou assíncrono): manda Authorization: Bearer', async () => {
    setAuthTokenProvider(async () => 'abc123')
    await authFetch('/api/x', { headers: { 'Content-Type': 'application/json' } })
    const headers = new Headers(fetchMock.mock.calls[0][1].headers)
    expect(headers.get('Authorization')).toBe('Bearer abc123')
    expect(headers.get('Content-Type')).toBe('application/json') // cabeçalhos do chamador são mantidos
  })

  it('provedor devolvendo null (deslogado): cai no cookie', async () => {
    setAuthTokenProvider(() => null)
    await authFetch('/api/x')
    expect(new Headers(fetchMock.mock.calls[0][1].headers).has('Authorization')).toBe(false)
  })
})

describe('api.*', () => {
  it('usa a base e o token em GET/POST/PATCH/PUT/DELETE', async () => {
    setApiBase('https://makima.exemplo.com')
    setAuthTokenProvider(() => 'tok')

    await api.get('/api/a')
    await api.post('/api/b', { x: 1 })
    await api.patch('/api/c', { x: 1 })
    await api.put('/api/d', { x: 1 })
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await api.del('/api/e')

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://makima.exemplo.com/api/a',
      'https://makima.exemplo.com/api/b',
      'https://makima.exemplo.com/api/c',
      'https://makima.exemplo.com/api/d',
      'https://makima.exemplo.com/api/e',
    ])
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok')
    }
    expect(fetchMock.mock.calls[1][1].body).toBe('{"x":1}')
  })

  it('erro HTTP vira ApiError com status e a mensagem `detail` do servidor', async () => {
    fetchMock.mockResolvedValueOnce(resposta(400, { detail: 'Data inválida' }))
    const err = await api.get('/api/x').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 400, message: 'Data inválida' })
  })

  it('erro sem corpo JSON usa "HTTP <status>"', async () => {
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 502 }))
    const err = await api.get('/api/x').catch((e) => e)
    expect(err).toMatchObject({ status: 502, message: 'HTTP 502' })
  })
})
