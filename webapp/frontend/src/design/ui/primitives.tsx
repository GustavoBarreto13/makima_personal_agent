// Primitivos do padrão: botões, chips, segmentado, status, tag, progresso, avatar, toggle, kbd.
// Regras: uma ação primária por contexto; ação destrutiva nunca é primária; cor nunca é o único sinal.

import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './icons'

export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(' ')

// ── Button ───────────────────────────────────────────────────────────────────

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
  block?: boolean
  icon?: IconName
  iconRight?: IconName
  /** Atalho exibido (já formatado, ex.: "N"). */
  kbd?: string
}

export function Button({ variant = 'default', size = 'md', block, icon, iconRight, kbd, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('ds-btn', variant !== 'default' && `ds-${variant}`, size === 'sm' && 'ds-sm', block && 'ds-block', className)}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children !== undefined && children !== null && <span className="ds-lbl">{children}</span>}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 14 : 16} />}
      {kbd && <kbd className="ds-kbd ds-lbl">{kbd}</kbd>}
    </button>
  )
}

/** Botão só com ícone. `label` é obrigatório (acessibilidade e tooltip). */
export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  icon: IconName
  label: string
  primary?: boolean
  size?: number
}

export function IconButton({ icon, label, primary, size = 18, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button type={type} className={cx('ds-iconbtn', primary && 'ds-primary', className)} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  )
}

// ── Chip (filtro/seleção) ────────────────────────────────────────────────────

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  on?: boolean
  icon?: IconName
}

export function Chip({ on, icon, className, children, type = 'button', ...rest }: ChipProps) {
  return (
    <button type={type} className={cx('ds-chip', on && 'ds-on', className)} aria-pressed={on} {...rest}>
      {icon && <Icon name={icon} size={13} />}
      {children}
    </button>
  )
}

// ── SegmentedControl ─────────────────────────────────────────────────────────

export interface SegmentOption<V extends string> {
  value: V
  label?: ReactNode
  icon?: IconName
  /** Obrigatório quando só há ícone. */
  ariaLabel?: string
}

export interface SegmentedControlProps<V extends string> {
  value: V
  options: SegmentOption<V>[]
  onChange: (v: V) => void
  label: string
  className?: string
}

export function SegmentedControl<V extends string>({ value, options, onChange, label, className }: SegmentedControlProps<V>) {
  return (
    <div className={cx('ds-seg', className)} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cx(value === o.value && 'ds-on')}
          aria-pressed={value === o.value}
          aria-label={o.ariaLabel}
          title={o.ariaLabel}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={15} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── StatusChip: mapa de tons ÚNICO para todos os domínios ────────────────────

export type Status = 'done' | 'planned' | 'paused' | 'dropped'
const STATUS_LABEL: Record<Status, string> = { done: 'Concluído', planned: 'Planejado', paused: 'Pausado', dropped: 'Abandonado' }

export function StatusChip({ status, label }: { status: Status; label?: string }) {
  return <span className={`ds-st ds-${status}`}>{label ?? STATUS_LABEL[status]}</span>
}

export function Tag({ children, pr }: { children: ReactNode; pr?: boolean }) {
  return <span className={cx('ds-tag', pr && 'ds-pr')}>{children}</span>
}

// ── Progresso ────────────────────────────────────────────────────────────────

export function ProgressBar({ value, max = 100, label }: { value: number; max?: number; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className="ds-bar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Anel de progresso (vem do ProgressRing da Kaguya). */
export function ProgressRing({ value, size = 30, label }: { value: number; size?: number; label?: string }) {
  const r = (size - 6) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, value))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `${Math.round(pct * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ds-line-2)" strokeWidth={3} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ds-success)" strokeWidth={3} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

// ── Avatar ───────────────────────────────────────────────────────────────────

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Matiz estável derivado do nome. */
export function hueFromName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

export function Avatar({ name, src, size = 34 }: { name: string; src?: string | null; size?: number }) {
  const style = { '--ds-ah': hueFromName(name), width: size, height: size, fontSize: Math.round(size * 0.36) } as React.CSSProperties
  return src ? (
    <img src={src} alt="" className="ds-avatar" style={{ ...style, objectFit: 'cover' }} />
  ) : (
    <span className="ds-avatar" style={style} aria-hidden="true">{initials(name)}</span>
  )
}

// ── Toggle ───────────────────────────────────────────────────────────────────

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" className="ds-tgl" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />
}

/** Linha de configuração: título, ajuda e controle à direita. */
export function SettingRow({ title, help, children }: { title: ReactNode; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="ds-setrow">
      <div className="ds-setrow-t">
        <span>{title}</span>
        {help && <p>{help}</p>}
      </div>
      <div className="ds-setrow-c">{children}</div>
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ds-kbd">{children}</kbd>
}

/** Id estável para ligar label ↔ campo. */
export function useFieldId(prefix = 'f'): string {
  return `${prefix}-${useId().replace(/:/g, '')}`
}
