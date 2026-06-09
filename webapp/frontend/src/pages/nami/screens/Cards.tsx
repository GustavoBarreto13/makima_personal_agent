// Tela de Cartões de Crédito da seção Nami.
// Portada do handoff de referência (docs/.../nami/screens-a.jsx → Cartoes).

import { useState } from 'react'
import { namiApi } from '../namiApi'
import type { Card, Account } from '../types'
import { FormModal } from '../modals/FormModal'
import { Icon } from '../icons'
import { fmtMoney } from '../ui'

interface CardsProps {
  cards: Card[]
  accounts: Account[]
  onToast: (msg: string) => void
  onCardsChanged: () => void
  month?: string; stats?: unknown; subscriptions?: unknown
  onTransactionSaved?: unknown; onNavigate?: unknown; onOpenAddModal?: unknown
}

const BRAND_OPTIONS = [
  { value: 'Mastercard',       label: 'Mastercard' },
  { value: 'Visa',             label: 'Visa' },
  { value: 'Elo',              label: 'Elo' },
  { value: 'American Express', label: 'Amex' },
]

const CARD_GRADS = [
  { value: 'linear-gradient(135deg, oklch(0.25 0.08 260), oklch(0.15 0.05 280))', label: 'Grafite' },
  { value: 'linear-gradient(135deg, oklch(0.40 0.12 260), oklch(0.28 0.08 280))', label: 'Azul noite' },
  { value: 'linear-gradient(135deg, oklch(0.65 0.16 30), oklch(0.50 0.14 15))',   label: 'Coral' },
  { value: 'linear-gradient(135deg, oklch(0.65 0.15 145), oklch(0.45 0.12 160))', label: 'Verde' },
  { value: 'linear-gradient(135deg, oklch(0.70 0.14 85), oklch(0.55 0.12 70))',   label: 'Ouro' },
  { value: 'linear-gradient(135deg, oklch(0.55 0.14 300), oklch(0.38 0.10 320))', label: 'Roxo' },
]

export function Cards({ cards, accounts, onToast, onCardsChanged }: CardsProps) {
  const [showForm, setShowForm]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const accountOptions = accounts.map(a => ({ value: a.name, label: a.name }))

  async function handleSave(values: Record<string, unknown>) {
    setSaving(true)
    try {
      await namiApi.createCard({
        name:         String(values.name ?? ''),
        account_name: String(values.account_name ?? ''),
        limite:       parseFloat(String(values.limite ?? '0').replace(',', '.')),
        closing_day:  parseInt(String(values.closing_day ?? '1')),
        due_day:      parseInt(String(values.due_day ?? '1')),
        brand:        String(values.brand ?? '') || undefined,
        last4:        String(values.last4 ?? '') || undefined,
        grad:         String(values.grad ?? '') || undefined,
      })
      onToast('Cartão criado ✓')
      setShowForm(false)
      onCardsChanged()
    } catch (err: unknown) { throw err }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await namiApi.deleteCard(id)
      onToast('Cartão removido')
      onCardsChanged()
    } catch { onToast('Erro ao remover cartão') }
    finally { setDeletingId(null) }
  }

  return (
    <>
      <div className="page-head">
        <h2>Cartões</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Icon name="plus" size={14} /> Novo cartão
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="empty">
          <Icon name="card" size={32} />
          <p>Nenhum cartão cadastrado</p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={14} /> Novo cartão
          </button>
        </div>
      ) : (
        <div className="cc-grid">
          {cards.map(card => (
            <div key={card.id} className="cc-card">
              <div className="cc-plastic" style={{ background: card.grad ?? CARD_GRADS[0].value }}>
                <div className="cc-chip" />
                <div className="cc-num">•••• •••• •••• {card.last4 ?? '????'}</div>
                <div className="cc-foot">
                  <div className="cc-holder">{card.name}</div>
                  {card.brand && <div className="cc-brand">{card.brand}</div>}
                </div>
              </div>
              <div className="cc-info">
                <div className="cc-name">{card.name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: 'var(--muted)' }}>Limite</span>
                  <span className="amount" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmtMoney(card.limite)}</span>
                </div>
                <div className="cc-limit-track"><div className="cc-limit-fill" style={{ width: '0%' }} /></div>
                <div className="cc-dates">
                  <span>Fecha dia <strong>{card.closing_day}</strong></span>
                  <span>Vence dia <strong>{card.due_day}</strong></span>
                </div>
              </div>
              <div className="cc-foot-row">
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{card.status}</span>
                <button className="acct-del" onClick={() => handleDelete(card.id)} disabled={deletingId === card.id} aria-label="Remover">
                  <Icon name="trash" size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <FormModal
          title="Novo cartão"
          saving={saving}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
          saveLabel="Criar cartão"
          fields={[
            { key: 'name',         label: 'Nome do cartão',       type: 'text',   required: true, placeholder: 'Ex.: Nubank Roxinho' },
            { key: 'account_name', label: 'Conta vinculada',      type: 'select', options: accountOptions },
            { key: 'limite',       label: 'Limite',               type: 'money',  required: true },
            { key: 'closing_day',  label: 'Dia de fechamento',    type: 'number', min: 1, max: 28, placeholder: '25' },
            { key: 'due_day',      label: 'Dia de vencimento',    type: 'number', min: 1, max: 28, placeholder: '5' },
            { key: 'brand',        label: 'Bandeira',             type: 'select', options: BRAND_OPTIONS },
            { key: 'last4',        label: 'Últimos 4 dígitos',    type: 'text',   placeholder: '1234' },
            { key: 'grad',         label: 'Gradiente do plástico',type: 'select', options: CARD_GRADS },
          ]}
        />
      )}
    </>
  )
}
