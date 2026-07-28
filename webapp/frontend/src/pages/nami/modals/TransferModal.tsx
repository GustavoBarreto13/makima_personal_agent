// Modal de transferência entre contas (spec 043, User Story 4).
// Registra o par débito/crédito atômico via namiApi.createTransfer.

import { useState, useRef, useEffect } from 'react'
import { namiApi } from '../namiApi'
import type { Account } from '../types'
import { Icon } from '../icons'
import { todayLocalISO } from '../dateUtils'

interface TransferModalProps {
  accounts: Account[]
  onClose: () => void
  onSaved: (msg?: string) => Promise<void> | void
}

/**
 * Modal simples: conta de origem, conta de destino, valor e data.
 * Valida origem ≠ destino antes de submeter (FR-007, edge case da spec 043).
 */
export function TransferModal({ accounts, onClose, onSaved }: TransferModalProps) {
  const [fromAccount, setFromAccount] = useState('')
  const [toAccount, setToAccount]     = useState('')
  const [valor, setValor]             = useState('')
  const [data, setData]               = useState('')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  const firstRef = useRef<HTMLSelectElement>(null)

  useEffect(() => { setTimeout(() => firstRef.current?.focus(), 80) }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!fromAccount || !toAccount) {
      setError('Selecione as duas contas.')
      return
    }
    if (fromAccount === toAccount) {
      setError('Conta de origem e destino devem ser diferentes.')
      return
    }
    const v = parseFloat(valor.replace(',', '.'))
    if (!v || v <= 0) {
      setError('Informe um valor válido.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await namiApi.createTransfer({
        from_account: fromAccount,
        to_account: toAccount,
        valor: v,
        data: data || todayLocalISO(),
      })
      await onSaved('Transferência registrada ✓')
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar transferência.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <form className="modal" onSubmit={handleSubmit} style={{ maxWidth: 420 }}>
        <div className="modal-head">
          <span className="modal-title">Transferir entre contas</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label>De</label>
            <select ref={firstRef} value={fromAccount} onChange={e => setFromAccount(e.target.value)}>
              <option value="">— selecione —</option>
              {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </div>

          <div className="field">
            <label>Para</label>
            <select value={toAccount} onChange={e => setToAccount(e.target.value)}>
              <option value="">— selecione —</option>
              {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </div>

          <div className="row-2">
            <div className="field">
              <label>Valor</label>
              <div className="money-field">
                <span className="money-cur">R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={valor}
                  onChange={e => setValor(e.target.value.replace(/[^0-9.,]/g, ''))}
                  placeholder="0,00"
                />
              </div>
            </div>
            <div className="field">
              <label>Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)} />
            </div>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: 'var(--out)', padding: '6px 10px', background: 'var(--out-t)', borderRadius: 'var(--rad-sm)' }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <div />
          <div className="modal-foot-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Transferir'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
