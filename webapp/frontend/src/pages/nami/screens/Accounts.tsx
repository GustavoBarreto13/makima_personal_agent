// Tela de Contas da seção Nami.
// Lista as contas cadastradas com saldo e permite adicionar/remover.

import { useState } from 'react'
import { namiApi } from '../namiApi'
import type { Account } from '../types'

interface AccountsProps {
  accounts: Account[]
  onToast: (msg: string) => void
  onAccountsChanged: () => void
  // Props extras do commonProps não usadas aqui
  month?: string
  stats?: unknown
  cards?: unknown
  subscriptions?: unknown
  onTransactionSaved?: unknown
  onNavigate?: unknown
  onOpenAddModal?: unknown
}

const ACCOUNT_TYPES = [
  { value: 'corrente',   label: 'Conta Corrente' },
  { value: 'poupanca',   label: 'Poupança' },
  { value: 'dinheiro',   label: 'Dinheiro (carteira)' },
  { value: 'investimento', label: 'Investimento' },
]

// Cores de acento para as contas
const ACCOUNT_COLORS = [
  'oklch(0.94 0.04 42)',   // tangerina tint
  'oklch(0.93 0.04 230)',  // azul tint
  'oklch(0.95 0.04 162)',  // verde tint
  'oklch(0.95 0.05 15)',   // coral tint
  'oklch(0.95 0.04 78)',   // ouro tint
]

function fmt(v: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v)
}

/** Tela de gerenciamento de contas financeiras. */
export function Accounts({ accounts, onToast, onAccountsChanged }: AccountsProps) {
  // Controla exibição do formulário de nova conta
  const [showForm, setShowForm] = useState(false)
  // Campos do formulário
  const [name, setName]               = useState('')
  const [type, setType]               = useState('corrente')
  const [balance, setBalance]         = useState('')
  const [color, setColor]             = useState(ACCOUNT_COLORS[0])
  const [short, setShort]             = useState('')
  const [saving, setSaving]           = useState(false)
  const [deleting, setDeleting]       = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await namiApi.createAccount({
        name: name.trim(),
        type,
        balance_inicial: parseFloat(balance.replace(',', '.') || '0'),
        color,
        short: short.trim().slice(0, 2).toUpperCase() || name.trim().slice(0, 2).toUpperCase(),
      })
      setName('')
      setBalance('')
      setShort('')
      setShowForm(false)
      await onAccountsChanged()
      onToast('Conta cadastrada ✓')
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Erro ao cadastrar conta')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await namiApi.deleteAccount(id)
      await onAccountsChanged()
      onToast('Conta removida')
    } catch {
      onToast('Erro ao remover conta')
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

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>

      {/* Cabeçalho com botão de adicionar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
          {accounts.length} {accounts.length === 1 ? 'conta' : 'contas'} ativas
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
          {showForm ? '✕ Cancelar' : '+ Nova conta'}
        </button>
      </div>

      {/* Formulário de nova conta */}
      {showForm && (
        <form onSubmit={handleCreate} style={{
          background: 'var(--card)',
          borderRadius: 'var(--r-md)',
          border: '1.5px solid var(--tang)',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>
            Nova conta
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Nome</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Nubank, Itaú…" style={inputStyle} required />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Tipo</label>
              <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
                {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Saldo inicial (R$)</label>
              <input type="text" inputMode="decimal" value={balance} onChange={e => setBalance(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0,00" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Sigla (2 letras)</label>
              <input value={short} onChange={e => setShort(e.target.value.slice(0, 2))} maxLength={2} placeholder="Nu, BT…" style={{ ...inputStyle, textTransform: 'uppercase' }} />
            </div>
          </div>

          {/* Seletor de cor */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Cor</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {ACCOUNT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: c,
                    border: color === c ? '2px solid var(--ink)' : '2px solid var(--line)',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '9px',
              borderRadius: 'var(--r-md)',
              border: 'none',
              background: 'var(--tang)',
              color: 'white',
              fontSize: 13.5,
              fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
              fontFamily: 'var(--sans)',
            }}
          >
            {saving ? 'Salvando…' : 'Cadastrar conta'}
          </button>
        </form>
      )}

      {/* Lista de contas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {accounts.map(acc => (
          <div key={acc.id} style={{
            background: 'var(--card)',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--line)',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            boxShadow: 'var(--shadow-sm)',
          }}>
            {/* Avatar da conta */}
            <div style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              background: acc.color ?? 'var(--tang-tint)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--tang-deep)',
              fontFamily: 'var(--mono)',
              flexShrink: 0,
              overflow: 'hidden',
            }}>
              {acc.icon_url
                ? <img src={acc.icon_url} alt={acc.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (acc.short ?? acc.name.slice(0, 2).toUpperCase())
              }
            </div>

            {/* Informações */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{acc.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>
                {ACCOUNT_TYPES.find(t => t.value === acc.type)?.label ?? acc.type}
              </div>
            </div>

            {/* Saldo */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div className="amount" style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
                R$ {fmt(acc.balance_inicial ?? 0)}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                saldo inicial
              </div>
            </div>

            {/* Botão de remover */}
            <button
              onClick={() => handleDelete(acc.id)}
              disabled={deleting === acc.id}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--ink-4)',
                padding: '6px',
                borderRadius: 'var(--r-sm)',
                opacity: deleting === acc.id ? 0.4 : 0.7,
                flexShrink: 0,
              }}
              title="Remover conta"
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

        {accounts.length === 0 && !showForm && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🏦</div>
            <div style={{ fontSize: 14 }}>Nenhuma conta cadastrada</div>
            <button
              onClick={() => setShowForm(true)}
              style={{ marginTop: 12, padding: '8px 16px', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--tang)', color: 'white', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--sans)' }}
            >
              + Cadastrar primeira conta
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
