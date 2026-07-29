// TagEditor — etiquetas livres de um anime, editáveis pelo detalhe (spec 054, FR-004).
// Chips com botão de remover + campo de texto para adicionar; normalização de
// caixa/acento acontece no backend (add_tag/_norm_tag), aqui só refletimos o
// texto normalizado que a API confirma de volta.

import { useState } from 'react'
import { marinApi } from '../marinApi'

// Marcas diacríticas combinantes (acentos), Unicode U+0300–U+036F.
const DIACRITICS_RE = /[\u0300-\u036f]/g

interface TagEditorProps {
  animeId: string
  initialTags: string[]
  onToast: (msg: string) => void
}

export function TagEditor({ animeId, initialTags, onToast }: TagEditorProps) {
  const [tags, setTags] = useState<string[]>(initialTags)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleAdd() {
    const value = input.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      await marinApi.addTag(animeId, value)
      // O backend normaliza (minúsculas + sem acento, preservando espaços) —
      // reflete localmente a mesma forma para não esperar um refetch.
      const norm = value.toLowerCase().normalize('NFD').replace(DIACRITICS_RE, '')
      setTags(prev => (prev.includes(norm) ? prev : [...prev, norm]))
      setInput('')
    } catch {
      onToast('Erro ao adicionar etiqueta.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(tag: string) {
    try {
      await marinApi.removeTag(animeId, tag)
      setTags(prev => prev.filter(t => t !== tag))
    } catch {
      onToast('Erro ao remover etiqueta.')
    }
  }

  return (
    <div className="mr-tag-editor">
      <div className="mr-detail-genres-chips" style={{ marginBottom: 8 }}>
        {tags.map(t => (
          <span key={t} className="mr-tag mr-tag-removable">
            {t}
            <button
              aria-label={`Remover etiqueta ${t}`}
              onClick={() => handleRemove(t)}
              style={{ marginLeft: 6, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
            >
              ✕
            </button>
          </span>
        ))}
        {tags.length === 0 && (
          <span style={{ fontSize: 13, color: 'var(--ink-4)', fontStyle: 'italic' }}>
            Nenhuma etiqueta ainda.
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          className="mr-input"
          placeholder="Nova etiqueta…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
        />
        <button className="mr-btn" onClick={handleAdd} disabled={busy || !input.trim()}>
          + Adicionar
        </button>
      </div>
    </div>
  )
}
