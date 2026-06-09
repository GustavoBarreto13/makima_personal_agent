/**
 * icons.tsx — Conjunto de ícones SVG da Nami
 *
 * Portado do handoff de referência (docs/.../nami/ui.jsx → objeto ICONS).
 * Cada ícone é um fragmento de path SVG. O componente <Icon> renderiza o SVG
 * com viewBox 0 0 24 24, stroke-based (Lucide style).
 *
 * Mapa LUCIDE_TO_ICON converte os nomes que o backend retorna em
 * /api/finances/categories (ex.: "ShoppingCart") para a chave local (ex.: "cart").
 *
 * Uso:
 *   import { Icon } from '../icons'
 *   <Icon name="receipt" size={16} />
 */


// ── Mapa de paths SVG ────────────────────────────────────────────────────────
// Cada entrada é o conteúdo interno do <svg> (paths, circles, lines, etc.)
// Todos usam viewBox="0 0 24 24" stroke="currentColor" fill="none"

const ICONS: Record<string, string> = {
  // — Navegação e ações do shell —
  dashboard: `<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`,

  receipt: `<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M16 8H8M16 12H8M12 16H8"/>`,

  bank: `<path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/>`,

  card: `<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>`,

  target: `<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>`,

  repeat: `<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>`,

  handshake: `<path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 0C1.46 6.7 1.33 10.28 4 13l8 8 8-8c2.67-2.72 2.54-6.3.42-8.42z"/><path d="M12 5.36 8.87 8.5a2.13 2.13 0 0 0 0 3h0a2.13 2.13 0 0 0 3 0l2.26-2.21a1 1 0 0 1 1.4 0L18 12"/>`,

  building: `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/>`,

  // — Ações gerais —
  plus: `<path d="M12 5v14M5 12h14"/>`,

  minus: `<path d="M5 12h14"/>`,

  check: `<path d="M20 6L9 17l-5-5"/>`,

  x: `<path d="M18 6 6 18M6 6l12 12"/>`,

  search: `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>`,

  chevL: `<path d="M15 18l-6-6 6-6"/>`,

  chevR: `<path d="M9 18l6-6-6-6"/>`,

  up: `<path d="M18 15l-6-6-6 6"/>`,

  down: `<path d="M6 9l6 6 6-6"/>`,

  eye: `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/>`,

  trash: `<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>`,

  image: `<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>`,

  upload: `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>`,

  wallet: `<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>`,

  // — Back / external —
  arrowLeft: `<path d="M19 12H5M12 5l-7 7 7 7"/>`,

  // — Categorias de transação —
  cart: `<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>`,

  utensils: `<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>`,

  coffee: `<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8Z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>`,

  car: `<path d="M19 17H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2Z"/><path d="M7 17v2M17 17v2"/><path d="m5 9 2-4h10l2 4"/>`,

  home: `<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>`,

  pulse: `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`,

  ticket: `<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/>`,

  bag: `<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>`,

  book: `<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>`,

  tag: `<path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l6.59-6.59a1 1 0 0 0 0-1.41L12 2Z"/><path d="M7 7h.01"/>`,

  money: `<circle cx="12" cy="12" r="10"/><path d="M12 6v12M8 9.5c0-1.4 1.8-2.5 4-2.5s4 1.1 4 2.5-1.8 2.5-4 2.5-4 1.1-4 2.5 1.8 2.5 4 2.5 4-1.1 4-2.5"/>`,

  gift: `<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>`,

  zap: `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`,

  more: `<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>`,
}

// ── Mapa Lucide → chave local ─────────────────────────────────────────────────
// O backend retorna nomes de ícones do Lucide (ex.: "ShoppingCart").
// Este mapa converte para a chave do nosso conjunto SVG interno.
// Fallback: se não encontrar, usa "tag".

export const LUCIDE_TO_ICON: Record<string, string> = {
  // Compras / mercado
  ShoppingCart:      'cart',
  ShoppingBag:       'bag',
  // Alimentação
  UtensilsCrossed:   'utensils',
  Utensils:          'utensils',
  Coffee:            'coffee',
  // Transporte
  Car:               'car',
  Bus:               'car',
  // Moradia
  Home:              'home',
  House:             'home',
  // Saúde
  Heart:             'pulse',
  Activity:          'pulse',
  Stethoscope:       'pulse',
  // Lazer / entretenimento
  Gamepad2:          'ticket',
  Gamepad:           'ticket',
  Ticket:            'ticket',
  // Roupas
  Shirt:             'bag',
  // Educação
  BookOpen:          'book',
  Book:              'book',
  GraduationCap:     'book',
  // Finanças / renda
  DollarSign:        'money',
  Banknote:          'money',
  Wallet:            'wallet',
  PiggyBank:         'money',
  // Presentes / misc
  Gift:              'gift',
  // Conta / banco
  Building2:         'bank',
  Building:          'building',
  Landmark:          'bank',
  // Assinaturas / TV
  Tv:                'ticket',
  Monitor:           'ticket',
  // Energia / utilidades
  Zap:               'zap',
  Lightbulb:         'zap',
  // Genérico
  Tag:               'tag',
  MoreHorizontal:    'more',
  Circle:            'tag',
}

// ── Componente <Icon> ─────────────────────────────────────────────────────────

interface IconProps {
  /** Nome do ícone (chave do mapa ICONS ou resultado de LUCIDE_TO_ICON) */
  name: string
  /** Tamanho em px (padrão: 16) */
  size?: number
  /** Classe CSS adicional */
  className?: string
  /** Cor (padrão: currentColor) */
  color?: string
}

/**
 * Renderiza um ícone SVG inline do conjunto portado do handoff.
 *
 * Args:
 *   name: chave do ícone (ex.: "receipt", "cart"). Se não encontrado, usa "tag".
 *   size: largura e altura em pixels.
 *   className: classe CSS adicional para o elemento svg.
 *   color: cor do ícone (padrão: herda do CSS via currentColor).
 *
 * Returns:
 *   Elemento SVG com o path do ícone.
 *
 * Example:
 *   <Icon name="receipt" size={18} />
 */
export function Icon({ name, size = 16, className, color }: IconProps) {
  // Busca o path no mapa; fallback para "tag" se não encontrar
  const paths = ICONS[name] ?? ICONS['tag']

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? 'currentColor'}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      // dangerouslySetInnerHTML é necessário aqui porque armazenamos o SVG
      // como string HTML para manter o mapa de ícones compacto e fácil de editar.
      // Os dados vêm de uma constante interna (não de entrada do usuário),
      // então não há risco de XSS.
      dangerouslySetInnerHTML={{ __html: paths }}
      aria-hidden="true"
    />
  )
}

/**
 * Converte um nome de ícone Lucide (retornado pelo backend em /api/finances/categories)
 * para a chave correspondente no conjunto SVG local.
 *
 * Args:
 *   lucideName: nome do ícone conforme retornado pela API (ex.: "ShoppingCart").
 *
 * Returns:
 *   Chave do ícone local (ex.: "cart"). Fallback: "tag".
 *
 * Example:
 *   lucideToKey("UtensilsCrossed") // → "utensils"
 *   lucideToKey("Inexistente")     // → "tag"
 */
export function lucideToKey(lucideName: string): string {
  return LUCIDE_TO_ICON[lucideName] ?? 'tag'
}
