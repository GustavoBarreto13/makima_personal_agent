// Tela de Financiamentos da seção Nami.
// Gerencia financiamentos formais com credor, parcelas e taxa de juros.
// Usa a nova tabela financings criada pela migração 002.

import { useState, useEffect } from 'react'
import { namiApi } from '../namiApi'
import type { Financing, StatsResponse } from '../types'

interface FinancingsProps {
  onToast: (msg: string) => void
  stats: StatsResponse | null
}

function fmt(v: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v)
}

/** Tela de gerenciamento de financiamentos estruturados (carro, imóvel, etc.). */
export function Financings({ onToast }: FinancingsProps) {
  const [financings, setFinancings] = useState<Financing[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [description, setDescription] = useState('')
  const [lender, setLender]         = useState('')
  const [total, setTotal]           = useState('')
  const [installments, setInstallments] = useState('12')
  const [paidInstallments, setPaidInstallments] = useState('0')
  const [nextDueDay, setNextDueDay] = useState('')
  const [interestRate, setInterestRate] = useState('')
  const [note, setNote]             = useState('')
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    namiApi.getFinancings()
      .then(r => setFinancings(r.financings ?? []))
      .catch(() => setFinancings([]))
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim() || !total) return
    setSaving(true)
    try {
      await namiApi.createFinancing({
        description: description.trim(),
        lender: lender.trim() || undefined,
        total_amount: parseFloat(total.replace(',', '.')),
        installments: parseInt(installments || '1'),
        paid_installments: parseInt(paidInstallments || '0'),
        next_due_day: nextDueDay ? parseInt(nextDueDay) : undefined,
        interest_rate: interestRate || undefined,
        note: note || undefined,
      })
      setDescription(''); setLender(''); setTotal('')
      setInstallments('12'); setPaidInstallments('0')
      setNextDueDay(''); setInterestRate(''); setNote('')
      setShowForm(false)
      const r = await namiApi.getFinancings()
      setFinancings(r.financings ?? [])
      onToast('Financiamento registrado ✓')
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Erro ao registrar financiamento')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await namiApi.deleteFinancing(id)
      setFinancings(prev => prev.filter(f => f.id !== id))
      onToast('Financiamento removido')
    } catch {
      onToast('Erro ao remover')
    } finally {
      setDeleting(null)
    }
  }

  // Total de dívida de todos os financiamentos
  const totalDebt = financings.reduce((s, f) => {
    const remaining = f.installments - f.paid_installments
    const installmentValue = f.total_amount / f.installments
    return s + (remaining * installmentValue)
  }, 0)

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
        Carregando…
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>

      {/* Resumo total */}
      {financings.length > 0 && (
        <div style={{ background: 'var(--out-tint)', borderRadius: 'var(--r-md)', padding: '12px 16px', border: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--out)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Saldo devedor total
          </div>
          <div className="amount" style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: 'var(--out)' }}>
            R$ {fmt(totalDebt)}
          </div>
        </div>
      )}

      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
          {financings.length} {financings.length === 1 ? 'financiamento' : 'financiamentos'}
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
          {showForm ? '✕ Cancelar' : '+ Novo financiamento'}
        </button>
      </div>

      {/* Formulário de novo financiamento */}
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Descrição</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex.: Carro Onix, MacBook…" style={inputStyle} required />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Credor</label>
              <input value={lender} onChange={e => setLender(e.target.value)} placeholder="Nubank, Santander…" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Valor total (R$)</label>
              <input type="text" inputMode="decimal" value={total} onChange={e => setTotal(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0,00" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} required />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Total de parcelas</label>
              <input type="number" min={1} value={installments} onChange={e => setInstallments(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Parcelas pagas</label>
              <input type="number" min={0} value={paidInstallments} onChange={e => setPaidInstallments(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Taxa de juros</label>
              <input value={interestRate} onChange={e => setInterestRate(e.target.value)} placeholder="Ex.: 1,2% a.m." style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Vencimento (dia do mês)</label>
              <input type="number" min={1} max={28} value={nextDueDay} onChange={e => setNextDueDay(e.target.value)} placeholder="1–28" style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Observação</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Observações…" style={inputStyle} />
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
            {saving ? 'Salvando…' : 'Registrar financiamento'}
          </button>
        </form>
      )}

      {/* Lista de financiamentos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {financings.map(f => {
          const remaining   = f.installments - f.paid_installments
          const pctPaid     = f.installments > 0 ? (f.paid_installments / f.installments) * 100 : 0
          const installVal  = f.total_amount / f.installments
          const debtLeft    = remaining * installVal

          return (
            <div key={f.id} style={{
              background: 'var(--card)',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--line)',
              padding: '16px',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{f.description}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>
                    {f.lender && <span>{f.lender} · </span>}
                    {f.interest_rate && <span>{f.interest_rate} · </span>}
                    {f.next_due_day && <span>Vence dia {f.next_due_day}</span>}
                  </div>
                  {f.note && <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>{f.note}</div>}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div className="amount" style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--out)' }}>
                      R$ {fmt(debtLeft)}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>
                      {remaining} parcelas restantes
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(f.id)}
                    disabled={deleting === f.id}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: '4px 6px', opacity: deleting === f.id ? 0.4 : 0.7 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6 6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Barra de progresso */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-4)', marginBottom: 4 }}>
                <span>{f.paid_installments}/{f.installments} parcelas pagas</span>
                <span>{pctPaid.toFixed(0)}%</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${pctPaid}%`,
                  background: 'var(--tang)',
                  borderRadius: 3,
                  transition: 'width 0.4s',
                }} />
              </div>
            </div>
          )
        })}

        {financings.length === 0 && !showForm && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🏗</div>
            <div style={{ fontSize: 14 }}>Nenhum financiamento registrado</div>
            <button
              onClick={() => setShowForm(true)}
              style={{ marginTop: 12, padding: '8px 16px', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--tang)', color: 'white', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--sans)' }}
            >
              + Registrar financiamento
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
