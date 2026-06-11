// TaskModal — criar/editar uma tarefa (guia §9.2). Campos: título, notas, lista,
// prioridade, tipo (tarefa/evento/aniversário), data/hora e subtarefas ricas
// (cada uma com prioridade + descrição próprias).

import { useState } from 'react'
import type { Task, Project, TaskType } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'

interface TaskModalProps {
  mode: 'create' | 'edit'
  task?: Task                 // presente em 'edit'
  projects: Project[]
  defaultProjectId?: number | null
  onClose: () => void
  onSaved: () => void         // pai re-busca os dados
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

const PRIORITIES = [
  { v: 0, label: 'Nenhuma', cls: '' }, { v: 1, label: 'Baixa', cls: 'p1' },
  { v: 2, label: 'Média', cls: 'p2' }, { v: 3, label: 'Alta', cls: 'p3' },
]
const TYPES: { v: TaskType; label: string }[] = [
  { v: 'task', label: 'Tarefa' }, { v: 'event', label: 'Evento' }, { v: 'birthday', label: 'Aniversário' },
]

export function TaskModal({ mode, task, projects, defaultProjectId, onClose, onSaved, toast }: TaskModalProps) {
  // Estado do formulário, inicializado da tarefa (edição) ou dos defaults (criação).
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [projectId, setProjectId] = useState<number | null>(task?.project_id ?? defaultProjectId ?? null)
  const [priority, setPriority] = useState(task?.priority ?? 0)
  const [type, setType] = useState<TaskType>(task?.type ?? 'task')
  const [dueDate, setDueDate] = useState(task?.due_date ?? '')
  const [dueTime, setDueTime] = useState(task?.due_time ?? '')
  // Subtarefas (só editáveis quando a tarefa-pai já existe).
  const [subtasks, setSubtasks] = useState<Task[]>(task?.subtasks ?? [])
  const [newSub, setNewSub] = useState('')
  const [saving, setSaving] = useState(false)

  // Salva a tarefa principal (cria ou edita).
  const save = async () => {
    if (!title.trim()) { toast('O título não pode ser vazio.', 'err'); return }
    setSaving(true)
    try {
      const body = {
        title: title.trim(),
        description: description || null,
        priority,
        type,
        due_date: dueDate || null,
        due_time: dueTime || null,
      }
      if (mode === 'create') {
        await kaguyaApi.createTask({ ...body, project_id: projectId ?? undefined })
        toast('Tarefa criada.')
      } else if (task) {
        await kaguyaApi.updateTask(task.id, { ...body, project_id: projectId ?? undefined })
        toast('Tarefa atualizada.')
      }
      onSaved()
      onClose()
    } catch {
      toast('Não foi possível salvar.', 'err')
    } finally {
      setSaving(false)
    }
  }

  // Adiciona uma subtarefa (exige a tarefa-pai já existir).
  const addSub = async () => {
    if (!task || !newSub.trim()) return
    try {
      const r = await kaguyaApi.createTask({ title: newSub.trim(), parent_id: task.id })
      setSubtasks([...subtasks, { id: r.id!, title: newSub.trim(), priority: 0, description: null, type: 'task', project_id: task.project_id, column_id: null, parent_id: task.id, due_date: null, due_time: null, position: 0, completed_at: null, created_at: '' }])
      setNewSub('')
    } catch { toast('Falha ao adicionar subtarefa.', 'err') }
  }

  // Atualiza prioridade/descrição de uma subtarefa existente.
  const patchSub = async (id: number, patch: Partial<Task>) => {
    setSubtasks(subtasks.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    try { await kaguyaApi.updateTask(id, patch as never) } catch { toast('Falha ao salvar subtarefa.', 'err') }
  }

  const removeSub = async (id: number) => {
    setSubtasks(subtasks.filter((s) => s.id !== id))
    try { await kaguyaApi.remove(id) } catch { toast('Falha ao excluir subtarefa.', 'err') }
  }

  return (
    <div className="kg-scrim" onClick={onClose}>
      <div className="kg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kg-modal-head">
          <h3>{mode === 'create' ? 'Nova tarefa' : 'Editar tarefa'}</h3>
          <button className="kg-icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>

        <div className="kg-modal-body">
          <div className="kg-field">
            <span className="kg-field-label">Título</span>
            <input className="kg-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que precisa ser feito?" />
          </div>

          <div className="kg-field">
            <span className="kg-field-label">Lista</span>
            <select className="kg-select" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Inbox</option>
              {projects.filter((p) => !p.is_inbox).map((p) => (
                <option key={p.id} value={p.id}>{p.icon ? `${p.icon} ` : ''}{p.name}</option>
              ))}
            </select>
          </div>

          <div className="kg-field">
            <span className="kg-field-label">Prioridade</span>
            <div className="kg-segment">
              {PRIORITIES.map((p) => (
                <button key={p.v} className={`kg-seg-opt ${p.cls}${priority === p.v ? ' active' : ''}`} onClick={() => setPriority(p.v)}>{p.label}</button>
              ))}
            </div>
          </div>

          <div className="kg-field">
            <span className="kg-field-label">Tipo</span>
            <div className="kg-segment">
              {TYPES.map((t) => (
                <button key={t.v} className={`kg-seg-opt${type === t.v ? ' active' : ''}`} onClick={() => setType(t.v)}>{t.label}</button>
              ))}
            </div>
          </div>

          <div className="kg-field-row">
            <div className="kg-field">
              <span className="kg-field-label">Vencimento</span>
              <input className="kg-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="kg-field">
              <span className="kg-field-label">Hora (opcional)</span>
              <input className="kg-input" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} disabled={!dueDate} />
            </div>
          </div>

          <div className="kg-field">
            <span className="kg-field-label">Notas</span>
            <textarea className="kg-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes, links, contexto…" />
          </div>

          {/* Subtarefas ricas — só quando a tarefa-pai já existe */}
          {mode === 'edit' && task && (
            <div className="kg-field">
              <span className="kg-field-label">Subtarefas</span>
              {subtasks.map((s) => (
                <div key={s.id} className="kg-subedit">
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input className="kg-input" value={s.title} onChange={(e) => setSubtasks(subtasks.map((x) => x.id === s.id ? { ...x, title: e.target.value } : x))} onBlur={(e) => patchSub(s.id, { title: e.target.value })} />
                    <div className="kg-segment">
                      {PRIORITIES.map((p) => (
                        <button key={p.v} className={`kg-seg-opt ${p.cls}${s.priority === p.v ? ' active' : ''}`} onClick={() => patchSub(s.id, { priority: p.v })}>{p.label}</button>
                      ))}
                    </div>
                    <input className="kg-input" placeholder="Descrição da subtarefa…" defaultValue={s.description ?? ''} onBlur={(e) => patchSub(s.id, { description: e.target.value || null })} />
                  </div>
                  <button className="kg-icon-btn" onClick={() => removeSub(s.id)} aria-label="Excluir subtarefa"><Icon name="trash" size={14} /></button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input className="kg-input" placeholder="Adicionar subtarefa…" value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addSub() }} />
                <button className="kg-btn" onClick={addSub}><Icon name="plus" size={14} /></button>
              </div>
            </div>
          )}
        </div>

        <div className="kg-modal-foot">
          <button className="kg-btn kg-btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="kg-btn kg-btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
