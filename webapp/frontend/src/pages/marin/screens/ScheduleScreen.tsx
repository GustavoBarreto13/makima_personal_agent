// Tela de schedule — timeline de próximos episódios dos animes em andamento.
// Fase 5: agrupa por dia com label relativo (relFuture), card com horário JST/BRT
// e badge "NOVO EP" em cyan destacado quando o episódio vai ao ar hoje.

import { useState, useEffect } from 'react'
import { marinApi } from '../marinApi'
import type { ScheduleItem } from '../types'
import { PosterCard } from '../components/PosterCard'

interface ScheduleScreenProps {
  onSelectAnime: (id: string) => void
}

/**
 * relFuture — retorna um label relativo para a data.
 * "Hoje", "Amanhã" ou dia da semana + data por extenso em pt-BR.
 *
 * @param dateStr - Data no formato 'YYYY-MM-DD'
 * @returns Label em português (ex.: "Hoje", "Amanhã", "quinta-feira, 19 jun")
 */
function relFuture(dateStr: string): string {
  // Data de hoje zerada para comparação apenas por dia
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  // Data do episódio também zerada (T00:00:00 evita drift)
  const data = new Date(dateStr + 'T00:00:00')
  data.setHours(0, 0, 0, 0)

  // Diferença em dias (0 = hoje, 1 = amanhã, etc.)
  const diff = Math.round((data.getTime() - hoje.getTime()) / 86_400_000)

  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'

  // Para demais dias: "quinta-feira, 19 jun"
  return data.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
}

/**
 * ScheduleCard — card de um episódio no schedule.
 * Exibe pôster, título, número do ep, horários JST/BRT e badge "NOVO EP" se for hoje.
 */
function ScheduleCard({
  item,
  onSelect,
}: {
  item: ScheduleItem
  onSelect: (id: string) => void
}) {
  // Verifica se o episódio vai ao ar hoje (compara apenas a data, sem hora)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const airDate = new Date(item.aired.slice(0, 10) + 'T00:00:00')
  airDate.setHours(0, 0, 0, 0)
  const isNew = airDate.getTime() === today.getTime()

  // O campo `aired` pode conter datetime completo (ex.: "2026-06-15T15:30:00+09:00")
  // ou apenas data (ex.: "2026-06-15"). Tenta extrair os horários JST/BRT quando possível.
  const hasTime = item.aired.length > 10  // tem hora além da data

  // Hora em JST (Tokyo) — extraída quando o campo aired contém um datetime completo
  const jstTime = hasTime
    ? new Date(item.aired).toLocaleTimeString('pt-BR', {
        timeZone: 'Asia/Tokyo',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  // Hora em BRT (São Paulo)
  const brtTime = hasTime
    ? new Date(item.aired).toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <div
      className="mr-sched-card"
      onClick={() => onSelect(item.anime_id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onSelect(item.anime_id) }}
    >
      {/* Mini pôster do anime (46×64px via wrapper com tamanho fixo) */}
      <div style={{ width: 46, height: 64, flexShrink: 0 }}>
        <PosterCard
          title={item.anime_title}
          posterUrl={item.poster_url}
          posterKey={item.poster_key}
        />
      </div>

      {/* Informações do episódio */}
      <div className="mr-sched-info">
        {/* Título do anime */}
        <p className="mr-sched-anime-title">{item.anime_title}</p>

        {/* Número e título do episódio */}
        <p className="mr-sched-ep">
          Ep {item.episode_number}
          {item.episode_title ? ` · ${item.episode_title}` : ''}
        </p>

        {/* Horários JST e BRT — exibidos quando o campo aired tem precisão de hora */}
        {(jstTime || brtTime) && (
          <p className="mr-sched-times">
            {jstTime && <span>⏰ {jstTime} JST</span>}
            {brtTime && <span> · {brtTime} BRT</span>}
          </p>
        )}
      </div>

      {/* Badge "NOVO EP" em cyan quando o episódio vai ao ar hoje */}
      {isNew && <span className="mr-sched-badge">NOVO EP</span>}
    </div>
  )
}

/**
 * ScheduleScreen — agenda de novos episódios dos próximos 14 dias.
 * Agrupa por dia com label relativo (Hoje / Amanhã / dia da semana + data).
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

  // ── Agrupa episódios por data de exibição (YYYY-MM-DD) ──────────────────────
  const byDay: Record<string, ScheduleItem[]> = {}
  for (const item of items) {
    if (!item.aired) continue
    // Usa apenas os 10 primeiros chars (YYYY-MM-DD) como chave
    const key = item.aired.slice(0, 10)
    if (!byDay[key]) byDay[key] = []
    byDay[key].push(item)
  }

  // Ordena os dias cronologicamente (comparação lexicográfica de 'YYYY-MM-DD' funciona)
  const days = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="mr-schedule">
      <p className="mr-schedule-subtitle">
        Próximos episódios dos animes que você está assistindo
      </p>

      {days.map(([dateKey, dayItems]) => (
        // Seção por dia: label relativo + cards de episódios
        <section key={dateKey} className="mr-sched-day">
          {/* Cabeçalho do dia: "Hoje 3 ep" / "Amanhã 1 ep" / "quinta-feira, 19 jun 2 ep" */}
          <h2 className="mr-sched-day-label">
            {relFuture(dateKey)}
            <span className="mr-sched-day-count">{dayItems.length} ep</span>
          </h2>

          {/* Cards dos episódios deste dia */}
          {dayItems.map(item => (
            <ScheduleCard
              key={`${item.anime_id}-${item.episode_number}`}
              item={item}
              onSelect={onSelectAnime}
            />
          ))}
        </section>
      ))}
    </div>
  )
}
