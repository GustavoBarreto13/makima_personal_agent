/**
 * Icon.tsx — Yato · Viagens (fatia 066)
 *
 * SVG inline, viewBox 24x24, stroke 1.6px, currentColor. Paths copiados
 * literalmente do handoff (design_handoff_yato_viagens/yato/ui.jsx → ICONS).
 */

import type { CSSProperties } from 'react'

const ICONS: Record<string, string> = {
  inicio:   'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5',
  mochila:  'M8 7V5.5A4 4 0 0 1 16 5.5V7M6.5 7h11A2.5 2.5 0 0 1 20 9.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9.5A2.5 2.5 0 0 1 6.5 7zM9 12h6v4H9z',
  mapa:     'M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6zM9 3v15M15 6v15',
  rota:     'M6 3v11a4 4 0 0 0 4 4h8M18 14l4 4-4 4M6 3a2 2 0 1 0 0 0.01',
  carimbo:  'M9 3h6a2 2 0 0 1 2 2v3.5a3 3 0 0 1-1 2.2L15 12v2H9v-2l-1-1.3a3 3 0 0 1-1-2.2V5a2 2 0 0 1 2-2zM4 17h16v4H4z',
  moeda:    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v10M9.5 9.5h5M9.5 14.5h5',
  cifrao:   'M12 3v18M16.5 7.5C16 5.8 14.3 5 12 5c-2.5 0-4 1.2-4 3s1.6 2.6 4 3.2c2.6.6 4.3 1.3 4.3 3.3S14.6 19 12 19c-2.4 0-4.2-.9-4.7-2.8',
  lista:    'M4 6h13M4 12h13M4 18h13M20 6h.01M20 12h.01M20 18h.01',
  onibus:   'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5V17H4zM4 12h16M7 17v2.5M17 17v2.5M8 20h8',
  relogio:  'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3.2 2',
  calendar: 'M7 3v4M17 3v4M3.5 9h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6.5A1.5 1.5 0 0 1 5 5z',
  check:    'M20 6 9 17l-5-5',
  chevR:    'M9 18l6-6-6-6',
  chevL:    'M15 18l-6-6 6-6',
  search:   'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  gear:     'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.87 1.2v.17a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 2.6 15v-.09A2 2 0 1 1 4.6 11h.17A1.7 1.7 0 0 0 6.4 7.7L6.34 7.64A2 2 0 1 1 9.17 4.8l.06.06A1.7 1.7 0 0 0 11.1 5.2h.08A1.7 1.7 0 0 0 12.4 3.6V3.4a2 2 0 1 1 4 0v.17a1.7 1.7 0 0 0 2.87 1.2l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 21.4 11h.17',
  plus:     'M12 5v14M5 12h14',
  x:        'M18 6 6 18M6 6l12 12',
  alerta:   'M12 4 2.5 20h19zM12 10v4.5M12 17.2h.01',
  pedestre: 'M12 5.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2zM12 7.5 9 10v4M12 7.5 15 10.5v3M12 12v4l-2.5 5.5M12 16l2.5 5.5',
  arrowL:   'M19 12H5M12 19l-7-7 7-7',
}

interface IconProps {
  name: string
  style?: CSSProperties
  className?: string
}

export function Icon({ name, style, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={style} className={className}
         stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name] || ICONS.mapa} />
    </svg>
  )
}
