/**
 * lib.ts — Adaptadores e utilitários da seção Nami
 *
 * Ponte entre o formato real da API ({tipo, valor, categoria, name, conta, card_id})
 * e o formato interno dos componentes de referência ({type, amount, catId, merchant, source}).
 *
 * Também exporta helpers de classificação e agrupamento de transações.
 */

import type { Transaction, Category } from './types'

// ── Tipo interno normalizado ──────────────────────────────────────────────────

/** Transação no formato normalizado que os componentes de UI consomem */
export interface NormalizedTx {
  /** Id original da transação (para deletar) */
  id: string
  /** "in" = receita, "out" = despesa */
  type: 'in' | 'out'
  /** Valor absoluto em reais */
  amount: number
  /** Slug da categoria (ex.: "restaurante") */
  catId: string
  /** Nome do estabelecimento / descrição */
  merchant: string
  /** Conta ou cartão de origem */
  source: string
  /** Data no formato YYYY-MM-DD */
  date: string
  /** Notas opcionais */
  notes?: string
  /** Id do cartão (se for transação de cartão) */
  cardId?: string
}

/**
 * Converte uma transação real da API para o formato normalizado interno.
 *
 * O backend retorna:
 *   tipo: "Despesa" | "Receita"   → normalizado para "out" | "in"
 *   valor: number (sempre positivo)
 *   categoria: slug (ex.: "restaurante")
 *   name: descrição livre
 *   conta: nome da conta ou cartão
 *
 * Args:
 *   tx: transação no formato da API.
 *
 * Returns:
 *   Objeto NormalizedTx com os campos normalizados.
 *
 * Example:
 *   normalizeTx({ tipo: "Despesa", valor: 50, ... }) // → { type: "out", amount: 50, ... }
 */
export function normalizeTx(tx: Transaction): NormalizedTx {
  return {
    id:       tx.id,
    type:     tx.tipo === 'Receita' ? 'in' : 'out',
    amount:   Math.abs(tx.valor),        // garante positivo
    catId:    tx.categoria,
    merchant: tx.name,
    source:   tx.conta,
    date:     tx.data,
    notes:    tx.notes,
    cardId:   tx.card_id,
  }
}

/**
 * Agrupa uma lista de transações normalizadas por data (YYYY-MM-DD).
 * Retorna as datas em ordem decrescente (mais recente primeiro).
 *
 * Args:
 *   txs: lista de transações normalizadas.
 *
 * Returns:
 *   Array de { date, txs } com as transações agrupadas por dia.
 *
 * Example:
 *   groupByDay([{date:"2026-06-09",...}, {date:"2026-06-08",...}])
 *   // → [{date:"2026-06-09", txs:[...]}, {date:"2026-06-08", txs:[...]}]
 */
export function groupByDay(txs: NormalizedTx[]): { date: string; txs: NormalizedTx[] }[] {
  // Reduz para um mapa {data → [transações]}
  const map = txs.reduce<Record<string, NormalizedTx[]>>((acc, tx) => {
    if (!acc[tx.date]) acc[tx.date] = []
    acc[tx.date].push(tx)
    return acc
  }, {})

  // Converte para array e ordena por data decrescente
  return Object.entries(map)
    .sort(([a], [b]) => b.localeCompare(a))  // decrescente: "2026-06-09" > "2026-06-08"
    .map(([date, txs]) => ({ date, txs }))
}

/**
 * Calcula o saldo líquido (entradas - saídas) de um grupo de transações.
 *
 * Args:
 *   txs: lista de transações normalizadas.
 *
 * Returns:
 *   Diferença entre receitas e despesas (pode ser negativo).
 */
export function dayNet(txs: NormalizedTx[]): number {
  return txs.reduce((sum, tx) => {
    return sum + (tx.type === 'in' ? tx.amount : -tx.amount)
  }, 0)
}

/**
 * Cria um mapa de categorias indexado por id (slug) para acesso O(1).
 *
 * Args:
 *   categories: array de categorias retornado pela API.
 *
 * Returns:
 *   Objeto {id → Category} para lookup rápido.
 *
 * Example:
 *   buildCatMap([{id:"mercado",...}]) // → {"mercado": {...}}
 */
export function buildCatMap(categories: Category[]): Record<string, Category> {
  return categories.reduce<Record<string, Category>>((map, cat) => {
    map[cat.id] = cat
    return map
  }, {})
}

/**
 * Filtra transações por tipo e/ou categoria.
 *
 * Args:
 *   txs: lista de transações normalizadas.
 *   typeFilter: "in" | "out" | null (null = todos).
 *   catFilter: slug da categoria | null (null = todas).
 *
 * Returns:
 *   Lista filtrada de transações.
 */
export function filterTxs(
  txs: NormalizedTx[],
  typeFilter: 'in' | 'out' | null,
  catFilter: string | null,
): NormalizedTx[] {
  return txs.filter(tx => {
    // Filtra por tipo
    if (typeFilter && tx.type !== typeFilter) return false
    // Filtra por categoria
    if (catFilter && tx.catId !== catFilter) return false
    return true
  })
}

/**
 * Formata um valor de parcelas para exibição.
 * Ex.: paid=3, total=12 → "3/12 parcelas"
 *
 * Args:
 *   paid: número de parcelas pagas.
 *   total: número total de parcelas.
 *
 * Returns:
 *   String formatada.
 */
export function fmtInstallments(paid: number, total: number): string {
  return `${paid}/${total} parcela${total !== 1 ? 's' : ''}`
}

/**
 * Calcula o percentual de progresso (0–100+) de um valor sobre um limite.
 * Usado nas barras de orçamento.
 *
 * Args:
 *   spent: valor gasto.
 *   limit: valor limite.
 *
 * Returns:
 *   Percentual (pode ultrapassar 100 se o limite foi excedido).
 */
export function pct(spent: number, limit: number): number {
  if (!limit) return 0
  return Math.round((spent / limit) * 100)
}

/**
 * Classifica urgência de um vencimento em dias.
 * Retorna "urgent" (<= 3 dias), "soon" (<= 10 dias), ou "ok".
 *
 * Args:
 *   days: número de dias até o vencimento.
 *
 * Returns:
 *   "urgent" | "soon" | "ok"
 */
export function urgency(days: number): 'urgent' | 'soon' | 'ok' {
  if (days <= 3) return 'urgent'
  if (days <= 10) return 'soon'
  return 'ok'
}
