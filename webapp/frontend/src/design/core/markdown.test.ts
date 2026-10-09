import { describe, expect, it } from 'vitest'
import {
  checklistItems, checklistStats, continueList, indentLines, linkSelection, pasteUrlOverSelection, toggleChecklistItem, toggleLinePrefix, wrapSelection,
} from './markdown'

const DOC = ['- [ ] a', '- [x] b', '```', '- [ ] dentro do código', '```', '* [ ] c'].join('\n')

describe('checklists', () => {
  it('contam só fora de blocos de código', () => {
    expect(checklistStats(DOC)).toEqual({ done: 1, total: 3 })
    expect(checklistStats('sem lista')).toEqual({ done: 0, total: 0 })
  })

  it('alterna a n-ésima, ignorando o que está em código', () => {
    expect(toggleChecklistItem(DOC, 0).split('\n')[0]).toBe('- [x] a')
    expect(toggleChecklistItem(DOC, 1).split('\n')[1]).toBe('- [ ] b')
    const third = toggleChecklistItem(DOC, 2).split('\n')
    expect(third[5]).toBe('* [x] c')
    expect(third[3]).toBe('- [ ] dentro do código') // o item de dentro do código nunca é o "terceiro"
    expect(toggleChecklistItem(DOC, 9)).toBe(DOC)
  })

  it('lista os itens na ordem', () => {
    expect(checklistItems(DOC)).toEqual([
      { index: 0, text: 'a', done: false }, { index: 1, text: 'b', done: true }, { index: 2, text: 'c', done: false },
    ])
  })
})

describe('continueList', () => {
  it('marcador, numerada (+1) e checklist (desmarcada)', () => {
    expect(continueList('- um', 4)).toEqual({ text: '- um\n- ', start: 7, end: 7 })
    expect(continueList('2. dois', 7)!.text).toBe('2. dois\n3. ')
    expect(continueList('- [x] feito', 11)!.text).toBe('- [x] feito\n- [ ] ')
  })
  it('mantém a indentação', () => {
    expect(continueList('  - filho', 9)!.text).toBe('  - filho\n  - ')
  })
  it('item vazio sai da lista; fora de lista ou no meio da linha não mexe', () => {
    expect(continueList('- um\n- ', 7)).toEqual({ text: '- um\n', start: 5, end: 5 })
    expect(continueList('texto', 5)).toBeNull()
    expect(continueList('- um', 2)).toBeNull()
  })
})

describe('indentLines', () => {
  it('recua e avança itens de lista', () => {
    expect(indentLines('- a\n- b', 0, 7, false)!.text).toBe('  - a\n  - b')
    expect(indentLines('  - a', 2, 2, true)!.text).toBe('- a')
    expect(indentLines('texto', 0, 0, false)).toBeNull()
  })
})

describe('formatação por seleção', () => {
  it('envolve, e desfaz quando já envolvido', () => {
    const e = wrapSelection('olá mundo', 4, 9, '**')
    expect(e.text).toBe('olá **mundo**')
    expect(e.text.slice(e.start, e.end)).toBe('mundo')
    expect(wrapSelection(e.text, e.start, e.end, '**').text).toBe('olá mundo') // seleção por dentro dos marcadores
    expect(wrapSelection('', 0, 0, '*').text).toBe('*texto*')
  })

  it('prefixos de linha alternam e trocam o tipo', () => {
    expect(toggleLinePrefix('a\nb', 0, 3, '- ').text).toBe('- a\n- b')
    expect(toggleLinePrefix('- a\n- b', 0, 7, '- ').text).toBe('a\nb')
    expect(toggleLinePrefix('# a', 0, 3, '> ').text).toBe('> a') // troca título por citação
    expect(toggleLinePrefix('a\nb', 0, 3, '1. ').text).toBe('1. a\n2. b')
    expect(toggleLinePrefix('a', 0, 1, '- [ ] ').text).toBe('- [ ] a')
  })

  it('link e colar URL sobre seleção', () => {
    expect(linkSelection('veja aqui', 5, 9, 'https://x.com').text).toBe('veja [aqui](https://x.com)')
    expect(pasteUrlOverSelection('veja aqui', 5, 9, 'https://x.com')!.text).toBe('veja [aqui](https://x.com)')
    expect(pasteUrlOverSelection('veja aqui', 5, 5, 'https://x.com')).toBeNull() // sem seleção
    expect(pasteUrlOverSelection('veja aqui', 5, 9, 'não é url')).toBeNull()
  })
})
