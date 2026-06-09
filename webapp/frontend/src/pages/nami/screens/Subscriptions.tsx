// Tela de Assinaturas da seção Nami.
// Lista serviços recorrentes com custo total mensal e anual.
// Permite cadastrar e cancelar assinaturas.

import { useState } from 'react'
import { namiApi } from '../namiApi'
import type { Subscription } from '../types'

interface SubscriptionsProps {
  subscriptions: Subscription[]
  onToast: (msg: string) => void
  onSubscriptionsChanged: () => void
  // Props do commonProps não usadas aqui
  month?: string
  stats?: unknown
  accounts?: unknown
  cards?: unknown
  onTransactionSaved?: unknown
  onNavigate?: unknown
  onOpenAddModal?: unknown
}

const SUB_CATEGORIES = [
  'Assinaturas','Entretenimento','Saude','Educacao','Software','Outros'
]

function fmt(v: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v)
}

/** Tela de gerenciamento de assinaturas recorrentes. */
export function Subscriptions({ subscriptions, onToast, onSubscriptionsChanged }: SubscriptionsProps) {
  const [showForm, setShowForm]       = useState(false)
  const [name, setName]               = useState('')
  const [valor, setValor]             = useState('')
  const [ciclo, setCiclo]             = useState('mensal')
  const [categoria, setCategoria]     = useState('Assinaturas')
  const [nextBillingDay, setNextBillingDay] = useState('')
  const [saving, setSaving]           = useState(false)
  const [deleting, setDeleting]       = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !valor) return
    setSaving(true)
    try {
      await namiApi.createSubscription({
        name: name.trim(),
        valor: parseFloat(valor.replace(',', '.')),
        ciclo,
        categoria,
        next_billing_day: nextBillingDay ? parseInt(nextBillingDay) : undefined,
      })
      setName(''); setValor(''); setNextBillingDay('')
      setShowForm(false)
      await onSubscriptionsChanged()
      onToast('Assinatura cadastrada ✓')
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : 'Erro ao cadastrar assinatura')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await namiApi.deleteSubscription(id)
      await onSubscriptionsChanged()
      onToast('Assinatura removida')
    } catch {
      onToast('Erro ao remover assinatura')
    } finally {
      setDeleting(null)
    }
  }

  // Calcula totais mensais e anuais
  const active = subscriptions.filter(s => s.status === 'ativa')
  const totalMensal = active.reduce((s, sub) =>
    s + (sub.ciclo === 'mensal' ? sub.valor : sub.valor / 12), 0
  )
  const totalAnual = totalMensal * 12

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
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>

      {/* Resumo de totais */}
      {active.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
        }}>
          <div style={{ background: 'var(--tang-tint)', borderRadius: 'var(--r-md)', padding: '12px 14px', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--tang)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Total mensal
            </div>
            <div className="amount" style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
              R$ {fmt(totalMensal)}
            </div>
          </div>
          <div style={{ background: 'var(--paper-2)', borderRadius: 'var(--r-md)', padding: '12px 14px', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Projeção anual
            </div>
            <div className="amount" style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 600, color: 'var(--ink-2)' }}>
              R$ {fmt(totalAnual)}
            </div>
          </div>
        </div>
      )}

      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
          {active.length} {active.length === 1 ? 'assinatura ativa' : 'assinaturas ativas'}
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
          {showForm ? '✕ Cancelar' : '+ Nova assinatura'}
        </button>
      </div>

      {/* Formulário de nova assinatura */}
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
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Nome</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Netflix, Spotify…" style={inputStyle} required />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Valor (R$)</label>
              <input type="text" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="55,90" style={{ ...inputStyle, fontFamily: 'var(--mono)' }} required />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Ciclo</label>
              <select value={ciclo} onChange={e => setCiclo(e.target.value)} style={inputStyle}>
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Categoria</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value)} style={inputStyle}>
                {SUB_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Dia do mês (cobrança)</label>
              <input type="number" min={1} max={28} value={nextBillingDay} onChange={e => setNextBillingDay(e.target.value)} placeholder="1–28" style={inputStyle} />
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
            {saving ? 'Salvando…' : 'Cadastrar assinatura'}
          </button>
        </form>
      )}

      {/* Lista de assinaturas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {subscriptions.map(sub => (
          <div key={sub.id} style={{
            background: 'var(--card)',
            borderRadius: 'var(--r-md)',
            border: `1px solid ${sub.status !== 'ativa' ? 'var(--line-2)' : 'var(--line)'}`,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            opacity: sub.status !== 'ativa' ? 0.55 : 1,
            boxShadow: 'var(--shadow-sm)',
          }}>
            {/* Ícone ou avatar */}
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: sub.color ?? 'var(--tang-tint)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--tang-deep)',
              fontFamily: 'var(--mono)',
              flexShrink: 0,
              overflow: 'hidden',
            }}>
              {sub.icon_url
                ? <img src={sub.icon_url} alt={sub.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : sub.name.slice(0, 2).toUpperCase()
              }
            </div>

            {/* Informações */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{sub.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>
                {sub.categoria} · {sub.ciclo}
                {sub.next_billing_day ? ` · dia ${sub.next_billing_day}` : ''}
              </div>
            </div>

            {/* Status badge */}
            {sub.status !== 'ativa' && (
              <span style={{
                fontSize: 10,
                padding: '2px 7px',
                borderRadius: 4,
                background: 'var(--line)',
                color: 'var(--ink-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                {sub.status}
              </span>
            )}

            {/* Valor */}
            <div className="amount" style={{ fontFamily: 'var(--mono)', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', flexShrink: 0 }}>
              R$ {fmt(sub.valor)}
              <span style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 400 }}>
                /{sub.ciclo === 'anual' ? 'ano' : 'mês'}
              </span>
            </div>

            {/* Botão de remover */}
            <button
              onClick={() => handleDelete(sub.id)}
              disabled={deleting === sub.id}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: '4px 6px', opacity: deleting === sub.id ? 0.4 : 0.7 }}
              title="Remover"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        ))}

        {subscriptions.length === 0 && !showForm && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>↻</div>
            <div style={{ fontSize: 14 }}>Nenhuma assinatura cadastrada</div>
            <button
              onClick={() => setShowForm(true)}
              style={{ marginTop: 12, padding: '8px 16px', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--tang)', color: 'white', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--sans)' }}
            >
              + Adicionar assinatura
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
