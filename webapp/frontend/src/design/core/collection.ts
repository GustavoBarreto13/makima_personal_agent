// Motor de coleções — filtrar, agrupar e ordenar listas de qualquer domínio.
// Portado da lógica de pages/kaguya/lib/listControls.ts, mas sem saber o que é "tarefa":
// cada domínio descreve um ESQUEMA de facetas (defineCollection). TypeScript puro, sem DOM.
//
// Regras do padrão: toda tela com lista/grade de itens usa este motor. No mínimo: busca + uma faceta
// de status/tipo + uma data + ordenação por 2 campos.

import { dayNumber, todayISO } from './format'

// ── facetas ──────────────────────────────────────────────────────────────────

export type DateBucket = 'last7' | 'last30' | 'last90' | 'thisYear' | 'all'

interface FacetBase {
  id: string
  label: string
}

/** Escolha entre opções (multi-seleção por padrão). */
export interface EnumFacet<T> extends FacetBase {
  kind: 'enum'
  options: { value: string; label?: string }[]
  get: (item: T) => string
}

/** Etiquetas livres, com modo "tem / não tem". Opções vêm dos próprios itens. */
export interface TagsFacet<T> extends FacetBase {
  kind: 'tags'
  get: (item: T) => string[]
}

/** Valor numérico com mínimo (ex.: nota mínima). */
export interface RangeFacet<T> extends FacetBase {
  kind: 'range'
  get: (item: T) => number | null
  min: number
  max: number
  step: number
  /** Como o controle é desenhado. */
  display: 'stars' | 'slider'
}

/** Janela de datas por atalhos (últimos 7/30/90 dias, este ano, tudo). */
export interface DateFacet<T> extends FacetBase {
  kind: 'dateRange'
  get: (item: T) => string
  buckets: DateBucket[]
  /** Padrão do esquema (não conta como "filtro ativo"). */
  defaultBucket: DateBucket
}

/** Liga/desliga (ex.: só favoritos, só recordes). */
export interface FlagFacet<T> extends FacetBase {
  kind: 'flag'
  get: (item: T) => boolean
}

/** Pessoas da Komi, por id. */
export interface PeopleFacet<T> extends FacetBase {
  kind: 'people'
  get: (item: T) => string[]
}

export type Facet<T> = EnumFacet<T> | TagsFacet<T> | RangeFacet<T> | DateFacet<T> | FlagFacet<T> | PeopleFacet<T>

export interface GroupDef<T> {
  id: string
  label: string
  key: (item: T) => string
}

export interface SortDef<T> {
  id: string
  label: string
  value: (item: T) => number | string
}

export interface CollectionSchema<T> {
  /** Escopo de persistência, ex.: "frieren:library". */
  scope: string
  /** Textos pesquisáveis do item. */
  search: (item: T) => string[]
  facets: Facet<T>[]
  groups: GroupDef<T>[]
  sorts: SortDef<T>[]
  defaults?: Partial<Pick<CollectionState, 'groupBy' | 'sortBy' | 'dir'>>
}

// ── estado ───────────────────────────────────────────────────────────────────

export interface FacetValue {
  /** enum / tags / people: valores marcados. */
  values?: Record<string, boolean>
  /** tags: "tem" ou "não tem". */
  mode?: 'has' | 'nothas'
  /** range: mínimo escolhido (0 = sem filtro). */
  min?: number
  /** dateRange: atalho escolhido. */
  bucket?: DateBucket
  /** flag. */
  flag?: boolean
}

export interface CollectionState {
  q: string
  facets: Record<string, FacetValue>
  groupBy: string
  sortBy: string
  dir: 'asc' | 'desc'
}

export function defineCollection<T>(schema: CollectionSchema<T>): CollectionSchema<T> {
  if (!schema.sorts.length) throw new Error(`Coleção ${schema.scope}: declare ao menos 1 ordenação`)
  return schema
}

export function defaultState<T>(schema: CollectionSchema<T>): CollectionState {
  const facets: Record<string, FacetValue> = {}
  for (const f of schema.facets) {
    if (f.kind === 'dateRange') facets[f.id] = { bucket: f.defaultBucket }
  }
  return {
    q: '',
    facets,
    groupBy: schema.defaults?.groupBy ?? 'none',
    sortBy: schema.defaults?.sortBy ?? schema.sorts[0].id,
    dir: schema.defaults?.dir ?? 'desc',
  }
}

/** Mescla um estado salvo com os padrões atuais (esquemas mudam; o salvo pode estar defasado). */
export function normalizeState<T>(schema: CollectionSchema<T>, saved: Partial<CollectionState> | null | undefined): CollectionState {
  const d = defaultState(schema)
  if (!saved) return d
  const facets = { ...d.facets }
  for (const f of schema.facets) {
    const v = saved.facets?.[f.id]
    if (v) facets[f.id] = { ...facets[f.id], ...v }
  }
  const groupOk = saved.groupBy === 'none' || schema.groups.some((g) => g.id === saved.groupBy)
  const sortOk = schema.sorts.some((s) => s.id === saved.sortBy)
  return {
    q: '',
    facets,
    groupBy: groupOk && saved.groupBy ? saved.groupBy : d.groupBy,
    sortBy: sortOk && saved.sortBy ? saved.sortBy : d.sortBy,
    dir: saved.dir === 'asc' || saved.dir === 'desc' ? saved.dir : d.dir,
  }
}

// ── filtragem ────────────────────────────────────────────────────────────────

const selected = (v?: Record<string, boolean>): string[] => Object.keys(v ?? {}).filter((k) => v?.[k])

function bucketMaxAge(b: DateBucket): number | null {
  return b === 'last7' ? 7 : b === 'last30' ? 30 : b === 'last90' ? 90 : null
}

function passesFacet<T>(f: Facet<T>, v: FacetValue | undefined, item: T, today: string): boolean {
  if (!v) return true
  switch (f.kind) {
    case 'enum': {
      const sel = selected(v.values)
      return !sel.length || sel.includes(f.get(item))
    }
    case 'tags': {
      const sel = selected(v.values)
      if (!sel.length) return true
      const has = sel.some((t) => f.get(item).includes(t))
      return v.mode === 'nothas' ? !has : has
    }
    case 'people': {
      const sel = selected(v.values)
      return !sel.length || sel.some((p) => f.get(item).includes(p))
    }
    case 'range': {
      if (!v.min) return true
      const x = f.get(item)
      return x !== null && x >= v.min
    }
    case 'flag':
      return !v.flag || f.get(item)
    case 'dateRange': {
      const b = v.bucket ?? f.defaultBucket
      if (b === 'all') return true
      const date = f.get(item)
      if (b === 'thisYear') return date.slice(0, 4) === today.slice(0, 4)
      const max = bucketMaxAge(b) as number
      return dayNumber(today) - dayNumber(date) <= max
    }
  }
}

export function filterItems<T>(schema: CollectionSchema<T>, state: CollectionState, items: T[], today: string = todayISO()): T[] {
  const q = state.q.trim().toLowerCase()
  return items.filter((item) => {
    for (const f of schema.facets) if (!passesFacet(f, state.facets[f.id], item, today)) return false
    if (q && !schema.search(item).join(' ').toLowerCase().includes(q)) return false
    return true
  })
}

export function sortItems<T>(schema: CollectionSchema<T>, state: CollectionState, items: T[]): T[] {
  const def = schema.sorts.find((s) => s.id === state.sortBy) ?? schema.sorts[0]
  const sign = state.dir === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    const x = def.value(a)
    const y = def.value(b)
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign
    return String(x).localeCompare(String(y), 'pt-BR') * sign
  })
}

export interface Group<T> {
  key: string
  items: T[]
}

/** Agrupa preservando a ordem de primeira aparição (a lista já vem ordenada). */
export function groupItems<T>(schema: CollectionSchema<T>, state: CollectionState, items: T[]): Group<T>[] {
  const def = schema.groups.find((g) => g.id === state.groupBy)
  if (!def) return [{ key: '', items }]
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = def.key(item)
    const arr = map.get(k)
    if (arr) arr.push(item)
    else map.set(k, [item])
  }
  return [...map.entries()].map(([key, arr]) => ({ key, items: arr }))
}

export interface CollectionResult<T> {
  /** Itens filtrados e ordenados. */
  items: T[]
  groups: Group<T>[]
  /** Quantos passaram nos filtros. */
  count: number
  /** Total sem filtros. */
  total: number
}

export function runCollection<T>(schema: CollectionSchema<T>, state: CollectionState, all: T[], today: string = todayISO()): CollectionResult<T> {
  const filtered = filterItems(schema, state, all, today)
  const items = sortItems(schema, state, filtered)
  return { items, groups: groupItems(schema, state, items), count: items.length, total: all.length }
}

// ── chips de filtros ativos ──────────────────────────────────────────────────

export interface ActiveChip {
  /** Faceta de origem ('q' para a busca). */
  facetId: string
  /** Valor específico (enum/tags/people), quando aplicável. */
  value?: string
  label: string
}

export function activeChips<T>(schema: CollectionSchema<T>, state: CollectionState): ActiveChip[] {
  const out: ActiveChip[] = []
  if (state.q.trim()) out.push({ facetId: 'q', label: `“${state.q.trim()}”` })
  for (const f of schema.facets) {
    const v = state.facets[f.id]
    if (!v) continue
    if (f.kind === 'enum') {
      for (const k of selected(v.values)) out.push({ facetId: f.id, value: k, label: f.options.find((o) => o.value === k)?.label ?? k })
    } else if (f.kind === 'tags') {
      for (const k of selected(v.values)) out.push({ facetId: f.id, value: k, label: `${v.mode === 'nothas' ? 'sem #' : '#'}${k}` })
    } else if (f.kind === 'people') {
      for (const k of selected(v.values)) out.push({ facetId: f.id, value: k, label: `${f.label}: ${k}` })
    } else if (f.kind === 'range' && v.min) {
      out.push({ facetId: f.id, label: `${f.label} ≥ ${v.min.toFixed(1)}` })
    } else if (f.kind === 'flag' && v.flag) {
      out.push({ facetId: f.id, label: f.label })
    } else if (f.kind === 'dateRange' && v.bucket && v.bucket !== f.defaultBucket) {
      out.push({ facetId: f.id, label: BUCKET_LABEL[v.bucket] })
    }
  }
  return out
}

export const BUCKET_LABEL: Record<DateBucket, string> = {
  last7: 'Últimos 7 dias',
  last30: 'Últimos 30 dias',
  last90: 'Últimos 90 dias',
  thisYear: 'Este ano',
  all: 'Tudo',
}

/** Remove um chip (retorna novo estado). */
export function clearChip<T>(schema: CollectionSchema<T>, state: CollectionState, chip: ActiveChip): CollectionState {
  if (chip.facetId === 'q') return { ...state, q: '' }
  const f = schema.facets.find((x) => x.id === chip.facetId)
  if (!f) return state
  const facets = { ...state.facets }
  const cur = { ...(facets[f.id] ?? {}) }
  if (f.kind === 'enum' || f.kind === 'tags' || f.kind === 'people') {
    const values = { ...(cur.values ?? {}) }
    if (chip.value !== undefined) delete values[chip.value]
    cur.values = values
  } else if (f.kind === 'range') cur.min = 0
  else if (f.kind === 'flag') cur.flag = false
  else if (f.kind === 'dateRange') cur.bucket = f.defaultBucket
  facets[f.id] = cur
  return { ...state, facets }
}

/** Limpa todos os filtros, mantendo agrupar/ordenar. */
export function clearFilters<T>(schema: CollectionSchema<T>, state: CollectionState): CollectionState {
  const d = defaultState(schema)
  return { ...d, groupBy: state.groupBy, sortBy: state.sortBy, dir: state.dir }
}

export function hasActiveFilters<T>(schema: CollectionSchema<T>, state: CollectionState): boolean {
  return activeChips(schema, state).length > 0
}

// ── URL: filtros e ordenação em query string (compartilhável, e vira deep link no app) ─────

export function stateToQuery<T>(schema: CollectionSchema<T>, state: CollectionState): string {
  const p = new URLSearchParams()
  const d = defaultState(schema)
  if (state.q.trim()) p.set('q', state.q.trim())
  if (state.groupBy !== d.groupBy) p.set('g', state.groupBy)
  if (state.sortBy !== d.sortBy) p.set('s', state.sortBy)
  if (state.dir !== d.dir) p.set('d', state.dir)
  for (const f of schema.facets) {
    const v = state.facets[f.id]
    if (!v) continue
    if (f.kind === 'enum' || f.kind === 'tags' || f.kind === 'people') {
      const sel = selected(v.values)
      if (sel.length) p.set(`f.${f.id}`, sel.join(','))
      if (f.kind === 'tags' && v.mode === 'nothas') p.set(`m.${f.id}`, 'nothas')
    } else if (f.kind === 'range' && v.min) p.set(`f.${f.id}`, String(v.min))
    else if (f.kind === 'flag' && v.flag) p.set(`f.${f.id}`, '1')
    else if (f.kind === 'dateRange' && v.bucket && v.bucket !== f.defaultBucket) p.set(`f.${f.id}`, v.bucket)
  }
  return p.toString()
}

export function queryToState<T>(schema: CollectionSchema<T>, query: string): CollectionState {
  const p = new URLSearchParams(query)
  const s = defaultState(schema)
  s.q = p.get('q') ?? ''
  const g = p.get('g')
  if (g && (g === 'none' || schema.groups.some((x) => x.id === g))) s.groupBy = g
  const so = p.get('s')
  if (so && schema.sorts.some((x) => x.id === so)) s.sortBy = so
  const dir = p.get('d')
  if (dir === 'asc' || dir === 'desc') s.dir = dir
  for (const f of schema.facets) {
    const raw = p.get(`f.${f.id}`)
    if (raw === null) continue
    if (f.kind === 'enum' || f.kind === 'tags' || f.kind === 'people') {
      const values: Record<string, boolean> = {}
      raw.split(',').filter(Boolean).forEach((k) => (values[k] = true))
      s.facets[f.id] = f.kind === 'tags' ? { values, mode: p.get(`m.${f.id}`) === 'nothas' ? 'nothas' : 'has' } : { values }
    } else if (f.kind === 'range') s.facets[f.id] = { min: Number(raw) || 0 }
    else if (f.kind === 'flag') s.facets[f.id] = { flag: raw === '1' }
    else if (f.kind === 'dateRange' && (f.buckets as string[]).includes(raw)) s.facets[f.id] = { bucket: raw as DateBucket }
  }
  return s
}

/** Opções de uma faceta de etiquetas, extraídas dos itens (ordenadas). */
export function tagOptions<T>(facet: TagsFacet<T>, items: T[]): string[] {
  const set = new Set<string>()
  for (const i of items) facet.get(i).forEach((t) => set.add(t))
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
