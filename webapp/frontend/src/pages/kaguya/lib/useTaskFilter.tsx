// O filtro único das telas de tarefas (Lista, Quadro, Matriz, Calendário): monta o esquema da coleção, guarda os filtros rápidos por
// tela (useCollection) e as regras avançadas (E/OU), busca no servidor os ids que as regras aceitam e devolve a lista já filtrada,
// o contador de filtros ativos e o modal pronto. Cada tela só decide ONDE pôr o botão e o que fazer com `c.result`.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from '../../../design'
import { filterItems, type CollectionSchema } from '../../../design/core/collection'
import { useCollection, type UseCollection } from '../../../design/headless/useCollection'
import { kaguyaApi } from '../api'
import { TaskFilterModal } from '../components/TaskFilterModal'
import { useKaguya } from '../context'
import type { FilterRules, Task, TaskContext } from '../types'
import { makeTasksSchema, type TaskSchemaOptions } from './schemas'
import { safe, useLoad } from './useLoad'

/** Tarefa projetada de uma série recorrente não tem id próprio: vale o da série. */
const defaultIdOf = (t: Task): number | null => t.id ?? t.series_task_id ?? null

export interface TaskFilterOptions {
  /** Identifica a tela (`list:12`, `calendar`…): cada uma guarda os próprios filtros. */
  scope: string
  tasks: Task[]
  /** Oferece o filtro de Lista (telas que cruzam listas). */
  showProject?: boolean
  /** Oferece o filtro de Grupo (telas que cruzam grupos). */
  showGroup?: boolean
  sortBy?: TaskSchemaOptions['sortBy']
  groupBy?: TaskSchemaOptions['groupBy']
  idOf?: (t: Task) => number | null | undefined
  /** Quadro de uma lista: a seção avançada oferece “Guardar como View”. */
  onViewSaved?: () => void
}

export interface TaskFilter {
  schema: CollectionSchema<Task>
  c: UseCollection<Task>
  /** Regras avançadas em vigor (ou nada). */
  rules: FilterRules | null
  clearRules: () => void
  /** Aplica os filtros em vigor (rápidos + regras) a outra lista de tarefas, sem busca nem ordenação. */
  apply: (list: Task[]) => Task[]
  /** Filtros rápidos ativos (sem a busca) + 1 se há regras avançadas. */
  activeCount: number
  open: () => void
  clearAll: () => void
  /** O modal, quando aberto (renderize uma vez na tela). */
  modal: ReactNode
}

export function useTaskFilter({ scope, tasks, showProject = false, showGroup = false, sortBy, groupBy, idOf = defaultIdOf, onViewSaved }: TaskFilterOptions): TaskFilter {
  const k = useKaguya()
  const contexts = useLoad<TaskContext[]>(() => safe(() => kaguyaApi.listContexts(), []), [])
  const contextNames = useMemo(
    () => Object.fromEntries((contexts.state.status === 'ok' ? contexts.state.data : []).map((x) => [x.id, x.name])) as Record<number, string>,
    [contexts.state],
  )
  const projectGroups = useMemo(() => Object.fromEntries(k.projects.map((p) => [p.id, p.group_id ?? null])) as Record<number, number | null>, [k.projects])
  const groupNames = useMemo(() => Object.fromEntries(k.groups.map((g) => [g.id, g.name])) as Record<number, string>, [k.groups])

  const [rules, setRules] = useState<FilterRules | null>(null)
  const [ids, setIds] = useState<Set<number> | null>(null)
  const [isOpen, setOpen] = useState(false)

  // Regras avançadas → ids no servidor (refaz quando muda a regra, o espaço ou os dados).
  useEffect(() => {
    let live = true
    if (!rules) { setIds(null); return }
    kaguyaApi.taskFilterIds(rules, k.space)
      .then((r) => { if (live) setIds(r.ids ? new Set(r.ids) : null) })
      .catch(() => { if (live) { setRules(null); toast('Não foi possível aplicar as regras.', { tone: 'error' }) } })
    return () => { live = false }
  }, [rules, k.space, k.rev])

  const pool = useMemo(() => (ids ? tasks.filter((t) => { const id = idOf(t); return id != null && ids.has(id) }) : tasks), [tasks, ids]) // eslint-disable-line react-hooks/exhaustive-deps
  const schema = useMemo(
    () => makeTasksSchema({
      scope: `kaguya:${scope}`, today: k.today, sortBy, groupBy, contextNames,
      projectNames: showProject ? k.projectNames : undefined,
      projectGroups: showGroup ? projectGroups : undefined, groupNames: showGroup ? groupNames : undefined,
    }),
    [scope, k.today, sortBy, groupBy, contextNames, showProject, showGroup, k.projectNames, projectGroups, groupNames],
  )
  const c = useCollection(schema, pool, { today: k.today })
  const clearAll = () => { c.clearAll(); setRules(null) }
  const apply = useCallback(
    (list: Task[]) => filterItems(schema, { ...c.state, q: '' }, ids ? list.filter((t) => { const id = idOf(t); return id != null && ids.has(id) }) : list, k.today),
    [schema, c.state, ids, k.today], // eslint-disable-line react-hooks/exhaustive-deps
  )

  return {
    schema, c, rules, clearRules: () => setRules(null), apply,
    activeCount: c.chips.filter((x) => x.facetId !== 'q').length + (rules ? 1 : 0),
    open: () => setOpen(true),
    clearAll,
    modal: isOpen ? (
      <TaskFilterModal schema={schema} c={c} items={tasks} rules={rules} onRules={setRules} onClear={clearAll} onClose={() => setOpen(false)} onViewSaved={onViewSaved} />
    ) : null,
  }
}
