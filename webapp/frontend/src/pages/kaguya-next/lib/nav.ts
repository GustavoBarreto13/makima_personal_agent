// Navegação do shell: monta os grupos do menu (sidebar no desktop, gaveta/barra no celular) a partir do que o servidor
// devolve, do espaço escolhido (Tudo/Trabalho/Pessoal) e das preferências (itens ocultos e fixados). Puro, sem React.
// Os ids do menu codificam a rota: `today`, `date:inbox`, `gtd:waiting`, `filter:5`, `list:12`, `group:3`.

import type { IconName } from '../../../design'
import type { NavGroup, NavEntry } from '../../../design'
import type { DateViewCounts, Filter, Group, Project } from '../types'
import type { Route, ViewId } from './routes'

export type SpaceChoice = 'all' | 'work' | 'personal'

export interface Fixed { id: string; label: string; icon: IconName; key?: string }

export const PLAN: Fixed[] = [
  { id: 'today', label: 'Meu Dia', icon: 'sun', key: 'h' },
  { id: 'calendar', label: 'Calendário', icon: 'calendar', key: 'c' },
  { id: 'eisenhower', label: 'Eisenhower', icon: 'grid', key: 'e' },
]
export const DATE_VIEWS: Fixed[] = [
  { id: 'date:inbox', label: 'Inbox', icon: 'inbox', key: 'i' },
  { id: 'date:all', label: 'Todas', icon: 'list', key: 'a' },
  { id: 'date:tomorrow', label: 'Amanhã', icon: 'sunrise' },
  { id: 'date:next7', label: 'Próximos 7 dias', icon: 'days', key: '7' },
]
export const GTD: Fixed[] = [
  { id: 'gtd:next-actions', label: 'Próximas ações', icon: 'check' },
  { id: 'gtd:waiting', label: 'Aguardando', icon: 'waiting' },
  { id: 'gtd:someday', label: 'Algum dia', icon: 'watchlist' },
  { id: 'gtd:quick', label: 'Rápidas (5 min)', icon: 'timer' },
  { id: 'gtd:energy', label: 'Alta energia', icon: 'energy' },
]
export const LIFE: Fixed[] = [
  { id: 'habits', label: 'Hábitos', icon: 'habit', key: 'b' },
  { id: 'goals', label: 'Metas', icon: 'goal', key: 'm' },
  { id: 'experiments', label: 'Experimentos', icon: 'experiment' },
  { id: 'focus', label: 'Foco', icon: 'focus', key: 'f' },
]
export const RECORD: Fixed[] = [
  { id: 'logbook', label: 'Concluídas', icon: 'logbook', key: 'o' },
  { id: 'stats', label: 'Estatísticas', icon: 'stats', key: 's' },
  { id: 'organize', label: 'Organizar', icon: 'folder', key: 'g' },
  { id: 'tags', label: 'Etiquetas', icon: 'tag' },
  { id: 'templates', label: 'Templates', icon: 'template' },
  { id: 'archived', label: 'Arquivadas', icon: 'archive' },
  { id: 'trash', label: 'Lixeira', icon: 'delete', key: 'x' },
]

/** Entradas fixas (sem listas/filtros) — o que a tela de preferências oferece para ocultar/fixar. */
export const FIXED_NAV: { section: string; items: Fixed[] }[] = [
  { section: 'Planejar', items: PLAN }, { section: 'Visões', items: DATE_VIEWS }, { section: 'GTD', items: GTD },
  { section: 'Vida', items: LIFE }, { section: 'Registro', items: RECORD },
]

/** Itens do celular quando o usuário não escolheu (até 3). */
export const DEFAULT_MOBILE_TABS = ['today', 'date:inbox', 'calendar']

export interface NavInput {
  projects: Project[]
  groups: Group[]
  filters: Filter[]
  counts: DateViewCounts | null
  space: SpaceChoice
  hidden: string[]
  pinned: string[]
}

export const inSpace = (space: SpaceChoice, ctx: string | undefined): boolean => space === 'all' || (ctx ?? 'personal') === space

export function buildNav({ projects, groups, filters, counts, space, hidden, pinned }: NavInput): NavGroup[] {
  const hide = new Set(hidden)
  const fixed = (items: Fixed[]): NavEntry[] => items.map((f) => ({
    id: f.id, label: f.label, icon: f.icon, key: f.key,
    count: f.id.startsWith('date:') && counts ? counts[f.id.slice(5) as keyof DateViewCounts] || undefined : undefined,
  }))
  const listEntry = (p: Project): NavEntry => ({ id: `list:${p.id}`, label: p.name, icon: p.is_inbox ? 'inbox' : 'folder', count: p.open_count || undefined })

  const visibleProjects = projects.filter((p) => !p.is_inbox && inSpace(space, p.context))
  const byGroup = new Map<number, Project[]>()
  const loose: Project[] = []
  for (const p of visibleProjects) {
    if (p.group_id == null) loose.push(p)
    else byGroup.set(p.group_id, [...(byGroup.get(p.group_id) ?? []), p])
  }

  const sections: NavGroup[] = [
    { label: 'Planejar', items: fixed(PLAN) },
    {
      label: 'Visões',
      items: [
        ...fixed(DATE_VIEWS),
        ...fixed(GTD),
        ...filters.map((f): NavEntry => ({ id: `filter:${f.id}`, label: f.name, icon: 'filter' })),
      ],
    },
    ...groups.flatMap((g): NavGroup[] => {
      const lists = byGroup.get(g.id)
      if (!lists?.length) return []
      return [{ label: g.name, items: [{ id: `group:${g.id}`, label: g.name, icon: 'kanban' }, ...lists.map(listEntry)] }]
    }),
    ...(loose.length ? [{ label: 'Listas', items: loose.map(listEntry) }] : []),
    { label: 'Vida', items: fixed(LIFE) },
    { label: 'Registro', items: fixed(RECORD) },
  ]

  const visible = sections
    .map((s) => ({ ...s, items: s.items.filter((i) => !hide.has(i.id)) }))
    .filter((s) => s.items.length > 0)

  const all = new Map(sections.flatMap((s) => s.items).map((i) => [i.id, i]))
  const pins = pinned.map((id) => all.get(id)).filter((e): e is NavEntry => !!e)
  return pins.length ? [{ label: 'Fixadas', items: pins }, ...visible] : visible
}

export function navIdToRoute(id: string): Route {
  const [kind, arg] = id.split(':')
  if (arg === undefined) return { view: kind as ViewId }
  if (kind === 'date') return { view: 'date', key: arg }
  if (kind === 'gtd') return { view: 'gtd', key: arg }
  const n = Number(arg)
  if (kind === 'list') return { view: 'list', id: n }
  if (kind === 'group') return { view: 'group', id: n }
  if (kind === 'filter') return { view: 'filter', id: n }
  return { view: 'today' }
}

export function routeToNavId(r: Route): string {
  switch (r.view) {
    case 'date': return `date:${r.key ?? 'all'}`
    case 'gtd': return `gtd:${r.key ?? ''}`
    case 'list': case 'kanban': return `list:${r.id}`
    case 'group': case 'group-list': return `group:${r.id}`
    case 'filter': return `filter:${r.id}`
    default: return r.view
  }
}

/** Título curto da tela (topbar) a partir da rota e dos dados já carregados. */
export function titleFor(r: Route, projects: Project[], groups: Group[], filters: Filter[]): string {
  const fixed = [...PLAN, ...DATE_VIEWS, ...GTD, ...LIFE, ...RECORD].find((f) => f.id === routeToNavId(r))
  if (fixed) return fixed.label
  if (r.view === 'list' || r.view === 'kanban') return projects.find((p) => p.id === r.id)?.name ?? 'Lista'
  if (r.view === 'group' || r.view === 'group-list') return groups.find((g) => g.id === r.id)?.name ?? 'Grupo'
  if (r.view === 'filter') return filters.find((f) => f.id === r.id)?.name ?? 'Smart-list'
  return 'Tarefas'
}
