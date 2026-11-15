import { describe, expect, it } from 'vitest'
import { parseSse } from './sse'

describe('parseSse', () => {
  it('lê eventos completos e guarda o resto incompleto', () => {
    const a = parseSse('', 'event: delta\ndata: {"text":"Oi"}\n\nevent: delta\ndata: {"te')
    expect(a.events).toEqual([{ event: 'delta', data: { text: 'Oi' } }])
    const b = parseSse(a.rest, 'xt":" mundo"}\n\nevent: done\ndata: {"id":3}\n\n')
    expect(b.events).toEqual([{ event: 'delta', data: { text: ' mundo' } }, { event: 'done', data: { id: 3 } }])
    expect(b.rest).toBe('')
  })

  it('aceita CRLF e ignora bloco corrompido ou sem data', () => {
    const r = parseSse('', 'event: x\r\ndata: nao-json\r\n\r\n: comentario\n\nevent: ok\ndata: {"a":1}\n\n')
    expect(r.events).toEqual([{ event: 'ok', data: { a: 1 } }])
  })
})
