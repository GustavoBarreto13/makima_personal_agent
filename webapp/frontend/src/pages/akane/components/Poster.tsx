// Pôster de filme — porte do componente Poster do design handoff (akane/ui.jsx),
// adaptado para o dado real: quando o filme tem poster_url (imagem do TMDB),
// a imagem cobre o card; quando não tem (ou a imagem falha ao carregar),
// mostramos o pôster TIPOGRÁFICO de cinema do protótipo (campo de cor por
// paleta + gênero + título em Display + diretor/ano em mono).
//
// Decisão do usuário na reforma: TMDB com fallback tipográfico.
// Badges (coração/quero ver) e a faixa de nota ficam POR CIMA dos dois modos.

import { useState } from 'react'
import { Icon } from '../ui/Icon'
import { Heart } from '../ui/Heart'
import { Stars } from './Stars'

// As 14 paletas de "colorgrade" de cinema do handoff (data.js).
// bg = campo de cor do pôster; ink = cor do texto sobre ele.
// O backend calcula poster_palette deterministicamente por filme.
const PALETTES: Record<string, { bg: string; ink: string }> = {
  noir:   { bg: 'oklch(0.235 0.022 285)', ink: 'oklch(0.93 0.018 285)' },
  ember:  { bg: 'oklch(0.33 0.095 38)',   ink: 'oklch(0.96 0.03 65)'   },
  rose:   { bg: 'oklch(0.36 0.12 2)',     ink: 'oklch(0.96 0.035 350)' },
  neon:   { bg: 'oklch(0.30 0.10 320)',   ink: 'oklch(0.95 0.04 320)'  },
  teal:   { bg: 'oklch(0.32 0.062 210)',  ink: 'oklch(0.95 0.03 200)'  },
  gold:   { bg: 'oklch(0.40 0.085 78)',   ink: 'oklch(0.97 0.03 85)'   },
  ink:    { bg: 'oklch(0.22 0.012 270)',  ink: 'oklch(0.90 0.015 270)' },
  blood:  { bg: 'oklch(0.30 0.13 24)',    ink: 'oklch(0.96 0.03 30)'   },
  forest: { bg: 'oklch(0.31 0.055 160)',  ink: 'oklch(0.94 0.03 150)'  },
  dusk:   { bg: 'oklch(0.34 0.075 290)',  ink: 'oklch(0.95 0.03 300)'  },
  bone:   { bg: 'oklch(0.78 0.03 70)',    ink: 'oklch(0.26 0.04 50)'   },
  slate:  { bg: 'oklch(0.40 0.028 250)',  ink: 'oklch(0.93 0.015 250)' },
  wine:   { bg: 'oklch(0.30 0.085 350)',  ink: 'oklch(0.95 0.03 350)'  },
  sea:    { bg: 'oklch(0.34 0.07 235)',   ink: 'oklch(0.95 0.03 230)'  },
}

interface PosterProps {
  /** Título do filme (arte tipográfica e alt da imagem). */
  title: string
  /** URL do pôster TMDB. null/undefined → pôster tipográfico direto. */
  posterUrl?: string | null
  /** Paleta do pôster tipográfico ('noir', 'ember', … — calculada no backend). */
  palette?: string | null
  /** Primeiro gênero — vira o kicker do pôster tipográfico. */
  genre?: string | null
  /** Diretor(a) — rodapé do pôster tipográfico. */
  director?: string | null
  /** Ano — rodapé do pôster tipográfico. */
  year?: number | null
  /** Status do filme — badge "quero ver" quando 'watchlist' (com badge=true). */
  status?: 'watched' | 'watchlist' | null
  /** Curtido — badge de coração (com badge=true). */
  liked?: boolean
  /** Nota — faixa de estrelas no rodapé (com showRating=true). */
  rating?: number | null
  /** Mostrar os badges de canto (coração / quero ver). */
  badge?: boolean
  /** Mostrar a faixa de nota sobre o rodapé do pôster. */
  showRating?: boolean
  /** Versão mini (pilhas de Listas): só cor + título central pequeno. */
  mini?: boolean
  /** Callback de clique (o cursor pointer já vem do CSS .poster). */
  onClick?: () => void
}

/** Pôster do filme: imagem TMDB quando houver, tipográfico como fallback. */
export function Poster({
  title, posterUrl, palette, genre, director, year,
  status, liked, rating, badge, showRating, mini, onClick,
}: PosterProps) {
  // true quando a <img> do TMDB deu erro (404, rede…) — cai para o tipográfico
  const [imgFailed, setImgFailed] = useState(false)
  const hasImg = !!posterUrl && !imgFailed

  const p = PALETTES[palette || ''] || PALETTES.noir

  // Acessibilidade: pôster clicável se comporta como botão
  const clickProps = onClick
    ? {
        onClick,
        role: 'button' as const,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') onClick() },
      }
    : {}

  // Versão mini (usada nas pilhas de pôsteres dos cards de Listas)
  if (mini) {
    return (
      <div className={'ak-poster ak-mini' + (hasImg ? ' ak-has-img' : '')}
           style={{ background: p.bg, color: p.ink }} {...clickProps}>
        {hasImg && (
          <img className="ak-p-img" src={posterUrl!} alt={`Pôster de ${title}`}
               loading="lazy" onError={() => setImgFailed(true)} />
        )}
        <div className="ak-p-inner" />
        <div className="ak-p-mini-title">{title}</div>
      </div>
    )
  }

  // Título em Display dimensionado pelo comprimento (regra do handoff):
  // títulos longos descem de corpo para caber no campo do pôster
  const len = title.length
  const titleSize = len > 28 ? 16 : len > 18 ? 20 : len > 12 ? 25 : 30

  return (
    <div className={'ak-poster' + (hasImg ? ' ak-has-img' : '')}
         style={{ background: p.bg, color: p.ink }}
         aria-label={`Pôster de ${title}`} {...clickProps}>
      {/* Imagem real do TMDB — o CSS esconde a arte tipográfica quando presente */}
      {hasImg && (
        <img className="ak-p-img" src={posterUrl!} alt={`Pôster de ${title}`}
             loading="lazy" onError={() => setImgFailed(true)} />
      )}

      {/* Moldura interna do pôster tipográfico */}
      <div className="ak-p-inner" />

      {/* Badges de canto: quero ver + coração (sobre imagem OU tipográfico) */}
      {badge && (
        <div className="ak-p-badges">
          {status === 'watchlist' && <div className="ak-p-badge ak-want"><Icon name="watchlist" /> quero ver</div>}
          {liked && <div className="ak-p-heart"><Heart filled /></div>}
        </div>
      )}

      {/* Arte tipográfica: kicker (gênero) + título + rodapé diretor/ano */}
      <div className="ak-p-kicker">{(genre || '').split(' · ')[0]}</div>
      <div className="ak-p-title" style={{ fontSize: titleSize }}>{title}</div>
      <div className="ak-p-foot">
        <div className="ak-p-rule" />
        {director && <div className="ak-p-dir">{director}</div>}
        {year != null && <div className="ak-p-year">{year}</div>}
      </div>

      {/* Faixa de nota no rodapé (gradiente escurece a base para leitura) */}
      {showRating && !!rating && (
        <div className="ak-p-rating"><Stars value={rating} /></div>
      )}
    </div>
  )
}
