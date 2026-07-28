// Modal "Adicionar a lista" — aberto a partir do detalhe do filme (spec 051, US1).
// Reestilizado no padrão .modal-* do handoff — mesma lógica, novo visual.
// Mostra as listas existentes com um botão de adicionar por linha, mais um campo
// "+ Nova lista" para criar e já adicionar o filme na mesma ação.
//
// add_to_list no backend é idempotente (ON CONFLICT DO UPDATE position) — clicar
// de novo numa lista onde o filme já está não cria duplicata, só reposiciona.

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import type { MovieList } from '../types'
import { Icon } from '../ui/Icon'

interface AddToListModalProps {
  movieId: string
  onClose: () => void
  onToast: (msg: string) => void
}

export function AddToListModal({ movieId, onClose, onToast }: AddToListModalProps) {
  const [lists, setLists] = useState<MovieList[]>([])
  const [loading, setLoading] = useState(true)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    akaneApi.lists()
      .then(r => setLists(r.lists))
      .catch(() => setLists([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const addTo = async (list: MovieList) => {
    setAddingId(list.id)
    try {
      await akaneApi.addToList(list.id, movieId)
      onToast(`Adicionado a "${list.name}".`)
    } catch {
      onToast('Não foi possível adicionar à lista.')
    } finally {
      setAddingId(null)
    }
  }

  const createAndAdd = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const created = await akaneApi.createList({ name: newName.trim() })
      const newId = (created as { id?: string }).id
      if (newId) {
        await akaneApi.addToList(newId, movieId)
        onToast(`Lista "${newName.trim()}" criada e filme adicionado.`)
        setNewName('')
        akaneApi.lists().then(r => setLists(r.lists)).catch(() => {})
      }
    } catch {
      onToast('Não foi possível criar a lista.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="ak-modal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ak-modal" role="dialog" aria-label="Adicionar a lista">
        <div className="ak-modal-head">
          <span className="ak-modal-title">Adicionar a lista</span>
          <button className="ak-modal-x" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>
        <div className="ak-modal-body">
          <div className="ak-filmpick" style={{ flexDirection: 'column', maxHeight: 280, gap: 6 }}>
            {loading ? (
              <p className="ak-empty-state" style={{ padding: '12px 0' }}>Carregando…</p>
            ) : lists.length === 0 ? (
              <p className="ak-empty-state" style={{ padding: '12px 0' }}>Nenhuma lista ainda — crie uma abaixo.</p>
            ) : (
              lists.map(list => (
                <div key={list.id} className="ak-addlist-row">
                  <span className="ak-addlist-dot" style={{ background: list.accent || 'var(--rose)' }} />
                  <span className="ak-addlist-name">{list.name}</span>
                  <span className="ak-addlist-count">{list.count} {list.count === 1 ? 'filme' : 'filmes'}</span>
                  <button className="ak-btn ak-btn-primary" onClick={() => addTo(list)} disabled={addingId === list.id}
                          style={{ fontSize: 11, padding: '4px 10px' }}>
                    {addingId === list.id ? '…' : <><Icon name="plus" /> Adicionar</>}
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="ak-modal-field" style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--line-2)', paddingTop: 14, marginTop: 4 }}>
            <input className="ak-text-input" placeholder="Nome da nova lista…" value={newName}
                   onChange={e => setNewName(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && createAndAdd()} />
            <button className="ak-btn ak-btn-primary" onClick={createAndAdd} disabled={!newName.trim() || creating}
                    style={{ flexShrink: 0 }}>
              {creating ? '…' : <><Icon name="plus" /> Nova</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
