// Tela de Orçamentos da seção Nami.
// Mostra o envelope de orçamento mensal por categoria com barras de progresso.
// Permite definir novos limites e remover envelopes.

import { useState, useEffect } from 'react'
import { namiApi } from '../namiApi'
import type { Budget } from '../types'

interface BudgetsProps {
  month: string
  onToast: (msg: string) => void
  // Props do commonProps não usadas aqui
  stats?: unknown
  accounts?: unknown
  cards?: unknown
  subscriptions?: unknown
  onTransactionSaved?: unknown
  onNavigate?: unknown
  onOpenAddModal?: unknown
}

// Categorias de despesa válidas (subset das categorias da Nami)
const EXPENSE_CATS = [
  'Alimentacao','Comer Fora','Saude','Lazer','Transporte',
  'Moradia','Roupas','Educacao','Assinaturas','Viagem',
  'Presente','Beleza','Academia','Farmacia','Supermercado',
  'Eletronicos','Pet',
]

function fmt(v: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v)
}

/** Retorna cor da barra de progresso baseada no percentual gasto. */
function progressColor(pct: number): string {
  if (pct >= 100) return 'var(--out)'
  if (pct >= 80)  return 'var(--gold)'
  return 'var(--tang)'
}

/** Tela de orçamentos mensais por categoria. */
export function Budgets({ month, onToast }: BudgetsProps) {
  const [budgets, setBudgets]     = useState<Budget[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [categoria, setCategoria] = useState(EXPENSE_CATS[0])
  const [limite, setLimite]       = useState('')
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState<string | null>(null)

  // Carrega orçamentos do mês selecionado
  useEffect(() => {
    setLoading(true)
    namiApi.getBudgets(month)
      .then(r => setBudgets(r.budgets ?? []))
      .catch(() => setBudgets([]))
      .finally(() => setLoading(false))
  }, [month])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!limite) return
    setSaving(true)
    try {
      await namiApi.createBudget({ month, categoria, limite: parseFloat(limite.replace(',', '.')) })
      setLimite('')
      setShowForm(false)
      const r = await namiApi.getBudgets(month)
      setBudgets(r.budgets ?? [])
      onToast('Orçamento definido ✓')
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Erro ao definir orçamento')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(b: Budget) {
    setDeleting(b.id)
    try {
      // O endpoint de delete recebe month e categoria
      const monthStr = b.month ? b.month.slice(0, 7) : month
      await namiApi.deleteBudget(monthStr, b.categoria ?? b.category_id)
      setBudgets(prev => prev.filter(x => x.id !== b.id))
      onToast('Orçamento removido')
    } catch {
      onToast('Erro ao remover orçamento')
    } finally {
      setDeleting(null)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 11px',
    borderRadius: 'var(--r-sm)',
    border: '1.5px solid var(--line)',
    background: 'var(--paper)',
    color: 'var(--ink)',
    fontFamily: 'var(--sans)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink-3)' }}>
        Carregando orçamentos…
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
          {budgets.length} {budgets.length === 1 ? 'envelope' : 'envelopes'} para {month}
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          style={{
            padding: '7px 14px',
            borderRadius: 'var(--r-md)',
            border: '1.5px solid var(--line)',
            background: showForm ? 'var(--tang-tint)' : 'transparent',
            color: showForm ? 'var(--tang-deep)' : 'var(--ink-2)',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'var(--sans)',
          }}
        >
          {showForm ? '✕ Cancelar' : '+ Novo envelope'}
        </button>
      </div>

      {/* Formulário de novo orçamento */}
      {showForm && (
        <form onSubmit={handleCreate} style={{
          background: 'var(--card)',
          borderRadius: 'var(--r-md)',
          border: '1.5px solid var(--tang)',
          padding: '16px',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}>
          <div style={{ flex: 2, minWidth: 160 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Categoria</label>
            <select value={categoria} onChange={e => setCategoria(e.target.value)} style={inputStyle}>
              {EXPENSE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Limite (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={limite}
              onChange={e => setLimite(e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder="0,00"
              style={{ ...inputStyle, fontFamily: 'var(--mono)' }}
              required
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '9px 16px',
              borderRadius: 'var(--r-md)',
              border: 'none',
              background: 'var(--tang)',
              color: 'white',
              fontSize: 13.5,
              fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
              fontFamily: 'var(--sans)',
              flexShrink: 0,
            }}
          >
            {saving ? '…' : 'Definir'}
          </button>
        </form>
      )}

      {/* Envelopes de orçamento */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {budgets.map(b => {
          const spent    = b.spent ?? 0
          const limit    = b.limit_amount ?? 0
          const pctVal   = limit > 0 ? (spent / limit) * 100 : 0
          const catName  = b.categoria ?? b.category_id
          const overBudget = pctVal > 100

          return (
            <div key={b.id} style={{
              background: 'var(--card)',
              borderRadius: 'var(--r-md)',
              border: `1px solid ${overBudget ? 'var(--out)' : 'var(--line)'}`,
              padding: '14px 16px',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{catName}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
                    <span className="amount">R$ {fmt(spent)}</span>
                    <span style={{ color: 'var(--ink-4)' }}> / R$ {fmt(limit)}</span>
                  </span>
                  {/* Badge de percentual */}
                  <span style={{
                    fontSize: 10.5,
                    fontFamily: 'var(--mono)',
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: overBudget ? 'var(--out-tint)' : pctVal >= 80 ? 'var(--gold-tint)' : 'var(--tang-tint)',
                    color: overBudget ? 'var(--out)' : pctVal >= 80 ? 'var(--gold)' : 'var(--tang-deep)',
                  }}>
                    {pctVal.toFixed(0)}%
                  </span>
                  {/* Botão remover */}
                  <button
                    onClick={() => handleDelete(b)}
                    disabled={deleting === b.id}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: '2px 4px' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6 6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Barra de progresso */}
              <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(pctVal, 100)}%`,
                  background: progressColor(pctVal),
                  borderRadius: 3,
                  transition: 'width 0.4s ease',
                }} />
              </div>

              {overBudget && (
                <div style={{ fontSize: 11, color: 'var(--out)', marginTop: 4 }}>
                  Excedeu em R$ {fmt(spent - limit)}
                </div>
              )}
            </div>
          )
        })}

        {budgets.length === 0 && !showForm && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>◎</div>
            <div style={{ fontSize: 14 }}>Nenhum orçamento definido para este mês</div>
            <button
              onClick={() => setShowForm(true)}
              style={{ marginTop: 12, padding: '8px 16px', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--tang)', color: 'white', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--sans)' }}
            >
              + Criar envelope
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
