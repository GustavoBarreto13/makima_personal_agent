/**
 * icons.tsx — Makima · Hub (Centro de Controle, fatia 023)
 *
 * Conjunto de ícones SVG inline do Hub, portado do handoff de design
 * (`design_handoff_makima_hub/makima/icons.jsx`). O protótipo usava
 * `React.createElement`; aqui reescrevemos como JSX/TSX real.
 *
 * Todos os paths `d` foram COPIADOS exatamente do handoff. O traço usa
 * `stroke="currentColor"`, então cada ícone herda a cor do contexto em que é
 * renderizado (ex.: a cor do botão ou do link em volta) — não há cor fixa aqui.
 */

import type { CSSProperties } from 'react'

// ── Mapa de paths (nome → atributo d do <path>) ─────────────────────────────

/**
 * Paths dos ícones — exatamente os mesmos pares do handoff (icons.jsx).
 * `arrow` é o fallback quando um nome desconhecido é solicitado.
 */
const PATHS: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  book: 'M4 5a2 2 0 0 1 2-2h11v16H6a2 2 0 0 0-2 2zM17 3v18',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 20a7 7 0 0 1 14 0',
  pen: 'M4 20h4L19 9a2 2 0 0 0-3-3L5 17zM14 7l3 3',
  check: 'M5 12.5 10 17l9-10',
  calendar: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 9h16M8 3v4M16 3v4',
  tv: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 21h8',
  sparkle: 'M12 3l1.8 5.6L19.5 10l-5.7 1.4L12 17l-1.8-5.6L4.5 10l5.7-1.4z',
  film: 'M4 4h16v16H4zM4 9h16M4 15h16M9 4v16M15 4v16',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  arrowUR: 'M7 17 17 7M9 7h8v8',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  chev: 'M9 6l6 6-6 6',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a6.5 6.5 0 1 0 10.5 10.5z',
}

// ── Componente MkIcon ───────────────────────────────────────────────────────

/** Props do MkIcon — `name` é a chave em PATHS; o resto é estilização opcional. */
interface MkIconProps {
  name: string              // Nome do ícone (chave em PATHS)
  size?: number             // Largura/altura em px (default 18)
  style?: CSSProperties     // Estilos inline opcionais
  className?: string        // Classe CSS opcional
}

/**
 * Renderiza um ícone SVG do Hub.
 *
 * Usa viewBox 0 0 24 24, traço de 1.7px, cantos arredondados e `currentColor`
 * para herdar a cor do elemento pai. Se `name` não existir em PATHS, cai no
 * ícone `arrow` (fallback seguro, nunca renderiza vazio).
 */
export function MkIcon({ name, size = 18, style, className }: MkIconProps) {
  // Resolve o path; usa `arrow` como fallback se o nome for desconhecido.
  const d = PATHS[name] || PATHS.arrow
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden
    >
      <path d={d} />
    </svg>
  )
}
