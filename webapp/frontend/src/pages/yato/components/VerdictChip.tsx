/**
 * VerdictChip.tsx — Yato · Viagens (fatia 066)
 *
 * Carimbo de veredito: símbolo + rótulo textual, NUNCA só cor (regra §2.3/§10
 * do design-guide.md). Cores fixas, independentes do acento.
 */

import type { Verdict } from '../types'

export const VERDICT_META: Record<Verdict, { cls: string; sym: string; label: string; cssVar: string }> = {
  confirmado:   { cls: 'v-ok',      sym: '●', label: 'confirmado',   cssVar: 'var(--verdict-ok)' },
  ausente:      { cls: 'v-none',    sym: '⊖', label: 'ausente',      cssVar: 'var(--verdict-none)' },
  inconclusivo: { cls: 'v-unknown', sym: '◐', label: 'inconclusivo', cssVar: 'var(--verdict-unknown)' },
  pendente:     { cls: 'v-pending', sym: '○', label: 'pendente',     cssVar: 'var(--verdict-pending-tint)' },
  na:           { cls: 'v-na',      sym: '—', label: 'n/a',          cssVar: 'var(--ink-4)' },
}

interface VerdictChipProps {
  v: Verdict
  md?: boolean
}

export function VerdictChip({ v, md }: VerdictChipProps) {
  const x = VERDICT_META[v] || VERDICT_META.pendente
  return (
    <span className={'vchip ' + x.cls + (md ? ' md' : '')}>
      <span className="vsym">{x.sym}</span>{x.label}
    </span>
  )
}
