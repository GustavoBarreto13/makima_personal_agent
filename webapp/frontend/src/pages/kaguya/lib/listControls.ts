// listControls — estado compartilhado da toolbar da Lista (agrupar / ordenar / filtrar).
//
// Um único objeto governa TODAS as visões de lista (ListScreen e GroupListScreen),
// persistido por escopo em localStorage (`kg:list:controls:<scope>`). O <ListSection>
// aplica tudo client-side; o <ListFilterSheet> edita as facetas.
//
// Fatia 025 / Rodada 2 — mesmo visual e mesmas capacidades em toda lista.

import { useCallback, useEffect, useState } from 'react'
import type { GtdStatus, Task } from '../types'
import { diffDays, todayISO } from './dateUtils'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type GroupBy = 'none' | 'priority' | 'due' | 'tag' | 'assignee' | 'gtd'
export type SortBy = 'manual' | 'due' | 'priority' | 'recent'
export type DueBucket = 'overdue' | 'today' | 'next7' | 'nodate' | 'range'
export type TagMode = 'has' | 'nothas'
export type StatusFilter = 'open' | 'done' | 'all'
export type FlagKey = 'subtasks' | 'recurring' | 'description' | 'myday'

export interface ListFilters {
  status: StatusFilter
  prio: Record<string, boolean>          // multi-seleção: { '3': true, '2': true }
  due: DueBucket | null
  from: string                            // "AAAA-MM-DD" (só quando due === 'range')
  to: string
  tags: Record<string, boolean>           // por nome de tag
  tagsMode: TagMode
  people: Record<string, boolean>         // por id de responsável (Komi)
  text: string
  gtd: GtdStatus | null
  flags: Record<FlagKey, boolean>
}

export interface ListControls {
  groupBy: GroupBy
  sortBy: SortBy
  filters: ListFilters
}

// ── Padrões ───────────────────────────────────────────────────────────────────

export function defaultFilters(): ListFilters {
  return {
    status: 'open', prio: {}, due: null, from: '', to: '',
    tags: {}, tagsMode: 'has', people: {}, text: '', gtd: null,
    flags: { subtasks: false, recurring: false, description: false, myday: false },
  }
}

export function defaultControls(): ListControls {
  return { groupBy: 'none', sortBy: 'manual', filters: defaultFilters() }
}

// ── Persistência por escopo ───────────────────────────────────────────────────

const key = (scope: string) => `kg:list:controls:${scope}`

function read(scope: string): ListControls {
  try {
    const raw = localStorage.getItem(key(scope))
    if (!raw) return defaultControls()
    const parsed = JSON.parse(raw) as Partial<ListControls>
    const d = defaultControls()
    return {
      groupBy: parsed.groupBy ?? d.groupBy,
      sortBy: parsed.sortBy ?? d.sortBy,
      filters: { ...d.filters, ...(parsed.filters ?? {}), flags: { ...d.filters.flags, ...(parsed.filters?.flags ?? {}) } },
    }
  } catch { return defaultControls() }
}

function write(scope: string, c: ListControls) {
  try { localStorage.setItem(key(scope), JSON.stringify(c)) } catch { /* ignore */ }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseListControls extends ListControls {
  setGroupBy: (g: GroupBy) => void
  setSortBy: (s: SortBy) => void
  patchFilters: (p: Partial<ListFilters>) => void
  clearFilters: () => void
  hasActiveFilters: boolean
}

/** Estado da toolbar lembrado por `scope` (ex.: "list-42" ou "grouplist-7"). */
export function useListControls(scope: string): UseListControls {
  const [state, setState] = useState<ListControls>(() => read(scope))

  // Ao trocar de lista/grupo (scope muda sem remontar), relê as preferências daquele escopo.
  useEffect(() => { setState(read(scope)) }, [scope])

  const commit = useCallback((next: ListControls) => {
    setState(next)
    write(scope, next)
  }, [scope])

  const setGroupBy = useCallback((g: GroupBy) => {
    setState(prev => {
      // "Manual" e agrupamento são incompatíveis — ao agrupar, sobe para "Vencimento".
      const sortBy: SortBy = g !== 'none' && prev.sortBy === 'manual' ? 'due' : prev.sortBy
      const next = { ...prev, groupBy: g, sortBy }
      write(scope, next)
      return next
    })
  }, [scope])

  const setSortBy = useCallback((s: SortBy) => {
    setState(prev => {
      if (s === 'manual' && prev.groupBy !== 'none') return prev  // bloqueado enquanto agrupado
      const next = { ...prev, sortBy: s }
      write(scope, next)
      return next
    })
  }, [scope])

  const patchFilters = useCallback((p: Partial<ListFilters>) => {
    setState(prev => {
      const next = { ...prev, filters: { ...prev.filters, ...p } }
      write(scope, next)
      return next
    })
  }, [scope])

  const clearFilters = useCallback(() => {
    commit({ ...state, filters: defaultFilters() })
  }, [commit, state])

  return {
    ...state,
    setGroupBy, setSortBy, patchFilters, clearFilters,
    hasActiveFilters: isFiltered(state.filters),
  }
}

// ── Lógica pura de filtro / agrupamento (usada pelo <ListSection>) ────────────

export function isFiltered(f: ListFilters): boolean {
  return (
    f.status !== 'open' ||
    Object.values(f.prio).some(Boolean) ||
    f.due !== null ||
    Object.values(f.tags).some(Boolean) ||
    Object.values(f.people).some(Boolean) ||
    f.text.trim() !== '' ||
    f.gtd !== null ||
    Object.values(f.flags).some(Boolean)
  )
}

/** Aplica todas as facetas a uma tarefa-raiz. Subtarefas seguem a raiz. */
export function passesFilters(t: Task, f: ListFilters, hasChildren: boolean): boolean {
  const done = t.completed_at !== null
  if (f.status === 'open' && done) return false
  if (f.status === 'done' && !done) return false

  const prioKeys = Object.keys(f.prio).filter(k => f.prio[k])
  if (prioKeys.length && !prioKeys.includes(String(t.priority ?? 0))) return false

  if (f.due) {
    const d = t.due_date
    if (f.due === 'overdue') { if (!d || diffDays(d) >= 0) return false }
    else if (f.due === 'today') { if (d !== todayISO()) return false }
    else if (f.due === 'next7') { if (!d) return false; const n = diffDays(d); if (n < 0 || n > 7) return false }
    else if (f.due === 'nodate') { if (d) return false }
    else if (f.due === 'range') {
      if (!d) return false
      if (f.from && d < f.from) return false
      if (f.to && d > f.to) return false
    }
  }

  const tagKeys = Object.keys(f.tags).filter(k => f.tags[k])
  if (tagKeys.length) {
    const names = (t.tags ?? []).map(x => x.name)
    const hasAny = tagKeys.some(k => names.includes(k))
    if (f.tagsMode === 'has' && !hasAny) return false
    if (f.tagsMode === 'nothas' && hasAny) return false
  }

  const peopleKeys = Object.keys(f.people).filter(k => f.people[k])
  if (peopleKeys.length) {
    const ids = (t.assignees ?? []).map(a => a.id)
    if (!peopleKeys.some(k => ids.includes(k))) return false
  }

  if (f.text.trim() && !t.title.toLowerCase().includes(f.text.trim().toLowerCase())) return false

  if (f.gtd && t.gtd_status !== f.gtd) return false

  if (f.flags.subtasks && !hasChildren) return false
  if (f.flags.recurring && !t.recurrence?.active) return false
  if (f.flags.description && !(t.description && t.description.trim())) return false
  if (f.flags.myday && !t.my_day_date) return false

  return true
}
