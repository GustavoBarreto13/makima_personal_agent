// Ícones SVG inline para o Violet · Diário.
// SVG inline é preferível a um icon font porque: tamanho menor, sem FOUT,
// cor controlada via CSS currentColor e fácil de animar.
// strokeWidth: 1.8px em todos; moon/heart/gem são preenchidos (sem stroke).

// Nomes de ícones disponíveis no Violet
export type IconName =
  | 'write'
  | 'journal'
  | 'reflect'
  | 'insights'
  | 'moon'
  | 'heart'
  | 'gem'
  | 'bulb'
  | 'hash'
  | 'at'
  | 'pin'
  | 'search'
  | 'sliders'
  | 'envelope'
  | 'chevron-left'
  | 'arrow-left'

interface IconProps {
  // Nome do ícone a renderizar
  name: IconName
  // Tamanho em pixels (default: 15)
  size?: number
  // Classe CSS adicional para customização
  className?: string
}

// Mapa de paths SVG por nome de ícone.
// viewBox sempre 0 0 24 24. stroke via currentColor (exceto filled).
const PATHS: Record<IconName, React.ReactNode> = {
  // Lápis/caneta — tela Write
  write: (
    <path
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      fill="none" stroke="currentColor"
      d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
    />
  ),
  // Livro aberto — tela Journal (arquivo)
  journal: (
    <path
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      fill="none" stroke="currentColor"
      d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"
    />
  ),
  // Espelho/reflexão — tela Reflect
  reflect: (
    <>
      <circle cx="12" cy="12" r="8" strokeWidth={1.8} fill="none" stroke="currentColor" />
      <line x1="3" y1="12" x2="5" y2="12" strokeWidth={1.8} stroke="currentColor" />
      <line x1="19" y1="12" x2="21" y2="12" strokeWidth={1.8} stroke="currentColor" />
      <line x1="12" y1="3" x2="12" y2="5" strokeWidth={1.8} stroke="currentColor" />
      <line x1="12" y1="19" x2="12" y2="21" strokeWidth={1.8} stroke="currentColor" />
    </>
  ),
  // Gráfico de barras — tela Insights
  insights: (
    <path
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      fill="none" stroke="currentColor"
      d="M18 20V10M12 20V4M6 20v-6"
    />
  ),
  // Lua cheia (preenchida) — prompt de sonho
  moon: (
    <path
      fill="currentColor" stroke="none"
      d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
    />
  ),
  // Coração preenchido — bullet highlight
  heart: (
    <path
      fill="currentColor" stroke="none"
      d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
    />
  ),
  // Gema/diamante preenchido — bullet wisdom
  gem: (
    <path
      fill="currentColor" stroke="none"
      d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
    />
  ),
  // Lâmpada — bullet idea
  bulb: (
    <>
      <line x1="9" y1="18" x2="15" y2="18" strokeWidth={1.8} stroke="currentColor" strokeLinecap="round" />
      <line x1="10" y1="22" x2="14" y2="22" strokeWidth={1.8} stroke="currentColor" strokeLinecap="round" />
      <path
        strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
        fill="none" stroke="currentColor"
        d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"
      />
    </>
  ),
  // Cerquilha — #tag
  hash: (
    <path
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      fill="none" stroke="currentColor"
      d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"
    />
  ),
  // Arroba — @pessoa
  at: (
    <>
      <circle cx="12" cy="12" r="4" strokeWidth={1.8} fill="none" stroke="currentColor" />
      <path
        strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
        fill="none" stroke="currentColor"
        d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"
      />
    </>
  ),
  // Pin — bullet note
  pin: (
    <path
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      fill="none" stroke="currentColor"
      d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 10m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0"
    />
  ),
  // Lupa — busca
  search: (
    <>
      <circle cx="11" cy="11" r="8" strokeWidth={1.8} fill="none" stroke="currentColor" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth={1.8} strokeLinecap="round" stroke="currentColor" />
    </>
  ),
  // Controles deslizantes — tweaks
  sliders: (
    <>
      <line x1="4" y1="21" x2="4" y2="14" strokeWidth={1.8} strokeLinecap="round" stroke="currentColor" />
      <line x1="4" y1="10" x2="4" y2="3" strokeWidth={1.8} strokeLinecap="round" stroke="currentColor" />
      <line x1="12" y1="21" x2="12" y2="12" strokeWidth={1.8} strokeLinecap="round" stroke="currentColor" />
      <line x1="12" y1="8" x2="12" y2="3" strokeWidth={1.8} strokeLinecap="round" stroke="currentColor" />
      <line x1="20" y1="21" x2="20" y2="16" strokeWidth={1.8} strokeLinecap="round" stroke="currentColor" />
      <line x1="20" y1="12" x2="20" y2="3" strokeWidth={1.8} strokeLinecap="round" stroke="currentColor" />
      <line x1="1" y1="14" x2="7" y2="14" strokeWidth={1.8} strokeLinecap="round" stroke="currentColor" />
      <line x1="9" y1="8" x2="15" y2="8" strokeWidth={1.8} strokeLinecap="round" stroke="currentColor" />
      <line x1="17" y1="16" x2="23" y2="16" strokeWidth={1.8} strokeLinecap="round" stroke="currentColor" />
    </>
  ),
  // Envelope — seção de Cartas (retângulo + aba "V" da dobra do envelope)
  envelope: (
    <>
      <rect
        x="2.5" y="5" width="19" height="14" rx="2"
        strokeWidth={1.8} fill="none" stroke="currentColor"
      />
      <path
        strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
        fill="none" stroke="currentColor"
        d="M3 6.5l9 6 9-6"
      />
    </>
  ),
  // Chevron esquerdo — navegar anterior
  'chevron-left': (
    <polyline
      points="15 18 9 12 15 6"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      fill="none" stroke="currentColor"
    />
  ),
  // Seta esquerda — voltar
  'arrow-left': (
    <>
      <line x1="19" y1="12" x2="5" y2="12" strokeWidth={1.8} strokeLinecap="round" stroke="currentColor" />
      <polyline points="12 19 5 12 12 5" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor" />
    </>
  ),
}

// Componente Icon — renderiza SVG inline a partir do nome
export function Icon({ name, size = 15, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"  // ícones são decorativos — acessibilidade fica no texto do botão
    >
      {PATHS[name]}
    </svg>
  )
}
