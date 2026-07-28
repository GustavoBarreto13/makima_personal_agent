// Tela de Parcelamentos da seção Nami (spec 041).
// Lista compras parceladas ativas com progresso, drill-down com a linha do tempo
// das parcelas individuais, compromissos futuros (parcelas + assinaturas) e
// criação de nova compra parcelada (conta ou cartão de crédito).

import { useState, useEffect, useCallback } from 'react'
import { namiApi } from '../namiApi'
import type { Account, Card, Category, Installment, InstallmentDetail } from '../types'
import { FormModal } from '../modals/FormModal'
import { Icon } from '../icons'
import { fmtMoney, fmtDay, monthShort } from '../ui'

interface InstallmentsProps {
  accounts: Account[]
  cards: Card[]
  onToast: (msg: string) => void
  month?: string; stats?: unknown; subscriptions?: unknown
  onTransactionSaved?: unknown; onNavigate?: unknown; onOpenAddModal?: unknown
}

/** Próximos 3 meses no formato YYYY-MM, a partir do mês corrente. */
function nextMonths(n: number): string[] {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

export function Installments({ accounts, cards, onToast }: InstallmentsProps) {
  const [installments, setInstallments] = useState<Installment[]>([])
  const [loading, setLoading]           = useState(true)
  const [showForm, setShowForm]         = useState(false)
  const [saving, setSaving]             = useState(false)

  // Compromissos futuros (3 meses) — carregados em paralelo, um card por mês
  const [commitments, setCommitments] = useState<Record<string, number>>({})

  // Grupo expandido (drill-down) + detalhe carregado
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [detail, setDetail]           = useState<InstallmentDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [categories, setCategories] = useState<Category[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await namiApi.getInstallments('ativo')
      setInstallments(r.installments ?? [])
    } catch {
      setInstallments([])
      onToast('Erro ao carregar parcelamentos')
    } finally {
      setLoading(false)
    }
  }, [onToast])

  useEffect(() => { load() }, [load])

  // Destaque vindo da tela Cartões (spec 041, US3): "Parcelamentos ativos" do
  // cartão navega para cá com a compra já expandida. Chave transiente lida
  // uma única vez e removida — não deve reaparecer em navegações futuras.
  useEffect(() => {
    const highlightId = sessionStorage.getItem('nami:highlight-installment')
    if (highlightId) {
      sessionStorage.removeItem('nami:highlight-installment')
      toggleExpand(highlightId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Carrega categorias uma vez para o formulário de criação
  useEffect(() => {
    namiApi.getCategories()
      .then(setCategories)
      .catch(() => onToast('Erro ao carregar categorias'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Carrega os compromissos dos próximos 3 meses
  useEffect(() => {
    const months = nextMonths(3)
    Promise.allSettled(months.map(m => namiApi.getFutureCommitments(m)))
      .then(results => {
        const next: Record<string, number> = {}
        results.forEach((r, i) => {
          next[months[i]] = r.status === 'fulfilled' ? r.value.total : 0
        })
        setCommitments(next)
      })
  }, [])

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      setDetail(null)
      return
    }
    setExpandedId(id)
    setDetail(null)
    setDetailLoading(true)
    try {
      const d = await namiApi.getInstallmentDetail(id)
      setDetail(d)
    } catch {
      onToast('Erro ao carregar detalhe do parcelamento')
      setExpandedId(null)
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleCancelFuture(id: string, name: string) {
    if (!window.confirm(`Cancelar as parcelas futuras de "${name}"? As já pagas continuam no histórico.`)) return
    try {
      await namiApi.cancelInstallment(id)
      onToast('Parcelas futuras canceladas')
      setExpandedId(null)
      setDetail(null)
      await load()
    } catch {
      onToast('Erro ao cancelar parcelas futuras')
    }
  }

  async function handleDeleteFull(id: string, name: string) {
    if (!window.confirm(`Excluir "${name}" por completo, incluindo o histórico de parcelas pagas? Esta ação não pode ser desfeita.`)) return
    try {
      await namiApi.deleteInstallment(id)
      onToast('Parcelamento removido')
      setExpandedId(null)
      setDetail(null)
      await load()
    } catch {
      onToast('Erro ao remover parcelamento')
    }
  }

  async function handleSave(values: Record<string, unknown>) {
    setSaving(true)
    try {
      const fonte = String(values.fonte ?? '')
      const [kind, value] = fonte.split(':')
      await namiApi.createInstallment({
        name:         String(values.name ?? ''),
        valor_total:  parseFloat(String(values.valor_total ?? '0').replace(',', '.')),
        num_parcelas: parseInt(String(values.num_parcelas ?? '2')),
        conta:        kind === 'card' ? undefined : value,
        card_id:      kind === 'card' ? value : undefined,
        categoria:    String(values.categoria ?? 'Inbox'),
        data_inicio:  String(values.data_inicio ?? ''),
      })
      onToast('Compra parcelada criada ✓')
      setShowForm(false)
      await load()
    } catch (err: unknown) {
      throw err
    } finally {
      setSaving(false)
    }
  }

  const fonteOptions = [
    ...accounts.map(a => ({ value: `conta:${a.name}`, label: a.name })),
    ...cards.map(c => ({ value: `card:${c.id}`, label: `⬛ ${c.name}` })),
  ]
  const categoriaOptions = categories.map(c => ({ value: c.id, label: c.name }))

  return (
    <>
      <div className="page-head">
        <h2>Parcelamentos</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Icon name="plus" size={14} /> Nova compra parcelada
        </button>
      </div>

      {/* Compromissos futuros — próximos 3 meses (parcelas + assinaturas) */}
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        {nextMonths(3).map(m => (
          <div className="stat-card" key={m}>
            <div className="stat-label">Compromissos · {monthShort(m)}</div>
            <div className="stat-val">
              <span className="amount">{fmtMoney(commitments[m] ?? 0)}</span>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="loading">
          <Icon name="card" size={20} /> Carregando parcelamentos…
        </div>
      ) : installments.length === 0 ? (
        <div className="empty">
          <Icon name="card" size={32} />
          <p>Nenhuma compra parcelada ativa</p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={14} /> Nova compra parcelada
          </button>
        </div>
      ) : (
        <div className="loan-grid" style={{ gridTemplateColumns: '1fr' }}>
          {installments.map(inst => {
            const pct = inst.num_parcelas > 0 ? inst.parcelas_pagas / inst.num_parcelas : 0
            const restante = inst.parcelas_pendentes * inst.valor_parcela
            const isExpanded = expandedId === inst.id
            const isCard = !!inst.card_id

            return (
              <div className="loan-card" key={inst.id}>
                <div className="loan-head" style={{ cursor: 'pointer' }} onClick={() => toggleExpand(inst.id)}>
                  <span className={`loan-dir ${isCard ? 'financing' : 'lent'}`}>
                    <Icon name={isCard ? 'card' : 'bank'} size={11} /> {inst.conta}
                  </span>
                  <Icon name={isExpanded ? 'up' : 'down'} size={14} />
                </div>

                <div>
                  <div className="loan-person">{inst.name}</div>
                  <div className="loan-note">
                    {inst.parcelas_pagas}/{inst.num_parcelas} parcelas · {fmtMoney(inst.valor_parcela)}/mês
                  </div>
                </div>

                <div className="loan-amount amount">{fmtMoney(restante)} restante</div>

                <div className="loan-track">
                  <div className="loan-fill" style={{ width: `${Math.round(pct * 100)}%` }} />
                </div>

                <div className="loan-meta">
                  <span>1ª parcela <strong>{fmtDay(inst.first_due)}</strong></span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="acct-del" onClick={e => { e.stopPropagation(); handleCancelFuture(inst.id, inst.name) }} aria-label="Cancelar parcelas futuras" title="Cancelar parcelas futuras">
                      <Icon name="x" size={12} />
                    </button>
                    <button className="acct-del" onClick={e => { e.stopPropagation(); handleDeleteFull(inst.id, inst.name) }} aria-label="Excluir por completo" title="Excluir por completo">
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                </div>

                {/* Drill-down — linha do tempo das parcelas individuais */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 10 }}>
                    {detailLoading ? (
                      <div className="loading" style={{ padding: 0 }}>Carregando parcelas…</div>
                    ) : detail && detail.group.id === inst.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {detail.parcelas.map(p => (
                          <div
                            key={p.id}
                            style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              fontSize: 12, padding: '4px 8px', borderRadius: 6,
                              background: p.mes_corrente ? 'var(--accent-t)' : 'transparent',
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Icon name={p.pago ? 'check' : 'x'} size={11} />
                              Parcela {p.numero}/{inst.num_parcelas} · {fmtDay(p.data)}
                              {p.mes_corrente && <strong> (mês atual)</strong>}
                            </span>
                            <span className="amount">{fmtMoney(p.valor)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <FormModal
          title="Nova compra parcelada"
          saving={saving}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
          saveLabel="Criar"
          fields={[
            { key: 'name',         label: 'Nome da compra',   type: 'text',   required: true, placeholder: 'Ex.: Notebook Dell' },
            { key: 'valor_total',  label: 'Valor total',      type: 'money',  required: true },
            { key: 'num_parcelas', label: 'Número de parcelas', type: 'number', min: 2, placeholder: '12' },
            { key: 'fonte',        label: 'Conta / Cartão',   type: 'select', required: true, options: fonteOptions },
            { key: 'categoria',    label: 'Categoria',        type: 'select', options: categoriaOptions },
            { key: 'data_inicio',  label: '1ª parcela',       type: 'date',   required: true },
          ]}
        />
      )}
    </>
  )
}
