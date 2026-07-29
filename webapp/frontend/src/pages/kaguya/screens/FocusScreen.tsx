// FocusScreen — overview de foco gameficado (spec 062): a Floresta do período, o
// heatmap anual, "quando eu foco × quando eu largo", rankings de onde o tempo foi,
// o padrão de falha (taxa de conclusão, motivos recentes) e as conquistas. Payload
// único via GET /focus/stats — nenhuma agregação acontece no componente, só
// renderização do que o backend já calculou (motores puros em focus_stats.py).

import { useCallback, useEffect, useState } from 'react'
import type { FocusStats, FocusAchievement, FocusHeatDay } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'
import { FocusForest } from '../ui/FocusForest'
import { FocusHeatmap } from '../ui/FocusHeatmap'
import { HourBars } from '../ui/HourBars'
import { FocusAchievements } from '../components/FocusAchievements'
import { toISO, addDays, fmtDateLabel } from '../lib/dateUtils'

interface FocusScreenProps {
  reloadKey: number
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

type Period = 'week' | 'month' | 'year' | 'all'

// Início do período a partir de "hoje" — sempre em partes locais (regra global do fuso).
function periodStart(period: Period, today: Date): string {
  if (period === 'week') return toISO(addDays(today, -6))
  if (period === 'month') return toISO(addDays(today, -29))
  if (period === 'year') return `${today.getFullYear()}-01-01`
  return '2000-01-01' // 'all' — bem antes de qualquer sessão real existir
}

function fmtMin(min: number): string {
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

export function FocusScreen({ reloadKey, toast }: FocusScreenProps) {
  const [period, setPeriod] = useState<Period>('month')
  const [stats, setStats] = useState<FocusStats | null>(null)
  const [heatmap, setHeatmap] = useState<FocusHeatDay[] | null>(null)
  const [achievements, setAchievements] = useState<FocusAchievement[] | null>(null)

  const today = new Date()
  const year = today.getFullYear()

  const load = useCallback(async () => {
    const start = periodStart(period, today)
    const end = toISO(today)
    try {
      const [s, h, a] = await Promise.all([
        kaguyaApi.focus.stats(start, end),
        kaguyaApi.focus.heatmap(year),
        kaguyaApi.focus.achievements(),
      ])
      setStats(s)
      setHeatmap(h)
      setAchievements(a)
    } catch {
      toast('Falha ao carregar o overview de foco.', 'err')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, toast])

  useEffect(() => { load() }, [load, reloadKey])

  if (!stats || !heatmap || !achievements) {
    return <div className="kg-page"><div className="kg-page-sub">Carregando…</div></div>
  }

  const { outcome } = stats

  return (
    <div className="kg-page">
      <div className="kg-focus-top">
        <div>
          <h1 className="kg-page-title"><Icon name="timer" size={22} /> Foco</h1>
          <div className="kg-page-sub">Cada sessão vira uma árvore. Uma desistência não apaga a floresta.</div>
        </div>
        <div className="kg-segment" style={{ width: 260 }}>
          {(['week', 'month', 'year', 'all'] as Period[]).map((p) => (
            <button
              key={p}
              className={`kg-seg-opt${period === p ? ' active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p === 'week' ? '7 dias' : p === 'month' ? '30 dias' : p === 'year' ? 'Este ano' : 'Tudo'}
            </button>
          ))}
        </div>
      </div>

      {/* Hero — os 4 números que resumem o período */}
      <div className="kg-focus-hero">
        <div className="kg-focus-hero-stat">
          <span className="kg-focus-hero-value">🔥 {stats.streak}</span>
          <span className="kg-focus-hero-label">dias seguidos</span>
        </div>
        <div className="kg-focus-hero-stat">
          <span className="kg-focus-hero-value">{fmtMin(stats.totals.total_min)}</span>
          <span className="kg-focus-hero-label">focados no período</span>
        </div>
        <div className="kg-focus-hero-stat">
          <span className="kg-focus-hero-value">{stats.totals.sessoes}</span>
          <span className="kg-focus-hero-label">sessões concluídas</span>
        </div>
        <div className="kg-focus-hero-stat">
          <span className="kg-focus-hero-value">{outcome.completion_pct}%</span>
          <span className="kg-focus-hero-label">taxa de conclusão</span>
        </div>
      </div>

      {/* Floresta do período */}
      <section className="kg-focus-section">
        <h2 className="kg-focus-section-title">Floresta</h2>
        <FocusForest sessions={stats.sessions} />
      </section>

      {/* Heatmap anual */}
      <section className="kg-focus-section">
        <h2 className="kg-focus-section-title">O ano em minutos — {year}</h2>
        <FocusHeatmap data={heatmap} year={year} />
      </section>

      {/* Quando eu foco × quando eu largo */}
      <section className="kg-focus-section">
        <h2 className="kg-focus-section-title">Quando eu foco</h2>
        <HourBars data={stats.by_hour} />
      </section>

      {/* Onde eu foco — rankings */}
      <section className="kg-focus-section">
        <h2 className="kg-focus-section-title">Onde eu foco</h2>
        <div className="kg-focus-rankings">
          {[
            { title: 'Tarefas', items: stats.top_tasks },
            { title: 'Listas', items: stats.top_projects },
            { title: 'Hábitos', items: stats.top_habits },
          ].map(({ title, items }) => (
            <div key={title} className="kg-focus-ranking">
              <div className="kg-focus-ranking-title">{title}</div>
              {items.length === 0 ? (
                <div className="kg-page-sub">Nada ainda</div>
              ) : (
                items.slice(0, 6).map((it) => {
                  const max = items[0].total_min || 1
                  return (
                    <div key={it.label} className="kg-focus-ranking-row">
                      <span className="kg-focus-ranking-label">{it.label}</span>
                      <div className="kg-focus-ranking-track">
                        <div className="kg-focus-ranking-fill" style={{ width: `${(it.total_min / max) * 100}%` }} />
                      </div>
                      <span className="kg-focus-ranking-min">{fmtMin(it.total_min)}</span>
                    </div>
                  )
                })
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Padrão de falha — "onde eu falhei" (o dado que a spec 037 não tinha) */}
      <section className="kg-focus-section">
        <h2 className="kg-focus-section-title">Padrão de falha</h2>
        <div className="kg-focus-fail-stats">
          <div className="kg-focus-fail-stat">
            <span className="kg-focus-fail-value">{outcome.cancelled}</span>
            <span className="kg-focus-fail-label">canceladas</span>
          </div>
          <div className="kg-focus-fail-stat">
            <span className="kg-focus-fail-value">{outcome.abandoned}</span>
            <span className="kg-focus-fail-label">abandonadas</span>
          </div>
          <div className="kg-focus-fail-stat">
            <span className="kg-focus-fail-value">
              {outcome.avg_min_before_quit != null ? `${outcome.avg_min_before_quit}min` : '—'}
            </span>
            <span className="kg-focus-fail-label">tempo médio antes de largar</span>
          </div>
        </div>
        {stats.recent_reasons.length > 0 && (
          <ul className="kg-focus-reasons">
            {stats.recent_reasons.map((r, i) => (
              <li key={i} className="kg-focus-reason">
                <span className="kg-focus-reason-date">{fmtDateLabel(r.date)}</span>
                <span className="kg-focus-reason-text">"{r.reason}"</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Conquistas */}
      <section className="kg-focus-section">
        <h2 className="kg-focus-section-title">Conquistas</h2>
        <FocusAchievements achievements={achievements} />
      </section>
    </div>
  )
}
