// Tela de Financiamentos da seção Nami (spec 046) — unificação de dívidas.
// Consome /loans (PRICE/SAC + saldo devedor já calculado no backend — mesmo motor
// usado pelo Telegram, SC-002) em vez do antigo `financings` (rotas removidas).
// Card por empréstimo com "Registrar parcela" + painel de simuladores + seção
// "Prioridade de quitação" (Método Avalanche, inclui cartões).

import { useState, useEffect, useCallback } from 'react'
import { namiApi } from '../namiApi'
import type { Account, BankLoan, PayoffPriorityItem } from '../types'
import { BankLoanCard } from '../components/LoanCard'
import { FormModal } from '../modals/FormModal'
import { Icon } from '../icons'
import { fmtMoney } from '../ui'

interface FinancingsProps {
  accounts: Account[]
  onToast: (msg: string) => void
  // Props do commonProps não usadas aqui
  stats?: unknown; cards?: unknown; subscriptions?: unknown; month?: string
  onTransactionSaved?: unknown; onNavigate?: unknown; onOpenAddModal?: unknown
}

const TIPO_OPTIONS = [
  { value: 'veiculo', label: 'Veículo' },
  { value: 'consignado', label: 'Consignado' },
  { value: 'pessoal', label: 'Pessoal' },
  { value: 'imobiliario', label: 'Imobiliário' },
  { value: 'outro', label: 'Outro' },
]

export function Financings({ accounts, onToast }: FinancingsProps) {
  const [loans, setLoans]           = useState<BankLoan[]>([])
  const [priority, setPriority]     = useState<PayoffPriorityItem[]>([])
  const [recomendacao, setRecomendacao] = useState('')
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [editingLoan, setEditingLoan] = useState<BankLoan | null>(null)
  const [payingLoan, setPayingLoan] = useState<BankLoan | null>(null)
  const [simulatingLoan, setSimulatingLoan] = useState<BankLoan | null>(null)
  const [saving, setSaving]         = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.allSettled([
      namiApi.getLoans('ativo'),
      namiApi.getPayoffPriority(),
    ]).then(([loansR, prioR]) => {
      if (loansR.status === 'fulfilled') setLoans(loansR.value.loans ?? [])
      if (prioR.status === 'fulfilled') {
        setPriority(prioR.value.priority ?? [])
        setRecomendacao(prioR.value.recomendacao ?? '')
      }
      if (loansR.status === 'rejected') onToast('Erro ao carregar financiamentos')
    }).finally(() => setLoading(false))
  }, [onToast])

  useEffect(() => { load() }, [load])

  const totalDebt = loans.reduce((s, l) => s + l.saldo_devedor, 0)
  const monthlyDue = loans.reduce((s, l) => s + (l.status !== 'quitado' ? l.valor_parcela : 0), 0)

  async function handleSave(values: Record<string, unknown>) {
    setSaving(true)
    try {
      const taxaPct = parseFloat(String(values.taxa ?? '0').replace(',', '.'))
      if (editingLoan) {
        await namiApi.updateLoan(editingLoan.id, {
          name: String(values.nome ?? '') || undefined,
          notes: String(values.notes ?? '') || undefined,
          parcelas_pagas: values.parcelas_pagas !== undefined && values.parcelas_pagas !== ''
            ? parseInt(String(values.parcelas_pagas)) : undefined,
        })
        onToast('Empréstimo atualizado ✓')
      } else {
        await namiApi.registerLoan({
          nome: String(values.nome ?? ''),
          tipo: String(values.tipo ?? 'outro'),
          sistema: String(values.sistema ?? 'PRICE'),
          valor_original: parseFloat(String(values.valor_original ?? '0').replace(',', '.')),
          taxa_juros_mensal: taxaPct / 100,
          prazo_meses: parseInt(String(values.prazo_meses ?? '0')),
          parcelas_pagas: parseInt(String(values.parcelas_pagas ?? '0')),
          valor_parcela: parseFloat(String(values.valor_parcela ?? '0').replace(',', '.')),
          data_inicio: String(values.data_inicio ?? ''),
          conta: String(values.conta ?? ''),
        })
        onToast('Empréstimo cadastrado ✓')
      }
      setShowForm(false)
      setEditingLoan(null)
      load()
    } catch (err: unknown) {
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function handlePay(values: Record<string, unknown>) {
    if (!payingLoan) return
    setSaving(true)
    try {
      const r = await namiApi.payLoanInstallment(payingLoan.id, String(values.data ?? '') || undefined)
      onToast(r.message ?? 'Parcela registrada ✓')
      setPayingLoan(null)
      load()
    } catch (err: unknown) {
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await namiApi.deleteLoan(id)
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
        <h2>Financiamentos</h2>
        <button className="btn btn-primary" onClick={() => { setEditingLoan(null); setShowForm(true) }}>
          <Icon name="plus" size={14} /> Novo empréstimo
        </button>
      </div>

      {/* Stat-row: saldo devedor total + comprometimento mensal */}
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">Saldo devedor</div>
          <div className="stat-val out"><span className="amount">{fmtMoney(totalDebt)}</span></div>
          <div className="stat-detail">{loans.length} contrato{loans.length !== 1 ? 's' : ''} ativo{loans.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Parcelas / mês</div>
          <div className="stat-val"><span className="amount">{fmtMoney(monthlyDue)}</span></div>
          <div className="stat-detail">comprometido mensalmente</div>
        </div>
      </div>

      {/* Prioridade de quitação (Método Avalanche, spec 046 US2) */}
      {priority.length > 0 && (
        <div className="panel" style={{ padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Prioridade de quitação</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {priority.map((p, i) => (
              <div key={`${p.tipo}-${p.name}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span>{i + 1}. {p.name} {p.tipo === 'cartao' ? '(cartão)' : ''}</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>
                  {(p.taxa_juros_mensal * 100).toFixed(2)}%/mês · {fmtMoney(p.saldo_devedor)}
                </span>
              </div>
            ))}
          </div>
          {recomendacao && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>{recomendacao}</div>
          )}
        </div>
      )}

      {/* Grade de cards */}
      {loading ? (
        <div className="loading"><Icon name="building" size={20} /> Carregando financiamentos…</div>
      ) : loans.length === 0 ? (
        <div className="empty">
          <Icon name="building" size={32} />
          <p>Nenhum empréstimo em aberto</p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={14} /> Registrar empréstimo
          </button>
        </div>
      ) : (
        <div className="loan-grid">
          {loans.map(loan => (
            <BankLoanCard
              key={loan.id}
              loan={loan}
              onDelete={handleDelete}
              onEdit={l => { setEditingLoan(l); setShowForm(true) }}
              onPay={l => setPayingLoan(l)}
              onSimulate={l => setSimulatingLoan(l)}
              deleting={deletingId === loan.id}
            />
          ))}
        </div>
      )}

      {/* Modal de cadastro/edição */}
      {showForm && (
        <FormModal
          title={editingLoan ? `Editar ${editingLoan.name}` : 'Novo empréstimo'}
          saving={saving}
          onClose={() => { setShowForm(false); setEditingLoan(null) }}
          onSave={handleSave}
          saveLabel={editingLoan ? 'Salvar alterações' : 'Cadastrar'}
          initialValues={editingLoan ? {
            nome: editingLoan.name,
            notes: editingLoan.notes ?? '',
            parcelas_pagas: String(editingLoan.parcelas_pagas),
          } : undefined}
          fields={editingLoan ? [
            { key: 'nome', label: 'Nome', type: 'text', required: true },
            { key: 'parcelas_pagas', label: 'Parcelas pagas', type: 'number', min: 0 },
            { key: 'notes', label: 'Observações', type: 'text' },
          ] : [
            { key: 'nome', label: 'Nome', type: 'text', required: true, placeholder: 'Ex.: Carro Onix, Apartamento…' },
            { key: 'tipo', label: 'Tipo', type: 'select', options: TIPO_OPTIONS },
            { key: 'sistema', label: 'Sistema', type: 'segment', options: [{ value: 'PRICE', label: 'PRICE (fixa)' }, { value: 'SAC', label: 'SAC (decrescente)' }] },
            { key: 'valor_original', label: 'Valor financiado', type: 'money', required: true },
            { key: 'taxa', label: 'Taxa mensal (%)', type: 'text', placeholder: 'Ex.: 0,99' },
            { key: 'prazo_meses', label: 'Total de parcelas', type: 'number', min: 1, placeholder: '48' },
            { key: 'parcelas_pagas', label: 'Parcelas já pagas', type: 'number', min: 0, placeholder: '0' },
            { key: 'valor_parcela', label: 'Valor da parcela', type: 'money', required: true },
            { key: 'data_inicio', label: 'Data da 1ª parcela', type: 'date' },
            { key: 'conta', label: 'Conta de débito', type: 'select', options: accounts.map(a => ({ value: a.name, label: a.name })) },
          ]}
        />
      )}

      {/* Modal de registrar parcela */}
      {payingLoan && (
        <FormModal
          title={`Registrar parcela — ${payingLoan.name}`}
          saving={saving}
          onClose={() => setPayingLoan(null)}
          onSave={handlePay}
          saveLabel="Registrar"
          fields={[{ key: 'data', label: 'Data (vazio = hoje)', type: 'date' }]}
        >
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Valor da parcela: {fmtMoney(payingLoan.valor_parcela)} — lança uma despesa automaticamente.
          </div>
        </FormModal>
      )}

      {/* Painel de simuladores */}
      {simulatingLoan && (
        <SimulatePanel loan={simulatingLoan} onClose={() => setSimulatingLoan(null)} onToast={onToast} />
      )}
    </>
  )
}

// ── Painel de simuladores (spec 046, US2) ────────────────────────────────────

function SimulatePanel({ loan, onClose, onToast }: { loan: BankLoan; onClose: () => void; onToast: (msg: string) => void }) {
  const [payoffResult, setPayoffResult] = useState<string>('')
  const [extraValue, setExtraValue] = useState('')
  const [amortResult, setAmortResult] = useState<string>('')
  const [extraMonthly, setExtraMonthly] = useState('')
  const [accelResult, setAccelResult] = useState<string>('')
  const [busy, setBusy] = useState(false)

  async function runPayoff() {
    setBusy(true)
    try {
      const r = await namiApi.simulatePayoff(loan.id)
      setPayoffResult(r.message)
    } catch {
      onToast('Erro ao simular quitação')
    } finally {
      setBusy(false)
    }
  }

  async function runAmortization() {
    const val = parseFloat(extraValue.replace(',', '.'))
    if (!val || val <= 0) { onToast('Informe um valor extra válido'); return }
    setBusy(true)
    try {
      const r = await namiApi.simulateAmortization(loan.id, val)
      setAmortResult(r.message)
    } catch {
      onToast('Erro ao simular amortização')
    } finally {
      setBusy(false)
    }
  }

  async function runAccelerated() {
    const val = parseFloat(extraMonthly.replace(',', '.'))
    if (!val || val <= 0) { onToast('Informe um valor mensal válido'); return }
    setBusy(true)
    try {
      const r = await namiApi.simulateAccelerated(loan.id, val)
      setAccelResult(r.message)
    } catch {
      onToast('Erro ao simular aceleração')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-head">
          <span className="modal-title">Simuladores — {loan.name}</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Quitação antecipada */}
          <div className="field">
            <label>Quitação antecipada</label>
            <button className="btn btn-ghost" onClick={runPayoff} disabled={busy}>Simular quitação hoje</button>
            {payoffResult && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{payoffResult}</div>}
          </div>

          {/* Amortização extraordinária */}
          <div className="field">
            <label>Amortização extra (valor único)</label>
            <div className="money-field">
              <span className="money-cur">R$</span>
              <input type="text" inputMode="decimal" value={extraValue}
                onChange={e => setExtraValue(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0,00" />
            </div>
            <button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={runAmortization} disabled={busy}>Simular amortização</button>
            {amortResult && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{amortResult}</div>}
          </div>

          {/* Parcela acelerada */}
          <div className="field">
            <label>Pagar a mais por mês</label>
            <div className="money-field">
              <span className="money-cur">R$</span>
              <input type="text" inputMode="decimal" value={extraMonthly}
                onChange={e => setExtraMonthly(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0,00" />
            </div>
            <button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={runAccelerated} disabled={busy}>Simular aceleração</button>
            {accelResult && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{accelResult}</div>}
          </div>
        </div>
        <div className="modal-foot">
          <div />
          <div className="modal-foot-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
