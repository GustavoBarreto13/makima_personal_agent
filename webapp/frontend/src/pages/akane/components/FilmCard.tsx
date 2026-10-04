// Card e linha de filme: pôster (ou capa tipográfica do DS quando não há), título, ano e nota.

import { Icon, MediaCard, hueFromName, StatusChip } from '../../../design'
import { fmtDuration } from '../../../design/core/format'
import { useAkane } from '../context'
import type { Movie } from '../types'

export function FilmCard({ movie, index, showStatus = true }: { movie: Movie; index?: number; showStatus?: boolean }) {
  const akane = useAkane()
  return (
    <MediaCard
      title={movie.title}
      subtitle={[movie.year, movie.director[0]].filter(Boolean).join(' · ') || undefined}
      image={movie.poster_url}
      icon="movie"
      hue={hueFromName(movie.title)}
      rating={movie.status === 'watched' ? movie.rating : undefined}
      cover="poster"
      status={showStatus && movie.status === 'watchlist' ? 'planned' : undefined}
      badge={movie.liked ? <Icon name="heart" size={14} label="Curtido" /> : undefined}
      metaRight={movie.times_watched > 1 ? <span className="ds-mono" title="Vezes que assisti">{movie.times_watched}×</span> : undefined}
      index={index}
      onOpen={() => akane.goto({ view: 'films', movieId: movie.id })}
    />
  )
}

/** Linha da lista (modo "lista" de Filmes e Quero ver). */
export function FilmRow({ movie }: { movie: Movie }) {
  const akane = useAkane()
  const meta = [movie.year, movie.director[0], movie.runtime ? fmtDuration(movie.runtime) : null].filter(Boolean).join(' · ')
  return (
    <button type="button" className="ds-lrow" onClick={() => akane.goto({ view: 'films', movieId: movie.id })}>
      <span className="ds-lead"><Icon name="movie" size={18} /></span>
      <span className="ds-t"><b>{movie.title}</b>{meta && <span>{meta}</span>}</span>
      {movie.status === 'watchlist' && <StatusChip status="planned" label="Quero ver" />}
      {movie.liked && <Icon name="heart" size={14} label="Curtido" />}
      {movie.status === 'watched' && movie.rating ? <span className="ds-num">{movie.rating.toFixed(1)}</span> : null}
      <Icon name="right" size={16} />
    </button>
  )
}
