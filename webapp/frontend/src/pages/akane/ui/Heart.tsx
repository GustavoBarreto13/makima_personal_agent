// Coração (curtir) e estrela base — primitivos SVG portados do design handoff
// (akane/ui.jsx). Ambos herdam a cor via currentColor.

interface HeartProps {
  /** true = coração preenchido (filme curtido); false = só o contorno. */
  filled?: boolean
  /** Classe CSS opcional (ex.: 'heart-ico lg' na linha de nota do detalhe). */
  className?: string
}

/** Desenhar o coração de "curtir" (preenchível). */
export function Heart({ filled, className }: HeartProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}
         fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 20.5C5.5 16 3 12.4 3 8.8 3 6 5 4 7.5 4c1.7 0 3.3.9 4.5 2.6C13.2 4.9 14.8 4 16.5 4 19 4 21 6 21 8.8c0 3.6-2.5 7.2-9 11.7z" />
    </svg>
  )
}

interface StarShapeProps {
  /** true = estrela cheia (fill sólido); false = só o contorno fino. */
  filled?: boolean
}

/**
 * Desenhar a estrela base usada por Stars e RateInput.
 *
 * A meia-estrela NÃO é desenhada aqui: os componentes de cima sobrepõem duas
 * camadas de estrelas cheias e cortam a de cima com overflow (técnica do clip).
 */
export function StarShape({ filled }: StarShapeProps) {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 2.5l2.95 5.98 6.6.96-4.77 4.65 1.13 6.57L12 17.55l-5.9 3.1 1.13-6.57L2.46 9.44l6.6-.96z"
            fill={filled ? 'currentColor' : 'none'}
            stroke="currentColor" strokeWidth={filled ? 0 : 1.5} strokeLinejoin="round" />
    </svg>
  )
}
