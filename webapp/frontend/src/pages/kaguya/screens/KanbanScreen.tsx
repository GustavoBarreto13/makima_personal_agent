// KanbanScreen — board de uma "Lista" (guia §4.2). Colunas configuráveis, cards
// arrastáveis entre colunas; soltar na coluna "concluído" completa a tarefa
// (mesma ação do checkbox na lista). Lista e Kanban nunca divergem (mesma fonte).

import { useEffect, useState, useCallback } from 'react'
import type { Task, Column } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { TaskCard } from '../components/TaskCard'
import { Icon } from '../ui/Icons'

interface KanbanScreenProps {
  projectId: number
  projectName: string
  reloadKey: number
  onOpenTask: (task: Task) => void
  onChanged: () => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function KanbanScreen({ projectId, projectName, reloadKey, onOpenTask, onChanged, toast }: KanbanScreenProps) {
  const [columns, setColumns] = useState<Column[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [dragId, setDragId] = useState<number | null>(null)
  const [hoverCol, setHoverCol] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cols, ts] = await Promise.all([kaguyaApi.listColumns(projectId), kaguyaApi.listTasks(projectId, false)])
      setColumns(cols.sort((a, b) => a.position - b.position))
      setTasks(ts)
    } catch { toast('Falha ao carregar o board.', 'err') }
    finally { setLoading(false) }
  }, [projectId, toast])

  useEffect(() => { load() }, [load, reloadKey])

  // Cria a primeira coluna (ativa o Kanban) ou mais uma.
  const addColumn = async () => {
    const name = window.prompt('Nome da coluna:')
    if (!name?.trim()) return
    try { await kaguyaApi.createColumn({ project_id: projectId, name: name.trim() }); await load() }
    catch { toast('Falha ao criar coluna.', 'err') }
  }

  // Cria uma tarefa diretamente numa coluna (captura rápida por prompt, como o addColumn).
  // O backend posiciona o card já na coluna escolhida — por isso ele aparece no board.
  const addTask = async (col: Column) => {
    const title = window.prompt(`Nova tarefa em "${col.name}":`)
    if (!title?.trim()) return
    try {
      const r = await kaguyaApi.createTask({ title: title.trim(), project_id: projectId, column_id: col.id })
      if (r.status === 'error') { toast(r.message ?? 'Falha ao criar tarefa.', 'err'); return }
      await load(); onChanged()
    } catch { toast('Falha ao criar tarefa.', 'err') }
  }

  // Marca/desmarca a coluna como "concluído" (única por lista).
  const toggleDone = async (col: Column) => {
    try {
      const r = await kaguyaApi.updateColumn(col.id, { is_done_column: !col.is_done_column })
      if (r.status === 'error') { toast(r.message ?? 'Já há uma coluna concluído.', 'err'); return }
      await load()
    } catch { toast('Falha ao atualizar coluna.', 'err') }
  }

  // Solta um card numa coluna: done → completa; senão → muda a coluna.
  const drop = async (col: Column) => {
    setHoverCol(null)
    if (dragId == null) return
    try {
      if (col.is_done_column) {
        const r = await kaguyaApi.complete(dragId)
        if (r.needs_cascade) {
          if (!window.confirm(`Concluir ${r.open_subtasks} subtarefa(s) também?`)) { setDragId(null); return }
          await kaguyaApi.complete(dragId, true)
        }
      } else {
        await kaguyaApi.updateTask(dragId, { column_id: col.id })
      }
      await load(); onChanged()
    } catch { toast('Falha ao mover o card.', 'err') }
    finally { setDragId(null) }
  }

  if (loading) return <div className="kg-page"><div className="kg-empty">Carregando…</div></div>

  // Sem colunas → convite para criar a primeira (ativa o Kanban).
  if (columns.length === 0) {
    return (
      <div className="kg-page">
        <h1 className="kg-page-title"><Icon name="board" size={22} /> {projectName}</h1>
        <div className="kg-empty">
          <div className="kg-empty-title">Sem board ainda</div>
          Crie a primeira coluna para ativar o Kanban desta lista.
          <div style={{ marginTop: 14 }}><button className="kg-btn kg-btn-primary" onClick={addColumn}>+ Criar coluna</button></div>
        </div>
      </div>
    )
  }

  return (
    <div className="kg-page" style={{ maxWidth: 1320 }}>
      <h1 className="kg-page-title"><Icon name="board" size={22} /> {projectName}</h1>
      <div className="kg-page-sub">Arraste os cards entre as colunas</div>

      <div className="kg-board">
        {columns.map((col, idx) => {
          // Cards desta coluna. A 1ª coluna também acolhe tarefas órfãs (column_id null) —
          // criadas antes deste fix ou ao apagar a coluna onde estavam — para nenhuma sumir.
          const isFirst = idx === 0
          const cards = tasks.filter((t) => t.column_id === col.id || (isFirst && t.column_id == null))
          return (
            <div
              key={col.id}
              className={`kg-col${hoverCol === col.id ? ' drop-target' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setHoverCol(col.id) }}
              onDragLeave={() => setHoverCol((h) => (h === col.id ? null : h))}
              onDrop={() => drop(col)}
            >
              <div className="kg-col-head">
                {col.is_done_column && <Icon name="check" size={14} style={{ color: 'var(--done)' }} />}
                {col.name}
                <span className="kg-nav-count">{cards.length}</span>
                <button className="kg-icon-btn" style={{ border: 'none', padding: 3 }} title={col.is_done_column ? 'É a coluna concluído' : 'Marcar como concluído'} onClick={() => toggleDone(col)}>
                  <Icon name="check" size={13} style={{ opacity: col.is_done_column ? 1 : 0.35 }} />
                </button>
              </div>
              <div className="kg-col-body">
                {cards.map((t) => <TaskCard key={t.id} task={t} onDragStart={setDragId} onOpen={onOpenTask} />)}
                {/* adicionar tarefa direto nesta coluna */}
                <button className="kg-col-add" onClick={() => addTask(col)}>
                  <Icon name="plus" size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />tarefa
                </button>
              </div>
            </div>
          )
        })}
        {/* coluna fantasma: adicionar nova coluna */}
        <button className="kg-btn" style={{ height: 44, flexShrink: 0 }} onClick={addColumn}>
          <Icon name="plus" size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Coluna
        </button>
      </div>
    </div>
  )
}
