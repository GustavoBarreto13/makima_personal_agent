// Tela de catálogo (grid de pôsteres) com chips de filtro e ordenação.
// Exibe todos os filmes (watched + watchlist) com filtros opcionais.

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import type { Movie, Tweaks } from '../types'
import { Stars } from '../components/Stars'
// Poster não é usado nesta tela — FilmsScreen renderiza pôsteres inline
// para controle total do onError (troca TMDB → tipográfico sem rerenders extra)

// Chips de filtro disponíveis (chip → valor do param 'filter' na API)
const FILTER_CHIPS: Array<{ label: string; value: string }> = [
  { label: 'Todos',       value: 'all' },
  { label: 'Assistidos',  value: 'watched' },
  { label: 'Curtidos',    value: 'liked' },
  { label: 'Watchlist',   value: 'watchlist' },
  { label: 'Avaliados',   value: 'rated' },
]

// Opções de ordenação
const SORT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Recentes',   value: 'recent' },
  { label: 'Nota',       value: 'rating' },
  { label: 'Título',     value: 'title' },
  { label: 'Ano',        value: 'year' },
  { label: 'Direção',    value: 'director' },
  { label: 'Duração',    value: 'runtime' },
]

interface FilmsScreenProps {
  tweaks: Tweaks
  /** Callback ao clicar em um filme para abrir o detalhe. */
  onSelectMovie: (id: string) => void
  /** Etiqueta pré-selecionada (vinda da tela de etiquetas). */
  initialTag?: string | null
}

/**
 * Grid principal do catálogo com filtros e ordenação.
 */
export function FilmsScreen({ tweaks, onSelectMovie, initialTag }: FilmsScreenProps) {
  // Estado dos filmes carregados
  const [movies, setMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)

  // Chip de filtro ativo ('all' = sem filtro)
  const [filter, setFilter] = useState('all')

  // Ordenação ativa (vem dos tweaks do usuário)
  const [sort, setSort] = useState(tweaks.sort)

  // Etiqueta ativa (filtro por tag via URL interna)
  const [activeTag, setActiveTag] = useState<string | null>(initialTag ?? null)

  // Busca os filmes sempre que filtro/sort/tag mudam
  useEffect(() => {
    setLoading(true)
    akaneApi.list({
      filter: filter !== 'all' ? filter : undefined,
      sort,
      tag: activeTag ?? undefined,
    })
      .then(res => setMovies(res.movies))
      .catch(() => setMovies([]))
      .finally(() => setLoading(false))
  }, [filter, sort, activeTag])

  return (
    <div>
      {/* ── Barra de controles: chips + sort ─────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        {/* Chips de filtro */}
        <div className="ak-chips" style={{ marginBottom: 0, flex: 1 }}>
          {FILTER_CHIPS.map(chip => (
            <button
              key={chip.value}
              className={`ak-chip${filter === chip.value ? ' active' : ''}`}
              onClick={() => { setFilter(chip.value); setActiveTag(null) }}
            >
              {chip.label}
            </button>
          ))}
          {/* Chip de etiqueta ativa (quando vindo da tela de etiquetas) */}
          {activeTag && (
            <button
              className="ak-chip active"
              onClick={() => setActiveTag(null)}
              title="Remover filtro de etiqueta"
            >
              #{activeTag} ✕
            </button>
          )}
        </div>

        {/* Seletor de ordenação */}
        <select
          value={sort}
          onChange={e => setSort(e.target.value as typeof sort)}
          className="ak-input"
          style={{ width: 'auto', fontSize: 12, padding: '5px 10px' }}
          aria-label="Ordenar por"
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* ── Grid de pôsteres ─────────────────────────────────────────────── */}
      {loading ? (
        // Estado de carregamento: spinner centralizado
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div style={{
            width: 32, height: 32,
            border: '2px solid var(--line)',
            borderTopColor: 'var(--rose)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        </div>
      ) : movies.length === 0 ? (
        // Estado vazio
        <div className="ak-empty">
          <span className="ak-empty-icon">🎬</span>
          <p className="ak-empty-title">Nenhum filme aqui</p>
          <p className="ak-empty-sub">
            {filter === 'watchlist'
              ? 'Adicione filmes à sua lista de desejos!'
              : filter === 'liked'
              ? 'Curta um filme para ele aparecer aqui.'
              : 'Comece adicionando um filme ao seu catálogo.'}
          </p>
        </div>
      ) : (
        // Grid com pôsteres
        <div className="ak-grid">
          {movies.map(movie => (
            <FilmCard
              key={movie.id}
              movie={movie}
              onClick={() => onSelectMovie(movie.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Card individual do pôster no grid ────────────────────────────────────────

interface FilmCardProps {
  movie: Movie
  onClick: () => void
}

/**
 * Card de pôster com overlay hover (título + ano + nota + coração).
 */
function FilmCard({ movie, onClick }: FilmCardProps) {
  return (
    // Container com aspecto 2:3 e overlay ao hover
    <div
      className="ak-poster-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onClick() }}
      aria-label={`${movie.title}${movie.year ? ` (${movie.year})` : ''}`}
      title={`${movie.title}${movie.year ? ` (${movie.year})` : ''}`}
    >
      {/* Pôster (imagem TMDB ou tipográfico) */}
      {movie.poster_url ? (
        <img
          src={movie.poster_url}
          alt={`Pôster de ${movie.title}`}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={e => {
            // Se a imagem falhar, esconde e mostra o pôster tipográfico
            const parent = (e.target as HTMLImageElement).parentElement
            if (parent) {
              ;(e.target as HTMLImageElement).style.display = 'none'
              const typo = parent.querySelector('.ak-typo-poster') as HTMLElement
              if (typo) typo.style.display = 'flex'
            }
          }}
        />
      ) : null}

      {/* Pôster tipográfico (sempre presente no DOM; oculto se poster_url existir) */}
      <div
        className="ak-typo-poster"
        data-palette={movie.poster_palette}
        style={{ display: movie.poster_url ? 'none' : 'flex' }}
      >
        <p className="ak-typo-title">{movie.title}</p>
        {movie.year && (
          <p style={{
            fontFamily: 'var(--mono)', fontSize: 11,
            color: 'var(--t, oklch(0.9 0.01 330))', opacity: 0.6, marginTop: 4,
            position: 'relative', zIndex: 1,
          }}>{movie.year}</p>
        )}
      </div>

      {/* Overlay com metadados (visível no hover via CSS) */}
      <div className="ak-poster-overlay">
        {/* Título em itálico serif */}
        <p className="ak-poster-title">{movie.title}</p>

        {/* Linha de metadados: ano + nota + coração */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {movie.year && (
            <span className="ak-poster-year">{movie.year}</span>
          )}
          {movie.rating !== null && (
            <Stars rating={movie.rating} size={10} />
          )}
          {movie.liked && (
            <span style={{ color: 'var(--heart)', fontSize: 10 }}>♥</span>
          )}
          {movie.status === 'watchlist' && (
            // Indicador de watchlist (não assistido)
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 9,
              color: 'var(--rose)', background: 'var(--rose-tint)',
              padding: '1px 4px', borderRadius: 99,
            }}>
              + Lista
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
