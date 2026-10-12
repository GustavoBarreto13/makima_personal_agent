// Regras de soltar da barra lateral (puras, sem React): para onde vai uma lista, um grupo ou uma visão arrastada.
// Os ids dos itens arrastáveis são prefixados: `proj:12`, `group:3` e `view:<id do menu>`. Soltar uma lista sobre o
// título de um grupo a coloca no fim dele; sobre `loose` (o cabeçalho de "Listas"), no fim das listas soltas.

import { midPosition } from './dnd'
import type { Group, Project } from '../types'

export type SideDrop =
  | { kind: 'group'; id: number; position: number }
  | { kind: 'project'; id: number; position: number; groupId: number | null; moved: boolean }
  | { kind: 'views'; order: string[]; filter?: { id: number; position: number } }

const num = (s: string) => Number(s.split(':')[1])
const byPos = <T extends { position: number }>(a: T[]) => [...a].sort((x, y) => x.position - y.position)

/** Posição para inserir `item` em `siblings` (já sem ele) no índice `index`. */
function slot(siblings: { position: number }[], index: number): number {
  return midPosition(siblings[index - 1] ?? null, siblings[index] ?? null)
}

export function resolveSideDrop(
  activeId: string, overId: string, groups: Group[], projects: Project[], viewIds: string[], filterIds: Record<string, number>, filterPos: Record<number, number>,
): SideDrop | null {
  if (activeId === overId) return null

  if (activeId.startsWith('group:')) {
    if (!overId.startsWith('group:')) return null
    const sorted = byPos(groups)
    const from = sorted.findIndex((g) => g.id === num(activeId))
    const to = sorted.findIndex((g) => g.id === num(overId))
    if (from < 0 || to < 0) return null
    const without = sorted.filter((g) => g.id !== num(activeId))
    return { kind: 'group', id: num(activeId), position: slot(without, to) }
  }

  if (activeId.startsWith('proj:')) {
    const moving = projects.find((p) => p.id === num(activeId))
    if (!moving || moving.is_inbox) return null
    const inContainer = (g: number | null) => byPos(projects.filter((p) => !p.is_inbox && p.group_id === g))
    let target: number | null
    if (overId.startsWith('group:')) target = num(overId)
    else if (overId === 'loose') target = null
    else if (overId.startsWith('proj:')) {
      const over = projects.find((p) => p.id === num(overId))
      if (!over) return null
      target = over.group_id
    } else return null

    const all = inContainer(target)
    const without = all.filter((p) => p.id !== moving.id)
    const overIdx = overId.startsWith('proj:') ? all.findIndex((p) => p.id === num(overId)) : -1
    if (overId.startsWith('proj:') && moving.group_id === target) {
      // Mesmo container: o item toma o lugar de quem estava ali (como o arrayMove do dnd-kit).
      const from = all.findIndex((p) => p.id === moving.id)
      const next = [...all]
      next.splice(overIdx, 0, next.splice(from, 1)[0])
      return { kind: 'project', id: moving.id, position: midPosition(next[overIdx - 1] ?? null, next[overIdx + 1] ?? null), groupId: target, moved: false }
    }
    // Outro container (ou título de grupo): entra antes do alvo, ou no fim.
    const at = overIdx >= 0 ? without.findIndex((p) => p.id === num(overId)) : without.length
    return { kind: 'project', id: moving.id, position: slot(without, at), groupId: target, moved: target !== moving.group_id }
  }

  if (activeId.startsWith('view:') && overId.startsWith('view:')) {
    const from = viewIds.indexOf(activeId.slice(5))
    const to = viewIds.indexOf(overId.slice(5))
    if (from < 0 || to < 0) return null
    const order = [...viewIds]
    order.splice(to, 0, order.splice(from, 1)[0])
    const movedKey = activeId.slice(5)
    const fid = filterIds[movedKey]
    if (fid === undefined) return { kind: 'views', order }
    // Smart-list: também grava a posição entre as outras smart-lists (a ordem no servidor acompanha a da barra).
    const filtersInOrder = order.filter((id) => filterIds[id] !== undefined).map((id) => ({ id: filterIds[id], position: filterPos[filterIds[id]] ?? 0 }))
    const i = filtersInOrder.findIndex((f) => f.id === fid)
    return { kind: 'views', order, filter: { id: fid, position: midPosition(filtersInOrder[i - 1] ?? null, filtersInOrder[i + 1] ?? null) } }
  }
  return null
}

/** Ordena os ids pela ordem salva; o que não está na lista (item novo) fica no fim, na ordem original. */
export function orderViews(ids: string[], saved: string[]): string[] {
  const rank = new Map(saved.map((id, i) => [id, i]))
  return [...ids].sort((a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER))
}
