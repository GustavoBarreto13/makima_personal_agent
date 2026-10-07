// Rotas por hash (/books#diario, /books#livro/<id>). A tela e o item aberto vivem na URL, então o
// Voltar do navegador, links salvos e o recarregar da página funcionam (o shell antigo guardava a tela
// só na memória: recarregar sempre voltava ao Início).

export type ViewId = 'home' | 'catalog' | 'toread' | 'wishlist' | 'diary' | 'shelves' | 'reviews' | 'stats'

/** Onde o usuário está: a tela e, quando há, o livro ou a estante aberta. */
export interface Route {
  view: ViewId
  bookId?: string
  shelfId?: string
}

export const VIEW_HASH: Record<ViewId, string> = {
  home: 'inicio',
  catalog: 'biblioteca',
  toread: 'quero-ler',
  wishlist: 'wishlist',
  diary: 'diario',
  shelves: 'estantes',
  reviews: 'resenhas',
  stats: 'estatisticas',
}

// Nomes aceitos na URL: os oficiais e os das telas do shell antigo (catalogo, atividade, listas…).
const ALIASES: Record<string, ViewId> = {
  ...Object.fromEntries(Object.entries(VIEW_HASH).map(([view, hash]) => [hash, view as ViewId])),
  catalogo: 'catalog',
  querler: 'toread',
  atividade: 'diary',
  listas: 'shelves',
  stats: 'stats',
}

export function routeFromHash(hash: string): Route {
  const h = hash.replace(/^#/, '')
  const [head, rest] = h.split('/')
  const key = head.toLowerCase()
  // O ID do livro/estante preserva maiúsculas (UUIDs são minúsculos, mas não arriscamos).
  if (key === 'livro' && rest) return { view: 'catalog', bookId: rest }
  if (key === 'estante' && rest) return { view: 'shelves', shelfId: rest }
  return { view: ALIASES[key] ?? 'home' }
}

export function hashFor(route: Route): string {
  if (route.bookId) return `livro/${route.bookId}`
  if (route.shelfId) return `estante/${route.shelfId}`
  return VIEW_HASH[route.view]
}
