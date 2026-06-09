// Tela de Cartões de Crédito da seção Nami.
// Exibe o plástico visual de cada cartão, limite e dívida atual.
// Permite cadastrar e remover cartões.

import { useState } from 'react'
import { namiApi } from '../namiApi'
import type { Card, Account } from '../types'

interface CardsProps {
  cards: Card[]
  accounts: Account[]
  onToast: (msg: string) => void
  onCardsChanged: () => void
  // Props do commonProps não usadas aqui
  month?: string
  stats?: unknown
  subscriptions?: unknown
  onTransactionSaved?: unknown
  onNavigate?: unknown
  onOpenAddModal?: unknown
}

const BRANDS = ['Visa', 'Mastercard', 'Elo', 'American Express', 'Hipercard']

// Gradientes predefinidos para o plástico dos cartões
const CARD_GRADIENTS = [
  'linear-gradient(135deg, oklch(0.28 0.025 250), oklch(0.20 0.020 250))',
  'linear-gradient(135deg, oklch(0.42 0.16 230), oklch(0.32 0.14 230))',
  'linear-gradient(135deg, oklch(0.45 0.12 300), oklch(0.35 0.10 300))',
  'linear-gradient(135deg, oklch(0.52 0.18 42), oklch(0.42 0.16 42))',
  'linear-gradient(135deg, oklch(0.35 0.08 250) 0%, oklch(0.28 0.05 250) 100%)',
]

function fmt(v: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v)
}

/** Tela de gerenciamento de cartões de crédito. */
export function Cards({ cards, accounts, onToast, onCardsChanged }: CardsProps) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName]         = useState('')
  const [account, setAccount]   = useState('')
  const [limite, setLimite]     = useState('')
  const [closingDay, setClosingDay] = useState('1')
  const [dueDay, setDueDay]     = useState('10')
  const [brand, setBrand]       = useState('Visa')
  const [last4, setLast4]       = useState('')
  const [grad, setGrad]         = useState(CARD_GRADIENTS[0])
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !account) return
    setSaving(true)
    try {
      await namiApi.createCard({
        name: name.trim(),
        account_name: account,
        limite: parseFloat(limite.replace(',', '.') || '0'),
        closing_day: parseInt(closingDay),
        due_day: parseInt(dueDay),
        brand,
        last4: last4.slice(0, 4),
        grad,
      })
      setName(''); setLimite(''); setLast4('')
      setShowForm(false)
      await onCardsChanged()
      onToast('Cartão cadastrado ✓')
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Erro ao cadastrar cartão')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await namiApi.deleteCard(id)
      await onCardsChanged()
      onToast('Cartão removido')
    } catch {
      onToast('Erro ao remover cartão')
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

      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
          {cards.length} {cards.length === 1 ? 'cartão' : 'cartões'} ativos
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
          {showForm ? '✕ Cancelar' : '+ Novo cartão'}
        </button>
      </div>

      {/* Formulário de novo cartão */}
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
            Novo cartão
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Nome</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Nubank Roxinho…" style={inputStyle} required />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Bandeira</label>
              <select value={brand} onChange={e => setBrand(e.target.value)} style={inputStyle}>
                {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Conta vinculada</label>
              <select value={account} onChange={e => setAccount(e.target.value)} style={inputStyle} required>
                <option value="">— Selecionar —</option>
                {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Limite (R$)</label>
              <input type="text" inputMode="decimal" value={limite} onChange={e => setLimite(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="5.000,00" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Fechamento (dia)</label>
              <input type="number" min={1} max={28} value={closingDay} onChange={e => setClosingDay(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Vencimento (dia)</label>
              <input type="number" min={1} max={28} value={dueDay} onChange={e => setDueDay(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Últimos 4 dígitos</label>
              <input value={last4} onChange={e => setLast4(e.target.value.replace(/\D/g,'').slice(0,4))} maxLength={4} placeholder="1234" style={{ ...inputStyle, fontFamily: 'var(--mono)', letterSpacing: '0.12em' }} />
            </div>
          </div>

          {/* Seletor de gradiente */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Cor do cartão</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {CARD_GRADIENTS.map((g, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setGrad(g)}
                  style={{
                    width: 36,
                    height: 22,
                    borderRadius: 4,
                    background: g,
                    border: grad === g ? '2px solid var(--ink)' : '2px solid var(--line)',
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
            {saving ? 'Salvando…' : 'Cadastrar cartão'}
          </button>
        </form>
      )}

      {/* Lista de cartões */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {cards.map(card => {
          const limiteNum = card.limite ?? 0
          return (
            <div key={card.id} style={{ position: 'relative' }}>
              {/* Plástico do cartão */}
              <div style={{
                background: card.grad ?? CARD_GRADIENTS[0],
                borderRadius: 'var(--r-lg)',
                padding: '20px 22px',
                color: 'white',
                aspectRatio: '1.6',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: 'var(--shadow-md)',
                position: 'relative',
                overflow: 'hidden',
              }}>
                {/* Decoração: círculos de fundo */}
                <div style={{
                  position: 'absolute',
                  top: -20,
                  right: -20,
                  width: 120,
                  height: 120,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.06)',
                }} />
                <div style={{
                  position: 'absolute',
                  bottom: -30,
                  left: -10,
                  width: 150,
                  height: 150,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.04)',
                }} />

                {/* Topo: nome e bandeira */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    {card.name}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>{card.brand ?? ''}</div>
                </div>

                {/* Fundo: número parcial e limite */}
                <div style={{ position: 'relative' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '0.16em', opacity: 0.7, marginBottom: 6 }}>
                    •••• •••• •••• {card.last4 ?? '••••'}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.8 }}>
                    <span>Fecha dia {card.closing_day} · Vence dia {card.due_day}</span>
                    <span className="amount">Limite R$ {fmt(limiteNum)}</span>
                  </div>
                </div>
              </div>

              {/* Botão de remover */}
              <button
                onClick={() => handleDelete(card.id)}
                disabled={deleting === card.id}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  background: 'rgba(0,0,0,0.4)',
                  border: 'none',
                  borderRadius: 6,
                  color: 'white',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  opacity: deleting === card.id ? 0.4 : 0.7,
                }}
                title="Remover cartão"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          )
        })}

        {cards.length === 0 && !showForm && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>💳</div>
            <div style={{ fontSize: 14 }}>Nenhum cartão cadastrado</div>
            <button
              onClick={() => setShowForm(true)}
              style={{ marginTop: 12, padding: '8px 16px', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--tang)', color: 'white', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--sans)' }}
            >
              + Cadastrar cartão
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
