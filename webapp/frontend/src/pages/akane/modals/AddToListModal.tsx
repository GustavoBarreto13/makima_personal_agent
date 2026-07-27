// Modal "Adicionar a lista" — aberto a partir do detalhe do filme (spec 051, US1).
// Mostra as listas existentes com um botão de adicionar por linha, mais um campo
// "+ Nova lista" para criar e já adicionar o filme na mesma ação.
//
// add_to_list no backend é idempotente (ON CONFLICT DO UPDATE position) — clicar
// de novo numa lista onde o filme já está não cria duplicata, só reposiciona.
// Por isso o modal não precisa buscar o detalhe de cada lista para saber se o
// filme já está presente; o botão pode ser clicado livremente.

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import type { MovieList } from '../types'

interface AddToListModalProps {
  movieId: string
  onClose: () => void
  onToast: (msg: string) => void
}

export function AddToListModal({ movieId, onClose, onToast }: AddToListModalProps) {
  const [lists, setLists] = useState<MovieList[]>([])
  const [loading, setLoading] = useState(true)
  const [addingId, setAddingId] = useState<string | null>(null)

  // Campo de criação de nova lista
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    akaneApi.lists()
      .then(r => setLists(r.lists))
      .catch(() => setLists([]))
      .finally(() => setLoading(false))
  }, [])

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
        // Recarrega a lista de listas para refletir a nova
        akaneApi.lists().then(r => setLists(r.lists)).catch(() => {})
      }
    } catch {
      onToast('Não foi possível criar a lista.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--paper)',
          borderRadius: 16,
          padding: 24,
          maxWidth: 420,
          width: '100%',
          maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--ink)' }}>
            Adicionar a lista
          </h3>
          <button className="ak-btn" onClick={onClose} style={{ fontSize: 14, padding: '3px 8px' }}>
            ✕
          </button>
        </div>

        {/* Listas existentes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: 280 }}>
          {loading ? (
            <p style={{ fontSize: 12, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>Carregando…</p>
          ) : lists.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>Nenhuma lista ainda — crie uma abaixo.</p>
          ) : (
            lists.map(list => (
              <div
                key={list.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px',
                  background: 'var(--card)', borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--line-2)',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: list.accent || 'var(--rose)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: 'var(--ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {list.name}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)' }}>
                  {list.count} {list.count === 1 ? 'filme' : 'filmes'}
                </span>
                <button
                  className="ak-btn ak-btn-primary"
                  onClick={() => addTo(list)}
                  disabled={addingId === list.id}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                >
                  {addingId === list.id ? '...' : '+ Adicionar'}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Nova lista inline */}
        <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--line-2)', paddingTop: 14 }}>
          <input
            className="ak-input"
            placeholder="Nome da nova lista..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createAndAdd()}
          />
          <button
            className="ak-btn ak-btn-primary"
            onClick={createAndAdd}
            disabled={!newName.trim() || creating}
            style={{ flexShrink: 0 }}
          >
            {creating ? '...' : '+ Nova'}
          </button>
        </div>
      </div>
    </div>
  )
}
