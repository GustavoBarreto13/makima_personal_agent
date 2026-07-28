// Barra "Próxima sessão" — porte do NextBar do design handoff (akane/logmodal.jsx).
// Rodapé full-width do shell que ajuda a planejar a próxima sessão da watchlist:
// pôster + título/diretor/ano/duração, setas para alternar entre os "quero ver"
// e o botão "Já vi" que abre o LogModal já pré-selecionado.
// Some por completo quando a watchlist está vazia (regra do handoff).

import { useState } from 'react'
import type { Movie } from '../types'
import { Icon } from '../ui/Icon'
import { Poster } from './Poster'
import { fmtRuntime } from '../dateUtils'

interface NextBarProps {
  /** Filmes da watchlist (dados reais vindos do shell via akaneApi.watchlist). */
  watchlist: Movie[]
  /** Navegar para o detalhe do filme. */
  onOpenDetail: (id: string) => void
  /** Abrir o LogModal pré-preenchido com o filme ("Já vi"). */
  onLog: (id: string, title: string) => void
}

/** Exibir a barra de rodapé com a próxima sessão planejada. */
export function NextBar({ watchlist, onOpenDetail, onLog }: NextBarProps) {
  // Índice do filme em destaque — as setas ciclam a watchlist inteira
  const [idx, setIdx] = useState(0)

  if (watchlist.length === 0) return null
  const f = watchlist[idx % watchlist.length]

  return (
    <div className="footbar">
      <span className="fb-label">Próxima sessão</span>
      {/* Pôster mini (o CSS .footbar .poster fixa a largura em 40px) */}
      <Poster
        title={f.title}
        posterUrl={f.poster_url}
        palette={f.poster_palette}
        genre={f.genres?.[0] ?? null}
        director={f.director?.[0] ?? null}
        year={f.year}
        onClick={() => onOpenDetail(f.id)}
      />
      <div className="footbar-info">
        <div className="footbar-title" onClick={() => onOpenDetail(f.id)}>{f.title}</div>
        <div className="footbar-sub">
          {[f.director?.[0], f.year, f.runtime ? fmtRuntime(f.runtime) : null]
            .filter(Boolean).join(' · ')}
        </div>
      </div>
      {watchlist.length > 1 && (
        <div className="footbar-switch">
          <button onClick={() => setIdx(i => (i - 1 + watchlist.length) % watchlist.length)} aria-label="Anterior"><Icon name="chevL" /></button>
          <button onClick={() => setIdx(i => (i + 1) % watchlist.length)} aria-label="Próximo"><Icon name="chevR" /></button>
        </div>
      )}
      <div className="footbar-actions">
        <button className="btn btn-primary" onClick={() => onLog(f.id, f.title)} style={{ padding: '9px 16px' }}>
          <Icon name="check" /> Já vi
        </button>
      </div>
    </div>
  )
}
