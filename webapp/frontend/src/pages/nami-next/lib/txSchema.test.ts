import { describe, expect, it } from 'vitest'
import { runCollection, defaultState } from '../../../design/core/collection'
import { dayLabel, makeTxSchema, windowFor } from './txSchema'
import type { Category, Transaction } from '../types'

const TODAY = '2026-10-02'
const categories = [
  { id: 'Supermercado', name: 'Supermercado', icon: '', color: '', kind: 'out' },
  { id: 'Lazer', name: 'Lazer', icon: '', color: '', kind: 'out' },
] as Category[]
const tx = (id: string, data: string, valor: number, over: Partial<Transaction> = {}): Transaction =>
  ({ id, name: `t${id}`, valor, tipo: 'Despesa', categoria: 'Lazer', conta: 'Nubank', data, ...over }) as Transaction

describe('janela de datas enviada ao servidor', () => {
  it.each([
    ['last7', '2026-09-25'],
    ['last30', '2026-09-02'],
    ['last90', '2026-07-04'],
    ['thisYear', '2026-01-01'],
    ['all', '2000-01-01'],
  ] as const)('%s começa em %s e vai até hoje', (bucket, start) => {
    expect(windowFor(bucket, TODAY)).toEqual({ start, end: TODAY })
  })
})

describe('rótulo do dia', () => {
  it('hoje e ontem por extenso, o resto com a data', () => {
    expect(dayLabel(TODAY, TODAY)).toBe('Hoje')
    expect(dayLabel('2026-10-01', TODAY)).toBe('Ontem')
    expect(dayLabel('2026-09-20', TODAY)).toMatch(/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ].*20 de setembro/)   // começa em maiúscula
  })
})

describe('coleção de lançamentos', () => {
  const schema = makeTxSchema(categories, [{ kind: 'card', id: 'c1', name: 'Nubank' }], TODAY)
  const items = [
    tx('1', '2026-10-02', 50),
    tx('2', '2026-10-02', 300, { categoria: 'Supermercado', name: 'Mercado do bairro' }),
    tx('3', '2026-10-01', 3500, { tipo: 'Receita', conta: 'Itaú', name: 'Salário' }),
    tx('4', '2026-09-28', -100, { tipo: 'Transferencia', conta: 'Itaú', name: 'Transferência para Nubank' }),
  ]
  const run = (patch: object = {}) => runCollection(schema, { ...defaultState(schema), ...patch }, items, TODAY)

  it('padrão: mais recentes primeiro, agrupados por dia', () => {
    const r = run()
    expect(r.groups.map((g) => g.key)).toEqual(['Hoje', 'Ontem', expect.stringMatching(/28 de setembro/i)])
    expect(r.groups[0].items.map((t) => t.id).sort()).toEqual(['1', '2'])
  })

  it('busca por nome e por nome da categoria (não só pelo id)', () => {
    expect(run({ q: 'mercado' }).items.map((t) => t.id)).toEqual(['2'])
    expect(run({ q: 'supermercado' }).items.map((t) => t.id)).toEqual(['2'])
  })

  it('filtra por tipo', () => {
    const r = run({ facets: { tipo: { values: { Receita: true } }, date: { bucket: 'all' } } })
    expect(r.items.map((t) => t.id)).toEqual(['3'])
  })

  it('ordena por valor absoluto (transferência negativa pesa pelo módulo)', () => {
    const r = run({ sortBy: 'valor', dir: 'desc', groupBy: 'none' })
    expect(r.items.map((t) => t.id)).toEqual(['3', '2', '4', '1'])
  })

  it('o período padrão é 30 dias: lançamento mais antigo fica de fora até ampliar', () => {
    const old = [...items, tx('5', '2026-06-01', 10)]
    const r = runCollection(schema, defaultState(schema), old, TODAY)
    expect(r.items.map((t) => t.id)).not.toContain('5')
    const all = runCollection(schema, { ...defaultState(schema), facets: { date: { bucket: 'all' } } }, old, TODAY)
    expect(all.items.map((t) => t.id)).toContain('5')
  })
})
