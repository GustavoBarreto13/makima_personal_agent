import { describe, expect, it } from 'vitest'
import { orderViews, resolveSideDrop } from './sideDnd'
import type { Group, Project } from '../types'

const proj = (id: number, group_id: number | null, position: number, extra: Partial<Project> = {}): Project => ({
  id, name: `L${id}`, group_id, color: null, icon: null, is_inbox: false, position, has_board: false, open_count: 0, context: 'personal', ...extra,
})
const groups: Group[] = [{ id: 1, name: 'A', position: 1000 }, { id: 2, name: 'B', position: 2000 }, { id: 3, name: 'C', position: 3000 }]
const projects = [proj(10, null, 1000), proj(11, null, 2000), proj(20, 1, 1000), proj(21, 1, 2000), proj(30, 2, 1000), proj(99, null, 0, { is_inbox: true })]
const drop = (a: string, o: string) => resolveSideDrop(a, o, groups, projects, [], {}, {})

describe('resolveSideDrop — grupos', () => {
  it('reordena um grupo sobre outro e devolve a posição entre os vizinhos', () => {
    expect(drop('group:3', 'group:1')).toEqual({ kind: 'group', id: 3, position: 500 })
    expect(drop('group:1', 'group:3')).toEqual({ kind: 'group', id: 1, position: 4000 })
  })
  it('grupo solto sobre lista não faz nada', () => {
    expect(drop('group:1', 'proj:10')).toBeNull()
  })
})

describe('resolveSideDrop — listas', () => {
  it('reordena dentro do mesmo grupo', () => {
    const r = drop('proj:21', 'proj:20')
    expect(r).toMatchObject({ kind: 'project', id: 21, groupId: 1, moved: false })
    expect((r as { position: number }).position).toBe(500)
  })
  it('solta numa lista de OUTRO grupo: muda de grupo e entra antes dela', () => {
    expect(drop('proj:10', 'proj:30')).toEqual({ kind: 'project', id: 10, groupId: 2, moved: true, position: 500 })
  })
  it('solta no título de um grupo: vai para o fim dele', () => {
    expect(drop('proj:10', 'group:1')).toEqual({ kind: 'project', id: 10, groupId: 1, moved: true, position: 3000 })
  })
  it('solta no cabeçalho de “Listas”: sai do grupo e vai para o fim das soltas', () => {
    expect(drop('proj:20', 'loose')).toEqual({ kind: 'project', id: 20, groupId: null, moved: true, position: 3000 })
  })
  it('a Inbox nunca se move', () => {
    expect(drop('proj:99', 'group:1')).toBeNull()
  })
})

describe('resolveSideDrop — visões', () => {
  const ids = ['date:inbox', 'date:all', 'filter:5', 'filter:6']
  it('reordena e guarda a ordem', () => {
    const r = resolveSideDrop('view:date:all', 'view:date:inbox', groups, projects, ids, {}, {})
    expect(r).toEqual({ kind: 'views', order: ['date:all', 'date:inbox', 'filter:5', 'filter:6'] })
  })
  it('smart-list movida também ganha a posição entre as outras smart-lists', () => {
    const r = resolveSideDrop('view:filter:6', 'view:filter:5', groups, projects, ids, { 'filter:5': 5, 'filter:6': 6 }, { 5: 1000, 6: 2000 })
    expect(r).toEqual({ kind: 'views', order: ['date:inbox', 'date:all', 'filter:6', 'filter:5'], filter: { id: 6, position: 500 } })
  })
})

describe('orderViews', () => {
  it('segue a ordem salva; o que é novo vai ao fim', () => {
    expect(orderViews(['a', 'b', 'c', 'd'], ['c', 'a'])).toEqual(['c', 'a', 'b', 'd'])
  })
})
