// FilterScreen — abre uma smart-list (filtro salvo) ou a built-in "Hoje + Vencidas"
// (fatia 013 / P2). Mostra as tarefas que casam a regra (cruzando listas, por isso
// `showProject`), sinaliza referências órfãs (tag/lista excluída) sem quebrar, e deixa
// concluir/abrir tarefas. Editar/excluir o filtro fica no botão do cabeçalho (só nos salvos).

import { useEffect, useState, useCallback } from 'react'
import type { Task, FilterCondition } from '../types'
import { BUILTIN_TODAY_OVERDUE, GTD_BUILTINS } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { TaskRow } from '../components/TaskRow'
import { Icon } from '../ui/Icons'

interface FilterScreenProps {
  filterId: number               // id do filtro salvo OU BUILTIN_TODAY_OVERDUE
  filterName: string             // título exibido
  reloadKey: number              // muda → força re-fetch
  onOpenTask: (task: Task) => void
  onEditFilter?: () => void      // só nos filtros salvos (abre o FilterModal em edição)
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// Descreve uma condição órfã em português curto (para o aviso ao usuário).
function describeOrphan(o: FilterCondition): string {
  if (o.field === 'tag') return `tag "${String(o.value)}"`
  if (o.field === 'project_id') return 'uma lista excluída'
  return o.field
}

export function FilterScreen({ filterId, filterName, reloadKey, onOpenTask, onEditFilter, toast }: FilterScreenProps) {
  // Ids negativos são built-ins fixos do código (Hoje + Vencidas e os GTD); positivos são
  // smart-lists salvas (editáveis). Cada built-in GTD resolve a chave da sua rota.
  const isBuiltin = filterId < 0
  const gtd = GTD_BUILTINS.find((b) => b.id === filterId)
  const [tasks, setTasks] = useState<Task[]>([])
  const [orphans, setOrphans] = useState<FilterCondition[]>([])
  const [loading, setLoading] = useState(true)

  // Carrega as tarefas: built-ins têm endpoint próprio (lista plana); salvo devolve {tasks, orphans}.
  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (filterId === BUILTIN_TODAY_OVERDUE) {
        setTasks(await kaguyaApi.todayOverdue())
        setOrphans([])
      } else if (gtd) {
        setTasks(await kaguyaApi.builtinTasks(gtd.key))
        setOrphans([])
      } else {
        const r = await kaguyaApi.filterTasks(filterId)
        setTasks(r.tasks)
        setOrphans(r.orphans ?? [])
      }
    } catch {
      toast('Falha ao abrir a smart-list.', 'err')
    } finally {
      setLoading(false)
    }
  }, [filterId, gtd, toast])

  useEffect(() => { load() }, [load, reloadKey])

  // Conclui/reabre (mesma semântica de cascata da ListScreen).
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
        <Icon name="filter" size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} />
        {filterName}
        {/* Editar/excluir só faz sentido num filtro salvo (a built-in é fixa do código). */}
        {!isBuiltin && onEditFilter && (
          <button className="kg-icon-btn" style={{ marginLeft: 8 }} onClick={onEditFilter} aria-label="Editar smart-list">
            <Icon name="settings" size={15} />
          </button>
        )}
      </h1>
      <div className="kg-page-sub">{tasks.length} tarefa(s)</div>

      {/* Aviso de referência órfã: a smart-list não quebra, só não casa aquela condição. */}
      {orphans.length > 0 && (
        <div className="kg-orphan-note">
          <Icon name="flag" size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Esta smart-list referencia {orphans.map(describeOrphan).join(', ')} que não existe(m) mais — essa condição não casa nada.
        </div>
      )}

      {loading ? (
        <div className="kg-empty">Carregando…</div>
      ) : tasks.length === 0 ? (
        <div className="kg-empty">
          <div className="kg-empty-title">Nenhuma tarefa</div>
          Nenhuma tarefa casa com esta smart-list agora.
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
