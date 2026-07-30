// AddTaskModal — entrada leve (só título) para criar uma tarefa direto numa coluna
// do Kanban (spec 024). Substitui o window.prompt do "+ Adicionar tarefa", mantendo
// o card na COLUNA clicada (createTask com column_id explícito). Para edição rica
// (notas, prioridade, recorrência, subtarefas) o TaskModal completo segue nas outras telas.
//
// Genérico o bastante para servir os DOIS boards de Kanban:
//   • Board de lista (KanbanScreen): 1 único destino (a própria lista) — sem seletor.
//   • Board de grupo (GroupBoardScreen): N destinos (uma coluna unificada agrega várias
//     listas), então o modal mostra um <select> para escolher em qual lista a tarefa nasce.

import { useState } from 'react'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'

// Um destino possível para a nova tarefa: a lista (project_id) e a coluna DAQUELA
// lista (column_id) — no board de grupo cada lista tem seu próprio column_id mesmo
// quando a coluna "aparenta" ser a mesma (unificada só pelo nome).
export interface AddTaskTarget {
  project_id: number   // lista onde a tarefa nasce
  column_id: number    // coluna daquela lista
  listName: string      // rótulo exibido no seletor
}

interface AddTaskModalProps {
  columnName: string              // só para o título "Nova tarefa em '…'"
  targets: AddTaskTarget[]        // 1 destino (board de lista) ou N (board de grupo)
  defaultProjectId?: number       // pré-seleção do seletor (ex.: última lista usada)
  onClose: () => void
  onCreated: (projectId: number) => void   // pai re-busca o board + atualiza a sidebar
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function AddTaskModal({ columnName, targets, defaultProjectId, onClose, onCreated, toast }: AddTaskModalProps) {
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  // Lista selecionada no seletor (só relevante quando targets.length > 1).
  // Prioriza defaultProjectId se ele for um destino válido; senão cai no primeiro.
  const initialProjectId = targets.some(t => t.project_id === defaultProjectId)
    ? (defaultProjectId as number)
    : targets[0]?.project_id
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(initialProjectId)

  const save = async () => {
    if (!title.trim()) { toast('Dê um título à tarefa.', 'err'); return }
    const target = targets.find(t => t.project_id === selectedProjectId)
    if (!target) { toast('Selecione uma lista.', 'err'); return }
    setSaving(true)
    try {
      const r = await kaguyaApi.createTask({
        title: title.trim(),
        project_id: target.project_id,
        column_id: target.column_id,
      })
      if (r.status === 'error') { toast(r.message ?? 'Falha ao criar tarefa.', 'err'); return }
      toast('Tarefa criada.')
      onCreated(target.project_id); onClose()
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
          <h3>Nova tarefa em "{columnName}"</h3>
          <button className="kg-icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>

        <div className="kg-modal-body">
          {/* Seletor de lista: só aparece quando a coluna existe em mais de uma lista
              (board de grupo). No board de lista há um único destino → sem seletor. */}
          {targets.length > 1 && (
            <div className="kg-field">
              <span className="kg-field-label">Lista</span>
              <select
                className="kg-select"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(Number(e.target.value))}
              >
                {targets.map(t => (
                  <option key={t.project_id} value={t.project_id}>{t.listName}</option>
                ))}
              </select>
            </div>
          )}
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
