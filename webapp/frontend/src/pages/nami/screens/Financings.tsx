// Tela de Financiamentos da seção Nami.
// Portada do handoff de referência (docs/.../nami/screens-b.jsx → Financiamentos).
// Exibe stat-row (saldo devedor / parcelas-mês) e grade de cards de financiamento.

import { useState, useEffect } from 'react'
import { namiApi } from '../namiApi'
import type { Financing } from '../types'
import { FinancingCard } from '../components/LoanCard'
import { FormModal } from '../modals/FormModal'
import { Icon } from '../icons'
import { fmtMoney } from '../ui'

interface FinancingsProps {
  onToast: (msg: string) => void
  // Props do commonProps não usadas aqui
  stats?: unknown; accounts?: unknown; cards?: unknown; subscriptions?: unknown; month?: string
  onTransactionSaved?: unknown; onNavigate?: unknown; onOpenAddModal?: unknown
}

export function Financings({ onToast }: FinancingsProps) {
  const [financings, setFinancings] = useState<Financing[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Carrega financiamentos ao montar (não depende do mês)
  useEffect(() => {
    setLoading(true)
    namiApi.getFinancings()
      .then(r => setFinancings(r.financings ?? []))
      .catch(() => setFinancings([]))
      .finally(() => setLoading(false))
  }, [])

  // Saldo devedor total: parcelas restantes × valor por parcela
  const totalDebt = financings.reduce((s, f) => {
    const remaining  = f.installments - f.paid_installments
    const installVal = f.installments > 0 ? f.total_amount / f.installments : 0
    return s + remaining * installVal
  }, 0)

  // Total de parcelas correntes do mês (apenas financiamentos não quitados)
  const monthlyDue = financings.reduce((s, f) => {
    if (f.paid_installments < f.installments) {
      return s + f.total_amount / f.installments
    }
    return s
  }, 0)

  async function handleSave(values: Record<string, unknown>) {
    setSaving(true)
    try {
      await namiApi.createFinancing({
        description:       String(values.description ?? ''),
        lender:            String(values.lender ?? '') || undefined,
        total_amount:      parseFloat(String(values.total ?? '0').replace(',', '.')),
        installments:      parseInt(String(values.installments ?? '12')),
        paid_installments: parseInt(String(values.paid ?? '0')),
        next_due_day:      values.nextDay ? parseInt(String(values.nextDay)) : undefined,
        interest_rate:     String(values.rate ?? '') || undefined,
        note:              String(values.note ?? '') || undefined,
      })
      onToast('Financiamento registrado ✓')
      setShowForm(false)
      const r = await namiApi.getFinancings()
      setFinancings(r.financings ?? [])
    } catch (err: unknown) {
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await namiApi.deleteFinancing(id)
      setFinancings(prev => prev.filter(f => f.id !== id))
      onToast('Financiamento removido')
    } catch {
      onToast('Erro ao remover financiamento')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      {/* Cabeçalho da página */}
      <div className="page-head">
        <h2>Financiamentos</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Icon name="plus" size={14} /> Novo financiamento
        </button>
      </div>

      {/* Stat-row: saldo devedor total + comprometimento mensal */}
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">Saldo devedor</div>
          <div className="stat-val out">
            <span className="amount">{fmtMoney(totalDebt)}</span>
          </div>
          <div className="stat-detail">
            {financings.length} contrato{financings.length !== 1 ? 's' : ''} em aberto
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Parcelas / mês</div>
          <div className="stat-val">
            <span className="amount">{fmtMoney(monthlyDue)}</span>
          </div>
          <div className="stat-detail">comprometido mensalmente</div>
        </div>
      </div>

      {/* Grade de cards de financiamento */}
      {loading ? (
        <div className="loading">
          <Icon name="building" size={20} /> Carregando financiamentos…
        </div>
      ) : financings.length === 0 ? (
        <div className="empty">
          <Icon name="building" size={32} />
          <p>Nenhum financiamento em aberto</p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={14} /> Registrar financiamento
          </button>
        </div>
      ) : (
        <div className="loan-grid">
          {financings.map(f => (
            <FinancingCard
              key={f.id}
              financing={f}
              onDelete={handleDelete}
              deleting={deletingId === f.id}
            />
          ))}
        </div>
      )}

      {/* Modal de novo financiamento */}
      {showForm && (
        <FormModal
          title="Novo financiamento"
          saving={saving}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
          saveLabel="Registrar"
          fields={[
            { key: 'description', label: 'Descrição',          type: 'text',   required: true, placeholder: 'Ex: Carro, Apartamento…' },
            { key: 'lender',      label: 'Credor / banco',     type: 'text',   placeholder: 'Ex: Santander, Caixa…' },
            { key: 'total',       label: 'Valor financiado',   type: 'money',  required: true },
            { key: 'installments', label: 'Total de parcelas', type: 'number', min: 1, placeholder: '12' },
            { key: 'paid',        label: 'Parcelas já pagas',  type: 'number', min: 0, placeholder: '0' },
            { key: 'nextDay',     label: 'Dia do vencimento',  type: 'number', min: 1, max: 28, placeholder: '10' },
            { key: 'rate',        label: 'Taxa (opcional)',    type: 'text',   placeholder: 'Ex: 1,2% a.m.' },
            { key: 'note',        label: 'Observação',         type: 'text',   placeholder: 'Observações…' },
          ]}
        />
      )}
    </>
  )
}
