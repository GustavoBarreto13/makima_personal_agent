/**
 * ReadinessMeter.tsx — Yato · Viagens (fatia 066)
 *
 * Medidor de prontidão: 7 segmentos, cada um pintado com a cor do veredito do
 * seu passo. `ReadinessLine` adiciona o texto mono "n/7 checados".
 */

import type { MobilityCheck } from '../types'
import { VERDICT_META } from './VerdictChip'

const STEP_NAMES: Record<string, string> = {
  porte_cidade: 'Porte da cidade',
  uber: 'Uber',
  '99': '99',
  indrive: 'InDrive',
  transporte_publico: 'Transporte público',
  hospedagem_transfer: 'Transfer da hospedagem',
  deslocamentos: 'Deslocamentos',
}

const ALL_KEYS = ['porte_cidade', 'uber', '99', 'indrive', 'transporte_publico', 'hospedagem_transfer', 'deslocamentos']

/** Garante sempre 7 entradas — cidade sem dossiê vira 7x 'pendente'. */
export function checksOrDefault(checks: MobilityCheck[] | null | undefined): MobilityCheck[] {
  if (!checks || checks.length === 0) {
    return ALL_KEYS.map(k => ({
      check_key: k as MobilityCheck['check_key'], verdict: 'pendente', source: null, evidence: null, checked_at: null,
    }))
  }
  return checks
}

export function checkedCount(checks: MobilityCheck[] | null | undefined): number {
  return checksOrDefault(checks).filter(c => c.verdict !== 'pendente').length
}

export function pendingCount(checks: MobilityCheck[] | null | undefined): number {
  return checksOrDefault(checks).filter(c => c.verdict === 'pendente').length
}

interface ReadinessMeterProps {
  checks: MobilityCheck[] | null | undefined
  size?: '' | 'md' | 'lg'
}

export function ReadinessMeter({ checks, size = '' }: ReadinessMeterProps) {
  const cs = checksOrDefault(checks)
  return (
    <div className={'meter ' + size}>
      {cs.map((c, i) => {
        const meta = VERDICT_META[c.verdict] || VERDICT_META.pendente
        return (
          <i key={i} title={(STEP_NAMES[c.check_key] || c.check_key) + ' · ' + meta.label}
             style={{ background: meta.cssVar }} />
        )
      })}
    </div>
  )
}

interface ReadinessLineProps {
  checks: MobilityCheck[] | null | undefined
  size?: '' | 'md' | 'lg'
  onClick?: () => void
}

export function ReadinessLine({ checks, size, onClick }: ReadinessLineProps) {
  const n = checkedCount(checks)
  const content = (
    <>
      <ReadinessMeter checks={checks} size={size} />
      <span className="meter-txt">{n}/7 checados</span>
    </>
  )
  if (onClick) {
    return <button type="button" className="meter-wrap" onClick={onClick}>{content}</button>
  }
  return <div className="meter-wrap">{content}</div>
}
