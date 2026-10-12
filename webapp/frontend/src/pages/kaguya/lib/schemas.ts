// Esquema da coleção de tarefas (padrão useCollection): busca + tipo/lista/grupo ("só estas" ou "todas menos estas")/prioridade/
// vencimento/etiquetas/GTD/local + flags + 5 ordenações + 4 agrupamentos. Um escopo por tela (cada lista/visão guarda os próprios filtros e a própria ordem),
// no espírito do `kg:list:controls:<id>` do shell antigo — agora no motor do Design System.

import { defineCollection, type CollectionSchema } from '../../../design/core/collection'
import type { Task } from '../types'
import { DUE_BUCKETS, PRIORITY_LABEL, PRIORITY_ORDER, dueBucket } from './taskView'

export type TaskSortId = 'manual' | 'due' | 'priority' | 'title' | 'created'

export interface TaskSchemaOptions {
  /** Identifica a tela: `kaguya:list:12`, `kaguya:view:today`… (persistência dos filtros/ordem). */
  scope: string
  today: string
  /** Nomes das listas por id — para agrupar/filtrar por lista nas visões que cruzam listas. */
  projectNames?: Record<number, string>
  /** Grupo de cada lista (id da lista → id do grupo) e nomes dos grupos: liga o filtro por grupo nas telas que cruzam grupos. */
  projectGroups?: Record<number, number | null>
  groupNames?: Record<number, string>
  /** Locais (Onde @) por id: liga o filtro por local. */
  contextNames?: Record<number, string>
  /** Ordenação inicial (padrão: manual — a ordem arrastada). */
  sortBy?: TaskSortId
  /** Agrupamento inicial. */
  groupBy?: 'none' | 'priority' | 'due' | 'project' | 'tag'
}

const searchText = (t: Task): string[] => [t.title, t.description ?? '', ...(t.tags ?? []).map((g) => g.name), t.project_name ?? '']

export const TYPE_OPTIONS: { value: string; label: string }[] = [{ value: 'task', label: 'Tarefa' }, { value: 'event', label: 'Evento' }, { value: 'birthday', label: 'Aniversário' }]
export const GTD_OPTIONS: { value: string; label: string }[] = [
  { value: 'next_action', label: 'Próxima ação' }, { value: 'waiting', label: 'Aguardando' }, { value: 'someday', label: 'Algum dia' }, { value: 'none', label: 'Sem status' },
]

export function makeTasksSchema({ scope, today, projectNames = {}, projectGroups = {}, groupNames = {}, contextNames = {}, sortBy = 'manual', groupBy = 'none' }: TaskSchemaOptions): CollectionSchema<Task> {
  const projectOptions = Object.entries(projectNames).map(([id, name]) => ({ value: id, label: name }))
  const groupOptions = [...Object.entries(groupNames).map(([id, name]) => ({ value: id, label: name })), { value: 'none', label: 'Sem grupo' }]
  const contextOptions = [...Object.entries(contextNames).map(([id, name]) => ({ value: id, label: name })), { value: 'none', label: 'Sem local' }]
  return defineCollection<Task>({
    scope,
    search: searchText,
    facets: [
      { kind: 'enum', id: 'type', label: 'Tipo', options: TYPE_OPTIONS, get: (t) => t.type },
      ...(projectOptions.length > 1
        ? [{ kind: 'enum' as const, id: 'project', label: 'Lista', excludable: true, get: (t: Task) => String(t.project_id), options: projectOptions }]
        : []),
      ...(Object.keys(groupNames).length > 1
        ? [{ kind: 'enum' as const, id: 'group', label: 'Grupo', excludable: true, get: (t: Task) => String(projectGroups[t.project_id] ?? 'none'), options: groupOptions }]
        : []),
      { kind: 'enum', id: 'priority', label: 'Prioridade', get: (t) => String(t.priority), options: PRIORITY_ORDER.map((p) => ({ value: String(p), label: PRIORITY_LABEL[p] })) },
      { kind: 'enum', id: 'due', label: 'Vencimento', get: (t) => dueBucket(t, today), options: DUE_BUCKETS },
      { kind: 'tags', id: 'tags', label: 'Etiquetas', get: (t) => (t.tags ?? []).map((g) => g.name) },
      { kind: 'enum', id: 'gtd', label: 'Status GTD', get: (t) => t.gtd_status ?? 'none', options: GTD_OPTIONS },
      ...(Object.keys(contextNames).length > 0
        ? [{ kind: 'enum' as const, id: 'context', label: 'Onde (@)', get: (t: Task) => String(t.context_id ?? 'none'), options: contextOptions }]
        : []),
      { kind: 'flag', id: 'myday', label: 'Só no Meu Dia', get: (t) => !!t.my_day_date },
      { kind: 'flag', id: 'recurring', label: 'Só recorrentes', get: (t) => !!t.recurrence },
      { kind: 'flag', id: 'blocked', label: 'Só bloqueadas', get: (t) => !!t.blocked },
      { kind: 'flag', id: 'notes', label: 'Só com notas', get: (t) => !!t.description?.trim() },
      { kind: 'flag', id: 'subtasks', label: 'Só com subtarefas', get: (t) => !!t.subtasks?.length },
    ],
    groups: [
      { id: 'priority', label: 'Prioridade', key: (t) => PRIORITY_LABEL[t.priority] ?? PRIORITY_LABEL[0] },
      { id: 'due', label: 'Vencimento', key: (t) => DUE_BUCKETS.find((b) => b.value === dueBucket(t, today))!.label },
      { id: 'project', label: 'Lista', key: (t) => t.project_name ?? projectNames[t.project_id] ?? 'Sem lista' },
      { id: 'tag', label: 'Etiqueta', key: (t) => t.tags?.[0]?.name ?? 'Sem etiqueta' },
    ],
    sorts: [
      { id: 'manual', label: 'Ordem manual', value: (t) => t.position },
      // Sem data vai para o fim em qualquer direção razoável: usa um sentinela alto.
      { id: 'due', label: 'Vencimento', value: (t) => (t.due_date ? `${t.due_date} ${t.due_time ?? '99:99'}` : '9999-12-31') },
      { id: 'priority', label: 'Prioridade', value: (t) => t.priority },
      { id: 'title', label: 'Título', value: (t) => t.title.toLowerCase() },
      { id: 'created', label: 'Criação', value: (t) => t.created_at },
    ],
    defaults: { groupBy, sortBy, dir: sortBy === 'priority' || sortBy === 'created' ? 'desc' : 'asc' },
  })
}
