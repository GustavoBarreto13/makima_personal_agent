// EisenhowerScreen — Matriz 2×2 derivada de prioridade × urgência (fatia 017).
// Não cria campo novo: classifica as tarefas abertas existentes em quadrantes
// via isUrgent/isImportant em lib/eisenhower.ts. Drag entre quadrantes atualiza
// priority e/ou due_date via PATCH /api/tasks/{id} (reusa update_task).

import { useEffect, useState, useCallback } from 'react'
import type { Task, Project } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { QUADS, getQuadrant, buildDragPatch, type QuadId } from '../lib/eisenhower'

// Ícone de prioridade (consistente com TaskRow/PlanCard).
const PRIO_ICON = ['', '🔵', '🟡', '🔴']

// Formata due_date como "dd/mm" para o chip de data nos cards.
function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

interface EisenhowerScreenProps {
  projects: Project[]
  reloadKey: number
  onChanged: () => void
  onOpenTask: (task: Task) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function EisenhowerScreen({ projects, reloadKey, onChanged, onOpenTask, toast }: EisenhowerScreenProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  // Id da tarefa sendo arrastada (para highlight visual).
  const [dragging, setDragging] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await kaguyaApi.eisenhower()
      setTasks(r)
    } catch {
      toast('Falha ao carregar a Eisenhower.', 'err')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load, reloadKey])

  // Agrupa as tarefas por quadrante (classificação derivada).
  const byQuad = (qid: QuadId) =>
    tasks.filter(t => getQuadrant(t) === qid)

  // Drag handlers — o id da tarefa viaja no dataTransfer.
  const onDragStart = (e: React.DragEvent, task: Task) => {
    e.dataTransfer.setData('text/plain', String(task.id))
    setDragging(task.id)
  }
  const onDragEnd = () => setDragging(null)
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.currentTarget.classList.add('eis-drop-ok') }
  const onDragLeave = (e: React.DragEvent) => { e.currentTarget.classList.remove('eis-drop-ok') }

  const onDrop = useCallback(async (e: React.DragEvent, targetQid: QuadId) => {
    e.preventDefault()
    e.currentTarget.classList.remove('eis-drop-ok')
    const taskId = parseInt(e.dataTransfer.getData('text/plain'), 10)
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    const patch = buildDragPatch(task, targetQid)
    if (!patch) {
      toast('Já estava aqui.', 'ok')
      return
    }

    const target = QUADS.find(q => q.id === targetQid)!
    try {
      await kaguyaApi.updateTask(taskId, patch)
      toast(`Movida para "${target.label}".`)
      load()
      onChanged()
    } catch {
      toast('Não foi possível mover a tarefa.', 'err')
    }
  }, [tasks, load, onChanged, toast])

  // Nome da lista a partir do project_id (usa a prop projects do shell).
  const projectName = (task: Task) =>
    projects.find(p => p.id === task.project_id)?.name ?? ''

  if (loading) return <div className="kg-page"><div className="kg-empty">Carregando…</div></div>

  return (
    <div className="kg-page kg-eis-page">
      {/* Cabeçalho */}
      <div className="kg-eis-header">
        <div className="kg-eis-title">Matriz de Eisenhower</div>
        <div className="kg-eis-sub">view derivada de prioridade × urgência · arraste para ajustar</div>
      </div>

      {/* Grade 2×2 */}
      <div className="eis-grid">
        {QUADS.map(quad => {
          const items = byQuad(quad.id)
          return (
            <div
              key={quad.id}
              className="eis-quad"
              data-qid={quad.id}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={e => onDrop(e, quad.id)}
            >
              {/* Cabeçalho do quadrante */}
              <div className="eq-head">
                <span className="eq-mark" style={{ background: quad.color }} />
                <span className="eq-label">{quad.label}</span>
                <span className="eq-count">{items.length}</span>
              </div>
              <div className="eq-sub">{quad.sub}</div>

              {/* Cards */}
              <div className="eq-body">
                {items.length === 0 ? (
                  <div className="eq-empty">vazio</div>
                ) : (
                  items.map(task => (
                    <div
                      key={task.id}
                      className={`kcard${dragging === task.id ? ' kcard--dragging' : ''}`}
                      draggable
                      onDragStart={e => onDragStart(e, task)}
                      onDragEnd={onDragEnd}
                      onClick={() => onOpenTask(task)}
                      // Barra de prioridade via data attr (mesmo padrão do PlanCard)
                      data-prio={task.priority}
                    >
                      <div className="kcard-title">{task.title}</div>
                      <div className="kcard-meta">
                        {task.priority > 0 && (
                          <span className="kcard-prio">{PRIO_ICON[task.priority]}</span>
                        )}
                        {task.due_date && (
                          <span className="kcard-date">📅 {fmtDate(task.due_date)}</span>
                        )}
                        {projectName(task) && (
                          <span className="kcard-proj">{projectName(task)}</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
