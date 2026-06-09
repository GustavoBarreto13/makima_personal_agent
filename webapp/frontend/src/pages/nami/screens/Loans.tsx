// Tela de Empréstimos da seção Nami.
// Portada do handoff de referência (docs/.../nami/screens-b.jsx → Emprestimos).
// Exibe stat-row (a receber / a pagar) e grade de cards de empréstimo informal.

import { useState, useEffect } from 'react'
import { namiApi } from '../namiApi'
import type { PersonalLoan } from '../types'
import { LoanCard } from '../components/LoanCard'
import { FormModal } from '../modals/FormModal'
import { Icon } from '../icons'
import { fmtMoney } from '../ui'

interface LoansProps {
  onToast: (msg: string) => void
  // Props do commonProps não usadas aqui
  stats?: unknown; accounts?: unknown; cards?: unknown; subscriptions?: unknown; month?: string
  onTransactionSaved?: unknown; onNavigate?: unknown; onOpenAddModal?: unknown
}

export function Loans({ onToast }: LoansProps) {
  const [loans, setLoans]           = useState<PersonalLoan[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Carrega empréstimos ao montar (não depende do mês)
  useEffect(() => {
    setLoading(true)
    namiApi.getPersonalLoans()
      .then(r => setLoans(r.loans ?? []))
      .catch(() => setLoans([]))
      .finally(() => setLoading(false))
  }, [])

  // Valor a receber: soma dos saldos dos empréstimos que o usuário fez
  const toReceive = loans
    .filter(l => l.direction === 'lent')
    .reduce((s, l) => {
      const pct = l.installments > 0 ? l.paid_installments / l.installments : 0
      return s + l.total_amount * (1 - pct)
    }, 0)

  // Valor a pagar: soma dos saldos dos empréstimos que o usuário tomou
  const toPay = loans
    .filter(l => l.direction === 'borrowed')
    .reduce((s, l) => {
      const pct = l.installments > 0 ? l.paid_installments / l.installments : 0
      return s + l.total_amount * (1 - pct)
    }, 0)

  const lentCount     = loans.filter(l => l.direction === 'lent').length
  const borrowedCount = loans.filter(l => l.direction === 'borrowed').length

  async function handleSave(values: Record<string, unknown>) {
    setSaving(true)
    try {
      await namiApi.createPersonalLoan({
        direction:    String(values.dir ?? 'lent') as 'lent' | 'borrowed',
        person_name:  String(values.person ?? ''),
        total_amount: parseFloat(String(values.total ?? '0').replace(',', '.')),
        installments: parseInt(String(values.installments ?? '1')),
        next_due_day: values.nextDay ? parseInt(String(values.nextDay)) : undefined,
        note:         String(values.note ?? '') || undefined,
      })
      onToast('Empréstimo registrado ✓')
      setShowForm(false)
      const r = await namiApi.getPersonalLoans()
      setLoans(r.loans ?? [])
    } catch (err: unknown) {
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await namiApi.deletePersonalLoan(id)
      setLoans(prev => prev.filter(l => l.id !== id))
      onToast('Empréstimo removido')
    } catch {
      onToast('Erro ao remover empréstimo')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      {/* Cabeçalho da página */}
      <div className="page-head">
        <h2>Empréstimos</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Icon name="plus" size={14} /> Novo empréstimo
        </button>
      </div>

      {/* Stat-row: a receber (verde) + a pagar (coral) */}
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">A receber</div>
          <div className="stat-val in">
            <span className="amount">{fmtMoney(toReceive)}</span>
          </div>
          <div className="stat-detail">
            {lentCount} pessoa{lentCount !== 1 ? 's' : ''} te devem
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">A pagar</div>
          <div className="stat-val out">
            <span className="amount">{fmtMoney(toPay)}</span>
          </div>
          <div className="stat-detail">
            você deve a {borrowedCount} pessoa{borrowedCount !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Grade de cards de empréstimo */}
      {loading ? (
        <div className="loading">
          <Icon name="handshake" size={20} /> Carregando empréstimos…
        </div>
      ) : loans.length === 0 ? (
        <div className="empty">
          <Icon name="handshake" size={32} />
          <p>Nenhum empréstimo registrado</p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={14} /> Registrar empréstimo
          </button>
        </div>
      ) : (
        <div className="loan-grid">
          {loans.map(loan => (
            <LoanCard
              key={loan.id}
              loan={loan}
              onDelete={handleDelete}
              deleting={deletingId === loan.id}
            />
          ))}
        </div>
      )}

      {/* Modal de novo empréstimo */}
      {showForm && (
        <FormModal
          title="Novo empréstimo"
          saving={saving}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
          saveLabel="Registrar"
          fields={[
            {
              key: 'dir',
              label: 'Direção',
              type: 'segment',
              options: [
                { value: 'lent',     label: 'Eu emprestei' },
                { value: 'borrowed', label: 'Peguei emprestado' },
              ],
            },
            { key: 'person',       label: 'Pessoa',                type: 'text',   required: true, placeholder: 'Ex: João, Maria…' },
            { key: 'total',        label: 'Valor total',           type: 'money',  required: true },
            { key: 'installments', label: 'Parcelas',              type: 'number', min: 1, placeholder: '1' },
            { key: 'nextDay',      label: 'Dia do vencimento',     type: 'number', min: 1, max: 28, placeholder: '15' },
            { key: 'note',         label: 'Observação (opcional)', type: 'text',   placeholder: 'Sobre o que foi?' },
          ]}
        />
      )}
    </>
  )
}
