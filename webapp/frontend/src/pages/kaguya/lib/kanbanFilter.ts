// kanbanFilter.ts — lógica pura de filtro e ordenação para os boards Kanban.
//
// Compartilhado entre KanbanScreen (por-lista) e GroupBoardScreen (de grupo):
// os dois precisam de exatamente o mesmo comportamento — filtrar por prioridade
// mínima e ordenar os cards de uma coluna. Extraído para evitar duplicação.

import type { Task } from '../types'

// ── Tipos exportados ──────────────────────────────────────────────────────────

// Modos de ordenação disponíveis nos dois boards Kanban.
// 'manual'  → preserva a ordem de posição vinda do servidor (campo `position`).
// 'due'     → data de vencimento crescente; sem data vai para o final.
// 'prio'    → prioridade decrescente (3=Alta primeiro, 0=Sem prioridade por último).
export type KanbanSort = 'manual' | 'due' | 'prio'

// Estado completo dos filtros da barra Kanban.
// `prio` = prioridade mínima: 0=tudo, 1=Baixa+, 2=Média+, 3=só Alta.
export interface KanbanFilters {
  prio: number
  sort: KanbanSort
}

// Rótulos exibidos no botão de ciclo de ordenação.
export const SORT_LABELS: Record<KanbanSort, string> = {
  manual: 'Manual',
  due:    'Vencimento',
  prio:   'Prioridade',
}

// Ciclo de troca ao clicar no botão de ordenação.
export const SORT_CYCLE: KanbanSort[] = ['manual', 'due', 'prio']

// Valores padrão: sem filtro de prioridade, ordem manual.
export const KANBAN_DEFAULTS: KanbanFilters = { prio: 0, sort: 'manual' }

// ── Função principal ─────────────────────────────────────────────────────────

/**
 * Filtra e ordena os cards de UMA coluna Kanban conforme os filtros ativos.
 *
 * Esta função é pura (sem efeitos colaterais): recebe os cards e os filtros e
 * devolve um novo array. O array original não é mutado.
 *
 * @param cards  - Array de tarefas que pertencem à coluna.
 * @param f      - Filtros ativos (prioridade mínima + modo de ordenação).
 * @returns      Novo array filtrado e ordenado.
 */
export function applyKanbanFilters(cards: Task[], f: KanbanFilters): Task[] {
  // 1. Filtra por prioridade mínima.
  //    `priority` pode ser null (sem prioridade); tratamos null como 0.
  const filtered = f.prio === 0
    ? cards                                           // 0 = mostrar tudo
    : cards.filter(t => (t.priority ?? 0) >= f.prio)

  // 2. Ordena conforme o modo escolhido.
  if (f.sort === 'manual') {
    // Modo manual: preserva a ordem de `position` (campo numérico do banco).
    // Garante ordenação consistente — o board de grupo não ordena por padrão;
    // com 'manual' garantimos que cards aparecem em ordem de position.
    return [...filtered].sort((a, b) => a.position - b.position)
  }

  if (f.sort === 'due') {
    // Por vencimento crescente: tarefas sem data de vencimento vão para o final.
    return [...filtered].sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1   // sem data → final
      if (!b.due_date) return -1  // sem data → final
      return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0
    })
  }

  // f.sort === 'prio': por prioridade decrescente (maior prioridade primeiro).
  return [...filtered].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
}
