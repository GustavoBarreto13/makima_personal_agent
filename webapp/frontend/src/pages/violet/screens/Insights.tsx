// Tela Insights — painel analítico com heatmap, gráfico de área, big numbers e 7 abas.

import { useEffect, useState } from 'react'
import { violetApi } from '../../../lib/api'
import type { Stats, HeatmapData } from '../types'
import { HeatmapRow } from '../ui/HeatmapRow'
import { AreaChart } from '../ui/AreaChart'

// Abas de navegação dos Insights
const TABS = ['Diário', 'Palavras', 'Coleções', 'Horários', 'Pessoas', 'Tags', 'Sequências'] as const
type InsightTab = typeof TABS[number]

// Cria um array de semanas para o heatmap, preenchendo com 0 os dias sem dados
function buildHeatmapWeeks(
  heatmap: HeatmapData,
  year: number,
): Array<Array<{ date: string; words: number }>> {
  const weeks: Array<Array<{ date: string; words: number }>> = []
  // Primeiro dia do ano
  const start = new Date(year, 0, 1)
  // Ajusta para a domingo anterior ao dia 1 (para que o heatmap comece num domingo)
  const startSunday = new Date(start)
  startSunday.setDate(start.getDate() - start.getDay())

  const end = new Date(year, 11, 31)
  let cur = new Date(startSunday)
  let week: Array<{ date: string; words: number }> = []

  while (cur <= end || week.length > 0) {
    const dateStr = cur.toISOString().slice(0, 10)
    week.push({ date: dateStr, words: heatmap[dateStr] ?? 0 })
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
    cur = new Date(cur.getTime() + 86400000)
    if (cur > end && week.length > 0) {
      // Preenche a última semana incompleta com células vazias
      while (week.length < 7) week.push({ date: '', words: 0 })
      weeks.push(week)
      break
    }
  }
  return weeks
}

// Calcula a sequência atual e a maior sequência de dias consecutivos escritos
function calcStreaks(heatmap: HeatmapData): { current: number; longest: number } {
  const dates = Object.keys(heatmap).filter(d => (heatmap[d] ?? 0) > 0).sort()
  if (!dates.length) return { current: 0, longest: 0 }

  let longest = 1
  let cur = 1
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1])
    const next = new Date(dates[i])
    const diff = Math.round((next.getTime() - prev.getTime()) / 86400000)
    if (diff === 1) {
      cur++
      longest = Math.max(longest, cur)
    } else {
      cur = 1
    }
  }

  // Sequência atual: conta para trás a partir de hoje
  const today = new Date().toISOString().slice(0, 10)
  let currentStreak = 0
  let d = new Date(today)
  while (true) {
    const ds = d.toISOString().slice(0, 10)
    if ((heatmap[ds] ?? 0) > 0) {
      currentStreak++
      d = new Date(d.getTime() - 86400000)
    } else break
  }

  return { current: currentStreak, longest }
}

export function Insights() {
  const year = new Date().getFullYear()
  const [stats, setStats] = useState<Stats | null>(null)
  const [heatmap, setHeatmap] = useState<HeatmapData>({})
  const [tab, setTab] = useState<InsightTab>('Diário')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      violetApi.stats(year),
      violetApi.heatmap(year),
    ]).then(([s, h]) => {
      const heatData = h as HeatmapData
      const statsData = s as unknown as Stats
      const streaks = calcStreaks(heatData)
      statsData.longestStreak = streaks.longest
      statsData.currentStreak = streaks.current
      setStats(statsData)
      setHeatmap(heatData)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [year])

  if (loading) {
    return (
      <div className="page" style={{ paddingTop: 40 }}>
        <div style={{ color: 'var(--ink-4)', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'center', paddingTop: 60 }}>
          carregando...
        </div>
      </div>
    )
  }

  const weeks = buildHeatmapWeeks(heatmap, year)

  return (
    <div className="page" style={{ paddingTop: 32 }}>
      {/* ── Hero ── */}
      <div className="ins-hero">
        <div className="ins-hero-text">
          <div className="ins-eyebrow">Análise {year}</div>
          <h1 className="ins-h1">
            {stats?.days_written ?? 0} dias<br />escritos
          </h1>
          <p className="ins-hero-para">
            {stats?.total_words?.toLocaleString('pt-BR') ?? 0} palavras,{' '}
            {stats?.entries ?? 0} entradas,{' '}
            sequência atual de {stats?.currentStreak ?? 0} {stats?.currentStreak === 1 ? 'dia' : 'dias'}.
          </p>
        </div>
        <div className="ins-hero-portrait">
          <div className="ins-halo" />
          <img src="/violet.png" alt="Violet" className="ins-portrait-img" />
        </div>
      </div>

      {/* ── Abas ── */}
      <div className="ins-tabs">
        {TABS.map(t => (
          <button
            key={t}
            className={`ins-tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Conteúdo da aba ── */}
      {tab === 'Diário' && (
        <div className="ins-section">
          {/* Big numbers — 3 métricas em destaque */}
          <div className="ins-bignums">
            <div className="ins-bignum">
              <div className="bn-value">{stats?.entries ?? 0}</div>
              <div className="bn-label">entradas</div>
            </div>
            <div className="ins-bignum">
              <div className="bn-value">{stats?.days_written ?? 0}</div>
              <div className="bn-label">dias escritos</div>
            </div>
            <div className="ins-bignum">
              <div className="bn-value">{Math.round(stats?.freq_per_week ?? 0)}</div>
              <div className="bn-label">dias/semana</div>
            </div>
          </div>

          {/* Heatmap de palavras — semanas em colunas */}
          <div className="ins-block">
            <div className="ins-block-title">Atividade — palavras por dia</div>
            <div className="ins-heatmap">
              {weeks.map((week, wi) => (
                <HeatmapRow key={wi} days={week} />
              ))}
            </div>
            {/* Legenda de intensidade */}
            <div className="ins-heat-legend">
              <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>menos</span>
              {[0, 1, 2, 3, 4].map(n => (
                <div key={n} style={{ width: 9, height: 9, borderRadius: 2, background: `var(--heat-${n})` }} />
              ))}
              <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>mais</span>
            </div>
          </div>

          {/* Sequências */}
          <div className="ins-stats-row">
            <div className="ins-stat-chip">
              <span className="isc-value">{stats?.currentStreak ?? 0}</span>
              <span className="isc-label">sequência atual</span>
            </div>
            <div className="ins-stat-chip">
              <span className="isc-value">{stats?.longestStreak ?? 0}</span>
              <span className="isc-label">maior sequência</span>
            </div>
            <div className="ins-stat-chip">
              <span className="isc-value">{stats?.highlights ?? 0}</span>
              <span className="isc-label">destaques</span>
            </div>
            <div className="ins-stat-chip">
              <span className="isc-value">{stats?.dreams ?? 0}</span>
              <span className="isc-label">sonhos</span>
            </div>
          </div>
        </div>
      )}

      {tab === 'Palavras' && (
        <div className="ins-section">
          <div className="ins-bignums">
            <div className="ins-bignum">
              <div className="bn-value">{stats?.total_words?.toLocaleString('pt-BR') ?? 0}</div>
              <div className="bn-label">palavras totais</div>
            </div>
            <div className="ins-bignum">
              <div className="bn-value">{Math.round(stats?.per_day ?? 0)}</div>
              <div className="bn-label">palavras/dia</div>
            </div>
            <div className="ins-bignum">
              <div className="bn-value">{stats?.bullets ?? 0}</div>
              <div className="bn-label">bullets</div>
            </div>
          </div>

          <div className="ins-block">
            <div className="ins-block-title">Palavras por mês</div>
            <AreaChart data={stats?.words_by_month ?? Array(12).fill(0)} />
          </div>
        </div>
      )}

      {tab === 'Coleções' && (
        <div className="ins-section">
          <div className="ins-bignums">
            <div className="ins-bignum">
              <div className="bn-value">{stats?.highlights ?? 0}</div>
              <div className="bn-label">destaques</div>
            </div>
            <div className="ins-bignum">
              <div className="bn-value">{stats?.dreams ?? 0}</div>
              <div className="bn-label">sonhos</div>
            </div>
            <div className="ins-bignum">
              <div className="bn-value">{Math.round((stats?.highlight_rate ?? 0) * 100)}%</div>
              <div className="bn-label">entradas com destaque</div>
            </div>
          </div>
        </div>
      )}

      {tab === 'Horários' && (
        <div className="ins-section">
          <div className="ins-block">
            <div className="ins-block-title">Bullets por horário (blocos de 2h)</div>
            <div className="ins-bars">
              {(stats?.daytime ?? Array(12).fill(0)).map((val, i) => {
                const maxBar = Math.max(...(stats?.daytime ?? [1]), 1)
                const pct = (val / maxBar) * 100
                const hour = i * 2
                return (
                  <div key={i} className="ins-bar-group">
                    {/* Barra de altura proporcional */}
                    <div
                      className="ins-bar"
                      style={{ height: Math.max(pct * 0.8, 2) }}
                    />
                    {/* Label do horário em Mono */}
                    <div className="ins-bar-label">{String(hour).padStart(2, '0')}h</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'Pessoas' && (
        <div className="ins-section">
          <div className="ins-bignums">
            <div className="ins-bignum">
              <div className="bn-value">{stats?.mentions ?? 0}</div>
              <div className="bn-label">pessoas distintas</div>
            </div>
          </div>
          <div style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 24 }}>
            Veja a tela <em>Pessoas</em> para detalhe completo.
          </div>
        </div>
      )}

      {tab === 'Tags' && (
        <div className="ins-section">
          <div className="ins-bignums">
            <div className="ins-bignum">
              <div className="bn-value">{stats?.tags ?? 0}</div>
              <div className="bn-label">tags distintas</div>
            </div>
          </div>
          <div style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 24 }}>
            Veja a tela <em>Tags</em> para a nuvem completa.
          </div>
        </div>
      )}

      {tab === 'Sequências' && (
        <div className="ins-section">
          <div className="ins-bignums">
            <div className="ins-bignum">
              <div className="bn-value">{stats?.currentStreak ?? 0}</div>
              <div className="bn-label">sequência atual</div>
            </div>
            <div className="ins-bignum">
              <div className="bn-value">{stats?.longestStreak ?? 0}</div>
              <div className="bn-label">maior sequência</div>
            </div>
            <div className="ins-bignum">
              <div className="bn-value">{Math.round(stats?.freq_per_week ?? 0)}</div>
              <div className="bn-label">dias/semana</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
