// ProgressRing — anel SVG de progresso de subtarefas (spec 024, R12).
// Portado fielmente do handoff (design_handoff_kaguya_kanban/source/components.jsx):
// círculo de track + arco de progresso, stroke arredondado, rotacionado -90°
// para começar no topo. O rótulo "n/m" é renderizado por cima pelo .kcard-ring.

interface ProgressRingProps {
  pct: number          // 0..1 — fração concluída
  size?: number        // diâmetro em px (default 30)
  sw?: number          // espessura do stroke (default 3)
  color?: string       // cor do progresso (default --done)
}

export function ProgressRing({ pct, size = 30, sw = 3, color = 'var(--done)' }: ProgressRingProps) {
  const r = (size - sw) / 2
  const c = 2 * Math.PI * r
  const dash = pct * c
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-2)" strokeWidth={sw} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeDasharray={`${dash} ${c - dash}`}
        strokeLinecap="round"
      />
    </svg>
  )
}
