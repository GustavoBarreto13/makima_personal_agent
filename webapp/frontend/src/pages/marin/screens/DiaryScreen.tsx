// Tela de diário — histórico de sessões em ordem cronológica decrescente.
// Agrupado por mês (ex.: "Junho 2026", "Maio 2026").
// Cada entrada: mini-pôster + dia-da-semana/dia + anime + eps + nota.

import { useState, useEffect } from 'react'
import { marinApi } from '../marinApi'
import type { WatchLog } from '../types'
import { PosterCard } from '../components/PosterCard'
import { Score }      from '../components/Score'

interface DiaryScreenProps {
  onSelectAnime: (id: string) => void
  onLog?: () => void  // abre o LogModal sem pré-seleção
}

// Nomes dos meses em português
const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

// Dias da semana abreviados (começando por domingo)
const WEEKDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

/**
 * DiaryScreen — diário cronológico de sessões de episódios.
 * Agrupado por mês/ano, com separadores visuais entre grupos.
 */
export function DiaryScreen({ onSelectAnime, onLog }: DiaryScreenProps) {
  const [logs, setLogs] = useState<WatchLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    marinApi.diary(100)
      .then(res => setLogs(res.logs ?? []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="mr-diary-loading"><div className="mr-spinner" /></div>
  }

  if (logs.length === 0) {
    return (
      <div className="mr-diary-empty">
        <p>Nenhuma sessão registrada ainda.</p>
        {onLog && (
          <button className="mr-btn mr-btn--primary" onClick={onLog}>
            Logar primeira sessão
          </button>
        )}
      </div>
    )
  }

  // Agrupa logs por "Mês Ano" (ex.: "Junho 2026")
  const grouped: Record<string, WatchLog[]> = {}
  logs.forEach(log => {
    if (!log.watched_date) return
    const d = new Date(log.watched_date + 'T12:00:00')  // evita drift de timezone
    const key = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(log)
  })

  return (
    <div className="mr-diary">
      {Object.entries(grouped).map(([monthLabel, monthLogs]) => (
        <section key={monthLabel} className="mr-diary-group">
          {/* Separador de mês */}
          <div className="mr-diary-month-sep">
            <span className="mr-diary-month-label">{monthLabel}</span>
            <span className="mr-diary-month-count">{monthLogs.length} sessão(ões)</span>
          </div>

          {/* Entradas do mês */}
          {monthLogs.map(log => {
            const d = log.watched_date ? new Date(log.watched_date + 'T12:00:00') : null
            const dayName = d ? WEEKDAYS[d.getDay()] : ''
            const dayNum  = d ? d.getDate() : ''

            return (
              <div key={log.id} className="mr-diary-entry">
                {/* Coluna de data */}
                <div className="mr-diary-date">
                  <span className="mr-diary-weekday">{dayName}</span>
                  <span className="mr-diary-day">{dayNum}</span>
                </div>

                {/* Mini pôster */}
                <PosterCard
                  title={log.anime_title}
                  posterUrl={log.poster_url}
                  posterKey={log.poster_key}
                  onClick={() => onSelectAnime(log.anime_id)}
                  className="mr-diary-poster"
                />

                {/* Informações da sessão */}
                <div className="mr-diary-info">
                  <p
                    className="mr-diary-anime-title"
                    onClick={() => onSelectAnime(log.anime_id)}
                    style={{ cursor: 'pointer' }}
                  >
                    {log.anime_title}
                  </p>

                  {/* Episódios assistidos na sessão */}
                  {log.ep_start && log.ep_end && (
                    <p className="mr-diary-eps">
                      {log.ep_start === log.ep_end
                        ? `Ep ${log.ep_start}`
                        : `Eps ${log.ep_start}–${log.ep_end}`}
                      {log.episodes_count && log.episodes_count > 1
                        ? ` (${log.episodes_count} eps)`
                        : ''}
                    </p>
                  )}

                  {/* Nota da sessão */}
                  {log.rating && log.rating > 0 && (
                    <Score score={log.rating} variant="compact" />
                  )}

                  {/* Notas textuais */}
                  {log.notes && (
                    <p className="mr-diary-notes">{log.notes}</p>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      ))}

      {/* FAB para nova sessão */}
      {onLog && (
        <button
          className="mr-fab"
          onClick={onLog}
          aria-label="Logar nova sessão"
          title="Logar nova sessão"
        >
          +
        </button>
      )}
    </div>
  )
}
