// Tela "Quero ver" (watchlist) — reescrita hi-fi conforme o handoff §7.5:
// lista vertical wl-list; cada item com pôster, título/diretor/ano/duração,
// chip de gênero, anotação (se houver) e botão "Já vi" que abre o LogModal
// pré-preenchido. O subtítulo mostra o total de horas "esperando".

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import type { Movie } from '../types'
import { Icon } from '../ui/Icon'
import { Poster } from '../components/Poster'
import { matches } from '../searchUtils'
import { fmtRuntime } from '../dateUtils'

interface WatchlistScreenProps {
  /** Abre o detalhe de um filme. */
  onSelectMovie: (id: string) => void
  /** Abre o LogModal com o filme pré-selecionado ("Já vi"). */
  onLogFilm: (movieId: string, title: string) => void
  /** Query da busca contextual da topbar — filtra client-side. */
  query: string
}

/** Lista de filmes esperando na watchlist. */
export function WatchlistScreen({ onSelectMovie, onLogFilm, query }: WatchlistScreenProps) {
  const [movies, setMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    akaneApi.watchlist()
      .then(res => setMovies(res.movies))
      .catch(() => setMovies([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <p className="ak-empty-state">Carregando watchlist…</p>
  }

  // Busca client-side
  const want = movies.filter(m => matches(query, m.title, m.director, m.genres, m.year))
  // Total de minutos de cinema esperando (só dos filmes com duração conhecida)
  const totalMin = want.reduce((a, f) => a + (f.runtime ?? 0), 0)

  return (
    <div className="ak-page">
      <div className="ak-section-head" style={{ marginTop: 32, marginBottom: 0 }}>
        <h2 className="ak-section-title" style={{ fontSize: 30 }}>Quero ver</h2>
        <span className="ak-section-sub">
          {want.length} {want.length === 1 ? 'filme' : 'filmes'}
          {totalMin > 0 && <> · {fmtRuntime(totalMin)} de cinema esperando</>}
        </span>
      </div>

      <div className="ak-wl-list">
        {want.map(f => (
          <div key={f.id} className="ak-wl-item">
            <div className="ak-wl-poster" onClick={() => onSelectMovie(f.id)}>
              <Poster title={f.title} posterUrl={f.poster_url} palette={f.poster_palette}
                      genre={f.genres?.[0]} director={f.director?.[0]} year={f.year} />
            </div>
            <div className="ak-wl-info">
              <div className="ak-wl-title" onClick={() => onSelectMovie(f.id)}>{f.title}</div>
              <div className="ak-wl-sub">
                {[f.director?.[0], f.year, f.runtime ? fmtRuntime(f.runtime) : null].filter(Boolean).join(' · ')}
              </div>
              {(f.genres?.length ?? 0) > 0 && <span className="ak-wl-genre">{f.genres.join(' · ')}</span>}
              {f.notes && <div className="ak-wl-note">"{f.notes}"</div>}
            </div>
            <div className="ak-wl-right">
              <button className="ak-btn ak-btn-primary" style={{ fontSize: 12.5, padding: '9px 16px' }}
                      onClick={() => onLogFilm(f.id, f.title)}>
                <Icon name="check" /> Já vi
              </button>
            </div>
          </div>
        ))}
        {want.length === 0 && (
          <p className="ak-empty-state">
            {query.trim()
              ? `Nada encontrado para "${query}".`
              : 'Watchlist vazia — busque um título em "Logar filme" para adicioná-lo.'}
          </p>
        )}
      </div>
    </div>
  )
}
