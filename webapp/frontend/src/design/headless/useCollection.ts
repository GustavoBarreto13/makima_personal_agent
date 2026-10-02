// useCollection — liga o motor core/collection a uma lista de itens.
// Filtra, agrupa e ordena no cliente (como a lista da Kaguya), persiste o estado em
// `ds:collection:<scope>` e, opcionalmente, espelha filtros/ordenação na URL (compartilhável).
// A busca (q) nunca é persistida.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  activeChips, clearChip, clearFilters, defaultState, normalizeState, queryToState, runCollection, stateToQuery,
  type ActiveChip, type CollectionResult, type CollectionSchema, type CollectionState, type DateBucket, type FacetValue,
} from '../core/collection'
import { readJSON, writeJSON, type Storage } from '../core/ports'
import { todayISO } from '../core/format'
import { webStorage } from './web'

export interface UseCollectionOptions {
  storage?: Storage
  /** Persistir o estado (padrão true). */
  persist?: boolean
  /** Espelhar filtros e ordenação na query string da URL (padrão false). */
  syncUrl?: boolean
  /** Data de hoje (testes). */
  today?: string
}

export interface UseCollection<T> {
  state: CollectionState
  result: CollectionResult<T>
  chips: ActiveChip[]
  hasActive: boolean
  setQ: (q: string) => void
  setGroup: (id: string) => void
  setSort: (id: string) => void
  toggleDir: () => void
  /** Marca/desmarca um valor de faceta enum, tags ou people. */
  toggleValue: (facetId: string, value: string) => void
  setTagMode: (facetId: string, mode: 'has' | 'nothas') => void
  setBucket: (facetId: string, bucket: DateBucket) => void
  setMin: (facetId: string, min: number) => void
  setFlag: (facetId: string, flag: boolean) => void
  removeChip: (chip: ActiveChip) => void
  clearAll: () => void
}

export function useCollection<T>(schema: CollectionSchema<T>, items: T[], opts: UseCollectionOptions = {}): UseCollection<T> {
  const storage = opts.storage ?? webStorage
  const persist = opts.persist !== false
  const key = `ds:collection:${schema.scope}`

  const [state, setState] = useState<CollectionState>(() => {
    if (opts.syncUrl && typeof window !== 'undefined' && window.location.search.length > 1) {
      return queryToState(schema, window.location.search.slice(1))
    }
    return persist ? normalizeState(schema, readJSON<Partial<CollectionState> | null>(storage, key, null)) : defaultState(schema)
  })

  useEffect(() => {
    if (persist) writeJSON(storage, key, { ...state, q: '' })
  }, [state, persist, storage, key])

  useEffect(() => {
    if (!opts.syncUrl || typeof window === 'undefined') return
    const q = stateToQuery(schema, state)
    const url = `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`
    window.history.replaceState(window.history.state, '', url)
  }, [state, schema, opts.syncUrl])

  const today = opts.today ?? todayISO()
  const result = useMemo(() => runCollection(schema, state, items, today), [schema, state, items, today])
  const chips = useMemo(() => activeChips(schema, state), [schema, state])

  const patchFacet = useCallback((id: string, patch: Partial<FacetValue>) => {
    setState((s) => ({ ...s, facets: { ...s.facets, [id]: { ...(s.facets[id] ?? {}), ...patch } } }))
  }, [])

  return {
    state,
    result,
    chips,
    hasActive: chips.length > 0,
    setQ: (q) => setState((s) => ({ ...s, q })),
    setGroup: (groupBy) => setState((s) => ({ ...s, groupBy })),
    setSort: (sortBy) => setState((s) => ({ ...s, sortBy })),
    toggleDir: () => setState((s) => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' })),
    toggleValue: (facetId, value) =>
      setState((s) => {
        const cur = s.facets[facetId] ?? {}
        const values = { ...(cur.values ?? {}) }
        values[value] = !values[value]
        return { ...s, facets: { ...s.facets, [facetId]: { ...cur, values } } }
      }),
    setTagMode: (facetId, mode) => patchFacet(facetId, { mode }),
    setBucket: (facetId, bucket) => patchFacet(facetId, { bucket }),
    setMin: (facetId, min) => patchFacet(facetId, { min }),
    setFlag: (facetId, flag) => patchFacet(facetId, { flag }),
    removeChip: (chip) => setState((s) => clearChip(schema, s, chip)),
    clearAll: () => setState((s) => clearFilters(schema, s)),
  }
}
