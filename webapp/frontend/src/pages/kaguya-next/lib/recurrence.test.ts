import { describe, expect, it } from 'vitest'
import { presetLabels, presetOf, ruleFor } from './recurrence'

const QUA = '2026-06-10' // quarta-feira

describe('presets de recorrência', () => {
  it('gera a regra ancorada na data', () => {
    expect(ruleFor('daily', QUA)).toBe('FREQ=DAILY')
    expect(ruleFor('weekdays', QUA)).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')
    expect(ruleFor('weekly', QUA)).toBe('FREQ=WEEKLY;BYDAY=WE')
    expect(ruleFor('monthly', QUA)).toBe('FREQ=MONTHLY;BYMONTHDAY=10')
    expect(ruleFor('yearly', QUA)).toBe('FREQ=YEARLY')
  })

  it('reconhece o preset da regra atual (ida e volta)', () => {
    for (const p of ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const) expect(presetOf(ruleFor(p, QUA), QUA)).toBe(p)
    expect(presetOf(null, QUA)).toBe('none')
    expect(presetOf('RRULE:FREQ=DAILY', QUA)).toBe('daily')
  })

  it('regra fora dos presets é "custom" e não vira outra coisa', () => {
    expect(presetOf('FREQ=DAILY;INTERVAL=3', QUA)).toBe('custom')
    expect(presetOf('FREQ=WEEKLY;BYDAY=MO,WE,FR', QUA)).toBe('custom')
    expect(presetOf('FREQ=WEEKLY;BYDAY=MO', QUA)).toBe('custom') // semanal de OUTRO dia que o do vencimento
  })

  it('sem data, só reconhece os presets que não dependem dela', () => {
    expect(presetOf('FREQ=DAILY', null)).toBe('daily')
    expect(presetOf('FREQ=MONTHLY;BYMONTHDAY=5', null)).toBe('custom')
  })

  it('rótulos seguem a data', () => {
    const l = Object.fromEntries(presetLabels(QUA).map((o) => [o.value, o.label]))
    expect(l.weekly).toBe('Toda quarta')
    expect(l.monthly).toBe('Todo dia 10')
    expect(presetLabels(null).find((o) => o.value === 'weekly')!.label).toBe('Toda semana')
  })
})
