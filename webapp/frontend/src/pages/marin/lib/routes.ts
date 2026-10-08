// Rotas por hash (/animes#diario, /animes#anime/<id>). A tela e o item aberto vivem na URL, então o Voltar do
// navegador, links salvos e o recarregar da página funcionam (o shell antigo guardava a tela só na memória:
// recarregar sempre voltava ao Início).

export type ViewId = 'home' | 'catalog' | 'queue' | 'diary' | 'schedule' | 'lists' | 'tags' | 'stats'

/** Onde o usuário está: a tela e, quando há, o anime ou a lista aberta. */
export interface Route {
  view: ViewId
  animeId?: string
  listId?: string
}

export const VIEW_HASH: Record<ViewId, string> = {
  home: 'inicio',
  catalog: 'catalogo',
  queue: 'quero-ver',
  diary: 'diario',
  schedule: 'lancamentos',
  lists: 'listas',
  tags: 'etiquetas',
  stats: 'estatisticas',
}

// Nomes aceitos na URL: os oficiais e os das telas do shell antigo (watchlist, rewind…).
const ALIASES: Record<string, ViewId> = {
  ...Object.fromEntries(Object.entries(VIEW_HASH).map(([view, hash]) => [hash, view as ViewId])),
  watchlist: 'queue',
  'quero-assistir': 'queue',
  rewind: 'stats',
  stats: 'stats',
}

export function routeFromHash(hash: string): Route {
  const h = hash.replace(/^#/, '')
  const [head, rest] = h.split('/')
  const key = head.toLowerCase()
  // O ID do anime/lista preserva maiúsculas (UUIDs são minúsculos, mas não arriscamos).
  if (key === 'anime' && rest) return { view: 'catalog', animeId: rest }
  if (key === 'lista' && rest) return { view: 'lists', listId: rest }
  return { view: ALIASES[key] ?? 'home' }
}

export function hashFor(route: Route): string {
  if (route.animeId) return `anime/${route.animeId}`
  if (route.listId) return `lista/${route.listId}`
  return VIEW_HASH[route.view]
}
