// A árvore de uma sessão de foco. A espécie é sempre DERIVADA da duração e do desfecho (broto, pequena, média, grande);
// sessão cancelada ou abandonada vira uma árvore murcha (tronco curvo, sem copa). Na sessão ativa (outcome null) a copa
// cresce com `growth` (0..1), calculado do horário de início que o servidor guardou — nunca contado do zero no cliente.

import type { FocusOutcome } from '../types'

export type TreeSpecies = 'broto' | 'pequena' | 'media' | 'grande' | 'murcha'

/** Limiares de minutos que definem a espécie: qualquer minutagem cai sempre na mesma árvore. */
export function treeSpecies(minutes: number, outcome: FocusOutcome): TreeSpecies {
  if (outcome === 'cancelled' || outcome === 'abandoned') return 'murcha'
  if (minutes < 20) return 'broto'
  if (minutes < 40) return 'pequena'
  if (minutes < 70) return 'media'
  return 'grande'
}

const SPECIES_LABEL: Record<TreeSpecies, string> = { broto: 'Broto', pequena: 'Árvore pequena', media: 'Árvore média', grande: 'Árvore grande', murcha: 'Árvore murcha' }

function Canopy({ species, color }: { species: TreeSpecies; color: string }) {
  switch (species) {
    case 'broto': return <circle cx={24} cy={27} r={5} fill={color} />
    case 'pequena': return <circle cx={24} cy={23} r={8} fill={color} />
    case 'media': return (<><circle cx={24} cy={19} r={8} fill={color} /><circle cx={17} cy={23} r={6} fill={color} /><circle cx={31} cy={23} r={6} fill={color} /></>)
    case 'grande': return (<><circle cx={24} cy={14} r={9} fill={color} /><circle cx={15} cy={20} r={7.5} fill={color} /><circle cx={33} cy={20} r={7.5} fill={color} /><circle cx={24} cy={22} r={7} fill={color} /></>)
    case 'murcha': return null // tronco seco não tem copa
  }
}

interface Props {
  minutes: number
  /** `null` = sessão ainda ativa (a copa cresce com `growth`). */
  outcome: FocusOutcome
  /** Cor da copa (a da lista da sessão); sem ela, o verde do tema. */
  color?: string
  growth?: number
  size?: number
  title?: string
}

export function FocusTree({ minutes, outcome, color = 'var(--ds-success)', growth = 1, size = 48, title }: Props) {
  const species = treeSpecies(minutes, outcome)
  const g = outcome == null ? Math.max(0.12, Math.min(1, growth)) : 1
  const trunk = species === 'grande' ? 20 : species === 'media' ? 16 : 13
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="kn-tree" role="img" aria-label={title ?? SPECIES_LABEL[species]}>
      {title && <title>{title}</title>}
      {species === 'murcha' ? (
        // Tronco curvo e duas folhas caídas: a silhueta precisa se distinguir do broto saudável sem depender só da cor.
        <g opacity={0.85}>
          <path d="M24 40 C 23 32, 27 28, 25 22" fill="none" stroke="var(--ds-ink-4)" strokeWidth={3} strokeLinecap="round" />
          <ellipse cx={19} cy={25} rx={4.5} ry={2.5} fill="var(--ds-ink-4)" transform="rotate(-35 19 25)" opacity={0.75} />
          <ellipse cx={29} cy={20} rx={4} ry={2.2} fill="var(--ds-ink-4)" transform="rotate(25 29 20)" opacity={0.65} />
        </g>
      ) : (
        <>
          <rect x={22} y={40 - trunk} width={4} height={trunk} rx={1.5} fill="var(--ds-ink-3)" />
          <g style={{ transform: `scale(${g})`, transformOrigin: '24px 30px', transition: 'transform .25s ease' }}><Canopy species={species} color={color} /></g>
        </>
      )}
    </svg>
  )
}
