// FocusForest — a floresta do período: uma linha por dia, uma árvore por sessão
// (spec 062). É a visualização central do overview — "quanto foquei" vira algo que
// dá pra OLHAR, não só um número. Dias sem sessão nenhuma somem da lista (não faz
// sentido desenhar uma linha vazia); use FocusHeatmap para a visão "todo o ano".

import { useMemo } from 'react'
import type { FocusStatSession } from '../types'
import { FocusTree } from './FocusTree'

interface FocusForestProps {
  sessions: FocusStatSession[]
  onDayClick?: (dateLocal: string) => void
}

// pt-BR "27 jul" a partir de "AAAA-MM-DD" — parsing local (T00:00:00), nunca
// toISOString (regra global do fuso, UTC-3).
function fmtDayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', weekday: 'short' })
}

export function FocusForest({ sessions, onDayClick }: FocusForestProps) {
  const byDay = useMemo(() => {
    const map = new Map<string, FocusStatSession[]>()
    for (const s of sessions) {
      const list = map.get(s.date_local) ?? []
      list.push(s)
      map.set(s.date_local, list)
    }
    // Mais recente primeiro — é o que se quer ver ao abrir a tela.
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [sessions])

  if (byDay.length === 0) {
    return <div className="kg-empty">Nenhuma sessão de foco neste período ainda.</div>
  }

  return (
    <div className="kg-forest">
      {byDay.map(([day, daySessions]) => {
        // Dentro do dia, ordem cronológica (a sessão da manhã antes da da noite).
        const ordered = [...daySessions].sort((a, b) => a.started_at.localeCompare(b.started_at))
        const totalMin = daySessions.reduce(
          (sum, s) => sum + (s.outcome === 'completed' || s.outcome == null ? s.duration_focused_min : 0),
          0,
        )
        return (
          <button
            key={day}
            type="button"
            className="kg-forest-row"
            onClick={() => onDayClick?.(day)}
          >
            <div className="kg-forest-day">
              <span className="kg-forest-date">{fmtDayLabel(day)}</span>
              <span className="kg-forest-min">{totalMin}min</span>
            </div>
            <div className="kg-forest-trees">
              {ordered.map((s) => (
                <FocusTree
                  key={s.id}
                  minutes={s.duration_focused_min}
                  outcome={s.outcome}
                  color={s.project_color ?? undefined}
                  size={32}
                  title={`${s.duration_focused_min}min · ${s.task_title ?? s.habit_name ?? 'Foco avulso'}${
                    s.outcome && s.outcome !== 'completed' ? ` · ${s.outcome === 'cancelled' ? 'cancelada' : 'abandonada'}` : ''
                  }`}
                />
              ))}
            </div>
          </button>
        )
      })}
    </div>
  )
}
