// Tela de Cartões de Crédito da seção Nami.
// Portada do handoff de referência (docs/.../nami/screens-a.jsx → Cartoes).

import { useState, useEffect } from 'react'
import { namiApi } from '../namiApi'
import type { Card, Account, CardInstallment } from '../types'
import { FormModal } from '../modals/FormModal'
import { Icon } from '../icons'
import { fmtMoney, monthShort } from '../ui'

interface CardsProps {
  cards: Card[]
  accounts: Account[]
  onToast: (msg: string) => void
  onCardsChanged: () => void
  onNavigate?: (view: string) => void
  month?: string; stats?: unknown; subscriptions?: unknown
  onTransactionSaved?: unknown; onOpenAddModal?: unknown
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

export function Cards({ cards, accounts, onToast, onCardsChanged, onNavigate }: CardsProps) {
  const [showForm, setShowForm]     = useState(false)
  const [editingCard, setEditingCard] = useState<Card | null>(null)
  const [saving, setSaving]         = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Modal de pagamento de fatura (spec 042, US3)
  const [payingCard, setPayingCard] = useState<Card | null>(null)
  const [paySaving, setPaySaving]   = useState(false)

  // Parcelamentos ativos por cartão (spec 041, US3) — carregados sob demanda,
  // um mapa cardId → {installments, monthly_commitment, ends_month}
  const [cardInstallments, setCardInstallments] = useState<Record<string, {
    installments: CardInstallment[]; monthly_commitment: number; ends_month: string | null
  }>>({})

  useEffect(() => {
    cards.forEach(card => {
      namiApi.getCardInstallments(card.id)
        .then(r => setCardInstallments(prev => ({ ...prev, [card.id]: r })))
        .catch(() => {})
    })
  }, [cards])

  function goToInstallment(groupId: string) {
    sessionStorage.setItem('nami:highlight-installment', groupId)
    onNavigate?.('parcelamentos')
  }

  const accountOptions = accounts.map(a => ({ value: a.name, label: a.name }))

  async function handleSave(values: Record<string, unknown>) {
    setSaving(true)
    try {
      if (editingCard) {
        // Edição (spec 043) — preserva o histórico de transações vinculadas ao cartão
        await namiApi.updateCard(editingCard.id, {
          name:        String(values.name ?? ''),
          limite:      parseFloat(String(values.limite ?? '0').replace(',', '.')),
          closing_day: parseInt(String(values.closing_day ?? '1')),
          due_day:     parseInt(String(values.due_day ?? '1')),
          brand:       String(values.brand ?? '') || undefined,
          last4:       String(values.last4 ?? '') || undefined,
          grad:        String(values.grad ?? '') || undefined,
        })
        onToast('Cartão atualizado ✓')
      } else {
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
      }
      setShowForm(false)
      setEditingCard(null)
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

  async function handlePay(values: Record<string, unknown>) {
    if (!payingCard) return
    setPaySaving(true)
    try {
      const valor = parseFloat(String(values.valor ?? '0').replace(',', '.'))
      if (!valor || valor <= 0) throw new Error('Informe um valor válido')
      await namiApi.payCardBill(payingCard.id, valor, String(values.data ?? '') || undefined)
      onToast(`Pagamento de ${fmtMoney(valor)} registrado ✓`)
      setPayingCard(null)
      onCardsChanged()
    } catch (err: unknown) { throw err }
    finally { setPaySaving(false) }
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
                  <span style={{ color: 'var(--muted)' }}>Dívida atual</span>
                  <span className="amount" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {fmtMoney(card.divida_atual ?? 0)} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>/ {fmtMoney(card.limite)}</span>
                  </span>
                </div>
                <div className="cc-limit-track">
                  <div className="cc-limit-fill" style={{ width: `${Math.min(card.utilizacao_pct ?? 0, 100)}%` }} />
                </div>
                <div className="cc-dates">
                  <span>Fecha dia <strong>{card.closing_day}</strong></span>
                  <span>Vence dia <strong>{card.due_day}</strong></span>
                </div>
              </div>
              <div className="cc-foot-row">
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{card.status}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setPayingCard(card)}>
                    Registrar pagamento
                  </button>
                  <button className="acct-del" onClick={() => { setEditingCard(card); setShowForm(true) }} aria-label="Editar cartão">
                    <Icon name="edit" size={12} />
                  </button>
                  <button className="acct-del" onClick={() => handleDelete(card.id)} disabled={deletingId === card.id} aria-label="Remover">
                    <Icon name="trash" size={12} />
                  </button>
                </div>
              </div>

              {/* Parcelamentos ativos do cartão — comprometimento mensal da fatura (spec 041) */}
              {(cardInstallments[card.id]?.installments.length ?? 0) > 0 && (
                <div style={{ borderTop: '1px solid var(--line)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
                    <span>Parcelamentos ativos</span>
                    <span>
                      {fmtMoney(cardInstallments[card.id]!.monthly_commitment)}/mês
                      {cardInstallments[card.id]!.ends_month && ` até ${monthShort(cardInstallments[card.id]!.ends_month!)}`}
                    </span>
                  </div>
                  {cardInstallments[card.id]!.installments.map(inst => (
                    <button
                      key={inst.id}
                      onClick={() => goToInstallment(inst.id)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', fontSize: 12,
                        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
                        color: 'var(--ink)', textAlign: 'left',
                      }}
                    >
                      <span>{inst.name} · {inst.parcelas_pagas}/{inst.num_parcelas}</span>
                      <span className="amount">{fmtMoney(inst.valor_parcela)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <FormModal
          title={editingCard ? `Editar ${editingCard.name}` : 'Novo cartão'}
          saving={saving}
          onClose={() => { setShowForm(false); setEditingCard(null) }}
          onSave={handleSave}
          saveLabel={editingCard ? 'Salvar alterações' : 'Criar cartão'}
          initialValues={editingCard ? {
            name: editingCard.name,
            limite: String(editingCard.limite ?? 0),
            closing_day: String(editingCard.closing_day ?? ''),
            due_day: String(editingCard.due_day ?? ''),
            brand: editingCard.brand ?? '',
            last4: editingCard.last4 ?? '',
            grad: editingCard.grad ?? '',
          } : undefined}
          fields={[
            { key: 'name',         label: 'Nome do cartão',       type: 'text',   required: true, placeholder: 'Ex.: Nubank Roxinho' },
            // Conta vinculada não é editável (update_credit_card não altera o account_id) — só na criação
            ...(editingCard ? [] : [{ key: 'account_name', label: 'Conta vinculada', type: 'select' as const, options: accountOptions }]),
            { key: 'limite',       label: 'Limite',               type: 'money',  required: true },
            { key: 'closing_day',  label: 'Dia de fechamento',    type: 'number', min: 1, max: 28, placeholder: '25' },
            { key: 'due_day',      label: 'Dia de vencimento',    type: 'number', min: 1, max: 28, placeholder: '5' },
            { key: 'brand',        label: 'Bandeira',             type: 'select', options: BRAND_OPTIONS },
            { key: 'last4',        label: 'Últimos 4 dígitos',    type: 'text',   placeholder: '1234' },
            { key: 'grad',         label: 'Gradiente do plástico',type: 'select', options: CARD_GRADS },
          ]}
        />
      )}

      {/* Modal de pagamento de fatura (spec 042) */}
      {payingCard && (
        <FormModal
          title={`Registrar pagamento — ${payingCard.name}`}
          saving={paySaving}
          onClose={() => setPayingCard(null)}
          onSave={handlePay}
          saveLabel="Registrar pagamento"
          fields={[
            { key: 'valor', label: 'Valor pago', type: 'money', required: true },
            { key: 'data',  label: 'Data (vazio = hoje)', type: 'date' },
          ]}
        >
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Dívida atual: {fmtMoney(payingCard.divida_atual ?? 0)}
          </div>
        </FormModal>
      )}
    </>
  )
}
