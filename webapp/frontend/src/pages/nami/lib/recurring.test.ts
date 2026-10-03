import { describe, expect, it } from 'vitest'
import { defaultState, runCollection } from '../../../design/core/collection'
import { dueDay, kindOf, makeRecurringSchema, monthlyValue, nextBillingDate, summarize } from './recurring'
import type { RecurringStatusItem } from '../types'

const TODAY = '2026-10-15'
const item = (over: Partial<RecurringStatusItem>): RecurringStatusItem =>
  ({ id: 'x', name: 'x', valor: 100, ciclo: 'mensal', categoria: 'Assinaturas', status: 'ativa', cycle_status: 'pendente', kind: 'assinatura', next_billing: '2026-10-20', ...over }) as RecurringStatusItem

describe('próxima data de cobrança', () => {
  it.each([
    [20, '2026-10-15', '2026-10-20'],     // ainda neste mês
    [15, '2026-10-15', '2026-10-15'],     // hoje conta
    [10, '2026-10-15', '2026-11-10'],     // já passou: mês que vem
    [31, '2026-10-15', '2026-10-31'],
    [31, '2026-11-15', '2026-11-30'],     // novembro só tem 30
    [30, '2026-01-31', '2026-02-28'],     // fevereiro curto
    [5, '2026-12-20', '2027-01-05'],      // virada de ano
  ])('dia %i a partir de %s → %s', (day, today, esperado) => {
    expect(nextBillingDate(day, today)).toBe(esperado)
  })
})

describe('apoios', () => {
  it('dia de cobrança: o cadastrado, senão o do vencimento', () => {
    expect(dueDay({ next_billing_day: 7, next_billing: '2026-10-20' })).toBe(7)
    expect(dueDay({ next_billing: '2026-10-20' })).toBe(20)
    expect(dueDay({})).toBe(1)
  })

  it('registros antigos sem tipo são assinatura; anual vira mensal equivalente', () => {
    expect(kindOf({})).toBe('assinatura')
    expect(monthlyValue({ valor: 1200, ciclo: 'anual' })).toBe(100)
    expect(monthlyValue({ valor: 50, ciclo: 'mensal' })).toBe(50)
  })

  it('resumo: custo não inclui renda; pendentes contam só despesas; renda pendente à parte', () => {
    const r = summarize([
      item({ kind: 'conta_fixa', valor: 300, cycle_status: 'atrasada' }),
      item({ kind: 'assinatura', valor: 1200, ciclo: 'anual', cycle_status: 'paga' }),
      item({ kind: 'renda', valor: 5000, cycle_status: 'pendente' }),
      item({ kind: 'renda', valor: 800, cycle_status: 'paga' }),
    ])
    expect(r).toEqual({ custo: 400, renda: 5800, pendentes: 1, rendaPendente: 5000 })
  })
})

describe('lista de recorrentes', () => {
  const schema = makeRecurringSchema(TODAY)
  const items = [
    item({ id: 'a', name: 'Netflix', kind: 'assinatura', next_billing_day: 5 }),
    item({ id: 'b', name: 'Luz', kind: 'conta_fixa', next_billing_day: 20, cycle_status: 'atrasada' }),
    item({ id: 'c', name: 'Salário', kind: 'renda', valor: 5000, next_billing_day: 5 }),
    item({ id: 'd', name: 'Aluguel', kind: 'conta_fixa', next_billing_day: 3 }),
  ]
  const run = (patch: object = {}) => runCollection(schema, { ...defaultState(schema), ...patch }, items, TODAY)

  it('agrupa em Entradas → Contas fixas → Assinaturas, e dentro de cada uma por dia do mês', () => {
    const r = run()
    expect(r.groups.map((g) => g.key)).toEqual(['Entradas', 'Contas fixas', 'Assinaturas'])
    expect(r.groups[1].items.map((s) => s.name)).toEqual(['Aluguel', 'Luz'])   // dia 3 antes do dia 20
  })

  it('filtra por situação do mês e busca por nome', () => {
    expect(run({ facets: { status: { values: { atrasada: true } } } }).items.map((s) => s.name)).toEqual(['Luz'])
    expect(run({ q: 'net' }).items.map((s) => s.name)).toEqual(['Netflix'])
  })

  it('ordena por valor', () => {
    expect(run({ sortBy: 'valor', dir: 'desc', groupBy: 'none' }).items[0].name).toBe('Salário')
  })
})
