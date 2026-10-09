import { describe, expect, it } from 'vitest'
import { describeActivity } from './activity'
import type { ActivityEvent } from '../types'

const ev = (kind: ActivityEvent['kind'], from: string | null = null, to: string | null = null): ActivityEvent => ({ kind, from_value: from, to_value: to, at: '2026-06-10T12:00:00-03:00' })

describe('describeActivity', () => {
  it('eventos simples', () => {
    expect(describeActivity(ev('created'))).toBe('Criada')
    expect(describeActivity(ev('completed'))).toBe('Concluída')
    expect(describeActivity(ev('deleted'))).toBe('Enviada para a lixeira')
  })

  it('reagendamento mostra de → para; o primeiro vencimento só informa o novo', () => {
    expect(describeActivity(ev('rescheduled', '2026-06-01', '2026-06-05'))).toMatch(/→/)
    expect(describeActivity(ev('rescheduled', null, '2026-06-05'))).toMatch(/definido para/)
    expect(describeActivity(ev('rescheduled', '2026-06-01', null))).toMatch(/sem data/)
  })

  it('adiar e Meu Dia', () => {
    expect(describeActivity(ev('deferred', null, '2026-06-20'))).toMatch(/^Adiada até/)
    expect(describeActivity(ev('deferred'))).toBe('Adiamento removido')
    expect(describeActivity(ev('my_day_in', null, '2026-06-10'))).toMatch(/^Entrou no Meu Dia/)
    expect(describeActivity(ev('my_day_in', '2026-06-09', '2026-06-10'))).toMatch(/→/)
    expect(describeActivity(ev('my_day_out', '2026-06-10'))).toBe('Saiu do Meu Dia')
  })

  it('mover usa o nome da lista quando conhecido', () => {
    expect(describeActivity(ev('moved', '1', '2'), { 1: 'Inbox', 2: 'Trabalho' })).toBe('Movida de Inbox para Trabalho')
    expect(describeActivity(ev('moved', '7', '8'))).toBe('Movida de lista 7 para lista 8')
  })
})
