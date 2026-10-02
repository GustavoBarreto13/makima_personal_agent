import { describe, it, expect } from 'vitest'
import { buildHeatmapMonths, computeDelta, computeStreaks, cutoffFor, heatLevel, mondayOf, ratingDistribution, topN } from './stats'

describe('sequências em dias corridos', () => {
  it('a atual vale até ontem; hoje sem registro não quebra', () => {
    const r = computeStreaks(['2026-10-01', '2026-09-30', '2026-09-29', '2026-09-20'], '2026-10-02')
    expect(r).toEqual({ best: 3, current: 3 })
  })
  it('hoje com registro entra na conta', () => {
    expect(computeStreaks(['2026-10-02', '2026-10-01'], '2026-10-02').current).toBe(2)
  })
  it('um dia de intervalo quebra a sequência atual', () => {
    expect(computeStreaks(['2026-09-30'], '2026-10-02').current).toBe(0)
  })
  it('a maior sequência não é "dias com registro no ano" (bug antigo da Frieren)', () => {
    const dates = ['2026-01-01', '2026-01-05', '2026-01-09', '2026-01-10']
    expect(computeStreaks(dates, '2026-10-02').best).toBe(2)
  })
  it('ignora duplicatas e aceita lista vazia', () => {
    expect(computeStreaks(['2026-10-01', '2026-10-01'], '2026-10-02')).toEqual({ best: 1, current: 1 })
    expect(computeStreaks([], '2026-10-02')).toEqual({ best: 0, current: 0 })
  })
  it('atravessa virada de mês e de ano', () => {
    expect(computeStreaks(['2025-12-30', '2025-12-31', '2026-01-01'], '2026-01-02').best).toBe(3)
  })
})

describe('delta contra o período anterior', () => {
  it('percentual', () => {
    expect(computeDelta(110, 100)).toEqual({ value: 10, direction: 'up', kind: 'percent' })
    expect(computeDelta(80, 100).direction).toBe('down')
    expect(computeDelta(100.5, 100).direction).toBe('flat')
  })
  it('sem base não inventa número', () => {
    expect(computeDelta(100, 0).value).toBeNull()
    expect(computeDelta(100, null).value).toBeNull()
    expect(computeDelta(100, undefined).value).toBeNull()
  })
  it('absoluto (nota média)', () => {
    const d = computeDelta(4.2, 4.0, true)
    expect(d.kind).toBe('absolute')
    expect(d.direction).toBe('up')
    expect(computeDelta(4.0, 4.02, true).direction).toBe('flat')
    expect(computeDelta(3, 0, true).value).toBe(3)
  })
})

describe('mapa de calor por mês (modelo da Frieren)', () => {
  const months = buildHeatmapMonths(2026, [{ date: '2026-10-01', value: 45 }, { date: '2026-10-01', value: 30 }, { date: '2026-01-02', value: 10 }], '2026-10-02')

  it('sempre 12 meses, cada um com semanas completas de 7 linhas', () => {
    expect(months).toHaveLength(12)
    for (const m of months) expect(m.cells.length % 7).toBe(0)
  })
  it('alinha o dia 1 ao dia da semana (domingo = 0)', () => {
    // 1º de jan de 2026 é quinta-feira → 4 células de alinhamento antes.
    expect(months[0].cells.slice(0, 4).every((c) => c === null)).toBe(true)
    expect(months[0].cells[4]?.date).toBe('2026-01-01')
    // 1º de fev de 2026 é domingo → sem alinhamento.
    expect(months[1].cells[0]?.date).toBe('2026-02-01')
  })
  it('conta os dias reais de cada mês, inclusive bissexto', () => {
    const real = (y: number, m: number) => buildHeatmapMonths(y, [], '2026-01-01')[m].cells.filter(Boolean).length
    expect(real(2026, 1)).toBe(28)
    expect(real(2024, 1)).toBe(29)
    expect(real(2026, 9)).toBe(31)
  })
  it('densifica: soma o mesmo dia, marca níveis e futuro', () => {
    const oct1 = months[9].cells.find((c) => c?.date === '2026-10-01')!
    expect(oct1.value).toBe(75)
    expect(oct1.level).toBe(3)
    expect(oct1.future).toBe(false)
    expect(months[9].cells.find((c) => c?.date === '2026-10-03')!.future).toBe(true)
    expect(months[9].cells.find((c) => c?.date === '2026-10-05')!.level).toBe(0)
  })
  it('nomes de mês em pt-BR', () => {
    expect(months.map((m) => m.name).slice(0, 3)).toEqual(['jan', 'fev', 'mar'])
  })
  it('níveis', () => {
    expect(heatLevel(0, [1, 30, 60, 90])).toBe(0)
    expect(heatLevel(10, [1, 30, 60, 90])).toBe(1)
    expect(heatLevel(45, [1, 30, 60, 90])).toBe(2)
    expect(heatLevel(75, [1, 30, 60, 90])).toBe(3)
    expect(heatLevel(200, [1, 30, 60, 90])).toBe(4)
  })
})

describe('distribuição de notas', () => {
  it('cobre 0.5 a 5 sem perder valores (bug antigo: notas < 3 sumiam)', () => {
    const d = ratingDistribution([5, 4.5, 4.5, 2.7, 1, 0.5, 0.2, 0, 3.8])
    expect(d.map((x) => x.value)).toEqual([5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5])
    const by = Object.fromEntries(d.map((x) => [x.value, x.count]))
    expect(by[4.5]).toBe(2)
    expect(by[2.5]).toBe(1)
    expect(by[1]).toBe(1)
    expect(by[0.5]).toBe(2)
    expect(by[4]).toBe(1)
    // 9 valores; só o 0 ("sem nota") fica de fora. 0.2 sobe para 0.5.
    expect(d.reduce((s, x) => s + x.count, 0)).toBe(8)
  })
})

describe('rankings e períodos', () => {
  it('topN conta distintos e desempata por nome', () => {
    const items = [{ g: ['a', 'b'] }, { g: ['a'] }, { g: ['c'] }, { g: ['b'] }]
    expect(topN(items, (i) => i.g, 2)).toEqual([{ label: 'a', count: 2 }, { label: 'b', count: 2 }])
  })
  it('cutoffFor: ano corrente corta em hoje; anos passados vão até 31/12', () => {
    expect(cutoffFor(2026, '2026-10-02')).toBe('10-02')
    expect(cutoffFor(2025, '2026-10-02')).toBe('12-31')
  })
  it('mondayOf devolve a segunda da semana', () => {
    expect(mondayOf('2026-10-02')).toBe('2026-09-28')
    expect(mondayOf('2026-09-28')).toBe('2026-09-28')
    expect(mondayOf('2026-10-04')).toBe('2026-09-28')
  })
})
