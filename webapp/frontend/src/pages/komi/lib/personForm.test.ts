import { describe, expect, it } from 'vitest'
import { aliasChanges, conflictField, draftFromDetail, emptyPerson, toCreate, toPatch, validatePerson } from './personForm'
import type { PersonDetail } from '../types'

const YEAR = 2026

describe('validação', () => {
  it('Nome é obrigatório', () => {
    expect(validatePerson(emptyPerson('  '), YEAR)).toMatchObject({ field: 'name' })
    expect(validatePerson(emptyPerson('Bia'), YEAR)).toBeNull()
  })
  it('aniversário: dia e mês andam juntos; o dia precisa existir; ano é opcional mas não vale sozinho', () => {
    const base = emptyPerson('Bia')
    expect(validatePerson({ ...base, birth_day: 3 }, YEAR)).toMatchObject({ field: 'birthday' })
    expect(validatePerson({ ...base, birth_month: 5 }, YEAR)).toMatchObject({ field: 'birthday' })
    expect(validatePerson({ ...base, birth_day: 31, birth_month: 4 }, YEAR)).toMatchObject({ field: 'birthday' })
    expect(validatePerson({ ...base, birth_day: 29, birth_month: 2 }, YEAR)).toBeNull() // sem ano: nasceu em bissexto
    expect(validatePerson({ ...base, birth_day: 29, birth_month: 2, birth_year: 2001 }, YEAR)).toMatchObject({ field: 'birthday' })
    expect(validatePerson({ ...base, birth_day: 29, birth_month: 2, birth_year: 2000 }, YEAR)).toBeNull()
    expect(validatePerson({ ...base, birth_year: 1990 }, YEAR)).toMatchObject({ field: 'birthday' })
    expect(validatePerson({ ...base, birth_day: 3, birth_month: 5, birth_year: 2999 }, YEAR)).toMatchObject({ field: 'birthday' })
  })
  it('conflito de nome vai para o campo certo', () => {
    expect(conflictField("'Bia' já é o nome ou apelido de Beatriz.", { nickname: 'Bia' })).toBe('nickname')
    expect(conflictField("'Maria' já é o nome ou apelido de Maria Clara.", { nickname: 'Bia' })).toBe('name')
  })
})

const DETAIL: PersonDetail = {
  perfil: {
    id: 'u1', name: 'Beatriz', nickname: 'Bia', full_name: null, relationship: 'prima', category: 'familia', context: 'both', phone: null, email: null,
    instagram: null, telegram: null, city: 'Recife', avatar_url: null, birth_day: 3, birth_month: 5, birth_year: null, birthday_remind_days: null,
    created_at: '2026-01-01', deleted: false,
  },
  aliases: [{ id: 7, alias: 'Betinha' }],
  datas: [],
}

describe('conversão para a API', () => {
  it('rascunho de edição: sem lembrete no servidor (null) é −1 na tela', () => {
    const d = draftFromDetail(DETAIL)
    expect(d.birthday_remind_days).toBe(-1)
    expect(d.aliases).toEqual(['Betinha'])
    expect(d.nickname).toBe('Bia')
  })
  it('PATCH leva só o que mudou', () => {
    const before = draftFromDetail(DETAIL)
    expect(toPatch(before, { ...before })).toEqual({})
    expect(toPatch(before, { ...before, name: ' Beatriz S ', city: 'Olinda' })).toEqual({ name: 'Beatriz S', city: 'Olinda' })
    expect(toPatch(before, { ...before, birth_day: null, birth_month: null })).toEqual({ birth_day: null, birth_month: null, birth_year: null })
    expect(toPatch(before, { ...before, birthday_remind_days: 2 })).toEqual({ birthday_remind_days: 2 })
    const had = { ...before, birthday_remind_days: 1 }
    expect(toPatch(had, { ...had, birthday_remind_days: -1 })).toEqual({ birthday_remind_days: null })
  })
  it('cadastro: campos vazios saem; lembrete só vai com aniversário', () => {
    expect(toCreate({ ...emptyPerson('Bia'), nickname: ' ' })).toEqual({ name: 'Bia', category: 'outros', context: 'personal' })
    const c = toCreate({ ...emptyPerson('Bia'), birth_day: 3, birth_month: 5, birthday_remind_days: -1, city: 'Recife' })
    expect(c).toMatchObject({ birth_day: 3, birth_month: 5, birthday_remind_days: null, city: 'Recife' })
    expect(c).not.toHaveProperty('birth_year')
  })
  it('outras formas: o que entrou e o que saiu', () => {
    expect(aliasChanges(['Betinha', 'Bé'], ['betinha', 'Bia2'])).toEqual({ add: ['Bia2'], remove: ['Bé'] })
  })
})
