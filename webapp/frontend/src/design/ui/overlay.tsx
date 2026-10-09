// Camadas sobrepostas: Modal (vira bottom sheet no celular), Sheet (painel lateral), Menu, ConfirmHost.
// Todas renderizam por portal dentro do .ds-app (OverlayRootContext), então cobrem sidebar e conteúdo
// e respeitam a container query da moldura.

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { answerConfirm, confirm, usePendingConfirm } from '../headless/confirm'
import { useDismissable, useFocusTrap } from '../headless/overlay'
import { Icon } from './Icon'
import { Button, cx, IconButton } from './primitives'

// ── raiz dos portais ─────────────────────────────────────────────────────────

export const OverlayRootContext = createContext<HTMLElement | null>(null)

export function usePortalRoot(): HTMLElement | null {
  const ctx = useContext(OverlayRootContext)
  if (ctx) return ctx
  return typeof document === 'undefined' ? null : document.body
}

function Portal({ children }: { children: ReactNode }) {
  const root = usePortalRoot()
  return root ? createPortal(children, root) : null
}

// ── Modal ────────────────────────────────────────────────────────────────────

export interface ModalProps {
  title: string
  onClose: () => void
  /** Há alterações não salvas? Fechar pede confirmação. */
  dirty?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  footer?: ReactNode
  /** Área extra no cabeçalho, antes do botão de fechar (abas, ações). */
  headerExtra?: ReactNode
  children: ReactNode
}

const MODAL_WIDTH = { sm: 420, md: 540, lg: 720, xl: 920 } as const

export function Modal({ title, onClose, dirty, size = 'md', footer, headerExtra, children }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useRef(`m-${Math.random().toString(36).slice(2, 8)}`).current

  const tryClose = async () => {
    if (dirty) {
      const ok = await confirm({ title: 'Descartar alterações?', body: 'O que você preencheu será perdido.', confirmLabel: 'Descartar', danger: true })
      if (!ok) return
    }
    onClose()
  }

  useFocusTrap(ref, true)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); void tryClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty])

  return (
    <Portal>
      <div className="ds-ov">
        <div className="ds-ov-s" onClick={() => void tryClose()} />
        <div ref={ref} className="ds-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ maxWidth: MODAL_WIDTH[size] }}>
          <div className="ds-grab" aria-hidden="true" />
          <div className="ds-m-h">
            <h2 id={titleId}>{title}</h2>
            {headerExtra}
            <IconButton icon="close" label="Fechar" onClick={() => void tryClose()} />
          </div>
          <div className="ds-m-b">{children}</div>
          {footer && <div className="ds-m-f">{footer}</div>}
        </div>
      </div>
    </Portal>
  )
}

// ── Sheet (painel lateral de vidro) ──────────────────────────────────────────

export interface SheetProps {
  title: string
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}

export function Sheet({ title, onClose, footer, children }: SheetProps) {
  const ref = useRef<HTMLElement>(null)
  const titleId = useRef(`s-${Math.random().toString(36).slice(2, 8)}`).current
  useFocusTrap(ref, true)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <Portal>
      <div className="ds-ov ds-right">
        <div className="ds-ov-s" onClick={onClose} />
        <aside ref={ref} className="ds-sheet ds-glass" style={{ borderRadius: 0 }} role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <div className="ds-m-h">
            <h2 id={titleId}>{title}</h2>
            <IconButton icon="close" label="Fechar" onClick={onClose} />
          </div>
          <div className="ds-m-b">{children}</div>
          {footer && <div className="ds-m-f">{footer}</div>}
        </aside>
      </div>
    </Portal>
  )
}

// ── Menu (popover de ações) ──────────────────────────────────────────────────

export interface MenuItem {
  id: string
  label: string
  onSelect: () => void
  checked?: boolean
  disabled?: boolean
}

export function Menu({ items, onClose, label, className }: { items: MenuItem[]; onClose: () => void; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useDismissable(ref, onClose)
  return (
    <div ref={ref} className={cx('ds-menu', className)} role="menu" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="menuitem"
          disabled={it.disabled}
          className={cx('ds-mi', it.checked && 'ds-on')}
          onClick={() => { it.onSelect(); onClose() }}
        >
          {it.label}
          {it.checked && <Icon name="check" size={14} />}
        </button>
      ))}
    </div>
  )
}

// ── Confirmação (substitui window.confirm) ───────────────────────────────────

export function ConfirmHost() {
  const req = usePendingConfirm()
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, !!req)
  useEffect(() => {
    if (!req) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); answerConfirm(false) }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [req])
  if (!req) return null
  return (
    <Portal>
      <div className="ds-ov ds-ov-confirm">
        <div className="ds-ov-s" onClick={() => answerConfirm(false)} />
        <div ref={ref} className="ds-modal" role="alertdialog" aria-modal="true" aria-labelledby="ds-cf-t" aria-describedby="ds-cf-b" style={{ maxWidth: 420 }}>
          <div className="ds-grab" aria-hidden="true" />
          <div className="ds-m-h"><h2 id="ds-cf-t">{req.title}</h2></div>
          {req.body && <div className="ds-m-b"><p id="ds-cf-b">{req.body}</p></div>}
          <div className="ds-m-f">
            {/* Perigo: o foco inicial é em Cancelar, de propósito. */}
            <Button data-autofocus={req.danger ? '' : undefined} onClick={() => answerConfirm(false)}>{req.cancelLabel ?? 'Cancelar'}</Button>
            <Button data-autofocus={req.danger ? undefined : ''} variant={req.danger ? 'danger' : 'primary'} onClick={() => answerConfirm(true)}>
              {req.confirmLabel ?? 'Confirmar'}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
