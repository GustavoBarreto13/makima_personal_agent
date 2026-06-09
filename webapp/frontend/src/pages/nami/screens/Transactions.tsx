// Tela de Transações da seção Nami.
// Lista todas as transações do mês selecionado com suporte a busca e delete.
// Agrupadas por dia para facilitar a leitura.

import { useState, useEffect, useMemo } from 'react'
import { namiApi } from '../namiApi'
import type { Transaction, Account, Card } from '../types'

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

/** Formata data YYYY-MM-DD para exibição: "Sex, 06 Jun" */
function formatDay(date: string): string {
  const d = new Date(date + 'T00:00:00')
  const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${dias[d.getDay()]}, ${String(d.getDate()).padStart(2,'0')} ${meses[d.getMonth()]}`
}

/** Formata valor em reais. */
function fmt(v: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v)
}

/** Lista de transações do mês com busca, agrupamento por dia e delete. */
export function Transactions({ month, onToast, onOpenAddModal, searchQuery }: TransactionsProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading]           = useState(true)
  const [deleting, setDeleting]         = useState<string | null>(null)

  // Recarrega transações quando o mês muda
  useEffect(() => {
    setLoading(true)
    namiApi.getTransactions(month)
      .then(r => setTransactions(r.transactions ?? []))
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false))
  }, [month])

  // Filtra por searchQuery (busca no nome e categoria)
  const filtered = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return transactions
    const q = searchQuery.toLowerCase()
    return transactions.filter(tx =>
      tx.name.toLowerCase().includes(q) ||
      tx.categoria.toLowerCase().includes(q)
    )
  }, [transactions, searchQuery])

  // Agrupa transações por data (mais recentes primeiro)
  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    ;[...filtered]
      .sort((a, b) => b.data.localeCompare(a.data))
      .forEach(tx => {
        const day = tx.data
        if (!map.has(day)) map.set(day, [])
        map.get(day)!.push(tx)
      })
    return Array.from(map.entries())
  }, [filtered])

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await namiApi.deleteTransaction(id)
      setTransactions(prev => prev.filter(tx => tx.id !== id))
      onToast('Transação removida')
    } catch {
      onToast('Erro ao remover transação')
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink-3)' }}>
        Carregando transações…
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
        <div style={{ fontSize: 32 }}>↕</div>
        <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>Nenhuma transação neste mês</div>
        <button
          onClick={onOpenAddModal}
          style={{
            padding: '9px 18px',
            borderRadius: 'var(--r-md)',
            border: 'none',
            background: 'var(--tang)',
            color: 'white',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--sans)',
          }}
        >
          + Lançar transação
        </button>
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink-3)', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 20 }}>🔍</div>
        <div style={{ fontSize: 14 }}>Nenhum resultado para "{searchQuery}"</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 0 }}>
      {grouped.map(([day, txs]) => (
        <div key={day}>
          {/* Cabeçalho do grupo por dia */}
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--ink-4)',
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            padding: '14px 0 6px',
            borderBottom: '1px solid var(--line)',
            marginBottom: 2,
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span>{formatDay(day)}</span>
            <span className="amount" style={{ fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums' }}>
              R$ {fmt(txs.reduce((s, tx) =>
                tx.tipo === 'Receita' ? s + tx.valor : s - tx.valor, 0
              ))}
            </span>
          </div>

          {/* Linhas de transação */}
          {txs.map(tx => (
            <div
              key={tx.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 8px',
                borderRadius: 'var(--r-sm)',
                minHeight: 'var(--tx-height)',
                transition: 'background 0.1s',
                cursor: 'default',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              {/* Indicador de tipo */}
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: tx.tipo === 'Receita' ? 'var(--in-tint)' : 'var(--out-tint)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: 14,
              }}>
                {tx.tipo === 'Receita' ? '↑' : '↓'}
              </div>

              {/* Nome e categoria */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tx.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>
                  {tx.categoria} · {tx.conta}
                </div>
              </div>

              {/* Valor */}
              <div
                className="amount"
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: tx.tipo === 'Receita' ? 'var(--in)' : 'var(--ink)',
                  fontVariantNumeric: 'tabular-nums',
                  flexShrink: 0,
                }}
              >
                {tx.tipo === 'Receita' ? '+' : ''}R$ {fmt(tx.valor)}
              </div>

              {/* Botão de delete */}
              <button
                onClick={() => handleDelete(tx.id)}
                disabled={deleting === tx.id}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--ink-4)',
                  padding: '4px 6px',
                  borderRadius: 'var(--r-sm)',
                  flexShrink: 0,
                  opacity: deleting === tx.id ? 0.4 : 0.6,
                  transition: 'opacity 0.1s, color 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--out)'; (e.currentTarget as HTMLElement).style.opacity = '1' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink-4)'; (e.currentTarget as HTMLElement).style.opacity = '0.6' }}
                title="Remover transação"
                aria-label="Remover"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4h6v2"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
