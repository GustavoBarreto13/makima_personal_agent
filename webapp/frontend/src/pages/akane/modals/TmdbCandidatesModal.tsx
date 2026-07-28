// Modal "Trocar filme" — busca candidatos no TMDB para corrigir um match errado
// (spec 050, US4/FR-007). Reestilizado no padrão .modal-* do handoff.
// Reaproveita GET /api/movies/tmdb/search (akaneApi.tmdbSearch), já usado na
// busca "Logar filme" — nenhuma rota nova de busca é necessária.

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import { Icon } from '../ui/Icon'
import { Poster } from '../components/Poster'

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
    <div className="ak-modal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ak-modal" role="dialog" aria-label="Trocar filme">
        <div className="ak-modal-head">
          <span className="ak-modal-title">Trocar filme</span>
          <button className="ak-modal-x" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>
        <div className="ak-modal-body">
          <div className="ak-film-search-bar" style={{ marginBottom: 14 }}>
            <Icon name="search" />
            <input value={query} onChange={e => setQuery(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && search()}
                   placeholder="Buscar no TMDB…" autoFocus />
          </div>
          <button className="ak-btn ak-btn-primary" onClick={search} disabled={loading || !query.trim()} style={{ marginBottom: 14 }}>
            {loading ? 'Buscando…' : <><Icon name="search" /> Buscar</>}
          </button>

          <div className="ak-filmpick" style={{ flexDirection: 'column', maxHeight: 340, gap: 6 }}>
            {searched && results.length === 0 && (
              <p className="ak-empty-state" style={{ padding: '12px 0' }}>Nenhum resultado encontrado.</p>
            )}
            {results.map(r => (
              <div key={r.tmdb_id} className="ak-addlist-row" onClick={() => onSelect(r.tmdb_id)} style={{ cursor: 'pointer' }}>
                <div style={{ width: 32, flexShrink: 0 }}>
                  <Poster title={r.title} posterUrl={r.poster_url} palette="noir" />
                </div>
                <span className="ak-addlist-name">
                  {r.title} {r.year && <span style={{ color: 'var(--ink-4)' }}>({r.year})</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
