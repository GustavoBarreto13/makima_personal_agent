// Hook de colapso persistido em localStorage.
// Cada lista/filtro tem seu próprio Set de IDs colapsados, identificado por scopeKey.
// Ao recarregar a página, o estado é restaurado — nunca reseta ao navegar.

import { useState, useCallback } from 'react'

// Prefixo de todas as chaves no localStorage para evitar colisão com outros domínios
const LS_PREFIX = 'kg:collapsed:'

/**
 * Lê o Set do localStorage para um scopeKey, ou retorna Set vazio se não existir.
 * Converte o array salvo em JSON de volta para Set<number>.
 */
function loadFromStorage(scopeKey: string): Set<number> {
  try {
    const raw = localStorage.getItem(LS_PREFIX + scopeKey)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as number[]
    return new Set(arr)
  } catch {
    // JSON inválido ou localStorage bloqueado → começa com Set vazio
    return new Set()
  }
}

/**
 * Persiste o Set no localStorage como array JSON.
 */
function saveToStorage(scopeKey: string, set: Set<number>): void {
  try {
    localStorage.setItem(LS_PREFIX + scopeKey, JSON.stringify(Array.from(set)))
  } catch {
    // localStorage cheio ou bloqueado — falha silenciosa; colapso não persiste mas UI funciona
  }
}

/**
 * Hook que gerencia o estado de colapso de nós da árvore, persistido por lista.
 *
 * @param scopeKey - Identificador único do escopo (project_id ou filter id como string).
 *   A chave no localStorage será `kg:collapsed:{scopeKey}`.
 *
 * @returns `{ collapsed, toggle, expandAll, collapseAll }`
 */
export function useCollapsedState(scopeKey: string) {
  // Estado inicial carregado do localStorage; muda só quando scopeKey muda
  const [collapsed, setCollapsed] = useState<Set<number>>(() => loadFromStorage(scopeKey))

  /**
   * Alterna o estado de colapso de um nó individual.
   * Se estava colapsado → expande; se estava expandido → colapsa.
   */
  const toggle = useCallback((id: number) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      saveToStorage(scopeKey, next)
      return next
    })
  }, [scopeKey])

  /**
   * Expande todos os nós da lista fornecida (remove seus IDs do Set colapsado).
   * `ids` são os IDs de todos os nós que devem ficar visíveis.
   */
  const expandAll = useCallback((ids: number[]) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      saveToStorage(scopeKey, next)
      return next
    })
  }, [scopeKey])

  /**
   * Colapsa todos os nós da lista fornecida (adiciona seus IDs ao Set colapsado).
   * `ids` são os IDs de todos os nós que devem ficar colapsados.
   */
  const collapseAll = useCallback((ids: number[]) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      for (const id of ids) next.add(id)
      saveToStorage(scopeKey, next)
      return next
    })
  }, [scopeKey])

  return { collapsed, toggle, expandAll, collapseAll }
}
