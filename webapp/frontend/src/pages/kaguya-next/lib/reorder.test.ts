import { describe, expect, it } from 'vitest'
import { indentBody, isDescendant, moveBody, outdentBody, restoreBody, shiftBody, zoneAt } from './reorder'
import type { Task } from '../types'

const t = (id: number, parent_id: number | null = null, subtasks: Task[] = []) => ({ id, parent_id, subtasks, title: `T${id}` }) as unknown as Task
// 1, 2 (com 21, 22), 3
const tree = [t(1), t(2, null, [t(21, 2), t(22, 2)]), t(3)]

describe('moveBody', () => {
  it('antes: irmã logo acima, com os vizinhos', () => {
    expect(moveBody(tree, 3, 2, 'before')).toEqual({ new_parent_id: null, before_id: 2, after_id: 1 })
    expect(moveBody(tree, 3, 1, 'before')).toEqual({ new_parent_id: null, before_id: 1, after_id: undefined })
  })
  it('depois: irmã logo abaixo', () => {
    expect(moveBody(tree, 1, 2, 'after')).toEqual({ new_parent_id: null, after_id: 2, before_id: 3 })
    expect(moveBody(tree, 1, 3, 'after')).toEqual({ new_parent_id: null, after_id: 3, before_id: undefined })
  })
  it('dentro: última subtarefa (a própria tarefa não conta como vizinha)', () => {
    expect(moveBody(tree, 1, 2, 'child')).toEqual({ new_parent_id: 2, after_id: 22 })
    expect(moveBody(tree, 22, 2, 'child')).toEqual({ new_parent_id: 2, after_id: 21 })
    expect(moveBody(tree, 1, 3, 'child')).toEqual({ new_parent_id: 3, after_id: undefined })
  })
  it('subtarefa solta entre as de outro pai herda o pai do alvo', () => {
    expect(moveBody(tree, 1, 21, 'after')).toEqual({ new_parent_id: 2, after_id: 21, before_id: 22 })
  })
  it('recusa soltar em si mesma, em descendente ou em alvo que não existe', () => {
    expect(moveBody(tree, 2, 2, 'after')).toBeNull()
    expect(moveBody(tree, 2, 21, 'child')).toBeNull()
    expect(moveBody(tree, 2, 99, 'after')).toBeNull()
    expect(isDescendant(tree, 2, 22)).toBe(true)
    expect(isDescendant(tree, 22, 2)).toBe(false)
  })
})

describe('teclado e menu', () => {
  it('subir/descer troca com a vizinha; nas pontas não há o que fazer', () => {
    expect(shiftBody(tree, 3, -1)).toEqual({ new_parent_id: null, before_id: 2, after_id: 1 })
    expect(shiftBody(tree, 1, 1)).toEqual({ new_parent_id: null, after_id: 2, before_id: 3 })
    expect(shiftBody(tree, 1, -1)).toBeNull()
    expect(shiftBody(tree, 3, 1)).toBeNull()
  })
  it('indentar vira filha da de cima; a primeira não indenta', () => {
    expect(indentBody(tree, 3)).toEqual({ new_parent_id: 2, after_id: 22 })
    expect(indentBody(tree, 1)).toBeNull()
  })
  it('desindentar sobe um nível, logo após o pai; raiz não desindenta', () => {
    expect(outdentBody(tree, 21)).toEqual({ new_parent_id: null, after_id: 2 })
    expect(outdentBody(tree, 1)).toBeNull()
  })
  it('o Desfazer volta ao mesmo pai e aos mesmos vizinhos', () => {
    expect(restoreBody(tree, 2)).toEqual({ new_parent_id: null, after_id: 1, before_id: 3 })
    expect(restoreBody(tree, 22)).toEqual({ new_parent_id: 2, after_id: 21, before_id: undefined })
    expect(restoreBody(tree, 99)).toBeNull()
  })
})

describe('zonas', () => {
  it('28% de cima, 28% de baixo e o meio', () => {
    expect(zoneAt(0.1)).toBe('before')
    expect(zoneAt(0.5)).toBe('child')
    expect(zoneAt(0.9)).toBe('after')
    expect(zoneAt(0.5, false)).toBe('after') // sem aninhar, o meio vira “depois”
  })
})
