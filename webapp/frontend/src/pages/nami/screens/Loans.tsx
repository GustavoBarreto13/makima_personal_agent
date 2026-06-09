// Tela de Empréstimos pessoa-a-pessoa da seção Nami.
// Separa em "Emprestei" e "Me emprestaram" com progresso de parcelas.
// Usa a nova tabela personal_loans criada pela migração 002.

import { useState, useEffect } from 'react'
import { namiApi } from '../namiApi'
import type { PersonalLoan } from '../types'

interface LoansProps {
  onToast: (msg: string) => void
  // Stats não usadas aqui, mas fazem parte da assinatura esperada
  stats?: unknown
}

function fmt(v: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v)
}

/** Tela de empréstimos informais pessoa-a-pessoa (tabela personal_loans). */
export function Loans({ onToast }: LoansProps) {
  const [loans, setLoans]         = useState<PersonalLoan[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [direction, setDirection] = useState<'lent' | 'borrowed'>('lent')
  const [personName, setPersonName] = useState('')
  const [total, setTotal]         = useState('')
  const [installments, setInstallments] = useState('1')
  const [nextDueDay, setNextDueDay]     = useState('')
  const [note, setNote]           = useState('')
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    namiApi.getPersonalLoans()
      .then(r => setLoans(r.loans ?? []))
      .catch(() => setLoans([]))
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!personName.trim() || !total) return
    setSaving(true)
    try {
      await namiApi.createPersonalLoan({
        direction,
        person_name: personName.trim(),
        total_amount: parseFloat(total.replace(',', '.')),
        installments: parseInt(installments || '1'),
        next_due_day: nextDueDay ? parseInt(nextDueDay) : undefined,
        note,
      })
      setPersonName(''); setTotal(''); setInstallments('1'); setNextDueDay(''); setNote('')
      setShowForm(false)
      const r = await namiApi.getPersonalLoans()
      setLoans(r.loans ?? [])
      onToast('Empréstimo registrado ✓')
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Erro ao registrar empréstimo')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await namiApi.deletePersonalLoan(id)
      setLoans(prev => prev.filter(l => l.id !== id))
      onToast('Empréstimo removido')
    } catch {
      onToast('Erro ao remover')
    } finally {
      setDeleting(null)
    }
  }

  const lent     = loans.filter(l => l.direction === 'lent')
  const borrowed = loans.filter(l => l.direction === 'borrowed')

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

  // Componente para renderizar uma lista de empréstimos
  function LoanList({ items, accent }: { items: PersonalLoan[]; accent: string }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(loan => {
          const pctPaid = loan.installments > 0 ? (loan.paid_installments / loan.installments) * 100 : 0
          const remaining = loan.total_amount - (loan.total_amount * pctPaid / 100)

          return (
            <div key={loan.id} style={{
              background: 'var(--card)',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--line)',
              padding: '14px 16px',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{loan.person_name}</div>
                  {loan.note && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{loan.note}</div>}
                  {loan.next_due_day && (
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                      Vence dia {loan.next_due_day}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div className="amount" style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                      R$ {fmt(remaining)}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>
                      de R$ {fmt(loan.total_amount)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(loan.id)}
                    disabled={deleting === loan.id}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: '4px 6px', opacity: deleting === loan.id ? 0.4 : 0.7 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6 6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Progresso de parcelas */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-4)', marginBottom: 4 }}>
                <span>{loan.paid_installments}/{loan.installments} parcelas</span>
                <span>{pctPaid.toFixed(0)}%</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${pctPaid}%`,
                  background: accent,
                  borderRadius: 3,
                  transition: 'width 0.4s',
                }} />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink-3)' }}>
        Carregando…
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 640 }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
          {loans.length} {loans.length === 1 ? 'empréstimo' : 'empréstimos'} registrados
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
          {showForm ? '✕ Cancelar' : '+ Registrar empréstimo'}
        </button>
      </div>

      {/* Formulário */}
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
          {/* Seletor de direção */}
          <div style={{ display: 'flex', gap: 8 }}>
            {(['lent', 'borrowed'] as const).map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: 'var(--r-sm)',
                  border: `1.5px solid ${direction === d ? 'var(--tang)' : 'var(--line)'}`,
                  background: direction === d ? 'var(--tang-tint)' : 'transparent',
                  color: direction === d ? 'var(--tang-deep)' : 'var(--ink-2)',
                  fontSize: 13,
                  fontWeight: direction === d ? 600 : 400,
                  cursor: 'pointer',
                  fontFamily: 'var(--sans)',
                }}
              >
                {d === 'lent' ? '🤝 Eu emprestei' : '📥 Me emprestaram'}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Nome da pessoa</label>
              <input value={personName} onChange={e => setPersonName(e.target.value)} placeholder="Ex.: Carlos, Ana…" style={inputStyle} required />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Valor total (R$)</label>
              <input type="text" inputMode="decimal" value={total} onChange={e => setTotal(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0,00" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} required />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Nº de parcelas</label>
              <input type="number" min={1} value={installments} onChange={e => setInstallments(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Vencimento (dia do mês)</label>
              <input type="number" min={1} max={28} value={nextDueDay} onChange={e => setNextDueDay(e.target.value)} placeholder="1–28" style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Observação</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Ex.: para comprar moto…" style={inputStyle} />
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
            {saving ? 'Salvando…' : 'Registrar'}
          </button>
        </form>
      )}

      {/* Seção: Emprestei */}
      {lent.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--in)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            🤝 Eu emprestei ({lent.length})
          </div>
          <LoanList items={lent} accent="var(--in)" />
        </div>
      )}

      {/* Seção: Me emprestaram */}
      {borrowed.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--out)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            📥 Me emprestaram ({borrowed.length})
          </div>
          <LoanList items={borrowed} accent="var(--out)" />
        </div>
      )}

      {loans.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🤝</div>
          <div style={{ fontSize: 14 }}>Nenhum empréstimo registrado</div>
          <button
            onClick={() => setShowForm(true)}
            style={{ marginTop: 12, padding: '8px 16px', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--tang)', color: 'white', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--sans)' }}
          >
            + Registrar empréstimo
          </button>
        </div>
      )}
    </div>
  )
}
