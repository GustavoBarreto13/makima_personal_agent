// Formatação pt-BR do Design System — única fonte para dinheiro, números, datas e atalhos.
//
// Regras (CLAUDE.md raiz): tudo no fuso do usuário (UTC-3). Datas "YYYY-MM-DD" NUNCA passam por
// `new Date('YYYY-MM-DD')` (que interpreta como UTC e erra o dia). Usar parseISODate/isoDate.

import { systemClock, type Clock } from './ports'

export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const
export const MONTHS_LONG = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const
export const WEEKDAYS_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'] as const
export const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

export const pad2 = (n: number): string => String(n).padStart(2, '0')

// ── datas (partes locais, nunca UTC) ─────────────────────────────────────────

/** Date → "YYYY-MM-DD" com as partes locais. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** "YYYY-MM-DD" → Date à meia-noite local. */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Número de dias desde 1970 (estável a horário de verão): serve para diferenças em dias corridos. */
export function dayNumber(s: string): number {
  const [y, m, d] = s.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** Hoje no fuso do usuário. */
export function todayISO(clock: Clock = systemClock): string {
  return isoDate(clock.now())
}

/** Soma dias a uma data ISO. */
export function addDaysISO(s: string, n: number): string {
  const d = parseISODate(s)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

/** Diferença em dias corridos: b - a. */
export function diffDays(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a)
}

// ── números ──────────────────────────────────────────────────────────────────

export function fmtNumber(n: number, decimals = 0): string {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** Recebe a FRAÇÃO (0.12 → "12%"). Nunca multiplique por 100 antes de chamar. */
export function fmtPercent(fraction: number, decimals = 0): string {
  return `${fmtNumber(fraction * 100, decimals)}%`
}

/** R$ pt-BR. `mask` esconde o valor (modo privacidade da Nami). */
export function fmtMoney(value: number, opts: { mask?: boolean; decimals?: number } = {}): string {
  if (opts.mask) return 'R$ •••••'
  const d = opts.decimals ?? 2
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d, maximumFractionDigits: d })
}

/** Minutos → "45 min" / "1h 15min". */
export function fmtDuration(minutes: number): string {
  const m = Math.round(minutes)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${pad2(r)}min` : `${h}h`
}

/** "1 livro" / "3 livros". */
export function pluralize(n: number, one: string, many: string): string {
  return `${fmtNumber(n)} ${n === 1 ? one : many}`
}

// ── datas legíveis ───────────────────────────────────────────────────────────

/** "2 de out." */
export function fmtDate(s: string): string {
  const d = parseISODate(s)
  return `${d.getDate()} de ${MONTHS_SHORT[d.getMonth()]}.`
}

/** "sexta-feira, 2 de outubro" */
export function fmtDateLong(s: string): string {
  const d = parseISODate(s)
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`
}

/** "outubro de 2026" */
export function fmtMonthYear(s: string): string {
  const d = parseISODate(s)
  return `${MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}`
}

/** "hoje", "ontem", "há 3 dias", "amanhã", "em 4 dias" ou "12 de mar." */
export function fmtRelative(s: string, today: string = todayISO()): string {
  const n = diffDays(today, s)
  if (n === 0) return 'hoje'
  if (n === -1) return 'ontem'
  if (n === 1) return 'amanhã'
  if (n < 0 && n > -7) return `há ${-n} dias`
  if (n > 0 && n < 7) return `em ${n} dias`
  return fmtDate(s)
}

/** "2 a 8 de out." */
export function fmtRange(a: string, b: string): string {
  const da = parseISODate(a)
  const db = parseISODate(b)
  if (da.getMonth() === db.getMonth() && da.getFullYear() === db.getFullYear()) {
    return `${da.getDate()} a ${db.getDate()} de ${MONTHS_SHORT[db.getMonth()]}.`
  }
  return `${fmtDate(a)} a ${fmtDate(b)}`
}

// ── nota em estrelas: 0 a 5, com meia estrela ────────────────────────────────

/** Arredonda para a meia estrela mais próxima e limita a 0–5. É a única fonte desse arredondamento. */
export function snapHalf(v: number | null | undefined): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.round(Math.max(0, Math.min(5, n)) * 2) / 2
}

/** Converte da escala de origem (ex.: 1–10 do MAL) para 0–5 com meia estrela. */
export function toFiveScale(value: number, sourceMax: number): number {
  return snapHalf((value / sourceMax) * 5)
}

/** Volta de 0–5 para a escala de origem. */
export function fromFiveScale(value: number, sourceMax: number): number {
  return Math.round((snapHalf(value) / 5) * sourceMax)
}

// ── atalhos: padrão Windows (Ctrl); só em macOS vira ⌘ ───────────────────────

export type Platform = 'mac' | 'other'

/** 'mod+k' → "Ctrl+K" (Windows/Linux) ou "⌘K" (macOS). Outras teclas viram rótulo legível. */
export function formatShortcut(shortcut: string, platform: Platform = 'other'): string {
  const names: Record<string, string> = { esc: 'Esc', enter: 'Enter', space: 'Espaço', up: '↑', down: '↓', left: '←', right: '→' }
  const parts = shortcut.split('+').map((p) => p.trim().toLowerCase())
  const mac = platform === 'mac'
  const out = parts.map((p) => {
    if (p === 'mod') return mac ? '⌘' : 'Ctrl'
    if (p === 'alt') return mac ? '⌥' : 'Alt'
    if (p === 'shift') return mac ? '⇧' : 'Shift'
    return names[p] ?? (p.length === 1 ? p.toUpperCase() : p)
  })
  return mac ? out.join('') : out.join('+')
}
