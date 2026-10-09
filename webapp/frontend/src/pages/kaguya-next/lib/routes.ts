// Rotas por hash do shell da Kaguya (/tasks#lista/12/t/88). A tela, o item aberto e a tarefa aberta no painel
// de detalhe vivem na URL: o Voltar do navegador, links salvos e o recarregar funcionam (o shell antigo guardava
// tudo só em memória — recarregar sempre voltava ao Meu Dia).

export type ViewId =
  | 'today' | 'list' | 'kanban' | 'group' | 'group-list' | 'calendar' | 'date' | 'gtd' | 'filter' | 'eisenhower'
  | 'habits' | 'goals' | 'experiments' | 'focus' | 'logbook' | 'stats' | 'trash' | 'archived' | 'templates' | 'tags' | 'organize'

/** Chaves das visões de data (Todas, Amanhã…) — o `date` da rota. */
export const DATE_KEYS = ['all', 'today', 'tomorrow', 'next7', 'inbox'] as const
export type DateKey = (typeof DATE_KEYS)[number]

/** Onde o usuário está. `id` é a lista/grupo/filtro/meta/experimento; `key` é a visão de data ou o built-in GTD. */
export interface Route {
  view: ViewId
  id?: number
  key?: string
  /** Tarefa aberta no painel de detalhe (#…/t/88). */
  taskId?: number
}

/** Telas sem parâmetro: id da rota → trecho do hash. */
const PLAIN: Partial<Record<ViewId, string>> = {
  today: 'hoje', calendar: 'calendario', eisenhower: 'eisenhower', habits: 'habitos', logbook: 'concluidas',
  focus: 'foco', stats: 'estatisticas', trash: 'lixeira', archived: 'arquivadas', templates: 'templates', tags: 'etiquetas', organize: 'organizar',
}
/** Telas com um id numérico opcional (lista, quadro, grupo, filtro, meta, experimento). */
const WITH_ID: Partial<Record<ViewId, string>> = {
  list: 'lista', kanban: 'kanban', group: 'grupo', 'group-list': 'grupo-lista', filter: 'filtro', goals: 'metas', experiments: 'experimentos',
}

// Nomes aceitos na URL além dos oficiais: os do shell antigo e variações sem acento.
const ALIASES: Record<string, string> = {
  today: 'hoje', 'meu-dia': 'hoje', calendar: 'calendario', calendário: 'calendario', habits: 'habitos', hábitos: 'habitos',
  done: 'concluidas', concluídas: 'concluidas', logbook: 'concluidas', stats: 'estatisticas', estatísticas: 'estatisticas',
  trash: 'lixeira', archived: 'arquivadas', tags: 'etiquetas', goals: 'metas', experiments: 'experimentos', focus: 'foco',
}

const isDateKey = (s: string): s is DateKey => (DATE_KEYS as readonly string[]).includes(s)
const toId = (s: string | undefined): number | undefined => (s && /^\d+$/.test(s) ? Number(s) : undefined)

export function routeFromHash(hash: string): Route {
  const parts = hash.replace(/^#/, '').split('/').filter(Boolean)
  // O painel de detalhe é sempre o sufixo "/t/<id>".
  let taskId: number | undefined
  const t = parts.lastIndexOf('t')
  if (t !== -1 && t === parts.length - 2 && toId(parts[t + 1]) !== undefined) {
    taskId = toId(parts[t + 1])
    parts.splice(t, 2)
  }
  const head = ALIASES[(parts[0] ?? '').toLowerCase()] ?? (parts[0] ?? '').toLowerCase()
  const withTaskId = (r: Route): Route => (taskId === undefined ? r : { ...r, taskId })

  for (const [view, name] of Object.entries(PLAIN)) if (name === head) return withTaskId({ view: view as ViewId })
  for (const [view, name] of Object.entries(WITH_ID)) {
    if (name === head) return withTaskId({ view: view as ViewId, id: toId(parts[1]) })
  }
  if (head === 'visao') return withTaskId({ view: 'date', key: isDateKey(parts[1] ?? '') ? parts[1] : 'all' })
  if (head === 'gtd' && parts[1]) return withTaskId({ view: 'gtd', key: parts[1] })
  if (head === 'tarefa' && toId(parts[1]) !== undefined) return { view: 'today', taskId: toId(parts[1]) }
  return withTaskId({ view: 'today' })
}

export function hashFor(route: Route): string {
  let base: string
  if (route.view === 'date') base = `visao/${route.key ?? 'all'}`
  else if (route.view === 'gtd') base = `gtd/${route.key ?? ''}`
  else if (WITH_ID[route.view]) base = route.id !== undefined ? `${WITH_ID[route.view]}/${route.id}` : WITH_ID[route.view]!
  else base = PLAIN[route.view] ?? 'hoje'
  return route.taskId !== undefined ? `${base}/t/${route.taskId}` : base
}

/** Mesma tela (ignora a tarefa aberta no painel) — para o painel abrir sem recarregar a lista. */
export function sameScreen(a: Route, b: Route): boolean {
  return a.view === b.view && a.id === b.id && a.key === b.key
}

/** A mesma rota com outra tarefa aberta no painel (ou sem nenhuma). */
export function withTask(route: Route, taskId: number | undefined): Route {
  const { taskId: _drop, ...rest } = route
  return taskId === undefined ? rest : { ...rest, taskId }
}
