// ProjectModal — criar/editar uma "Lista" (na UI: "Lista"; no modelo: project).
// Campos: nome, grupo, ícone (emoji), cor. Em edição, oferece excluir com a
// escolha mover-para-Inbox vs excluir tarefas (o Inbox não é editável aqui).

import { useState } from 'react'
import type { Project, Group } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'

interface ProjectModalProps {
  mode: 'create' | 'edit'
  project?: Project
  groups: Group[]
  onClose: () => void
  onSaved: () => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// Alguns emojis sugeridos para a lista (atalho; o usuário pode digitar outro).
const ICONS = ['📥', '🏠', '💼', '📚', '💰', '🎯', '🛒', '❤️', '🧠', '🎨', '🌱', '⭐']

export function ProjectModal({ mode, project, groups, onClose, onSaved, toast }: ProjectModalProps) {
  const [name, setName] = useState(project?.name ?? '')
  const [groupId, setGroupId] = useState<number | null>(project?.group_id ?? null)
  const [icon, setIcon] = useState(project?.icon ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) { toast('O nome não pode ser vazio.', 'err'); return }
    setSaving(true)
    try {
      const body = { name: name.trim(), group_id: groupId ?? undefined, icon: icon || undefined }
      if (mode === 'create') { await kaguyaApi.createProject(body); toast('Lista criada.') }
      else if (project) { await kaguyaApi.updateProject(project.id, body); toast('Lista atualizada.') }
      onSaved(); onClose()
    } catch { toast('Não foi possível salvar a lista.', 'err') }
    finally { setSaving(false) }
  }

  // Exclui a lista decidindo o destino das tarefas.
  const del = async (modeDelete: 'move_to_inbox' | 'delete_tasks') => {
    if (!project) return
    try {
      await kaguyaApi.deleteProject(project.id, modeDelete)
      toast('Lista excluída.'); onSaved(); onClose()
    } catch { toast('Não foi possível excluir a lista.', 'err') }
  }

  return (
    <div className="kg-scrim" onClick={onClose}>
      <div className="kg-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="kg-modal-head">
          <h3>{mode === 'create' ? 'Nova lista' : 'Editar lista'}</h3>
          <button className="kg-icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>

        <div className="kg-modal-body">
          <div className="kg-field">
            <span className="kg-field-label">Nome</span>
            <input className="kg-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Casa, Estudos…" />
          </div>

          <div className="kg-field">
            <span className="kg-field-label">Grupo</span>
            <select className="kg-select" value={groupId ?? ''} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Sem grupo</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>

          <div className="kg-field">
            <span className="kg-field-label">Ícone</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ICONS.map((e) => (
                <button key={e} className={`kg-btn${icon === e ? ' kg-btn-primary' : ''}`} style={{ padding: '6px 10px' }} onClick={() => setIcon(e)}>{e}</button>
              ))}
            </div>
          </div>

          {/* Exclusão (não disponível para o Inbox) */}
          {mode === 'edit' && project && !project.is_inbox && (
            <div className="kg-field" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
              {!confirmingDelete ? (
                <button className="kg-btn kg-btn-danger" onClick={() => setConfirmingDelete(true)}>
                  <Icon name="trash" size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Excluir lista
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span className="kg-field-label">O que fazer com as tarefas desta lista?</span>
                  <button className="kg-btn" onClick={() => del('move_to_inbox')}>Mover para o Inbox</button>
                  <button className="kg-btn kg-btn-danger" onClick={() => del('delete_tasks')}>Excluir as tarefas junto</button>
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
