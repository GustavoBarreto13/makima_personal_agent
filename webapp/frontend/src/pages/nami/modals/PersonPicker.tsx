// Seletor de pessoas — vincula uma transação a pessoas do diretório da Komi (spec 047, US1).
// Busca por prefixo (komiApi.search, mesmo endpoint smart-match usado no resto do app),
// chips removíveis para as já selecionadas. Nunca bloqueia o lançamento: sem correspondência,
// o usuário só segue sem vincular ninguém.

import { useState, useEffect, useRef } from 'react'
import { komiApi } from '../../komi/komiApi'
import { Icon } from '../icons'

interface PersonMatch { id: string; name: string; relationship: string }

interface PersonPickerProps {
  /** Pessoas já selecionadas — {id, name} para exibir o chip sem precisar buscar de novo */
  selected: { id: string; name: string }[]
  onChange: (people: { id: string; name: string }[]) => void
}

/**
 * Campo de busca + chips para vincular pessoas a uma transação.
 * Debounce de 250ms; exige 2+ caracteres para buscar (evita ruído com "a", "e"...).
 */
export function PersonPicker({ selected, onChange }: PersonPickerProps) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<PersonMatch[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setMatches([])
      return
    }
    debounceRef.current = setTimeout(() => {
      komiApi.search(query.trim())
        .then(r => setMatches(r.matches ?? []))
        .catch(() => setMatches([]))
    }, 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  function addPerson(p: PersonMatch) {
    if (!selected.some(s => s.id === p.id)) {
      onChange([...selected, { id: p.id, name: p.name }])
    }
    setQuery('')
    setMatches([])
    setOpen(false)
  }

  function removePerson(id: string) {
    onChange(selected.filter(s => s.id !== id))
  }

  return (
    <div className="field" style={{ marginBottom: 16, position: 'relative' }}>
      <label>Pessoas (opcional)</label>
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar pessoa por nome…"
      />
      {open && matches.length > 0 && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--rad-sm)',
            marginTop: 4, maxHeight: 160, overflowY: 'auto',
          }}
        >
          {matches.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => addPerson(p)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px',
                fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)',
              }}
            >
              {p.name} {p.relationship && <span style={{ color: 'var(--muted)', fontSize: 11 }}>· {p.relationship}</span>}
            </button>
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {selected.map(p => (
            <span key={p.id} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {p.name}
              <button
                type="button"
                onClick={() => removePerson(p.id)}
                aria-label={`Remover ${p.name}`}
                style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
              >
                <Icon name="x" size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
