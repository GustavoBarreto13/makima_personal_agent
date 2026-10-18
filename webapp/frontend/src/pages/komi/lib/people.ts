// Regras de pessoas no front: como mostrar o nome, achar por qualquer nome, filtrar por espaço e os
// esquemas das coleções (padrão useCollection): Pessoas e Datas.

import { defineCollection, type CollectionSchema } from '../../../design/core/collection'
import { MONTHS_LONG } from '../../../design/core/format'
import { daysSince, type UpcomingDate } from './dates'
import type { Category, PersonRow, SpaceFilter } from '../types'

/** Minúsculas e sem acento: "João" e "joao" são a mesma pessoa. */
export function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** A pessoa vale no espaço escolhido? Quem é "ambos" vale nos dois. */
export function inSpace(p: Pick<PersonRow, 'context'>, space: SpaceFilter): boolean {
  return space === 'all' || p.context === 'both' || p.context === space
}

/** Segunda linha do nome: Apelido · Nome completo (sem repetir o que já é o Nome). */
export function nameDetail(p: Pick<PersonRow, 'name' | 'nickname' | 'full_name'>): string {
  const seen = new Set([norm(p.name)])
  const parts: string[] = []
  for (const v of [p.nickname, p.full_name]) {
    if (v && !seen.has(norm(v))) { seen.add(norm(v)); parts.push(v) }
  }
  return parts.join(' · ')
}

/** Todos os nomes pelos quais a pessoa pode ser achada. */
export const namesOf = (p: PersonRow): string[] => [p.name, p.nickname ?? '', p.full_name ?? '', ...p.aliases].filter(Boolean)

/** Acha a pessoa pelo que foi digitado: nome inteiro (ou parte do começo) em qualquer um dos nomes.
 *  Devolve a pessoa só se for UMA; se houver dúvida, devolve null e quem chama pergunta. */
export function resolvePerson(people: PersonRow[], typed: string): PersonRow | null {
  const n = norm(typed)
  if (!n) return null
  const exact = people.filter((p) => namesOf(p).some((x) => norm(x) === n))
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return null
  const starts = people.filter((p) => namesOf(p).some((x) => norm(x).startsWith(n) || norm(x).split(' ').some((w) => w.startsWith(n))))
  return starts.length === 1 ? starts[0] : null
}

/** A pessoa mais a data do último contato, que as coleções usam para filtrar e ordenar. */
export interface PersonItem extends PersonRow {
  lastDate: string
}

export const toItem = (p: PersonRow): PersonItem => ({ ...p, lastDate: p.last_interaction?.date ?? '' })

const monthLabel = (iso: string) => `${MONTHS_LONG[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`

export function makePeopleSchema(categories: Category[]): CollectionSchema<PersonItem> {
  return defineCollection<PersonItem>({
    scope: 'komi:pessoas',
    search: (p) => [...namesOf(p), p.city ?? '', p.relationship ?? '', p.groups.join(' ')],
    facets: [
      {
        kind: 'enum', id: 'category', label: 'Relacionamento', get: (p) => p.category,
        options: categories.map((c) => ({ value: c.slug, label: c.label })),
      },
      {
        kind: 'enum', id: 'context', label: 'Espaço', get: (p) => p.context,
        options: [{ value: 'personal', label: 'Pessoal' }, { value: 'work', label: 'Trabalho' }, { value: 'both', label: 'Pessoal e trabalho' }],
      },
      { kind: 'tags', id: 'groups', label: 'Grupo', get: (p) => p.groups },
      { kind: 'flag', id: 'birthday', label: 'Só com aniversário cadastrado', get: (p) => !!(p.birth_day && p.birth_month) },
      { kind: 'dateRange', id: 'last', label: 'Último contato', get: (p) => p.lastDate, buckets: ['last7', 'last30', 'last90', 'thisYear', 'all'], defaultBucket: 'all' },
    ],
    groups: [
      { id: 'category', label: 'Relacionamento', key: (p) => categories.find((c) => c.slug === p.category)?.label ?? 'Outros' },
      { id: 'context', label: 'Espaço', key: (p) => (p.context === 'work' ? 'Trabalho' : p.context === 'both' ? 'Pessoal e trabalho' : 'Pessoal') },
      { id: 'initial', label: 'Inicial', key: (p) => p.name.charAt(0).toUpperCase() || '#' },
    ],
    sorts: [
      { id: 'name', label: 'Nome', value: (p) => norm(p.name) },
      { id: 'last', label: 'Último contato', value: (p) => p.lastDate },
      { id: 'links', label: 'Mais citadas', value: (p) => p.link_count },
    ],
    defaults: { groupBy: 'none', sortBy: 'name', dir: 'asc' },
  })
}

/** Em que janela de tempo (a partir de hoje) cai uma data futura: o DS só tem janelas para o passado. */
export function whenBucket(inDays: number): 'today' | 'week' | 'month' | 'quarter' | 'later' {
  if (inDays <= 0) return 'today'
  if (inDays <= 7) return 'week'
  if (inDays <= 30) return 'month'
  return inDays <= 90 ? 'quarter' : 'later'
}

export function makeDatesSchema(): CollectionSchema<UpcomingDate> {
  return defineCollection<UpcomingDate>({
    scope: 'komi:datas',
    search: (d) => [d.personName, d.label],
    facets: [
      {
        kind: 'enum', id: 'type', label: 'Tipo', get: (d) => (d.isBirthday ? 'birthday' : 'other'),
        options: [{ value: 'birthday', label: 'Aniversários' }, { value: 'other', label: 'Outras datas' }],
      },
      { kind: 'flag', id: 'remind', label: 'Só com lembrete', get: (d) => d.remind !== null },
      {
        kind: 'enum', id: 'when', label: 'Quando', get: (d) => whenBucket(d.inDays),
        options: [{ value: 'today', label: 'Hoje' }, { value: 'week', label: 'Esta semana' }, { value: 'month', label: 'Este mês' }, { value: 'quarter', label: 'Nos próximos 3 meses' }, { value: 'later', label: 'Mais adiante' }],
      },
    ],
    groups: [
      { id: 'month', label: 'Mês', key: (d) => monthLabel(d.date) },
      { id: 'person', label: 'Pessoa', key: (d) => d.personName },
    ],
    sorts: [
      { id: 'date', label: 'Mais próximas', value: (d) => d.date },
      { id: 'person', label: 'Pessoa', value: (d) => norm(d.personName) },
    ],
    defaults: { groupBy: 'month', sortBy: 'date', dir: 'asc' },
  })
}

/** Quem está há mais tempo sem contato (com pelo menos `minDays`), do mais esquecido ao menos. Quem nunca teve
 *  contato registrado só entra se `includeNever` (para não encher a lista de recém-cadastrados). */
export function reconnectCandidates(people: PersonRow[], today: string, minDays = 30, includeNever = false): { person: PersonRow; days: number | null }[] {
  const out: { person: PersonRow; days: number | null }[] = []
  for (const person of people) {
    const days = daysSince(person.last_interaction?.date, today)
    if (days === null ? includeNever : days >= minDays) out.push({ person, days })
  }
  return out.sort((a, b) => (b.days ?? 1e9) - (a.days ?? 1e9) || a.person.name.localeCompare(b.person.name, 'pt-BR'))
}
