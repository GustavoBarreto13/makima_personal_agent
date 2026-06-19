// Helpers puros sobre a árvore de tarefas — sem efeitos colaterais, sem banco.
// Usados pelos componentes TaskTree, TaskModal e ListScreen para navegar,
// calcular progresso e formatar avatares sem repetir lógica.

import type { Task } from '../types'

// ── Navegação na árvore ───────────────────────────────────────────────────────

/**
 * Retorna os filhos diretos (primeiro nível) de um nó.
 * Usa o campo `subtasks` do próprio nó quando disponível (resposta aninhada do backend);
 * caso contrário, varre o array flat de tarefas buscando pelo parent_id.
 */
export function childrenOf(tasks: Task[], parentId: number | null): Task[] {
  // Tenta atalho: busca o nó-pai no array e usa subtasks já aninhados
  if (parentId !== null) {
    const parent = tasks.find(t => t.id === parentId)
    if (parent?.subtasks?.length) return parent.subtasks
  }
  // Fallback flat: filtra por parent_id (usado em listas já achatadas)
  return tasks.filter(t => t.parent_id === parentId)
}

/**
 * Todos os descendentes de uma tarefa (recursivo), incluindo ela mesma se `includeSelf`.
 */
export function descendantsOf(task: Task, allTasks: Task[], includeSelf = false): Task[] {
  const result: Task[] = includeSelf ? [task] : []
  function collect(t: Task) {
    const kids = childrenOf(allTasks, t.id)
    for (const k of kids) {
      result.push(k)
      collect(k)
    }
  }
  collect(task)
  return result
}

/**
 * Verdadeiro se `candidateId` é descendente de `ancestorId` na árvore.
 * Usado pela validação anti-ciclo antes de mover uma tarefa.
 */
export function isDescendant(candidateId: number, ancestorId: number, allTasks: Task[]): boolean {
  const descendantIds = descendantsOf(
    allTasks.find(t => t.id === ancestorId)!,
    allTasks,
  ).map(t => t.id)
  return descendantIds.includes(candidateId)
}

// ── Profundidade e breadcrumb ─────────────────────────────────────────────────

/**
 * Profundidade de uma tarefa na árvore (raiz = 0).
 * Sobe via parent_id até encontrar um nó sem pai.
 */
export function taskDepth(task: Task, allTasks: Task[]): number {
  let depth = 0
  let current = task
  // Proteção de ciclo: nunca mais profundo que 20 (limite real é 12)
  while (current.parent_id !== null && depth < 20) {
    depth++
    const parent = allTasks.find(t => t.id === current.parent_id)
    if (!parent) break
    current = parent
  }
  return depth
}

/**
 * Caminho completo da tarefa como string "Avó › Pai" (sem o nó atual).
 * Usado no tooltip de profundidade exibido quando depth ≥ 2.
 */
export function buildBreadcrumb(task: Task, allTasks: Task[]): string {
  const path: string[] = []
  let current = task
  while (current.parent_id !== null) {
    const parent = allTasks.find(t => t.id === current.parent_id)
    if (!parent) break
    path.unshift(parent.title)
    current = parent
  }
  return path.join(' › ')
}

// ── Progresso de subtarefas ───────────────────────────────────────────────────

/**
 * Progresso direto de uma tarefa: `{done, total}` contando só os filhos imediatos.
 * O anel de progresso do TaskCard e o contador .tree-count usam este valor.
 */
export function subProgress(task: Task): { done: number; total: number } {
  const kids = task.subtasks ?? []
  const total = kids.length
  const done = kids.filter(k => k.completed_at !== null).length
  return { done, total }
}

// ── Avatares e iniciais ───────────────────────────────────────────────────────

// Paleta de cores OKLCH para avatares sem foto — mapeada por hash do nome.
// 8 cores espaçadas na roda cromática para boa distinção visual.
const AVATAR_PALETTE = [
  'oklch(0.58 0.18 264)',  // azul índigo
  'oklch(0.62 0.17 320)',  // violeta-rosa
  'oklch(0.60 0.20 18)',   // vermelho-coral
  'oklch(0.68 0.17 52)',   // laranja dourado
  'oklch(0.64 0.15 150)',  // verde-esmeralda
  'oklch(0.60 0.16 195)',  // ciano-teal
  'oklch(0.65 0.18 230)',  // azul-celeste
  'oklch(0.70 0.14 88)',   // amarelo-oliva
] as const

/**
 * Cor OKLCH determinística para um avatar sem foto, baseada no nome da pessoa.
 * Mesma pessoa sempre recebe a mesma cor (hash estável).
 */
export function avatarColor(name: string): string {
  // Soma simples dos char codes como hash (rápido, sem dependências)
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash + name.charCodeAt(i)) % AVATAR_PALETTE.length
  }
  return AVATAR_PALETTE[hash]
}

/**
 * Iniciais de um nome completo (até 2 letras maiúsculas).
 * "Lucas Mendes" → "LM" | "Ana" → "A" | "Ana Costa Lima" → "AL"
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  // Primeira e última palavra para nomes compostos
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ── Achatamento da árvore ─────────────────────────────────────────────────────

/**
 * Achata uma árvore de tarefas aninhadas em um array flat (pré-ordem DFS).
 * Útil para operações que precisam de todos os nós sem importar a profundidade.
 */
export function flattenTree(tasks: Task[]): Task[] {
  const result: Task[] = []
  function visit(list: Task[]) {
    for (const t of list) {
      result.push(t)
      if (t.subtasks?.length) visit(t.subtasks)
    }
  }
  visit(tasks)
  return result
}
