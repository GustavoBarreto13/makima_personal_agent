// Rotas por hash (/people#pessoas, /people#pessoa/<id>). A tela e a pessoa aberta vivem na URL:
// o Voltar do navegador, links salvos e o recarregar funcionam. `#pessoa/<id>` é também o link que
// a Violet e a Kaguya usam para abrir uma pessoa, então não muda de nome.

export type ViewId = 'home' | 'people' | 'dates' | 'stats'

/** Onde o usuário está: a tela e, quando há, a pessoa aberta (e a aba dela). */
export interface Route {
  view: ViewId
  /** Pessoa aberta (#pessoa/<id>). */
  personId?: string
  /** Aba da pessoa aberta (#pessoa/<id>/memoria). */
  tab?: PersonTab
  /** Relacionamento escolhido no menu (#pessoas/familia). */
  category?: string
}

export type PersonTab = 'memory' | 'notes' | 'interactions' | 'dates'

export const VIEW_HASH: Record<ViewId, string> = { home: 'inicio', people: 'pessoas', dates: 'datas', stats: 'estatisticas' }

const TAB_HASH: Record<PersonTab, string> = { memory: 'memoria', notes: 'anotacoes', interactions: 'interacoes', dates: 'datas' }
const TAB_FROM_HASH: Record<string, PersonTab> = Object.fromEntries(Object.entries(TAB_HASH).map(([tab, hash]) => [hash, tab as PersonTab]))

// Nomes aceitos na URL: os oficiais e os das telas do shell antigo.
const ALIASES: Record<string, ViewId> = {
  ...Object.fromEntries(Object.entries(VIEW_HASH).map(([view, hash]) => [hash, view as ViewId])),
  diretorio: 'people',
  stats: 'stats',
  proximas: 'dates',
}

export function routeFromHash(hash: string): Route {
  const [head = '', rest, tab] = hash.replace(/^#/, '').split('/')
  const key = head.toLowerCase()
  // O id da pessoa preserva a caixa (UUID); só a aba é minúscula.
  if (key === 'pessoa' && rest) return { view: 'people', personId: rest, tab: TAB_FROM_HASH[(tab ?? '').toLowerCase()] }
  const view = ALIASES[key] ?? 'home'
  return view === 'people' && rest ? { view, category: rest } : { view }
}

export function hashFor(route: Route): string {
  if (route.personId) return route.tab ? `pessoa/${route.personId}/${TAB_HASH[route.tab]}` : `pessoa/${route.personId}`
  if (route.view === 'people' && route.category) return `${VIEW_HASH.people}/${route.category}`
  return VIEW_HASH[route.view]
}
