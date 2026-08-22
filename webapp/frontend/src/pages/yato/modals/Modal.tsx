/**
 * Modal.tsx — Yato · Viagens (fatia 066)
 *
 * Shell comum de modal: overlay com blur, cabeçalho com ícone + título + ✕,
 * corpo e rodapé opcional. Fecha com Esc e clique no overlay.
 */

import { useEffect, type ReactNode } from 'react'
import { Icon } from '../components/Icon'

interface ModalProps {
  open: boolean
  title: string
  icon?: string
  wide?: boolean
  onClose: () => void
  children: ReactNode
  foot?: ReactNode
}

export function Modal({ open, title, icon, wide, onClose, children, foot }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="ovl" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={'modal' + (wide ? ' wide' : '')}>
        <div className="m-head">
          {icon && <Icon name={icon} style={{ width: 18, height: 18, color: 'var(--yato-deep)' }} />}
          <span className="m-title">{title}</span>
          <button className="m-close" onClick={onClose}>✕</button>
        </div>
        <div className="m-body">{children}</div>
        {foot && <div className="m-foot">{foot}</div>}
      </div>
    </div>
  )
}
