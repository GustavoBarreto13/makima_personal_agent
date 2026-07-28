// Tela de Transações da seção Nami.
// Portada do handoff de referência (docs/.../nami/screens-a.jsx → Transacoes).
// Lista todas as transações do mês agrupadas por dia, com filtros e busca.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { namiApi } from '../namiApi'
import type { Account, Card, Category } from '../types'
import type { NormalizedTx } from '../lib'
import { QuickAdd } from '../components/QuickAdd'
import { TxList } from '../components/TxRow'
import { AddModal } from '../modals/AddModal'
import { Icon } from '../icons'
import { normalizeTx, buildCatMap, groupByDay, filterTxs } from '../lib'

// Tamanho de página generoso (spec 043, FR-006) — meses comuns nunca precisam de
// "Carregar mais"; só entra em jogo em meses com muitos lançamentos.
const PAGE_SIZE = 300

// Chave de persistência de filtros no localStorage (spec 043, FR-004)
const FILTERS_KEY = 'nami:tx-filters'

interface StoredFilters {
  typeFilter: 'in' | 'out' | null
  catFilter: string | null
}

function loadStoredFilters(): StoredFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY)
    if (!raw) return { typeFilter: null, catFilter: null }
    return JSON.parse(raw)
  } catch {
    return { typeFilter: null, catFilter: null }
  }
}

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
 * - Filtros por tipo (in/out) e categoria (todas as categorias do sistema — spec 043)
 * - Persistência de filtro/ordenação em localStorage (spec 043)
 * - Agrupamento por dia com saldo do dia
 * - Busca textual (recebida do NamiShell)
 * - Edição inline (spec 043) e delete individual
 * - Exportação CSV (spec 043) e paginação "Carregar mais" (spec 043)
 */
export function Transactions({
  month, accounts, cards, onTransactionSaved, onToast, onOpenAddModal, searchQuery,
}: TransactionsProps) {
  const [txs, setTxs]                       = useState<ReturnType<typeof normalizeTx>[]>([])
  const [categories, setCategories]         = useState<Category[]>([])
  const [loading, setLoading]               = useState(true)
  const [loadingMore, setLoadingMore]       = useState(false)
  const [hasMore, setHasMore]               = useState(false)
  const [deletingId, setDeletingId]         = useState<string | null>(null)
  const [editingTx, setEditingTx]           = useState<NormalizedTx | null>(null)

  // Filtros persistidos (spec 043) — carregados uma vez do localStorage
  const stored = useMemo(loadStoredFilters, [])
  const [typeFilter, setTypeFilter]         = useState<'in' | 'out' | null>(stored.typeFilter)
  const [catFilter, setCatFilter]           = useState<string | null>(stored.catFilter)

  // Persiste filtros a cada mudança
  useEffect(() => {
    localStorage.setItem(FILTERS_KEY, JSON.stringify({ typeFilter, catFilter }))
  }, [typeFilter, catFilter])

  // Carrega categorias uma vez
  useEffect(() => {
    namiApi.getCategories()
      .then(cats => setCategories(cats))
      .catch(() => onToast('Erro ao carregar categorias'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Carrega a 1ª página do mês (reseta ao trocar de mês)
  const loadFirstPage = useCallback(() => {
    setLoading(true)
    namiApi.getTransactions(month, { limit: PAGE_SIZE, offset: 0 })
      .then(r => {
        setTxs((r.transactions ?? []).map(normalizeTx))
        setHasMore(!!r.has_more)
      })
      .catch(() => { setTxs([]); setHasMore(false) })
      .finally(() => setLoading(false))
  }, [month])

  useEffect(() => { loadFirstPage() }, [loadFirstPage])

  // "Carregar mais" — busca a próxima página e anexa
  async function handleLoadMore() {
    setLoadingMore(true)
    try {
      const r = await namiApi.getTransactions(month, { limit: PAGE_SIZE, offset: txs.length })
      setTxs(prev => [...prev, ...(r.transactions ?? []).map(normalizeTx)])
      setHasMore(!!r.has_more)
    } catch {
      onToast('Erro ao carregar mais transações')
    } finally {
      setLoadingMore(false)
    }
  }

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

  // Todas as categorias do sistema para os chips de filtro (spec 043, FR-004) —
  // antes só mostrava as presentes no mês, escondendo o filtro de categorias raras
  const filterableCats = useMemo(() => categories.slice(0, 12), [categories])

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

  async function handleEditSaved(msg?: string) {
    setEditingTx(null)
    await onTransactionSaved(msg)
    loadFirstPage()
  }

  function handleExport() {
    const url = namiApi.exportTransactionsUrl(month, {
      categoria: catFilter ?? undefined,
      tipo: typeFilter === 'in' ? 'Receita' : typeFilter === 'out' ? 'Despesa' : undefined,
    })
    // Navegação same-origin já leva o cookie de sessão — sem precisar de fetch/blob
    window.location.href = url
  }

  return (
    <>
      {/* Cabeçalho da página */}
      <div className="page-head">
        <h2>Transações</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!loading && (
            <span className="page-sub">{txs.length} lançamento{txs.length !== 1 ? 's' : ''} no mês{hasMore ? '+' : ''}</span>
          )}
          {!loading && txs.length > 0 && (
            <button className="btn btn-ghost" onClick={handleExport}>
              <Icon name="download" size={14} /> Exportar CSV
            </button>
          )}
        </div>
      </div>

      {/* QuickAdd: lançamento rápido inline */}
      <QuickAdd
        categories={categories}
        onSaved={async msg => { await onTransactionSaved(msg); loadFirstPage() }}
      />

      {/* Barra de filtros: tipo + todas as categorias do sistema (spec 043) */}
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

          {/* Chips de categoria — todas do sistema, não só as presentes no mês */}
          {filterableCats.map(cat => (
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
            onEdit={setEditingTx}
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

          {/* Carregar mais (spec 043, FR-006/US5) */}
          {hasMore && !typeFilter && !catFilter && !searchQuery && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <button className="btn btn-ghost" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? 'Carregando…' : 'Carregar mais'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal de edição (spec 043) — instância própria, independente do AddModal do shell */}
      <AddModal
        open={!!editingTx}
        accounts={accounts}
        cards={cards}
        editingTx={editingTx}
        onClose={() => setEditingTx(null)}
        onSaved={handleEditSaved}
      />
    </>
  )
}
