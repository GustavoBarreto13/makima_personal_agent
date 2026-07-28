// Tela de Contas Fixas da seção Nami (spec 044) — separada de Assinaturas.
// Luz, água, aluguel, internet, escola: valor esperado + confirmação do valor real ao pagar.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { namiApi } from '../namiApi'
import type { Account, Card, RecurringStatusItem } from '../types'
import { FormModal } from '../modals/FormModal'
import { Icon } from '../icons'
import { fmtMoney } from '../ui'

interface FixedBillsProps {
  accounts: Account[]
  cards: Card[]
  onToast: (msg: string) => void
  onSubscriptionsChanged: () => Promise<void>
  // Props do commonProps não usadas aqui
  month?: string; stats?: unknown; subscriptions?: unknown
  onTransactionSaved?: unknown; onNavigate?: unknown; onOpenAddModal?: unknown
}

const BILL_COLORS = [
  { value: 'oklch(0.66 0.16 60)',  label: 'Âmbar' },
  { value: 'oklch(0.56 0.104 234)', label: 'Azul' },
  { value: 'oklch(0.62 0.16 150)', label: 'Verde' },
  { value: 'oklch(0.52 0.20 22)',  label: 'Vermelho' },
]

const STATUS_LABEL: Record<string, string> = {
  paga: 'Paga', pendente: 'Pendente', atrasada: 'Atrasada', agendada: 'Agendada',
}
const STATUS_CLASS: Record<string, string> = {
  paga: 'in', pendente: '', atrasada: 'out', agendada: '',
}

/**
 * Tela de contas fixas (kind='conta_fixa') — mesma estrutura de recorrência das
 * assinaturas, mas com status do ciclo corrente (paga/pendente/atrasada/agendada)
 * e ação "Marcar como paga" que confirma o valor real (spec 044).
 */
export function FixedBills({ accounts, cards, onToast, onSubscriptionsChanged }: FixedBillsProps) {
  const [items, setItems]           = useState<RecurringStatusItem[]>([])
  const [custoFixoMensal, setCusto] = useState(0)
  const [pendentesCount, setPendentesCount] = useState(0)
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [editingBill, setEditingBill] = useState<RecurringStatusItem | null>(null)
  const [payingBill, setPayingBill] = useState<RecurringStatusItem | null>(null)
  const [saving, setSaving]         = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fonteOptions = [
    ...accounts.map(a => ({ value: `conta:${a.name}`, label: a.name })),
    ...cards.map(c => ({ value: `card:${c.id}`, label: `⬛ ${c.name}` })),
  ]

  const load = useCallback(() => {
    setLoading(true)
    namiApi.getRecurringStatus('conta_fixa')
      .then(r => {
        setItems(r.items ?? [])
        setCusto(r.custo_fixo_mensal ?? 0)
        setPendentesCount(r.pendentes_count ?? 0)
      })
      .catch(() => onToast('Erro ao carregar contas fixas'))
      .finally(() => setLoading(false))
  }, [onToast])

  useEffect(() => { load() }, [load])

  const sorted = useMemo(() => {
    const order: Record<string, number> = { atrasada: 0, pendente: 1, agendada: 2, paga: 3 }
    return [...items].sort((a, b) => (order[a.cycle_status] ?? 9) - (order[b.cycle_status] ?? 9))
  }, [items])

  function resolveFonte(fonte: string) {
    if (!fonte) return { conta: '', card_id: '' }
    const [kind, value] = fonte.split(':')
    return kind === 'card' ? { conta: '', card_id: value } : { conta: value, card_id: '' }
  }

  async function handleSave(values: Record<string, unknown>) {
    setSaving(true)
    try {
      const { conta } = resolveFonte(String(values.fonte ?? ''))
      if (editingBill) {
        await namiApi.updateSubscription(editingBill.id, {
          name:  String(values.name ?? ''),
          valor: parseFloat(String(values.valor ?? '0').replace(',', '.')),
          next_billing_day: values.dia ? parseInt(String(values.dia)) : undefined,
          color: String(values.color ?? '') || undefined,
          conta: conta || undefined,
        })
        onToast('Conta fixa atualizada ✓')
      } else {
        await namiApi.createSubscription({
          name:  String(values.name ?? ''),
          valor: parseFloat(String(values.valor ?? '0').replace(',', '.')),
          ciclo: String(values.ciclo ?? 'mensal'),
          categoria: 'Moradia',
          next_billing_day: values.dia ? parseInt(String(values.dia)) : undefined,
          color: String(values.color ?? '') || undefined,
          kind:  'conta_fixa',
          auto_lancar: false,
        })
        onToast('Conta fixa cadastrada ✓')
      }
      setShowForm(false)
      setEditingBill(null)
      load()
      await onSubscriptionsChanged()
    } catch (err: unknown) {
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function handlePay(values: Record<string, unknown>) {
    if (!payingBill) return
    setSaving(true)
    try {
      const valor = parseFloat(String(values.valor ?? '0').replace(',', '.'))
      if (!valor || valor <= 0) throw new Error('Informe o valor pago')
      const { conta } = resolveFonte(String(values.fonte ?? ''))
      await namiApi.paySubscription(payingBill.id, {
        valor, data: String(values.data ?? '') || undefined, conta: conta || undefined,
      })
      onToast(`Pagamento de ${fmtMoney(valor)} confirmado ✓`)
      setPayingBill(null)
      load()
    } catch (err: unknown) {
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function handleSkip(id: string) {
    try {
      await namiApi.skipSubscriptionCycle(id)
      onToast('Ciclo pulado — vencimento atualizado')
      load()
    } catch {
      onToast('Erro ao pular ciclo')
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await namiApi.deleteSubscription(id)
      onToast('Conta fixa removida')
      load()
      await onSubscriptionsChanged()
    } catch {
      onToast('Erro ao remover conta fixa')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <div className="page-head">
        <h2>Contas Fixas</h2>
        <button className="btn btn-primary" onClick={() => { setEditingBill(null); setShowForm(true) }}>
          <Icon name="plus" size={14} /> Nova conta fixa
        </button>
      </div>

      {!loading && (
        <div className="stat-row" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <div className="stat-card">
            <div className="stat-label">Custo fixo mensal</div>
            <div className="stat-val out"><span className="amount">{fmtMoney(custoFixoMensal)}</span></div>
            <div className="stat-detail">contas fixas ativas</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Pendências do mês</div>
            <div className={`stat-val ${pendentesCount > 0 ? 'out' : ''}`}>{pendentesCount}</div>
            <div className="stat-detail">{pendentesCount === 0 ? 'tudo em dia' : 'a confirmar'}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading"><Icon name="home" size={20} /> Carregando contas fixas…</div>
      ) : items.length === 0 ? (
        <div className="empty">
          <Icon name="home" size={32} />
          <p>Nenhuma conta fixa cadastrada</p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={14} /> Cadastrar conta fixa
          </button>
        </div>
      ) : (
        <div className="panel">
          <div className="sub-list">
            {sorted.map(item => (
              <div key={item.id} className="sub-row" style={{ opacity: item.status !== 'ativa' ? 0.55 : 1 }}>
                <div className="sub-logo" style={{ background: item.color ?? 'var(--accent-t)', color: 'var(--card)' }}>
                  <span style={{ color: item.color ? 'var(--card)' : 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13 }}>
                    {item.name.slice(0, 1).toUpperCase()}
                  </span>
                </div>

                <div className="sub-body">
                  <div className="sub-name">{item.name}</div>
                  <div className="sub-ciclo">
                    esperado {fmtMoney(item.valor)} · {item.ciclo}
                    {item.next_billing_day ? ` · dia ${item.next_billing_day}` : ''}
                  </div>
                </div>

                <div className="sub-right" style={{ gap: 8 }}>
                  <span className={`chip ${STATUS_CLASS[item.cycle_status]}`} style={{ fontSize: 11 }}>
                    {STATUS_LABEL[item.cycle_status] ?? item.cycle_status}
                  </span>
                  {item.cycle_status !== 'paga' && item.cycle_status !== 'agendada' && (
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setPayingBill(item)}>
                      Marcar como paga
                    </button>
                  )}
                  {item.cycle_status !== 'paga' && (
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => handleSkip(item.id)} title="Pular este ciclo sem lançar despesa">
                      Pular
                    </button>
                  )}
                  <button className="sub-del" onClick={() => { setEditingBill(item); setShowForm(true) }} aria-label="Editar conta fixa">
                    <Icon name="edit" size={13} />
                  </button>
                  <button className="sub-del" onClick={() => handleDelete(item.id)} disabled={deletingId === item.id} aria-label="Remover conta fixa">
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de cadastro/edição */}
      {showForm && (
        <FormModal
          title={editingBill ? `Editar ${editingBill.name}` : 'Nova conta fixa'}
          saving={saving}
          onClose={() => { setShowForm(false); setEditingBill(null) }}
          onSave={handleSave}
          saveLabel={editingBill ? 'Salvar alterações' : 'Cadastrar'}
          initialValues={editingBill ? {
            name: editingBill.name,
            valor: String(editingBill.valor ?? 0),
            ciclo: editingBill.ciclo,
            dia: String(editingBill.next_billing_day ?? ''),
            color: editingBill.color ?? '',
          } : undefined}
          fields={[
            { key: 'name',  label: 'Nome',           type: 'text',    required: true, placeholder: 'Ex.: Luz, Água, Aluguel…' },
            { key: 'valor', label: 'Valor esperado',  type: 'money',   required: true },
            ...(editingBill ? [] : [{ key: 'ciclo', label: 'Ciclo', type: 'segment' as const, options: [{ value: 'mensal', label: 'Mensal' }, { value: 'anual', label: 'Anual' }] }]),
            { key: 'dia',   label: 'Dia de vencimento', type: 'number', min: 1, max: 28, placeholder: '10' },
            { key: 'fonte', label: 'Conta / Cartão',  type: 'select',  options: fonteOptions },
            { key: 'color', label: 'Cor',             type: 'color',   swatches: BILL_COLORS.map(s => s.value) },
          ]}
        />
      )}

      {/* Modal de confirmação de pagamento (spec 044, US2) */}
      {payingBill && (
        <FormModal
          title={`Marcar como paga — ${payingBill.name}`}
          saving={saving}
          onClose={() => setPayingBill(null)}
          onSave={handlePay}
          saveLabel="Confirmar pagamento"
          initialValues={{ valor: String(payingBill.valor ?? 0) }}
          fields={[
            { key: 'valor', label: 'Valor real pago', type: 'money', required: true },
            { key: 'data',  label: 'Data (vazio = hoje)', type: 'date' },
            { key: 'fonte', label: 'Pagar com (vazio = pagador cadastrado)', type: 'select', options: fonteOptions },
          ]}
        >
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Valor esperado: {fmtMoney(payingBill.valor)}
          </div>
        </FormModal>
      )}
    </>
  )
}
