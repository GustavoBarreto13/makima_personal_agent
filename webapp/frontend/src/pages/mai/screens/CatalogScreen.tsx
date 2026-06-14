// CatalogScreen — grid de pôsteres com filtros de status e gênero.

import { useState, useEffect } from 'react'
import type { Series, MaiStatus } from '../types'
import { maiApi } from '../maiApi'
import { PosterCard } from '../components/PosterCard'
import { StatusChip, STATUS_LABELS } from '../components/StatusChip'
import { Stars } from '../components/Stars'

const STATUS_CHIPS: { id: MaiStatus | 'all'; label: string }[] = [
  { id: 'all',           label: 'Todas' },
  { id: 'assistindo',    label: 'Assistindo' },
  { id: 'concluida',     label: 'Concluídas' },
  { id: 'quero_assistir',label: 'Quero assistir' },
  { id: 'pausada',       label: 'Pausadas' },
  { id: 'abandonada',    label: 'Abandonadas' },
]

interface Props {
  /** Status inicial pré-selecionado (ex.: vindo da HomeScreen). */
  initialStatus?: MaiStatus
  onNav: (view: string, param?: string) => void
}

/** CatalogScreen — grid filtrado com pôsteres 2:3. */
export function CatalogScreen({ initialStatus, onNav }: Props) {
  const [statusFilter, setStatusFilter] = useState<MaiStatus | 'all'>(initialStatus ?? 'all')
  const [series, setSeries]             = useState<Series[]>([])
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    setLoading(true)
    maiApi.list(statusFilter === 'all' ? undefined : statusFilter)
      .then(res => setSeries((res as any).series ?? []))
      .catch(() => setSeries([]))
      .finally(() => setLoading(false))
  }, [statusFilter])

  return (
    <div className="page">
      {/* ── Toolbar: chips de filtro ──────────────────────────────────────── */}
      <div className="cat-toolbar" style={{ marginTop: 28 }}>
        <div className="chips">
          {STATUS_CHIPS.map(c => (
            <button
              key={c.id}
              className={`chip${statusFilter === c.id ? ' active' : ''}`}
              onClick={() => setStatusFilter(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="toolbar-spacer" />
        <span className="result-count">{series.length} séries</span>
      </div>

      {/* ── Grid de pôsteres ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="empty-state" style={{ marginTop: 48 }}>Carregando…</div>
      ) : series.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 48 }}>
          Nenhuma série {statusFilter !== 'all' ? `com status "${STATUS_LABELS[statusFilter as MaiStatus]}"` : 'no catálogo'}.
        </div>
      ) : (
        <div className="poster-grid" style={{ marginTop: 24 }}>
          {series.map(s => (
            <div
              key={s.id}
              className="poster-link"
              onClick={() => onNav('detail', s.id)}
            >
              <PosterCard series={s} />
              <div className="poster-meta">
                <div className="pm-title">{s.title}</div>
                <div className="pm-sub">
                  {s.rating && (
                    <span className="sc">
                      <Stars rating={s.rating} size="sm" />
                      {s.rating.toFixed(1)}
                    </span>
                  )}
                  {s.first_air_date && (
                    <span>{new Date(s.first_air_date + 'T00:00:00').getFullYear()}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
