// Dados fictícios do agente de exemplo da página /design (Hayate, treinos).
// Gerados por uma semente fixa: sempre os mesmos treinos. Nada daqui vem do backend.
// buildStatsPayload faz o papel do endpoint GET /api/<domínio>/stats do contrato StatsPayload.

import { fmtDate, fmtDuration, fmtNumber, isoDate, MONTHS_LONG, todayISO } from '../../design/core/format'
import { createCaptureParser, type CaptureResult } from '../../design/core/capture'
import { defineCollection, type CollectionSchema } from '../../design/core/collection'
import { computeStreaks, cutoffFor, mondayOf, ratingDistribution, topN, type StatsPayload } from '../../design/core/stats'
import { toast } from '../../design/headless/toast'
import type { IconName } from '../../design/ui/icons'

export type WorkoutType = 'Força' | 'Corrida' | 'HIIT' | 'Mobilidade'

export interface Workout {
  id: number
  date: string
  type: WorkoutType
  title: string
  place: string
  mins: number
  /** Carga total em kg (força). */
  vol: number
  /** Distância em km (corrida). */
  dist: number
  rating: number
  tags: string[]
  pr: boolean
  status: 'done' | 'planned'
  rpe: number
  kcal: number
}

export const TYPE_META: Record<WorkoutType, { icon: IconName; hue: number }> = {
  Força: { icon: 'workout', hue: 300 },
  Corrida: { icon: 'run', hue: 215 },
  HIIT: { icon: 'hiit', hue: 28 },
  Mobilidade: { icon: 'mobility', hue: 160 },
}

export const PLACES = ['Smart Fit Paulista', 'Parque Ibirapuera', 'Em casa', 'Studio Ritmo', 'Rua'] as const

const TPL: Record<WorkoutType, [string, string[]][]> = {
  Força: [['Peito e tríceps', ['peito', 'braços']], ['Costas e bíceps', ['costas', 'braços']], ['Pernas pesadas', ['pernas']], ['Ombros e core', ['ombros', 'core']], ['Full body', ['full body']]],
  Corrida: [['Rodagem leve', ['cardio']], ['Tiros de 400 m', ['cardio', 'tiros']], ['Longão de sábado', ['cardio', 'longo']], ['Progressivo', ['cardio']]],
  HIIT: [['Circuito de 20 min', ['cardio']], ['EMOM de core', ['core']], ['Tabata sem equipamento', ['cardio']]],
  Mobilidade: [['Quadril e coluna', ['recuperação']], ['Yoga flow', ['recuperação']]],
}
const PLACE_BY_TYPE: Record<WorkoutType, string[]> = {
  Força: ['Smart Fit Paulista', 'Smart Fit Paulista', 'Em casa'],
  Corrida: ['Parque Ibirapuera', 'Rua', 'Parque Ibirapuera'],
  HIIT: ['Em casa', 'Studio Ritmo'],
  Mobilidade: ['Em casa', 'Studio Ritmo'],
}

function rng(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createWorkouts(today: string = todayISO()): Workout[] {
  const R = rng(20260)
  const pick = <T,>(a: T[]): T => a[Math.floor(R() * a.length)]
  const out: Workout[] = []
  let id = 1
  const end = new Date()
  end.setDate(end.getDate() + 6)
  for (let d = new Date(2025, 0, 1); d <= end; d.setDate(d.getDate() + 1)) {
    const date = isoDate(d)
    const dow = d.getDay()
    const fut = date > today
    const r = R()
    let type: WorkoutType | null = null
    if (dow === 1 && r < 0.8) type = 'Força'
    else if (dow === 2 && r < 0.7) type = R() < 0.6 ? 'Corrida' : 'HIIT'
    else if (dow === 3 && r < 0.8) type = 'Força'
    else if (dow === 4 && r < 0.65) type = R() < 0.5 ? 'Corrida' : 'HIIT'
    else if (dow === 5 && r < 0.7) type = 'Força'
    else if (dow === 6 && r < 0.65) type = R() < 0.7 ? 'Corrida' : 'Mobilidade'
    else if (dow === 0 && r < 0.25) type = 'Mobilidade'
    if (!type || (fut && R() < 0.35)) continue
    const [title, t0] = pick(TPL[type])
    let mins: number
    let vol = 0
    let dist = 0
    if (type === 'Força') { mins = 45 + Math.round(R() * 7) * 5; vol = Math.round((4000 + R() * 8000) / 50) * 50 }
    else if (type === 'Corrida') { dist = Math.round((4 + R() * (title.startsWith('Longão') ? 10 : 5)) * 2) / 2; mins = Math.round(dist * (5.2 + R())) }
    else if (type === 'HIIT') mins = 20 + Math.round(R() * 3) * 5
    else mins = 20 + Math.round(R() * 4) * 5
    const pr = !fut && type !== 'Mobilidade' && R() < 0.07
    const kcalRate = { Força: 6, Corrida: 10, HIIT: 12, Mobilidade: 3.5 }[type]
    out.push({
      id: id++, date, type, title, place: pick(PLACE_BY_TYPE[type]), mins, vol, dist,
      rating: fut ? 0 : Math.min(5, Math.round((2.5 + R() * 2.7) * 2) / 2),
      tags: [...t0, ...(pr ? ['pr'] : [])], pr, status: fut ? 'planned' : 'done', rpe: 6 + Math.floor(R() * 4), kcal: Math.round(mins * kcalRate),
    })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
}

// ── esquema da coleção de treinos ────────────────────────────────────────────

export const workoutSchema: CollectionSchema<Workout> = defineCollection<Workout>({
  scope: 'design:workouts',
  search: (w) => [w.title, w.place, w.type, ...w.tags],
  facets: [
    { kind: 'enum', id: 'type', label: 'Tipo', options: (Object.keys(TYPE_META) as WorkoutType[]).map((t) => ({ value: t })), get: (w) => w.type },
    { kind: 'enum', id: 'place', label: 'Local', options: PLACES.map((p) => ({ value: p })), get: (w) => w.place },
    { kind: 'tags', id: 'tags', label: 'Etiquetas', get: (w) => w.tags },
    { kind: 'range', id: 'rating', label: 'Nota mínima', min: 0, max: 5, step: 0.5, display: 'stars', get: (w) => w.rating || null },
    { kind: 'dateRange', id: 'date', label: 'Período', buckets: ['last7', 'last30', 'last90', 'thisYear', 'all'], defaultBucket: 'last90', get: (w) => w.date },
    { kind: 'flag', id: 'pr', label: 'Só recordes (PR)', get: (w) => w.pr },
  ],
  groups: [
    { id: 'type', label: 'Tipo', key: (w) => w.type },
    { id: 'month', label: 'Mês', key: (w) => `${MONTHS_LONG[Number(w.date.slice(5, 7)) - 1]} de ${w.date.slice(0, 4)}` },
    { id: 'place', label: 'Local', key: (w) => w.place },
  ],
  sorts: [
    { id: 'recent', label: 'Recentes', value: (w) => w.date },
    { id: 'rating', label: 'Nota', value: (w) => w.rating },
    { id: 'mins', label: 'Duração', value: (w) => w.mins },
    { id: 'vol', label: 'Carga', value: (w) => w.vol },
  ],
  defaults: { sortBy: 'recent', dir: 'desc' },
})

// ── captura rápida ───────────────────────────────────────────────────────────

export const workoutParser = createCaptureParser({
  rules: ['place', 'tag', 'rating', 'sets', 'load', 'distance', 'duration', 'date'],
  dateDirection: 'past',
  orphanTime: true,
})

export function guessType(r: CaptureResult): WorkoutType {
  const t = `${r.fields.title} ${r.fields.distance ? 'km' : ''}`.toLowerCase()
  if (/corr|km|rodagem|longão|longao|tiro/.test(t)) return 'Corrida'
  if (/hiit|tabata|circuito|emom/.test(t)) return 'HIIT'
  if (/yoga|alonga|mobilidade|quadril/.test(t)) return 'Mobilidade'
  return 'Força'
}

let nextId = 100000
export function workoutFromCapture(r: CaptureResult, today: string = todayISO()): Workout {
  const f = r.fields
  const type = guessType(r)
  const mins = f.duration ?? (type === 'Corrida' && f.distance ? Math.round(f.distance * 5.8) : 45)
  const date = f.dueDate ?? today
  return {
    id: nextId++, date, type, title: f.title || `Treino de ${type.toLowerCase()}`, place: f.place ?? 'Em casa', mins,
    vol: f.sets && f.load ? f.sets[0] * f.sets[1] * f.load : 0, dist: f.distance ?? 0, rating: f.rating ?? 0, tags: f.tags,
    pr: false, status: date > today ? 'planned' : 'done', rpe: 7, kcal: Math.round(mins * 7),
  }
}

// ── detalhe ──────────────────────────────────────────────────────────────────

const EX: Record<string, [string, string, string][]> = {
  'Peito e tríceps': [['Supino reto', '4×8', '80 kg'], ['Supino inclinado', '3×10', '28 kg'], ['Crucifixo', '3×12', '18 kg'], ['Tríceps testa', '3×12', '30 kg']],
  'Costas e bíceps': [['Barra fixa', '4×6', 'peso do corpo'], ['Remada curvada', '4×8', '60 kg'], ['Puxada alta', '3×10', '55 kg'], ['Rosca direta', '3×10', '25 kg']],
  'Pernas pesadas': [['Agachamento livre', '5×5', '110 kg'], ['Leg press 45°', '4×10', '260 kg'], ['Stiff', '3×10', '70 kg'], ['Panturrilha em pé', '4×15', '90 kg']],
  'Ombros e core': [['Desenvolvimento', '4×8', '24 kg'], ['Elevação lateral', '3×12', '10 kg'], ['Prancha', '3×60 s', '—'], ['Abdominal infra', '3×15', '—']],
  'Full body': [['Levantamento terra', '4×5', '120 kg'], ['Supino reto', '3×8', '75 kg'], ['Remada', '3×10', '55 kg'], ['Agachamento', '3×8', '90 kg']],
}

/** [nome, valor, detalhe] */
export function workoutBlocks(w: Workout): [string, string, string][] {
  if (w.type === 'Força') return (EX[w.title] ?? EX['Full body']).map(([n, v, d]) => [n, v, d])
  if (w.type === 'Corrida') {
    const n = Math.max(1, Math.round(w.dist))
    const base = w.mins / Math.max(w.dist, 1)
    return Array.from({ length: Math.min(n, 8) }, (_, i) => {
      const p = base + (((i + 1) * 7 + w.id) % 5 - 2) * 0.07
      return [`Km ${i + 1}`, `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, '0')} /km`, `${150 + (((i + 1) * 3 + w.id) % 18)} bpm`] as [string, string, string]
    })
  }
  if (w.type === 'HIIT') return [1, 2, 3, 4].map((i) => [`Rodada ${i}`, '4 exercícios', '40 s / 20 s'] as [string, string, string])
  return [['Respiração', '5 min', ''], ['Quadril', '10 min', ''], ['Coluna', '8 min', '']]
}

// ── estatísticas (o que o backend devolveria) ────────────────────────────────

export type StatsMetric = 'count' | 'hours' | 'vol'

function aggregate(items: Workout[]) {
  const rated = items.filter((w) => w.rating)
  return {
    count: items.length,
    hours: items.reduce((s, w) => s + w.mins, 0) / 60,
    vol: items.reduce((s, w) => s + w.vol, 0) / 1000,
    dist: items.reduce((s, w) => s + w.dist, 0),
    days: new Set(items.map((w) => w.date)).size,
    avg: rated.length ? rated.reduce((s, w) => s + w.rating, 0) / rated.length : 0,
  }
}

export function buildStatsPayload(all: Workout[], year: number, today: string, metric: StatsMetric): StatsPayload {
  const cut = cutoffFor(year, today)
  const inYear = (y: number) => all.filter((w) => w.status === 'done' && w.date.slice(0, 4) === String(y) && w.date.slice(5) <= cut)
  const items = inYear(year)
  const prev = inYear(year - 1)
  const a = aggregate(items)
  const p = aggregate(prev)
  const st = computeStreaks(items.map((w) => w.date), today)
  const weeks = new Map<string, number>()
  items.forEach((w) => weeks.set(mondayOf(w.date), (weeks.get(mondayOf(w.date)) ?? 0) + 1))
  const bestWeek = [...weeks.entries()].sort((x, y) => y[1] - x[1])[0]
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const m = items.filter((w) => Number(w.date.slice(5, 7)) === i + 1)
    return { month: i + 1, value: metric === 'count' ? m.length : metric === 'hours' ? m.reduce((s, w) => s + w.mins, 0) / 60 : m.reduce((s, w) => s + w.vol, 0) / 1000 }
  })
  const bestMonth = monthly.reduce((b, m) => (m.value > b.value ? m : b), monthly[0])
  const bvol = [...items].sort((x, y) => y.vol - x.vol)[0]
  const blong = [...items].sort((x, y) => y.dist - x.dist)[0]
  const unit = metric === 'count' ? 'treinos' : metric === 'hours' ? 'h' : 't'
  return {
    period: { year, label: `${year}${year === Number(today.slice(0, 4)) ? ', até aqui' : ''}` },
    previous: { label: String(year - 1) },
    kpis: [
      { key: 'workouts', label: 'Treinos', value: a.count, prev: p.count },
      { key: 'hours', label: 'Horas', value: a.hours, unit: 'h', decimals: 0, prev: p.hours },
      { key: 'volume', label: 'Carga levantada', value: a.vol, unit: 't', decimals: 0, prev: p.vol },
      { key: 'distance', label: 'Distância', value: a.dist, unit: 'km', decimals: 0, prev: p.dist },
      { key: 'active_days', label: 'Dias ativos', value: a.days, prev: p.days },
      { key: 'avg_rating', label: 'Nota média', value: a.avg, decimals: 1, prev: p.avg || null, absoluteDelta: true },
    ],
    daily: items.map((w) => ({ date: w.date, value: w.mins })),
    monthly,
    monthlyUnit: unit,
    distribution: ratingDistribution(items.map((w) => w.rating)).map((d) => ({ bucket: String(d.value), count: d.count })),
    rankings: {
      types: { title: 'Tipos que mais treinou', items: topN(items, (w) => w.type, 4) },
      places: { title: 'Onde você mais treina', items: topN(items, (w) => w.place, 4) },
    },
    records: [
      { label: 'Maior sequência', value: `${st.best} dias`, detail: 'dias corridos seguidos' },
      { label: 'Sequência atual', value: `${st.current} dias`, detail: 'vale até ontem' },
      { label: 'Melhor semana', value: `${bestWeek ? bestWeek[1] : 0} treinos`, detail: bestWeek ? `semana de ${fmtDate(bestWeek[0])}` : undefined },
      { label: 'Maior carga', value: bvol?.vol ? `${fmtNumber(bvol.vol / 1000, 1)} t` : '—', detail: bvol ? `${bvol.title} · ${fmtDate(bvol.date)}` : undefined },
      { label: 'Corrida mais longa', value: blong?.dist ? `${fmtNumber(blong.dist, 1)} km` : '—', detail: blong?.dist ? fmtDate(blong.date) : undefined },
      { label: 'Melhor mês', value: MONTHS_LONG[bestMonth.month - 1], detail: `${fmtNumber(bestMonth.value, metric === 'count' ? 0 : 1)} ${unit}` },
    ],
    moments: items.filter((w) => w.rating >= 5).slice(0, 3).map((w) => ({ id: w.id, title: w.title, subtitle: `${w.type} · ${w.place}`, rating: w.rating })),
  }
}

export function weekSummary(all: Workout[], today: string) {
  const mon = mondayOf(today)
  const done = all.filter((w) => w.status === 'done' && w.date >= mon && w.date <= today)
  return { count: done.length, goal: 4 }
}

export function fmtWorkoutMeta(w: Workout): string {
  return `${fmtDuration(w.mins)}${w.vol ? ` · ${fmtNumber(w.vol / 1000, 1)} t` : ''}${w.dist ? ` · ${fmtNumber(w.dist, 1)} km` : ''}`
}

/** Aviso padrão das navegações simuladas da demonstração. */
export function demoNavToast(name: string, route: string): void {
  toast(`No app, abriria ${name} (${route}) sem recarregar a página.`)
}

