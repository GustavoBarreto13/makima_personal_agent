// AddTaskModal — entrada leve (só título) para criar uma tarefa direto numa coluna
// do Kanban (spec 024). Substitui o window.prompt do "+ Adicionar tarefa", mantendo
// o card na COLUNA clicada (createTask com column_id explícito). Para edição rica
// (notas, prioridade, recorrência, subtarefas) o TaskModal completo segue nas outras telas.

import { useState } from 'react'
import type { Column } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'

interface AddTaskModalProps {
  column: Column           // coluna onde a tarefa será criada
  projectId: number        // lista dona do board
  onClose: () => void
  onCreated: () => void    // pai re-busca o board + atualiza a sidebar
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function AddTaskModal({ column, projectId, onClose, onCreated, toast }: AddTaskModalProps) {
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!title.trim()) { toast('Dê um título à tarefa.', 'err'); return }
    setSaving(true)
    try {
      const r = await kaguyaApi.createTask({
        title: title.trim(),
        project_id: projectId,
        column_id: column.id,
      })
      if (r.status === 'error') { toast(r.message ?? 'Falha ao criar tarefa.', 'err'); return }
      toast('Tarefa criada.')
      onCreated(); onClose()
    } catch {
      toast('Falha ao criar tarefa.', 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="kg-scrim" onClick={onClose}>
      <div className="kg-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="kg-modal-head">
          <h3>Nova tarefa em "{column.name}"</h3>
          <button className="kg-icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>

        <div className="kg-modal-body">
          <div className="kg-field">
            <span className="kg-field-label">Título</span>
            <input
              className="kg-input"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save() }}
              placeholder="Ex.: Revisar o relatório"
            />
          </div>
        </div>

        <div className="kg-modal-foot">
          <button className="kg-btn kg-btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="kg-btn kg-btn-primary" onClick={save} disabled={saving}>{saving ? 'Criando…' : 'Adicionar'}</button>
        </div>
      </div>
    </div>
  )
}
