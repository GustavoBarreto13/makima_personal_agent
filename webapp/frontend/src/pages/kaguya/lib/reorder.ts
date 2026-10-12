// Reordenar e aninhar tarefas — lógica PURA. Soltar uma linha sobre outra tem três zonas: ANTES (vira irmã logo acima),
// DEPOIS (vira irmã logo abaixo) e DENTRO (vira a última subtarefa dela). O servidor recebe o novo pai e os vizinhos
// (`after_id`/`before_id`); aqui só se calcula isso, a partir da árvore que está na tela. Os mesmos cálculos servem
// ao teclado e ao menu (subir, descer, indentar, desindentar) e ao “Desfazer”.

import type { Task } from '../types'

export type DropZone = 'before' | 'after' | 'child'

export interface MoveBody { new_parent_id: number | null; after_id?: number | null; before_id?: number | null }

/** Acha uma tarefa em qualquer nível da árvore. */
export function findTask(tree: Task[], id: number): Task | undefined {
  for (const t of tree) {
    if (t.id === id) return t
    const hit = t.subtasks?.length ? findTask(t.subtasks, id) : undefined
    if (hit) return hit
  }
  return undefined
}

/** Os irmãos de uma tarefa (ela inclusive), na ordem em que aparecem. */
export function siblingsOf(tree: Task[], task: Task): Task[] {
  if (task.parent_id == null) return tree
  return findTask(tree, task.parent_id)?.subtasks ?? []
}

/** `maybe` é descendente de `ancestorId`? (Não dá para soltar uma tarefa dentro de si mesma.) */
export function isDescendant(tree: Task[], ancestorId: number, maybe: number): boolean {
  const a = findTask(tree, ancestorId)
  return !!a && !!findTask(a.subtasks ?? [], maybe)
}

/** Corpo do `move` ao soltar `dragId` na zona `zone` da linha `targetId`. `null` = movimento inválido ou sem efeito. */
export function moveBody(tree: Task[], dragId: number, targetId: number, zone: DropZone): MoveBody | null {
  const target = findTask(tree, targetId)
  if (!target || dragId === targetId || isDescendant(tree, dragId, targetId)) return null
  if (zone === 'child') {
    const kids = (target.subtasks ?? []).filter((t) => t.id !== dragId)
    return { new_parent_id: target.id, after_id: kids[kids.length - 1]?.id }
  }
  const sibs = siblingsOf(tree, target).filter((t) => t.id !== dragId)
  const i = sibs.findIndex((t) => t.id === target.id)
  if (zone === 'before') return { new_parent_id: target.parent_id ?? null, before_id: target.id, after_id: sibs[i - 1]?.id }
  return { new_parent_id: target.parent_id ?? null, after_id: target.id, before_id: sibs[i + 1]?.id }
}

/** Para onde a tarefa voltaria (“Desfazer”): o mesmo pai e os mesmos vizinhos de antes. */
export function restoreBody(tree: Task[], dragId: number): MoveBody | null {
  const t = findTask(tree, dragId)
  if (!t) return null
  const sibs = siblingsOf(tree, t)
  const i = sibs.findIndex((x) => x.id === t.id)
  return { new_parent_id: t.parent_id ?? null, after_id: sibs[i - 1]?.id, before_id: sibs[i + 1]?.id }
}

/** Subir/descer uma posição entre irmãs. */
export function shiftBody(tree: Task[], id: number, dir: -1 | 1): MoveBody | null {
  const t = findTask(tree, id)
  if (!t) return null
  const sibs = siblingsOf(tree, t)
  const i = sibs.findIndex((x) => x.id === id)
  const other = sibs[i + dir]
  return other ? moveBody(tree, id, other.id, dir === -1 ? 'before' : 'after') : null
}

/** Indentar: vira a última subtarefa da irmã de cima. */
export function indentBody(tree: Task[], id: number): MoveBody | null {
  const t = findTask(tree, id)
  if (!t) return null
  const sibs = siblingsOf(tree, t)
  const prev = sibs[sibs.findIndex((x) => x.id === id) - 1]
  return prev ? moveBody(tree, id, prev.id, 'child') : null
}

/** Desindentar: sobe um nível, logo depois do antigo pai. */
export function outdentBody(tree: Task[], id: number): MoveBody | null {
  const t = findTask(tree, id)
  if (!t || t.parent_id == null) return null
  const parent = findTask(tree, t.parent_id)
  return parent ? { new_parent_id: parent.parent_id ?? null, after_id: parent.id } : null
}

/** A zona sob o ponteiro: 28% de cima = antes, 28% de baixo = depois, o meio = dentro. */
export function zoneAt(relativeY: number, canNest = true): DropZone {
  if (relativeY < 0.28) return 'before'
  if (relativeY > 0.72 || !canNest) return 'after'
  return 'child'
}
