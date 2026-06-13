// Tela da watchlist — lista de filmes que o usuário quer assistir.
// Grid compacto com pôsteres e botão para "Logar sessão" direto.

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import type { Movie } from '../types'
// Poster não é usado — WatchlistScreen renderiza pôsteres inline (img + ak-typo-poster)

interface WatchlistScreenProps {
  /** Callback ao clicar em um filme para abrir o detalhe. */
  onSelectMovie: (id: string) => void
  /** Callback ao clicar em "Logar" para abrir o LogModal com o filme pré-selecionado. */
  onLogFilm: (movieId: string, title: string) => void
}

/**
 * Lista de filmes na watchlist.
 */
export function WatchlistScreen({ onSelectMovie, onLogFilm }: WatchlistScreenProps) {
  const [movies, setMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    akaneApi.watchlist()
      .then(res => setMovies(res.movies))
      .catch(() => setMovies([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div style={{
          width: 32, height: 32,
          border: '2px solid var(--line)',
          borderTopColor: 'var(--rose)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    )
  }

  if (movies.length === 0) {
    return (
      <div className="ak-empty">
        <span className="ak-empty-icon">📋</span>
        <p className="ak-empty-title">Watchlist vazia</p>
        <p className="ak-empty-sub">Adicione filmes que quer assistir usando o botão "+ Watchlist".</p>
      </div>
    )
  }

  return (
    <div>
      {/* Contador */}
      <p style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', marginBottom: 16 }}>
        {movies.length} {movies.length === 1 ? 'filme' : 'filmes'} na lista
      </p>

      {/* Grid de cartões horizontais (mais compactos que o catálogo) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {movies.map(movie => (
          <WatchlistRow
            key={movie.id}
            movie={movie}
            onDetail={() => onSelectMovie(movie.id)}
            onLog={() => onLogFilm(movie.id, movie.title)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Linha da watchlist ────────────────────────────────────────────────────────

interface WatchlistRowProps {
  movie: Movie
  onDetail: () => void
  onLog: () => void
}

/**
 * Linha horizontal da watchlist: pôster minúsculo | título + meta | botão "Logar".
 */
function WatchlistRow({ movie, onDetail, onLog }: WatchlistRowProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '54px 1fr auto',
        gap: 12,
        alignItems: 'center',
        background: 'var(--card)',
        borderRadius: 'var(--r-md)',
        padding: '10px 14px',
        border: '1px solid var(--line)',
        cursor: 'pointer',
        transition: 'background 0.12s',
      }}
      onClick={onDetail}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onDetail() }}
    >
      {/* Pôster miniatura (54×81px) */}
      <div style={{
        width: 54, height: 81,
        borderRadius: 'var(--r-sm)',
        overflow: 'hidden',
        flexShrink: 0,
        background: 'var(--card-2)',
      }}>
        {movie.poster_url ? (
          <img
            src={movie.poster_url}
            alt={`Pôster de ${movie.title}`}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            className="ak-typo-poster"
            data-palette={movie.poster_palette}
            style={{ fontSize: 9, padding: '6px 5px' }}
          >
            <p className="ak-typo-title" style={{ fontSize: 10 }}>{movie.title}</p>
          </div>
        )}
      </div>

      {/* Metadados */}
      <div style={{ minWidth: 0 }}>
        <p style={{
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: 14,
          color: 'var(--ink)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {movie.title}
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          {movie.year && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)' }}>
              {movie.year}
            </span>
          )}
          {movie.director?.[0] && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)' }}>
              {movie.director[0]}
            </span>
          )}
          {movie.runtime && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)' }}>
              {movie.runtime}min
            </span>
          )}
        </div>
        {/* Gêneros */}
        {movie.genres?.length > 0 && (
          <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
            {movie.genres.slice(0, 3).map(g => (
              <span key={g} style={{
                fontFamily: 'var(--mono)', fontSize: 10,
                color: 'var(--ink-4)', background: 'var(--line-2)',
                padding: '1px 6px', borderRadius: 99,
              }}>{g}</span>
            ))}
          </div>
        )}
      </div>

      {/* Botão de registrar sessão */}
      <button
        className="ak-btn ak-btn-primary"
        onClick={e => { e.stopPropagation(); onLog() }}
        title="Registrar sessão"
        style={{ fontSize: 12, padding: '6px 12px', flexShrink: 0 }}
      >
        ▶ Logar
      </button>
    </div>
  )
}
