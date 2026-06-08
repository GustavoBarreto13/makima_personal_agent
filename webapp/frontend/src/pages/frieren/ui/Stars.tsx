// Componente de avaliação por estrelas — suporta valores fracionários via técnica de clip.
// Exibe duas camadas sobrepostas: camada de base (5 estrelas cinza) + camada superior (5 estrelas
// douradas) com largura limitada ao percentual da nota. Portado do protótipo ui.jsx.

import React from 'react'

// Props do componente Stars
interface StarsProps {
  // Valor da avaliação entre 0 e 5 (aceita decimais como 3.5, 4.0, etc.)
  value: number
  // Se true, exibe as estrelas em tamanho maior (classe CSS "lg")
  lg?: boolean
}

// Subcomponente interno: renderiza o polígono SVG de uma estrela.
// Recebe `filled` para alternar entre estrela preenchida (camada de cor) e contorno (camada base).
function StarShape({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24">
      <path
        // Path da estrela de 5 pontas — mesmo path usado no protótipo
        d="M12 2.5l2.95 5.98 6.6.96-4.77 4.65 1.13 6.57L12 17.55l-5.9 3.1 1.13-6.57L2.46 9.44l6.6-.96z"
        // Preenchimento: currentColor quando filled=true, none quando false (mostra apenas contorno)
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        // Contorno mais fino quando preenchida (0) — não duplica a borda sobre o fill
        strokeWidth={filled ? 0 : 1.6}
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Componente de avaliação por estrelas.
// Técnica de duas camadas:
//   1. Camada de base (embaixo): 5 estrelas com classe "empty" (cinza, via CSS)
//   2. Camada superior (por cima): 5 estrelas douradas com overflow:hidden e width=pct%
// Isso permite que qualquer nota fracionária (ex.: 3.7) apareça corretamente.
export function Stars({ value, lg }: StarsProps) {
  // Converte o valor (0–5) em percentual (0–100%) para clipar a camada dourada
  // Math.max/min garantem que o valor nunca ultrapasse os limites
  const pct = Math.max(0, Math.min(5, value)) / 5 * 100

  return (
    // Container externo — aplica classe "lg" se a prop lg for true
    <span className={'stars' + (lg ? ' lg' : '')} title={value + ' / 5'}>
      {/* Wrapper de posicionamento para sobrepor as duas camadas de estrelas */}
      <span style={{ position: 'relative', display: 'inline-flex' }}>

        {/* Camada de base: 5 estrelas cinza (classe "empty" define a cor via CSS) */}
        <span style={{ display: 'inline-flex', gap: '1px' }} className="empty">
          {[0, 1, 2, 3, 4].map(i => (
            <StarShape key={i} filled />
          ))}
        </span>

        {/* Camada superior: 5 estrelas douradas com largura = percentual da nota
            overflow:hidden corta a camada na posição certa para notas fracionárias */}
        <span
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            width: pct + '%',      // Controla quantas estrelas ficam visíveis
            display: 'inline-flex',
            gap: '1px',
            color: 'var(--gold)', // Variável CSS definida no design system
          }}
        >
          {[0, 1, 2, 3, 4].map(i => (
            <StarShape key={i} filled />
          ))}
        </span>

      </span>
    </span>
  )
}
