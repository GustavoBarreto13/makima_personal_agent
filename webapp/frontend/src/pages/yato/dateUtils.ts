// Utilitários de data do shell Yato — cópia local de todayLocalISO() (decisão D8 do
// plan.md: cada shell mantém sua própria cópia, no mesmo padrão de akane/marin/mai).
// Ver webapp/frontend/src/pages/violet/dateUtils.ts para a versão original/comentada.

/** Retorna a data de HOJE no fuso LOCAL do navegador como "YYYY-MM-DD". Nunca usar toISOString(). */
export function todayLocalISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parseia uma data "YYYY-MM-DD" como meia-noite LOCAL (evita o shift de fuso do `new Date(iso)`). */
export function parseLocalDate(iso: string): Date {
  return new Date(iso + 'T00:00:00')
}

const MESES_ABR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const DOW = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/** Formata "YYYY-MM-DD" como "DD/MM". */
export function fmtBR(iso: string): string {
  const d = parseLocalDate(iso)
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0')
}

/** Formata "YYYY-MM-DD" como "DD/MM/AAAA". */
export function fmtBRfull(iso: string): string {
  const d = parseLocalDate(iso)
  return fmtBR(iso) + '/' + d.getFullYear()
}

/** Formata um intervalo [a,b] como "12–15 set 2026" (ou "28 ago – 3 set 2026" se cruzar mês). */
export function fmtRange(a: string, b: string): string {
  const da = parseLocalDate(a)
  const db = parseLocalDate(b)
  if (da.getMonth() === db.getMonth() && da.getFullYear() === db.getFullYear()) {
    return `${da.getDate()}–${db.getDate()} ${MESES_ABR[da.getMonth()]} ${db.getFullYear()}`
  }
  return `${da.getDate()} ${MESES_ABR[da.getMonth()]} – ${db.getDate()} ${MESES_ABR[db.getMonth()]} ${db.getFullYear()}`
}

/** Número de dias entre duas datas ISO (b - a), pode ser negativo. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseLocalDate(b).getTime() - parseLocalDate(a).getTime()) / 86400000)
}

/** Lista de datas ISO entre start e end (inclusive). */
export function dayList(start: string, end: string): string[] {
  const out: string[] = []
  const n = daysBetween(start, end) + 1
  const d0 = parseLocalDate(start)
  for (let i = 0; i < n; i++) {
    const d = new Date(d0.getTime() + i * 86400000)
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    )
  }
  return out
}

/** Formata um valor numérico como "R$ 1.234". */
export function money(v: number | null | undefined): string {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR')
}

/**
 * Extrai a data local (YYYY-MM-DD) de um timestamp ISO com fuso (ex.:
 * "2026-08-20T02:15:00+00:00", um TIMESTAMPTZ vindo do backend em UTC).
 *
 * Nunca usar `iso.slice(0, 10)` aqui — perto da meia-noite UTC isso erra o dia
 * em UTC-3 (mesma classe de bug documentada em pages/violet/dateUtils.ts).
 * `new Date(iso)` + getFullYear/getMonth/getDate lêem o fuso LOCAL do navegador.
 */
export function isoDateOnly(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
