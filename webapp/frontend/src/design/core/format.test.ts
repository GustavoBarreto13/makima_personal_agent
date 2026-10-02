import { describe, it, expect } from 'vitest'
import {
  addDaysISO, diffDays, fmtDate, fmtDateLong, fmtDuration, fmtMoney, fmtNumber, fmtPercent, fmtRange, fmtRelative,
  formatShortcut, fromFiveScale, isoDate, parseISODate, pluralize, snapHalf, toFiveScale,
} from './format'

const nb = (s: string) => s.replace(/ /g, ' ')

describe('datas locais (UTC-3), nunca UTC', () => {
  it('parseISODate devolve o dia certo mesmo à meia-noite', () => {
    const d = parseISODate('2026-01-01')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 0, 1])
  })
  it('isoDate e parseISODate são inversos', () => {
    for (const s of ['2026-01-01', '2026-02-28', '2026-12-31', '2024-02-29']) expect(isoDate(parseISODate(s))).toBe(s)
  })
  it('addDaysISO atravessa mês, ano e fevereiro', () => {
    expect(addDaysISO('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysISO('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('diffDays conta dias corridos, inclusive sobre mudança de horário de verão', () => {
    expect(diffDays('2026-10-01', '2026-10-02')).toBe(1)
    expect(diffDays('2018-11-03', '2018-11-05')).toBe(2)
    expect(diffDays('2026-10-02', '2026-09-29')).toBe(-3)
  })
})

describe('fmtRelative', () => {
  const today = '2026-10-02'
  it.each([
    ['2026-10-02', 'hoje'],
    ['2026-10-01', 'ontem'],
    ['2026-09-29', 'há 3 dias'],
    ['2026-10-03', 'amanhã'],
    ['2026-10-06', 'em 4 dias'],
    ['2026-03-12', '12 de mar.'],
  ])('%s → %s', (date, expected) => expect(fmtRelative(date, today)).toBe(expected))
})

describe('números e textos', () => {
  it('fmtMoney em R$', () => expect(nb(fmtMoney(1234.5))).toBe('R$ 1.234,50'))
  it('fmtMoney com máscara de privacidade', () => expect(fmtMoney(1234.5, { mask: true })).toBe('R$ •••••'))
  it('fmtPercent recebe fração e nunca multiplica duas vezes', () => {
    expect(fmtPercent(0.12)).toBe('12%')
    expect(fmtPercent(0.4)).toBe('40%')
    expect(fmtPercent(1)).toBe('100%')
  })
  it('fmtNumber usa vírgula decimal', () => expect(fmtNumber(1234.5, 1)).toBe('1.234,5'))
  it('fmtDuration', () => {
    expect(fmtDuration(45)).toBe('45 min')
    expect(fmtDuration(75)).toBe('1h 15min')
    expect(fmtDuration(120)).toBe('2h')
  })
  it('pluralize', () => {
    expect(pluralize(1, 'livro', 'livros')).toBe('1 livro')
    expect(pluralize(3, 'livro', 'livros')).toBe('3 livros')
    expect(pluralize(0, 'livro', 'livros')).toBe('0 livros')
  })
  it('fmtDate, fmtDateLong e fmtRange', () => {
    expect(fmtDate('2026-10-02')).toBe('2 de out.')
    expect(fmtDateLong('2026-10-02')).toBe('sexta-feira, 2 de outubro')
    expect(fmtRange('2026-10-02', '2026-10-08')).toBe('2 a 8 de out.')
    expect(fmtRange('2026-09-28', '2026-10-04')).toBe('28 de set. a 4 de out.')
  })
})

describe('estrelas: 0 a 5 com meia estrela', () => {
  it('snapHalf arredonda para a meia estrela mais próxima', () => {
    expect(snapHalf(3.7)).toBe(3.5)
    expect(snapHalf(3.8)).toBe(4)
    expect(snapHalf(0.2)).toBe(0)
    expect(snapHalf(0.5)).toBe(0.5)
    expect(snapHalf(4.25)).toBe(4.5)
  })
  it('snapHalf limita ao intervalo e tolera lixo', () => {
    expect(snapHalf(-1)).toBe(0)
    expect(snapHalf(7)).toBe(5)
    expect(snapHalf(NaN)).toBe(0)
    expect(snapHalf(null)).toBe(0)
    expect(snapHalf(undefined)).toBe(0)
  })
  it('converte de e para outras escalas (ex.: MAL 1–10)', () => {
    expect(toFiveScale(7, 10)).toBe(3.5)
    expect(toFiveScale(10, 10)).toBe(5)
    expect(toFiveScale(1, 10)).toBe(0.5)
    expect(fromFiveScale(3.5, 10)).toBe(7)
    expect(fromFiveScale(toFiveScale(9, 10), 10)).toBe(9)
  })
})

describe('atalhos no padrão Windows', () => {
  it('mod vira Ctrl fora do Mac', () => {
    expect(formatShortcut('mod+k')).toBe('Ctrl+K')
    expect(formatShortcut('mod+enter')).toBe('Ctrl+Enter')
    expect(formatShortcut('esc')).toBe('Esc')
    expect(formatShortcut('n')).toBe('N')
  })
  it('só no macOS vira ⌘', () => {
    expect(formatShortcut('mod+k', 'mac')).toBe('⌘K')
    expect(formatShortcut('mod+shift+z', 'mac')).toBe('⌘⇧Z')
  })
})
