// Mesmos casos de tests/agents/test_violet_076.py (markup.py) — as duas pontas precisam concordar.
import { describe, expect, it } from 'vitest'
import { parse, personToken, plainText, refToken, segments, wordCount } from './markup'

describe('markup do diário', () => {
  it('token de pessoa, referência e tag', () => {
    const p = parse('hoje assisti [Matrix](akane:movie:abc-1) com a @[Ana Lima](komi:9f2) #cinema')
    expect(p.people).toEqual([{ type: 'person', name: 'Ana Lima', personId: '9f2' }])
    expect(p.refs).toEqual([{ type: 'ref', label: 'Matrix', agent: 'akane', entityType: 'movie', entityId: 'abc-1' }])
    expect(p.tags).toEqual(['cinema'])
  })
  it('legado e tag com hífen', () => {
    const p = parse('falei com @Ana e @João sobre #vida-adulta e #vida-adulta.')
    expect(p.people.map((x) => x.name)).toEqual(['Ana', 'João'])
    expect(p.tags).toEqual(['vida-adulta'])
  })
  it('e-mail e link comum não viram marcação', () => {
    expect(parse('mande para ana@mail.com e @[Bia](komi:2)').people.map((x) => x.name)).toEqual(['Bia'])
    expect(parse('[site](https://x.com)').refs).toEqual([])
  })
  it('texto puro, contagem e tokens', () => {
    const t = 'vi [Matrix Reloaded](akane:movie:1) com @[Ana Lima](komi:2)'
    expect(plainText(t)).toBe('vi Matrix Reloaded com @Ana Lima')
    expect(wordCount(t)).toBe(6)
    expect(personToken('Ana [trabalho]', '7')).toBe('@[Ana (trabalho)](komi:7)')
    expect(refToken('A [b]', 'kaguya', 'task', 3)).toBe('[A (b)](kaguya:task:3)')
  })
  it('segmentos preservam todo o texto', () => {
    const segs = segments('oi @[Ana](komi:1), vi [X](mai:series:9) #tag-')
    expect(segs.map((s) => s.type)).toEqual(['text', 'person', 'text', 'ref', 'text', 'tag', 'text'])
  })
})
