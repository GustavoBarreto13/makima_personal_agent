// Modal "Adicionar a lista" — aberto a partir do detalhe do anime (spec 054, FR-003).
// Porta direta do padrão já usado na Akane (modals/AddToListModal.tsx), com as
// classes .mr-modal-* do shell da Marin.
//
// add_to_list no backend é idempotente (ON CONFLICT DO UPDATE position) — clicar
// de novo numa lista onde o anime já está não cria duplicata, só reposiciona.

import { useState, useEffect } from 'react'
import { marinApi } from '../marinApi'
import type { AnimeList } from '../types'
import { Icon } from '../components/Icon'

interface AddToListModalProps {
  animeId: string
  onClose: () => void
  onToast: (msg: string) => void
}

export function AddToListModal({ animeId, onClose, onToast }: AddToListModalProps) {
  const [lists, setLists] = useState<AnimeList[]>([])
  const [loading, setLoading] = useState(true)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    marinApi.getLists()
      .then(r => setLists(r.lists ?? []))
      .catch(() => setLists([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function addTo(list: AnimeList) {
    setAddingId(list.id)
    try {
      await marinApi.addToList(list.id, animeId)
      onToast(`Adicionado a "${list.name}".`)
    } catch {
      onToast('Não foi possível adicionar à lista.')
    } finally {
      setAddingId(null)
    }
  }

  async function createAndAdd() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const created = await marinApi.createList({ name: newName.trim() })
      const newId = (created as { id?: string }).id
      if (newId) {
        await marinApi.addToList(newId, animeId)
        onToast(`Lista "${newName.trim()}" criada e anime adicionado.`)
        setNewName('')
        marinApi.getLists().then(r => setLists(r.lists ?? [])).catch(() => {})
      }
    } catch {
      onToast('Não foi possível criar a lista.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      className="mr-modal-scrim"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal
      aria-label="Adicionar a lista"
    >
      <div className="mr-modal">
        <div className="mr-modal-header">
          <h2 className="mr-modal-title">Adicionar a lista</h2>
          <button className="mr-modal-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <div className="mr-modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
            {loading ? (
              <p style={{ padding: '12px 0', color: 'var(--ink-4)' }}>Carregando…</p>
            ) : lists.length === 0 ? (
              <p style={{ padding: '12px 0', color: 'var(--ink-4)' }}>Nenhuma lista ainda — crie uma abaixo.</p>
            ) : (
              lists.map(list => (
                <div
                  key={list.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}
                >
                  <span
                    style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: list.accent || 'var(--marin)', flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1 }}>{list.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>
                    {list.count} {list.count === 1 ? 'anime' : 'animes'}
                  </span>
                  <button
                    className="mr-btn mr-btn--primary"
                    onClick={() => addTo(list)}
                    disabled={addingId === list.id}
                    style={{ fontSize: 11, padding: '4px 10px' }}
                  >
                    {addingId === list.id ? '…' : <><Icon name="plus" size={12} /> Adicionar</>}
                  </button>
                </div>
              ))
            )}
          </div>

          <div
            style={{
              display: 'flex', gap: 8, borderTop: '1px solid var(--line)',
              paddingTop: 14, marginTop: 10,
            }}
          >
            <input
              className="mr-input"
              placeholder="Nome da nova lista…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createAndAdd() }}
            />
            <button
              className="mr-btn mr-btn--primary"
              onClick={createAndAdd}
              disabled={!newName.trim() || creating}
              style={{ flexShrink: 0 }}
            >
              {creating ? '…' : <><Icon name="plus" size={12} /> Nova</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
