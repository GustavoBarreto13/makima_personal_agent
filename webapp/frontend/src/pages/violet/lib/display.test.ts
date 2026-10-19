import { describe, expect, it } from 'vitest'
import { displayOffsetFromRendered, editDisplay, fromDisplay, renderedText, spliceDisplay, toDisplay } from './markup'

const RAW = 'Nesse dia, eu tinha marcado pra ver o doc [Always Lalisa](akane:movie:836180e0-4a3e) com a @[Carla](komi:2656)'

describe('texto de exibição do campo', () => {
  it('mostra só o nome e volta igual sem edição', () => {
    const d = toDisplay(RAW)
    expect(d.text).toBe('Nesse dia, eu tinha marcado pra ver o doc Always Lalisa com a Carla')
    expect(d.tokens.map((t) => [d.text.slice(t.start, t.end), t.kind])).toEqual([['Always Lalisa', 'ref'], ['Carla', 'person']])
    expect(fromDisplay(d)).toBe(RAW)
  })
  it('legado e tags ficam como estão', () => {
    const raw = 'falei com @Ana sobre #vida-adulta'
    expect(toDisplay(raw)).toEqual({ text: raw, tokens: [] })
  })
  it('digitar fora dos chips preserva os tokens', () => {
    let d = toDisplay(RAW)
    const a = d.text.replace('Nesse dia', 'Naquele dia')
    d = editDisplay(d, a, 'Naquele'.length)
    const b = a + ' e foi ótimo'
    d = editDisplay(d, b, b.length)
    expect(fromDisplay(d)).toBe(RAW.replace('Nesse dia', 'Naquele dia') + ' e foi ótimo')
  })
  it('digitar colado no fim do chip não desfaz o token', () => {
    const d = toDisplay('com a @[Carla](komi:1) hoje')
    const next = 'com a Carlaa hoje'
    expect(fromDisplay(editDisplay(d, next, 12))).toBe('com a @[Carla](komi:1)a hoje')
    expect(fromDisplay(editDisplay(d, 'com a xCarla hoje', 7))).toBe('com a x@[Carla](komi:1) hoje')
  })
  it('editar no meio do chip vira texto comum', () => {
    const d = toDisplay('com a @[Carla](komi:1) hoje')
    expect(fromDisplay(editDisplay(d, 'com a Carola hoje', 9))).toBe('com a Carola hoje')
  })
  it('apagar o chip inteiro remove o token', () => {
    const d = toDisplay('com a @[Carla](komi:1) hoje')
    const t = d.tokens[0]
    expect(fromDisplay(spliceDisplay(d, t.start, t.end, { text: '', tokens: [] }))).toBe('com a  hoje')
  })
  it('sugestão escolhida entra como token', () => {
    const d = toDisplay('vi /akane Alw')
    const ins = toDisplay('[Always Lalisa](akane:movie:9) ')
    const out = spliceDisplay(d, 3, d.text.length, ins)
    expect(out.text).toBe('vi Always Lalisa ')
    expect(fromDisplay(out)).toBe('vi [Always Lalisa](akane:movie:9) ')
  })
  it('toque no texto desenhado cai no lugar certo do campo', () => {
    const raw = 'oi @[Ana](komi:1) e @Bia #tag'
    expect(renderedText(raw)).toBe('oi Ana e Bia #tag')
    expect(toDisplay(raw).text).toBe('oi Ana e @Bia #tag')
    expect(displayOffsetFromRendered(raw, 5)).toBe(5) // dentro de "Ana"
    expect(displayOffsetFromRendered(raw, 10)).toBe(11) // "B" de Bia → depois do "@"
    expect(displayOffsetFromRendered(raw, 17)).toBe(18) // fim
  })
})
