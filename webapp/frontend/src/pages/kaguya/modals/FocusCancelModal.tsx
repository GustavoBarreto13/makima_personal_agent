// FocusCancelModal — confirma a desistência de uma sessão ativa (spec 062). Mostra
// a árvore já murchando (preview do desfecho) e pergunta o motivo em texto livre,
// **opcional** — nunca bloqueia quem só quer sair rápido. O motivo alimenta a
// seção "padrão de falha" do overview (FocusScreen).

import { useState } from 'react'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'
import { FocusTree } from '../ui/FocusTree'

interface FocusCancelModalProps {
  sessionId: number
  elapsedMin: number   // minutos já decorridos até agora (o widget calcula e passa)
  onClose: () => void
  onCancelled: () => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function FocusCancelModal({ sessionId, elapsedMin, onClose, onCancelled, toast }: FocusCancelModalProps) {
  const [reason, setReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  const confirm = async () => {
    setCancelling(true)
    try {
      await kaguyaApi.focus.cancel(sessionId, reason.trim() || undefined)
      onCancelled()
      onClose()
    } catch (e: any) {
      toast(e?.message ?? 'Não foi possível cancelar a sessão.', 'err')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="kg-scrim" onClick={onClose}>
      <div className="kg-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <div className="kg-modal-head">
          <h3>Desistir do foco?</h3>
          <button className="kg-icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>
        <div className="kg-modal-body">
          <div className="kg-focus-cancel-tree">
            <FocusTree minutes={elapsedMin} outcome="cancelled" size={72} />
          </div>
          <div className="kg-page-sub" style={{ textAlign: 'center', margin: '8px 0 16px' }}>
            {elapsedMin} min focados até agora — essa sessão não vai contar como concluída.
          </div>
          <div className="kg-field">
            <span className="kg-field-label">O que te tirou do foco? (opcional)</span>
            <textarea
              className="kg-textarea"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ex.: notificação, alguém chamou, perdi o interesse…"
            />
          </div>
        </div>
        <div className="kg-modal-foot">
          <button className="kg-btn kg-btn-ghost" onClick={onClose}>Voltar ao foco</button>
          <button className="kg-btn kg-btn-danger" disabled={cancelling} onClick={confirm}>
            {cancelling ? 'Cancelando...' : 'Desistir'}
          </button>
        </div>
      </div>
    </div>
  )
}
