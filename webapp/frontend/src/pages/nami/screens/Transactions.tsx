// Tela de Transações da seção Nami.
// Portada do handoff de referência (docs/.../nami/screens-a.jsx → Transacoes).
// Lista todas as transações do mês agrupadas por dia, com filtros e busca.

import { useState, useEffect, useMemo } from 'react'
import { namiApi } from '../namiApi'
import type { Account, Card, Category } from '../types'
import { QuickAdd } from '../components/QuickAdd'
import { TxList } from '../components/TxRow'
import { Icon } from '../icons'
import { normalizeTx, buildCatMap, groupByDay, filterTxs } from '../lib'

interface TransactionsProps {
  month: string
  accounts: Account[]
  cards: Card[]
  onTransactionSaved: (msg?: string) => Promise<void>
  onToast: (msg: string) => void
  onOpenAddModal: () => void
  searchQuery: string
  // Props do commonProps não usadas aqui
  stats?: unknown
  subscriptions?: unknown
  onNavigate?: unknown
}

/**
 * Tela de lista de transações com:
 * - QuickAdd para lançamento rápido
 * - Filtros por tipo (in/out) e categoria
 * - Agrupamento por dia com saldo do dia
 * - Busca textual (recebida do NamiShell)
 * - Delete individual
 */
export function Transactions({
  month, onTransactionSaved, onToast, onOpenAddModal, searchQuery,
}: TransactionsProps) {
  const [txs, setTxs]                       = useState<ReturnType<typeof normalizeTx>[]>([])
  const [categories, setCategories]         = useState<Category[]>([])
  const [loading, setLoading]               = useState(true)
  const [deletingId, setDeletingId]         = useState<string | null>(null)
  const [typeFilter, setTypeFilter]         = useState<'in' | 'out' | null>(null)
  const [catFilter, setCatFilter]           = useState<string | null>(null)

  // Carrega categorias uma vez
  useEffect(() => {
    namiApi.getCategories()
      .then(cats => setCategories(cats))
      .catch(() => {})
  }, [])

  // Recarrega transações quando o mês muda
  useEffect(() => {
    setLoading(true)
    namiApi.getTransactions(month)
      .then(r => setTxs((r.transactions ?? []).map(normalizeTx)))
      .catch(() => setTxs([]))
      .finally(() => setLoading(false))
  }, [month])

  const catMap = useMemo(() => buildCatMap(categories), [categories])

  // Aplica filtros e busca textual
  const filtered = useMemo(() => {
    let result = filterTxs(txs, typeFilter, catFilter)
    // Busca textual: filtra por nome do estabelecimento ou slug da categoria
    if (searchQuery && searchQuery.length >= 2) {
      const q = searchQuery.toLowerCase()
      result = result.filter(tx =>
        tx.merchant.toLowerCase().includes(q) ||
        tx.catId.toLowerCase().includes(q) ||
        (catMap[tx.catId]?.name.toLowerCase().includes(q) ?? false)
      )
    }
    return result
  }, [txs, typeFilter, catFilter, searchQuery, catMap])

  const groups = useMemo(() => groupByDay(filtered), [filtered])

  // Categorias presentes nas transações do mês (para os chips de filtro)
  const presentCats = useMemo(() => {
    const ids = new Set(txs.map(tx => tx.catId))
    return categories.filter(c => ids.has(c.id)).slice(0, 8)
  }, [txs, categories])

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await namiApi.deleteTransaction(id)
      setTxs(prev => prev.filter(tx => tx.id !== id))
      onToast('Transação removida')
      await onTransactionSaved()
    } catch {
      onToast('Erro ao remover transação')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      {/* Cabeçalho da página */}
      <div className="page-head">
        <h2>Transações</h2>
        {!loading && (
          <span className="page-sub">{txs.length} lançamento{txs.length !== 1 ? 's' : ''} no mês</span>
        )}
      </div>

      {/* QuickAdd: lançamento rápido inline */}
      <QuickAdd
        categories={categories}
        onSaved={async msg => { await onTransactionSaved(msg) }}
      />

      {/* Barra de filtros: tipo + categorias presentes */}
      {!loading && txs.length > 0 && (
        <div className="toolbar">
          {/* Filtro por tipo */}
          <button
            className={`chip in${typeFilter === 'in' ? ' active' : ''}`}
            onClick={() => setTypeFilter(f => f === 'in' ? null : 'in')}
          >
            <Icon name="up" size={12} />
            Entradas
          </button>
          <button
            className={`chip out${typeFilter === 'out' ? ' active' : ''}`}
            onClick={() => setTypeFilter(f => f === 'out' ? null : 'out')}
          >
            <Icon name="down" size={12} />
            Saídas
          </button>

          {/* Separador visual */}
          <div style={{ width: 1, height: 16, background: 'var(--line)', margin: '0 4px' }} />

          {/* Chips de categoria presentes no mês */}
          {presentCats.map(cat => (
            <button
              key={cat.id}
              className={`chip${catFilter === cat.id ? ' active' : ''}`}
              onClick={() => setCatFilter(f => f === cat.id ? null : cat.id)}
            >
              {cat.name}
            </button>
          ))}

          {/* Limpar filtros */}
          {(typeFilter || catFilter) && (
            <button
              className="chip"
              onClick={() => { setTypeFilter(null); setCatFilter(null) }}
              style={{ marginLeft: 'auto' }}
            >
              <Icon name="x" size={11} />
              Limpar
            </button>
          )}
        </div>
      )}

      {/* Lista de transações agrupada por dia */}
      {loading ? (
        <div className="loading">
          <Icon name="receipt" size={20} />
          Carregando transações…
        </div>
      ) : (
        <div className="panel">
          <TxList
            groups={groups}
            catMap={catMap}
            onDelete={handleDelete}
            deletingId={deletingId}
          />
          {groups.length === 0 && txs.length > 0 && (
            // Busca sem resultado
            <div className="empty">
              <Icon name="search" size={28} />
              <p>Nenhum resultado para "{searchQuery}"</p>
            </div>
          )}
          {txs.length === 0 && (
            // Mês sem lançamentos
            <div className="empty">
              <Icon name="receipt" size={32} />
              <p>Nenhuma transação neste mês</p>
              <button className="btn btn-primary" onClick={onOpenAddModal}>
                <Icon name="plus" size={14} />
                Primeiro lançamento
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
