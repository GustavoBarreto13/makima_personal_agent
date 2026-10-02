import { describe, it, expect } from 'vitest'
import {
  activeChips, clearChip, clearFilters, defaultState, defineCollection, hasActiveFilters, normalizeState, queryToState,
  runCollection, stateToQuery, tagOptions, type CollectionSchema, type TagsFacet,
} from './collection'

interface Item { id: number; title: string; type: string; tags: string[]; rating: number | null; date: string; fav: boolean }

const TODAY = '2026-10-02'
const items: Item[] = [
  { id: 1, title: 'Peito e tríceps', type: 'Força', tags: ['peito'], rating: 4.5, date: '2026-10-01', fav: true },
  { id: 2, title: 'Rodagem leve', type: 'Corrida', tags: ['cardio'], rating: 3, date: '2026-09-28', fav: false },
  { id: 3, title: 'Pernas pesadas', type: 'Força', tags: ['pernas', 'pr'], rating: 5, date: '2026-08-10', fav: true },
  { id: 4, title: 'Yoga flow', type: 'Mobilidade', tags: [], rating: null, date: '2025-12-20', fav: false },
]

const schema: CollectionSchema<Item> = defineCollection<Item>({
  scope: 'test:items',
  search: (i) => [i.title, i.type],
  facets: [
    { kind: 'enum', id: 'type', label: 'Tipo', options: [{ value: 'Força' }, { value: 'Corrida' }, { value: 'Mobilidade' }], get: (i) => i.type },
    { kind: 'tags', id: 'tags', label: 'Etiqueta', get: (i) => i.tags },
    { kind: 'range', id: 'rating', label: 'Nota', min: 0, max: 5, step: 0.5, display: 'stars', get: (i) => i.rating },
    { kind: 'dateRange', id: 'date', label: 'Período', buckets: ['last7', 'last30', 'last90', 'thisYear', 'all'], defaultBucket: 'last90', get: (i) => i.date },
    { kind: 'flag', id: 'fav', label: 'Só favoritos', get: (i) => i.fav },
  ],
  groups: [{ id: 'type', label: 'Tipo', key: (i) => i.type }],
  sorts: [
    { id: 'recent', label: 'Recentes', value: (i) => i.date },
    { id: 'rating', label: 'Nota', value: (i) => i.rating ?? 0 },
  ],
})

const run = (s = defaultState(schema)) => runCollection(schema, s, items, TODAY)
const ids = (r: ReturnType<typeof run>) => r.items.map((i) => i.id)

describe('coleção: filtros', () => {
  it('padrão: janela de 90 dias, ordenado por recentes (decrescente)', () => {
    expect(ids(run())).toEqual([1, 2, 3])
  })
  it('enum multi-seleção', () => {
    const s = defaultState(schema)
    s.facets.type = { values: { Corrida: true, Mobilidade: true } }
    s.facets.date = { bucket: 'all' }
    expect(ids(run(s))).toEqual([2, 4])
  })
  it('etiquetas: tem / não tem', () => {
    const s = defaultState(schema)
    s.facets.tags = { values: { pr: true }, mode: 'has' }
    expect(ids(run(s))).toEqual([3])
    s.facets.tags = { values: { pr: true }, mode: 'nothas' }
    expect(ids(run(s))).toEqual([1, 2])
  })
  it('nota mínima ignora itens sem nota', () => {
    const s = defaultState(schema)
    s.facets.date = { bucket: 'all' }
    s.facets.rating = { min: 4 }
    expect(ids(run(s))).toEqual([1, 3])
  })
  it('atalhos de data', () => {
    const s = defaultState(schema)
    s.facets.date = { bucket: 'last7' }
    expect(ids(run(s))).toEqual([1, 2])
    s.facets.date = { bucket: 'thisYear' }
    expect(ids(run(s))).toEqual([1, 2, 3])
    s.facets.date = { bucket: 'all' }
    expect(ids(run(s))).toEqual([1, 2, 3, 4])
  })
  it('flag e busca de texto', () => {
    const s = defaultState(schema)
    s.facets.fav = { flag: true }
    expect(ids(run(s))).toEqual([1, 3])
    s.q = 'perna'
    expect(ids(run(s))).toEqual([3])
  })
  it('conta filtrados e total', () => {
    const s = defaultState(schema)
    s.facets.type = { values: { Corrida: true } }
    const r = run(s)
    expect(r.count).toBe(1)
    expect(r.total).toBe(4)
  })
})

describe('coleção: ordenar e agrupar', () => {
  it('ordena por nota, crescente e decrescente', () => {
    const s = defaultState(schema)
    s.facets.date = { bucket: 'all' }
    s.sortBy = 'rating'
    s.dir = 'desc'
    expect(ids(run(s))).toEqual([3, 1, 2, 4])
    s.dir = 'asc'
    expect(ids(run(s))).toEqual([4, 2, 1, 3])
  })
  it('agrupa preservando a ordem de aparição', () => {
    const s = defaultState(schema)
    s.groupBy = 'type'
    const r = run(s)
    expect(r.groups.map((g) => g.key)).toEqual(['Força', 'Corrida'])
    expect(r.groups[0].items.map((i) => i.id)).toEqual([1, 3])
  })
  it('sem grupo devolve um bloco único', () => {
    expect(run().groups).toHaveLength(1)
  })
  it('exige ao menos uma ordenação', () => {
    expect(() => defineCollection<Item>({ ...schema, sorts: [] })).toThrow()
  })
})

describe('coleção: chips de filtros ativos', () => {
  it('só mostra o que difere do padrão', () => {
    expect(activeChips(schema, defaultState(schema))).toEqual([])
    expect(hasActiveFilters(schema, defaultState(schema))).toBe(false)
  })
  it('gera, remove um a um e limpa tudo mantendo agrupar/ordenar', () => {
    let s = defaultState(schema)
    s.q = 'yoga'
    s.facets.type = { values: { Força: true, Corrida: true } }
    s.facets.rating = { min: 4 }
    s.facets.date = { bucket: 'last30' }
    s.groupBy = 'type'
    s.sortBy = 'rating'
    const chips = activeChips(schema, s)
    expect(chips.map((c) => c.label)).toEqual(['“yoga”', 'Força', 'Corrida', 'Nota ≥ 4.0', 'Últimos 30 dias'])
    s = clearChip(schema, s, chips[1])
    expect(activeChips(schema, s).map((c) => c.label)).not.toContain('Força')
    const cleared = clearFilters(schema, s)
    expect(activeChips(schema, cleared)).toEqual([])
    expect(cleared.groupBy).toBe('type')
    expect(cleared.sortBy).toBe('rating')
  })
})

describe('coleção: URL (filtros compartilháveis)', () => {
  it('estado padrão gera query vazia', () => {
    expect(stateToQuery(schema, defaultState(schema))).toBe('')
  })
  it('ida e volta preserva o estado', () => {
    const s = defaultState(schema)
    s.q = 'perna'
    s.facets.type = { values: { Força: true } }
    s.facets.tags = { values: { pr: true }, mode: 'nothas' }
    s.facets.rating = { min: 3.5 }
    s.facets.fav = { flag: true }
    s.facets.date = { bucket: 'thisYear' }
    s.groupBy = 'type'
    s.sortBy = 'rating'
    s.dir = 'asc'
    const back = queryToState(schema, stateToQuery(schema, s))
    expect(back).toEqual(s)
  })
  it('ignora valores inválidos vindos da URL', () => {
    const s = queryToState(schema, 'g=nada&s=nada&d=xx&f.date=semana')
    expect(s).toEqual(defaultState(schema))
  })
})

describe('coleção: persistência e opções', () => {
  it('normalizeState descarta agrupar/ordenar que o esquema não tem mais', () => {
    const s = normalizeState(schema, { groupBy: 'removido', sortBy: 'removido', dir: 'asc' })
    expect(s.groupBy).toBe('none')
    expect(s.sortBy).toBe('recent')
    expect(s.dir).toBe('asc')
  })
  it('tagOptions extrai as etiquetas dos itens, ordenadas', () => {
    expect(tagOptions(schema.facets[1] as TagsFacet<Item>, items)).toEqual(['cardio', 'peito', 'pernas', 'pr'])
  })
})
