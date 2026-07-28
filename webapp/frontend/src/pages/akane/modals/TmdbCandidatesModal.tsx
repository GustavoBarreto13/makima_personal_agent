// Modal "Trocar filme" — busca candidatos no TMDB para corrigir um match errado
// (spec 050, US4/FR-007). Reaproveita GET /api/movies/tmdb/search (akaneApi.tmdbSearch),
// já usado na busca "Logar filme" — nenhuma rota nova de busca é necessária.

import { useState } from 'react'
import { akaneApi } from '../akaneApi'

interface TmdbCandidatesModalProps {
  initialQuery: string
  onClose: () => void
  /** Chamado com o tmdb_id escolhido pela usuária. */
  onSelect: (tmdbId: number) => void
}

export function TmdbCandidatesModal({ initialQuery, onClose, onSelect }: TmdbCandidatesModalProps) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<Array<{ tmdb_id: number; title: string; year: number | null; poster_url: string | null }>>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const search = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const res = await akaneApi.tmdbSearch(query.trim())
      setResults(res.results)
      setSearched(true)
    } catch {
      setResults([])
      setSearched(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 210,
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
          maxWidth: 460,
          width: '100%',
          maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--ink)' }}>
            Trocar filme
          </h3>
          <button className="ak-btn" onClick={onClose} style={{ fontSize: 14, padding: '3px 8px' }}>
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="ak-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Buscar no TMDB..."
            autoFocus
          />
          <button className="ak-btn ak-btn-primary" onClick={search} disabled={loading || !query.trim()} style={{ flexShrink: 0 }}>
            {loading ? '...' : 'Buscar'}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: 340 }}>
          {searched && results.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>Nenhum resultado encontrado.</p>
          )}
          {results.map(r => (
            <button
              key={r.tmdb_id}
              onClick={() => onSelect(r.tmdb_id)}
              style={{
                all: 'unset', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px',
                background: 'var(--card)', borderRadius: 'var(--r-sm)',
                border: '1px solid var(--line-2)',
              }}
            >
              {r.poster_url ? (
                <img src={r.poster_url} alt="" style={{ width: 32, height: 48, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 32, height: 48, background: 'var(--mist)', borderRadius: 4, flexShrink: 0 }} />
              )}
              <span style={{ fontSize: 13, color: 'var(--ink)' }}>
                {r.title} {r.year && <span style={{ color: 'var(--ink-4)' }}>({r.year})</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
