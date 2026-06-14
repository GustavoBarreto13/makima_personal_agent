// WatchlistScreen — lista de séries com status 'quero_assistir'.
// Layout: lista vertical com poster 56px + info + ações.

import { useState, useEffect } from 'react'
import type { Series } from '../types'
import { maiApi } from '../maiApi'
import { PosterCard } from '../components/PosterCard'

interface Props {
  onNav: (view: string, param?: string) => void
  onOpenAdd: () => void
}

/** WatchlistScreen — séries marcadas como "quero assistir". */
export function WatchlistScreen({ onNav, onOpenAdd }: Props) {
  const [series,  setSeries]  = useState<Series[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    maiApi.watchlist()
      .then(res => setSeries((res as any).series ?? []))
      .catch(() => setSeries([]))
      .finally(() => setLoading(false))
  }, [])

  async function startWatching(s: Series) {
    await maiApi.updateStatus(s.id, { status: 'assistindo' })
    setSeries(prev => prev.filter(x => x.id !== s.id))
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ink-3)' }}>
          {series.length} séries na watchlist
        </div>
        <button className="btn btn-primary" style={{ padding: '9px 14px' }} onClick={onOpenAdd}>
          + Adicionar
        </button>
      </div>

      {loading && <div className="empty-state" style={{ marginTop: 48 }}>Carregando…</div>}

      {!loading && series.length === 0 && (
        <div className="empty-state" style={{ marginTop: 48 }}>
          Nenhuma série na watchlist. 🐰
        </div>
      )}

      {!loading && (
        <div className="wl-list">
          {series.map(s => {
            const year = s.first_air_date
              ? new Date(s.first_air_date + 'T00:00:00').getFullYear()
              : null

            return (
              <div key={s.id} className="wl-item">
                {/* Poster mini */}
                <div className="wl-poster" onClick={() => onNav('detail', s.id)}>
                  <PosterCard series={s} width={56} />
                </div>

                {/* Info */}
                <div className="wl-info">
                  <div
                    className="wl-title"
                    onClick={() => onNav('detail', s.id)}
                  >
                    {s.title}
                  </div>
                  <div className="wl-sub">
                    {s.network && `${s.network}`}
                    {year && ` · ${year}`}
                    {s.seasons_count && ` · ${s.seasons_count} temporadas`}
                  </div>
                  {s.genres && s.genres.length > 0 && (
                    <div className="wl-genres">
                      {s.genres.slice(0, 3).map(g => (
                        <span key={g} className="wl-genre">{g}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Ações */}
                <div className="wl-right">
                  <button
                    className="btn btn-primary"
                    style={{ padding: '8px 14px', fontSize: 12 }}
                    onClick={() => startWatching(s)}
                  >
                    Assistir
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
