import { describe, expect, it } from 'vitest'
import { isSafeUrl, parseInline, parseRichText } from './richtext'

const flat = (n: unknown): string => JSON.stringify(n)

describe('parseInline', () => {
  it('negrito, itálico e código', () => {
    expect(parseInline('livre **R$ 1.240** e *ok* com `x`')).toEqual([
      { t: 'text', v: 'livre ' }, { t: 'b', c: [{ t: 'text', v: 'R$ 1.240' }] }, { t: 'text', v: ' e ' },
      { t: 'i', c: [{ t: 'text', v: 'ok' }] }, { t: 'text', v: ' com ' }, { t: 'code', v: 'x' },
    ])
  })

  it('aceita as tags simples do Telegram', () => {
    expect(parseInline('<b>oi</b> <i>você</i>')).toEqual([
      { t: 'b', c: [{ t: 'text', v: 'oi' }] }, { t: 'text', v: ' ' }, { t: 'i', c: [{ t: 'text', v: 'você' }] },
    ])
  })

  it('não vira itálico em snake_case nem em conta com asterisco solto', () => {
    expect(parseInline('create_task_now')).toEqual([{ t: 'text', v: 'create_task_now' }])
    expect(parseInline('2 * 3 * 4')).toEqual([{ t: 'text', v: '2 * 3 * 4' }])
  })

  it('marcação que não fecha continua texto', () => {
    expect(parseInline('**sem fim')).toEqual([{ t: 'text', v: '**sem fim' }])
  })

  it('links: só http(s), pontuação final fica fora, rótulo vira filho', () => {
    expect(parseInline('veja https://exemplo.com/a.')).toEqual([
      { t: 'text', v: 'veja ' }, { t: 'a', href: 'https://exemplo.com/a', c: [{ t: 'text', v: 'https://exemplo.com/a' }] }, { t: 'text', v: '.' },
    ])
    expect(parseInline('[site](https://x.com)')).toEqual([{ t: 'a', href: 'https://x.com', c: [{ t: 'text', v: 'site' }] }])
  })

  it('entradas hostis ficam como texto: nada de script nem javascript:', () => {
    const script = parseInline('<script>alert(1)</script>')
    expect(flat(script)).toBe(flat([{ t: 'text', v: '<script>alert(1)</script>' }]))
    const js = parseInline('[clique](javascript:alert(1))')
    expect(js.some((n) => n.t === 'a')).toBe(false)
    expect(parseInline('<img src=x onerror=alert(1)>').every((n) => n.t === 'text')).toBe(true)
    expect(isSafeUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeUrl('data:text/html,x')).toBe(false)
    expect(isSafeUrl('https://ok.com')).toBe(true)
  })
})

describe('parseRichText', () => {
  it('parágrafos, quebra de linha e listas', () => {
    const b = parseRichText('Oi!\nTudo bem?\n\n- um\n- **dois**\n\n1. a\n2) b')
    expect(b.map((x) => x.t)).toEqual(['p', 'ul', 'ol'])
    expect(b[0]).toEqual({ t: 'p', c: [{ t: 'text', v: 'Oi!' }, { t: 'br' }, { t: 'text', v: 'Tudo bem?' }] })
    expect((b[1] as { items: unknown[] }).items).toHaveLength(2)
    expect((b[2] as { items: unknown[] }).items).toHaveLength(2)
  })

  it('texto vazio ou só espaços não gera blocos', () => {
    expect(parseRichText('')).toEqual([])
    expect(parseRichText('  \n \n')).toEqual([])
  })

  it('lista trocando de tipo vira dois blocos', () => {
    expect(parseRichText('- a\n1. b').map((x) => x.t)).toEqual(['ul', 'ol'])
  })
})
