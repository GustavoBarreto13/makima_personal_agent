// ColumnModal — criar / renomear / excluir uma coluna do Kanban (spec 024).
// Espelha o GroupModal (nome + exclusão com confirmação) e acrescenta o toggle
// "coluna concluído" (antes era um clique no header). Substitui o window.prompt.
// Excluir uma coluna NÃO apaga as tarefas: elas voltam para a primeira coluna do
// board (FK tasks.column_id ON DELETE SET NULL + acolhimento de órfãs no KanbanScreen).

import { useState } from 'react'
import type { Column } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'

interface ColumnModalProps {
  mode: 'create' | 'edit'
  column?: Column          // presente em 'edit'
  projectId: number        // lista dona da coluna (necessário ao criar)
  onClose: () => void
  onSaved: () => void      // pai re-busca colunas + tarefas
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function ColumnModal({ mode, column, projectId, onClose, onSaved, toast }: ColumnModalProps) {
  const [name, setName] = useState(column?.name ?? '')
  const [isDone, setIsDone] = useState(column?.is_done_column ?? false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) { toast('O nome não pode ser vazio.', 'err'); return }
    setSaving(true)
    try {
      const r = mode === 'create'
        ? await kaguyaApi.createColumn({ project_id: projectId, name: name.trim(), is_done_column: isDone })
        : await kaguyaApi.updateColumn(column!.id, { name: name.trim(), is_done_column: isDone })
      // Regra do backend: no máximo uma coluna "concluído" por lista (uq_task_columns_done).
      if (r.status === 'error') {
        toast(r.message ?? 'Não foi possível salvar a coluna.', 'err')
        return
      }
      toast(mode === 'create' ? 'Coluna criada.' : 'Coluna atualizada.')
      onSaved(); onClose()
    } catch {
      toast('Não foi possível salvar a coluna.', 'err')
    } finally {
      setSaving(false)
    }
  }

  const del = async () => {
    if (!column) return
    try {
      const r = await kaguyaApi.deleteColumn(column.id)
      if (r.status === 'error') { toast(r.message ?? 'Não foi possível excluir.', 'err'); return }
      toast('Coluna excluída.'); onSaved(); onClose()
    } catch {
      toast('Não foi possível excluir a coluna.', 'err')
    }
  }

  return (
    <div className="kg-scrim" onClick={onClose}>
      <div className="kg-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="kg-modal-head">
          <h3>{mode === 'create' ? 'Nova coluna' : 'Editar coluna'}</h3>
          <button className="kg-icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>

        <div className="kg-modal-body">
          <div className="kg-field">
            <span className="kg-field-label">Nome</span>
            <input
              className="kg-input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save() }}
              placeholder="Ex.: Backlog, Fazendo, Concluído…"
            />
          </div>

          {/* Toggle "coluna concluído": soltar um card aqui completa a tarefa */}
          <div className="kg-field">
            <span className="kg-field-label">Coluna concluído</span>
            <div className="kg-segment" style={{ width: 200 }}>
              <button className={`kg-seg-opt${!isDone ? ' active' : ''}`} onClick={() => setIsDone(false)}>Não</button>
              <button className={`kg-seg-opt${isDone ? ' active' : ''}`} onClick={() => setIsDone(true)}>Sim</button>
            </div>
            <span className="kg-field-label" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--ink-4)' }}>
              Soltar um card aqui marca a tarefa como concluída. No máximo uma por lista.
            </span>
          </div>

          {/* Exclusão (só em edição) — com passo de confirmação e aviso sobre as tarefas */}
          {mode === 'edit' && column && (
            <div className="kg-field" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
              {!confirmingDelete ? (
                <button className="kg-btn kg-btn-danger" onClick={() => setConfirmingDelete(true)}>
                  <Icon name="trash" size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Excluir coluna
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span className="kg-field-label" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    As tarefas desta coluna voltam para a primeira coluna do board (não são apagadas). Confirmar?
                  </span>
                  <button className="kg-btn kg-btn-danger" onClick={del}>Excluir a coluna</button>
                  <button className="kg-btn kg-btn-ghost" onClick={() => setConfirmingDelete(false)}>Cancelar</button>
                </div>
              )}
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
