// ContextsModal — CRUD de contextos de execução (spec 034 / US4). Criar, renomear,
// reordenar (subir/descer) e excluir. Excluir um contexto só desassocia as tarefas
// que o usavam (nunca as apaga) — reforçado no rótulo do botão de exclusão.

import { useEffect, useState } from 'react'
import type { TaskContext } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'

interface ContextsModalProps {
  onClose: () => void
  onChanged: () => void   // pai re-busca a lista de contextos (ex.: para o TaskModal)
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function ContextsModal({ onClose, onChanged, toast }: ContextsModalProps) {
  const [contexts, setContexts] = useState<TaskContext[]>([])
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try { setContexts(await kaguyaApi.listContexts()) }
    catch { toast('Falha ao carregar contextos.', 'err') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!newName.trim()) return
    const r = await kaguyaApi.createContext({ name: newName.trim() })
    if (r.status === 'error') { toast(r.message ?? 'Falha ao criar contexto.', 'err'); return }
    setNewName('')
    await load(); onChanged()
  }

  const rename = async () => {
    if (!editing || !editing.name.trim()) return
    const r = await kaguyaApi.updateContext(editing.id, { name: editing.name.trim() })
    if (r.status === 'error') { toast(r.message ?? 'Falha ao renomear.', 'err'); return }
    setEditing(null)
    await load(); onChanged()
  }

  const remove = async (c: TaskContext) => {
    if (!window.confirm(`Excluir "${c.name}"? As tarefas que o usam ficam sem contexto (não são apagadas).`)) return
    const r = await kaguyaApi.deleteContext(c.id)
    if (r.status === 'error') { toast(r.message ?? 'Falha ao excluir.', 'err'); return }
    await load(); onChanged()
  }

  // Reordena por troca de posição com o vizinho (sobe/desce) — reusa o mesmo padrão
  // esparso ×1000 do backend, mandando a posição do vizinho +1/-1.
  const move = async (index: number, dir: -1 | 1) => {
    const target = contexts[index + dir]
    if (!target) return
    const current = contexts[index]
    await kaguyaApi.updateContext(current.id, { position: target.position + dir })
    await load(); onChanged()
  }

  return (
    <div className="kg-scrim" onClick={onClose}>
      <div className="kg-modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="kg-modal-head">
          <h3>Contextos de execução</h3>
          <button className="kg-icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>

        <div className="kg-modal-body">
          <div className="kg-field-row" style={{ marginBottom: 12 }}>
            <input
              className="kg-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') create() }}
              placeholder="Ex.: @casa"
            />
            <button className="kg-btn kg-btn-primary" onClick={create}>Adicionar</button>
          </div>

          {loading && <p>Carregando…</p>}
          {!loading && contexts.length === 0 && <p className="kg-muted">Nenhum contexto ainda.</p>}

          {contexts.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
              <button className="kg-icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir"><Icon name="chevron" size={13} style={{ transform: 'rotate(-90deg)' }} /></button>
              <button className="kg-icon-btn" disabled={i === contexts.length - 1} onClick={() => move(i, 1)} aria-label="Descer"><Icon name="chevron" size={13} style={{ transform: 'rotate(90deg)' }} /></button>

              {editing?.id === c.id ? (
                <input
                  className="kg-input kg-input-sm"
                  style={{ flex: 1 }}
                  autoFocus
                  value={editing.name}
                  onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setEditing(null) }}
                  onBlur={rename}
                />
              ) : (
                <span style={{ flex: 1 }} onClick={() => setEditing({ id: c.id, name: c.name })}>{c.name}</span>
              )}

              <button className="kg-icon-btn" onClick={() => setEditing({ id: c.id, name: c.name })} aria-label="Renomear"><Icon name="edit" size={13} /></button>
              <button className="kg-icon-btn" onClick={() => remove(c)} aria-label="Excluir"><Icon name="trash" size={13} /></button>
            </div>
          ))}
        </div>

        <div className="kg-modal-foot">
          <button className="kg-btn kg-btn-primary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
