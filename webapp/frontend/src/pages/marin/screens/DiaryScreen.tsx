// Tela de diário — histórico de sessões em ordem cronológica decrescente.
// Agrupado por mês/ano com cabeçalho em DM Serif Display.
// Cada entrada usa grid: data (dia/semana) · poster · info · nota · botão remover.

import { useState, useEffect } from 'react'
import { marinApi } from '../marinApi'
import type { WatchLog } from '../types'
import { PosterCard } from '../components/PosterCard'
import { Score }      from '../components/Score'

interface DiaryScreenProps {
  onSelectAnime: (id: string) => void
  onLog?: () => void  // abre o LogModal sem pré-seleção
}

interface DiaryEntryProps {
  // Log de sessão a exibir
  log: WatchLog
  // Callback para remover a entrada do diário
  onDelete: (id: string) => void
  // Callback para navegar ao detalhe do anime
  onSelect: (id: string) => void
}

/**
 * DiaryEntry — linha individual do diário.
 * Grid: coluna de data | pôster | info | score | botão remover.
 */
function DiaryEntry({ log, onDelete, onSelect }: DiaryEntryProps) {
  // Constrói o objeto Date com horário ao meio-dia para evitar drift de timezone
  const d = log.watched_date ? new Date(log.watched_date + 'T12:00:00') : null

  // Número do dia (ex.: 15)
  const dayNum = d ? d.getDate() : ''

  // Dia da semana abreviado em pt-BR (ex.: "seg")
  const weekday = d
    ? d.toLocaleDateString('pt-BR', { weekday: 'short' })
    : ''

  return (
    <div className="mr-diary-entry">
      {/* Coluna de data: número grande + dia da semana */}
      <div className="mr-diary-date-col">
        <span className="mr-diary-day">{dayNum}</span>
        <span className="mr-diary-weekday">{weekday}</span>
      </div>

      {/* Mini pôster clicável que navega para o detalhe */}
      <div
        className="mr-diary-poster-col"
        style={{ width: 40, height: 56, cursor: 'pointer' }}
        onClick={() => onSelect(log.anime_id)}
      >
        <PosterCard
          title={log.anime_title ?? ''}
          posterUrl={log.poster_url}
          posterKey={log.poster_key}
        />
      </div>

      {/* Informações da sessão: título, episódios, notas */}
      <div className="mr-diary-info-col">
        <p
          className="mr-diary-anime-title"
          onClick={() => onSelect(log.anime_id)}
          style={{ cursor: 'pointer' }}
        >
          {log.anime_title}
        </p>

        {/* Intervalo de episódios da sessão */}
        {(log.ep_start || log.ep_end) && (
          <p className="mr-diary-ep-range">
            {log.ep_start
              ? `Ep ${log.ep_start}${log.ep_end && log.ep_end !== log.ep_start ? `–${log.ep_end}` : ''}`
              : ''}
            {log.episodes_count && log.episodes_count > 1
              ? ` · ${log.episodes_count} ep`
              : ''}
          </p>
        )}

        {/* Observações da sessão em itálico */}
        {log.notes && (
          <p className="mr-diary-note">{log.notes}</p>
        )}
      </div>

      {/* Score da sessão (visível só quando existe avaliação) */}
      {log.rating && log.rating > 0 ? (
        <div className="mr-diary-score-col">
          <Score score={log.rating} variant="compact" />
        </div>
      ) : (
        // Placeholder vazio para manter o grid alinhado quando não há nota
        <div className="mr-diary-score-col" />
      )}

      {/* Botão de remover — aparece no hover via CSS */}
      <button
        className="mr-diary-delete"
        onClick={() => onDelete(log.id)}
        aria-label="Remover entrada do diário"
        title="Remover entrada"
      >
        {/* Ícone ✕ simples via SVG inline */}
        <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" width={14} height={14}>
          <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  )
}

/**
 * DiaryScreen — diário cronológico de sessões de episódios.
 * Agrupado por mês/ano com cabeçalho em DM Serif Display e contagem de sessões.
 */
export function DiaryScreen({ onSelectAnime, onLog }: DiaryScreenProps) {
  const [logs, setLogs] = useState<WatchLog[]>([])
  const [loading, setLoading] = useState(true)

  // Carrega as últimas 100 sessões ao montar a tela
  useEffect(() => {
    marinApi.diary(100)
      .then(res => setLogs(res.logs ?? []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [])

  /**
   * Remove um log do estado local (sem recarregar tudo).
   * A deleção na API é disparada por quem chamar onDelete.
   */
  async function handleDelete(logId: string) {
    try {
      // Chama a API para deletar o log no backend
      await marinApi.deleteLog(logId)
      // Atualiza o estado local removendo a entrada deletada
      setLogs(prev => prev.filter(l => l.id !== logId))
    } catch {
      // Falha silenciosa — o log permanece na lista
    }
  }

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

  // ── Agrupa os logs por "Mês / Ano" em pt-BR (ex.: "junho / 2026") ──────────
  const byMonth: Record<string, WatchLog[]> = {}
  for (const log of logs) {
    if (!log.watched_date) continue

    // Formata a chave como "junho / 2026" usando Intl (pt-BR)
    // T12:00:00 evita drift de fuso horário que inverteria o dia
    const raw = new Date(log.watched_date + 'T12:00:00').toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    })
    // toLocaleDateString retorna "junho de 2026" em pt-BR → transforma para "junho / 2026"
    const key = raw.replace(' de ', ' / ')

    if (!byMonth[key]) byMonth[key] = []
    byMonth[key].push(log)
  }

  // Converte para array de pares [label, logs[]] mantendo a ordem de inserção
  const months = Object.entries(byMonth)

  return (
    <div className="mr-diary">
      {months.map(([month, monthLogs]) => (
        // Seção mensal: cabeçalho DM Serif + lista de entradas
        <section key={month} className="mr-diary-month">
          {/* Cabeçalho do mês: "junho / 2026 · 5" */}
          <h2 className="mr-diary-month-title">
            {month} · {monthLogs.length}
          </h2>

          {/* Lista de entradas do mês */}
          <div className="mr-diary-list">
            {monthLogs.map(log => (
              <DiaryEntry
                key={log.id}
                log={log}
                onDelete={handleDelete}
                onSelect={onSelectAnime}
              />
            ))}
          </div>
        </section>
      ))}

      {/* FAB para nova sessão — fixo no canto inferior direito */}
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
