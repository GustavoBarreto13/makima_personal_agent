// <Icon name="calendar" size="md" /> — wrapper único dos ícones.
// Traço, cantos e cor são padrão (token --ds-icon-stroke, currentColor). Decorativo por padrão
// (aria-hidden); passe `label` quando o ícone for a única informação.

import type { CSSProperties } from 'react'
import tokens from '../tokens.json'
import { ICONS, type IconName } from './icons'

export type IconSize = 'sm' | 'md' | 'lg' | number

const PX: Record<'sm' | 'md' | 'lg', number> = {
  sm: parseInt(tokens.icon.sm, 10),
  md: parseInt(tokens.icon.md, 10),
  lg: parseInt(tokens.icon.lg, 10),
}
const STROKE = Number(tokens.icon.stroke)

export interface IconProps {
  name: IconName
  size?: IconSize
  /** Rótulo acessível. Sem ele o ícone é decorativo. */
  label?: string
  className?: string
  style?: CSSProperties
  strokeWidth?: number
}

export function Icon({ name, size = 'md', label, className, style, strokeWidth }: IconProps) {
  const Cmp = ICONS[name]
  const px = typeof size === 'number' ? size : PX[size]
  return (
    <Cmp
      className={`ds-ic${className ? ` ${className}` : ''}`}
      style={style}
      size={px}
      strokeWidth={strokeWidth ?? STROKE}
      absoluteStrokeWidth={false}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  )
}
