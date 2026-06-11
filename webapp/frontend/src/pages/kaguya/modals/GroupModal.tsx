// GroupModal — criar/renomear/excluir um "grupo de listas" (a pasta da sidebar).
// Espelha o ProjectModal, mas bem mais enxuto: um grupo só tem nome. Excluir um
// grupo NÃO apaga as listas — elas voltam para "Sem grupo" (FK ON DELETE SET NULL
// no banco), por isso o aviso na confirmação de exclusão.

import { useState } from 'react'
import type { Group } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'

interface GroupModalProps {
  // 'create' = novo grupo; 'edit' = renomear/excluir um existente.
  mode: 'create' | 'edit'
  group?: Group
  onClose: () => void
  onSaved: () => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function GroupModal({ mode, group, onClose, onSaved, toast }: GroupModalProps) {
  // Nome do grupo (pré-preenchido em edição).
  const [name, setName] = useState(group?.name ?? '')
  // Controla o passo de confirmação da exclusão (evita apagar sem querer).
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // Trava o botão enquanto a requisição está em voo.
  const [saving, setSaving] = useState(false)

  // Cria (create) ou renomeia (edit) o grupo conforme o modo do modal.
  const save = async () => {
    if (!name.trim()) { toast('O nome não pode ser vazio.', 'err'); return }
    setSaving(true)
    try {
      if (mode === 'create') {
        await kaguyaApi.createGroup(name.trim())
        toast('Grupo criado.')
      } else if (group) {
        await kaguyaApi.updateGroup(group.id, { name: name.trim() })
        toast('Grupo atualizado.')
      }
      onSaved(); onClose()
    } catch {
      toast('Não foi possível salvar o grupo.', 'err')
    } finally {
      setSaving(false)
    }
  }

  // Exclui o grupo. As listas dentro dele apenas perdem o vínculo (voltam a "Sem grupo").
  const del = async () => {
    if (!group) return
    try {
      await kaguyaApi.deleteGroup(group.id)
      toast('Grupo excluído.'); onSaved(); onClose()
    } catch {
      toast('Não foi possível excluir o grupo.', 'err')
    }
  }

  return (
    // Scrim cobre a tela; clicar fora fecha. stopPropagation no modal evita fechar ao clicar dentro.
    <div className="kg-scrim" onClick={onClose}>
      <div className="kg-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="kg-modal-head">
          <h3>{mode === 'create' ? 'Novo grupo' : 'Editar grupo'}</h3>
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
              placeholder="Ex.: Pessoal, Trabalho…"
            />
          </div>

          {/* Exclusão (só em edição) — com passo de confirmação e aviso sobre as listas */}
          {mode === 'edit' && group && (
            <div className="kg-field" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
              {!confirmingDelete ? (
                <button className="kg-btn kg-btn-danger" onClick={() => setConfirmingDelete(true)}>
                  <Icon name="trash" size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Excluir grupo
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span className="kg-field-label">As listas deste grupo voltam para "Sem grupo" (não são apagadas). Confirmar?</span>
                  <button className="kg-btn kg-btn-danger" onClick={del}>Excluir o grupo</button>
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
