// Unidades de progresso: o vocabulário (página/capítulo/volume), as sugestões por formato e a soma sem misturar.

import { describe, expect, it } from 'vitest'
import {
  asFormat, asUnit, defaultUnitFor, positionLabel, stoppedLabel, sumByUnit, unitCount, unitFromCapture, withArticle,
} from './units'

describe('unidades', () => {
  it('valor desconhecido vira o padrão (páginas / físico)', () => {
    expect(asUnit(null)).toBe('pages')
    expect(asUnit('chapters')).toBe('chapters')
    expect(asUnit('xyz')).toBe('pages')
    expect(asFormat(undefined)).toBe('fisico')
    expect(asFormat('audiobook')).toBe('audiobook')
  })
  it('o formato sugere a unidade', () => {
    expect(defaultUnitFor('audiobook')).toBe('chapters')
    expect(defaultUnitFor('quadrinho')).toBe('chapters')
    expect(defaultUnitFor('fisico')).toBe('pages')
  })
  it('singular, plural e abreviação', () => {
    expect(unitCount('chapters', 1)).toBe('1 capítulo')
    expect(unitCount('chapters', 3)).toBe('3 capítulos')
    expect(unitCount('volumes', 2, true)).toBe('2 vol.')
    expect(positionLabel('pages', 80)).toBe('p. 80')
    expect(positionLabel('chapters', 12)).toBe('cap. 12')
    expect(stoppedLabel('volumes')).toBe('no volume')
    expect(withArticle('pages')).toBe('a página')
    expect(withArticle('chapters')).toBe('o capítulo')
  })
  it('unidade da captura rápida', () => {
    expect(unitFromCapture('chapter')).toBe('chapters')
    expect(unitFromCapture('ep')).toBeNull()
  })
  it('soma por unidade sem misturar', () => {
    expect(sumByUnit([{ unit: 'pages', pages: 30 }, { unit: 'pages', pages: 10 }, { unit: 'chapters', pages: 5 }])).toBe('40 pág. · 5 cap.')
    expect(sumByUnit([])).toBe('0 pág.')
  })
})
