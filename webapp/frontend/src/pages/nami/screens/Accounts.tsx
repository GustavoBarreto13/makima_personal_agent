// Tela de Contas da seção Nami.
// Portada do handoff de referência (docs/.../nami/screens-a.jsx → Contas).

import { useState } from 'react'
import { namiApi } from '../namiApi'
import type { Account } from '../types'
import { FormModal } from '../modals/FormModal'
import { Icon } from '../icons'
import { fmtMoney } from '../ui'

interface AccountsProps {
  accounts: Account[]
  onToast: (msg: string) => void
  onAccountsChanged: () => void
  month?: string; stats?: unknown; cards?: unknown; subscriptions?: unknown
  onTransactionSaved?: unknown; onNavigate?: unknown; onOpenAddModal?: unknown
}

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'corrente',    label: 'Conta Corrente' },
  { value: 'poupanca',    label: 'Poupança' },
  { value: 'dinheiro',    label: 'Dinheiro (carteira)' },
  { value: 'investimento',label: 'Investimento' },
]

const ACCOUNT_SWATCHES = [
  'oklch(0.685 0.176 52)',  // tangerina
  'oklch(0.56 0.104 234)',  // azul
  'oklch(0.60 0.14 148)',   // verde
  'oklch(0.62 0.16 26)',    // coral
  'oklch(0.75 0.14 85)',    // ouro
  'oklch(0.60 0.15 290)',   // lilás
]

export function Accounts({ accounts, onToast, onAccountsChanged }: AccountsProps) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const total = accounts.reduce((s, a) => s + (a.balance_inicial ?? 0), 0)

  async function handleSave(values: Record<string, unknown>) {
    setSaving(true)
    try {
      await namiApi.createAccount({
        name:            String(values.name ?? ''),
        type:            String(values.type ?? 'corrente'),
        balance_inicial: parseFloat(String(values.balance ?? '0').replace(',', '.')),
        color:           String(values.color ?? ''),
        short:           String(values.short ?? ''),
        icon_url:        String(values.icon_url ?? '') || undefined,
      })
      onToast('Conta criada ✓')
      setShowForm(false)
      onAccountsChanged()
    } catch (err: unknown) {
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await namiApi.deleteAccount(id)
      onToast('Conta removida')
      onAccountsChanged()
    } catch {
      onToast('Erro ao remover conta')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <div className="page-head">
        <h2>Contas</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Icon name="plus" size={14} /> Nova conta
        </button>
      </div>

      {/* Patrimônio total */}
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Patrimônio total</span>
          <span className="amount" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--ink)' }}>
            {fmtMoney(total)}
          </span>
        </div>

        {/* Barra de composição do patrimônio */}
        {accounts.length > 0 && (
          <div className="panel-body">
            <div className="patr-bar-wrap">
              {accounts.map(acc => (
                <div
                  key={acc.id}
                  className="patr-seg"
                  style={{
                    width: `${total > 0 ? ((acc.balance_inicial ?? 0) / total) * 100 : 0}%`,
                    background: acc.color ?? 'var(--accent)',
                  }}
                />
              ))}
            </div>
            <div className="patr-legend">
              {accounts.map(acc => (
                <div key={acc.id} className="patr-item">
                  <div className="patr-dot" style={{ background: acc.color ?? 'var(--accent)' }} />
                  <span className="patr-name">{acc.name}</span>
                  <span className="patr-val amount">{fmtMoney(acc.balance_inicial ?? 0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Grade de cards de conta */}
      {accounts.length === 0 ? (
        <div className="empty">
          <Icon name="bank" size={32} />
          <p>Nenhuma conta cadastrada</p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={14} /> Nova conta
          </button>
        </div>
      ) : (
        <div className="acct-grid">
          {accounts.map(acc => (
            <div key={acc.id} className="acct-card">
              {/* Barra de acento colorida no topo */}
              <div className="accent-bar" style={{ background: acc.color ?? 'var(--accent)' }} />

              <div className="acct-body">
                {/* Logo ou sigla */}
                <div className="acct-logo" style={{ background: acc.color ? acc.color.replace(')', ' / 0.15)') : 'var(--accent-t)' }}>
                  {acc.icon_url ? (
                    <img
                      src={acc.icon_url}
                      alt=""
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <span style={{ color: acc.color ?? 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11 }}>
                      {acc.short ?? acc.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="acct-name">{acc.name}</div>
                <div className="acct-type">{acc.type}</div>
                <div className="acct-balance amount">{fmtMoney(acc.balance_inicial ?? 0)}</div>
              </div>

              <div className="acct-foot">
                <span className="acct-status">{acc.status}</span>
                <button
                  className="acct-del"
                  onClick={() => handleDelete(acc.id)}
                  disabled={deletingId === acc.id}
                  aria-label="Remover conta"
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de nova conta */}
      {showForm && (
        <FormModal
          title="Nova conta"
          saving={saving}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
          saveLabel="Criar conta"
          fields={[
            { key: 'name',    label: 'Nome',        type: 'text',   required: true, placeholder: 'Ex.: Nubank, Caixa…' },
            { key: 'type',    label: 'Tipo',        type: 'segment', options: ACCOUNT_TYPE_OPTIONS },
            { key: 'balance', label: 'Saldo inicial', type: 'money', required: true },
            { key: 'color',   label: 'Cor de acento', type: 'color',  swatches: ACCOUNT_SWATCHES },
            { key: 'short',   label: 'Sigla (2 letras)', type: 'text', placeholder: 'Ex.: NU' },
            { key: 'icon_url',label: 'Ícone (URL)',   type: 'image' },
          ]}
        />
      )}
    </>
  )
}
