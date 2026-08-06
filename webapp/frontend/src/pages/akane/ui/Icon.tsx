// Ícones de linha (stroke) no estilo Lucide — portados 1:1 do design handoff
// (specs/015-akane-filmes/design_handoff_akane_filmes/akane/ui.jsx).
// Cada ícone é um único path SVG; a cor vem de currentColor, então o ícone
// herda a cor do texto ao redor (padrão do design system da Akane).

import type { CSSProperties } from 'react'

// Mapa nome → path SVG. Os nomes são os mesmos usados no protótipo do handoff,
// o que facilita comparar o markup das telas com o original.
export const ICONS = {
  inicio:   'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5',
  filmes:   'M4 4h16v16H4zM4 8h16M4 16h16M8 4v16M16 4v16',                 // tira de filme
  diario:   'M7 3v4M17 3v4M3.5 9h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6.5A1.5 1.5 0 0 1 5 5z',
  watchlist:'M5 3h14a1 1 0 0 1 1 1v17l-8-5-8 5V4a1 1 0 0 1 1-1z',
  listas:   'M3 6h13M3 12h13M3 18h13M20 6h.01M20 12h.01M20 18h.01',
  tags:     'M3 7.5 11 3l9.5 5v8L11 21l-8-4.5zM11 3v18',
  rewind:   'M11 7 5 12l6 5M11 7v10M19 7l-6 5 6 5z',
  plus:     'M12 5v14M5 12h14',
  search:   'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  x:        'M18 6 6 18M6 6l12 12',
  arrowLeft:'M19 12H5M12 19l-7-7 7-7',
  chevL:    'M15 18l-6-6 6-6',
  chevR:    'M9 18l6-6-6-6',
  chevDown: 'M6 9l6 6 6-6',                                                 // seta de combobox (substitui o caractere de texto '⌄')
  chevUp:   'M6 15l6-6 6 6',                                                // espelho do chevDown — setas de reordenar (substitui os glifos '▲'/'▼')
  check:    'M20 6 9 17l-5-5',
  play:     'M6 4l14 8-14 8z',
  cinema:   'M3 5h18v14H3zM3 9h18M7 5v14M17 5v14',
  streaming:'M5 5h14v10H5zM9 21h6M12 15v6',
  doc:      'M7 3h7l4 4v14H7zM14 3v4h4',
  quote:    'M9 7H6a2 2 0 0 0-2 2v3h5V7zm9 0h-3a2 2 0 0 0-2 2v3h5V7z',
  pen:      'M4 20l4-1 11-11-3-3L5 16l-1 4zM14 5l3 3',
  rewatch:  'M3 12a9 9 0 1 0 3-6.7M3 4v4h4',
  clock:    'M12 7v5l3.5 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
  film:     'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M16 9h4M4 14h4M16 14h4',
  user:     'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0',
  star:     'M12 3l2.95 5.98 6.6.96-4.77 4.65 1.13 6.57L12 17.55l-5.9 3.1 1.13-6.57L2.46 9.44l6.6-.96z',
  link:     'M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1',
  // Extras do app real (não existem no protótipo, mas seguem o mesmo traço):
  trash:    'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  gear:     'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  sync:     'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6',
} as const

/** Nome de um ícone disponível no conjunto da Akane. */
export type IconName = keyof typeof ICONS

interface IconProps {
  /** Qual ícone desenhar (chave do mapa ICONS). */
  name: IconName
  /** Estilo inline opcional (o handoff usa para tamanhos pontuais). */
  style?: CSSProperties
}

/**
 * Desenhar um ícone de linha do conjunto da Akane.
 *
 * O tamanho vem do CSS do contexto (ex.: `.nav-item svg { width: 17px }`),
 * por isso o componente não define width/height próprios.
 */
export function Icon({ name, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={style}
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  )
}
