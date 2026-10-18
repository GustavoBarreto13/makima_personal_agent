// Datas das pessoas: próximo aniversário, idade que completa, "há quanto tempo não falamos".
// Funções puras (sem React nem relógio): quem chama passa o "hoje", sempre no fuso de São Paulo.
// O 29 de fevereiro cai em 28/02 nos anos comuns, como no backend.

import { addDaysISO, diffDays, pad2 } from '../../../design/core/format'
import type { OtherDate, PersonRow } from '../types'

const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

/** Dia do mês que existe naquele ano: 29/02 vira 28/02 em ano comum e um dia impossível (31/02 que escapou da
 *  validação) cai no último dia do mês, em vez de gerar uma data inexistente. */
function clampDay(year: number, month: number, day: number): number {
  const last = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31
  return Math.min(day, last)
}

/** Próxima vez (de hoje em diante) que cai o dia `day`/`month`. */
export function nextOccurrence(month: number, day: number, today: string): string {
  const year = Number(today.slice(0, 4))
  for (const y of [year, year + 1]) {
    const iso = `${y}-${pad2(month)}-${pad2(clampDay(y, month, day))}`
    if (iso >= today) return iso
  }
  return `${year + 1}-${pad2(month)}-${pad2(clampDay(year + 1, month, day))}`
}

/** Idade que a pessoa completa em `on`, ou null sem ano de nascimento. */
export function turningAge(birthYear: number | null, on: string): number | null {
  if (!birthYear) return null
  const age = Number(on.slice(0, 4)) - birthYear
  return age > 0 ? age : null
}

/** Um dia marcado de uma pessoa: o aniversário ou uma data importante. */
export interface UpcomingDate {
  key: string
  personId: string
  personName: string
  avatarUrl: string | null
  /** "Aniversário", "Casamento"… */
  label: string
  isBirthday: boolean
  /** Próxima vez que cai (AAAA-MM-DD). */
  date: string
  inDays: number
  /** Idade que completa (aniversário) ou anos desde a data (outras datas), quando dá para saber. */
  years: number | null
  /** Dias de antecedência do lembrete; null = sem lembrete. */
  remind: number | null
}

/** O lembrete de 0 = no dia; −1 ou null = sem lembrete. */
export const remindOrNull = (days: number | null | undefined): number | null => (days === null || days === undefined || days < 0 ? null : days)

function fromOther(p: PersonRow, d: OtherDate, today: string): UpcomingDate | null {
  if (!d.date) return null
  const [y, m, dd] = d.date.split('-').map(Number)
  const date = d.recurring ? nextOccurrence(m, dd, today) : d.date
  // Data que não repete e já passou deixa de ser "próxima".
  if (date < today) return null
  return {
    key: `${p.id}:d:${d.id ?? d.label}:${d.date}`, personId: p.id, personName: p.name, avatarUrl: p.avatar_url, label: d.label,
    isBirthday: false, date, inDays: diffDays(today, date), years: d.recurring && y ? Number(date.slice(0, 4)) - y : null,
    remind: remindOrNull(d.remind_days_before),
  }
}

/** Todas as datas de todas as pessoas, da mais próxima à mais distante. `horizon` corta o que passa de N dias. */
export function upcomingDates(people: PersonRow[], today: string, horizon = 366): UpcomingDate[] {
  const out: UpcomingDate[] = []
  for (const p of people) {
    if (p.birth_day && p.birth_month) {
      const date = nextOccurrence(p.birth_month, p.birth_day, today)
      out.push({
        key: `${p.id}:b`, personId: p.id, personName: p.name, avatarUrl: p.avatar_url, label: 'Aniversário', isBirthday: true,
        date, inDays: diffDays(today, date), years: turningAge(p.birth_year, date), remind: remindOrNull(p.birthday_remind_days),
      })
    }
    for (const d of p.dates) {
      const item = fromOther(p, d, today)
      if (item) out.push(item)
    }
  }
  return out.filter((d) => d.inDays <= horizon).sort((a, b) => a.inDays - b.inDays || a.personName.localeCompare(b.personName, 'pt-BR'))
}

/** Dia do próximo contato que deveria acontecer: quando o último foi há mais de `limit` dias. */
export function daysSince(date: string | null | undefined, today: string): number | null {
  return date ? Math.max(0, diffDays(date, today)) : null
}

/** "há 3 dias", "hoje", "ontem", "há 2 meses"… para o último contato. */
export function sinceLabel(days: number | null): string {
  if (days === null) return 'sem contato registrado'
  if (days === 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 30) return `há ${days} dias`
  if (days < 365) { const m = Math.round(days / 30); return `há ${m} ${m === 1 ? 'mês' : 'meses'}` }
  const y = Math.round(days / 365)
  return `há ${y} ${y === 1 ? 'ano' : 'anos'}`
}

/** "daqui a 3 dias" / "hoje" / "amanhã", para datas futuras. */
export function inLabel(days: number): string {
  if (days === 0) return 'hoje'
  if (days === 1) return 'amanhã'
  return `em ${days} dias`
}

/** A janela de dias atrás para a data de um item ("a partir de"), usada nos filtros. */
export const daysAgo = (today: string, n: number): string => addDaysISO(today, -n)

/** "15 de maio" (sem ano), para mostrar aniversário sem expor a idade. */
export function dayMonth(day: number, month: number): string {
  const names = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${day} de ${names[month - 1]}`
}

/** "lembra 1 dia antes", "lembra no dia" ou "sem lembrete". */
export function remindText(remind: number | null): string {
  if (remind === null) return 'sem lembrete'
  if (remind === 0) return 'lembra no dia'
  return `lembra ${remind === 1 ? '1 dia' : `${remind} dias`} antes`
}
