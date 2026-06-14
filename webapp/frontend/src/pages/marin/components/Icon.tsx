// Ícones SVG do domínio Marin (anime). Tamanho padrão: 16×16.
// Baseados nos path-data do protótipo hi-fi (design_handoff_marin_animes).
// Usar <Icon name="play" /> em vez de SVG inline para consistência.

interface IconProps {
  name:
    | 'play'       // ▶ iniciar sessão
    | 'check'      // ✓ episódio assistido
    | 'star'       // ★ nota
    | 'clock'      // ⏱ schedule / horário
    | 'list'       // ≡ lista / catálogo
    | 'book'       // 📖 diário
    | 'eye'        // 👁 assistindo
    | 'plus'       // + adicionar
    | 'sync'       // ↺ sync MAL
    | 'chevron'    // › seta de navegação
    | 'calendar'   // 📅 schedule
    | 'stats'      // ◎ estatísticas
    | 'home'       // ⊞ início
    | 'heart'      // ♥ favorito
    | 'delete'     // × remover
    | 'arrow-left' // ← voltar
  size?: number
  className?: string
  style?: React.CSSProperties
}

/**
 * Ícone SVG com fallback em caractere unicode.
 * Retorna um span quando o nome não tem SVG definido.
 */
export function Icon({ name, size = 16, className, style }: IconProps) {
  // Mapa de paths SVG (viewBox 0 0 16 16)
  const paths: Record<string, React.ReactNode> = {
    'play': (
      <polygon points="3,2 13,8 3,14" fill="currentColor" />
    ),
    'check': (
      <polyline
        points="2,8 6,12 14,4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    'star': (
      <polygon
        points="8,1 10,6 15,6 11,10 13,15 8,12 3,15 5,10 1,6 6,6"
        fill="currentColor"
      />
    ),
    'clock': (
      <>
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <polyline
          points="8,4 8,8 11,10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </>
    ),
    'list': (
      <>
        <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ),
    'book': (
      <path
        d="M3 2 h7 a1 1 0 0 1 1 1 v10 a1 1 0 0 1-1 1 H3 V2 z M10 2 h3 v12 h-3 a1 1 0 0 0-1-1 V3 a1 1 0 0 0 1-1 z"
        fill="currentColor"
        opacity="0.85"
      />
    ),
    'eye': (
      <>
        <ellipse cx="8" cy="8" rx="6" ry="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="8" cy="8" r="2" fill="currentColor" />
      </>
    ),
    'plus': (
      <>
        <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ),
    'sync': (
      <path
        d="M13,4 A6,6 0 0,0 3,8 M3,12 A6,6 0 0,0 13,8 M13,2 L13,5 L10,5 M3,14 L3,11 L6,11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    'chevron': (
      <polyline
        points="5,2 11,8 5,14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    'calendar': (
      <>
        <rect x="1" y="3" width="14" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <line x1="1" y1="7" x2="15" y2="7" stroke="currentColor" strokeWidth="1.5" />
        <line x1="5" y1="1" x2="5" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="11" y1="1" x2="11" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ),
    'stats': (
      <>
        <rect x="2" y="9" width="3" height="5" fill="currentColor" opacity="0.7" />
        <rect x="7" y="5" width="3" height="9" fill="currentColor" />
        <rect x="12" y="2" width="3" height="12" fill="currentColor" opacity="0.85" />
      </>
    ),
    'home': (
      <path
        d="M1,9 L8,2 L15,9 M3,9 v5 a1 1 0 0 0 1 1 h3 v-4 h2 v4 h3 a1 1 0 0 0 1-1 V9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    'heart': (
      <path
        d="M8,13 C8,13 2,9 2,5 A3,3 0 0,1 8,4 A3,3 0 0,1 14,5 C14,9 8,13 8,13 z"
        fill="currentColor"
      />
    ),
    'delete': (
      <>
        <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ),
    'arrow-left': (
      <polyline
        points="11,2 5,8 11,14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  }

  const path = paths[name]
  // Se não tiver SVG definido, retorna um span vazio (graceful degradation)
  if (!path) return <span className={className} style={style} />

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      {path}
    </svg>
  )
}
