// Feedback: ToastHost, Skeleton, EmptyState, ErrorState.
// Regra: TODA lista/tela trata os 4 estados: carregando (skeleton), vazio, erro e com dados.

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { dismissToast, useToastItems, type ToastItem } from '../headless/toast'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { usePortalRoot } from './overlay'
import { shortcutLabel } from '../headless/web'
import { Button } from './primitives'

function ToastView({ t }: { t: ToastItem }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const start = (ms: number) => { clearTimeout(timer.current); timer.current = setTimeout(() => dismissToast(t.id), ms) }
  useEffect(() => { start(t.duration); return () => clearTimeout(timer.current) }, [t.id, t.duration]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div
      className={`ds-toast${t.tone === 'error' ? ' ds-err' : ''}`}
      role={t.tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => clearTimeout(timer.current)}
      onMouseLeave={() => start(2000)}
    >
      <span>{t.message}</span>
      {t.undo && (
        <button type="button" title={`Desfazer (${shortcutLabel('mod+z')})`} onClick={() => { t.undo?.(); dismissToast(t.id) }}>Desfazer</button>
      )}
      <button type="button" className="ds-tx" aria-label="Fechar aviso" onClick={() => dismissToast(t.id)}><Icon name="close" size={14} /></button>
    </div>
  )
}

/** Host global dos avisos. Um por app (o AppShell já inclui). */
export function ToastHost() {
  const items = useToastItems()
  const root = usePortalRoot()
  if (!root) return null
  return createPortal(
    <div className="ds-toasts" aria-live="polite">{items.map((t) => <ToastView key={t.id} t={t} />)}</div>,
    root,
  )
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

export type SkeletonVariant = 'line' | 'card' | 'poster' | 'stat' | 'row'

const SKELETON_STYLE: Record<SkeletonVariant, CSSProperties> = {
  line: { height: 14, borderRadius: 7 },
  row: { height: 60 },
  card: { height: 236 },
  poster: { aspectRatio: '2 / 3' },
  stat: { height: 96 },
}

/** Mesmas dimensões do conteúdo final (sem layout shift). */
export function Skeleton({ variant = 'row', count = 1, style }: { variant?: SkeletonVariant; count?: number; style?: CSSProperties }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="ds-sk" style={{ ...SKELETON_STYLE[variant], ...style }} aria-hidden="true" />
      ))}
    </>
  )
}

/** Painel de carregamento acessível: skeletons + aviso para leitores de tela. */
export function LoadingState({ variant = 'row', count = 3, label = 'Carregando…' }: { variant?: SkeletonVariant; count?: number; label?: string }) {
  const grid = variant === 'card' || variant === 'poster' || variant === 'stat'
  return (
    <div role="status" aria-label={label} className={grid ? 'ds-grid' : 'ds-list'}>
      <Skeleton variant={variant} count={count} />
    </div>
  )
}

// ── Vazio e erro ─────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  icon?: IconName
  title: string
  hint?: ReactNode
  /** Ação principal: convida a fazer o primeiro registro. */
  action?: ReactNode
  /** Retrato do agente (opcional). */
  portrait?: string | null
}

export function EmptyState({ icon = 'sparkles', title, hint, action, portrait }: EmptyStateProps) {
  return (
    <div className="ds-empty">
      {portrait ? <img src={portrait} alt="" width={64} height={64} style={{ borderRadius: 18, objectFit: 'cover' }} /> : <div className="ds-eic"><Icon name={icon} size={24} /></div>}
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ title = 'Não foi possível carregar', hint = 'A conexão com o servidor falhou. Seus dados estão salvos. Tente de novo.', onRetry }: { title?: string; hint?: ReactNode; onRetry?: () => void }) {
  return (
    <div className="ds-empty" role="alert">
      <div className="ds-eic" style={{ background: 'var(--ds-danger-tint)', color: 'var(--ds-danger)' }}><Icon name="warning" size={24} /></div>
      <h3>{title}</h3>
      <p>{hint}</p>
      {onRetry && <Button onClick={onRetry}>Tentar de novo</Button>}
    </div>
  )
}
