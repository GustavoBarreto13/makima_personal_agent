// Rotas por hash (/movies#diario, /movies#filme/<id>). A tela e o item aberto vivem na URL,
// então voltar/avançar do navegador e links salvos funcionam.

export type ViewId = 'home' | 'diary' | 'films' | 'watchlist' | 'lists' | 'tags' | 'stats'

/** Onde o usuário está: a tela e, quando há, o filme ou a lista aberta. */
export interface Route {
  view: ViewId
  movieId?: string
  listId?: string
}

export const VIEW_HASH: Record<ViewId, string> = {
  home: 'inicio', diary: 'diario', films: 'filmes', watchlist: 'quero-ver', lists: 'listas', tags: 'etiquetas', stats: 'estatisticas',
}

const ALIASES: Record<string, ViewId> = {
  ...Object.fromEntries(Object.entries(VIEW_HASH).map(([view, hash]) => [hash, view as ViewId])),
  // nomes da versão anterior (o Rewind virou a mesma tela das Estatísticas)
  rewind: 'stats',
  stats: 'stats',
  watchlist: 'watchlist',
}

export function routeFromHash(hash: string): Route {
  const h = hash.replace(/^#/, '').toLowerCase()
  const [head, rest] = h.split('/')
  if (head === 'filme' && rest) return { view: 'films', movieId: rest }
  if (head === 'lista' && rest) return { view: 'lists', listId: rest }
  return { view: ALIASES[head] ?? 'home' }
}

export function hashFor(route: Route): string {
  if (route.movieId) return `filme/${route.movieId}`
  if (route.listId) return `lista/${route.listId}`
  return VIEW_HASH[route.view]
}
