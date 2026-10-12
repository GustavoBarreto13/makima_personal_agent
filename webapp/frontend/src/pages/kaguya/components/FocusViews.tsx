// Visualizações do overview de Foco: a floresta do período (uma linha por dia, uma árvore por sessão), as horas
// (acima concluído, abaixo falhado), os rankings de onde o tempo foi e as conquistas. Só desenham o que o backend
// já calculou (`GET /focus/stats`, motores puros em focus_stats.py).

import { useMemo } from 'react'
import { Icon, type IconName } from '../../../design'
import { fmtDate, WEEKDAYS_SHORT, parseISODate } from '../../../design/core/format'
import { fmtMinutes } from '../lib/taskView'
import type { FocusAchievement, FocusHourStats, FocusStatSession, FocusTopEntry } from '../types'
import { FocusTree } from './FocusTree'

const dayLabel = (iso: string) => `${WEEKDAYS_SHORT[parseISODate(iso).getDay()]}, ${fmtDate(iso)}`

export function FocusForest({ sessions, onDay }: { sessions: FocusStatSession[]; onDay?: (day: string) => void }) {
  const byDay = useMemo(() => {
    const map = new Map<string, FocusStatSession[]>()
    for (const s of sessions) map.set(s.date_local, [...(map.get(s.date_local) ?? []), s])
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)) // o mais recente primeiro
  }, [sessions])

  if (byDay.length === 0) return <p className="ds-hint">Nenhuma sessão de foco neste período ainda.</p>
  return (
    <ul className="kn-forest" aria-label="Floresta do período">
      {byDay.map(([day, list]) => {
        const ordered = [...list].sort((a, b) => a.started_at.localeCompare(b.started_at))
        const total = list.reduce((sum, s) => sum + (s.outcome === 'completed' || s.outcome == null ? s.duration_focused_min : 0), 0)
        return (
          <li key={day}>
            <button type="button" className="kn-forest-row" onClick={() => onDay?.(day)}>
              <span className="kn-forest-day"><b>{dayLabel(day)}</b><span className="ds-mono">{total}min</span></span>
              <span className="kn-forest-trees">
                {ordered.map((s) => (
                  <FocusTree
                    key={s.id}
                    minutes={s.duration_focused_min}
                    outcome={s.outcome}
                    color={s.project_color ?? undefined}
                    size={32}
                    title={`${s.duration_focused_min}min · ${s.task_title ?? s.habit_name ?? 'Foco avulso'}${s.outcome && s.outcome !== 'completed' ? ` · ${s.outcome === 'cancelled' ? 'cancelada' : 'abandonada'}` : ''}`}
                  />
                ))}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** 24 colunas (hora local de início): barra para cima = minutos concluídos; para baixo = sessões que falharam. */
export function HourBars({ data }: { data: FocusHourStats[] }) {
  const maxUp = Math.max(1, ...data.map((h) => h.completed_min))
  const maxDown = Math.max(1, ...data.map((h) => h.failed_n))
  return (
    <div className="kn-hours">
      <div className="kn-hours-grid" role="img" aria-label="Minutos concluídos (acima) e sessões que falharam (abaixo) por hora do dia">
        {data.map((h) => (
          <div
            key={h.hour}
            className="kn-hours-col"
            title={`${String(h.hour).padStart(2, '0')}h — ${h.completed_min}min concluídos (${h.completed_n} sessões)${h.failed_n ? ` · ${h.failed_n} falha${h.failed_n === 1 ? '' : 's'}` : ''}`}
          >
            <div className="kn-hours-up"><i style={{ height: `${(h.completed_min / maxUp) * 100}%` }} /></div>
            <div className="kn-hours-down"><i style={{ height: `${(h.failed_n / maxDown) * 100}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="kn-hours-labels" aria-hidden="true">{data.map((h) => <span key={h.hour}>{h.hour % 3 === 0 ? String(h.hour).padStart(2, '0') : ''}</span>)}</div>
      <p className="ds-hint kn-hours-leg"><i className="kn-sw kn-sw-up" /> concluído <i className="kn-sw kn-sw-down" /> falhado</p>
    </div>
  )
}

export function Rankings({ blocks }: { blocks: { title: string; items: FocusTopEntry[] }[] }) {
  return (
    <div className="kn-ranks">
      {blocks.map(({ title, items }) => {
        const max = items[0]?.total_min || 1
        return (
          <section key={title} className="kn-rank" aria-label={title}>
            <h3 className="kn-h3">{title}</h3>
            {items.length === 0 ? <p className="ds-hint">Nada ainda</p> : items.slice(0, 6).map((it) => (
              <div key={it.label} className="kn-rank-row">
                <span className="kn-rank-l">{it.label}</span>
                <span className="ds-bar" role="img" aria-label={`${it.label}: ${fmtMinutes(it.total_min)}`}><i style={{ width: `${(it.total_min / max) * 100}%` }} /></span>
                <span className="ds-mono">{fmtMinutes(it.total_min)}</span>
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}

/** O backend manda um emoji por conquista; a interface usa o ícone do conceito (um por eixo). */
function achievementIcon(a: FocusAchievement): IconName {
  if (a.id.startsWith('sessions_')) return 'timer'
  if (a.id.startsWith('hours_')) return 'clock'
  if (a.id.startsWith('streak_')) return 'activity'
  if (a.id.startsWith('long_session_')) return 'medal'
  return a.unlocked ? 'trophy' : 'award'
}

export function Achievements({ items }: { items: FocusAchievement[] }) {
  const got = items.filter((a) => a.unlocked).length
  return (
    <div>
      <p className="ds-hint">{got}/{items.length} conquistadas</p>
      <ul className="kn-ach" aria-label="Conquistas">
        {items.map((a) => (
          <li
            key={a.id}
            className={`kn-ach-i${a.unlocked ? ' kn-ach-on' : ''}`}
            title={a.unlocked && a.unlocked_at ? `Desbloqueada em ${fmtDate(a.unlocked_at.slice(0, 10))}` : a.description}
          >
            <Icon name={achievementIcon(a)} size={22} />
            <b>{a.name}</b>
            <span className="ds-hint">{a.description}</span>
            {!a.unlocked && (
              <span className="kn-ach-p">
                <span className="ds-bar" role="img" aria-label={`${a.progress} de ${a.target}`}><i style={{ width: `${Math.min(100, (a.progress / a.target) * 100)}%` }} /></span>
                <span className="ds-mono">{a.progress}/{a.target}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
