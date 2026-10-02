// Estatísticas / Rewind — contrato de dados (StatsPayload) e cálculos puros. Sem DOM.
//
// Cada domínio expõe `GET /api/<domínio>/stats?year=&month=` devolvendo um StatsPayload; os
// componentes <KpiGrid>, <Heatmap>, <BarSeries>, <Distribution>, <RankList> e <RecordList> o consomem.
// Os cálculos abaixo são o que o backend (ou o front, enquanto o endpoint não existe) deve respeitar:
//   - datas sempre no fuso do usuário (America/Sao_Paulo); nunca CURRENT_DATE / date.today() / UTC;
//   - itens apagados (soft-delete) fora da conta;
//   - métrica "do ano" filtra pelo ano (nada all-time num tile anual);
//   - sequências em dias corridos; a atual vale até ontem.

import { dayNumber, MONTHS_SHORT, parseISODate, pad2, isoDate } from './format'

// ── contrato ─────────────────────────────────────────────────────────────────

export interface StatsKpi {
  key: string
  label: string
  value: number
  unit?: string
  decimals?: number
  /** Mesmo período do ano anterior (null = sem base). */
  prev?: number | null
  /** Diferença absoluta em vez de percentual (ex.: nota média). */
  absoluteDelta?: boolean
}

export interface DailyPoint { date: string; value: number }
export interface MonthlyPoint { month: number; value: number }
export interface DistributionBucket { bucket: string; count: number }
export interface RankItem { label: string; count: number; image?: string }
export interface RecordItem { label: string; value: string; detail?: string }
export interface MomentItem { id: string | number; title: string; subtitle?: string; image?: string; rating?: number }

export interface StatsPayload {
  period: { year: number; month?: number | null; label: string }
  previous?: { label: string } | null
  kpis: StatsKpi[]
  daily: DailyPoint[]
  monthly: MonthlyPoint[]
  /** Unidade da série mensal (ex.: "treinos", "episódios"). */
  monthlyUnit: string
  distribution: DistributionBucket[]
  rankings: Record<string, { title: string; items: RankItem[] }>
  records: RecordItem[]
  moments: MomentItem[]
}

// ── delta ────────────────────────────────────────────────────────────────────

export interface Delta {
  /** null = sem base de comparação. */
  value: number | null
  direction: 'up' | 'down' | 'flat'
  kind: 'percent' | 'absolute'
}

export function computeDelta(current: number, previous: number | null | undefined, absolute = false): Delta {
  const kind = absolute ? 'absolute' : 'percent'
  if (previous === null || previous === undefined || (!absolute && previous === 0)) return { value: null, direction: 'flat', kind }
  const value = absolute ? current - previous : ((current - previous) / previous) * 100
  const eps = absolute ? 0.05 : 1
  const direction = Math.abs(value) < eps ? 'flat' : value > 0 ? 'up' : 'down'
  return { value, direction, kind }
}

// ── sequências (dias corridos) ───────────────────────────────────────────────

export interface Streaks { best: number; current: number }

/** Maior sequência e sequência atual. A atual vale até ontem (hoje sem registro ainda não quebra). */
export function computeStreaks(dates: string[], today: string): Streaks {
  const days = [...new Set(dates)].map(dayNumber).sort((a, b) => a - b)
  let best = 0
  let run = 0
  let prev: number | null = null
  for (const d of days) {
    run = prev !== null && d - prev === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  const set = new Set(days)
  const t = dayNumber(today)
  let cursor = set.has(t) ? t : t - 1
  let current = 0
  while (set.has(cursor)) { current++; cursor-- }
  return { best, current }
}

// ── mapa de calor: um bloco por mês, como o da Frieren ───────────────────────

export interface HeatCell {
  date: string
  value: number
  level: 0 | 1 | 2 | 3 | 4
  future: boolean
}

export interface HeatMonth {
  /** 0 = janeiro. */
  month: number
  name: string
  /** Fluxo por colunas, 7 linhas (domingo a sábado). null = célula de alinhamento. */
  cells: (HeatCell | null)[]
}

/** Limites dos níveis 1..4 (valor mínimo de cada nível). Cada domínio ajusta à sua unidade. */
export type HeatThresholds = [number, number, number, number]

export function heatLevel(value: number, t: HeatThresholds): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0) return 0
  if (value < t[1]) return 1
  if (value < t[2]) return 2
  if (value < t[3]) return 3
  return 4
}

/**
 * Densifica a lista esparsa do backend (só dias com atividade) em todos os dias do ano, agrupa por
 * mês e alinha o dia 1 ao dia da semana certo. Datas locais, sem passar por UTC.
 */
export function buildHeatmapMonths(year: number, daily: DailyPoint[], today: string, thresholds: HeatThresholds = [1, 30, 60, 90]): HeatMonth[] {
  const byDate = new Map<string, number>()
  daily.forEach((d) => byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.value))
  const months: HeatMonth[] = []
  for (let m = 0; m < 12; m++) {
    const lead = new Date(year, m, 1).getDay()
    const n = new Date(year, m + 1, 0).getDate()
    const cells: (HeatCell | null)[] = Array.from({ length: lead }, () => null)
    for (let d = 1; d <= n; d++) {
      const date = `${year}-${pad2(m + 1)}-${pad2(d)}`
      const value = byDate.get(date) ?? 0
      cells.push({ date, value, level: heatLevel(value, thresholds), future: date > today })
    }
    while (cells.length % 7 !== 0) cells.push(null)
    months.push({ month: m, name: MONTHS_SHORT[m], cells })
  }
  return months
}

// ── distribuição de notas (0.5 a 5, sem perder nenhum valor) ─────────────────

/** Histograma de 5 a 0.5. Valores fora do passo de meia estrela são arredondados antes de contar. */
export function ratingDistribution(ratings: number[]): { value: number; count: number }[] {
  const buckets = new Map<number, number>()
  for (let v = 5; v >= 0.5; v -= 0.5) buckets.set(v, 0)
  for (const r of ratings) {
    if (!r || r <= 0) continue
    const v = Math.max(0.5, Math.min(5, Math.round(r * 2) / 2))
    buckets.set(v, (buckets.get(v) ?? 0) + 1)
  }
  return [...buckets.entries()].map(([value, count]) => ({ value, count }))
}

// ── rankings ─────────────────────────────────────────────────────────────────

/** Top N por contagem de itens DISTINTOS (passe ids únicos, não sessões, salvo quando o rótulo disser "sessões"). */
export function topN<T>(items: T[], label: (item: T) => string | string[], n = 5): RankItem[] {
  const counts = new Map<string, number>()
  for (const it of items) {
    const l = label(it)
    for (const k of Array.isArray(l) ? l : [l]) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .slice(0, n)
    .map(([label, count]) => ({ label, count }))
}

// ── períodos ─────────────────────────────────────────────────────────────────

/** Corte "mês-dia" para comparar o ano corrente com o mesmo trecho do anterior. */
export function cutoffFor(year: number, today: string): string {
  return year === Number(today.slice(0, 4)) ? today.slice(5) : '12-31'
}

/** Semana (segunda a domingo) de uma data: devolve a segunda-feira. */
export function mondayOf(date: string): string {
  const d = parseISODate(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return isoDate(d)
}
