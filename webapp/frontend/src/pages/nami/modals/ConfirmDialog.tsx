// Diálogo de confirmação genérico para ações destrutivas (exclusão de entidades).
// Substitui o window.confirm nativo (usado só em Installments.tsx) e os deletes
// sem confirmação alguma espalhados pelas demais telas — visual consistente com
// os modais da Nami (.modal-scrim / .modal / .modal-head / .modal-foot).

import { useEffect } from 'react'
import { Icon } from '../icons'

interface ConfirmDialogProps {
  /** Título do diálogo (ex.: "Excluir conta"). */
  title: string
  /** Mensagem de corpo — normalmente menciona o nome da entidade. */
  message: string
  /** Texto do botão de confirmação (padrão: "Excluir"). */
  confirmLabel?: string
  /** Desabilita os botões enquanto a ação está em progresso. */
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}

/**
 * Diálogo de confirmação para ações destrutivas — usar antes de qualquer
 * exclusão de entidade (conta, cartão, orçamento, assinatura, empréstimo…).
 * Fecha com Esc ou clique no scrim; botão de confirmar usa a cor de perigo
 * (`var(--out)`), mesma paleta usada nos valores negativos da Nami.
 */
export function ConfirmDialog({
  title, message, confirmLabel = 'Excluir', busy, onConfirm, onClose,
}: ConfirmDialogProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="modal-scrim"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal" style={{ maxWidth: 380 }}>
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ fontSize: 13, color: 'var(--sub)' }}>
          {message}
        </div>

        <div className="modal-foot">
          <div />
          <div className="modal-foot-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn"
              style={{ background: 'var(--out)', color: '#fff' }}
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? 'Excluindo…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
