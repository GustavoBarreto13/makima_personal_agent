// Unidades de progresso: o vocabulário (página/capítulo/volume), as sugestões por formato e a soma sem misturar.

import { describe, expect, it } from 'vitest'
import {
  asFormat, asUnit, basePosition, countFromLast, defaultUnitFor, lastFromCount, positionLabel, progressFraction, rangeCountText,
  rangeFieldLabels, rangeLabel, rangeWithCount, stoppedLabel, sumByUnit, unitCount, unitFromCapture, validateRange, withArticle,
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

describe('faixa do livro (capítulo inicial)', () => {
  it('base, quantidade e fração descontam o capítulo inicial', () => {
    // Vol. 2: capítulos 24 a 36 → base 23, 13 capítulos.
    expect(basePosition(24, 'chapters')).toBe(23)
    expect(countFromLast(36, 24, 'chapters')).toBe(13)
    expect(progressFraction(30, 36, 24, 'chapters')).toBeCloseTo(7 / 13)
    expect(lastFromCount(13, 24, 'chapters')).toBe(36)
  })

  it('livro que começa no 1 e livros em páginas não mudam', () => {
    expect(basePosition(undefined, 'chapters')).toBe(0)
    expect(progressFraction(40, 120, 1, 'chapters')).toBeCloseTo(1 / 3)
    expect(basePosition(24, 'pages')).toBe(0)
    expect(rangeLabel(1, 120, 'chapters')).toBeNull()
    expect(rangeLabel(24, 36, 'chapters')).toBe('cap. 24–36')
  })

  it('quantidade e último andam juntos', () => {
    expect(rangeCountText({ first: '24', last: '36' }, 'chapters')).toBe('13')
    expect(rangeWithCount({ first: '24', last: '' }, '13', 'chapters')).toEqual({ first: '24', last: '36' })
    expect(rangeWithCount({ first: '24', last: '36' }, '', 'chapters').last).toBe('')
  })

  it('valida a faixa', () => {
    expect(validateRange({ first: '0', last: '' }).first).toBeTruthy()
    expect(validateRange({ first: '24', last: '20' }).last).toMatch(/antes do inicial/)
    expect(validateRange({ first: '24', last: '36' })).toEqual({})
    expect(rangeFieldLabels('volumes')).toEqual({ first: 'Volume inicial', last: 'Último volume', count: 'Quantidade de volumes' })
  })
})
