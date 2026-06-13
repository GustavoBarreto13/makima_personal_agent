// Componente de pôster de filme.
// Exibe a imagem real do TMDB quando disponível (poster_url).
// Exibe o pôster TIPOGRÁFICO (título + cor de paleta) quando poster_url é NULL (SC-011).
// O pôster tipográfico usa a paleta determinística calculada no backend (poster_palette).

import { useState } from 'react'

interface PosterProps {
  /** Título do filme — exibido no pôster tipográfico e no alt da imagem. */
  title: string
  /** URL do pôster TMDB (w500). NULL → usa o pôster tipográfico. */
  posterUrl: string | null
  /** Paleta para o pôster tipográfico (uma das 14: 'noir', 'ember', etc.). */
  palette: string
  /** Ano de lançamento (exibido abaixo do título no pôster tipográfico). */
  year?: number | null
  /** Classe CSS adicional aplicada ao container externo. */
  className?: string
  /** Callback ao clicar no pôster. */
  onClick?: () => void
}

/**
 * Pôster do filme.
 *
 * Estratégia (decisão da fatia — SC-011):
 * 1. Tenta renderizar <img> com poster_url (TMDB).
 * 2. Se a imagem falhar ao carregar (404, rede, etc.), cai para o tipográfico.
 * 3. Se poster_url é NULL desde o início, vai direto para o tipográfico.
 */
export function Poster({ title, posterUrl, palette, year, className, onClick }: PosterProps) {
  // imgFailed=true quando a imagem TMDB retorna erro (ex.: URL expirada, fora do ar)
  const [imgFailed, setImgFailed] = useState(false)

  // Decide qual modo exibir: imagem TMDB ou pôster tipográfico
  const showTypographic = !posterUrl || imgFailed

  return (
    // Container com proporção 2:3 (padrão pôster cinematográfico)
    <div
      className={`ak-poster-card${className ? ' ' + className : ''}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick() } : undefined}
      aria-label={`Pôster de ${title}`}
    >
      {showTypographic ? (
        /* ── Pôster tipográfico (fallback) ──────────────────────────────── */
        /* Usa data-palette para selecionar as cores declaradas no CSS       */
        <div className="ak-typo-poster" data-palette={palette}>
          {/* Título em Display — quebra o texto para caber no pôster */}
          <p className="ak-typo-title">{title}</p>
          {/* Ano em mono discreto */}
          {year && (
            <p style={{
              fontFamily: 'var(--mono)',
              fontSize: '11px',
              color: 'var(--t, oklch(0.9 0.01 330))',
              opacity: 0.6,
              marginTop: '4px',
              position: 'relative',
              zIndex: 1,
            }}>
              {year}
            </p>
          )}
        </div>
      ) : (
        /* ── Imagem real do TMDB ──────────────────────────────────────────── */
        <img
          src={posterUrl!}
          alt={`Pôster de ${title}`}
          loading="lazy"                        // Lazy loading para performance no grid
          onError={() => setImgFailed(true)}    // Cai para tipográfico se a imagem falhar
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
    </div>
  )
}
