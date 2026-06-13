// Tela do diário — lista cronológica de sessões, agrupada por mês.
// Cada sessão é uma linha com pôster minúsculo, data, título, nota e badge de rewatch.

import { useState, useEffect } from 'react'
import { akaneApi } from '../akaneApi'
import type { DiaryEntry } from '../types'
import { Stars } from '../components/Stars'

interface DiaryScreenProps {
  /** Callback ao clicar em uma entrada para abrir o detalhe do filme. */
  onSelectMovie: (movieId: string) => void
}

/** Formata uma data ISO (YYYY-MM-DD) para rótulo de mês (ex.: "junho 2026"). */
function formatMonth(isoDate: string): string {
  try {
    const d = new Date(isoDate + 'T12:00:00')   // Adiciona hora para evitar problemas de fuso
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  } catch {
    return isoDate.slice(0, 7)
  }
}

/** Formata uma data ISO (YYYY-MM-DD) para o dia do mês (ex.: "13"). */
function formatDay(isoDate: string): string {
  try {
    return new Date(isoDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  } catch {
    return isoDate.slice(5)
  }
}

/** Agrupa entradas do diário por mês (YYYY-MM). */
function groupByMonth(entries: DiaryEntry[]): Array<{ month: string; entries: DiaryEntry[] }> {
  const map = new Map<string, DiaryEntry[]>()
  for (const entry of entries) {
    // Chave = "YYYY-MM" (primeiros 7 chars da data ISO)
    const key = entry.watched_date.slice(0, 7)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(entry)
  }
  // Retorna em ordem decrescente (mais recente primeiro)
  return Array.from(map.entries()).map(([, entries]) => ({
    month: formatMonth(entries[0].watched_date),
    entries,
  }))
}

/**
 * Diário de sessões — cronológico, agrupado por mês.
 */
export function DiaryScreen({ onSelectMovie }: DiaryScreenProps) {
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Busca as 100 sessões mais recentes na montagem
  useEffect(() => {
    akaneApi.diary(100)
      .then(res => setEntries(res.entries))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div style={{
          width: 32, height: 32,
          border: '2px solid var(--line)',
          borderTopColor: 'var(--rose)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="ak-empty">
        <span className="ak-empty-icon">📅</span>
        <p className="ak-empty-title">Diário vazio</p>
        <p className="ak-empty-sub">Registre sua primeira sessão clicando em "Logar filme".</p>
      </div>
    )
  }

  // Agrupa as entradas por mês para exibição
  const groups = groupByMonth(entries)

  return (
    <div>
      {groups.map(group => (
        <div key={group.month} className="ak-diary-month">
          {/* Rótulo do mês */}
          <p className="ak-diary-month-label">{group.month}</p>

          {/* Entradas do mês */}
          {group.entries.map(entry => (
            <DiaryRow
              key={entry.id}
              entry={entry}
              onClick={() => onSelectMovie(entry.movie_id)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Linha do diário ──────────────────────────────────────────────────────────

interface DiaryRowProps {
  entry: DiaryEntry
  onClick: () => void
}

/**
 * Uma linha do diário: data | miniaturapôster | título/meta | nota.
 */
function DiaryRow({ entry, onClick }: DiaryRowProps) {
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <div
      className="ak-diary-row"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onClick() }}
      aria-label={`${entry.movie_title}, assistido em ${entry.watched_date}`}
    >
      {/* Data formatada (dia e mês curto) */}
      <div className="ak-diary-date">
        <span style={{ fontFamily: 'var(--mono)', fontSize: 14, display: 'block', color: 'var(--ink-3)' }}>
          {formatDay(entry.watched_date)}
        </span>
      </div>

      {/* Miniatura do pôster (36×54px) */}
      <div className="ak-diary-poster">
        {entry.poster_url && !imgFailed ? (
          <img
            src={entry.poster_url}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          // Pôster tipográfico miniatura
          <div
            className="ak-typo-poster"
            data-palette={entry.poster_palette}
            style={{ fontSize: 8, padding: '4px 3px' }}
          >
            <p className="ak-typo-title" style={{ fontSize: 8 }}>
              {entry.movie_title}
            </p>
          </div>
        )}
      </div>

      {/* Informações da sessão */}
      <div className="ak-diary-info">
        <p className="ak-diary-title">
          {entry.movie_title}
        </p>
        <div className="ak-diary-meta">
          {/* Badge de rewatch */}
          {entry.rewatch && (
            <span className="ak-rewatch-badge">Revisão</span>
          )}
          {/* Etiquetas da sessão */}
          {entry.tags?.slice(0, 2).map(tag => (
            <span
              key={tag}
              style={{
                fontFamily: 'var(--mono)', fontSize: 9,
                color: 'var(--ink-4)', background: 'var(--line-2)',
                padding: '1px 5px', borderRadius: 99,
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>

      {/* Nota da sessão */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Stars rating={entry.rating} size={11} />
      </div>
    </div>
  )
}
