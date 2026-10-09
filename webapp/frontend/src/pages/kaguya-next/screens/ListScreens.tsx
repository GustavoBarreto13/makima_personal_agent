// As telas que são só "uma lista de tarefas de outra origem": uma lista, as visões fixas (Inbox, Todas, Amanhã, 7 dias),
// os built-ins GTD e as smart-lists salvas. Cada uma monta o `load` e delega ao TaskCollection.

import { useCallback, useEffect, useState } from 'react'
import { Button, Icon } from '../../../design'
import { kaguyaApi } from '../api'
import { useKaguya } from '../context'
import { DATE_KEYS, type DateKey } from '../lib/routes'
import type { DateViewKey, Task } from '../types'
import { TaskCollection } from './TaskCollection'

const DATE_COPY: Record<DateKey, { title: string; hint: string }> = {
  all: { title: 'Nada em aberto', hint: 'Todas as tarefas abertas de todas as listas aparecem aqui.' },
  today: { title: 'Nada vence hoje', hint: 'O que vence hoje e o que está atrasado aparece aqui.' },
  tomorrow: { title: 'Nada para amanhã', hint: 'As tarefas que vencem amanhã aparecem aqui.' },
  next7: { title: 'Semana livre', hint: 'As tarefas que vencem nos próximos 7 dias aparecem aqui.' },
  inbox: { title: 'Inbox zerada', hint: 'Capture qualquer coisa na barra acima; organize depois, com calma.' },
}

/** Uma lista. Mostra as concluídas no fim (recolhidas) e oferece abrir o quadro (Kanban). */
export function ListScreen({ id }: { id: number }) {
  const k = useKaguya()
  const project = k.projects.find((p) => p.id === id)
  const load = useCallback(() => kaguyaApi.listTasks(id, false), [id])
  const done = useDone(id)
  return (
    <TaskCollection
      scope={`list:${id}`}
      load={load}
      addProjectId={id}
      reorderable
      completed={done}
      emptyTitle={project?.is_inbox ? 'Inbox zerada' : 'Lista vazia'}
      emptyHint={project?.is_inbox ? 'Capture qualquer coisa na barra acima; organize depois, com calma.' : 'Adicione a primeira tarefa desta lista na barra acima.'}
      extra={(
        <>
          <Button icon="kanban" onClick={() => k.goto({ view: 'kanban', id })}>{project?.has_board ? 'Quadro' : 'Criar quadro'}</Button>
          {project?.is_inbox && <Button icon="inbox" onClick={k.manage.inbox}>Processar o Inbox</Button>}
          {project && <Button icon="edit" onClick={() => k.manage.project(project)}>Editar lista</Button>}
        </>
      )}
    />
  )
}

/** Lista do grupo: as tarefas abertas de todas as listas dele, agrupadas por lista. Cada tarefa abre/edita como em qualquer lista. */
export function GroupListScreen({ id }: { id: number }) {
  const k = useKaguya()
  const lists = k.projects.filter((p) => p.group_id === id)
  const ids = lists.map((p) => p.id).join(',')
  const load = useCallback(async () => (await Promise.all(lists.map((p) => kaguyaApi.listTasks(p.id, false)))).flat(), [ids]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <TaskCollection
      scope={`group:${id}`}
      load={load}
      deps={[ids]}
      showProject
      groupBy="project"
      addProjectId={lists[0]?.id}
      emptyTitle={lists.length ? 'Grupo sem tarefas' : 'Grupo vazio'}
      emptyHint={lists.length ? 'Adicione tarefas na barra acima; elas vão para a primeira lista do grupo (use @lista para escolher outra).' : 'Adicione listas a este grupo pela barra lateral para ver as tarefas aqui.'}
      extra={(
        <>
          <Button icon="kanban" onClick={() => k.goto({ view: 'group', id })}>Quadro</Button>
          {k.groups.find((g) => g.id === id) && <Button icon="edit" onClick={() => k.manage.group(k.groups.find((g) => g.id === id))}>Editar grupo</Button>}
        </>
      )}
    />
  )
}

/** Concluídas da lista (carrega sob demanda quando a pref "Mostrar concluídas" está ligada). */
function useDone(projectId: number): Task[] {
  const k = useKaguya()
  const [done, setDone] = useState<Task[]>([])
  useEffect(() => {
    if (!k.prefs.showCompleted) { setDone([]); return }
    let live = true
    kaguyaApi.listTasks(projectId, true).then((all) => { if (live) setDone(all.filter((t) => t.completed_at).slice(0, 50)) }).catch(() => { if (live) setDone([]) })
    return () => { live = false }
  }, [projectId, k.rev, k.prefs.showCompleted])
  return done
}

/** Visões fixas por data: Todas, Hoje, Amanhã, 7 dias e Inbox. */
export function DateScreen({ dateKey }: { dateKey: DateKey }) {
  const k = useKaguya()
  const key = (DATE_KEYS as readonly string[]).includes(dateKey) ? dateKey : 'all'
  const load = useCallback(() => kaguyaApi.viewTasks(key as DateViewKey, k.space), [key, k.space])
  const copy = DATE_COPY[key]
  return (
    <TaskCollection
      scope={`date:${key}`}
      load={load}
      deps={[k.space]}
      showProject={key !== 'inbox'}
      addProjectId={key === 'inbox' ? k.inboxId : undefined}
      addDue={key === 'today' ? k.today : undefined}
      sortBy={key === 'all' ? 'due' : 'manual'}
      extra={key === 'inbox' ? <Button icon="inbox" onClick={k.manage.inbox}>Processar o Inbox</Button> : undefined}
      emptyTitle={copy.title}
      emptyHint={copy.hint}
    />
  )
}

/** Built-ins GTD (Próximas ações, Aguardando, Algum dia, Rápidas, Alta energia). */
export function GtdScreen({ gtdKey }: { gtdKey: string }) {
  const k = useKaguya()
  const load = useCallback(() => kaguyaApi.builtinTasks(gtdKey, k.space), [gtdKey, k.space])
  const waiting = gtdKey === 'waiting'
  return (
    <TaskCollection
      scope={`gtd:${gtdKey}`}
      load={load}
      deps={[k.space]}
      showProject
      sortBy={waiting ? 'due' : 'manual'}
      emptyTitle="Nada por aqui"
      emptyHint={waiting ? 'Marque uma tarefa como “Aguardando” no painel e ela aparece aqui, com o dia de cobrar.' : 'As tarefas classificadas dessa forma aparecem aqui.'}
    />
  )
}

/** Smart-list salva (filtro). Avisa quando a regra aponta para algo que não existe mais. */
export function FilterScreen({ id }: { id: number }) {
  const k = useKaguya()
  const filter = k.filters.find((f) => f.id === id)
  const load = useCallback(() => kaguyaApi.filterTasks(id, k.space).then((r) => r.tasks), [id, k.space])
  return (
    <TaskCollection
      scope={`filter:${id}`}
      load={load}
      deps={[k.space]}
      showProject
      extra={filter ? <Button icon="edit" onClick={() => k.manage.filter(filter)}>Editar smart-list</Button> : undefined}
      emptyTitle={filter ? `“${filter.name}” está vazia` : 'Smart-list não encontrada'}
      emptyHint="Nenhuma tarefa aberta atende às regras desta smart-list agora."
      banner={!filter ? <p className="ds-hint"><Icon name="warning" size={14} /> Esta smart-list não existe mais.</p> : undefined}
    />
  )
}
