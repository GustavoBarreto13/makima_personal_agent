// Tela de coleção de tarefas: o miolo comum de Lista, Inbox/Todas/Amanhã/7 dias, GTD e smart-lists. Cada uma só
// diz de onde vêm as tarefas (`load`); busca, filtros, ordenação, agrupamento, a barra de adicionar e a lista
// (estilo TickTick) são os mesmos — e os controles de cada tela ficam guardados por escopo.

import { useMemo, useState, type ReactNode } from 'react'
import { useCollection } from '../../../design/headless/useCollection'
import { Button, CollectionMeta, CollectionToolbar, EmptyState, ErrorState, FilterSheet, LoadingState, Page } from '../../../design'
import { useKaguya } from '../context'
import { makeTasksSchema, type TaskSchemaOptions } from '../lib/schemas'
import { useLoad } from '../lib/useLoad'
import type { Task } from '../types'
import { QuickAddBar } from '../components/QuickAddBar'
import { TaskList } from '../components/TaskList'

const NOUN: [string, string] = ['tarefa', 'tarefas']

interface Props {
  /** Escopo dos controles guardados (`list:12`, `date:today`…). */
  scope: string
  load: () => Promise<Task[]>
  /** Recarrega quando muda (além do `rev` global e do espaço). */
  deps?: unknown[]
  /** Mostra a lista de origem em cada linha (visões que cruzam listas). */
  showProject?: boolean
  /** Onde a barra "Adicionar" cria. Ausente = Inbox. */
  addProjectId?: number
  addDue?: string
  /** Concluídas do fim da lista (já carregadas pela tela). */
  completed?: Task[]
  sortBy?: TaskSchemaOptions['sortBy']
  groupBy?: TaskSchemaOptions['groupBy']
  /** Esta tela é uma lista real: dá para arrastar (na ordem manual, sem agrupar). */
  reorderable?: boolean
  emptyTitle: string
  emptyHint: string
  /** Botões extras ao lado da barra (ex.: "Quadro"). */
  extra?: ReactNode
  /** Cabeçalho acima da barra (aviso de smart-list quebrada etc.). */
  banner?: ReactNode
}

export function TaskCollection({
  scope, load, deps = [], showProject, addProjectId, addDue, completed, sortBy, groupBy, reorderable, emptyTitle, emptyHint, extra, banner,
}: Props) {
  const k = useKaguya()
  const { state, retry } = useLoad(load, [k.rev, k.space, scope, ...deps])
  const tasks = useMemo(() => (state.status === 'ok' ? state.data : []), [state])
  const schema = useMemo(
    () => makeTasksSchema({ scope: `kaguya:${scope}`, today: k.today, projectNames: showProject ? k.projectNames : undefined, sortBy, groupBy }),
    [scope, k.today, showProject, k.projectNames, sortBy, groupBy],
  )
  const c = useCollection(schema, tasks, { today: k.today })
  const [filters, setFilters] = useState(false)

  return (
    <Page wide className="kn-page">
      {banner}
      <QuickAddBar projectId={addProjectId} due={addDue} />
      <CollectionToolbar schema={schema} c={c} onOpenFilters={() => setFilters(true)} searchPlaceholder="Buscar nesta lista" extra={extra} />
      <CollectionMeta c={c} noun={NOUN} />
      {state.status === 'loading' && <LoadingState variant="row" count={5} />}
      {state.status === 'error' && <ErrorState onRetry={retry} />}
      {state.status === 'ok' && tasks.length === 0 && (completed?.length ?? 0) === 0 && (
        <EmptyState icon="task" title={emptyTitle} hint={emptyHint} action={<Button variant="primary" icon="add" onClick={() => k.newTask({ projectId: addProjectId, due: addDue })}>Nova tarefa</Button>} />
      )}
      {state.status === 'ok' && tasks.length > 0 && c.result.count === 0 && (
        <EmptyState icon="filter" title="Nenhuma tarefa com esses filtros" hint="Tire algum filtro ou limpe a busca para ver tudo de novo." action={<Button onClick={c.clearAll}>Limpar filtros</Button>} />
      )}
      {state.status === 'ok' && (c.result.count > 0 || (completed?.length ?? 0) > 0) && (
        <TaskList groups={c.result.groups} showProject={showProject} completed={completed} reorderable={reorderable && c.state.sortBy === 'manual' && c.state.groupBy === 'none' && !c.hasActive} />
      )}
      {filters && <FilterSheet schema={schema} c={c} items={tasks} onClose={() => setFilters(false)} noun={NOUN} />}
    </Page>
  )
}
