// PosterCard — pôster 2:3 com imagem TMDB ou fallback tipográfico Fraunces.
// A paleta é determinística pelo título (hash → 12 paletas).
// Exibe progressbar âmbar (4px) na base quando há progresso de episódios.

import type { Series } from '../types'
import { posterPalette } from '../maiApi'

interface Props {
  series: Pick<Series,
    'title' | 'title_original' | 'poster_url' | 'first_air_date' |
    'network' | 'episodes_watched' | 'episodes_count' | 'rating' | 'status'>
  /** Largura em pixels (a altura é calculada em 2:3). Opcional — usa --poster-w do CSS. */
  width?: number
  /** Callback ao clicar no card. */
  onClick?: () => void
  className?: string
}

// Converte a paleta para exibição no pôster tipográfico
const PALETTE_LABELS: Record<string, string> = {
  periwinkle: 'TV', dusk: 'TV', amber: 'TV', slate: 'TV', wine: 'TV',
  teal: 'TV', moss: 'TV', rose: 'TV', indigo: 'TV', sand: 'TV', steel: 'TV', plum: 'TV',
}

/**
 * PosterCard — renderiza pôster 2:3 de uma série.
 * Com imagem TMDB (poster_url) → exibe a imagem.
 * Sem imagem → exibe pôster tipográfico com título em Fraunces e paleta determinística.
 */
export function PosterCard({ series, width, onClick, className = '' }: Props) {
  const palette = posterPalette(series.title)
  const year = series.first_air_date ? new Date(series.first_air_date).getFullYear() : null

  // Calcula progresso de episódios (0–1) para a progressbar âmbar
  const progress = series.episodes_count && series.episodes_count > 0
    ? Math.min(1, series.episodes_watched / series.episodes_count)
    : 0

  const style = width ? { width, height: Math.round(width * 1.5) } : undefined

  return (
    <div
      className={`poster ${className}`}
      data-palette={series.poster_url ? undefined : palette}
      onClick={onClick}
      style={style}
    >
      {/* Imagem TMDB — se disponível */}
      {series.poster_url ? (
        <img
          src={series.poster_url}
          alt={series.title}
          loading="lazy"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        /* Fallback tipográfico: kicker + título + linha + studio/ano */
        <>
          <span className="p-kicker">{PALETTE_LABELS[palette] ?? 'TV'}</span>
          <span className="p-title" style={{ fontSize: series.title.length > 20 ? 13 : 17 }}>
            {series.title}
          </span>
          <div className="p-foot">
            <div className="p-rule" />
            {series.network && <div className="p-studio">{series.network}</div>}
            {year && <div className="p-year">{year}</div>}
          </div>
        </>
      )}

      {/* Progressbar âmbar na base (visível quando há progresso) */}
      {progress > 0 && (
        <div className="p-prog">
          <i style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </div>
  )
}
