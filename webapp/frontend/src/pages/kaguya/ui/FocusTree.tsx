// FocusTree — a peça central da gameficação de foco (spec 062). Uma sessão de foco
// vira UMA árvore: a espécie é sempre DERIVADA da duração e do desfecho, nunca
// escolhida pelo usuário (mesmo princípio "nada persistido derivado" do resto da
// Kaguya) — broto/pequena/média/grande conforme os minutos focados; sessão
// cancelada ou abandonada vira uma árvore murcha (tronco seco, sem copa).
//
// Na sessão ATIVA (outcome=null), a copa cresce em tempo real via a prop `growth`
// (0..1), que o FocusWidget deriva de started_at a cada poll — nunca uma animação
// contada do zero no cliente sem base real de servidor (mesmo princípio do R1/R7
// da spec 037).

import type { FocusOutcome } from '../types'

export type TreeSpecies = 'broto' | 'pequena' | 'media' | 'grande' | 'murcha'

// Limiares de minutos que definem a espécie — puro, sem estado, fácil de testar
// visualmente (qualquer minutagem sempre mapeia para a mesma árvore).
export function treeSpecies(minutes: number, outcome: FocusOutcome): TreeSpecies {
  if (outcome === 'cancelled' || outcome === 'abandoned') return 'murcha'
  if (minutes < 20) return 'broto'
  if (minutes < 40) return 'pequena'
  if (minutes < 70) return 'media'
  return 'grande'
}

interface FocusTreeProps {
  minutes: number
  outcome: FocusOutcome   // null = sessão ainda ativa (a copa cresce com `growth`)
  color?: string           // cor da copa — lista/hábito da sessão; default verde da Kaguya
  growth?: number           // 0..1 — só importa quando outcome é null
  size?: number
  title?: string            // tooltip (ex.: "25min · Escrever · 27/07")
}

// Canopy (copa) por espécie: um cluster de círculos sobrepostos, cada vez maior/mais
// denso conforme a árvore "cresce" — desenhado uma vez por espécie, não gerado
// proceduralmente, para manter a silhueta previsível e reconhecível.
function Canopy({ species, color }: { species: TreeSpecies; color: string }) {
  switch (species) {
    case 'broto':
      return <circle cx={24} cy={27} r={5} fill={color} />
    case 'pequena':
      return <circle cx={24} cy={23} r={8} fill={color} />
    case 'media':
      return (
        <>
          <circle cx={24} cy={19} r={8} fill={color} />
          <circle cx={17} cy={23} r={6} fill={color} />
          <circle cx={31} cy={23} r={6} fill={color} />
        </>
      )
    case 'grande':
      return (
        <>
          <circle cx={24} cy={14} r={9} fill={color} />
          <circle cx={15} cy={20} r={7.5} fill={color} />
          <circle cx={33} cy={20} r={7.5} fill={color} />
          <circle cx={24} cy={22} r={7} fill={color} />
        </>
      )
    case 'murcha':
      return null // tronco seco não tem copa
  }
}

export function FocusTree({ minutes, outcome, color = 'var(--kg)', growth = 1, size = 48, title }: FocusTreeProps) {
  const species = treeSpecies(minutes, outcome)
  // Sessão encerrada mostra o tamanho final; só a ativa cresce em tempo real.
  const g = outcome == null ? Math.max(0.12, Math.min(1, growth)) : 1
  const wilted = species === 'murcha'
  const trunkHeight = species === 'grande' ? 20 : species === 'media' ? 16 : 13

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={`kg-tree kg-tree-${species}`}
      role="img"
      aria-label={title ?? `Árvore ${species}`}
    >
      {title && <title>{title}</title>}
      {wilted ? (
        // Tronco curvado + duas folhas caídas — a silhueta "murcha" precisa ser
        // distinguível de um broto saudável à primeira vista, não só pela cor.
        <g className="kg-tree-wilted">
          <path
            d="M24 40 C 23 32, 27 28, 25 22"
            fill="none"
            stroke="var(--kg-wilt, oklch(55% 0.04 55))"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <ellipse cx={19} cy={25} rx={4.5} ry={2.5} fill="var(--kg-wilt, oklch(55% 0.04 55))"
            transform="rotate(-35 19 25)" opacity={0.75} />
          <ellipse cx={29} cy={20} rx={4} ry={2.2} fill="var(--kg-wilt, oklch(55% 0.04 55))"
            transform="rotate(25 29 20)" opacity={0.65} />
        </g>
      ) : (
        <>
          <rect x={22} y={40 - trunkHeight} width={4} height={trunkHeight} rx={1.5} fill="var(--ink-3)" />
          <g style={{ transform: `scale(${g})`, transformOrigin: '24px 30px', transition: 'transform .25s ease' }}>
            <Canopy species={species} color={color} />
          </g>
        </>
      )}
    </svg>
  )
}
