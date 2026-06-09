// Tela de Assinaturas da seção Nami.
// Portada do handoff de referência (docs/.../nami/screens-b.jsx → Assinaturas).
// Exibe stat-row (mês/ano/próxima) e lista de serviços recorrentes com logo e valor.

import { useState, useMemo } from 'react'
import { namiApi } from '../namiApi'
import type { Subscription } from '../types'
import { FormModal } from '../modals/FormModal'
import { Icon } from '../icons'
import { fmtMoney, daysUntil } from '../ui'

interface SubscriptionsProps {
  subscriptions: Subscription[]
  onToast: (msg: string) => void
  onSubscriptionsChanged: () => Promise<void>
  // Props do commonProps não usadas aqui
  month?: string; stats?: unknown; accounts?: unknown; cards?: unknown
  onTransactionSaved?: unknown; onNavigate?: unknown; onOpenAddModal?: unknown
}

// Opções de cor para o logo da assinatura (circle avatar)
const SUB_COLORS = [
  { value: 'oklch(0.52 0.20 22)',  label: 'Vermelho' },
  { value: 'oklch(0.62 0.16 150)', label: 'Verde' },
  { value: 'oklch(0.55 0.02 250)', label: 'Cinza' },
  { value: 'oklch(0.58 0.14 240)', label: 'Azul' },
  { value: 'oklch(0.55 0.08 175)', label: 'Teal' },
  { value: 'oklch(0.66 0.16 60)',  label: 'Âmbar' },
  { value: 'oklch(0.45 0.02 60)',  label: 'Marrom' },
  { value: 'oklch(0.58 0.16 320)', label: 'Rosa' },
]

// Formata dias até o vencimento como string amigável
function fmtDays(days: number): string {
  if (days === 0) return 'hoje'
  if (days === 1) return 'amanhã'
  return `em ${days}d`
}

export function Subscriptions({ subscriptions, onToast, onSubscriptionsChanged }: SubscriptionsProps) {
  const [showForm, setShowForm]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Apenas assinaturas ativas para os cálculos de totais
  const active = useMemo(() =>
    subscriptions.filter(s => s.status === 'ativa'),
    [subscriptions]
  )

  // Total mensal convertendo anuais para equivalente mensal
  const totalMensal = useMemo(() =>
    active.reduce((s, sub) => s + (sub.ciclo === 'anual' ? sub.valor / 12 : sub.valor), 0),
    [active]
  )
  const totalAnual = totalMensal * 12

  // Ordena assinaturas pela proximidade do próximo vencimento
  const sorted = useMemo(() => {
    return [...subscriptions].sort((a, b) => {
      const da = a.next_billing_day ? daysUntil(a.next_billing_day) : 999
      const db = b.next_billing_day ? daysUntil(b.next_billing_day) : 999
      return da - db
    })
  }, [subscriptions])

  // A próxima assinatura a vencer
  const proxima = sorted.find(s => s.status === 'ativa' && s.next_billing_day)

  async function handleSave(values: Record<string, unknown>) {
    setSaving(true)
    try {
      await namiApi.createSubscription({
        name:             String(values.name ?? ''),
        valor:            parseFloat(String(values.valor ?? '0').replace(',', '.')),
        ciclo:            String(values.ciclo ?? 'mensal'),
        categoria:        String(values.categoria ?? 'Assinaturas'),
        next_billing_day: values.dia ? parseInt(String(values.dia)) : undefined,
        color:            String(values.color ?? '') || undefined,
      })
      onToast('Assinatura cadastrada ✓')
      setShowForm(false)
      await onSubscriptionsChanged()
    } catch (err: unknown) {
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await namiApi.deleteSubscription(id)
      await onSubscriptionsChanged()
      onToast('Assinatura removida')
    } catch {
      onToast('Erro ao remover assinatura')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      {/* Cabeçalho da página */}
      <div className="page-head">
        <h2>Assinaturas</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Icon name="plus" size={14} /> Nova assinatura
        </button>
      </div>

      {/* Stat-row: por mês / por ano / próxima a vencer */}
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">Por mês</div>
          <div className="stat-val out">
            <span className="amount">{fmtMoney(totalMensal)}</span>
          </div>
          <div className="stat-detail">debitado todo mês</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Por ano</div>
          <div className="stat-val">
            <span className="amount">{fmtMoney(totalAnual)}</span>
          </div>
          <div className="stat-detail">projeção em 12 meses</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Próxima</div>
          <div className="stat-val" style={{ fontSize: 17 }}>
            {proxima ? proxima.name : '—'}
          </div>
          <div className="stat-detail">
            {proxima?.next_billing_day
              ? `dia ${proxima.next_billing_day} · ${fmtDays(daysUntil(proxima.next_billing_day))}`
              : 'nenhuma'}
          </div>
        </div>
      </div>

      {/* Lista de assinaturas */}
      {subscriptions.length === 0 ? (
        <div className="empty">
          <Icon name="repeat" size={32} />
          <p>Nenhuma assinatura cadastrada</p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={14} /> Adicionar assinatura
          </button>
        </div>
      ) : (
        <div className="panel">
          <div className="sub-list">
            {sorted.map(sub => {
              const days = sub.next_billing_day ? daysUntil(sub.next_billing_day) : null

              return (
                <div
                  key={sub.id}
                  className="sub-row"
                  style={{ opacity: sub.status !== 'ativa' ? 0.55 : 1 }}
                >
                  {/* Logo: imagem ou avatar com cor + inicial */}
                  <div className="sub-logo" style={{ background: sub.color ?? 'var(--accent-t)', color: 'var(--card)' }}>
                    {sub.icon_url ? (
                      <img
                        src={sub.icon_url}
                        alt={sub.name}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <span style={{ color: sub.color ? 'var(--card)' : 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13 }}>
                        {sub.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Informações da assinatura */}
                  <div className="sub-body">
                    <div className="sub-name">{sub.name}</div>
                    <div className="sub-ciclo">
                      {sub.categoria} · {sub.ciclo}
                      {sub.next_billing_day ? ` · dia ${sub.next_billing_day}` : ''}
                    </div>
                  </div>

                  {/* Direita: próximo vencimento + valor + excluir */}
                  <div className="sub-right">
                    {days !== null && (
                      <div className="sub-next">{fmtDays(days)}</div>
                    )}
                    <div className="sub-val amount">{fmtMoney(sub.valor)}</div>
                    <button
                      className="sub-del"
                      onClick={() => handleDelete(sub.id)}
                      disabled={deletingId === sub.id}
                      aria-label="Remover assinatura"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal de nova assinatura */}
      {showForm && (
        <FormModal
          title="Nova assinatura"
          saving={saving}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
          saveLabel="Cadastrar"
          fields={[
            { key: 'name',      label: 'Serviço',        type: 'text',    required: true, placeholder: 'Ex: Netflix, Spotify…' },
            { key: 'valor',     label: 'Valor mensal',   type: 'money',   required: true },
            { key: 'ciclo',     label: 'Ciclo',          type: 'segment', options: [{ value: 'mensal', label: 'Mensal' }, { value: 'anual', label: 'Anual' }] },
            { key: 'dia',       label: 'Dia da cobrança', type: 'number', min: 1, max: 28, placeholder: '15' },
            { key: 'categoria', label: 'Categoria',       type: 'select', options: [
              { value: 'Assinaturas',    label: 'Assinaturas' },
              { value: 'Entretenimento', label: 'Entretenimento' },
              { value: 'Saude',          label: 'Saúde' },
              { value: 'Educacao',       label: 'Educação' },
              { value: 'Software',       label: 'Software' },
              { value: 'Outros',         label: 'Outros' },
            ]},
            { key: 'color',     label: 'Cor do avatar', type: 'color',  swatches: SUB_COLORS.map(s => s.value) },
          ]}
        />
      )}
    </>
  )
}
