import { describe, expect, it } from 'vitest'
import { inSpace, nameDetail, namesOf, norm, reconnectCandidates, resolvePerson, whenBucket } from './people'
import type { PersonRow } from '../types'

const person = (over: Partial<PersonRow>): PersonRow => ({
  id: 'p', name: 'Beatriz', nickname: null, full_name: null, relationship: null, category: 'amigos', context: 'personal', city: null, avatar_url: null,
  birth_day: null, birth_month: null, birth_year: null, birthday_remind_days: 1, aliases: [], groups: [], link_count: 0, dates: [], finance_net: 0, last_interaction: null, ...over,
})

describe('nomes', () => {
  it('norm ignora caixa, acento e espaços sobrando', () => {
    expect(norm('  João   da Silva ')).toBe('joao da silva')
  })
  it('segunda linha: Apelido · Nome completo, sem repetir o Nome', () => {
    expect(nameDetail(person({ nickname: 'Bia', full_name: 'Beatriz Silva' }))).toBe('Bia · Beatriz Silva')
    expect(nameDetail(person({ nickname: 'beatriz', full_name: null }))).toBe('')
    expect(nameDetail(person({ nickname: null, full_name: 'Beatriz Silva' }))).toBe('Beatriz Silva')
  })
  it('todos os nomes pelos quais se acha a pessoa', () => {
    expect(namesOf(person({ nickname: 'Bia', full_name: 'Beatriz S', aliases: ['Betinha'] }))).toEqual(['Beatriz', 'Bia', 'Beatriz S', 'Betinha'])
  })
})

describe('espaço', () => {
  it('"ambos" vale nos dois lados; "tudo" não filtra', () => {
    expect(inSpace(person({ context: 'work' }), 'personal')).toBe(false)
    expect(inSpace(person({ context: 'work' }), 'work')).toBe(true)
    expect(inSpace(person({ context: 'both' }), 'personal')).toBe(true)
    expect(inSpace(person({ context: 'both' }), 'work')).toBe(true)
    expect(inSpace(person({ context: 'personal' }), 'all')).toBe(true)
  })
})

describe('resolver quem foi digitado', () => {
  const bia = person({ id: 'bia', name: 'Beatriz', nickname: 'Bia' })
  const caio = person({ id: 'caio', name: 'Caio Mendes', aliases: ['Caiozinho'] })
  const carla = person({ id: 'carla', name: 'Carla' })
  const all = [bia, caio, carla]
  it('por Nome ou Apelido, sem acento nem caixa', () => {
    expect(resolvePerson(all, 'bia')?.id).toBe('bia')
    expect(resolvePerson(all, 'BEATRIZ')?.id).toBe('bia')
    expect(resolvePerson(all, 'caiozinho')?.id).toBe('caio')
  })
  it('começo de uma palavra serve se for único; ambíguo devolve null', () => {
    expect(resolvePerson(all, 'mend')?.id).toBe('caio')
    expect(resolvePerson(all, 'ca')).toBeNull()
    expect(resolvePerson(all, 'zzz')).toBeNull()
    expect(resolvePerson(all, '')).toBeNull()
  })
})

describe('reconexão', () => {
  const today = '2026-10-18'
  const list = [
    person({ id: 'a', name: 'Ana', last_interaction: { date: '2026-10-10', kind: 'interação', text: '' } }),
    person({ id: 'b', name: 'Beto', last_interaction: { date: '2026-08-01', kind: 'interação', text: '' } }),
    person({ id: 'c', name: 'Caio', last_interaction: { date: '2026-05-01', kind: 'interação', text: '' } }),
    person({ id: 'd', name: 'Duda' }),
  ]
  it('do mais esquecido ao menos; quem nunca teve contato só entra se pedido', () => {
    expect(reconnectCandidates(list, today, 30).map((x) => x.person.id)).toEqual(['c', 'b'])
    expect(reconnectCandidates(list, today, 30, true).map((x) => x.person.id)).toEqual(['d', 'c', 'b'])
    expect(reconnectCandidates(list, today, 90).map((x) => x.person.id)).toEqual(['c'])
  })
})

describe('janelas das datas futuras', () => {
  it('hoje, semana, mês, 3 meses, depois', () => {
    expect([0, 3, 7, 8, 30, 31, 90, 91].map(whenBucket)).toEqual(['today', 'week', 'week', 'month', 'month', 'quarter', 'quarter', 'later'])
  })
})
