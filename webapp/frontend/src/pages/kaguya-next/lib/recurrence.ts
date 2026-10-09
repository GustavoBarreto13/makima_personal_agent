// Presets de recorrência do painel de detalhe: a regra RFC 5545 que o backend entende, a partir de uma escolha simples
// ("todo dia", "dias úteis", "toda quarta"…). Regras fora dos presets (a cada 3 dias, vários dias) aparecem como
// "Personalizada" com o texto do servidor e não são sobrescritas até o usuário escolher outro preset.

import { parseISODate } from '../../../design/core/format'

export type RecurrencePreset = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly' | 'custom'

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const DAY_NAME = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/** Regra para um preset, ancorada na data de vencimento (a semanal usa o dia dela; a mensal, o dia do mês). */
export function ruleFor(preset: Exclude<RecurrencePreset, 'none' | 'custom'>, due: string): string {
  const d = parseISODate(due)
  switch (preset) {
    case 'daily': return 'FREQ=DAILY'
    case 'weekdays': return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
    case 'weekly': return `FREQ=WEEKLY;BYDAY=${BYDAY[d.getDay()]}`
    case 'monthly': return `FREQ=MONTHLY;BYMONTHDAY=${d.getDate()}`
    case 'yearly': return 'FREQ=YEARLY'
  }
}

/** Qual preset descreve a regra atual (comparando com os gerados para a mesma data). */
export function presetOf(rrule: string | null | undefined, due: string | null): RecurrencePreset {
  if (!rrule) return 'none'
  const rule = rrule.replace(/^RRULE:/i, '')
  if (due) {
    for (const p of ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const) if (ruleFor(p, due) === rule) return p
  } else {
    if (rule === 'FREQ=DAILY') return 'daily'
    if (rule === 'FREQ=YEARLY') return 'yearly'
    if (rule === 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') return 'weekdays'
  }
  return 'custom'
}

/** Rótulos das opções; "toda quarta" e "todo dia 5" dependem da data. */
export function presetLabels(due: string | null): { value: RecurrencePreset; label: string }[] {
  const d = due ? parseISODate(due) : null
  return [
    { value: 'none', label: 'Não repete' },
    { value: 'daily', label: 'Todo dia' },
    { value: 'weekdays', label: 'Dias úteis' },
    { value: 'weekly', label: d ? `Toda ${DAY_NAME[d.getDay()]}` : 'Toda semana' },
    { value: 'monthly', label: d ? `Todo dia ${d.getDate()}` : 'Todo mês' },
    { value: 'yearly', label: 'Todo ano' },
  ]
}
