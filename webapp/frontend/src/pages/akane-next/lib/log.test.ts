import { describe, expect, it } from 'vitest'
import { todayISO } from '../../../design/core/format'
import type { TmdbResult, WatchLocation } from '../types'
import { canSaveQuickly, draftFromCapture, emptyDraft, logParser, norm, pickConfident, resolvePlace, validateDraft } from './log'

const TODAY = todayISO()
const film = (over: Partial<TmdbResult> = {}): TmdbResult => ({
  tmdb_id: 1, title: 'Perfect Blue', year: 1997, poster_url: null, director: ['Satoshi Kon'], local_id: null, in_catalog: false, ...over,
})
const LOCATIONS: WatchLocation[] = [
  { id: 'l1', name: 'Cinemark', kind: 'cinema' },
  { id: 'l2', name: 'Cinesystem', kind: 'cinema' },
  { id: 'l3', name: 'Netflix', kind: 'streaming' },
]

describe('linha rápida de logar', () => {
  it('entende título, nota, local, pessoa e etiqueta', () => {
    const f = logParser('Perfect Blue ★4.5 @Cinemark +Ana #coreano').fields
    expect(f).toMatchObject({ title: 'Perfect Blue', rating: 4.5, place: 'Cinemark', people: ['Ana'], tags: ['coreano'] })
  })

  it('"ontem" é uma data passada; sem data não inventa nenhuma', () => {
    expect(logParser('Duna ontem').fields.dueDate).toBeTruthy()
    expect(logParser('Duna ontem').fields.dueDate).not.toBe(TODAY)
    expect(logParser('Duna').fields.dueDate).toBeNull()
  })

  it('nota em meia estrela e "4/5" também valem', () => {
    expect(logParser('Her *3.5').fields.rating).toBe(3.5)
    expect(logParser('Her 4/5').fields.rating).toBe(4)
  })
})

describe('norm e pickConfident', () => {
  it('ignora acento, caixa e pontuação', () => {
    expect(norm('Amélie!')).toBe('amelie')
    expect(norm('  Perfect   Blue ')).toBe('perfect blue')
  })

  it('só é confiante com UM resultado de título igual ao digitado', () => {
    expect(pickConfident('perfect blue', [film(), film({ tmdb_id: 2, title: 'Perfect Blue: Making Of' })])?.tmdb_id).toBe(1)
    expect(pickConfident('Perfect Blue', [film(), film({ tmdb_id: 2, year: 2020 })])).toBeNull()   // dois com o mesmo título: pergunta
    expect(pickConfident('Duna', [film()])).toBeNull()
    expect(pickConfident('', [film()])).toBeNull()
  })
})

describe('resolvePlace', () => {
  it('nome igual (sem acento/caixa) acha o local', () => {
    expect(resolvePlace('cinemark', LOCATIONS)?.id).toBe('l1')
  })
  it('começo do nome serve se só um bate; vários = não chuta', () => {
    expect(resolvePlace('net', LOCATIONS)?.id).toBe('l3')
    expect(resolvePlace('cine', LOCATIONS)).toBeNull()      // Cinemark e Cinesystem
  })
  it('sem match devolve null', () => {
    expect(resolvePlace('Kinoplex', LOCATIONS)).toBeNull()
    expect(resolvePlace('', LOCATIONS)).toBeNull()
  })
})

describe('draftFromCapture', () => {
  const ctx = { today: TODAY, locations: LOCATIONS }

  it('usa hoje quando a linha não diz a data e resolve o local cadastrado', () => {
    const { draft, issues } = draftFromCapture(logParser('Duna ★4 @Netflix'), ctx)
    expect(draft).toMatchObject({ title: 'Duna', rating: 4, date: TODAY, place: { id: 'l3' } })
    expect(issues).toEqual({ people: [] })
  })

  it('local desconhecido vira aviso (não é criado em silêncio)', () => {
    const { draft, issues } = draftFromCapture(logParser('Duna @Kinoplex'), ctx)
    expect(draft.place).toBeNull()
    expect(issues.place).toBe('Kinoplex')
  })

  it('"+pessoa" nunca é vinculada sozinha', () => {
    const { draft, issues } = draftFromCapture(logParser('Duna +Ana'), ctx)
    expect(draft.people).toEqual([])
    expect(issues.people).toEqual(['Ana'])
  })
})

describe('validação e salvar direto', () => {
  const ok = { ...emptyDraft(TODAY), film: film() }

  it('exige o filme e uma data que não seja futura', () => {
    expect(validateDraft(emptyDraft(TODAY), TODAY)?.field).toBe('film')
    expect(validateDraft({ ...ok, date: '' }, TODAY)?.field).toBe('date')
    expect(validateDraft({ ...ok, date: '2999-01-01' }, TODAY)?.message).toMatch(/futuro/)
    expect(validateDraft(ok, TODAY)).toBeNull()
  })

  it('salva direto só sem pendências: local não achado ou pessoa abrem o formulário', () => {
    expect(canSaveQuickly(ok, { people: [] }, TODAY)).toBe(true)
    expect(canSaveQuickly(ok, { people: [], place: 'Kinoplex' }, TODAY)).toBe(false)
    expect(canSaveQuickly(ok, { people: ['Ana'] }, TODAY)).toBe(false)
    expect(canSaveQuickly(emptyDraft(TODAY), { people: [] }, TODAY)).toBe(false)
  })
})
