// Rotas por hash (/nami#cartoes). Os nomes antigos continuam valendo para quem salvou um atalho
// ou veio de outro lugar do app: assinaturas e contas fixas viraram "Recorrentes", o dashboard virou "Início".

import type { ViewId } from '../context'

export const VIEW_HASH: Record<ViewId, string> = {
  home: 'inicio', transactions: 'lancamentos', cards: 'cartoes', recurring: 'recorrentes', summary: 'resumo',
  accounts: 'contas', installments: 'parcelamentos', loans: 'emprestimos', budgets: 'orcamentos', shopping: 'lista-compras',
}

const ALIASES: Record<string, ViewId> = {
  ...Object.fromEntries(Object.entries(VIEW_HASH).map(([view, hash]) => [hash, view as ViewId])),
  // nomes da versão anterior
  dashboard: 'home',
  transacoes: 'transactions',
  assinaturas: 'recurring',
  'contas-fixas': 'recurring',
  financiamentos: 'loans',
}

export function viewFromHash(hash: string): ViewId {
  return ALIASES[hash.replace(/^#/, '').toLowerCase()] ?? 'home'
}
