import { describe, expect, it } from 'vitest'
import type { Filter, Group, Project } from '../types'
import { buildNav, navIdToRoute, routeToNavId, titleFor } from './nav'

const proj = (id: number, name: string, context: 'work' | 'personal', group_id: number | null = null, is_inbox = false): Project => ({
  id, name, group_id, color: null, icon: null, is_inbox, position: id, has_board: false, open_count: id, context,
})
const projects = [proj(1, 'Inbox', 'personal', null, true), proj(2, 'Sprint', 'work', 10), proj(3, 'Casa', 'personal', 11), proj(4, 'Solta', 'personal')]
const groups: Group[] = [{ id: 10, name: 'Empresa', position: 1, context: 'work' }, { id: 11, name: 'Vida', position: 2 }]
const filters = [{ id: 5, name: 'Urgentes' }] as Filter[]
const base = { projects, groups, filters, counts: { all: 9, today: 3, tomorrow: 1, next7: 4, inbox: 2 }, space: 'all' as const, hidden: [], pinned: [] }
const ids = (nav: ReturnType<typeof buildNav>) => nav.flatMap((s) => s.items.map((i) => i.id))

describe('buildNav', () => {
  it('seções na ordem e listas agrupadas', () => {
    const nav = buildNav(base)
    expect(nav.map((s) => s.label)).toEqual(['Planejar', 'Visões', 'Empresa', 'Vida', 'Listas', 'Vida', 'Registro'])
    expect(ids(nav)).toContain('list:2')
    expect(ids(nav)).toContain('filter:5')
    expect(ids(nav)).not.toContain('list:1') // a Inbox é uma visão fixa, não uma lista da sidebar
  })

  it('contagens: visões vêm de counts, listas de open_count', () => {
    const nav = buildNav(base)
    const get = (id: string) => nav.flatMap((s) => s.items).find((i) => i.id === id)!
    expect(get('date:inbox').count).toBe(2)
    expect(get('list:3').count).toBe(3)
  })

  it('espaço filtra as listas e some com grupos vazios', () => {
    const work = buildNav({ ...base, space: 'work' })
    expect(ids(work)).toContain('list:2')
    expect(ids(work)).not.toContain('list:3')
    expect(work.map((s) => s.label)).not.toContain('Listas')
    const personal = buildNav({ ...base, space: 'personal' })
    expect(ids(personal)).not.toContain('list:2')
    expect(personal.map((s) => s.label)).not.toContain('Empresa')
  })

  it('itens ocultos somem e seção vazia some junto', () => {
    const nav = buildNav({ ...base, hidden: ['habits', 'goals', 'experiments', 'focus', 'list:4'] })
    expect(ids(nav)).not.toContain('habits')
    expect(nav.filter((s) => s.label === 'Vida').length).toBe(1) // sobrou só o grupo "Vida" do usuário
    expect(nav.map((s) => s.label)).not.toContain('Listas')
  })

  it('fixados vão para o topo (e ignoram ids inexistentes)', () => {
    const nav = buildNav({ ...base, pinned: ['list:3', 'stats', 'list:999'] })
    expect(nav[0].label).toBe('Fixadas')
    expect(nav[0].items.map((i) => i.id)).toEqual(['list:3', 'stats'])
  })
})

describe('ids ↔ rotas', () => {
  it('ida e volta', () => {
    for (const id of ['today', 'calendar', 'date:next7', 'gtd:waiting', 'filter:5', 'list:12', 'group:3', 'stats']) {
      expect(routeToNavId(navIdToRoute(id))).toBe(id)
    }
  })
  it('o quadro e a lista de um grupo acendem o item da lista/grupo', () => {
    expect(routeToNavId({ view: 'kanban', id: 7 })).toBe('list:7')
    expect(routeToNavId({ view: 'group-list', id: 3 })).toBe('group:3')
  })
  it('títulos', () => {
    expect(titleFor({ view: 'today' }, projects, groups, filters)).toBe('Meu Dia')
    expect(titleFor({ view: 'list', id: 3 }, projects, groups, filters)).toBe('Casa')
    expect(titleFor({ view: 'filter', id: 5 }, projects, groups, filters)).toBe('Urgentes')
    expect(titleFor({ view: 'group', id: 10 }, projects, groups, filters)).toBe('Empresa')
  })
})
