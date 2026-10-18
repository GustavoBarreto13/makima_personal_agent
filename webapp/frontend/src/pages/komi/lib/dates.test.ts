import { describe, expect, it } from 'vitest'
import { daysSince, inLabel, nextOccurrence, remindOrNull, remindText, sinceLabel, turningAge, upcomingDates } from './dates'
import type { PersonRow } from '../types'

const person = (over: Partial<PersonRow>): PersonRow => ({
  id: 'p', name: 'Bia', nickname: null, full_name: null, relationship: null, category: 'amigos', context: 'personal', city: null, avatar_url: null,
  birth_day: null, birth_month: null, birth_year: null, birthday_remind_days: 1, aliases: [], groups: [], link_count: 0, dates: [], finance_net: 0, last_interaction: null, ...over,
})

describe('próxima ocorrência', () => {
  it('este ano se ainda não passou, senão o próximo', () => {
    expect(nextOccurrence(5, 3, '2026-10-18')).toBe('2027-05-03')
    expect(nextOccurrence(12, 25, '2026-10-18')).toBe('2026-12-25')
  })
  it('hoje conta como hoje', () => {
    expect(nextOccurrence(10, 18, '2026-10-18')).toBe('2026-10-18')
  })
  it('29/02 cai em 28/02 nos anos comuns e fica 29/02 nos bissextos', () => {
    expect(nextOccurrence(2, 29, '2026-10-18')).toBe('2027-02-28')
    expect(nextOccurrence(2, 29, '2027-10-18')).toBe('2028-02-29')
  })
  it('dia impossível que escapou da validação cai no último dia do mês', () => {
    expect(nextOccurrence(2, 31, '2026-10-18')).toBe('2027-02-28')
    expect(nextOccurrence(4, 31, '2026-10-18')).toBe('2027-04-30')
  })
})

describe('idade e rótulos', () => {
  it('idade só com ano de nascimento', () => {
    expect(turningAge(1990, '2027-05-03')).toBe(37)
    expect(turningAge(null, '2027-05-03')).toBeNull()
  })
  it('lembrete: 0 é no dia; −1 e null são sem lembrete', () => {
    expect(remindOrNull(0)).toBe(0)
    expect(remindOrNull(-1)).toBeNull()
    expect(remindOrNull(null)).toBeNull()
    expect(remindText(null)).toBe('sem lembrete')
    expect(remindText(0)).toBe('lembra no dia')
    expect(remindText(1)).toBe('lembra 1 dia antes')
    expect(remindText(3)).toBe('lembra 3 dias antes')
  })
  it('há quanto tempo', () => {
    expect(daysSince('2026-10-10', '2026-10-18')).toBe(8)
    expect(daysSince(null, '2026-10-18')).toBeNull()
    expect(sinceLabel(null)).toBe('sem contato registrado')
    expect(sinceLabel(0)).toBe('hoje')
    expect(sinceLabel(1)).toBe('ontem')
    expect(sinceLabel(12)).toBe('há 12 dias')
    expect(sinceLabel(65)).toBe('há 2 meses')
    expect(sinceLabel(400)).toBe('há 1 ano')
    expect(inLabel(0)).toBe('hoje')
    expect(inLabel(1)).toBe('amanhã')
    expect(inLabel(5)).toBe('em 5 dias')
  })
})

describe('datas de todas as pessoas', () => {
  const today = '2026-10-18'
  const people = [
    person({ id: 'a', name: 'Ana', birth_day: 20, birth_month: 10, birth_year: 1990 }),
    person({ id: 'b', name: 'Beto', birth_day: 1, birth_month: 1, birthday_remind_days: null, dates: [{ label: 'Casamento', date: '2018-10-25', recurring: true, remind_days_before: 2 }] }),
    person({ id: 'c', name: 'Caio', dates: [{ label: 'Prova', date: '2026-10-01', recurring: false, remind_days_before: null }, { label: 'Viagem', date: '2026-11-02', recurring: false, remind_days_before: 0 }] }),
    person({ id: 'd', name: 'Duda' }),
  ]
  const list = upcomingDates(people, today)

  it('ordena pela mais próxima e traz idade e lembrete', () => {
    expect(list.map((d) => `${d.personName}:${d.label}:${d.inDays}`)).toEqual(['Ana:Aniversário:2', 'Beto:Casamento:7', 'Caio:Viagem:15', 'Beto:Aniversário:75'])
    expect(list[0].years).toBe(36)
    expect(list[0].remind).toBe(1)
    expect(list[1].years).toBe(8) // casou em 2018; a próxima é 25/10/2026
  })

  it('data única que já passou some; sem lembrete vira null; viagem sem repetir não tem "anos"', () => {
    expect(list.find((d) => d.label === 'Prova')).toBeUndefined()
    expect(list.find((d) => d.personName === 'Beto' && d.isBirthday)?.remind).toBeNull()
    expect(list.find((d) => d.label === 'Viagem')?.years).toBeNull()
  })

  it('o horizonte corta o que está longe', () => {
    expect(upcomingDates(people, today, 30).map((d) => d.label)).toEqual(['Aniversário', 'Casamento', 'Viagem'])
  })
})
