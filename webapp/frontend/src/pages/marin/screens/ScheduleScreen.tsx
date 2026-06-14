// Tela de schedule — timeline de próximos episódios dos animes em andamento.
// Agrupa episódios por dia, mostra data em JST e BRT, badge "novo ep" se for hoje.
// Dados: marinApi.schedule(14) → episódios dos próximos 14 dias.

import { useState, useEffect } from 'react'
import { marinApi } from '../marinApi'
import type { ScheduleItem } from '../types'
import { PosterCard } from '../components/PosterCard'

interface ScheduleScreenProps {
  onSelectAnime: (id: string) => void
}

// Nomes dos dias da semana em português
const DAYS_PT = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']

// Nomes dos meses abreviados
const MONTHS_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

/**
 * Formata uma data ISO como "Quinta, 19 jun" em português.
 */
function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${DAYS_PT[d.getDay()]}, ${d.getDate()} ${MONTHS_PT[d.getMonth()]}`
}

/**
 * Verifica se a data é hoje (comparando apenas ano/mês/dia).
 */
function isToday(dateStr: string): boolean {
  const today = new Date()
  const d = new Date(dateStr + 'T12:00:00')
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  )
}

/**
 * ScheduleScreen — agenda de novos episódios dos próximos 14 dias.
 * Agrupa por dia com separadores visuais.
 */
export function ScheduleScreen({ onSelectAnime }: ScheduleScreenProps) {
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    marinApi.schedule(14)
      .then(res => setItems(res.schedule ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="mr-schedule-loading"><div className="mr-spinner" /></div>
  }

  if (items.length === 0) {
    return (
      <div className="mr-schedule-empty">
        <p>Nenhum episódio nos próximos 14 dias.</p>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 8 }}>
          Adicione animes em andamento para ver os próximos episódios aqui.
        </p>
      </div>
    )
  }

  // Agrupa episódios por data de exibição
  const grouped: Record<string, ScheduleItem[]> = {}
  items.forEach(item => {
    if (!item.aired) return
    // Usa apenas a parte de data (YYYY-MM-DD)
    const dateKey = item.aired.slice(0, 10)
    if (!grouped[dateKey]) grouped[dateKey] = []
    grouped[dateKey].push(item)
  })

  return (
    <div className="mr-schedule">
      <p className="mr-schedule-subtitle">
        Próximos episódios dos animes que você está assistindo
      </p>

      {Object.entries(grouped).map(([dateKey, dayItems]) => {
        const today = isToday(dateKey)
        const dateLabel = formatDateLabel(dateKey)

        return (
          <section key={dateKey} className="mr-schedule-day">
            {/* Cabeçalho do dia */}
            <div className={`mr-schedule-day-header${today ? ' mr-schedule-day-header--today' : ''}`}>
              <span className="mr-schedule-day-label">{dateLabel}</span>
              {today && <span className="mr-schedule-today-badge">Hoje</span>}
              <span className="mr-schedule-day-count">{dayItems.length} ep(s)</span>
            </div>

            {/* Episódios do dia */}
            <div className="mr-schedule-day-items">
              {dayItems.map((item, i) => (
                <div
                  key={i}
                  className="mr-schedule-item"
                  onClick={() => onSelectAnime(item.anime_id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') onSelectAnime(item.anime_id) }}
                >
                  {/* Thumbnail miniatura do anime */}
                  <PosterCard
                    title={item.anime_title}
                    posterUrl={item.poster_url}
                    posterKey={item.poster_key}
                    className="mr-schedule-poster"
                  />

                  {/* Informações do episódio */}
                  <div className="mr-schedule-info">
                    <p className="mr-schedule-anime">{item.anime_title}</p>
                    <p className="mr-schedule-ep">
                      Ep {item.episode_number}
                      {item.episode_title ? ` — ${item.episode_title}` : ''}
                    </p>

                    {/* Horários JST e BRT quando disponíveis */}
                    {item.aired && (
                      <div className="mr-schedule-times">
                        {/* Horário em JST (Tokyo) */}
                        <span className="mr-schedule-time mr-schedule-time--jst">
                          🇯🇵 {new Date(item.aired).toLocaleTimeString('pt-BR', {
                            timeZone: 'Asia/Tokyo',
                            hour: '2-digit',
                            minute: '2-digit',
                          })} JST
                        </span>
                        {/* Horário em BRT (São Paulo) */}
                        <span className="mr-schedule-time mr-schedule-time--brt">
                          🇧🇷 {new Date(item.aired).toLocaleTimeString('pt-BR', {
                            timeZone: 'America/Sao_Paulo',
                            hour: '2-digit',
                            minute: '2-digit',
                          })} BRT
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Badge de "novo ep" se for hoje ou já foi ao ar */}
                  {today && (
                    <span className="mr-schedule-new-badge">novo ep</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
