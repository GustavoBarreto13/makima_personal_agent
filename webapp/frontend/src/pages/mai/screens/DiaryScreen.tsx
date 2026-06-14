// DiaryScreen — diário de sessões cronológico com agrupamento por mês.
// Grid por linha: data 52px | poster 46px | meta 1fr | nota.

import { useState, useEffect } from 'react'
import type { WatchLog } from '../types'
import { maiApi } from '../maiApi'
import { Stars } from '../components/Stars'

interface Props {
  onNav: (view: string, param?: string) => void
  onOpenLog: () => void
}

/** Agrupa uma lista de logs por mês (ex.: "Junho 2026"). */
function groupByMonth(logs: WatchLog[]): { label: string; logs: WatchLog[] }[] {
  const groups: Record<string, WatchLog[]> = {}
  for (const log of logs) {
    const d = new Date(log.watched_date + 'T00:00:00')
    const key = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    if (!groups[key]) groups[key] = []
    groups[key].push(log)
  }
  return Object.entries(groups).map(([label, logs]) => ({ label, logs }))
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** DiaryScreen — histórico de sessões agrupado por mês. */
export function DiaryScreen({ onNav, onOpenLog }: Props) {
  const [logs,    setLogs]    = useState<WatchLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    maiApi.diary(80)
      .then(res => setLogs((res as any).logs ?? []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [])

  const groups = groupByMonth(logs)

  return (
    <div className="page">
      {/* Botão de nova sessão no topbar (via callback) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ink-3)' }}>
          {logs.length} sessões registradas
        </div>
        <button className="btn btn-primary" style={{ padding: '9px 14px' }} onClick={onOpenLog}>
          + Registrar sessão
        </button>
      </div>

      {loading && <div className="empty-state" style={{ marginTop: 48 }}>Carregando…</div>}

      {!loading && logs.length === 0 && (
        <div className="empty-state" style={{ marginTop: 48 }}>
          Nenhuma sessão registrada ainda. 📺
        </div>
      )}

      {groups.map(({ label, logs: monthLogs }) => (
        <div key={label} className="diary-month">
          <div className="diary-month-label">
            <span className="dm-name">{label}</span>
            <span className="dm-count">{monthLogs.length} sessões</span>
          </div>

          {monthLogs.map(log => {
            const d  = new Date(log.watched_date + 'T00:00:00')
            const day = d.getDate()
            const wd  = WEEKDAYS[d.getDay()]

            // Constrói a descrição dos eps assistidos
            let epsLabel = ''
            if (log.season_number && log.ep_start) {
              const end = log.ep_end && log.ep_end !== log.ep_start ? `–${log.ep_end}` : ''
              epsLabel = `T${log.season_number} E${String(log.ep_start).padStart(2,'0')}${end}`
            } else if (log.episodes_count) {
              epsLabel = `${log.episodes_count} ep${log.episodes_count > 1 ? 's' : ''}`
            }

            return (
              <div
                key={log.id}
                className="diary-row"
                onClick={() => onNav('detail', log.series_id)}
              >
                {/* Data */}
                <div className="dr-day">
                  <div className="d-num">{day}</div>
                  <div className="d-wd">{wd}</div>
                </div>

                {/* Poster mini */}
                <div className="dr-poster" />

                {/* Meta: título + eps + review */}
                <div className="dr-main">
                  <div className="dr-title">{log.series_title}</div>
                  {epsLabel && <div className="dr-eps">{epsLabel}</div>}
                  {log.review && <div className="dr-note">{log.review}</div>}
                </div>

                {/* Nota */}
                <div className="dr-marks">
                  {log.rating && <Stars rating={log.rating} size="sm" />}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
