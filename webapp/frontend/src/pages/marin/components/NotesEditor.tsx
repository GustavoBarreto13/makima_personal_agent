// NotesEditor — Caderno da Marin: anotações soltas do usuário sobre o anime.
// Porta direta do padrão já usado na Akane (NotesEditor em MovieDetailScreen.tsx)
// e na Mai — editar/exibir/vazio, mesmo fluxo de 3 estados (spec 054, FR-002).

import { useState } from 'react'
import { marinApi } from '../marinApi'

interface NotesEditorProps {
  animeId: string
  initialNotes: string | null
  onToast: (msg: string) => void
}

export function NotesEditor({ animeId, initialNotes, onToast }: NotesEditorProps) {
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [saved, setSaved] = useState(initialNotes ?? '')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await marinApi.setNotes(animeId, notes)
      setSaved(notes)
      setEditing(false)
      onToast('Anotações salvas.')
    } catch {
      onToast('Erro ao salvar anotações.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mr-detail-section mr-notes-block">
      <h2 className="mr-detail-section-title">
        caderno da Marin ✨
        {!editing && (
          <button
            className="mr-btn-ghost"
            style={{ marginLeft: 8 }}
            onClick={() => setEditing(true)}
          >
            {saved ? 'Editar' : '+ Adicionar'}
          </button>
        )}
      </h2>

      {editing ? (
        <div style={{ margin: '4px 0 8px' }}>
          <textarea
            className="mr-textarea"
            rows={4}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Suas reflexões soltas sobre o anime…"
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="mr-btn mr-btn--primary" onClick={save} disabled={busy}>
              {busy ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              className="mr-btn"
              onClick={() => { setEditing(false); setNotes(saved) }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : saved ? (
        <p className="mr-detail-notes">{saved}</p>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--ink-4)', fontStyle: 'italic' }}>
          Nenhuma anotação ainda.
        </p>
      )}
    </section>
  )
}
