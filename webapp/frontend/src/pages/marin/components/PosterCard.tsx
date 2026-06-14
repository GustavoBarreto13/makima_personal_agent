// Pôster de anime com fallback tipográfico kawaii.
// Proporção: 2:3 (largura × 1.5 = altura) — padrão pôster anime.
// Fallback: gradiente OKLCH determinístico baseado no poster_key do anime.
// Hover: translateY(-5px) scale(1.015) + sombra poster (definido em marin.css).

import { useState } from 'react'
import type { PosterKey } from '../types'

interface PosterCardProps {
  // Título do anime (exibido no pôster tipográfico e no alt)
  title: string
  // URL do pôster externo (Jikan/TMDB). NULL → pôster tipográfico
  posterUrl: string | null | undefined
  // Paleta determinística para o fallback tipográfico
  posterKey: PosterKey | string | undefined
  // Clique no pôster → navegar ao detalhe
  onClick?: () => void
  // Slot de overlay (ex.: StatusChip sobre o pôster)
  children?: React.ReactNode
  className?: string
}

// 12 paletas OKLCH do design guide §2.9
// a = cor de topo, b = cor de base, ink = cor do texto sobre o pôster
const POSTER_PALETTES: Record<string, { a: string; b: string; ink: string }> = {
  magenta: { a: 'oklch(0.50 0.22 350)', b: 'oklch(0.30 0.16 320)', ink: 'oklch(0.97 0.03 350)' },
  violet:  { a: 'oklch(0.48 0.20 300)', b: 'oklch(0.29 0.14 280)', ink: 'oklch(0.97 0.02 300)' },
  cyan:    { a: 'oklch(0.60 0.16 210)', b: 'oklch(0.36 0.12 200)', ink: 'oklch(0.97 0.02 210)' },
  emerald: { a: 'oklch(0.58 0.15 160)', b: 'oklch(0.34 0.10 160)', ink: 'oklch(0.97 0.02 160)' },
  amber:   { a: 'oklch(0.68 0.16 80)',  b: 'oklch(0.40 0.12 74)',  ink: 'oklch(0.20 0.03 80)'  },
  sunset:  { a: 'oklch(0.60 0.18 28)',  b: 'oklch(0.38 0.14 20)',  ink: 'oklch(0.97 0.02 28)'  },
  indigo:  { a: 'oklch(0.48 0.18 268)', b: 'oklch(0.30 0.12 265)', ink: 'oklch(0.97 0.01 268)' },
  rose:    { a: 'oklch(0.62 0.20 10)',  b: 'oklch(0.40 0.14 350)', ink: 'oklch(0.97 0.02 10)'  },
  teal:    { a: 'oklch(0.56 0.13 185)', b: 'oklch(0.34 0.09 185)', ink: 'oklch(0.97 0.02 185)' },
  lime:    { a: 'oklch(0.66 0.16 128)', b: 'oklch(0.40 0.11 128)', ink: 'oklch(0.20 0.05 128)' },
  plum:    { a: 'oklch(0.44 0.16 330)', b: 'oklch(0.28 0.11 320)', ink: 'oklch(0.97 0.02 330)' },
  sky:     { a: 'oklch(0.62 0.14 238)', b: 'oklch(0.38 0.10 238)', ink: 'oklch(0.97 0.01 238)' },
}

// Paleta fallback quando a chave não é reconhecida
const DEFAULT_PALETTE = POSTER_PALETTES['cyan']

/**
 * Pôster de anime — imagem real ou pôster tipográfico kawaii.
 *
 * Estratégia:
 * 1. Tenta renderizar a imagem real (poster_url).
 * 2. Se a imagem falhar (404, rede, etc.) → cai para o tipográfico.
 * 3. Se poster_url é NULL desde o início → vai direto para o tipográfico.
 */
export function PosterCard({
  title,
  posterUrl,
  posterKey,
  onClick,
  children,
  className,
}: PosterCardProps) {
  // imgFailed=true quando a imagem externa retornou erro
  const [imgFailed, setImgFailed] = useState(false)

  // Decide o modo de exibição
  const showTypographic = !posterUrl || imgFailed

  // Paleta a usar no pôster tipográfico
  const palette = POSTER_PALETTES[posterKey ?? ''] ?? DEFAULT_PALETTE

  // Extrai "kicker" do título: 2–4 primeiras palavras em maiúsculas para o pôster tipográfico
  const words = title.trim().split(/\s+/)
  const kicker = words.slice(0, Math.min(3, words.length)).join(' ').toUpperCase()

  return (
    <div
      className={`mr-poster-card${className ? ' ' + className : ''}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
      aria-label={`Pôster de ${title}`}
    >
      {showTypographic ? (
        // ── Pôster tipográfico (fallback kawaii) ──────────────────────────────
        <div
          className="mr-typo-poster"
          style={{
            // Gradiente vertical da paleta
            background: `linear-gradient(160deg, ${palette.a} 0%, ${palette.b} 100%)`,
            color: palette.ink,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px',
            boxSizing: 'border-box',
            textAlign: 'center',
          }}
        >
          {/* Kicker — 2–3 palavras em display para preencher o espaço */}
          <p
            style={{
              fontFamily: 'var(--display, sans-serif)',
              // Tamanho dinâmico: títulos mais curtos ficam maiores
              fontSize: kicker.length <= 6 ? '2rem' : kicker.length <= 12 ? '1.4rem' : '1rem',
              fontWeight: 900,
              lineHeight: 1.1,
              color: palette.ink,
              wordBreak: 'break-word',
              hyphens: 'auto',
              margin: 0,
            }}
          >
            {kicker}
          </p>
          {/* Se o título for mais longo que o kicker, mostra o restante menor */}
          {words.length > 3 && (
            <p
              style={{
                fontFamily: 'var(--mono, monospace)',
                fontSize: '0.62rem',
                color: palette.ink,
                opacity: 0.65,
                marginTop: 4,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {words.slice(3).join(' ')}
            </p>
          )}
        </div>
      ) : (
        // ── Imagem real do anime ───────────────────────────────────────────────
        <img
          src={posterUrl!}
          alt={`Pôster de ${title}`}
          loading="lazy"
          onError={() => setImgFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}

      {/* Slot de overlay — ex.: StatusChip, badge "novo ep" */}
      {children && (
        <div className="mr-poster-overlay">{children}</div>
      )}
    </div>
  )
}
