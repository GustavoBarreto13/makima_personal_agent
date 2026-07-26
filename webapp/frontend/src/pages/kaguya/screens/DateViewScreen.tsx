// DateViewScreen — abre uma das views fixas de mercado (Todas/Hoje/Amanhã/Próximos 7
// Dias — spec 034). Mesmo padrão de FilterScreen (lista plana, sem orphans), resolvendo
// a chave a partir do sentinel negativo em `viewId` (DATE_VIEW_IDS).

import { useEffect, useState, useCallback } from 'react'
import type { Task, DateViewKey } from '../types'
import { DATE_VIEW_IDS, DATE_VIEWS } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { TaskRow } from '../components/TaskRow'
import { Icon } from '../ui/Icons'

interface DateViewScreenProps {
  viewId: number          // sentinel de DATE_VIEW_IDS
  reloadKey: number
  onOpenTask: (task: Task) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// Resolve o sentinel numérico de volta para a chave/nome da view (o inverso de DATE_VIEW_IDS).
function resolveKey(viewId: number): DateViewKey | null {
  const entry = (Object.entries(DATE_VIEW_IDS) as [Exclude<DateViewKey, 'inbox'>, number][])
    .find(([, id]) => id === viewId)
  return entry ? entry[0] : null
}

export function DateViewScreen({ viewId, reloadKey, onOpenTask, toast }: DateViewScreenProps) {
  const key = resolveKey(viewId)
  const meta = DATE_VIEWS.find((v) => v.key === key)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!key) return
    setLoading(true)
    try {
      setTasks(await kaguyaApi.viewTasks(key))
    } catch {
      toast('Falha ao abrir a view.', 'err')
    } finally {
      setLoading(false)
    }
  }, [key, toast])

  useEffect(() => { load() }, [load, reloadKey])

  const toggle = async (task: Task) => {
    try {
      if (task.completed_at) {
        await kaguyaApi.reopen(task.id)
      } else {
        const r = await kaguyaApi.complete(task.id)
        if (r.needs_cascade) {
          const ok = window.confirm(`Esta tarefa tem ${r.open_subtasks} subtarefa(s) aberta(s). Concluir todas?`)
          if (!ok) return
          await kaguyaApi.complete(task.id, true)
        }
      }
      await load()
    } catch { toast('Não foi possível atualizar a tarefa.', 'err') }
  }

  const rename = async (task: Task, title: string) => {
    try { await kaguyaApi.updateTask(task.id, { title }); await load() }
    catch { toast('Falha ao renomear.', 'err') }
  }

  return (
    <div className="kg-page">
      <h1 className="kg-page-title">
        <Icon name={(meta?.icon ?? 'calendar') as Parameters<typeof Icon>[0]['name']} size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} />
        {meta?.name ?? 'View'}
      </h1>
      <div className="kg-page-sub">{tasks.length} tarefa(s)</div>

      {loading ? (
        <div className="kg-empty">Carregando…</div>
      ) : tasks.length === 0 ? (
        <div className="kg-empty">
          <div className="kg-empty-title">Nenhuma tarefa</div>
          Nenhuma tarefa nesta view agora.
        </div>
      ) : (
        <div className="kg-list">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} showProject onToggle={toggle} onOpen={onOpenTask} onRename={rename} />
          ))}
        </div>
      )}
    </div>
  )
}
