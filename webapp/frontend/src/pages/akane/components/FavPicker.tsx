// Seletor de favorito — modal para escolher UM filme entre os já vistos.
// Porte do FavPicker do design handoff (akane/screens-a.jsx): busca no topo
// (filtro client-side) + grade de pôsteres; clicar adiciona e fecha.
// No app real a lista de vistos vem da API (akaneApi.list status=watched).

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import type { Movie } from '../types'
import { Icon } from '../ui/Icon'
import { Poster } from './Poster'
import { matches } from '../searchUtils'

interface FavPickerProps {
  /** IDs que não devem aparecer (já são favoritos). */
  exclude: string[]
  /** Chamado com o ID escolhido — o chamador adiciona e fecha. */
  onPick: (id: string) => void
  /** Fechar sem escolher (Esc / clique no scrim / botão ×). */
  onClose: () => void
}

/** Modal de escolha de um novo filme favorito. */
export function FavPicker({ exclude, onPick, onClose }: FavPickerProps) {
  const [q, setQ] = useState('')
  const [watched, setWatched] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)

  // Carrega os filmes vistos uma vez ao abrir
  useEffect(() => {
    akaneApi.list({ status: 'watched' })
      .then(r => setWatched(r.movies))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Esc fecha o modal (padrão de teclado do handoff)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Remove os já favoritos e aplica a busca local
  let pool = watched.filter(f => !exclude.includes(f.id))
  if (q.trim()) pool = pool.filter(f => matches(q, f.title, f.director, f.genres, f.year))

  return (
    <div className="modal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-label="Escolher favorito">
        <div className="modal-head">
          <span className="modal-title">Escolher favorito</span>
          <button className="modal-x" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <div className="film-search primary" style={{ marginBottom: 16 }}>
            <div className="film-search-bar">
              <Icon name="search" />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar entre os vistos…" />
            </div>
          </div>
          <div className="fav-pick-grid">
            {pool.map(f => (
              <a key={f.id} className="poster-link" onClick={() => onPick(f.id)} title={f.title}>
                <Poster title={f.title} posterUrl={f.poster_url} palette={f.poster_palette}
                        genre={f.genres?.[0]} director={f.director?.[0]} year={f.year} />
                <div className="poster-meta"><div className="pm-title">{f.title}</div></div>
              </a>
            ))}
            {!loading && pool.length === 0 && (
              <p className="empty-state" style={{ gridColumn: '1/-1', padding: '30px 0' }}>Nenhum filme encontrado.</p>
            )}
            {loading && (
              <p className="empty-state" style={{ gridColumn: '1/-1', padding: '30px 0' }}>Carregando filmes…</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
