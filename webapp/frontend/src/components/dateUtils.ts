// Helpers de data do seletor compartilhado (DatePicker/MiniCalendar). Sempre partes LOCAIS do navegador:
// toISOString() devolve UTC e, depois das 21h em UTC-3, já aponta para o dia seguinte.

export const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Letra do dia da semana, indexada por getDay() (0 = domingo). */
export const WEEKDAY_1 = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/** Date → "AAAA-MM-DD" no fuso local. */
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const todayISO = (): string => toISO(new Date())

/** Nova Date com `n` dias somados (ou subtraídos); não muta a original. */
export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** "2026-06-20" → "20 jun 2026"; vazio ou inválido → "". Não passa por `new Date()` (evitaria 19 jun em UTC-3). */
export function fmtDateLabel(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return ''
  return `${d} ${MONTHS_PT[m - 1]} ${y}`
}
