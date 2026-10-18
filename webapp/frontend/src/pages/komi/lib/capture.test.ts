import { describe, expect, it } from 'vitest'
import { canSaveQuickly, contactParser, draftFromCapture, kindFromText } from './capture'
import type { PersonRow } from '../types'

const TODAY = '2026-10-18' // domingo
const person = (id: string, name: string, over: Partial<PersonRow> = {}): PersonRow => ({
  id, name, nickname: null, full_name: null, relationship: null, category: 'amigos', context: 'personal', city: null, avatar_url: null,
  birth_day: null, birth_month: null, birth_year: null, birthday_remind_days: 1, aliases: [], groups: [], link_count: 0, dates: [], finance_net: 0, last_interaction: null, ...over,
})
const PEOPLE = [person('bia', 'Beatriz', { nickname: 'Bia' }), person('caio', 'Caio', { context: 'both' }), person('carla', 'Carla')]
const draft = (text: string, defaultContext = null as 'personal' | 'work' | null) => draftFromCapture(contactParser(text), { today: TODAY, people: PEOPLE, defaultContext })

describe('tipo do contato pelas palavras', () => {
  it('café/almoço = encontro (a palavra fica na nota); liguei/zap/vídeo dão o tipo e saem', () => {
    expect(kindFromText('café')).toEqual({ kind: 'encontro', rest: 'café' })
    expect(kindFromText('liguei sobre a viagem')).toEqual({ kind: 'ligacao', rest: 'sobre a viagem' })
    expect(kindFromText('zap sobre o presente')).toEqual({ kind: 'mensagem', rest: 'sobre o presente' })
    expect(kindFromText('meet rápido')).toEqual({ kind: 'video', rest: 'rápido' })
    expect(kindFromText('falamos de tudo')).toEqual({ kind: 'outro', rest: 'falamos de tudo' })
  })
})

describe('linha rápida de contato', () => {
  it('+Bia café ontem → Beatriz, encontro, ontem', () => {
    const d = draft('+Bia café ontem')
    expect(d).toMatchObject({ personId: 'bia', kind: 'encontro', date: '2026-10-17', note: 'café', typedName: 'Bia' })
  })
  it('sem +, o começo da frase vale como nome', () => {
    expect(draft('Beatriz ligação')).toMatchObject({ personId: 'bia', kind: 'ligacao', note: '' })
  })
  it('#trabalho / #pessoal escolhem o espaço; senão vale o espaço do topo', () => {
    expect(draft('+Caio mensagem #trabalho').context).toBe('work')
    expect(draft('+Caio mensagem #pessoal').context).toBe('personal')
    expect(draft('+Caio mensagem', 'work').context).toBe('work')
    expect(draft('+Caio mensagem').context).toBeNull()
  })
  it('nome ambíguo ou desconhecido fica sem pessoa (o formulário pergunta)', () => {
    const amb = draft('+Ca café')
    expect(amb.personId).toBeNull()
    expect(amb.typedName).toBe('Ca')
    expect(draft('+Zelda café').personId).toBeNull()
  })
  it('só salva direto com pessoa e data que não seja futura', () => {
    expect(canSaveQuickly(draft('+Bia café ontem'), TODAY)).toBe(true)
    expect(canSaveQuickly(draft('+Zelda café'), TODAY)).toBe(false)
    expect(canSaveQuickly({ ...draft('+Bia café'), date: '2026-10-25' }, TODAY)).toBe(false)
  })
})
