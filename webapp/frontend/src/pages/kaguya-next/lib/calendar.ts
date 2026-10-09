// Lógica PURA do calendário: janelas (dia/semana/mês), conversão de tarefas e itens do hub em eventos do grid, faixas
// de sobreposição, minutos ↔ horário e a faixa de expediente (com almoço e as exceções por dia). Sem React nem DOM e sem
// relógio: "hoje" e o fuso vêm sempre de fora/do navegador, nunca de `toISOString()` (UTC).

import { addDaysISO, isoDate, parseISODate } from '../../../design/core/format'
import type { CalEvent, CalendarItem, Calendar, SchedulePrefs, ScheduleOverride, Task, WorkContext } from '../types'
import type { Space } from '../api'

export type CalView = 'day' | 'week' | 'month'

export const isGcalId = (cal: string): boolean => cal.startsWith('gcal')

export interface CalWindow { start: string; end: string; days: string[] }

/** A janela visível. A semana começa no domingo; o mês mostra 6 semanas completas (42 dias). */
export function windowFor(view: CalView, ref: string): CalWindow {
  if (view === 'day') return { start: ref, end: ref, days: [ref] }
  const d = parseISODate(ref)
  if (view === 'week') {
    const sunday = addDaysISO(ref, -d.getDay())
    const days = Array.from({ length: 7 }, (_, i) => addDaysISO(sunday, i))
    return { start: days[0], end: days[6], days }
  }
  const first = isoDate(new Date(d.getFullYear(), d.getMonth(), 1))
  const gridStart = addDaysISO(first, -parseISODate(first).getDay())
  const days = Array.from({ length: 42 }, (_, i) => addDaysISO(gridStart, i))
  return { start: days[0], end: days[41], days }
}

/** Anda `delta` períodos (dia, semana ou mês) a partir de `ref`. */
export function shiftRef(view: CalView, ref: string, delta: 1 | -1): string {
  if (view === 'day') return addDaysISO(ref, delta)
  if (view === 'week') return addDaysISO(ref, delta * 7)
  const d = parseISODate(ref)
  // Dia 1 do mês seguinte/anterior: evita “31 de março + 1 mês = 3 de maio”.
  return isoDate(new Date(d.getFullYear(), d.getMonth() + delta, 1))
}

/** Semana ISO 8601 (a quinta-feira da semana visível decide o ano). */
export function isoWeek(ref: string): number {
  const d = parseISODate(ref)
  const thursday = parseISODate(addDaysISO(ref, -d.getDay() + 4))
  const tmp = new Date(Date.UTC(thursday.getFullYear(), thursday.getMonth(), thursday.getDate()))
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

// ── Minutos ↔ horário ──────────────────────────────────────────────────────────

/** Minutos desde a meia-noite, no fuso LOCAL. Aceita datetime ISO (com ou sem offset) e “HH:MM”. */
export function timeToMin(t: string | null | undefined): number {
  if (!t) return 0
  if (t.includes('T')) {
    const d = new Date(t)
    if (!Number.isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes()
  }
  const [h, m] = (t.includes('T') ? t.split('T')[1] : t).split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export const minToLabel = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
export const snapTo15 = (min: number): number => Math.round(min / 15) * 15

/** “AAAA-MM-DDTHH:MM:00±HH:MM” no fuso local daquele dia (o offset vale para a data, não para “agora”). */
export function localISO(day: string, minuteOfDay: number): string {
  const [y, mo, d] = day.split('-').map(Number)
  const h = Math.floor(minuteOfDay / 60)
  const m = minuteOfDay % 60
  const off = -new Date(y, mo - 1, d, h, m).getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0')
  return `${day}T${pad(h)}:${pad(m)}:00${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
}

/** O dia local (AAAA-MM-DD) de um instante ISO — o backend devolve UTC, e 22h BRT já é o dia seguinte em UTC. */
export const localDayOf = (instant: string): string => isoDate(new Date(instant))

// ── Eventos do grid ────────────────────────────────────────────────────────────

/** Tarefa → evento: com bloco de tempo; com data e hora (ponto no tempo); só com data (dia inteiro); sem data → nada. */
export function taskToEvent(t: Task): CalEvent | null {
  const base = { id: String(t.id), cal: 'kaguya', color: null, kind: 'task' as const, title: t.title, taskId: t.id, done: !!t.completed_at, recurring: !!(t.recurrence || t.series_id) }
  if (t.start_at) return { ...base, day: localDayOf(t.start_at), start: t.start_at, end: t.end_at ?? null, allDay: false }
  if (t.due_date && t.due_time) return { ...base, day: t.due_date, start: `${t.due_date}T${t.due_time}`, end: null, allDay: false }
  if (t.due_date) return { ...base, day: t.due_date, start: null, end: null, allDay: true }
  return null
}

/** Item do hub (Nami, Frieren, Violet…) → evento somente leitura. */
export function hubToEvent(item: CalendarItem): CalEvent {
  return {
    id: item.ref_id ? `${item.cal}-${item.ref_id}` : `hub-${item.cal}-${item.date}-${item.title}`,
    cal: item.cal, day: item.date, start: item.start ?? null, end: item.end ?? null, allDay: item.all_day, color: item.color ?? null,
    kind: 'event', title: item.title, deepLink: item.deep_link ?? undefined, loc: item.loc ?? undefined,
  }
}

export interface GcalRaw { id: string; summary: string; start: string; end: string; location?: string | null; calendar_id: string }

/** Evento do Google → evento do grid (dia inteiro quando o início não tem hora). */
export function gcalToEvent(ev: GcalRaw): CalEvent {
  const allDay = !ev.start.includes('T')
  return {
    id: `gcal-${ev.id}`, cal: `gcal:${ev.calendar_id}`, day: ev.start.slice(0, 10), start: allDay ? null : ev.start, end: allDay ? null : ev.end, allDay,
    color: null, kind: 'event', title: ev.summary, loc: ev.location || undefined,
  }
}

export function resolveColor(ev: CalEvent, cals: Calendar[]): string {
  return ev.color || cals.find((c) => c.id === ev.cal)?.color || 'var(--ds-accent)'
}

/** Só tarefas e eventos de calendários Google com permissão de escrita podem ser movidos/redimensionados. */
export function isEditable(ev: CalEvent, cals: Calendar[]): boolean {
  if (ev.cal === 'kaguya') return true
  return isGcalId(ev.cal) && !!cals.find((c) => c.id === ev.cal)?.writable
}

/**
 * Filtra pelo espaço Trabalho/Pessoal. Tarefas já vêm filtradas pelo servidor; aqui entram os demais: o calendário Google
 * decide pelo próprio contexto (padrão Pessoal) e os itens dos outros agentes (finanças, livros, diário…) são pessoais.
 */
export function visibleInSpace(ev: CalEvent, space: Space | undefined, cals: Calendar[]): boolean {
  if (!space || ev.cal === 'kaguya') return true
  const context: WorkContext = isGcalId(ev.cal) ? cals.find((c) => c.id === ev.cal)?.context ?? 'personal' : 'personal'
  return context === space
}

// ── Faixas de sobreposição ─────────────────────────────────────────────────────

export interface Laned { ev: CalEvent; lane: number; totalLanes: number; startMin: number; endMin: number }

/** Eventos com horário que se sobrepõem dividem a largura da coluna em faixas. Sem fim, assume 30 min. */
export function assignLanes(events: CalEvent[]): Laned[] {
  const timed = events.filter((e) => e.start && !e.allDay).map((ev) => {
    const startMin = timeToMin(ev.start)
    return { ev, startMin, endMin: ev.end ? Math.max(timeToMin(ev.end), startMin + 1) : startMin + 30, lane: 0, totalLanes: 1 }
  }).sort((a, b) => a.startMin - b.startMin)

  const out: Laned[] = []
  let group: typeof timed = []
  const flush = () => { for (const g of group) g.totalLanes = group.length; out.push(...group) }
  for (const item of timed) {
    const groupEnd = group.length ? Math.max(...group.map((g) => g.endMin)) : 0
    if (!group.length || item.startMin < groupEnd) { item.lane = group.length; group.push(item) }
    else { flush(); group = [item]; item.lane = 0 }
  }
  flush()
  return out
}

// ── Expediente no grid ─────────────────────────────────────────────────────────

export interface WorkBand { start: number; end: number; lunch: [number, number] | null }

/** O expediente daquele dia (preferências + exceção do dia), em minutos. `null` = não é dia de trabalho. */
export function workBand(day: string, prefs: SchedulePrefs | null, overrides: ScheduleOverride[]): WorkBand | null {
  if (!prefs) return null
  const o = overrides.find((x) => x.day === day)
  const js = parseISODate(day).getDay()
  const works = o ? o.works : prefs.work_days.includes(js === 0 ? 7 : js)
  if (!works) return null
  const start = timeToMin(o?.work_start ?? prefs.work_start)
  const end = timeToMin(o?.work_end ?? prefs.work_end)
  if (end <= start) return null
  const lunch: [number, number] | null = prefs.lunch_start && prefs.lunch_end ? [timeToMin(prefs.lunch_start), timeToMin(prefs.lunch_end)] : null
  return { start, end, lunch: lunch && lunch[0] >= start && lunch[1] <= end && lunch[1] > lunch[0] ? lunch : null }
}
