// Rascunho do formulário de pessoa: valores iniciais, validação, e a conversão para o que a API espera.
// Tudo puro (sem React) para testar. O servidor valida de novo; aqui só se evita o ida-e-volta óbvio.

import type { PersonPatch } from '../komiApi'
import type { PersonDetail, PersonInput, Space } from '../types'

/** Uma data importante a cadastrar junto com a pessoa nova. */
export interface DateDraft {
  label: string
  date: string
  recurring: boolean
  /** −1 = sem lembrete. */
  remind: number
}

export interface PersonDraft extends PersonInput {
  /** Outras formas de chamar (só servem para a busca achar). */
  aliases: string[]
  /** Datas importantes a criar (só no cadastro; depois elas vivem na aba Datas). */
  dates: DateDraft[]
}

export const REMIND_OPTIONS: { value: number; label: string }[] = [
  { value: -1, label: 'Sem lembrete' },
  { value: 0, label: 'No dia' },
  { value: 1, label: '1 dia antes' },
  { value: 2, label: '2 dias antes' },
  { value: 3, label: '3 dias antes' },
  { value: 7, label: '1 semana antes' },
]

export function emptyPerson(name = '', context: Space = 'personal', category = 'outros'): PersonDraft {
  return {
    name, nickname: '', full_name: '', relationship: '', category, context, phone: '', email: '', instagram: '', telegram: '',
    city: '', avatar_url: '', birth_day: null, birth_month: null, birth_year: null, birthday_remind_days: 1, aliases: [], dates: [],
  }
}

/** Rascunho a partir do perfil que o servidor devolveu (edição). */
export function draftFromDetail(d: PersonDetail): PersonDraft {
  const p = d.perfil
  return {
    name: p.name, nickname: p.nickname ?? '', full_name: p.full_name ?? '', relationship: p.relationship ?? '', category: p.category,
    context: p.context, phone: p.phone ?? '', email: p.email ?? '', instagram: p.instagram ?? '', telegram: p.telegram ?? '',
    city: p.city ?? '', avatar_url: p.avatar_url ?? '', birth_day: p.birth_day, birth_month: p.birth_month, birth_year: p.birth_year,
    // Sem lembrete no servidor (null) é −1 na tela.
    birthday_remind_days: p.birthday_remind_days ?? -1, aliases: d.aliases.map((a) => a.alias), dates: [],
  }
}

export interface FormError {
  field: 'name' | 'nickname' | 'birthday' | 'form'
  message: string
}

const daysIn = (month: number, year: number | null): number =>
  // 29/02 vale sem ano (nasceu em ano bissexto); com ano, só se o ano for bissexto.
  [31, year === null || (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]

export function validatePerson(d: PersonDraft, thisYear: number): FormError | null {
  if (!d.name.trim()) return { field: 'name', message: 'Dê um nome à pessoa.' }
  const { birth_day: day, birth_month: month, birth_year: year } = d
  if ((day === null) !== (month === null)) return { field: 'birthday', message: 'Informe o dia e o mês do aniversário (ou deixe os dois vazios).' }
  if (day !== null && month !== null) {
    if (month < 1 || month > 12 || day < 1 || day > daysIn(month, year)) return { field: 'birthday', message: 'Esse dia não existe nesse mês.' }
    if (year !== null && (year < 1900 || year > thisYear)) return { field: 'birthday', message: `O ano precisa estar entre 1900 e ${thisYear}.` }
  } else if (year !== null) {
    return { field: 'birthday', message: 'O ano sozinho não basta: informe também o dia e o mês.' }
  }
  return null
}

/** Para qual campo vai a mensagem de conflito de nome do servidor ("'Bia' já é o nome ou apelido de…"). */
export function conflictField(message: string, d: Pick<PersonDraft, 'nickname'>): 'name' | 'nickname' {
  const nick = d.nickname.trim()
  return nick && message.startsWith(`'${nick}'`) ? 'nickname' : 'name'
}

const FIELDS = ['name', 'nickname', 'full_name', 'relationship', 'category', 'context', 'phone', 'email', 'instagram', 'telegram', 'city', 'avatar_url'] as const

/** Só o que mudou, no formato do PATCH (lembrete "sem" vira null; texto é aparado). */
export function toPatch(initial: PersonDraft, d: PersonDraft): PersonPatch {
  const patch: Record<string, unknown> = {}
  for (const k of FIELDS) {
    const now = typeof d[k] === 'string' ? (d[k] as string).trim() : d[k]
    const before = typeof initial[k] === 'string' ? (initial[k] as string).trim() : initial[k]
    if (now !== before) patch[k] = now
  }
  if (d.birth_day !== initial.birth_day || d.birth_month !== initial.birth_month || d.birth_year !== initial.birth_year) {
    patch.birth_day = d.birth_day
    patch.birth_month = d.birth_month
    patch.birth_year = d.birth_year
  }
  if (d.birthday_remind_days !== initial.birthday_remind_days) patch.birthday_remind_days = d.birthday_remind_days < 0 ? null : d.birthday_remind_days
  return patch as PersonPatch
}

/** Corpo do cadastro (campos vazios saem). */
export function toCreate(d: PersonDraft): PersonPatch & { name: string } {
  const body: Record<string, unknown> = { name: d.name.trim(), category: d.category, context: d.context }
  for (const k of ['nickname', 'full_name', 'relationship', 'phone', 'email', 'instagram', 'telegram', 'city', 'avatar_url'] as const) {
    const v = d[k].trim()
    if (v) body[k] = v
  }
  if (d.birth_day !== null && d.birth_month !== null) {
    body.birth_day = d.birth_day
    body.birth_month = d.birth_month
    if (d.birth_year !== null) body.birth_year = d.birth_year
    body.birthday_remind_days = d.birthday_remind_days < 0 ? null : d.birthday_remind_days
  }
  return body as PersonPatch & { name: string }
}

/** Outras formas que entraram e que saíram (comparadas sem caixa nem espaço sobrando). */
export function aliasChanges(before: string[], after: string[]): { add: string[]; remove: string[] } {
  const key = (s: string) => s.trim().toLowerCase()
  const b = new Set(before.map(key))
  const a = new Set(after.map(key))
  return { add: after.filter((x) => !b.has(key(x))), remove: before.filter((x) => !a.has(key(x))) }
}
