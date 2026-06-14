// UpcomingScreen — episódios futuros de séries "assistindo" agrupados por data.

import { useState, useEffect } from 'react'
import type { UpcomingEpisode } from '../types'
import { maiApi } from '../maiApi'

interface Props {
  onNav: (view: string, param?: string) => void
}

/** Agrupa episódios por data. */
function groupByDate(eps: UpcomingEpisode[]): { date: string; label: string; eps: UpcomingEpisode[] }[] {
  const today = new Date().toISOString().slice(0, 10)
  const groups: Record<string, UpcomingEpisode[]> = {}
  for (const ep of eps) {
    if (!groups[ep.air_date]) groups[ep.air_date] = []
    groups[ep.air_date].push(ep)
  }
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, eps]) => {
      const d = new Date(date + 'T00:00:00')
      const label = date === today
        ? 'Hoje'
        : d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
      return { date, label, eps }
    })
}

/** UpcomingScreen — schedule de lançamentos. */
export function UpcomingScreen({ onNav }: Props) {
  const [upcoming, setUpcoming] = useState<UpcomingEpisode[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    maiApi.upcoming()
      .then(res => setUpcoming((res as any).upcoming ?? []))
      .catch(() => setUpcoming([]))
      .finally(() => setLoading(false))
  }, [])

  const groups = groupByDate(upcoming)

  return (
    <div className="page" style={{ paddingTop: 28 }}>
      {loading && <div className="empty-state">Carregando…</div>}

      {!loading && upcoming.length === 0 && (
        <div className="empty-state">
          Nenhum episódio agendado para séries que você está assistindo. 🌙
        </div>
      )}

      {groups.map(({ date, label, eps }) => {
        const isToday = date === new Date().toISOString().slice(0, 10)
        return (
          <div key={date} className="sched-day">
            <div className="sched-day-label">
              <span className={`sdl-name${isToday ? ' today' : ''}`}>{label}</span>
              <span className="sdl-rule" />
              <span className="sdl-count">{eps.length} ep{eps.length > 1 ? 's' : ''}</span>
            </div>

            {eps.map((ep, i) => (
              <div
                key={i}
                className="sched-card"
                onClick={() => onNav('detail', ep.series_id)}
              >
                <div className="sched-still">
                  {ep.still_url
                    ? <img src={ep.still_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
                    : <span className="fbs-ico">📺</span>
                  }
                </div>
                <div className="sched-info">
                  <div className="sched-title">{ep.series_title}</div>
                  <div className="sched-ep">
                    T{ep.season_number} E{String(ep.episode_number).padStart(2, '0')}
                    {ep.title ? ` · ${ep.title}` : ''}
                  </div>
                </div>
                {isToday && <div className="sched-badge">HOJE</div>}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
